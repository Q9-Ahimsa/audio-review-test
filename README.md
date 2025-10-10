# Project Vocal Review

Project Vocal Review is a minimal end-to-end prototype that demonstrates the monthly performance review workflow described in the MVP PRD. It combines a guided, speech-friendly web experience with a backend that transcribes audio feedback, archives original recordings, and writes structured data into Google Sheets.

## Features

- **Five-step guided flow** that mirrors the PRD: welcome, quantitative score, peer nominations, and two voice feedback screens.
- **MediaRecorder-based audio capture** with re-record and playback controls. Navigation is blocked until each step is complete.
- **Single submission payload** that bundles score, nominations, and audio blobs.
- **Backend intake API** that uploads raw audio to Google Cloud Storage, requests a Gemini 2.5 Pro transcription, and appends a fully structured row to Google Sheets.
- **Environment-driven integrations** so the prototype works locally without credentials and integrates with Google Cloud services once they are provided.

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env` file in the project root with the variables below. For local prototyping you can omit any integration you do not yet have credentials for—those features will be skipped gracefully and logged to the console.

```ini
PORT=3000
GEMINI_API_KEY=your_gemini_api_key
GCP_AUDIO_BUCKET=your_private_bucket
GOOGLE_SHEETS_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'
```

> **Tip:** `GOOGLE_APPLICATION_CREDENTIALS_JSON` can be omitted when the server is running in an environment that already exposes Google Cloud credentials (e.g., via Workload Identity or a credentials file set by `GOOGLE_APPLICATION_CREDENTIALS`).

### 3. Run the server

```bash
npm start
```

The Express server serves the single-page app at `http://localhost:3000` and exposes `POST /api/reviews` for submissions.

### 4. Testing the flow

Open `http://localhost:3000/?name=Budi&month=Juni` to experience the review journey with pre-filled context. When you reach the feedback steps, grant microphone access to capture your responses.

### Implementation Notes

- **Audio transcription:** The server sends each audio blob to Gemini 2.5 Pro with an Indonesian transcription prompt. If the API key is missing or the request fails, the transcription is left blank but the request still resolves so that HR receives the rest of the payload.
- **Google Sheets:** Rows are appended to columns A–J in the configured spreadsheet, matching the MVP schema. Missing credentials emit warnings and skip the append to avoid crashing the submission.
- **Cloud Storage archival:** Audio files are uploaded as `<name>_<month>_<label>.<ext>` to help HR trace submissions. Files are kept private by default. When no bucket is configured the upload is skipped with a console warning.
- **Front-end validation:** “Next” and “Submit” buttons remain disabled until the current step meets its requirement. Recordings can be re-done before submission, and previously created `ObjectURL`s are revoked to prevent memory leaks.

## Folder Structure

```
public/
  app.js         # SPA logic and state handling
  index.html     # Entry HTML
  styles.css     # Minimal styling
server.js        # Express server, integrations, and API endpoint
package.json
```

## Roadmap Ideas

- Swap vanilla JS for a component framework when the flow grows more complex.
- Persist submissions in a database before forwarding to Google Sheets for extra resilience.
- Add HR-side reporting and monitoring dashboards.
- Localize copy variations or adjust the employee list via a CMS.
