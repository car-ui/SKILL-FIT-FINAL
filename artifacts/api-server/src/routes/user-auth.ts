import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";
import { db } from "../lib/db";
import { generateGeminiJson } from "../lib/gemini";
import {
  candidatesTable,
  classificationsTable,
  interviewsTable,
  officerActionsTable,
  responsesTable,
  userDocumentsTable,
  userProfilesTable,
} from "@workspace/db";

const router = Router();
const MOCK_OTP = "123456";
const OTP_TTL_MS = 5 * 60 * 1000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});
const documentUpload = upload.single("file");
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024;
const DOCUMENT_BUCKET = "user-documents";
const ALLOWED_DOCUMENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

const KARNATAKA_DISTRICTS = [
  "Bengaluru Urban",
  "Mysuru",
  "Dharwad",
  "Belagavi",
  "Kalaburagi",
  "Dakshina Kannada",
  "Tumakuru",
  "Shivamogga",
  "Ballari",
  "Mandya",
];

type MockAadhaarProfile = {
  fullName: string;
  gender: string;
  dob: string;
  district: string;
  state: string;
  mobileNumber: string;
  language: "en" | "hi" | "kn";
};

declare module "express-session" {
  interface SessionData {
    userProfileId?: number;
    userLanguage?: string;
    pendingAadhaarVerification?: {
      aadhaarHash: string;
      aadhaarMasked: string;
      otp: string;
      expiresAt: number;
      profile: MockAadhaarProfile;
    };
  }
}

function normalizeAadhaar(input: string) {
  return input.replace(/\D/g, "");
}

function maskAadhaar(aadhaar: string) {
  return `XXXX-XXXX-${aadhaar.slice(-4)}`;
}

function hashAadhaar(aadhaar: string) {
  const pepper =
    process.env["AADHAAR_HASH_PEPPER"] ??
    process.env["SESSION_SECRET"] ??
    "skillfit-dev-aadhaar-pepper";
  return createHash("sha256").update(`${pepper}:${aadhaar}`).digest("hex");
}

function numericSeed(value: string) {
  return value.split("").reduce((sum, digit) => sum + Number(digit), 0);
}

function buildMockProfile(aadhaar: string, language: "en" | "hi" | "kn"): MockAadhaarProfile {
  const seed = numericSeed(aadhaar);
  const names = [
    "Ananya Kumar",
    "Ramesh Gowda",
    "Meera Sharma",
    "Suresh Patil",
    "Kavya Rao",
    "Imran Khan",
    "Talluri Kartheek"
  ];
  const district = KARNATAKA_DISTRICTS[seed % KARNATAKA_DISTRICTS.length] ?? "Bengaluru Urban";
  const year = 1985 + (seed % 18);
  const month = String((seed % 12) + 1).padStart(2, "0");
  const day = String((seed % 27) + 1).padStart(2, "0");
  const mobileSuffix = aadhaar.slice(-9).padStart(9, "0");

  return {
    fullName: names[seed % names.length] ?? "SkillFit User",
    gender: seed % 2 === 0 ? "Female" : "Male",
    dob: `${year}-${month}-${day}`,
    district,
    state: "Karnataka",
    mobileNumber: `9${mobileSuffix}`,
    language,
  };
}

function toProfileResponse(profile: typeof userProfilesTable.$inferSelect) {
  return {
    id: profile.id,
    fullName: profile.fullName,
    aadhaarMasked: profile.aadhaarMasked,
    gender: profile.gender,
    dob: profile.dob,
    district: profile.district,
    state: profile.state,
    mobileNumber: profile.mobileNumber,
    language: profile.language,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastLoginAt: profile.lastLoginAt,
  };
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  hi: "Hindi",
  kn: "Kannada",
};

async function translateClassificationForUser<T extends Record<string, unknown> | null>(
  classification: T,
  language: string,
): Promise<T> {
  if (!classification || !["en", "hi", "kn"].includes(language)) return classification;

  const fields = {
    reasoning: classification["reasoning"],
    aiFeedback: classification["aiFeedback"],
    adminFeedback: classification["adminFeedback"],
    adminComments: classification["adminComments"],
    recommendations: classification["recommendations"],
  };

  const hasText = Object.values(fields).some((value) => typeof value === "string" && value.trim().length > 0);
  if (!hasText) return classification;

  try {
    const translated = await generateGeminiJson<Record<string, string>>(
      `Translate the following user-facing interview feedback fields into ${LANGUAGE_NAMES[language]}.
Return ONLY valid JSON with the same keys. Preserve meaning, tone, trade terms, and numbers. Do not add new advice.

${JSON.stringify(fields)}`,
      0.2,
    );

    return {
      ...classification,
      reasoning: translated["reasoning"] || classification["reasoning"],
      aiFeedback: translated["aiFeedback"] || classification["aiFeedback"],
      adminFeedback: translated["adminFeedback"] || classification["adminFeedback"],
      adminComments: translated["adminComments"] || classification["adminComments"],
      recommendations: translated["recommendations"] || classification["recommendations"],
    };
  } catch {
    return classification;
  }
}

