import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "../lib/db";
import {
  interviewsTable,
  responsesTable,
  integrityChecksTable,
  classificationsTable,
  candidatesTable,
} from "@workspace/db";
import { eq, ne, and } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { generateAdaptiveInterviewQuestion, generateGeminiJson, generateInterviewQuestions, scoreResponse } from "../lib/gemini";
import {
  buildInterviewQuestionSnapshot,
  parseQuestionSnapshot,
  selectNextInterviewQuestionFromSnapshot,
  snapshotContainsQuestionId,
  type SnapshotQuestion,
} from "../lib/question-selection";
import { getPoolForTradeAndLanguage } from "../lib/question-bank";
import { transcriptionQueue, faceProcessingQueue } from "../lib/queues";
import { whatsAppService } from "../lib/whatsapp";
import { startInterviewLimiter } from "../middleware/rateLimits";

const router: IRouter = Router();
const INTERVIEW_QUESTION_LIMIT = 5;
const INTERVIEW_STAGES = [
  {
    key: "fundamentals",
    label: "Fundamentals",
    category: "fundamentals",
    difficulty: "easy" as const,
    fallbackCategories: ["skill", "experience"],
  },
  {
    key: "practical_workflow",
    label: "Practical workflow",
    category: "practical_workflow",
    difficulty: "medium" as const,
    fallbackCategories: ["experience", "skill"],
  },
  {
    key: "safety_awareness",
    label: "Safety awareness",
    category: "safety_awareness",
    difficulty: "easy" as const,
    fallbackCategories: ["safety"],
  },
  {
    key: "troubleshooting",
    label: "Troubleshooting",
    category: "troubleshooting",
    difficulty: "medium" as const,
    fallbackCategories: ["situation", "skill"],
  },
  {
    key: "real_world_scenario",
    label: "Real-world scenario",
    category: "real_world_scenario",
    difficulty: "hard" as const,
    fallbackCategories: ["situation"],
  },
];

function getInterviewQuestionCount(): number {
  return INTERVIEW_QUESTION_LIMIT;
}

async function buildDynamicQuestionSnapshot(
  trade: string,
  language: string,
  count: number,
): Promise<SnapshotQuestion[]> {
  const stages = INTERVIEW_STAGES.slice(0, count);
  const fallback = buildStructuredFallbackSnapshot(trade, language, count);

  const prompt = `Generate exactly ${stages.length} blue-collar interview questions for a Karnataka government skill assessment.

Trade: ${trade}
Language: ${language}

The interview MUST follow this exact sequence:
${stages.map((stage, index) => `Q${index + 1}: ${stage.label}`).join("\n")}

Rules:
- Ask one clear question per stage.
- Keep questions practical and trade-specific.
- Use the requested language for all question text.
- Do not add extra questions.

Return ONLY valid JSON array:
[
  {"text":"...", "stage":"fundamentals", "difficulty":"easy"},
  {"text":"...", "stage":"practical_workflow", "difficulty":"medium"},
  {"text":"...", "stage":"safety_awareness", "difficulty":"easy"},
  {"text":"...", "stage":"troubleshooting", "difficulty":"medium"},
  {"text":"...", "stage":"real_world_scenario", "difficulty":"hard"}
]`;

  try {
    const generated = await generateGeminiJson<Array<{ text?: string; stage?: string; difficulty?: "easy" | "medium" | "hard" }>>(prompt, 0.55);
    const timestamp = Date.now().toString(36);
    const questions = stages.map((stage, index): SnapshotQuestion => {
      const generatedQuestion = generated.find((q) => q.stage === stage.key) ?? generated[index];
      const text = generatedQuestion?.text?.trim();
      if (!text) return fallback[index]!;
      return {
        id: `structured-${timestamp}-${index + 1}`,
        text,
        stage: stage.key,
        category: stage.category,
        trade,
        language,
        difficulty: generatedQuestion?.difficulty ?? stage.difficulty,
      };
    });
    return questions;
  } catch {
    return fallback;
  }
}

