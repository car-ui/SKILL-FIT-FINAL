import { Router, type IRouter } from "express";
import { db } from "../lib/db";
import {
  candidatesTable,
  interviewsTable,
  classificationsTable,
  officerActionsTable,
  integrityChecksTable,
} from "@workspace/db";
import { eq, sql, ilike, and, or, desc } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "../middleware/requireAdmin";
import { registerCandidateLimiter } from "../middleware/rateLimits";
import { whatsAppService } from "../lib/whatsapp";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Helper: Calculate cosine similarity between two embeddings
// ---------------------------------------------------------------------------
function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) return 0;
  
  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    magnitudeA += vecA[i] * vecA[i];
    magnitudeB += vecB[i] * vecB[i];
  }
  
  magnitudeA = Math.sqrt(magnitudeA);
  magnitudeB = Math.sqrt(magnitudeB);
  
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

// ---------------------------------------------------------------------------
// Helper: Perform duplicate detection on new candidate
// ---------------------------------------------------------------------------
async function detectDuplicates(
  candidateId: number,
  phone: string,
  deviceFingerprint: string | null | undefined,
  faceEmbeddingStr: string | null | undefined
) {
  const flags: string[] = [];
  let phoneReuse = false;
  let deviceReuse = false;
  let faceMatchScore: number | null = null;
  let duplicateCandidateId: number | null = null;

  try {
    // Check phone reuse (excluding self)
    const [existingPhoneCandidate] = await db
      .select({ id: candidatesTable.id })
      .from(candidatesTable)
      .where(and(eq(candidatesTable.phone, phone), sql`id != ${candidateId}`))
      .limit(1);

    if (existingPhoneCandidate) {
      phoneReuse = true;
      flags.push("phone_reuse");
    }

    // Check device fingerprint reuse (if provided)
    if (deviceFingerprint) {
      const [existingDeviceCandidate] = await db
        .select({ id: candidatesTable.id })
        .from(candidatesTable)
        .where(
          and(
            eq(candidatesTable.deviceFingerprint, deviceFingerprint),
            sql`id != ${candidateId}`
          )
        )
        .limit(1);

      if (existingDeviceCandidate) {
        deviceReuse = true;
        flags.push("device_reuse");
      }
    }

    // Check face embedding similarity (if provided)
    if (faceEmbeddingStr) {
      try {
        const newEmbedding = JSON.parse(faceEmbeddingStr) as number[];
        
        // Get all existing candidates with face embeddings
        const existingCandidates = await db
          .select({ id: candidatesTable.id, faceEmbedding: candidatesTable.faceEmbedding })
          .from(candidatesTable)
          .where(sql`id != ${candidateId} AND face_embedding IS NOT NULL`);

        // Compare against each existing embedding
        for (const existing of existingCandidates) {
          if (!existing.faceEmbedding) continue;
          
          try {
            const existingEmbedding = JSON.parse(existing.faceEmbedding) as number[];
            const similarity = cosineSimilarity(newEmbedding, existingEmbedding);

            if (similarity > 0.85) {
              faceMatchScore = similarity;
              duplicateCandidateId = existing.id;
              flags.push("suspected_duplicate");
              logger.warn(
                { candidateId, duplicateCandidateId: existing.id, similarity },
                "High face embedding similarity detected"
              );
              break; // Stop at first high match
            }
          } catch (e) {
            logger.warn({ error: e, existingId: existing.id }, "Failed to parse existing face embedding");
          }
        }
      } catch (e) {
        logger.warn({ error: e }, "Failed to parse face embedding");
      }
    }

    return { flags, phoneReuse, deviceReuse, faceMatchScore, duplicateCandidateId };
  } catch (error) {
    logger.error({ error, candidateId }, "Error detecting duplicates");
    return { flags: [], phoneReuse: false, deviceReuse: false, faceMatchScore: null, duplicateCandidateId: null };
  }
}

