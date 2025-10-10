import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import dotenv from "dotenv";
import { google } from "googleapis";
import { Storage } from "@google-cloud/storage";
import fetch from "node-fetch";

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

async function transcribeAudio(buffer, label) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn(`GEMINI_API_KEY tidak tersedia. Melewatkan transkripsi untuk ${label}.`);
    return "";
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-latest:generateContent?key=${apiKey}`;
  const base64 = buffer.toString("base64");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: "The following audio is in Indonesian. Please transcribe it accurately and verbatim." },
              {
                inline_data: {
                  mime_type: "audio/webm",
                  data: base64
                }
              }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const message = await response.text();
      console.error("Gemini API error", message);
      return "";
    }

    const data = await response.json();
    const transcript = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    return transcript || "";
  } catch (error) {
    console.error(`Gagal menghubungi Gemini untuk ${label}`, error.message);
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
