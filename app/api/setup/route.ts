import { NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";

const MIGRATION_SQL = `
-- Enum for agent run status
DO $$ BEGIN
  CREATE TYPE "AgentRunStatus" AS ENUM ('running', 'completed', 'failed', 'pending_approval');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AgentConfig table
CREATE TABLE IF NOT EXISTS "AgentConfig" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "targetTitles" TEXT[] DEFAULT '{}',
  "maxContacts" INTEGER NOT NULL DEFAULT 3,
  "autoSend" BOOLEAN NOT NULL DEFAULT false,
  "preferredTemplate" TEXT DEFAULT 'executive-intro',
  "channel" "OutreachChannel" NOT NULL DEFAULT 'email',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentConfig_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgentConfig_userId_key" ON "AgentConfig"("userId");

-- AgentRun table
CREATE TABLE IF NOT EXISTS "AgentRun" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "applicationId" TEXT NOT NULL,
  "status" "AgentRunStatus" NOT NULL DEFAULT 'running',
  "triggerType" TEXT NOT NULL DEFAULT 'manual',
  "triggerEmailId" TEXT,
  "contactsFound" INTEGER NOT NULL DEFAULT 0,
  "contactsEnriched" INTEGER NOT NULL DEFAULT 0,
  "emailsDrafted" INTEGER NOT NULL DEFAULT 0,
  "emailsSent" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentRun_userId_createdAt_idx" ON "AgentRun"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "AgentRun_applicationId_idx" ON "AgentRun"("applicationId");
CREATE INDEX IF NOT EXISTS "AgentRun_status_idx" ON "AgentRun"("status");

-- Foreign key for AgentRun -> Application
DO $$ BEGIN
  ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- AgentRunStep table
CREATE TABLE IF NOT EXISTS "AgentRunStep" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "runId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "summary" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgentRunStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AgentRunStep_runId_idx" ON "AgentRunStep"("runId");

-- Foreign key for AgentRunStep -> AgentRun
DO $$ BEGIN
  ALTER TABLE "AgentRunStep" ADD CONSTRAINT "AgentRunStep_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

export async function GET() {
  const prisma = requirePrisma();
  try {
    // Split by semicolons but keep DO $$ blocks together
    const statements = splitSQL(MIGRATION_SQL);
    for (const stmt of statements) {
      const trimmed = stmt.trim();
      if (!trimmed) continue;
      await prisma.$executeRawUnsafe(trimmed);
    }
    return NextResponse.json({
      success: true,
      message: "Agent tables created successfully. Refresh /agent to continue.",
    });
  } catch (err) {
    console.error("[setup]", err);
    return NextResponse.json({
      success: false,
      error: String(err),
    }, { status: 500 });
  }
}

/** Split SQL respecting DO $$ ... END $$ blocks */
function splitSQL(sql: string): string[] {
  const results: string[] = [];
  let current = "";
  let inDollarBlock = false;

  for (const line of sql.split("\n")) {
    if (line.trim().startsWith("DO $$")) {
      inDollarBlock = true;
    }
    current += line + "\n";
    if (inDollarBlock && line.trim().startsWith("END $$")) {
      inDollarBlock = false;
      results.push(current.trim());
      current = "";
    } else if (!inDollarBlock && line.trim().endsWith(";")) {
      results.push(current.trim());
      current = "";
    }
  }
  if (current.trim()) results.push(current.trim());
  return results;
}
