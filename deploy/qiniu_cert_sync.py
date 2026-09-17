#!/usr/bin/env python3
"""Synchronize Caddy-managed certificates to Qiniu CDN domains."""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from qiniu import Auth, QiniuMacAuth


LOG = logging.getLogger("qiniu-cert-sync")
MIN_QINIU_VALIDITY_SECONDS = 30 * 24 * 60 * 60


class SyncError(RuntimeError):
    """Raised when certificate validation or Qiniu synchronization fails."""


@dataclass(frozen=True)
class Config:
    access_key: str
    secret_key: str
    domains: tuple[str, ...]
    cert_root: Path
    state_path: Path
    health_path: Path
    interval_seconds: int
    retry_seconds: int
    request_timeout_seconds: int

    @classmethod
    def from_env(cls, *, require_credentials: bool = True) -> "Config":
        domains = tuple(
            dict.fromkeys(
                value.strip().lower()
                for value in (
                    os.getenv("FILES_DOMAIN", ""),
                    os.getenv("PRIVATE_FILES_DOMAIN", ""),
                )
                if value.strip()
            )
        )
        if not domains:
            raise SyncError("FILES_DOMAIN and PRIVATE_FILES_DOMAIN are required")

        access_key = os.getenv("QINIU_ACCESS_KEY", "").strip()
        secret_key = os.getenv("QINIU_SECRET_KEY", "").strip()
        if require_credentials and (not access_key or not secret_key):
            raise SyncError("QINIU_ACCESS_KEY and QINIU_SECRET_KEY are required")

        state_path = Path(
            os.getenv("CERT_SYNC_STATE_PATH", "/state/qiniu-cert-sync.json")
        )
        return cls(
            access_key=access_key,
            secret_key=secret_key,
            domains=domains,
            cert_root=Path(
                os.getenv("CADDY_CERT_ROOT", "/data/caddy/certificates")
            ),
            state_path=state_path,
            health_path=Path(
                os.getenv("CERT_SYNC_HEALTH_PATH", str(state_path.with_name("health.json")))
            ),
            interval_seconds=positive_int_env("CERT_SYNC_INTERVAL_SECONDS", 21600),
            retry_seconds=positive_int_env("CERT_SYNC_RETRY_SECONDS", 300),
            request_timeout_seconds=positive_int_env(
                "CERT_SYNC_REQUEST_TIMEOUT_SECONDS", 30
            ),
        )


@dataclass(frozen=True)
class Certificate:
    domain: str
    cert_path: Path
    key_path: Path
    fingerprint: str
    not_after: datetime
    certificate_pem: str
    private_key_pem: str

    @property
    def upload_name(self) -> str:
        expires = self.not_after.astimezone(timezone.utc).strftime("%Y%m%d")
        return f"todesk-{self.domain}-{expires}-{self.fingerprint[:12]}"


def positive_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as error:
        raise SyncError(f"{name} must be an integer") from error
    if value <= 0:
        raise SyncError(f"{name} must be greater than zero")
    return value


def run_openssl(*arguments: str, input_bytes: bytes | None = None) -> bytes:
    try:
        return subprocess.run(
            ["openssl", *arguments],
            input=input_bytes,
            capture_output=True,
            check=True,
        ).stdout
    except FileNotFoundError as error:
        raise SyncError("openssl is required") from error
    except subprocess.CalledProcessError as error:
        message = error.stderr.decode("utf-8", errors="replace").strip()
        raise SyncError(f"openssl command failed: {message}") from error


def certificate_not_after(cert_path: Path) -> datetime:
    output = run_openssl("x509", "-in", str(cert_path), "-noout", "-enddate")
    value = output.decode("ascii").strip().removeprefix("notAfter=")
    return datetime.strptime(value, "%b %d %H:%M:%S %Y %Z").replace(
        tzinfo=timezone.utc
    )


def public_key_fingerprint_from_certificate(cert_path: Path) -> str:
    public_key = run_openssl("x509", "-in", str(cert_path), "-pubkey", "-noout")
    der = run_openssl("pkey", "-pubin", "-outform", "DER", input_bytes=public_key)
    return hashlib.sha256(der).hexdigest()


def public_key_fingerprint_from_private_key(key_path: Path) -> str:
    der = run_openssl("pkey", "-in", str(key_path), "-pubout", "-outform", "DER")
    return hashlib.sha256(der).hexdigest()


