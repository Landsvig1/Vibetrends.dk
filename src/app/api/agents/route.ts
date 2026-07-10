import { NextResponse } from "next/server";
import { validateHoneypot } from "@/lib/honeypot";
import { getAgents, createAgent } from "@/lib/db";
import { resolveRequestIdentity } from "@/lib/supabase-server";
import { checkAgentWriteRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

// Exported for unit testing the submission contract (validation boundary).
export const agentSchema = z.object({
  name: z.string().min(1).max(100),
  // Feed-worthy categories only — hosts are connection targets, not submittable
  // catalog items (R2).
  category: z.enum(["CLI", "MCP Server"]),
  description: z.string().min(10).max(500),
  // installCommand is rendered as a copyable "run this in your terminal"
  // command by ConnectBlock, so reject shell metacharacters that would let a
  // submitted row smuggle a command-chaining / substitution payload into a
  // one-click copy. Legit install strings (npx/npm/pnpm/uvx ...) do not use them.
  installCommand: z
    .string()
    .max(300)
    .refine((s) => !/[;&|`$\n\r<>]/.test(s), {
      message: "installCommand must not contain shell metacharacters (; & | ` $ < > or newlines)",
    })
    .optional(),
  systemPrompt: z.string().optional(),
  tags: z.array(z.string()).max(10).optional(),
  // Canonical repo/site for the tool (rendered as an outbound link).
  sourceUrl: z.string().url().max(300).optional().or(z.literal("")),
});

import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") || undefined;
  const category = searchParams.get("category") || undefined;

  const cookieStore = await cookies();
  const lang = (cookieStore.get("vibe_lang")?.value as 'da' | 'en') || 'da';

  const agents = await getAgents(search, category, lang);
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

    if (actingAs && !(await checkAgentWriteRateLimit(actingAs.user.id))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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

    const { name, category, description, installCommand, systemPrompt, tags, sourceUrl } = result.data;

    const agent = await createAgent(
      name,
      user.username,
      category,
      description,
      installCommand || "",
      systemPrompt || "",
      tags || [],
      sourceUrl || undefined,
      actingAs
    );

    return NextResponse.json(agent, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }
}
