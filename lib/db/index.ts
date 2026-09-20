import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

function getDatabaseUrl() {
  const databaseUrl =
    process.env.APP_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      "APP_DATABASE_URL or DATABASE_URL is not configured",
    );
  }

  return databaseUrl;
}

export function getSql() {
  return neon(getDatabaseUrl());
}

export function getDb() {
  return drizzle(getSql(), { schema });
}
