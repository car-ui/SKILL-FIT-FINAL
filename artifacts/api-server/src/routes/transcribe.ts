import { Router, type IRouter } from "express";
import multer from "multer";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import os from "os";
import { transcribeLimiter } from "../middleware/rateLimits";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const router: IRouter = Router();

// Use memory storage for small audio files (< 10MB); multer handles the upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    const allowed = ["audio/webm", "audio/ogg", "audio/wav", "audio/mp4", "audio/mpeg", "audio/m4a", "video/webm"];
    if (allowed.includes(file.mimetype) || file.mimetype.startsWith("audio/")) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported audio format: ${file.mimetype}`));
    }
  },
});

function getGroq(): Groq | null {
  const key = process.env["GROQ_API_KEY"];
  if (!key) return null;
  return new Groq({ apiKey: key });
}

// Whisper language code mapping
const LANGUAGE_MAP: Record<string, string> = {
  kn: "kn",  // Kannada
  hi: "hi",  // Hindi
  en: "en",  // English
};

// ---------------------------------------------------------------------------
// POST /api/transcribe
// Accepts an audio file (multipart/form-data, field name "audio") and an
// optional "language" field ("kn" | "hi" | "en"). Returns the Whisper
// transcription as { transcript: string, language: string, confidence: number }.
// ---------------------------------------------------------------------------
router.post("/transcribe", transcribeLimiter, upload.single("audio"), async (req, res) => {
  const groq = getGroq();
  if (!groq) {
    res.status(503).json({ error: "Groq API key not configured" });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "No audio file provided. Use multipart/form-data with field name 'audio'." });
    return;
  }

  const language = LANGUAGE_MAP[(req.body.language as string) ?? "kn"] ?? "kn";

  // Write buffer to a temp file (Groq SDK needs a readable stream)
  const tmpPath = path.join(os.tmpdir(), `skillfit-audio-${Date.now()}.webm`);
  try {
    fs.writeFileSync(tmpPath, req.file.buffer);

    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: "whisper-large-v3",
      language,           // Whisper handles code-mixing automatically
      response_format: "verbose_json",
    });

    // Extract confidence from segments (average of segment confidences)
    const segments = (transcription as any).segments || [];
    const confidence = segments.length > 0
      ? segments.reduce((sum: number, seg: any) => sum + (seg.confidence || 0), 0) / segments.length
      : 0.8; // fallback confidence

    res.json({
      transcript: transcription.text,
      language,
      confidence: Math.round(confidence * 100) / 100, // round to 2 decimal places
    });
  } catch (err) {
    req.log?.warn({ err }, "Groq Whisper transcription failed");
    res.status(500).json({
      error: "Transcription failed",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpPath); } catch {}
  }
});

// ---------------------------------------------------------------------------
// POST /api/transcribe/video
// Accepts a video URL, extracts audio, transcribes with confidence
// ---------------------------------------------------------------------------
router.post("/transcribe/video", transcribeLimiter, async (req, res) => {
  const groq = getGroq();
  if (!groq) {
    res.status(503).json({ error: "Groq API key not configured" });
    return;
  }

  const { videoUrl, language = "kn" } = req.body as { videoUrl: string; language?: string };
  if (!videoUrl) {
    res.status(400).json({ error: "videoUrl is required" });
    return;
  }

  const langCode = LANGUAGE_MAP[language] ?? "kn";
  const videoPath = path.join(os.tmpdir(), `video-${Date.now()}.webm`);
  const audioPath = path.join(os.tmpdir(), `audio-${Date.now()}.wav`);

  try {
    // Download video file
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Failed to download video: ${response.status}`);
    const videoBuffer = await response.arrayBuffer();
    fs.writeFileSync(videoPath, Buffer.from(videoBuffer));

    // Extract audio using ffmpeg (assuming ffmpeg is available)
    await execAsync(`ffmpeg -i "${videoPath}" -vn -acodec pcm_s16le -ar 16000 -ac 1 "${audioPath}" -y`);

    // Transcribe audio
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-large-v3",
      language: langCode,
      response_format: "verbose_json",
    });

    // Extract confidence from segments
    const segments = (transcription as any).segments || [];
    const confidence = segments.length > 0
      ? segments.reduce((sum: number, seg: any) => sum + (seg.confidence || 0), 0) / segments.length
      : 0.8;

    res.json({
      transcript: transcription.text,
      language: langCode,
      confidence: Math.round(confidence * 100) / 100,
    });
  } catch (err) {
    req.log?.warn({ err }, "Video transcription failed");
    res.status(500).json({
      error: "Video transcription failed",
      details: err instanceof Error ? err.message : "Unknown error",
    });
  } finally {
    // Clean up temp files
    try { fs.unlinkSync(videoPath); } catch {}
    try { fs.unlinkSync(audioPath); } catch {}
  }
});

export default router; 
