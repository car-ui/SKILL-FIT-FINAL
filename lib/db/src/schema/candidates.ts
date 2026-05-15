import { integer, pgTable, serial, text, timestamp, varchar, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userProfilesTable } from "./user_profiles";

export const candidatesTable = pgTable("candidates", {
  id: serial("id").primaryKey(),
  userProfileId: integer("user_profile_id").references(() => userProfilesTable.id),
  name: text("name").notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  district: text("district").notNull(),
  trade: text("trade").notNull(),
  language: varchar("language", { length: 5 }).notNull().default("en"),
  deviceFingerprint: text("device_fingerprint"),
  faceEmbedding: text("face_embedding"), // JSON array stored as text
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCandidateSchema = createInsertSchema(candidatesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCandidate = z.infer<typeof insertCandidateSchema>;
export type Candidate = typeof candidatesTable.$inferSelect;
