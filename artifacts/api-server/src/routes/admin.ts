import { Router, type Request, type Response } from "express";
import { eq, desc, and } from "drizzle-orm";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "../lib/db";
import {
  adminUsersTable,
  candidatesTable,
  officerActionsTable,
  classificationsTable,
  interviewsTable,
  responsesTable,
  integrityChecksTable,
  userProfilesTable,
  userDocumentsTable,
} from "@workspace/db";
import {
  AdminLoginBody,
  CreateOfficerActionBody,
} from "@workspace/api-zod";
import { requireAdmin } from "../middleware/requireAdmin";
import { adminLoginLimiter } from "../middleware/rateLimits";
import { getPoolForTradeAndLanguage } from "../lib/question-bank";
import { generateGeminiJson } from "../lib/gemini";

const router = Router();

function demoCredentials(): { username: string; password: string; role: string } {
  return {
    username: process.env["ADMIN_USERNAME"] ?? "admin",
    password: process.env["ADMIN_PASSWORD"] ?? "admin123",
    role: process.env["ADMIN_ROLE"] ?? "officer",
  };
}

/** POST /admin/login — DB users (see seed:admin) first; env demo fallback for bootstrap */
router.post("/admin/login", adminLoginLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = AdminLoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid credentials format" });
    return;
  }

  const { username, password } = parsed.data;

  const [dbUser] = await db
    .select()
    .from(adminUsersTable)
    .where(eq(adminUsersTable.username, username))
    .limit(1);

  if (dbUser) {
    const ok = await bcrypt.compare(password, dbUser.passwordHash);
    if (ok) {
      req.session.adminUsername = dbUser.username;
      req.session.adminRole = dbUser.role;
      res.json({ success: true, username: dbUser.username });
      return;
    }
    res.status(401).json({ error: "Invalid username or password" });
    return;
  }

  const demo = demoCredentials();
  if (username === demo.username && password === demo.password) {
    req.session.adminUsername = username;
    req.session.adminRole = demo.role;
    res.json({ success: true, username });
    return;
  }

  res.status(401).json({ error: "Invalid username or password" });
});

/** POST /admin/logout */
router.post("/admin/logout", requireAdmin, (req: Request, res: Response): void => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

/** GET /admin/me */
router.get("/admin/me", requireAdmin, (req: Request, res: Response): void => {
  res.json({
    username: req.session.adminUsername!,
    role: req.session.adminRole ?? "officer",
  });
});

/** GET /admin/questions-pool — advanced: full pool preview (officers / QA; not required for candidates) */
router.get("/admin/questions-pool", requireAdmin, (req: Request, res: Response): void => {
  const trade = req.query["trade"] as string | undefined;
  const language = req.query["language"] as string | undefined;
  const limit = Math.min(500, Math.max(1, parseInt(req.query["limit"] as string || "100", 10)));

  if (!trade || !language) {
    res.status(400).json({ error: "trade and language are required" });
    return;
  }

  const pool = getPoolForTradeAndLanguage(trade, language);
  res.json(
    pool.slice(0, limit).map((q) => ({
      id: q.id,
      text: q.text,
      trade: q.trade,
      language: q.language,
      category: q.category,
    }))
  );
});

/** POST /admin/actions */
router.post("/admin/actions", requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateOfficerActionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid action body", issues: parsed.error.issues });
    return;
  }

  const { candidateId, interviewId, action, notes } = parsed.data;

  const [candidate] = await db
    .select({ id: candidatesTable.id })
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candidateId))
    .limit(1);

  if (!candidate) {
    res.status(404).json({ error: "Candidate not found" });
    return;
  }

  const [row] = await db
    .insert(officerActionsTable)
    .values({
      candidateId,
      interviewId: interviewId ?? null,
      action,
      officerUsername: req.session.adminUsername!,
      notes: notes ?? null,
    })
    .returning();

  let resolvedInterviewId = interviewId;
  if (resolvedInterviewId == null) {
    const [latestIv] = await db
      .select({ id: interviewsTable.id })
      .from(interviewsTable)
      .where(eq(interviewsTable.candidateId, candidateId))
      .orderBy(desc(interviewsTable.id))
      .limit(1);
    resolvedInterviewId = latestIv?.id ?? null;
  }

  if (resolvedInterviewId != null) {
    if (action === "request_reinterview") {
      await db.delete(responsesTable).where(eq(responsesTable.interviewId, resolvedInterviewId));
      await db.delete(classificationsTable).where(eq(classificationsTable.interviewId, resolvedInterviewId));
      await db.delete(integrityChecksTable).where(eq(integrityChecksTable.interviewId, resolvedInterviewId));
      await db
        .update(interviewsTable)
        .set({ status: "in_progress", completedAt: null })
        .where(eq(interviewsTable.id, resolvedInterviewId));
    }

    if (action === "shortlist") {
      await db
        .update(classificationsTable)
        .set({
          category: "job_ready",
          reviewedBy: req.session.adminUsername!,
          reviewedAt: new Date(),
        })
        .where(eq(classificationsTable.interviewId, resolvedInterviewId));
    }

    if (action === "send_to_training") {
      await db
        .update(classificationsTable)
        .set({
          category: "requires_training",
          reviewedBy: req.session.adminUsername!,
          reviewedAt: new Date(),
        })
        .where(eq(classificationsTable.interviewId, resolvedInterviewId));
    }
  }

  const [updatedCandidate] = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.id, candidateId))
    .limit(1);

  res.status(201).json({ action: row, candidate: updatedCandidate ?? null });
});

