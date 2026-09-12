# Phase 12 — Desktop Packaging

MedLum now has a real cross-platform desktop packaging path in addition to the Android/iOS Capacitor path and the responsive PWA/web experience.

## Platforms

- Windows: NSIS installer and Windows bundle targets
- macOS: DMG/application bundle
- Linux: AppImage and Debian package

## Architecture

Tauri 2 is used as the native desktop shell. The desktop window loads the deployed MedLum HTTPS URL so the existing Next.js API routes, authentication cookies, Prisma-backed clinical data, and telemedicine flows remain server-backed rather than being incorrectly treated as a static-only application.

The repository keeps `../out` as the Tauri frontend distribution so the project remains buildable and verifiable, while the desktop packaging workflow injects the actual deployed MedLum URL into the window configuration at build time.

## GitHub Actions

`.github/workflows/desktop-packaging.yml` has two stages:

1. Verify the Windows/macOS/Linux packaging configuration.
2. Build native bundles on `windows-latest`, `macos-latest`, and `ubuntu-22.04`, then upload the installers as workflow artifacts.

The workflow requires the GitHub repository variable `MEDLUM_APP_URL` to contain the deployed MedLum HTTPS URL. No production URL is committed to source control.

## Main CI gate

`npm run test:desktop-packaging` runs in the main CI before the application build, so desktop packaging configuration cannot silently drift.

## Important distinction

The main CI green check proves the packaging configuration and source-level contract. The separate Desktop Packaging workflow is the native build that produces the actual Windows/macOS/Linux installer artifacts. macOS signing/notarization and Windows code signing require platform credentials and are intentionally not fabricated in this phase.

## Verification note

The documentation file is intentionally part of the desktop packaging verification contract. It must be present in the same commit as the verifier so a clean GitHub Actions checkout can validate the complete Phase 12 contract.
