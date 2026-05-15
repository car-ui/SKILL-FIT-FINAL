import { transcriptionQueue } from "../lib/queues";
import { db } from "../lib/db";
import { responsesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import Groq from "groq-sdk";
import fs from "fs";
import path from "path";
import os from "os";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const LANGUAGE_MAP: Record<string, string> = {
  kn: "kn",
  hi: "hi",
  en: "en",
};

function getGroq(): Groq | null {
  const key = process.env["GROQ_API_KEY"];
  if (!key) return null;
  return new Groq({ apiKey: key });
}

// Process transcription jobs
transcriptionQueue.process(async (job) => {
  const { responseId, videoUrl, language } = job.data as {
    responseId: number;
    videoUrl: string;
    language: string;
  };

  const groq = getGroq();
  if (!groq) {
    throw new Error("Groq API key not configured");
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

    // Extract audio using ffmpeg
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

    // Update response with transcription and confidence
    await db
      .update(responsesTable)
      .set({
        transcript: transcription.text,
        languageDetected: langCode,
      })
      .where(eq(responsesTable.id, responseId));

    return {
      transcript: transcription.text,
      confidence: Math.round(confidence * 100) / 100,
      language: langCode,
    };
  } finally {
    // Clean up temp files
    try { fs.unlinkSync(videoPath); } catch {}
    try { fs.unlinkSync(audioPath); } catch {}
  }
});
