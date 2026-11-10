import { NextResponse } from "next/server";
import { isBearerAuthorized } from "@/lib/bearerAuth";
import { getSupabaseServiceRole } from "@/lib/supabase-server";
import { evaluateHealth, formatReport, type HealthSnapshot } from "@/lib/securityHealth";

/**
 * Daily security health check, called by Vercel Cron (vercel.json).
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations, so the
 * shared-secret check is the same one the other machine routes use. Without
 * CRON_SECRET configured nobody is authorized, including the cron.
 *
 * Reports to a Healthchecks.io check (HEALTHCHECK_PING_URL): a plain ping when
 * everything passes, `/fail` with the report as the body when anything fails
 * or the check cannot run. Healthchecks alerts on `/fail` and also when no
 * ping arrives within the schedule's grace time, which covers the failure a
 * self-mailing monitor can't: the cron itself silently stopping.
 *
 * The ping URL is a credential (anyone holding it can report "all good"), so
 * it lives in the environment, never in the repo.
 */

async function ping(status: "ok" | "fail", body: string): Promise<void> {
  const base = process.env.HEALTHCHECK_PING_URL;
  if (!base) throw new Error("HEALTHCHECK_PING_URL is not set");

  const response = await fetch(status === "fail" ? `${base.replace(/\/$/, "")}/fail` : base, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Healthchecks responded ${response.status}`);
}

export async function GET(request: Request) {
  if (!isBearerAuthorized(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabaseServiceRole().rpc("security_health");

  if (error || !data || typeof data !== "object") {
    const message = error?.message ?? "security_health() returned no data";
    try {
      await ping("fail", `health check could not run: ${message}`);
    } catch (pingError) {
      // Healthchecks still alerts when the expected ping never arrives.
      console.error("security-health: ping failed", pingError);
    }
    return NextResponse.json({ error: "check_failed", message }, { status: 500 });
  }

  const checks = evaluateHealth(data as HealthSnapshot);
  const failed = checks.filter((c) => !c.ok).length;
  const { subject, text } = formatReport(checks);

  try {
    await ping(failed > 0 ? "fail" : "ok", `${subject}\n\n${text}`);
  } catch (pingError) {
    console.error("security-health: ping failed", pingError);
    return NextResponse.json({ error: "ping_failed", failed, checks }, { status: 500 });
  }

  return NextResponse.json({ failed, checks }, { headers: { "Cache-Control": "no-store" } });
}
