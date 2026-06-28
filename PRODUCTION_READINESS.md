# SAWAARI - Production Readiness Integration Report

This document details the transition from mock/development operations to production-ready integrations implemented during Phase 1.

---

## 1. Firebase Phone Authentication Integration

### What was Mocked Before
* Frontend bypass sent dummy credentials using a string format (`mock-token-<role>-<phone>`).
* Backend skipped real verification checks, automatically accepted `mock-token-` headers, parsed roles directly, and returned database user profiles.
* Any 6-digit OTP code was accepted on the validation modal screen.

### What was Changed
* **Invisible reCAPTCHA Protection:** Integrated Google reCAPTCHA v3 verification during the phone number request screen to prevent SMS spam.
* **Real SMS OTP Delivery:** Wired up Firebase client SDK's `signInWithPhoneNumber` to deliver actual OTP verification codes via SMS.
* **Standard Verification:** Frontend exchanges the completed SMS OTP for a Firebase ID Token using `confirmationResult.confirm(code)`.
* **Production-grade Backend Validation:** The backend validates the resolved Firebase ID Token using `firebase-admin` SDK's `verifyIdToken`.
* **Development Bypass:** Maintained conditional developers' mock bypass controlled explicitly via environment variables (`NEXT_PUBLIC_DEV_BYPASS` on frontend and `DEV_BYPASS` on backend).

### Files Modified
* **[firebase.ts](file:///Users/japinderkaur/Desktop/final%20auto%20wala/sawaari-frontend/src/lib/firebase.ts)** (NEW)
* **[page.tsx](file:///Users/japinderkaur/Desktop/final%20auto%20wala/sawaari-frontend/src/app/page.tsx)** (MODIFY)
* **[auth.service.ts](file:///Users/japinderkaur/Desktop/final%20auto%20wala/sawaari-backend/src/auth/auth.service.ts)** (MODIFY)

### APIs Used
* Firebase Auth Web Client SDK (`signInWithPhoneNumber`, `RecaptchaVerifier`)
* Firebase Admin Node.js SDK (`verifyIdToken`)

### Environment Variables Required
```env
# Frontend (.env.local)
NEXT_PUBLIC_FIREBASE_API_KEY=your_firebase_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_firebase_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_firebase_project_id
NEXT_PUBLIC_DEV_BYPASS=false

# Backend (.env)
FIREBASE_PROJECT_ID=your_firebase_project_id
FIREBASE_CLIENT_EMAIL=your_firebase_client_email
FIREBASE_PRIVATE_KEY=your_firebase_private_key
DEV_BYPASS=false
```

### Manual Testing Instructions
1. Ensure both `.env.local` and `.env` have `NEXT_PUBLIC_DEV_BYPASS=false` and `DEV_BYPASS=false`.
2. Open the landing page at `http://localhost:3002/`.
3. Choose a role (Passenger or Driver).
4. Enter your real mobile number (including country code, e.g. `+91XXXXXXXXXX`).
5. Confirm the invisible reCAPTCHA completes.
6. Verify the SMS OTP code is received on your mobile device.
7. Enter the code on the validation screen. Verify that typing invalid codes displays an error.

---

## 2. Cloudinary Document Upload Flow

### What was Mocked Before
* Driver onboarding automatically attached a hardcoded sample image URL (`https://res.cloudinary.com/demo/...`) for all three documents (License, Permit, RC).
* No actual files were uploaded or validated.

### What was Changed
* **File Upload Selector Inputs:** Added three styled file fields (`license`, `permit`, `registration`) to the driver onboarding details form.
* **Upload Progress Tracker:** Frontend tracks chunk upload percentages in real-time using native `XMLHttpRequest.upload.onprogress` events.
* **Size & Type Validations:** Enforced frontend/backend restrictions: only image types allowed, file size capped at 5MB.
* **Cloudinary Stream uploads:** Integrated the Cloudinary SDK on the backend. Files are uploaded via stream buffers directly from NestJS Multer memory storage.
* **PostgreSQL mapping:** Returned secure Cloudinary CDN URLs are saved in the `driver_documents` table in PostgreSQL.

### Files Modified
* **[page.tsx](file:///Users/japinderkaur/Desktop/final%20auto%20wala/sawaari-frontend/src/app/page.tsx)** (MODIFY)
* **[drivers.service.ts](file:///Users/japinderkaur/Desktop/final%20auto%20wala/sawaari-backend/src/drivers/drivers.service.ts)** (MODIFY)
* **[drivers.controller.ts](file:///Users/japinderkaur/Desktop/final%20auto%20wala/sawaari-backend/src/drivers/drivers.controller.ts)** (MODIFY)

### APIs Used
* Cloudinary API (uploader stream API)
* NestJS Multer FileInterceptor middleware

### Environment Variables Required
```env
# Backend (.env)
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

### Manual Testing Instructions
1. Open the driver onboarding page.
2. Select files for Driving License, Vehicle Permit, and Registration Card.
3. Attempt to upload a file larger than 5MB; verify the file selector rejects it.
4. Verify the upload progress indicator updates sequentially during upload.
5. Complete onboarding. Query PostgreSQL `driver_documents` table to verify URLs point to Cloudinary.

---

## 3. Google Geocoding API Integration

### What was Mocked Before
* Onboarding details and profile page saved locations used the hardcoded city center of Bangalore (`12.9716`, `77.5946`) regardless of the address entered.

### What was Changed
* **Address Resolution:** If the frontend submits coordinates matching the default mock coordinates (`12.9716`, `77.5946`), the backend intercepts this and triggers a geocoding lookup.
* **Google Geocoding Client:** Backend calls the Google Geocoding REST API to transform typed addresses into geographical coordinates.
* **PostGIS Persistence:** Returned coordinate keys are formatted as PostGIS spatial geometry `Point(longitude, latitude)` and persisted in PostgreSQL.

### Files Modified
* **[users.service.ts](file:///Users/japinderkaur/Desktop/final%20auto%20wala/sawaari-backend/src/users/users.service.ts)** (MODIFY)

### APIs Used
* Google Maps Geocoding REST API (`/maps/api/geocode/json`)

### Environment Variables Required
```env
# Backend (.env)
GOOGLE_MAPS_API_KEY=your_google_maps_api_key
```

### Manual Testing Instructions
1. Add `GOOGLE_MAPS_API_KEY` to the backend `.env`.
2. Go to Passenger Profile (`/profile`).
3. Under "Saved Locations", type a specific label (e.g. "Whitefield Office") and a distinct address (e.g. "Phoenix Marketcity, Whitefield, Bengaluru").
4. Press "Add Location".
5. Run a DB query: `SELECT name, address, ST_AsText(location) FROM saved_locations WHERE address LIKE '%Phoenix%';`.
6. Verify that the coordinates returned correspond exactly to Phoenix Marketcity rather than Bangalore City Center (`12.9716`, `77.5946`).
