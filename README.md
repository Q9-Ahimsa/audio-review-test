# Project Vocal Review

Project Vocal Review is a minimal end-to-end prototype that demonstrates the monthly performance review workflow described in the MVP PRD. It combines a guided, speech-friendly web experience with a backend that transcribes audio feedback, archives original recordings, and writes structured data into Google Sheets.

## Features

- **Five-step guided flow** that mirrors the PRD: welcome, quantitative score, peer nominations, and two voice feedback screens.
- **MediaRecorder-based audio capture** with re-record and playback controls. Navigation is blocked until each step is complete.
- **Single submission payload** that bundles score, nominations, and audio blobs.
- **Backend intake API** that uploads raw audio to Google Cloud Storage, transcribes feedback locally with Whisper, and appends a fully structured row to Google Sheets.
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
GCP_AUDIO_BUCKET=your_private_bucket
GOOGLE_SHEETS_ID=your_sheet_id
GOOGLE_SERVICE_ACCOUNT_EMAIL=service-account@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_APPLICATION_CREDENTIALS_JSON='{"type":"service_account",...}'
WHISPER_MODEL=Xenova/whisper-small # optional override
```

> **Tip:** `GOOGLE_APPLICATION_CREDENTIALS_JSON` can be omitted when the server is running in an environment that already exposes Google Cloud credentials (e.g., via Workload Identity or a credentials file set by `GOOGLE_APPLICATION_CREDENTIALS`).
>
> `WHISPER_MODEL` is optional and lets you pick any Whisper checkpoint published by [Xenova](https://huggingface.co/Xenova) on Hugging Face. Omit it to stick with the default `Xenova/whisper-small` balance between speed and accuracy.

### 3. Fast local demo (no credentials required)

If you only want to experience the UX, you can ignore the `.env` step above:

1. Run `npm install` (only needs to be done once).
2. Start the server with `npm start`.
3. Open `http://localhost:3000/?name=Budi&month=Juni` in your browser.

The form will submit successfully, and the server will log warnings that Whisper
model downloads, Google Sheets, and Cloud Storage integrations were skipped when applicable.
On the first recording you submit, the server may take a few seconds to download
the Whisper model weights before finishing transcription.
Everything else—step validation, microphone prompts, recording playback—works as
it will in production, so you can fully demo the flow without any API keys.

### 4. Run the server (with integrations configured)

```bash
npm start
```

The Express server serves the single-page app at `http://localhost:3000` and exposes `POST /api/reviews` for submissions.

### 5. Testing the flow

Open `http://localhost:3000/?name=Budi&month=Juni` to experience the review journey with pre-filled context. When you reach the feedback steps, grant microphone access to capture your responses.

### Implementation Notes

- **Audio transcription:** The server converts each WebM recording to mono WAV, then runs it through the open-source Whisper model (default: `Xenova/whisper-small`) directly in Node.js. The first transcription triggers a one-time model download to the Transformers cache. If the download or inference fails, the transcript is left blank but the submission still succeeds so HR keeps the rest of the payload.
- **Optional Whisper tuning:** Override the default model by setting `WHISPER_MODEL` in `.env` (for example `Xenova/whisper-base`). Heavier models improve accuracy at the cost of longer processing time.
- **Cache control:** Set `TRANSFORMERS_CACHE=/path/to/cache` before starting the server if you want to pin where the Whisper weights are stored between runs (handy for containerized deployments).
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