function buildStructuredFallbackSnapshot(trade: string, language: string, count: number): SnapshotQuestion[] {
  const pool = getPoolForTradeAndLanguage(trade, language);
  const usedQuestionIds = new Set<string>();
  const stages = INTERVIEW_STAGES.slice(0, count);

  return stages.map((stage, index): SnapshotQuestion => {
    const question =
      pool.find((q) => !usedQuestionIds.has(q.id) && stage.fallbackCategories.includes(q.category)) ??
      pool.find((q) => !usedQuestionIds.has(q.id));

    if (question) {
      usedQuestionIds.add(question.id);
      return {
        id: `${question.id}-${stage.key}`,
        text: question.text,
        stage: stage.key,
        category: stage.category,
        trade: question.trade,
        language: question.language,
        difficulty: stage.difficulty,
      };
    }

    return {
      id: `fallback-${trade.replace(/\s+/g, "-").toLowerCase()}-${stage.key}-${index + 1}`,
      text: `${stage.label}: explain how you would handle this part of ${trade} work.`,
      stage: stage.key,
      category: stage.category,
      trade,
      language,
      difficulty: stage.difficulty,
    };
  });
}

async function buildAdaptiveNextQuestion(params: {
  interviewId: number;
  candidate: typeof candidatesTable.$inferSelect;
  snapshot: SnapshotQuestion[];
  responses: typeof responsesTable.$inferSelect[];
  totalQuestions: number;
}): Promise<SnapshotQuestion | null> {
  const { candidate, snapshot, responses, totalQuestions } = params;
  if (responses.length >= totalQuestions) return null;

  const usedQuestionIds = new Set(responses.map((r) => r.questionId));
  const lastResponse = responses.length > 0 ? responses[responses.length - 1] : null;
  const askedTexts = responses.map((r) => r.questionText);

  const generated = await generateAdaptiveInterviewQuestion({
    trade: candidate.trade,
    language: candidate.language,
    district: candidate.district,
    askedQuestions: askedTexts,
    lastQuestion: lastResponse?.questionText ?? null,
    lastTranscript: lastResponse?.transcript ?? null,
    askedCount: responses.length,
    totalQuestions,
    sessionNonce: `${params.interviewId}-${randomUUID()}`,
  });

  if (generated) {
    const normalized = generated.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const duplicate = snapshot.some(
      (q) => q.text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim() === normalized,
    );

    if (!duplicate) {
      return {
        id: `ai-live-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
        text: generated.text,
        category: generated.category,
        trade: candidate.trade,
        language: candidate.language,
        difficulty: generated.difficulty,
      };
    }
  }

  const fallbackSnapshot = snapshot.length > 0
    ? snapshot
    : buildInterviewQuestionSnapshot(candidate.trade, candidate.language, totalQuestions);

  return selectNextInterviewQuestionFromSnapshot(
    fallbackSnapshot,
    usedQuestionIds,
    lastResponse?.transcript ?? null,
    lastResponse?.questionId,
  );
}

// ---------------------------------------------------------------------------
// Helper: Score a single response with Gemini and persist to DB
// ---------------------------------------------------------------------------
async function scoreAndPersist(
  responseId: number,
  trade: string,
  questionText: string,
  transcript: string,
  language: string,
  log?: { warn: (obj: object, msg: string) => void }
): Promise<{ relevanceScore: number; clarityScore: number; confidenceScore: number; reasoning: string }> {
  const prompt = `
You are an expert workforce assessor for blue-collar trades in Karnataka, India.

RULES:
1. Do NOT penalise the candidate for local dialects, accents, or mixing Kannada/Hindi/English.
2. Score ONLY on trade knowledge and communication content.
3. All scores must be integers from 0 to 10.

Trade: ${trade}
Question: ${questionText}
Candidate transcript: "${transcript}"

Return ONLY valid JSON with no markdown:
{
  "relevance_score": <0-10>,
  "clarity_score": <0-10>,
  "confidence_score": <0-10>,
  "reasoning": "<1-2 sentence explanation>",
  "language_detected": "<kannada|hindi|english|mixed>"
}
`;

  try {
    void prompt;
    const scores = await scoreResponse(questionText, transcript, language as "kn" | "hi" | "en", trade);
    const relevanceScore = scores.relevanceScore;
    const clarityScore = scores.clarityScore;
    const confidenceScore = scores.confidenceScore;
    const reasoning = scores.feedback;
    const languageDetected = scores.languageDetected ?? language;

    // Persist scores back to the response record
    await db
      .update(responsesTable)
      .set({ relevanceScore, clarityScore, confidenceScore, geminiReasoning: reasoning, languageDetected })
      .where(eq(responsesTable.id, responseId));

    return { relevanceScore, clarityScore, confidenceScore, reasoning };
  } catch (err) {
    if (log) log.warn({ err }, "Gemini scoring failed — using defaults");
    // Persist fallback scores so classify doesn't get nulls
    await db
      .update(responsesTable)
      .set({ relevanceScore: 5, clarityScore: 5, confidenceScore: 5, geminiReasoning: "Auto-scored (fallback)" })
      .where(eq(responsesTable.id, responseId));
    return { relevanceScore: 5, clarityScore: 5, confidenceScore: 5, reasoning: "Auto-scored (fallback)" };
  }
}

// ---------------------------------------------------------------------------
// POST /api/interviews
// ---------------------------------------------------------------------------
router.post("/interviews", startInterviewLimiter, async (req, res) => {
  const schema = z.object({ candidateId: z.number().int().positive() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  const [interview] = await db
    .insert(interviewsTable)
    .values({ candidateId: parsed.data.candidateId, status: "in_progress" })
    .returning();

  res.status(201).json(interview);
});

// ---------------------------------------------------------------------------
// GET /api/interviews/:id
// ---------------------------------------------------------------------------
router.get("/interviews/:id", async (req, res) => {
  const idParam = req.params["id"];
  const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [interview] = await db.select().from(interviewsTable).where(eq(interviewsTable.id, id));
  if (!interview) { res.status(404).json({ error: "Not found" }); return; }

  const responses = await db.select().from(responsesTable).where(eq(responsesTable.interviewId, id));
  res.json({ ...interview, responses });
});

// ---------------------------------------------------------------------------
// GET /api/interviews/:id/questions
// Random per-session question set (stored in question_snapshot). Not predictable from trade alone.
// Supports dynamic adaptive selection when ?next=true.
// ---------------------------------------------------------------------------
router.get("/interviews/:id/questions", async (req, res) => {
  const idParam = req.params["id"];
  const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [interview] = await db.select().from(interviewsTable).where(eq(interviewsTable.id, id));
  if (!interview) { res.status(404).json({ error: "Not found" }); return; }

  if (interview.status !== "in_progress") {
    res.status(400).json({ error: "Interview is not active" });
    return;
  }

  const [candidate] = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.id, interview.candidateId));

  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  const qCount = getInterviewQuestionCount();

  const next = req.query["next"] === "true";
  let snap = parseQuestionSnapshot(interview.questionSnapshot) ?? [];

  if (!next) {
    if (snap.length === 0) {
      snap = await buildDynamicQuestionSnapshot(candidate.trade, candidate.language, qCount);
      await db
        .update(interviewsTable)
        .set({ questionSnapshot: JSON.stringify(snap) })
        .where(eq(interviewsTable.id, id));
    }
    res.json(snap.slice(0, qCount));
    return;
  }

  const responses = await db
    .select()
    .from(responsesTable)
    .where(eq(responsesTable.interviewId, id))
    .orderBy(responsesTable.id);

  if (responses.length >= qCount) {
    res.json({ question: null, totalQuestions: qCount, askedCount: responses.length });
    return;
  }

  if (snap.length === 0) {
    snap = await buildDynamicQuestionSnapshot(candidate.trade, candidate.language, qCount);
    await db
      .update(interviewsTable)
      .set({ questionSnapshot: JSON.stringify(snap) })
      .where(eq(interviewsTable.id, id));
  }

  const nextQuestion = snap[responses.length] ?? null;

  if (!nextQuestion) {
    res.json({ question: null, totalQuestions: qCount, askedCount: responses.length });
    return;
  }

  if (!snap.some((q) => q.id === nextQuestion.id)) {
    snap = [...snap, nextQuestion];
    await db
      .update(interviewsTable)
      .set({ questionSnapshot: JSON.stringify(snap) })
      .where(eq(interviewsTable.id, id));
  }

  res.json({
    question: nextQuestion,
    totalQuestions: qCount,
    askedCount: responses.length + 1,
  });
});

// ---------------------------------------------------------------------------
// POST /api/interviews/:id/complete
// ---------------------------------------------------------------------------
router.post("/interviews/:id/complete", async (req, res) => {
  const idParam = req.params["id"];
  const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [interview] = await db
    .update(interviewsTable)
    .set({ status: "completed", completedAt: new Date() })
    .where(eq(interviewsTable.id, id))
    .returning();

  if (!interview) { res.status(404).json({ error: "Not found" }); return; }

  const responses = await db.select().from(responsesTable).where(eq(responsesTable.interviewId, id));
  const integrityFlags: string[] = [];

  const expectedSnap = parseQuestionSnapshot(interview.questionSnapshot);
  const expectedCount = expectedSnap?.length ? Math.min(expectedSnap.length, getInterviewQuestionCount()) : getInterviewQuestionCount();
  if (responses.length < expectedCount) {
    integrityFlags.push("incomplete_interview");
  }

  const otherSessions = await db
    .select({ id: interviewsTable.id })
    .from(interviewsTable)
    .where(and(eq(interviewsTable.candidateId, interview.candidateId), ne(interviewsTable.id, id)));
  if (otherSessions.length > 0) integrityFlags.push("repeat_attempt");

  if (responses.length < 2) integrityFlags.push("too_few_responses");
  const shortCount = responses.filter((r) => r.transcript.trim().split(/\s+/).length < 3).length;
  if (shortCount > responses.length / 2) integrityFlags.push("mostly_short_answers");

  // Upsert integrity check
  const [existing] = await db
    .select()
    .from(integrityChecksTable)
    .where(eq(integrityChecksTable.interviewId, id));

  if (existing) {
    await db
      .update(integrityChecksTable)
      .set({ flags: [...new Set([...existing.flags, ...integrityFlags])] })
      .where(eq(integrityChecksTable.interviewId, id));
  } else {
    await db.insert(integrityChecksTable).values({ interviewId: id, flags: integrityFlags });
  }

  res.json(interview);
});

// ---------------------------------------------------------------------------
// POST /api/interviews/:id/responses
// Submits a response AND auto-scores it with Gemini (scores persisted to DB)
// ---------------------------------------------------------------------------
router.post("/interviews/:id/responses", async (req, res) => {
  const idParam = req.params["id"];
  const interviewId = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  if (isNaN(interviewId)) { res.status(400).json({ error: "Invalid id" }); return; }

  const schema = z.object({
    questionId: z.string(),
    questionText: z.string(),
    transcript: z.string(),
    videoUrl: z.string().optional().nullable(),
    facePresentPct: z.number().optional().nullable(),
    livenessPass: z.boolean().optional().nullable(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }

  // Get candidate's trade and language for scoring context
  const [interview] = await db
    .select()
    .from(interviewsTable)
    .where(eq(interviewsTable.id, interviewId));

  if (!interview) {
    res.status(404).json({ error: "Interview not found" });
    return;
  }

  if (interview.status !== "in_progress") {
    res.status(409).json({ error: "Interview is already completed." });
    return;
  }

  const snap = parseQuestionSnapshot(interview.questionSnapshot);
  if (!snap?.length) {
    res.status(400).json({
      error: "No question set for this interview. Reload the interview page.",
    });
    return;
  }

  const submittedResponses = await db
    .select({ id: responsesTable.id, questionId: responsesTable.questionId })
    .from(responsesTable)
    .where(eq(responsesTable.interviewId, interviewId));

  if (submittedResponses.length >= getInterviewQuestionCount()) {
    res.status(409).json({ error: "Interview already has 5 responses. Please submit the assessment." });
    return;
  }

  if (submittedResponses.some((response) => response.questionId === parsed.data.questionId)) {
    res.status(409).json({ error: "This question has already been answered." });
    return;
  }

  const allowed = snapshotContainsQuestionId(snap, parsed.data.questionId);
  if (!allowed) {
    res.status(403).json({
      error: "Invalid question for this session. Do not submit answers outside the assigned interview.",
    });
    return;
  }

  const serverQuestionText = allowed.text;

  let trade = "General";
  let language = "en";

  const [candidate] = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.id, interview.candidateId));
  if (candidate) {
    trade = candidate.trade;
    language = candidate.language;
  }

  // Insert the response record — question text from server snapshot only (anti-tamper)
  const [response] = await db
    .insert(responsesTable)
    .values({
      interviewId,
      questionId: parsed.data.questionId,
      questionText: serverQuestionText,
      transcript: parsed.data.transcript, // Initial transcript from client
      videoUrl: parsed.data.videoUrl ?? null,
    })
    .returning();

  // Update face/liveness integrity data if provided
  if (parsed.data.facePresentPct !== undefined && parsed.data.facePresentPct !== null) {
    const [existing] = await db
      .select()
      .from(integrityChecksTable)
      .where(eq(integrityChecksTable.interviewId, interviewId));

    if (existing) {
      await db
        .update(integrityChecksTable)
        .set({
          facePresentPct: parsed.data.facePresentPct,
          livenessPass: parsed.data.livenessPass ?? existing.livenessPass,
        })
        .where(eq(integrityChecksTable.interviewId, interviewId));
    } else {
      await db.insert(integrityChecksTable).values({
        interviewId,
        facePresentPct: parsed.data.facePresentPct,
        livenessPass: parsed.data.livenessPass ?? null,
        flags: [],
      });
    }
  }

  // Queue async processing jobs
  if (parsed.data.videoUrl) {
    // Queue transcription job to get server-side transcript with confidence
    await transcriptionQueue.add({
      responseId: response.id,
      videoUrl: parsed.data.videoUrl,
      language,
    });

    // Queue face processing job for duplicate detection
    await faceProcessingQueue.add({
      interviewId,
      candidateId: interview.candidateId,
      videoUrl: parsed.data.videoUrl,
      deviceFingerprint: candidate?.deviceFingerprint,
    });
  }

  // Score the response synchronously using Gemini
  const scores = await scoreResponse(
    serverQuestionText,
    parsed.data.transcript,
    language as "kn" | "hi" | "en",
    trade
  );

  // Update response with scores
  await db
    .update(responsesTable)
    .set({
      relevanceScore: scores.relevanceScore,
      clarityScore: scores.clarityScore,
      confidenceScore: scores.confidenceScore,
      geminiReasoning: scores.feedback,
      languageDetected: scores.languageDetected ?? language,
    })
    .where(eq(responsesTable.id, response.id));

  // Return response immediately with actual scores
  res.status(201).json({
    ...response,
    relevanceScore: scores.relevanceScore,
    clarityScore: scores.clarityScore,
    confidenceScore: scores.confidenceScore,
    geminiReasoning: scores.feedback,
  });
});

// ---------------------------------------------------------------------------
// POST /api/score  +  POST /api/scoring/score-response
// Standalone scoring (does NOT persist). Response matches OpenAPI ScoreResult.
// ---------------------------------------------------------------------------
async function handleStandaloneScore(req: Request, res: Response): Promise<void> {
  const schema = z.object({
    trade: z.string(),
    questionText: z.string(),
    transcript: z.string(),
    language: z.string().optional().default("en"),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const { trade, questionText, transcript, language } = parsed.data;

  try {
    const scores = await scoreResponse(questionText, transcript, language as "kn" | "hi" | "en", trade);
    res.json({
      relevance: scores.relevanceScore,
      clarity: scores.clarityScore,
      confidence: scores.confidenceScore,
      languageDetected: scores.languageDetected ?? language,
      reasoning: scores.feedback,
    });
  } catch (err) {
    req.log?.warn({ err }, "Gemini scoring failed");
    res.json({
      relevance: 5,
      clarity: 5,
      confidence: 5,
      languageDetected: language,
      reasoning: "Auto-scored",
    });
  }
}

router.post("/score", handleStandaloneScore);
router.post("/scoring/score-response", handleStandaloneScore);

// ---------------------------------------------------------------------------
// Helper: Calculate similarity between two strings (for duplicate response detection)
// ---------------------------------------------------------------------------
function stringSimilarity(s1: string, s2: string): number {
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  if (longer.length === 0) return 1.0;
  const editDistance = getEditDistance(longer, shorter);
  return (longer.length - editDistance) / longer.length;
}

function getEditDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// Helper: Analyze for suspicious patterns in responses
async function analyzeSuspiciousPatterns(
  responses: typeof responsesTable.$inferSelect[],
  trade: string
): Promise<string[]> {
  const flags: string[] = [];

  // Check for low word count (too brief)
  const wordCounts = responses.map((r) => r.transcript.trim().split(/\s+/).length);
  if (wordCounts.some((w) => w < 3)) flags.push("very_short_response");

  // Check for high similarity (possible copying)
  if (responses.length > 1) {
    for (let i = 0; i < responses.length; i++) {
      for (let j = i + 1; j < responses.length; j++) {
        const similarity = stringSimilarity(responses[i].transcript, responses[j].transcript);
        if (similarity > 0.85) {
          flags.push("highly_similar_responses");
          break;
        }
      }
      if (flags.includes("highly_similar_responses")) break;
    }
  }

  // Check for inconsistent trade knowledge claims
  if (trade === "Electrician" && responses.some(r => r.transcript.toLowerCase().includes("i don't know anything"))) {
    flags.push("no_trade_knowledge");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// POST /api/interviews/:id/classify  +  POST /api/scoring/classify/:interviewId
// ---------------------------------------------------------------------------
async function handleClassifyInterview(req: Request, res: Response): Promise<void> {
  const raw = req.params["interviewId"] ?? req.params["id"];
  const sid = Array.isArray(raw) ? raw[0] : raw;
  const interviewId = parseInt(sid ?? "", 10);
  if (isNaN(interviewId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const responses = await db
    .select()
    .from(responsesTable)
    .where(eq(responsesTable.interviewId, interviewId));

  if (responses.length === 0) {
    const [existingEmpty] = await db
      .select()
      .from(classificationsTable)
      .where(eq(classificationsTable.interviewId, interviewId));
    const row = existingEmpty
      ? (
          await db
            .update(classificationsTable)
            .set({ category: "poor_quality", avgScore: 0, reasoning: "No responses found" })
            .where(eq(classificationsTable.interviewId, interviewId))
            .returning()
        )[0]
      : (
          await db
            .insert(classificationsTable)
            .values({ interviewId, category: "poor_quality", avgScore: 0, reasoning: "No responses found" })
            .returning()
        )[0];
    res.json(row);
    return;
  }

  // Wait for all responses to have scores (async processing may still be running)
  const maxWaitTime = 30000; // 30 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    const currentResponses = await db
      .select()
      .from(responsesTable)
      .where(eq(responsesTable.interviewId, interviewId));

    const allScored = currentResponses.every(
      (r) => r.relevanceScore !== null && r.clarityScore !== null && r.confidenceScore !== null
    );

    if (allScored) {
      // Refresh responses with scores
      responses.splice(0, responses.length, ...currentResponses);
      break;
    }

    // Wait 1 second before checking again
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // All responses now have scores (set during submit). Compute avg.
  const scored = responses.filter(
    (r) => r.relevanceScore !== null && r.clarityScore !== null && r.confidenceScore !== null
  );

  let avgScore = 5;
  if (scored.length > 0) {
    const sum = scored.reduce((acc, r) => {
      return acc + ((r.relevanceScore ?? 5) + (r.clarityScore ?? 5) + (r.confidenceScore ?? 5)) / 3;
    }, 0);
    avgScore = sum / scored.length;
  }

  const [integrity] = await db
    .select()
    .from(integrityChecksTable)
    .where(eq(integrityChecksTable.interviewId, interviewId));

  const flags = [...(integrity?.flags ?? [])];
  const facePct = integrity?.facePresentPct ?? 1;

  if (integrity?.duplicateCandidateId) {
    flags.push("suspected_duplicate");
  }

  const [interview] = await db
    .select()
    .from(interviewsTable)
    .where(eq(interviewsTable.id, interviewId));

  const [candidate] = interview
    ? await db.select().from(candidatesTable).where(eq(candidatesTable.id, interview.candidateId))
    : [];

  // Analyze for suspicious patterns
  const suspiciousFlags = await analyzeSuspiciousPatterns(responses, candidate?.trade ?? "");
  flags.push(...suspiciousFlags);

  let category = "manual_verification";
  let reasoning = "Manual review required";

  try {
    const transcripts = responses
      .map((r, i) => `Q${i + 1}: ${r.questionText}\nA: ${r.transcript}\nScores — Relevance: ${r.relevanceScore ?? "?"}, Clarity: ${r.clarityScore ?? "?"}, Confidence: ${r.confidenceScore ?? "?"}`)
      .join("\n\n");

    const prompt = `Classify this Karnataka blue-collar candidate for government job assessment.

Trade: ${candidate?.trade ?? "Unknown"}, Language: ${candidate?.language ?? "en"}
Avg score: ${avgScore.toFixed(1)}/10, Face present: ${Math.round((facePct ?? 1) * 100)}%
Integrity flags: ${flags.join(", ") || "none"}
Response count: ${responses.length}

Interview:
${transcripts}

RULES for classification:
1. If any "suspected_duplicate" or "repeat_attempt" flag exists → category must be "suspected_duplicate"
2. If any integrity flag (very_short_response, highly_similar_responses, no_trade_knowledge) → manual_verification
3. If avg score ≥ 7.5 AND face >= 80% AND clean integrity → job_ready
4. If avg score 4–7 AND clean integrity → requires_training  
5. If avg score < 3 OR face < 40% OR too few responses → poor_quality
6. Otherwise → manual_verification

Categories:
- job_ready: avg score ≥ 7.5, clean background
- requires_training: score 4–7, genuine candidate with skill gaps
- manual_verification: borderline or ambiguous responses (default if unsure)
- poor_quality: very low scores, insufficient face detection, very short responses
- suspected_duplicate: fraud indicators present

Return ONLY valid JSON:
{"category": "<category>", "reasoning": "<2 sentence explanation>"}`;

    const parsed = await generateGeminiJson<{ category?: string; reasoning?: string }>(prompt);
    category = parsed.category ?? category;
    reasoning = parsed.reasoning ?? reasoning;
  } catch (err) {
    req.log?.warn({ err }, "Gemini classification failed — using rule-based fallback");
    // Rule-based fallback using actual persisted scores and flags
    if (flags.includes("suspected_duplicate") || flags.includes("repeat_attempt")) {
      category = "suspected_duplicate";
      reasoning = "Duplicate or repeat signals detected. Requires human review and verification.";
    } else if (flags.length > 0) {
      category = "manual_verification";
      reasoning = `Integrity concerns detected: ${flags.slice(0, 2).join(", ")}. Officer review recommended.`;
    } else if (avgScore >= 7.5 && (facePct ?? 1) >= 0.8) {
      category = "job_ready";
      reasoning = `Strong performance demonstrated. Average score: ${avgScore.toFixed(1)}/10. Ready for employment.`;
    } else if (avgScore >= 4 && avgScore < 7) {
      category = "requires_training";
      reasoning = `Moderate performance. Average score: ${avgScore.toFixed(1)}/10. Suitable for training programs.`;
    } else if (avgScore < 3 || responses.length < 2 || (facePct ?? 1) < 0.4) {
      category = "poor_quality";
      reasoning = `Insufficient response quality. Score: ${avgScore.toFixed(1)}/10. Request re-submission.`;
    } else {
      category = "manual_verification";
      reasoning = `Borderline performance. Average score: ${avgScore.toFixed(1)}/10. Manual verification required.`;
    }
  }

  // Guard against invalid category strings from Gemini
  const validCategories = ["job_ready", "requires_training", "manual_verification", "poor_quality", "suspected_duplicate"];
  if (!validCategories.includes(category)) {
    category = "manual_verification";
    reasoning = `Classification uncertain. Score: ${avgScore.toFixed(1)}/10. Officer review recommended.`;
  }

  const [existingCls] = await db
    .select()
    .from(classificationsTable)
    .where(eq(classificationsTable.interviewId, interviewId));

  const cls = existingCls
    ? (
        await db
          .update(classificationsTable)
          .set({
            category,
            avgScore,
            reasoning,
            flaggedForReview: ["manual_verification", "poor_quality", "suspected_duplicate"].includes(category),
          })
          .where(eq(classificationsTable.interviewId, interviewId))
          .returning()
      )[0]
    : (
        await db
          .insert(classificationsTable)
          .values({
            interviewId,
            category,
            avgScore,
            reasoning,
            flaggedForReview: ["manual_verification", "poor_quality", "suspected_duplicate"].includes(category),
          })
          .returning()
      )[0];

  // Send WhatsApp notification with results
  if (candidate?.phone) {
    await whatsAppService.sendResults(candidate.phone, category, avgScore, candidate.language);
  }

  res.json(cls);
}

router.post("/interviews/:id/classify", handleClassifyInterview);
router.post("/scoring/classify/:interviewId", handleClassifyInterview);

export default router;
