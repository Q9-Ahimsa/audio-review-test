import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { google } from "googleapis";
import { Storage } from "@google-cloud/storage";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { pipeline as createPipeline } from "@xenova/transformers";
import { randomUUID } from "crypto";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

app.use(express.static(path.join(__dirname, "public")));

app.post(
  "/api/reviews",
  upload.fields([
    { name: "audioDirectors", maxCount: 1 },
    { name: "audioSystem", maxCount: 1 }
  ]),
  async (req, res) => {
    try {
      const {
        name,
        month,
        score,
        bestPerformance,
        mostDiscipline,
        mostImproved
      } = req.body;

      const numericScore = Number(score);

      if (!name || !month || Number.isNaN(numericScore)) {
        return res.status(400).json({ error: "Data review tidak lengkap." });
      }

      if (!bestPerformance || !mostDiscipline || !mostImproved) {
        return res.status(400).json({ error: "Seluruh nominasi wajib diisi." });
      }

      const directorsAudio = req.files?.audioDirectors?.[0];
      const systemAudio = req.files?.audioSystem?.[0];

      if (!directorsAudio || !systemAudio) {
        return res.status(400).json({ error: "Rekaman audio wajib diunggah." });
      }

      const [directorsTranscript, systemTranscript] = await Promise.all([
        transcribeAudio(directorsAudio.buffer, "Saran untuk Direksi"),
        transcribeAudio(systemAudio.buffer, "Saran untuk Sistem")
      ]);

      const [directorsUrl, systemUrl] = await Promise.all([
        uploadAudio(name, month, "saran_direksi", directorsAudio),
        uploadAudio(name, month, "saran_sistem", systemAudio)
      ]);

      await appendToSheet({
        name,
        month,
        score: numericScore,
        bestPerformance,
        mostDiscipline,
        mostImproved,
        directorsTranscript,
        systemTranscript,
        directorsUrl,
        systemUrl
      });

      res.json({ message: "Review berhasil diproses." });
    } catch (error) {
      console.error("Failed to handle review submission", error);
      res.status(500).json({ error: "Terjadi kesalahan pada server." });
    }
  }
);

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

const WHISPER_MODEL = process.env.WHISPER_MODEL || "Xenova/whisper-small";

const ffmpeg = createFFmpeg({
  log: false,
  corePath: path.resolve(__dirname, "node_modules/@ffmpeg/core/dist/ffmpeg-core.js")
});

let ffmpegLoading;
async function ensureFfmpegLoaded() {
  if (!ffmpegLoading) {
    ffmpegLoading = ffmpeg.load().catch(error => {
      ffmpegLoading = undefined;
      throw error;
    });
  }
  await ffmpegLoading;
}

let whisperPipelinePromise;
async function getWhisperPipeline() {
  if (!whisperPipelinePromise) {
    whisperPipelinePromise = createPipeline("automatic-speech-recognition", WHISPER_MODEL).catch(error => {
      whisperPipelinePromise = undefined;
      throw error;
    });
  }
  return whisperPipelinePromise;
}

let ffmpegQueue = Promise.resolve();
function queueFfmpeg(action) {
  const run = ffmpegQueue.then(action, action);
  ffmpegQueue = run.then(() => undefined, () => undefined);
  return run;
}

async function transcribeAudio(buffer, label) {
  try {
    const wavBuffer = await queueFfmpeg(async () => {
      await ensureFfmpegLoaded();

      const inputName = `${randomUUID()}-input.webm`;
      const outputName = `${randomUUID()}-output.wav`;

      ffmpeg.FS("writeFile", inputName, new Uint8Array(buffer));
      await ffmpeg.run("-i", inputName, "-ar", "16000", "-ac", "1", "-c:a", "pcm16le", outputName);
      const wavData = ffmpeg.FS("readFile", outputName);
      ffmpeg.FS("unlink", inputName);
      ffmpeg.FS("unlink", outputName);

      return Buffer.from(wavData);
    });

    const whisper = await getWhisperPipeline();
    const result = await whisper(wavBuffer, {
      chunk_length_s: 30,
      stride_length_s: 5,
      language: "id"
    });

    const transcript = typeof result?.text === "string" ? result.text.trim() : "";
    return transcript;
  } catch (error) {
    console.error(`Gagal mentranskripsi dengan Whisper untuk ${label}`, error.message);
    return "";
  }
}

async function uploadAudio(name, month, label, file) {
  const bucketName = process.env.GCP_AUDIO_BUCKET;
  if (!bucketName) {
    console.warn("GCP_AUDIO_BUCKET tidak dikonfigurasi. File tidak diarsipkan.");
    return "";
  }

  const credentials = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
    ? JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON)
    : undefined;

  const storage = new Storage({ credentials });
  const bucket = storage.bucket(bucketName);

  const safeName = `${name}_${month}_${label}`
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_\-]/g, "");
  const extension = file.originalname.split(".").pop() || "webm";
  const filename = `${safeName}.${extension}`;
  const fileRef = bucket.file(filename);

  await fileRef.save(file.buffer, {
    contentType: file.mimetype,
    metadata: {
      cacheControl: "public, max-age=31536000"
    }
  });

  try {
    await fileRef.makePrivate();
  } catch (error) {
    console.warn("Gagal mengatur file menjadi private secara otomatis.", error.message);
  }

  return `gs://${bucketName}/${filename}`;
}

async function appendToSheet(payload) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_ID;
  if (!spreadsheetId) {
    console.warn("GOOGLE_SHEETS_ID tidak tersedia. Data tidak dikirim ke Google Sheet.");
    return;
  }

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");

  if (!email || !key) {
    console.warn("Kredensial Google Service Account tidak lengkap. Data tidak dikirim ke Google Sheet.");
    return;
  }

  const auth = new google.auth.JWT(email, undefined, key, ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/devstorage.read_write"]);
  const sheets = google.sheets({ version: "v4", auth });

  const values = [[
    payload.name,
    payload.month,
    payload.score,
    payload.bestPerformance,
    payload.mostDiscipline,
    payload.mostImproved,
    payload.directorsTranscript,
    payload.systemTranscript,
    payload.directorsUrl,
    payload.systemUrl
  ]];

  try {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: "A:J",
      valueInputOption: "RAW",
      requestBody: {
        values
      }
    });
  } catch (error) {
    console.error("Gagal mengirim data ke Google Sheets", error.message);
    throw error;
  }
}
