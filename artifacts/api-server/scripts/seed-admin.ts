/**
 * Create initial admin user in PostgreSQL (bcrypt password).
 * Usage: DATABASE_URL=... pnpm --filter @workspace/api-server run seed:admin
 * Optional: SEED_ADMIN_USER, SEED_ADMIN_PASSWORD, SEED_ADMIN_ROLE
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { adminUsersTable } from "@workspace/db";

const { Pool } = pg;

async function main() {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const username = process.env["SEED_ADMIN_USER"] ?? "admin";
  const password = process.env["SEED_ADMIN_PASSWORD"] ?? "admin123";
  const role = process.env["SEED_ADMIN_ROLE"] ?? "super_admin";

  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool);

  const [existing] = await db
    .select({ id: adminUsersTable.id })
    .from(adminUsersTable)
    .where(eq(adminUsersTable.username, username))
    .limit(1);

  if (existing) {
    console.log("Admin user already exists:", username);
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(adminUsersTable).values({ username, passwordHash, role });

  console.log("Created admin user:", username, "role:", role);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
