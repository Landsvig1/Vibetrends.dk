import { NextResponse } from "next/server";
import { isBearerAuthorized } from "@/lib/bearerAuth";
import { getSupabaseServiceRole } from "@/lib/supabase-server";
import { evaluateHealth, formatReport, isHeartbeatDay, type HealthSnapshot } from "@/lib/securityHealth";

/**
 * Daily security health check, called by Vercel Cron (vercel.json).
 *
 * Vercel sends `Authorization: Bearer $CRON_SECRET` on cron invocations, so the
 * shared-secret check is the same one the other machine routes use. Without
 * CRON_SECRET configured nobody is authorized, including the cron.
 *
 * Emails only when a check fails, plus an all-clear on Mondays so a monitor
 * that silently stopped running is noticed within a week. A failure to run the
 * check at all is itself mailed: an unreachable database or a missing
 * migration must not look like a quiet day.
 *
 * Env: CRON_SECRET, RESEND_API_KEY, HEALTH_ALERT_TO, optional HEALTH_ALERT_FROM.
 * Resend's shared onboarding sender only delivers to the Resend account's own
 * address, which is enough for alerts to the owner.
 */

const DEFAULT_FROM = "vibetrends <onboarding@resend.dev>";

async function sendMail(subject: string, text: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.HEALTH_ALERT_TO;
  if (!key || !to) throw new Error("RESEND_API_KEY or HEALTH_ALERT_TO is not set");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.HEALTH_ALERT_FROM || DEFAULT_FROM, to: [to], subject, text }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}`);
}

export async function GET(request: Request) {
  if (!isBearerAuthorized(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await getSupabaseServiceRole().rpc("security_health");

  if (error || !data || typeof data !== "object") {
    const message = error?.message ?? "security_health() returned no data";
    try {
      await sendMail("vibetrends security: health check could not run", message);
    } catch (mailError) {
      console.error("security-health: alert mail failed", mailError);
    }
    return NextResponse.json({ error: "check_failed", message }, { status: 500 });
  }

  const checks = evaluateHealth(data as HealthSnapshot);
  const failed = checks.filter((c) => !c.ok).length;
  const shouldMail = failed > 0 || isHeartbeatDay(new Date());

  let mailed = false;
  if (shouldMail) {
    const { subject, text } = formatReport(checks);
    try {
      await sendMail(subject, text);
      mailed = true;
    } catch (mailError) {
      // Surface in the cron log and as a 500, so a broken mail path is
      // visible in Vercel even though nobody gets the email.
      console.error("security-health: mail failed", mailError);
      return NextResponse.json({ error: "mail_failed", failed, checks }, { status: 500 });
    }
  }

  return NextResponse.json(
    { failed, mailed, checks },
    { headers: { "Cache-Control": "no-store" } }
  );
}
