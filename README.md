# PillCheck

PillCheck is a voice-guided medication verification prototype for people who
need extra confidence when taking multi-drug regimens. It combines a calm,
accessible dashboard with camera-assisted scanning, browser voice controls,
on-device OCR, fuzzy medicine-name matching, local adherence history, and an
optional Gemini-powered health-advisor endpoint.

> **Prototype / hackathon status:** this repository demonstrates the end-to-end
> interaction and local browser functionality. It is not a medical device and
> does not replace a pharmacist or clinician. OCR and medication matching must
> be reviewed by a qualified person before real-world use.

> **Demo access:** this prototype does not create real user accounts. On the
> sign-in screen, enter any email address (for example, `demo@example.com`) and
> any non-empty password (for example, `pillcheck`) to explore the dashboard.
> Demo credentials are not stored or checked against a user database.

## Features

## Complete project report

See [PillCheck-Complete-Report.pdf](./PillCheck-Complete-Report.pdf) for the
full feature, architecture, setup, collaboration, limitation, and responsible
use report.

### Responsive web experience

- Dashboard with next-dose hero card and progress ring
- Daily medication schedule
- Adherence history
- Read-only caregiver status view
- AI health advisor with offline fallback
- Prototype sign-in with clear demo access guidance
- Large-print accessibility mode
- Voice prompt and browser speech recognition controls
- Offline-ready local status and local adherence records

### Camera and scan flow

- Browser camera access with rear-camera preference
- Live camera preview and permission feedback
- Scan modes for:
  - Loose pill
  - Handwritten or printed prescription
  - Medicine strip or bottle
  - Pharmacy receipt
- Captures a camera frame and runs Tesseract.js OCR in the browser
- Local fuzzy matching against 30 seeded medicine names and aliases
- Explicit match, mismatch, and scan-again states
- Deliberate mismatch demo for presentations

### Voice accessibility

- Browser text-to-speech for prompts and advisor responses
- Browser speech recognition for:
  - `scan now`
  - `confirm`
  - `yes`
  - `repeat`
  - `remind me later`
  - `snooze`
- Clear fallback when the browser does not support speech recognition

### Persistence

Confirmed scans are stored in IndexedDB on the current device. Each record
contains the timestamp, expected medicine, OCR text, match score, result, and
scan mode. No adherence record is sent to a server by the web client.

## Project structure

```text
PillCheckRN/
├── App.tsx                  # React Native entry point
├── android/                 # Android native project
├── ios/                     # iOS native project
├── src/                     # React Native screens, services, and state
├── web/
│   ├── index.html           # Responsive web application
│   ├── styles.css           # Web visual system and responsive layout
│   ├── app.js               # Web interactions, camera, voice, OCR, IndexedDB
│   ├── server.js            # Static server and protected Gemini proxy
│   └── drug-database.json   # Demo medicine names and aliases
├── .env.example             # Environment variable template
└── package.json
```

## Requirements

- Node.js 18 or newer
- npm
- A modern browser for the web experience
- Camera and microphone permissions for scan and voice features

## Run the web app

From the project root:

```powershell
npm install
npm run web
```

Open <http://127.0.0.1:4173>.

Camera and microphone APIs generally require `localhost`, `127.0.0.1`, or
HTTPS. If access was blocked previously, use the browser address-bar
permission controls to allow the camera and microphone.

## Optional Gemini advisor

Gemini is called only by the local Node server. The API key is never placed in
`web/app.js`, `web/index.html`, or any browser bundle.

1. Create or rotate a Gemini API key in Google AI Studio.
2. Set it in the PowerShell process that starts the server:

```powershell
$env:GEMINI_API_KEY = "your-rotated-key"
npm run web
```

The advisor calls `POST /api/gemini`. If the key is missing or Gemini is
unavailable, the UI uses a small offline rule-based response instead.

**Never commit a real API key.** If a key has been pasted into chat, source
code, or a public repository, revoke it and create a replacement.

## Deploy to Vercel

The web app includes a Vercel configuration and a serverless Gemini function.
From the project root:

```powershell
npx vercel login
npx vercel --prod
```

In the Vercel project settings, add `GEMINI_API_KEY` as an Environment Variable
for Production. Do not add the key to `web/`, `.env.example`, or committed
source files.

## Password login

The prototype accepts any valid-looking email address and any non-empty password
to make demos and collaboration easy. This is not account authentication:
credentials are not stored or verified against a user database. Configure
`AUTH_SECRET` in Vercel if you want signed session cookies to use a deployment
specific secret.

## Run the React Native app

Start Metro:

```powershell
npm start
```

Android:

```powershell
npm run android
```

iOS (macOS required):

```powershell
npm run ios
```

Native camera, speech, haptics, notifications, SQLite, and shake detection
dependencies are included for the mobile implementation. Device-specific
permissions and native model integrations still require platform testing.

## Validation

Useful checks:

```powershell
node --check web\app.js
node --check web\server.js
npm test
npm run lint
```

The website was validated with:

- JavaScript syntax checks
- Local HTTP server response checks
- Browser dashboard navigation
- Live scan modal flow
- Deliberate mismatch verdict
- Local IndexedDB dose persistence
- Advisor fallback behavior when Gemini is not configured

## Roadmap

The following are intentionally outside the current prototype scope:

- Clinical-grade pill visual identification
- Production handwriting recognition and prescription extraction
- Individual account registration and account management
- Biometric unlock
- Encrypted cloud sync
- Remote caregiver accounts
- Barcode/QR, insurance-card, and receipt-specific extraction models
- Native push notifications and production haptic patterns
- Medical validation, regulatory review, and clinical safety testing

## License

This project is currently an internal prototype. Add a project license before
public distribution.
