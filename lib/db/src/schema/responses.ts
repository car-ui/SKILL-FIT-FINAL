import {
  pgTable,
  serial,
  integer,
  text,
  real,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { interviewsTable } from "./interviews";

export const responsesTable = pgTable("responses", {
  id: serial("id").primaryKey(),
  interviewId: integer("interview_id")
    .notNull()
    .references(() => interviewsTable.id),
  questionId: text("question_id").notNull(),
  questionText: text("question_text").notNull(),
  transcript: text("transcript").notNull(),
  videoUrl: text("video_url"),
  relevanceScore: real("relevance_score"),
  clarityScore: real("clarity_score"),
  confidenceScore: real("confidence_score"),
  geminiReasoning: text("gemini_reasoning"),
  languageDetected: text("language_detected"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertResponseSchema = createInsertSchema(responsesTable).omit({
  id: true,
  createdAt: true,
});

export type InsertResponse = z.infer<typeof insertResponseSchema>;
export type Response = typeof responsesTable.$inferSelect;
