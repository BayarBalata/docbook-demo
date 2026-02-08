# QA Report & Bug Fixes

## Overview
I have performed a comprehensive QA pass on the DocBook application, focusing on the core user flows:
1.  **Customer**: Login, Browse, Book.
2.  **Store Owner**: Login, Manage Bookings, View Financials.
3.  **Admin**: Overall Management.

## Issues Identified & Fixed

### 1. 🐛 Bug: Phone Number Formatting
-   **Issue**: The application required users to enter their phone number in E.164 format (e.g., `+964...`) but the input field accepted raw numbers (e.g., `0750...` or `750...`). This caused login failures.
-   **Fix**: Added intelligent phone number sanitization to the Login and Register forms. It now automatically handles:
    -   Leading zeros (`0750...` -> `750...`)
    -   Existing prefixes (`+964...` -> `750...`)
    -   Ensures `+964` is correctly prepended for Firebase Authentication.

### 2. 🐛 Bug: Owner Dashboard Empty (Wrong Query Field)
-   **Issue**: The Owner Dashboard was querying bookings using `merchantId`, but the booking system saves `storeId`. This resulted in an empty dashboard for store owners.
-   **Fix**: Updated all owner-facing queries (`Overview`, `Bookings`, `Financials`) to use `storeId` instead of `merchantId`.

### 3. 🐛 Bug: Application Crash on Date Display (`createdAt`)
-   **Issue**: The booking creation timestamp was saved as an ISO string, but the display logic tried to call `.toDate()` (a Firestore Timestamp method). This would cause the Owner Bookings page to crash.
-   **Fix**: Updated the date rendering logic to safely handle both Firestore Timestamps and ISO strings.

### 4. 🐛 Bug: Missing Revenue Data (Price Mismatch)
-   **Issue**: Revenue calculations relied on a `price` field, which was sometimes undefined if only `servicePrice` was present.
-   **Fix**: Implemented a fallback mechanism: `b.price || b.servicePrice || 0`. This ensures revenue is always calculated correctly.

### 5. 🐛 Bug: Store Photo Not Loading in Edit Mode
-   **Issue**: When a Store Owner edited their store, the existing photo was not pre-loaded into the preview. Additionally, saving changes updated the wrong field (`photo` vs `photoUrl`).
-   **Fix**: Corrected the save logic to use `photoUrl` and added logic to display the current photo when the form loads.

## Verification
-   **Customer (7804888220)**: Verified login with `07804888220` (leading zero stripped correctly). Confirmed access to dashboard.
-   **Store Owner (7734888220)**: Verified login. Confirmed **Owner Dashboard** loads data (no longer empty). Verified **Bookings Tab** loads without crashing (fixed index error). Verified **Financials Tab** loads without error.
-   **Admin (7504888220)**: Retains full oversight with correct data integrity.

## Recommendations
-   Consider migrating all date fields to Firestore Timestamps for consistency.
-   Add server-side validation for booking prices to prevent manipulation.
-   **Long-term**: Create the composite indexes in Firebase Console to allow server-side sorting for better performance as data grows.

Everything is now working as expected on the `Bug-fixes` branch. Verified with live browser testing.
