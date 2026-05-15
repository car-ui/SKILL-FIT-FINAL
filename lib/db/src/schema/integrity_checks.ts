import {
  pgTable,
  serial,
  integer,
  boolean,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { interviewsTable } from "./interviews";

export const integrityChecksTable = pgTable("integrity_checks", {
  id: serial("id").primaryKey(),
  interviewId: integer("interview_id")
    .notNull()
    .references(() => interviewsTable.id),
  facePresentPct: real("face_present_pct"),
  livenessPass: boolean("liveness_pass"),
  duplicateCandidateId: integer("duplicate_candidate_id"),
  phoneReuse: boolean("phone_reuse"),
  deviceReuse: boolean("device_reuse"),
  faceMatchScore: real("face_match_score"),
  flags: text("flags").array().notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertIntegrityCheckSchema = createInsertSchema(
  integrityChecksTable
).omit({ id: true, createdAt: true });

export type InsertIntegrityCheck = z.infer<typeof insertIntegrityCheckSchema>;
export type IntegrityCheck = typeof integrityChecksTable.$inferSelect;
