# Phase 12 — Android + iOS packaging

Phase 12 adds a Capacitor-based native packaging layer around MedLum so the same responsive application can be shipped as Android and iOS apps without creating a second clinical frontend.

## Architecture

- Capacitor app ID: `com.medlum.app`
- App name: `MedLum`
- Native shells: Android + iOS
- Production clinical APIs remain on the MedLum server.
- `CAPACITOR_SERVER_URL` can point the native shell at the deployed MedLum origin.
- `CAPACITOR_BUILD=true` enables Next static-export mode when a local web bundle is required.
- No clinical data, credentials, signing keys, or provider secrets are committed to the repository.

## CI packaging

`.github/workflows/mobile-packaging.yml` generates native projects and builds an unsigned Android debug APK. It also generates the iOS Xcode project as a downloadable artifact. iOS signing/App Store distribution requires Apple signing credentials and is intentionally not committed or automated in this phase.

## Important deployment boundary

The native shell must use the deployed MedLum origin for API-backed production workflows. Set the GitHub Actions variable/secret `CAPACITOR_SERVER_URL` to the production HTTPS origin before distributing the generated mobile packages.

Phase 12 does not change the existing Render deployment or production database architecture.