function requireUserProfileId(req: Request, res: Response): number | null {
  if (!req.session.userProfileId) {
    res.status(401).json({ error: "Unauthorized. Please verify Aadhaar." });
    return null;
  }
  return req.session.userProfileId;
}

router.post("/user/auth/request-otp", (req: Request, res: Response): void => {
  const schema = z.object({
    aadhaarNumber: z.string().min(1),
    language: z.enum(["en", "hi", "kn"]).optional().default("en"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid Aadhaar request", details: parsed.error.issues });
    return;
  }

  const aadhaar = normalizeAadhaar(parsed.data.aadhaarNumber);
  if (!/^\d{12}$/.test(aadhaar)) {
    res.status(400).json({ error: "Aadhaar number must be exactly 12 digits." });
    return;
  }

  const aadhaarMasked = maskAadhaar(aadhaar);
  const profile = buildMockProfile(aadhaar, parsed.data.language);

  req.session.pendingAadhaarVerification = {
    aadhaarHash: hashAadhaar(aadhaar),
    aadhaarMasked,
    otp: MOCK_OTP,
    expiresAt: Date.now() + OTP_TTL_MS,
    profile,
  };

  res.json({
    success: true,
    mock: true,
    aadhaarMasked,
    maskedMobile: `XXXXXX${profile.mobileNumber.slice(-4)}`,
    expiresInSeconds: OTP_TTL_MS / 1000,
    demoOtp: MOCK_OTP,
  });
});

router.post("/user/auth/verify-otp", async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    otp: z.string().regex(/^\d{6}$/, "OTP must be 6 digits"),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid OTP", details: parsed.error.issues });
    return;
  }

  const pending = req.session.pendingAadhaarVerification;
  if (!pending) {
    res.status(400).json({ error: "OTP session expired. Please request a new OTP." });
    return;
  }

  if (pending.expiresAt < Date.now()) {
    delete req.session.pendingAadhaarVerification;
    res.status(400).json({ error: "OTP expired. Please request a new OTP." });
    return;
  }

  if (parsed.data.otp !== pending.otp) {
    res.status(401).json({ error: "Incorrect OTP." });
    return;
  }

  const [existingProfile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.aadhaarHash, pending.aadhaarHash))
    .limit(1);

  let isNewUser = false;
  let profile = existingProfile;

  if (profile) {
    const [updated] = await db
      .update(userProfilesTable)
      .set({
        language: pending.profile.language,
        lastLoginAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(userProfilesTable.id, profile.id))
      .returning();
    profile = updated ?? profile;
  } else {
    isNewUser = true;
    const [created] = await db
      .insert(userProfilesTable)
      .values({
        aadhaarHash: pending.aadhaarHash,
        aadhaarMasked: pending.aadhaarMasked,
        fullName: pending.profile.fullName,
        gender: pending.profile.gender,
        dob: pending.profile.dob,
        district: pending.profile.district,
        state: pending.profile.state,
        mobileNumber: pending.profile.mobileNumber,
        language: pending.profile.language,
        lastLoginAt: new Date(),
      })
      .returning();
    profile = created;
  }

  if (!profile) {
    res.status(500).json({ error: "Could not create user profile." });
    return;
  }

  req.session.userProfileId = profile.id;
  req.session.userLanguage = profile.language;
  delete req.session.pendingAadhaarVerification;

  res.json({
    success: true,
    isNewUser,
    profile: toProfileResponse(profile),
  });
});

router.get("/user/me", async (req: Request, res: Response): Promise<void> => {
  const userProfileId = requireUserProfileId(req, res);
  if (!userProfileId) return;

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, userProfileId))
    .limit(1);

  if (!profile) {
    delete req.session.userProfileId;
    res.status(404).json({ error: "User profile not found." });
    return;
  }

  const documents = await db
    .select()
    .from(userDocumentsTable)
    .where(eq(userDocumentsTable.userProfileId, userProfileId))
    .orderBy(desc(userDocumentsTable.createdAt));

  res.json({ profile: toProfileResponse(profile), documents });
});

