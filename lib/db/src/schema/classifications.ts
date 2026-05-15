/**
 * classifications.ts — DB schema
 * FIX: Added flaggedForReview boolean column.
 * Previously assess.ts and interviews.ts both tried to insert flaggedForReview
 * but this column didn't exist — Drizzle silently dropped it, so the admin
 * review queue always showed 0 candidates.
 * Run `pnpm db:push` after applying this fix.
 */
import {
  pgTable,
  serial,
  integer,
  text,
  real,
  boolean,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { interviewsTable } from "./interviews";

export const classificationsTable = pgTable("classifications", {
  id: serial("id").primaryKey(),
  interviewId: integer("interview_id")
    .notNull()
    .references(() => interviewsTable.id),
  category: text("category").notNull(),
  avgScore: real("avg_score").notNull(),
  reasoning: text("reasoning").notNull(),
  aiFeedback: text("ai_feedback"),
  adminFeedback: text("admin_feedback"),
  adminComments: text("admin_comments"),
  recommendations: text("recommendations"),
  flaggedForReview: boolean("flagged_for_review").notNull().default(false),
  reviewedBy: text("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertClassificationSchema = createInsertSchema(
  classificationsTable
).omit({ id: true, createdAt: true });

export type InsertClassification = z.infer<typeof insertClassificationSchema>;
export type Classification = typeof classificationsTable.$inferSelect;