// POST /api/candidates/whatsapp-register
// Register candidate and send WhatsApp interview link
router.post("/candidates/whatsapp-register", registerCandidateLimiter, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
    district: z.string().min(1),
    trade: z.string().min(1),
    language: z.string().optional().default("en"),
    deviceFingerprint: z.string().optional().nullable(),
    faceEmbedding: z.string().optional().nullable(), // JSON array as string
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { name, district, trade, language, deviceFingerprint, faceEmbedding } = parsed.data;
  const phone = parsed.data.phone.replace(/\D/g, "");
  if (phone.length !== 10) {
    res.status(400).json({ error: "Phone number must be exactly 10 digits." });
    return;
  }

  const [existingPhone] = await db
    .select({ id: candidatesTable.id })
    .from(candidatesTable)
    .where(eq(candidatesTable.phone, phone))
    .limit(1);

  if (existingPhone) {
    res.status(409).json({ error: "A candidate with this phone number is already registered." });
    return;
  }

  // Register candidate
  const [candidate] = await db
    .insert(candidatesTable)
    .values({
      name,
      phone,
      district,
      trade,
      language,
      deviceFingerprint: deviceFingerprint ?? null,
      faceEmbedding: faceEmbedding ?? null,
    })
    .returning();

  // Start interview
  const [interview] = await db
    .insert(interviewsTable)
    .values({ candidateId: candidate.id, status: "in_progress" })
    .returning();

  // Detect duplicates (phone, device, face)
  const duplicationResult = await detectDuplicates(candidate.id, phone, deviceFingerprint, faceEmbedding);

  // Save integrity check with duplicate detection results
  if (
    duplicationResult.phoneReuse ||
    duplicationResult.deviceReuse ||
    duplicationResult.faceMatchScore !== null ||
    duplicationResult.flags.length > 0
  ) {
    await db.insert(integrityChecksTable).values({
      interviewId: interview.id,
      phoneReuse: duplicationResult.phoneReuse,
      deviceReuse: duplicationResult.deviceReuse,
      faceMatchScore: duplicationResult.faceMatchScore,
      duplicateCandidateId: duplicationResult.duplicateCandidateId,
      flags: duplicationResult.flags,
    });
  }

  // Generate interview URL
  const baseUrl = process.env["BASE_URL"] ?? "http://localhost:3000";
  const interviewUrl = `${baseUrl}/interview?token=${interview.id}`;

  // Send WhatsApp message
  const whatsappSent = await whatsAppService.sendInterviewLink(phone, interviewUrl, language);

  res.status(201).json({
    candidate,
    interview,
    interviewUrl,
    whatsappSent,
    duplicateDetected: duplicationResult.flags.length > 0,
  });
});

// POST /api/candidates
// Register candidate (legacy endpoint)
router.post("/candidates", registerCandidateLimiter, async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    phone: z.string().regex(/^\d{10}$/, "Phone number must be exactly 10 digits"),
    district: z.string().min(1),
    trade: z.string().min(1),
    language: z.string().optional().default("en"),
    deviceFingerprint: z.string().optional().nullable(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }

  const { name, district, trade, language, deviceFingerprint } = parsed.data;
  const phone = parsed.data.phone.replace(/\D/g, "");
  if (phone.length !== 10) {
    res.status(400).json({ error: "Phone number must be exactly 10 digits." });
    return;
  }

  const [existingPhone] = await db
    .select({ id: candidatesTable.id })
    .from(candidatesTable)
    .where(eq(candidatesTable.phone, phone))
    .limit(1);

  if (existingPhone) {
    res.status(409).json({ error: "A candidate with this phone number is already registered." });
    return;
  }

  const [candidate] = await db
    .insert(candidatesTable)
    .values({ name, phone, district, trade, language, deviceFingerprint: deviceFingerprint ?? null })
    .returning();

  res.status(201).json(candidate);
});