router.patch("/user/profile", async (req: Request, res: Response): Promise<void> => {
  const userProfileId = requireUserProfileId(req, res);
  if (!userProfileId) return;

  const schema = z.object({
    district: z.string().min(1).optional(),
    state: z.string().min(1).optional(),
    mobileNumber: z.string().regex(/^\d{10}$/).optional(),
    language: z.enum(["en", "hi", "kn"]).optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid profile update", details: parsed.error.issues });
    return;
  }

  const [profile] = await db
    .update(userProfilesTable)
    .set({
      ...parsed.data,
      updatedAt: new Date(),
    })
    .where(eq(userProfilesTable.id, userProfileId))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "User profile not found." });
    return;
  }

  if (profile.language) req.session.userLanguage = profile.language;
  res.json({ profile: toProfileResponse(profile) });
});

router.post("/user/documents", (req: Request, res: Response, next: NextFunction) => {
  documentUpload(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      res.status(400).json({
        error: err.code === "LIMIT_FILE_SIZE" ? "File must be 10 MB or smaller." : err.message,
      });
      return;
    }
    if (err) {
      res.status(400).json({ error: "Could not read uploaded file." });
      return;
    }
    next();
  });
}, async (req: Request, res: Response): Promise<void> => {
  const userProfileId = requireUserProfileId(req, res);
  if (!userProfileId) return;

  const file = req.file;
  if (!file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const categorySchema = z.enum(["work_image", "certificate", "work_proof"]);
  const categoryParsed = categorySchema.safeParse(req.body["category"]);
  if (!categoryParsed.success) {
    res.status(400).json({ error: "Invalid category" });
    return;
  }

  const allowedTypes = categoryParsed.data === "work_image" ? ALLOWED_IMAGE_TYPES : ALLOWED_DOCUMENT_TYPES;
  if (!allowedTypes.has(file.mimetype)) {
    res.status(400).json({
      error:
        categoryParsed.data === "work_image"
          ? "Only JPG, PNG, WEBP, or GIF images can be uploaded for work photos."
          : "Only PDF, JPG, PNG, WEBP, or GIF files can be uploaded.",
    });
    return;
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    res.status(400).json({ error: "File must be 10 MB or smaller." });
    return;
  }

  const [profile] = await db
    .select({ id: userProfilesTable.id })
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, userProfileId))
    .limit(1);

  if (!profile) {
    delete req.session.userProfileId;
    res.status(404).json({ error: "User profile not found." });
    return;
  }

  const supabaseUrl = process.env["SUPABASE_URL"] ?? "";
  const supabaseKey = process.env["SUPABASE_SERVICE_KEY"] ?? process.env["SUPABASE_ANON_KEY"] ?? "";
  const ext = (file.originalname.split(".").pop() ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const objectPath = `${userProfileId}/${randomUUID()}-${Date.now()}.${ext}`;
  let fileUrl = "";

  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(objectPath, file.buffer, { contentType: file.mimetype, upsert: false });

    if (uploadError) {
      res.status(500).json({ error: "File upload failed", detail: uploadError.message });
      return;
    }

    fileUrl = `${supabaseUrl}/storage/v1/object/public/${DOCUMENT_BUCKET}/${objectPath}`;
  } else {
    const uploadRoot = path.resolve(process.cwd(), process.env["UPLOAD_DIR"] ?? "uploads");
    const storageDir = path.join(uploadRoot, DOCUMENT_BUCKET, String(userProfileId));
    await fs.mkdir(storageDir, { recursive: true });
    await fs.writeFile(path.join(uploadRoot, DOCUMENT_BUCKET, objectPath), file.buffer);
    fileUrl = `/uploads/${DOCUMENT_BUCKET}/${objectPath.replace(/\\/g, "/")}`;
  }

  let inserted: typeof userDocumentsTable.$inferSelect | undefined;
  try {
    [inserted] = await db
      .insert(userDocumentsTable)
      .values({
        userProfileId,
        category: categoryParsed.data,
        fileName: file.originalname,
        fileUrl,
        contentType: file.mimetype,
      })
      .returning();
  } catch (err) {
    res.status(500).json({ error: "File was stored but could not be linked to your profile." });
    return;
  }

  if (!inserted) {
    res.status(500).json({ error: "File was stored but could not be linked to your profile." });
    return;
  }

  res.status(201).json({ document: inserted });
});

