# Implementation Plan: Skill Security Gate, Grounding Verifier & On-Page Telemetry

**Plan ID:** `2026-08-30-001-feat-skill-security-gate-and-telemetry-plan`  
**Origin Document:** `docs/brainstorms/2026-08-30-skill-security-gate-requirements.md`  
**Date:** 2026-08-30  
**Type:** `feat`  
**Status:** Approved for Implementation  

---

## 1. Problem Frame & Scope

VibeTrends.dk needs to enforce first-hand verification and static security scanning for all curated tools. Currently:
1. Candidate grounding in `project_audit_loop.py` falls back to `description_hint` when Docker executions return non-zero, creating false claims of first-hand verification.
2. Ingest lacks a static SAST gate to catch prompt injection, memory poisoning, or unsafe dependencies before tools are run or cataloged.
3. Detail pages lack verifiable, factual security telemetry.
4. Users want a discrete, subtle, clean safety indicator on scanned cards with an interactive tooltip explaining that the skill has been scanned for security with NVIDIA SkillSpector.

### Scope Boundaries
- **In Scope**:
  - Implementation of `security_scans` table migration in `supabase/migrations/20260830000000_security_scans.sql`.
  - Tolerant read/write helpers in `src/lib/db.ts` and `src/lib/supabase-server.ts`.
  - Discrete `SecurityBadge` component for `SkillCard.tsx` and `AgentCard.tsx` with hover/click tooltip.
  - Comprehensive `SecurityAuditBox` component on skill and agent detail pages (`/skills/[slug]`, `/cli/[slug]`, `/mcp/[slug]`).
  - Unit tests for DB helpers, `SecurityBadge`, and `SecurityAuditBox`.
  - Standalone scanner script `scripts/skill_security.py` (and VPS counterpart) supporting `--mode gate`, `--mode sweep`, `--mode repo` using Dockerized SkillSpector.
  - Fixing `ground_cli_mcp_candidate` in `project_audit_loop.py` to remove the fallback.
- **Out of Scope**:
  - Metered API LLM spending for security scans (strictly model-free static scan).
  - Green "Safe" liability badges.

---

## 2. Technical Design & Architecture

### Database Schema (`public.security_scans`)
```sql
create table if not exists public.security_scans (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('skill', 'agent', 'vibe')),
  entity_id text,
  entity_slug text not null,
  scanner_version text not null default 'skillspector-0.1.0',
  risk_score numeric not null default 0,
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  verdict text not null check (verdict in ('SAFE', 'CAUTION', 'DO_NOT_INSTALL')),
  findings_count jsonb not null default '{"low": 0, "medium": 0, "high": 0, "critical": 0}'::jsonb,
  cve_count int not null default 0,
  raw_report jsonb,
  scanned_at timestamptz not null default now()
);

create index if not exists idx_security_scans_slug on public.security_scans(entity_type, entity_slug, scanned_at desc);
```

### Tolerant Read Flow
`getLatestSecurityScan(entityType: string, slug: string)` in `src/lib/db.ts` attempts to query `public.security_scans`. If the table does not exist or errors, it catches the error and returns `null` safely without breaking page rendering.

### UI Integration: Discrete Badge & Detail Audit Box
1. `SecurityBadge.tsx`: A subtle, discrete icon (e.g. `ShieldCheck` / `Shield` from `lucide-react` with 12px/14px sizing in muted accent colors) rendered beside category badges. On hover/click, renders a lightweight accessible tooltip stating: *"Scannet for sikkerhed med NVIDIA SkillSpector (0 sårbarheder fundet)"*.
2. `SecurityAuditBox.tsx`: Detailed card rendered on `/skills/[slug]`, `/cli/[slug]`, and `/mcp/[slug]` showing scan timestamp, version, severity breakdown, and findings list.

---

## 3. Implementation Units

### Unit 1: Database Migration & Tolerant DB Helpers
- **Files**:
  - `supabase/migrations/20260830000000_security_scans.sql`
  - `src/lib/db.ts`
  - `src/lib/__tests__/securityScanDb.test.ts`
- **Goal**: Add idempotent migration and type-safe `getLatestSecurityScan` / `saveSecurityScan` functions with fallback tolerance.

### Unit 2: Discrete Security Badge & Detail Audit Components
- **Files**:
  - `src/app/components/SecurityBadge.tsx`
  - `src/app/components/SecurityAuditBox.tsx`
  - `src/app/components/SkillCard.tsx`
  - `src/app/components/AgentCard.tsx`
  - `src/app/skills/[slug]/page.tsx`
  - `src/app/cli/[slug]/page.tsx`
  - `src/app/mcp/[slug]/page.tsx`
  - `src/app/components/__tests__/SecurityBadge.test.tsx`
- **Goal**: Render the subtle, clean safety badge on cards and the full telemetry audit box on detail pages.

### Unit 3: Standalone SkillSpector Security Script & Grounding Fix
- **Files**:
  - `scripts/skill-security.mjs` / `scripts/skill_security.py`
  - `scripts/__tests__/skillSecurity.test.mjs`
- **Goal**: Implement Dockerized SAST scanner logic with `--mode gate`, `--mode sweep`, and eliminate the `description_hint` fallback.

---

## 4. Verification & Testing Strategy

- `npm run test:unit`: Vitest suite covering DB helper tolerance, security badge component rendering, and scanner report parsing.
- `npm run typecheck`: Strict TypeScript compilation.
- `npm run lint`: ESLint rules check.
