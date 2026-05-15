/**
 * assess.ts — interview classification logic
 * FIX: flaggedForReview now persists correctly (schema was missing the column).
 */
import { db } from "./db";
import {
  responsesTable,
  integrityChecksTable,
  classificationsTable,
  interviewsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface ClassificationResult {
  category: string;
  avgScore: number;
  reasoning: string;
  flaggedForReview: boolean;
}

export async function classifyInterview(interviewId: number): Promise<ClassificationResult> {
  try {
    const responses = await db.select().from(responsesTable).where(eq(responsesTable.interviewId, interviewId));

    if (responses.length === 0) {
      logger.warn({ interviewId }, "No responses found");
      const result = { category: "manual_verification", avgScore: 0, reasoning: "No responses found.", flaggedForReview: true };
      await db.insert(classificationsTable).values({ interviewId, ...result });
      return result;
    }

    let total = 0;
    responses.forEach((r) => {
      total += ((r.relevanceScore ?? 5) + (r.clarityScore ?? 5) + (r.confidenceScore ?? 5)) / 3;
    });
    const avgScore = total / responses.length;

    const [integrityCheck] = await db.select().from(integrityChecksTable).where(eq(integrityChecksTable.interviewId, interviewId));
    const flags = integrityCheck?.flags ?? [];
    const hasDuplicateFlag = flags.includes("suspected_duplicate") || (integrityCheck?.duplicateCandidateId ?? null) !== null;

    async function save(result: ClassificationResult) {
      await db.insert(classificationsTable).values({ interviewId, category: result.category, avgScore: result.avgScore, reasoning: result.reasoning, flaggedForReview: result.flaggedForReview });
      logger.info({ interviewId, category: result.category }, "Interview classified");
      return result;
    }

    if (hasDuplicateFlag) return save({ category: "suspected_duplicate", avgScore, reasoning: "Flagged as potential duplicate or suspicious activity.", flaggedForReview: true });

    const shortCount = responses.filter((r) => (r.transcript?.trim() ?? "").length < 10).length;
    if ((shortCount / responses.length) * 100 > 50) return save({ category: "poor_quality", avgScore, reasoning: `${Math.round((shortCount / responses.length) * 100)}% responses too short. Re-invite candidate.`, flaggedForReview: true });

    if (avgScore >= 7.0 && flags.length === 0) return save({ category: "job_ready", avgScore, reasoning: `Strong performance — avg ${avgScore.toFixed(1)}/10 across ${responses.length} questions.`, flaggedForReview: false });

    if (avgScore >= 4.0 && avgScore < 7.0 && flags.length === 0) return save({ category: "requires_training", avgScore, reasoning: `Moderate performance (${avgScore.toFixed(1)}/10). Needs skill development.`, flaggedForReview: false });

    const flagReason = avgScore < 4.0 ? "Low performance score." : flags.length > 0 ? `Integrity flags: ${flags.join(", ")}` : "Does not match standard criteria.";
    return save({ category: "manual_verification", avgScore, reasoning: `Manual review needed. ${flagReason}`, flaggedForReview: true });
  } catch (error) {
    logger.error({ error, interviewId }, "Error classifying interview");
    throw error;
  }
}
