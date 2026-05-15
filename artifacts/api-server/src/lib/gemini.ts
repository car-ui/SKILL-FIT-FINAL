import { GoogleGenAI } from "@google/genai";
import { logger } from "./logger";

export interface ScoreResponse {
  relevanceScore: number;
  clarityScore: number;
  confidenceScore: number;
  feedback: string;
  languageDetected?: string;
  usedFallback: boolean;
}

export interface GeneratedInterviewQuestion {
  text: string;
  category: "experience" | "safety" | "skill" | "situation" | "career";
  difficulty: "easy" | "medium" | "hard";
}

const DEFAULT_GEMINI_TEXT_MODEL = "gemini-2.5-flash-lite";
const GEMINI_TEXT_MODEL = process.env["GEMINI_TEXT_MODEL"]?.trim() || DEFAULT_GEMINI_TEXT_MODEL;
const DEFAULT_GEMINI_FALLBACK_MODELS = [
  "gemini-2.5-flash-lite",
  "gemini-flash-lite-latest",
  "gemini-3.1-flash-lite-preview",
  "gemini-3-flash-preview",
  "gemini-2.0-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
];
const GEMINI_FALLBACK_MODELS = (process.env["GEMINI_FALLBACK_MODELS"] ?? "")
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);
const parsedMaxRetries = Number(process.env["GEMINI_MAX_RETRIES"] ?? "3");
const GEMINI_MAX_RETRIES = Number.isFinite(parsedMaxRetries) ? Math.max(1, parsedMaxRetries) : 3;

const FALLBACK_SCORES: ScoreResponse = {
  relevanceScore: 5,
  clarityScore: 5,
  confidenceScore: 5,
  feedback: "Gemini scoring unavailable. Rule-based fallback scores applied.",
  languageDetected: "unknown",
  usedFallback: true,
};

function clampScore(value: unknown, fallback = 5): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function normalizeCategory(value: unknown): GeneratedInterviewQuestion["category"] | null {
  const category = String(value ?? "").trim().toLowerCase();
  if (["experience", "safety", "skill", "situation", "career"].includes(category)) {
    return category as GeneratedInterviewQuestion["category"];
  }

  if (["technical", "tool", "tools", "machine", "machines", "quality"].includes(category)) return "skill";
  if (["scenario", "problem", "diagnostic", "diagnosis", "troubleshooting"].includes(category)) return "situation";
  if (["motivation", "attitude", "growth"].includes(category)) return "career";
  return null;
}

function normalizeDifficulty(value: unknown): GeneratedInterviewQuestion["difficulty"] | null {
  const difficulty = String(value ?? "").trim().toLowerCase();
  if (["easy", "medium", "hard"].includes(difficulty)) {
    return difficulty as GeneratedInterviewQuestion["difficulty"];
  }

  if (["basic", "beginner", "simple"].includes(difficulty)) return "easy";
  if (["intermediate", "moderate"].includes(difficulty)) return "medium";
  if (["advanced", "difficult", "complex"].includes(difficulty)) return "hard";
  return null;
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const arrayMatch = trimmed.match(/\[[\s\S]*\]/);
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  const arrayIndex = arrayMatch ? trimmed.indexOf(arrayMatch[0]) : -1;
  const objectIndex = objectMatch ? trimmed.indexOf(objectMatch[0]) : -1;

  if (arrayIndex >= 0 && (objectIndex < 0 || arrayIndex < objectIndex)) return arrayMatch![0];
  if (objectIndex >= 0) return objectMatch![0];
  return trimmed;
}

export function parseGeminiJson<T>(text: string): T {
  return JSON.parse(extractJsonText(text)) as T;
}

type GeminiTransport = {
  apiKey: string;
  baseUrl?: string;
  source: string;
};

let cachedClient: GoogleGenAI | null = null;
let cachedClientFingerprint = "";

