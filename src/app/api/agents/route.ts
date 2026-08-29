import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getAgents, createAgent } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { pendingSubmissionBody, reviewStateForWrite } from "@/lib/reviewGate";
import { enforceAgentWriteRateLimit } from "@/lib/rate-limit";
import { agentSchema } from "@/lib/schemas";

// Re-exported for unit testing the submission contract (validation boundary).
export { agentSchema };

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;

  const agents = await getAgents(search, category, 'da');
  return NextResponse.json(agents, {
    // no-store: `public, max-age` was cached by Vercel's shared edge — a
    // request from ANY client within the window got a stale pre-vote
    // upvote count regardless of the client's own cache mode (fetch's
    // `cache: "no-store"` on the caller only bypasses the browser's local
    // cache, not this shared layer). Correctness for interactive upvotes
    // matters more than the minor DB-load saving here.
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  try {
    const identity = await resolveRequestIdentity(request);
    if (!identity) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { user, botAuth: actingAs } = identity;

    if (actingAs) {
      const rateLimited = await enforceAgentWriteRateLimit(actingAs.user.id);
      if (rateLimited) return rateLimited;
    }

    const body = await request.json();
    if (!validateHoneypot(body)) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }
    const result = agentSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid input", details: result.error.issues },
        { status: 400 }
      );
    }

    const { name, category, description, installCommand, systemPrompt, tags, sourceUrl, descriptionDa } = result.data;

    const agent = await createAgent(
      name,
      user.username,
      category,
      description,
      installCommand || "",
      systemPrompt || "",
      tags || [],
      sourceUrl || undefined,
      descriptionDa || undefined,
      actingAs
    );

    if (reviewStateForWrite('agents', actingAs) === 'pending') {
      return NextResponse.json(pendingSubmissionBody(agent.id), { status: 202 });
    }

    return NextResponse.json(agent, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
