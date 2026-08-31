-- Security scans and telemetry from NVIDIA SkillSpector and CVE analysis.
--
-- The problem this solves:
-- Agent skills and developer tools carry prompt injection, memory poisoning,
-- data exfiltration and dependency risks (NVIDIA research: ~26% of skills in the
-- wild have vulnerabilities). vibetrends.dk differentiates on "curated, never
-- scraped" and verified first-hand grounding.
--
-- This table stores time-series security scan records across skills, CLI, and MCP
-- tools. Detail pages and cards read the latest scan to display factual telemetry
-- (scan date, tool version, findings breakdown, CVE count).
--
-- ORDERING: safe in either direction. The read path (getLatestSecurityScan in
-- src/lib/db.ts) catches missing table errors and returns null gracefully.
--
-- Idempotent and reversible: every statement is add-if-not-exists or
-- drop-then-create, and the down path is at the bottom in a comment.

begin;

create table if not exists public.security_scans (
  id               uuid primary key default gen_random_uuid(),
  entity_type      text not null check (entity_type in ('skill', 'agent', 'vibe')),
  entity_id        text,
  entity_slug      text not null,
  scanner_version  text not null default 'skillspector-0.1.0',
  risk_score       numeric not null default 0,
  severity         text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  verdict          text not null check (verdict in ('SAFE', 'CAUTION', 'DO_NOT_INSTALL')),
  findings_count   jsonb not null default '{"low": 0, "medium": 0, "high": 0, "critical": 0}'::jsonb,
  cve_count        int not null default 0,
  raw_report       jsonb,
  scanned_at       timestamptz not null default now()
);

create index if not exists security_scans_slug_scanned_idx
  on public.security_scans (entity_type, entity_slug, scanned_at desc);

-- RLS: Public read, service-role write
alter table public.security_scans enable row level security;

drop policy if exists "Allow public read access to security_scans" on public.security_scans;
create policy "Allow public read access to security_scans"
  on public.security_scans
  for select
  using (true);

commit;

-- ---------------------------------------------------------------------------
-- Down path
-- ---------------------------------------------------------------------------
--
--   drop policy if exists "Allow public read access to security_scans" on public.security_scans;
--   drop index if exists public.security_scans_slug_scanned_idx;
--   drop table if exists public.security_scans;
