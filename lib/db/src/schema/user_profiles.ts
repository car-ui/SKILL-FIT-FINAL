import { date, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const userProfilesTable = pgTable("user_profiles", {
  id: serial("id").primaryKey(),
  aadhaarHash: text("aadhaar_hash").notNull().unique(),
  aadhaarMasked: varchar("aadhaar_masked", { length: 20 }).notNull(),
  fullName: text("full_name").notNull(),
  gender: varchar("gender", { length: 20 }),
  dob: date("dob"),
  district: text("district"),
  state: text("state").notNull().default("Karnataka"),
  mobileNumber: varchar("mobile_number", { length: 20 }),
  language: varchar("language", { length: 5 }).notNull().default("en"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at"),
});

export const insertUserProfileSchema = createInsertSchema(userProfilesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfilesTable.$inferSelect;
