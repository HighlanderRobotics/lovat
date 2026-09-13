import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Generation/builds need no database credentials. Database commands require this URL.
  datasource: { url: process.env.DATABASE_URL },
});
