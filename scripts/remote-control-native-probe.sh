#!/usr/bin/env bash
set -euo pipefail

TASK_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROBE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/todesk-native-probe.XXXXXX")"
trap 'rm -rf "$PROBE_DIR"' EXIT

rustc --edition 2021 "$TASK_ROOT/scripts/remote-control-native-probe.rs" -o "$PROBE_DIR/native-probe"
"$PROBE_DIR/native-probe"
rustc --edition 2021 --test "$TASK_ROOT/client-vue/src-tauri/src/remote_control/guard.rs" -o "$PROBE_DIR/guard-tests"
"$PROBE_DIR/guard-tests"

if [[ "$(uname -s)" == "Darwin" ]]; then
  xcrun swiftc -parse-as-library "$TASK_ROOT/scripts/remote-control-macos-probe.swift" -o "$PROBE_DIR/macos-probe"
  "$PROBE_DIR/macos-probe" "$@"
fi