/** POST /admin/interviews/:interviewId/feedback/generate */
router.post(
  "/admin/interviews/:interviewId/feedback/generate",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params["interviewId"];
    const interviewId = parseInt(Array.isArray(rawId) ? rawId[0]! : rawId, 10);
    if (Number.isNaN(interviewId)) {
      res.status(400).json({ error: "Invalid interview id" });
      return;
    }

    const [interview] = await db
      .select()
      .from(interviewsTable)
      .where(eq(interviewsTable.id, interviewId))
      .limit(1);

    if (!interview) {
      res.status(404).json({ error: "Interview not found" });
      return;
    }

    const [candidate] = await db
      .select()
      .from(candidatesTable)
      .where(eq(candidatesTable.id, interview.candidateId))
      .limit(1);

    const [classification] = await db
      .select()
      .from(classificationsTable)
      .where(eq(classificationsTable.interviewId, interviewId))
      .limit(1);

    if (!candidate || !classification) {
      res.status(400).json({ error: "Candidate or classification is not ready yet" });
      return;
    }

    const responses = await db
      .select()
      .from(responsesTable)
      .where(eq(responsesTable.interviewId, interviewId))
      .orderBy(responsesTable.id);

    const responseSummary = responses
      .map((response, index) =>
        `Q${index + 1}: ${response.questionText}
A: ${response.transcript}
Scores: relevance ${response.relevanceScore ?? "-"}, clarity ${response.clarityScore ?? "-"}, confidence ${response.confidenceScore ?? "-"}
AI note: ${response.geminiReasoning ?? "-"}`,
      )
      .join("\n\n");

    const prompt = `Create officer-review feedback for a Karnataka SkillFit interview.

Candidate trade: ${candidate.trade}
Candidate language: ${candidate.language}
Classification: ${classification.category}
Average score: ${classification.avgScore.toFixed(1)}/10
AI classification reasoning: ${classification.reasoning}

Interview responses:
${responseSummary}

Return ONLY valid JSON:
{
  "feedback": "2-4 sentences of clear candidate-facing feedback",
  "comments": "1-2 sentences for officer/admin context",
  "recommendations": "2-3 practical next steps or training recommendations"
}`;

    let generated = {
      feedback: classification.reasoning,
      comments: "AI-generated draft created for officer review.",
      recommendations: "Review the candidate responses and approve a suitable next step.",
    };

    try {
      generated = await generateGeminiJson<typeof generated>(prompt, 0.35);
    } catch {
      // Keep the deterministic fallback above.
    }

    const [updated] = await db
      .update(classificationsTable)
      .set({
        aiFeedback: generated.feedback,
        recommendations: generated.recommendations,
      })
      .where(eq(classificationsTable.id, classification.id))
      .returning();

    res.json({
      feedback: generated.feedback,
      comments: generated.comments,
      recommendations: generated.recommendations,
      classification: updated ?? classification,
    });
  },
);

