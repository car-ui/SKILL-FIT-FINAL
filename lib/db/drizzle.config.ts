import { defineConfig } from 'drizzle-kit';
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") }); 

export default defineConfig({
  // Use a star to find all files in your schema folder
  schema: './src/schema/*.ts', 
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    prefix: 'timestamp',
    table: '__drizzle_migrations__',
    schema: './migrations',
  },
});