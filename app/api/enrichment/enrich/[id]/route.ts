import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { requirePrisma } from "@/lib/prisma";
import { runEnrichmentWaterfall } from "@/lib/enrichment/waterfall";

// Standard enrichment (non-streaming)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const prisma = requirePrisma();
  const { id: contactId } = await params;

  // Verify ownership
  const contact = await prisma.enrichedContact.findFirst({
    where: { id: contactId, userId },
  });

  if (!contact) {
    return NextResponse.json({ error: "Contact not found" }, { status: 404 });
  }

  try {
    const result = await runEnrichmentWaterfall(contactId);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error("[enrichment/enrich]", err);
    return NextResponse.json({ error: "Enrichment failed" }, { status: 500 });
  }
}

// Streaming enrichment — sends Server-Sent Events so the UI can show live waterfall progress
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const prisma = requirePrisma();
  const { id: contactId } = await params;

  const contact = await prisma.enrichedContact.findFirst({
    where: { id: contactId, userId },
  });

  if (!contact) return new Response("Not found", { status: 404 });

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        const result = await runEnrichmentWaterfall(contactId, (step) => {
          send({ type: "step", step });
        });

        send({ type: "done", result });
      } catch (err) {
        send({ type: "error", message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