function getGeminiTransport(): GeminiTransport | null {
  const replitBase = process.env["AI_INTEGRATIONS_GEMINI_BASE_URL"]?.trim();
  const replitKey = process.env["AI_INTEGRATIONS_GEMINI_API_KEY"]?.trim();
  if (replitBase && replitKey) {
    return { apiKey: replitKey, baseUrl: replitBase, source: "AI_INTEGRATIONS_GEMINI_API_KEY" };
  }

  const standardKey =
    process.env["GEMINI_API_KEY"]?.trim() ||
    process.env["GOOGLE_AI_API_KEY"]?.trim() ||
    process.env["GOOGLE_API_KEY"]?.trim();

  if (!standardKey) return null;

  const source = process.env["GEMINI_API_KEY"]?.trim()
    ? "GEMINI_API_KEY"
    : process.env["GOOGLE_AI_API_KEY"]?.trim()
      ? "GOOGLE_AI_API_KEY"
      : "GOOGLE_API_KEY";

  return { apiKey: standardKey, source };
}

function getGeminiModelChain(): string[] {
  return [...new Set([GEMINI_TEXT_MODEL, ...GEMINI_FALLBACK_MODELS, ...DEFAULT_GEMINI_FALLBACK_MODELS])];
}

export function getGeminiRuntimeConfig(): { configured: boolean; source?: string; model: string; fallbackModels: string[] } {
  const transport = getGeminiTransport();
  const [model, ...fallbackModels] = getGeminiModelChain();
  return {
    configured: Boolean(transport),
    source: transport?.source,
    model: model ?? DEFAULT_GEMINI_TEXT_MODEL,
    fallbackModels,
  };
}

function getGeminiClient(): GoogleGenAI {
  const transport = getGeminiTransport();
  if (!transport) {
    throw new Error(
      "Gemini is not configured. Set GEMINI_API_KEY, GOOGLE_AI_API_KEY, GOOGLE_API_KEY, or the Replit Gemini integration env vars.",
    );
  }

  const fingerprint = `${transport.source}:${transport.baseUrl ?? "google"}:${transport.apiKey.slice(0, 8)}:${transport.apiKey.length}`;
  if (cachedClient && cachedClientFingerprint === fingerprint) return cachedClient;

  cachedClient = new GoogleGenAI({
    apiKey: transport.apiKey,
    ...(transport.baseUrl
      ? {
          httpOptions: {
            apiVersion: "",
            baseUrl: transport.baseUrl,
          },
        }
      : {}),
  });
  cachedClientFingerprint = fingerprint;
  return cachedClient;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isRetryableGeminiError(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase();
  if (msg.includes("quota") || msg.includes("resource_exhausted") || msg.includes("429")) {
    return false;
  }
  return (
    msg.includes("rate limit") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("503") ||
    msg.includes("unavailable")
  );
}

function shouldTryFallbackModel(error: unknown): boolean {
  const msg = errorMessage(error).toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("high demand") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("503") ||
    msg.includes("unavailable")
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withGeminiRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= GEMINI_MAX_RETRIES || !isRetryableGeminiError(error)) break;
      await delay(600 * attempt);
    }
  }

  throw lastError;
}

export async function generateGeminiText(
  prompt: string,
  temperature = 0.35,
  responseMimeType?: "application/json" | "text/plain",
): Promise<string> {
  const client = getGeminiClient();
  const models = getGeminiModelChain();
  let lastError: unknown;

  for (const [index, model] of models.entries()) {
    try {
      const response = await withGeminiRetry(() =>
        client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          config: {
            temperature,
            ...(responseMimeType ? { responseMimeType } : {}),
          },
        }),
      );
      const text = response.text ?? "";

      if (!text.trim()) {
        throw new Error(`Gemini model ${model} returned an empty response`);
      }

      if (index > 0) {
        logger.warn({ model, primaryModel: models[0] }, "Gemini fallback model used successfully");
      }

      return text;
    } catch (error) {
      lastError = error;
      if (index >= models.length - 1 || !shouldTryFallbackModel(error)) break;
      logger.warn(
        { failedModel: model, nextModel: models[index + 1], status: (error as { status?: unknown })?.status },
        "Gemini model failed; trying fallback model",
      );
    }
  }

  throw lastError;
}