router.delete("/user/documents/:documentId", async (req: Request, res: Response): Promise<void> => {
  const userProfileId = requireUserProfileId(req, res);
  if (!userProfileId) return;
  const rawId = req.params["documentId"];
  const docId = parseInt(Array.isArray(rawId) ? rawId[0] : rawId ?? "0", 10);
  if (isNaN(docId)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const [doc] = await db
    .select()
    .from(userDocumentsTable)
    .where(and(eq(userDocumentsTable.id, docId), eq(userDocumentsTable.userProfileId, userProfileId)))
    .limit(1);

  if (!doc) {
    res.status(404).json({ error: "Document not found" });
    return;
  }

  await db.delete(userDocumentsTable).where(eq(userDocumentsTable.id, docId));
  res.json({ success: true });
});

router.post("/user/jobs/start-interview", async (req: Request, res: Response): Promise<void> => {
  const userProfileId = requireUserProfileId(req, res);
  if (!userProfileId) return;

  const schema = z.object({
    trade: z.enum(["Electrician", "CNC Operator"]),
    language: z.enum(["en", "hi", "kn"]).optional(),
    deviceFingerprint: z.string().optional().nullable(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid job selection", details: parsed.error.issues });
    return;
  }

  const [profile] = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.id, userProfileId))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "User profile not found." });
    return;
  }

  const language = parsed.data.language ?? profile.language ?? "en";

  const [candidate] = await db
    .insert(candidatesTable)
    .values({
      userProfileId,
      name: profile.fullName,
      phone: profile.mobileNumber ?? "0000000000",
      district: profile.district ?? "Bengaluru Urban",
      trade: parsed.data.trade,
      language,
      deviceFingerprint: parsed.data.deviceFingerprint ?? null,
    })
    .returning();

  const [interview] = await db
    .insert(interviewsTable)
    .values({ candidateId: candidate.id, status: "in_progress" })
    .returning();

  await db
    .update(userProfilesTable)
    .set({ language, updatedAt: new Date() })
    .where(eq(userProfilesTable.id, userProfileId));

  req.session.userLanguage = language;

  res.status(201).json({ candidate, interview });
});

router.get("/user/interviews", async (req: Request, res: Response): Promise<void> => {
  const userProfileId = requireUserProfileId(req, res);
  if (!userProfileId) return;

  const rows = await db
    .select({
      interviewId: interviewsTable.id,
      candidateId: candidatesTable.id,
      trade: candidatesTable.trade,
      status: interviewsTable.status,
      createdAt: interviewsTable.createdAt,
      completedAt: interviewsTable.completedAt,
      classification: classificationsTable.category,
      avgScore: classificationsTable.avgScore,
    })
    .from(interviewsTable)
    .innerJoin(candidatesTable, eq(candidatesTable.id, interviewsTable.candidateId))
    .leftJoin(classificationsTable, eq(classificationsTable.interviewId, interviewsTable.id))
    .where(eq(candidatesTable.userProfileId, userProfileId))
    .orderBy(desc(interviewsTable.createdAt));

  res.json({ interviews: rows });
});

router.get("/user/interviews/:id", async (req: Request, res: Response): Promise<void> => {
  const userProfileId = requireUserProfileId(req, res);
  if (!userProfileId) return;

  const rawId = req.params["id"];
  const interviewId = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (Number.isNaN(interviewId)) {
    res.status(400).json({ error: "Invalid interview id" });
    return;
  }

  const [row] = await db
    .select({
      interview: interviewsTable,
      candidate: candidatesTable,
      classification: classificationsTable,
    })
    .from(interviewsTable)
    .innerJoin(candidatesTable, eq(candidatesTable.id, interviewsTable.candidateId))
    .leftJoin(classificationsTable, eq(classificationsTable.interviewId, interviewsTable.id))
    .where(and(eq(interviewsTable.id, interviewId), eq(candidatesTable.userProfileId, userProfileId)))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Interview not found." });
    return;
  }

  const responses = await db
    .select()
    .from(responsesTable)
    .where(eq(responsesTable.interviewId, interviewId))
    .orderBy(responsesTable.id);

  const officerActions = await db
    .select()
    .from(officerActionsTable)
    .where(eq(officerActionsTable.candidateId, row.candidate.id))
    .orderBy(desc(officerActionsTable.createdAt));

  const requestedLanguageRaw = req.query["language"];
  const requestedLanguage = typeof requestedLanguageRaw === "string" ? requestedLanguageRaw : row.candidate.language;
  const translatedClassification = await translateClassificationForUser(row.classification, requestedLanguage);

  res.json({
    ...row.interview,
    candidate: row.candidate,
    classification: translatedClassification,
    responses,
    officerActions,
  });
});

router.post("/user/logout", (req: Request, res: Response): void => {
  delete req.session.userProfileId;
  delete req.session.userLanguage;
  delete req.session.pendingAadhaarVerification;
  res.json({ success: true });
});

export default router;
