import importlib.util
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "qiniu_cert_sync.py"
SPEC = importlib.util.spec_from_file_location("qiniu_cert_sync", MODULE_PATH)
sync = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
sys.modules[SPEC.name] = sync
SPEC.loader.exec_module(sync)


class FakeClient:
    def __init__(self, domain_config=None):
        self.domain_config = domain_config or {"https": {"forceHttps": True}}
        self.uploaded = []
        self.updated = []

    def domain(self, domain):
        return self.domain_config

    def upload_certificate(self, certificate):
        self.uploaded.append(certificate)
        return "new-cert-id"

    def update_https(self, domain, cert_id, domain_config):
        self.updated.append((domain, cert_id, domain_config))


def certificate(domain="files.sycsq.top", fingerprint="new-fingerprint"):
    return sync.Certificate(
        domain=domain,
        cert_path=Path("certificate.crt"),
        key_path=Path("certificate.key"),
        fingerprint=fingerprint,
        not_after=datetime.now(timezone.utc) + timedelta(days=80),
        certificate_pem="certificate",
        private_key_pem="private-key",
    )


class QiniuCertificateSyncTest(unittest.TestCase):
    def config(self, directory):
        return sync.Config(
            access_key="ak",
            secret_key="sk",
            domains=("files.sycsq.top",),
            cert_root=Path(directory) / "certificates",
            state_path=Path(directory) / "state.json",
            health_path=Path(directory) / "health.json",
            interval_seconds=21600,
            retry_seconds=300,
            request_timeout_seconds=30,
        )

    def test_https_update_preserves_existing_flags(self):
        payload = sync.https_update_payload(
            {
                "https": {
                    "forceHttps": True,
                    "http2Enable": False,
                    "tlsVersions": "TLSv1.2/TLSv1.3",
                    "certId": "old",
                }
            },
            "new",
        )
        self.assertEqual(
            payload,
            {
                "certId": "new",
                "forceHttps": True,
                "http2Enable": False,
                "tlsVersions": "TLSv1.2/TLSv1.3",
            },
        )

    def test_new_certificate_is_uploaded_before_domain_update(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(directory)
            store = sync.StateStore(config.state_path)
            client = FakeClient()
            with patch.object(sync, "find_certificate", return_value=certificate()):
                sync.synchronize_domain(config, "files.sycsq.top", client, store)

            self.assertEqual(len(client.uploaded), 1)
            self.assertEqual(client.updated[0][1], "new-cert-id")
            entry = json.loads(config.state_path.read_text())["domains"][
                "files.sycsq.top"
            ]
            self.assertEqual(entry["status"], "pending")

    def test_matching_remote_certificate_skips_upload_and_update(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(directory)
            store = sync.StateStore(config.state_path)
            store.update(
                "files.sycsq.top",
                {
                    "fingerprint": "same",
                    "cert_id": "existing-cert-id",
                    "status": "pending",
                },
            )
            client = FakeClient({"https": {"certId": "existing-cert-id"}})
            with patch.object(
                sync, "find_certificate", return_value=certificate(fingerprint="same")
            ):
                sync.synchronize_domain(config, "files.sycsq.top", client, store)

            self.assertEqual(client.uploaded, [])
            self.assertEqual(client.updated, [])
            self.assertEqual(store.entry("files.sycsq.top")["status"], "deployed")

    def test_pending_certificate_retries_binding_without_duplicate_upload(self):
        with tempfile.TemporaryDirectory() as directory:
            config = self.config(directory)
            store = sync.StateStore(config.state_path)
            store.update(
                "files.sycsq.top",
                {
                    "fingerprint": "same",
                    "cert_id": "pending-cert-id",
                    "status": "pending",
                },
            )
            client = FakeClient({"https": {"certId": "old-cert-id"}})
            with patch.object(
                sync, "find_certificate", return_value=certificate(fingerprint="same")
            ):
                sync.synchronize_domain(config, "files.sycsq.top", client, store)

            self.assertEqual(client.uploaded, [])
            self.assertEqual(client.updated[0][1], "pending-cert-id")


if __name__ == "__main__":
    unittest.main()
