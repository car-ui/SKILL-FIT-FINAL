import { scoringQueue } from "../lib/queues";
import { db } from "../lib/db";
import { responsesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { scoreResponse } from "../lib/gemini";

scoringQueue.process(async (job) => {
  const { responseId, trade, questionText, transcript, language } = job.data as {
    responseId: number;
    trade: string;
    questionText: string;
    transcript: string;
    language: "kn" | "hi" | "en";
  };

  const [existing] = await db
    .select({
      relevanceScore: responsesTable.relevanceScore,
      clarityScore: responsesTable.clarityScore,
      confidenceScore: responsesTable.confidenceScore,
      geminiReasoning: responsesTable.geminiReasoning,
    })
    .from(responsesTable)
    .where(eq(responsesTable.id, responseId));

  if (
    existing?.relevanceScore !== null &&
    existing?.clarityScore !== null &&
    existing?.confidenceScore !== null &&
    existing?.geminiReasoning &&
    !existing.geminiReasoning.toLowerCase().includes("fallback")
  ) {
    return existing;
  }

  const scores = await scoreResponse(questionText, transcript, language, trade);

  await db
    .update(responsesTable)
    .set({
      relevanceScore: scores.relevanceScore,
      clarityScore: scores.clarityScore,
      confidenceScore: scores.confidenceScore,
      geminiReasoning: scores.feedback,
      languageDetected: scores.languageDetected ?? language,
    })
    .where(eq(responsesTable.id, responseId));

  return scores;
});