export async function generateGeminiJson<T>(prompt: string, temperature = 0.35): Promise<T> {
  const text = await generateGeminiText(prompt, temperature, "application/json");
  logger.debug({ prompt: prompt.substring(0, 100), response: text.substring(0, 200) }, "Gemini API call");
  return parseGeminiJson<T>(text);
}

export async function scoreResponse(
  questionText: string,
  transcript: string,
  language: "kn" | "hi" | "en",
  trade: string,
): Promise<ScoreResponse> {
  const languageLabel = ({ kn: "Kannada", hi: "Hindi", en: "English" } as const)[language] ?? "English";

  if (!transcript.trim()) {
    return {
      relevanceScore: 0,
      clarityScore: 0,
      confidenceScore: 0,
      feedback: "No usable transcript was captured.",
      languageDetected: languageLabel.toLowerCase(),
      usedFallback: true,
    };
  }

  const prompt = `Evaluate this interview response for a ${trade} position.

Question: "${questionText}"
Response: "${transcript}"

Score from 0-10 on:
- relevance: Does it answer the question?
- clarity: Is it clear and understandable?
- confidence: Shows practical knowledge?

Do not penalize local dialect, accent, or natural Kannada/Hindi/English mixing. Give practical, specific feedback.

Respond with ONLY a JSON object like:
{"relevanceScore": 7, "clarityScore": 8, "confidenceScore": 6, "feedback": "The candidate gave a practical answer and named relevant safety steps.", "languageDetected": "${languageLabel.toLowerCase()}"}`;

  try {
    const parsed = await generateGeminiJson<{
      relevanceScore?: unknown;
      relevance_score?: unknown;
      clarityScore?: unknown;
      clarity_score?: unknown;
      confidenceScore?: unknown;
      confidence_score?: unknown;
      feedback?: unknown;
      reasoning?: unknown;
      languageDetected?: unknown;
      language_detected?: unknown;
    }>(prompt, 0.3);

    const scores: ScoreResponse = {
      relevanceScore: clampScore(parsed.relevanceScore ?? parsed.relevance_score),
      clarityScore: clampScore(parsed.clarityScore ?? parsed.clarity_score),
      confidenceScore: clampScore(parsed.confidenceScore ?? parsed.confidence_score),
      feedback: String(parsed.feedback ?? parsed.reasoning ?? "Response evaluated by Gemini."),
      languageDetected: String(parsed.languageDetected ?? parsed.language_detected ?? language),
      usedFallback: false,
    };

    logger.info(
      {
        relevance: scores.relevanceScore,
        clarity: scores.clarityScore,
        confidence: scores.confidenceScore,
      },
      "Gemini scored response successfully",
    );
    return scores;
  } catch (error) {
    logger.error(
      { error, trade, model: GEMINI_TEXT_MODEL, questionText: questionText.substring(0, 50) },
      "Gemini scoring failed",
    );

    return {
      ...FALLBACK_SCORES,
      feedback: `Gemini scoring failed: ${errorMessage(error)}. Local fallback scores applied.`,
      languageDetected: language,
    };
  }
}

