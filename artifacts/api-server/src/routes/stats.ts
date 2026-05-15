/**
 * stats.ts
 * FIX: review-queue now filters by flaggedForReview=true (was always returning empty).
 * FIX: pendingReviewCount in dashboard now counts flaggedForReview correctly.
 */
import { Router, type IRouter } from "express";
import { db } from "../lib/db";
import { candidatesTable, interviewsTable, classificationsTable } from "@workspace/db";
import { eq, desc, sql, count, and } from "drizzle-orm";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();

router.get("/stats/dashboard", requireAdmin, async (req, res) => {
  try {
    const [totals] = await db.select({ totalCandidates: count(candidatesTable.id) }).from(candidatesTable);
    const [interviewStats] = await db.select({ completedInterviews: count(interviewsTable.id) }).from(interviewsTable).where(eq(interviewsTable.status, "completed"));
    const classStats = await db.select({ category: classificationsTable.category, cnt: count(classificationsTable.id) }).from(classificationsTable).groupBy(classificationsTable.category);
    const byCategory: Record<string, number> = {};
    classStats.forEach((r) => { byCategory[r.category] = Number(r.cnt); });

    const [pendingRow] = await db
      .select({ cnt: count(classificationsTable.id) })
      .from(classificationsTable)
      .where(
        and(
          eq(classificationsTable.flaggedForReview, true),
          sql`${classificationsTable.interviewId} NOT IN (SELECT DISTINCT interview_id FROM officer_actions WHERE interview_id IS NOT NULL)`
        )
      );

    res.json({
      totalCandidates: Number(totals?.totalCandidates ?? 0),
      completedInterviews: Number(interviewStats?.completedInterviews ?? 0),
      jobReadyCount: byCategory["job_ready"] ?? 0,
      requiresTrainingCount: byCategory["requires_training"] ?? 0,
      manualVerificationCount: byCategory["manual_verification"] ?? 0,
      poorQualityCount: byCategory["poor_quality"] ?? 0,
      suspectedDuplicateCount: byCategory["suspected_duplicate"] ?? 0,
      pendingReviewCount: Number(pendingRow?.cnt ?? 0),
    });
  } catch (err) {
    req.log?.error({ err }, "Dashboard stats failed");
    res.status(500).json({ error: "Failed to load stats" });
  }
});

router.get("/stats/by-trade", requireAdmin, async (_req, res) => {
  try {
    const rows = await db.select({ trade: candidatesTable.trade, total: count(candidatesTable.id) }).from(candidatesTable).groupBy(candidatesTable.trade).orderBy(desc(count(candidatesTable.id)));
    res.json(rows);
  } catch { res.status(500).json({ error: "Failed to load trade stats" }); }
});

router.get("/stats/by-district", requireAdmin, async (_req, res) => {
  try {
    const rows = await db
      .select({
        district: candidatesTable.district,
        total: count(candidatesTable.id),
        avgScore: sql<number>`avg(${classificationsTable.avgScore})`,
        jobReadyCount: sql<number>`sum(case when ${classificationsTable.category} = 'job_ready' then 1 else 0 end)`,
      })
      .from(candidatesTable)
      .leftJoin(interviewsTable, eq(interviewsTable.candidateId, candidatesTable.id))
      .leftJoin(classificationsTable, eq(classificationsTable.interviewId, interviewsTable.id))
      .groupBy(candidatesTable.district)
      .orderBy(desc(count(candidatesTable.id)));
    const enrichedRows = rows.map((row) => ({
      ...row,
      total: Number(row.total ?? 0),
      avgScore: row.avgScore == null ? null : Number(row.avgScore),
      jobReadyPct: Number(row.total ?? 0) > 0 ? (Number(row.jobReadyCount ?? 0) / Number(row.total ?? 0)) * 100 : 0,
    }));
    res.json(enrichedRows);
  } catch { res.status(500).json({ error: "Failed to load district stats" }); }
});

router.get("/stats/recent-activity", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(20, parseInt(String(req.query["limit"] ?? "8"), 10) || 8);
    const rows = await db
      .select({ interviewId: interviewsTable.id, completedAt: interviewsTable.completedAt, candidateName: candidatesTable.name, trade: candidatesTable.trade, district: candidatesTable.district, category: classificationsTable.category, avgScore: classificationsTable.avgScore })
      .from(interviewsTable)
      .innerJoin(candidatesTable, eq(interviewsTable.candidateId, candidatesTable.id))
      .leftJoin(classificationsTable, eq(classificationsTable.interviewId, interviewsTable.id))
      .where(eq(interviewsTable.status, "completed"))
      .orderBy(desc(interviewsTable.completedAt))
      .limit(limit);
    res.json(rows);
  } catch { res.status(500).json({ error: "Failed to load recent activity" }); }
});

router.get("/stats/review-queue", requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(String(req.query["limit"] ?? "10"), 10) || 10);
    const rows = await db
      .select({ candidateId: candidatesTable.id, candidateName: candidatesTable.name, phone: candidatesTable.phone, trade: candidatesTable.trade, district: candidatesTable.district, category: classificationsTable.category, avgScore: classificationsTable.avgScore, reasoning: classificationsTable.reasoning, interviewId: interviewsTable.id, completedAt: interviewsTable.completedAt })
      .from(classificationsTable)
      .innerJoin(interviewsTable, eq(classificationsTable.interviewId, interviewsTable.id))
      .innerJoin(candidatesTable, eq(interviewsTable.candidateId, candidatesTable.id))
      .where(eq(classificationsTable.flaggedForReview, true))
      .orderBy(desc(interviewsTable.completedAt))
      .limit(limit);

    const withPriority = rows.map((r) => ({
      ...r,
      priority: r.category === "suspected_duplicate" ? "high" : r.category === "manual_verification" ? "medium" : "low",
    }));
    res.json(withPriority);
  } catch (err) {
    req.log?.error({ err }, "Review queue failed");
    res.status(500).json({ error: "Failed to load review queue" });
  }
});

export default router;
