import FormData from "form-data";
import axios from "axios";
import { logger } from "./logger";

export interface TranscriptionResult {
  transcript: string;
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  language: string
): Promise<TranscriptionResult | null> {
  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      logger.warn("GROQ_API_KEY not set, transcription unavailable");
      return null;
    }

    const formData = new FormData();
    formData.append("file", audioBuffer, "audio.wav");
    formData.append("model", "whisper-large-v3");
    formData.append("language", language);

    const response = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${apiKey}`,
        },
        timeout: 60000, // 60 second timeout for audio processing
      }
    );

    const transcript = response.data?.text || response.data?.transcript || "";

    if (!transcript) {
      logger.warn("Groq API returned empty transcript");
      return null;
    }

    logger.info(`Transcribed audio (${language}): ${transcript.substring(0, 100)}...`);

    return {
      transcript,
    };
  } catch (error) {
    logger.error({ error }, "Error transcribing audio with Groq API");
    return null;
  }
}