// GET /api/candidates
router.get("/candidates", requireAdmin, async (req, res) => {
  const page = Math.max(1, parseInt(req.query["page"] as string || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query["limit"] as string || "20", 10)));
  const offset = (page - 1) * limit;

  const searchQuery = req.query["search"];
  const tradeQuery = req.query["trade"];
  const districtQuery = req.query["district"];
  const languageQuery = req.query["language"];
  const classificationQuery = req.query["classification"];

  const search = typeof searchQuery === "string" ? searchQuery : undefined;
  const trade = typeof tradeQuery === "string" ? tradeQuery : undefined;
  const district = typeof districtQuery === "string" ? districtQuery : undefined;
  const language = typeof languageQuery === "string" ? languageQuery : undefined;
  const classification = typeof classificationQuery === "string" ? classificationQuery : undefined;

  const conditions = [];
  if (search) {
    conditions.push(or(ilike(candidatesTable.name, `%${search}%`), ilike(candidatesTable.phone, `%${search}%`)));
  }
  if (trade) conditions.push(eq(candidatesTable.trade, trade));
  if (district) conditions.push(eq(candidatesTable.district, district));
  if (language) conditions.push(eq(candidatesTable.language, language));

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
  const classificationFilter = classification;
  const classificationClause = classificationFilter ? eq(classificationsTable.category, classificationFilter as string) : undefined;

  const candidatesRaw = await db
    .select({
      id: candidatesTable.id,
      name: candidatesTable.name,
      phone: candidatesTable.phone,
      district: candidatesTable.district,
      trade: candidatesTable.trade,
      language: candidatesTable.language,
      createdAt: candidatesTable.createdAt,
      interviewStatus: interviewsTable.status,
      classificationCategory: classificationsTable.category,
      avgScore: classificationsTable.avgScore,
    })
    .from(candidatesTable)
    .leftJoin(interviewsTable, eq(interviewsTable.candidateId, candidatesTable.id))
    .leftJoin(classificationsTable, eq(classificationsTable.interviewId, interviewsTable.id))
    .where(
      classificationClause
        ? and(whereClause, classificationClause)
        : whereClause
    )
    .orderBy(sql`${candidatesTable.createdAt} desc`)
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(candidatesTable)
    .leftJoin(interviewsTable, eq(interviewsTable.candidateId, candidatesTable.id))
    .leftJoin(classificationsTable, eq(classificationsTable.interviewId, interviewsTable.id))
    .where(
      classificationClause
        ? and(whereClause, classificationClause)
        : whereClause
    );

  const candidates = candidatesRaw.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    district: c.district,
    trade: c.trade,
    language: c.language,
    createdAt: c.createdAt,
    interviewStatus: c.interviewStatus,
    classification: c.classificationCategory,
    avgScore: c.avgScore,
  }));

  const candidatesWithActions = await Promise.all(
    candidates.map(async (candidate) => {
      const [lastAction] = await db
        .select({
          action: officerActionsTable.action,
          officerUsername: officerActionsTable.officerUsername,
          createdAt: officerActionsTable.createdAt,
        })
        .from(officerActionsTable)
        .where(eq(officerActionsTable.candidateId, candidate.id))
        .orderBy(desc(officerActionsTable.createdAt))
        .limit(1);

      return { ...candidate, lastAction: lastAction ?? null };
    }),
  );

  const [completedRow] = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(interviewsTable)
    .where(eq(interviewsTable.status, "completed"));

  res.json({
    candidates: candidatesWithActions,
    total: totalResult[0]?.count ?? 0,
    completedInterviews: completedRow?.count ?? 0,
    page,
    limit,
  });
});

// GET /api/candidates/:id
router.get("/candidates/:id", requireAdmin, async (req, res) => {
  const idParam = req.params["id"];
  const id = parseInt(Array.isArray(idParam) ? idParam[0] : idParam, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  const [candidate] = await db
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.id, id));

  if (!candidate) { res.status(404).json({ error: "Candidate not found" }); return; }

  const [interview] = await db
    .select()
    .from(interviewsTable)
    .where(eq(interviewsTable.candidateId, id))
    .orderBy(sql`${interviewsTable.createdAt} desc`)
    .limit(1);

  let interviewData = null;
  let classificationData = null;
  let integrityData = null;

  if (interview) {
    const { responsesTable, integrityChecksTable } = await import("@workspace/db");

    const responses = await db
      .select()
      .from(responsesTable)
      .where(eq(responsesTable.interviewId, interview.id))
      .orderBy(responsesTable.id);

    const [integrity] = await db
      .select()
      .from(integrityChecksTable)
      .where(eq(integrityChecksTable.interviewId, interview.id));

    const [cls] = await db
      .select()
      .from(classificationsTable)
      .where(eq(classificationsTable.interviewId, interview.id))
      .orderBy(desc(classificationsTable.id))
      .limit(1);

    interviewData = { ...interview, responses };
    integrityData = integrity ?? null;
    classificationData = cls ?? null;
  }

  const officerActions = await db
    .select()
    .from(officerActionsTable)
    .where(eq(officerActionsTable.candidateId, id))
    .orderBy(desc(officerActionsTable.createdAt));

  res.json({
    ...candidate,
    interview: interviewData,
    classification: classificationData,
    integrityCheck: integrityData,
    officerActions,
  });
});

export default router;
