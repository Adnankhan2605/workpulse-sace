import { defineConfig } from "drizzle-kit";

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

export default defineConfig(
  sqlHost && sqlDbName && user && password
    ? {
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dialect: "postgresql",
        schemaFilter: ["public"],
        dbCredentials: {
          host: sqlHost,
          user: user,
          password: password,
          database: sqlDbName,
          ssl: false,
        },
        verbose: true,
      }
    : {
        dialect: "postgresql",
        schema: "./src/db/schema.ts",
        out: "./drizzle/migrations",
        dbCredentials: {
          url: process.env.LOVABLE_DB_MIGRATION_URL ?? "",
        },
      },
);
