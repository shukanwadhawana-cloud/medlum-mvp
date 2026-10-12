# Local Orthanc (development only)

Set a JSON user map with a non-default, strong password before starting:

```bash
export ORTHANC_REGISTERED_USERS='{"local-pacs-user":"replace-with-a-long-random-password"}'
cd services/pacs && docker compose up -d
```

The web UI is available at http://127.0.0.1:8042. DICOM and HTTP ports are bound to loopback only. Do not expose this development stack to a LAN or the public internet, and never use real patient DICOM for automated tests.

See [PACS integration documentation](../../docs/PACS_INTEGRATION.md).
