# MedLum MVP

Multi-doctor clinical operations platform - Phase 1 (Login + Data Isolation)

## Features
- Doctor Signup & Login
- Complete data isolation (each doctor only sees their own patients)
- Premium medical design
- Dashboard + Add Patient

## Run locally
```bash
npm install
npm run dev
```

## Test isolation
1. Create Doctor A → add a patient
2. Logout
3. Create Doctor B
4. Confirm Doctor B cannot see Doctor A patients
