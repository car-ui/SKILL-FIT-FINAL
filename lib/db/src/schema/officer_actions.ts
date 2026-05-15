import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { candidatesTable } from "./candidates";

export const officerActionsTable = pgTable("officer_actions", {
  id: serial("id").primaryKey(),
  candidateId: integer("candidate_id")
    .notNull()
    .references(() => candidatesTable.id),
  interviewId: integer("interview_id"),
  action: text("action").notNull(),
  officerUsername: text("officer_username").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertOfficerActionSchema = createInsertSchema(
  officerActionsTable
).omit({ id: true, createdAt: true });

export type InsertOfficerAction = z.infer<typeof insertOfficerActionSchema>;
export type OfficerAction = typeof officerActionsTable.$inferSelect;