def inspect_certificate(domain: str, cert_path: Path) -> Certificate:
    key_path = cert_path.with_suffix(".key")
    if not key_path.is_file():
        raise SyncError(f"private key is missing for {domain}: {key_path}")

    try:
        subprocess.run(
            ["openssl", "x509", "-in", str(cert_path), "-noout", "-checkhost", domain],
            capture_output=True,
            check=True,
        )
    except subprocess.CalledProcessError as error:
        raise SyncError(f"certificate does not cover {domain}: {cert_path}") from error

    if public_key_fingerprint_from_certificate(cert_path) != (
        public_key_fingerprint_from_private_key(key_path)
    ):
        raise SyncError(f"certificate and private key do not match for {domain}")

    not_after = certificate_not_after(cert_path)
    remaining = (not_after - datetime.now(timezone.utc)).total_seconds()
    if remaining < MIN_QINIU_VALIDITY_SECONDS:
        raise SyncError(
            f"certificate for {domain} has fewer than 30 days remaining; "
            "wait for or repair Caddy renewal"
        )

    certificate_pem = cert_path.read_text(encoding="utf-8")
    private_key_pem = key_path.read_text(encoding="utf-8")
    return Certificate(
        domain=domain,
        cert_path=cert_path,
        key_path=key_path,
        fingerprint=hashlib.sha256(certificate_pem.encode("utf-8")).hexdigest(),
        not_after=not_after,
        certificate_pem=certificate_pem,
        private_key_pem=private_key_pem,
    )


def find_certificate(cert_root: Path, domain: str) -> Certificate:
    candidates = list(cert_root.glob(f"*/{domain}/{domain}.crt"))
    if not candidates:
        raise SyncError(f"no Caddy certificate found for {domain} under {cert_root}")

    certificates: list[Certificate] = []
    errors: list[str] = []
    for cert_path in candidates:
        try:
            certificates.append(inspect_certificate(domain, cert_path))
        except SyncError as error:
            errors.append(str(error))

    if not certificates:
        raise SyncError("; ".join(errors))
    return max(certificates, key=lambda certificate: certificate.not_after)


class StateStore:
    def __init__(self, path: Path):
        self.path = path
        self.data = self._load()

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {"version": 1, "domains": {}}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as error:
            raise SyncError(f"cannot read state file {self.path}: {error}") from error
        if data.get("version") != 1 or not isinstance(data.get("domains"), dict):
            raise SyncError(f"unsupported state file format: {self.path}")
        return data

    def entry(self, domain: str) -> dict[str, Any]:
        value = self.data["domains"].get(domain, {})
        return value if isinstance(value, dict) else {}

    def update(self, domain: str, entry: dict[str, Any]) -> None:
        self.data["domains"][domain] = entry
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(self.data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        temporary.chmod(0o600)
        temporary.replace(self.path)


class QiniuClient:
    def __init__(self, config: Config):
        self.access_key = config.access_key
        self.secret_key = config.secret_key
        self.timeout = config.request_timeout_seconds
        self.session = requests.Session()

    def _request_api(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        host = "api.qiniu.com"
        url = f"https://{host}{path}"
        raw = json.dumps(body, separators=(",", ":")) if body is not None else None
        content_type = "application/json"
        token = QiniuMacAuth(self.access_key, self.secret_key).token_of_request(
            method,
            host,
            url,
            qheaders=None,
            content_type=content_type,
            body=raw,
        )
        response = self.session.request(
            method,
            url,
            headers={
                "Authorization": f"Qiniu {token}",
                "Content-Type": content_type,
            },
            data=raw,
            timeout=self.timeout,
        )
        return checked_json(response, f"{method} {path}")

    def _request_fusion(
        self, method: str, path: str, body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        url = f"https://fusion.qiniuapi.com{path}"
        token = Auth(self.access_key, self.secret_key).token_of_request(url)
        response = self.session.request(
            method,
            url,
            headers={
                "Authorization": f"QBox {token}",
                "Content-Type": "application/json",
            },
            json=body,
            timeout=self.timeout,
        )
        return checked_json(response, f"{method} {path}")

    def domain(self, domain: str) -> dict[str, Any]:
        return self._request_api("GET", f"/domain/{domain}")

    def upload_certificate(self, certificate: Certificate) -> str:
        result = self._request_fusion(
            "POST",
            "/sslcert",
            {
                "name": certificate.upload_name,
                "pri": certificate.private_key_pem,
                "ca": certificate.certificate_pem,
            },
        )
        cert_id = result.get("certID")
        if not isinstance(cert_id, str) or not cert_id:
            raise SyncError("Qiniu certificate upload response does not contain certID")
        return cert_id

    def update_https(
        self, domain: str, cert_id: str, domain_config: dict[str, Any]
    ) -> None:
        self._request_api(
            "PUT",
            f"/domain/{domain}/httpsconf",
            https_update_payload(domain_config, cert_id),
        )


def checked_json(response: requests.Response, operation: str) -> dict[str, Any]:
    try:
        payload = response.json() if response.content else {}
    except requests.JSONDecodeError as error:
        raise SyncError(
            f"Qiniu {operation} returned HTTP {response.status_code} with invalid JSON"
        ) from error

    code = payload.get("code") if isinstance(payload, dict) else None
    if not response.ok or (code is not None and code != 200):
        message = payload.get("error") if isinstance(payload, dict) else None
        raise SyncError(
            f"Qiniu {operation} failed: HTTP {response.status_code}, "
            f"code={code}, error={message or response.text[:200]}"
        )
    if not isinstance(payload, dict):
        raise SyncError(f"Qiniu {operation} returned an unexpected response")
    return payload


def remote_cert_id(domain_config: dict[str, Any]) -> str | None:
    https_config = domain_config.get("https")
    if not isinstance(https_config, dict):
        return None
    for key in ("certId", "certID", "certid"):
        value = https_config.get(key)
        if isinstance(value, str) and value:
            return value
    return None


def https_update_payload(
    domain_config: dict[str, Any], cert_id: str
) -> dict[str, Any]:
    payload: dict[str, Any] = {"certId": cert_id}
    https_config = domain_config.get("https")
    if not isinstance(https_config, dict):
        return payload
    for key in ("forceHttps", "http2Enable", "tlsVersions"):
        if key in https_config:
            payload[key] = https_config[key]
    return payload


def synchronize_domain(
    config: Config,
    domain: str,
    client: QiniuClient,
    state: StateStore,
    *,
    dry_run: bool = False,
) -> None:
    certificate = find_certificate(config.cert_root, domain)
    LOG.info(
        "%s: selected certificate %s, expires %s",
        domain,
        certificate.fingerprint[:16],
        certificate.not_after.isoformat(),
    )
    if dry_run:
        return

    domain_config = client.domain(domain)
    entry = state.entry(domain)
    cert_id = entry.get("cert_id") if entry.get("fingerprint") == certificate.fingerprint else None

    if cert_id and remote_cert_id(domain_config) == cert_id:
        if entry.get("status") != "deployed":
            state.update(domain, {**entry, "status": "deployed"})
        LOG.info("%s: Qiniu CDN already uses certificate %s", domain, cert_id)
        return

    if not cert_id:
        cert_id = client.upload_certificate(certificate)
        entry = {
            "fingerprint": certificate.fingerprint,
            "cert_id": cert_id,
            "not_after": certificate.not_after.isoformat(),
            "status": "uploaded",
            "uploaded_at": datetime.now(timezone.utc).isoformat(),
        }
        state.update(domain, entry)
        LOG.info("%s: uploaded certificate %s to Qiniu", domain, cert_id)

    client.update_https(domain, cert_id, domain_config)
    state.update(
        domain,
        {
            **entry,
            "status": "pending",
            "requested_at": datetime.now(timezone.utc).isoformat(),
        },
    )
    LOG.info("%s: requested Qiniu CDN certificate update", domain)


def write_health(config: Config, errors: int) -> None:
    config.health_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "checked_at": int(time.time()),
        "errors": errors,
    }
    temporary = config.health_path.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload) + "\n", encoding="utf-8")
    temporary.chmod(0o600)
    temporary.replace(config.health_path)