/** PUT /admin/interviews/:interviewId/feedback */
router.put(
  "/admin/interviews/:interviewId/feedback",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params["interviewId"];
    const interviewId = parseInt(Array.isArray(rawId) ? rawId[0]! : rawId, 10);
    if (Number.isNaN(interviewId)) {
      res.status(400).json({ error: "Invalid interview id" });
      return;
    }

    const parsed = z.object({
      adminFeedback: z.string().optional().nullable(),
      adminComments: z.string().optional().nullable(),
      recommendations: z.string().optional().nullable(),
    }).safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({ error: "Invalid feedback body", issues: parsed.error.issues });
      return;
    }

    const [updated] = await db
      .update(classificationsTable)
      .set({
        adminFeedback: parsed.data.adminFeedback ?? null,
        adminComments: parsed.data.adminComments ?? null,
        recommendations: parsed.data.recommendations ?? null,
        reviewedBy: req.session.adminUsername!,
        reviewedAt: new Date(),
      })
      .where(eq(classificationsTable.interviewId, interviewId))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Classification not found" });
      return;
    }

    res.json(updated);
  },
);

/** GET /admin/actions/:candidateId */
router.get(
  "/admin/actions/:candidateId",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params["candidateId"];
    const candidateId = parseInt(Array.isArray(rawId) ? rawId[0]! : rawId, 10);
    if (Number.isNaN(candidateId)) {
      res.status(400).json({ error: "Invalid candidate id" });
      return;
    }

    const rows = await db
      .select()
      .from(officerActionsTable)
      .where(eq(officerActionsTable.candidateId, candidateId))
      .orderBy(desc(officerActionsTable.createdAt));

    res.json(rows);
  },
);

/** GET /admin/candidate/:id/full — Rich candidate detail for admin view */
router.get(
  "/admin/candidate/:id/full",
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const rawId = req.params["id"];
    const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId ?? "0", 10);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const [candidate] = await db
      .select()
      .from(candidatesTable)
      .where(eq(candidatesTable.id, id))
      .limit(1);

    if (!candidate) {
      res.status(404).json({ error: "Candidate not found" });
      return;
    }

    // All interviews newest first
    const interviews = await db
      .select()
      .from(interviewsTable)
      .where(eq(interviewsTable.candidateId, id))
      .orderBy(desc(interviewsTable.id));

    const enrichedInterviews = await Promise.all(
      interviews.map(async (iv) => {
        const responses = await db
          .select()
          .from(responsesTable)
          .where(eq(responsesTable.interviewId, iv.id))
          .orderBy(responsesTable.id);
        const [classification] = await db
          .select()
          .from(classificationsTable)
          .where(eq(classificationsTable.interviewId, iv.id))
          .orderBy(desc(classificationsTable.id))
          .limit(1);
        const [integrity] = await db
          .select()
          .from(integrityChecksTable)
          .where(eq(integrityChecksTable.interviewId, iv.id))
          .limit(1);
        return { ...iv, responses, classification: classification ?? null, integrity: integrity ?? null };
      })
    );

    const officerActions = await db
      .select()
      .from(officerActionsTable)
      .where(eq(officerActionsTable.candidateId, id))
      .orderBy(desc(officerActionsTable.createdAt));

    // Try to link user profile by phone
    const [userProfile] = await db
      .select()
      .from(userProfilesTable)
      .where(eq(userProfilesTable.mobileNumber, candidate.phone))
      .limit(1);

    let userDocuments: (typeof userDocumentsTable.$inferSelect)[] = [];
    if (userProfile) {
      userDocuments = await db
        .select()
        .from(userDocumentsTable)
        .where(eq(userDocumentsTable.userProfileId, userProfile.id))
        .orderBy(desc(userDocumentsTable.createdAt));
    }

    res.json({
      ...candidate,
      interviews: enrichedInterviews,
      officerActions,
      userProfile: userProfile ?? null,
      userDocuments,
    });
  },
);

export default router;
