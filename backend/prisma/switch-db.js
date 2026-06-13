const fs = require("fs");
const path = require("path");

const target = process.argv[2]; // 'sqlite' or 'postgres'

const prismaDir = __dirname;
const envFile = path.join(prismaDir, "..", ".env");
const schemaFile = path.join(prismaDir, "schema.prisma");

if (target === "sqlite") {
  console.log("🔄 Switching schema to SQLite...");
  const sqliteSchema = path.join(prismaDir, "schema.sqlite.prisma");
  fs.copyFileSync(sqliteSchema, schemaFile);
  
  // Update .env with sqlite connection if it is currently postgresql localhost
  if (fs.existsSync(envFile)) {
    let envContent = fs.readFileSync(envFile, "utf8");
    if (envContent.includes("postgresql://")) {
      envContent = envContent.replace(
        /DATABASE_URL=.*/,
        'DATABASE_URL="file:./dev.db"'
      );
      fs.writeFileSync(envFile, envContent, "utf8");
      console.log("📝 Updated .env to use file:./dev.db");
    }
  }
  console.log("✅ Successfully switched to SQLite schema.");
} else if (target === "postgres") {
  console.log("🔄 Restoring main production schema for PostgreSQL...");
  // We can just keep schema.prisma as postgresql by default, and copy it from a backup if needed.
  // Let's create schema.postgres.prisma as a backup so we can restore it easily.
  const postgresBackup = path.join(prismaDir, "schema.postgres.prisma");
  if (fs.existsSync(postgresBackup)) {
    fs.copyFileSync(postgresBackup, schemaFile);
  } else {
    // If not backup, we will backup the current one if it is postgresql
    const currentSchema = fs.readFileSync(schemaFile, "utf8");
    if (currentSchema.includes('provider = "postgresql"')) {
      fs.writeFileSync(postgresBackup, currentSchema, "utf8");
    }
  }
  
  // Restore postgres url in .env template if sqlite
  if (fs.existsSync(envFile)) {
    let envContent = fs.readFileSync(envFile, "utf8");
    if (envContent.includes("file:./dev.db")) {
      envContent = envContent.replace(
        /DATABASE_URL=.*/,
        'DATABASE_URL="postgresql://postgres:postgres@localhost:5432/shared_expenses?schema=public"'
      );
      fs.writeFileSync(envFile, envContent, "utf8");
      console.log("📝 Restored PostgreSQL connection string in .env");
    }
  }
  console.log("✅ Successfully switched to PostgreSQL schema.");
} else {
  console.error("❌ Invalid target. Use 'node switch-db.js sqlite' or 'node switch-db.js postgres'");
  process.exit(1);
}