export async function generateInterviewQuestions(
  trade: string,
  language: string,
  count: number,
): Promise<GeneratedInterviewQuestion[]> {
  const languageLabel = language === "kn"
    ? "Kannada script (ಕನ್ನಡ ಲಿಪಿ) — use actual Kannada Unicode characters, NOT Roman/English transliteration"
    : language === "hi"
    ? "Hindi (Devanagari script) — use actual Hindi Unicode characters, NOT Roman transliteration"
    : "English";
  const safeCount = Math.min(8, Math.max(3, count));
  const prompt = `Generate ${safeCount} original mobile voice interview questions for a ${trade} candidate in ${languageLabel}.

The interview is for Karnataka blue-collar workforce fitment. Questions must be practical, short enough to speak aloud, and not dependent on reading diagrams.

Coverage:
- one experience question
- one safety question
- two trade skill questions
- one real work-site situation question
- remaining questions can probe quality, troubleshooting, tools, or motivation

Rules:
- Return exactly ${safeCount} items.
- Use the requested language for every question.
- Do not use English unless the selected language is English or a technical word is naturally used in that trade.
- Avoid repeating generic phrases like "why do you want this job" more than once.
- Keep each question under 22 words.
- Use only these category values: experience, safety, skill, situation, career.
- Use only these difficulty values: easy, medium, hard.

Return only JSON:
[
  { "text": "question", "category": "experience", "difficulty": "easy" }
]`;

  try {
    const parsed = await generateGeminiJson<GeneratedInterviewQuestion[]>(prompt, 0.85);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((q) => ({
        text: String(q.text ?? "").trim(),
        category: normalizeCategory(q.category),
        difficulty: normalizeDifficulty(q.difficulty),
      }))
      .filter((q): q is GeneratedInterviewQuestion => {
        return q.text.length > 8 && q.category !== null && q.difficulty !== null;
      })
      .slice(0, safeCount);
  } catch (error) {
    logger.warn({ error, trade, language }, "Gemini question generation failed; using local question bank");
    return [];
  }
}

export async function generateAdaptiveInterviewQuestion(input: {
  trade: string;
  language: string;
  district?: string;
  askedQuestions: string[];
  lastQuestion?: string | null;
  lastTranscript?: string | null;
  askedCount: number;
  totalQuestions: number;
  sessionNonce: string;
}): Promise<GeneratedInterviewQuestion | null> {
  // ✅ Fixed: use input.language instead of bare `language`
  const languageLabel = input.language === "kn"
    ? "Kannada script (ಕನ್ನಡ ಲಿಪಿ) — use actual Kannada Unicode characters, NOT Roman/English transliteration"
    : input.language === "hi"
    ? "Hindi (Devanagari script) — use actual Hindi Unicode characters, NOT Roman transliteration"
    : "English";

  const prompt = `You are Alex-style live AI interviewer for AI SkillFit, a Karnataka blue-collar workforce video interview.

Generate exactly ONE next interview question.

Candidate context:
- Trade: ${input.trade}
- District: ${input.district ?? "Unknown"}
- Interview language: ${languageLabel}
- Question number: ${input.askedCount + 1} of ${input.totalQuestions}
- Session nonce for uniqueness: ${input.sessionNonce}

Already asked questions:
${input.askedQuestions.length ? input.askedQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n") : "None"}

Most recent answer context:
Question: ${input.lastQuestion ?? "None"}
Answer: ${input.lastTranscript ?? "None"}

Interview behavior:
- Be conversational and adaptive, like a live interviewer, not a static question bank.
- For question 1, open with a realistic work-site scenario tailored to the trade.
- For later questions, explicitly use one concrete detail from the previous answer and ask the next practical diagnostic, safety, quality, or customer-handover step.
- If the last answer was vague, ask a practical follow-up that checks real experience.
- If the last answer was strong, increase depth with a work-site scenario.
- Avoid any question already asked and avoid predictable first-bank questions.
- Use a different wording from common memorised questions.
- Keep it natural for text-to-speech on mobile, around 35-70 words in English or equivalent length in the selected language.
- Ask only one question.
- Use ${languageLabel}. Technical trade terms may stay in English if commonly spoken that way.

Return only JSON:
{ "text": "question", "category": "experience|safety|skill|situation|career", "difficulty": "easy|medium|hard" }`;

  try {
    const q = await generateGeminiJson<GeneratedInterviewQuestion>(prompt, 0.95);
    const text = String(q.text ?? "").trim();
    const category = normalizeCategory(q.category);
    const difficulty = normalizeDifficulty(q.difficulty);
    if (text.length < 8) return null;
    if (!category || !difficulty) return null;
    return { text, category, difficulty };
  } catch (error) {
    logger.warn({ error, trade: input.trade }, "Adaptive Gemini question failed; using local fallback");
    return null;
  }
}