def run_cycle(config: Config, *, dry_run: bool = False) -> int:
    client = QiniuClient(config) if not dry_run else None
    state = StateStore(config.state_path)
    errors = 0
    for domain in config.domains:
        try:
            synchronize_domain(
                config,
                domain,
                client,  # type: ignore[arg-type]
                state,
                dry_run=dry_run,
            )
        except Exception:
            errors += 1
            LOG.exception("%s: synchronization failed", domain)
    if not dry_run:
        write_health(config, errors)
    return errors


def healthcheck(config: Config) -> int:
    try:
        payload = json.loads(config.health_path.read_text(encoding="utf-8"))
        checked_at = int(payload["checked_at"])
        errors = int(payload["errors"])
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
        return 1
    maximum_age = max(config.interval_seconds * 2, config.retry_seconds * 3)
    return 0 if errors == 0 and time.time() - checked_at <= maximum_age else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true", help="run one cycle and exit")
    parser.add_argument(
        "--dry-run", action="store_true", help="validate local certificates only"
    )
    parser.add_argument("--healthcheck", action="store_true")
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(
        level=os.getenv("LOG_LEVEL", "INFO"),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    args = parse_args()
    try:
        config = Config.from_env(require_credentials=not (args.dry_run or args.healthcheck))
    except SyncError as error:
        LOG.error("configuration error: %s", error)
        return 2

    if args.healthcheck:
        return healthcheck(config)

    while True:
        errors = run_cycle(config, dry_run=args.dry_run)
        if args.once or args.dry_run:
            return 1 if errors else 0
        delay = config.retry_seconds if errors else config.interval_seconds
        LOG.info("next synchronization cycle in %s seconds", delay)
        time.sleep(delay)


if __name__ == "__main__":
    sys.exit(main())
