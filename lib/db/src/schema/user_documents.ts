import { integer, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { userProfilesTable } from "./user_profiles";

export const userDocumentsTable = pgTable("user_documents", {
  id: serial("id").primaryKey(),
  userProfileId: integer("user_profile_id")
    .notNull()
    .references(() => userProfilesTable.id, { onDelete: "cascade" }),
  category: varchar("category", { length: 40 }).notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url").notNull(),
  contentType: text("content_type"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserDocumentSchema = createInsertSchema(userDocumentsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertUserDocument = z.infer<typeof insertUserDocumentSchema>;
export type UserDocument = typeof userDocumentsTable.$inferSelect;
