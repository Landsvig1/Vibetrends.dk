# Skill Security Gate, Grounding Verifier & On-Page Telemetry — Requirements Brief

**Date:** 2026-08-30  
**Author:** Kasper Landsvig & Antigravity  
**Status:** Approved for Planning  
**Target Repository:** vibetrends.dk & Hermes Agent (`~/.hermes/`)  

---

## 1. Problem Frame & Motivation

VibeTrends.dk differentiates itself on **"curated, never scraped"** and falsifiable technical claims. However, an audit of the current autonomous pipeline surfaced two critical gaps:

1. **The Grounding Verification Gap:** In `project_audit_loop.py`, candidate grounding for CLIs and MCP servers falls back to `grounded = bool(candidate.get("description_hint"))` whenever the sandbox check exits non-zero. Because `pip show` on uninstalled packages always exits non-zero, Python packages and failing tools are marked "grounded" on the strength of a description string alone. This overstates verification and threatens the catalog's editorial integrity.
2. **Agent Supply-Chain & Prompt Injection Risk:** NVIDIA research demonstrates that across agent skills in the wild, **26.1% contain vulnerabilities and 5.2% show likely malicious intent** (prompt injection, data exfiltration, memory poisoning, unverified dependency execution). The intake loop currently lacks a static SAST gate to inspect untrusted source code before running it.
3. **Unexploited Product Value:** Static security analysis with CVE cross-referencing provides high-trust, reproducible evidence. Exposing factual scan results on tool detail pages elevates vibetrends.dk above unchecked directories without creating certification liability.

---

## 2. Product Decisions & Architectural Scope

1. **Scanner Substrate: NVIDIA SkillSpector in Docker**
   - Employs NVIDIA SkillSpector (Apache 2.0, 68 vulnerability rules across 17 categories, OSV.dev CVE integration).
   - Runs strictly in static mode (`--no-llm`), executing in an isolated Docker container on the VPS. Zero metered API token cost.
   - Does not require `uv`/`uvx` on the host; executes via `docker run --rm -v "$PWD:/scan" skillspector scan ./target --no-llm --format json`.

2. **Gating Protocol for Candidate Ingest**
   - **`DO_NOT_INSTALL`**: Immediate hard drop. The candidate is logged, skipped, and never touches the execution sandbox or catalog. Third-party authors of dropped tools are never named publicly.
   - **`CAUTION`**: Allowed to proceed to sandbox grounding, but security findings are flagged explicitly in the GitHub Actions PR review manifest for human review.
   - **`SAFE`**: Passes directly to sandbox grounding.

3. **Grounding Protocol Fix**
   - Replaces the `description_hint` fallback in `project_audit_loop.py` with true ephemeral execution in the Docker sandbox (`nikolaik/python-nodejs`).
   - Verifies package install commands, entrypoints (`--help`), and exit codes. If execution errors or times out, the candidate is marked `grounded: false` and dropped.

4. **Persistence: Dedicated `security_scans` Snapshot Table**
   - Avoids widening the core `skills` and `agents` tables with ephemeral scan fields.
   - Stores time-series scan records (entity type, entity slug/id, scan timestamp, tool version, risk score, severity counts, findings JSONB).
   - Applied via an idempotent, reversible migration through the IPv4 connection pooler with `ssl: { rejectUnauthorized: false }`. Tolerant read code is deployed before applying the migration.

5. **On-Page Telemetry (Factual & Objective)**
   - Renders a compact "Sikkerhedsscanning" component on detail pages (`/skills/[slug]`, `/cli/[slug]`, `/mcp/[slug]`).
   - Displays factual metadata: scan date, SkillSpector version, severity breakdown (e.g. *0 sårbarheder, 0 CVEs*), and expandable issue summaries for `CAUTION` items.
   - **Hard Rule:** Never displays a generic green "Safe" badge (avoids turning curation into liability certification).

---

## 3. Operating Modes (`skill_security.py`)

| Mode | Trigger | Target Scope | Output |
|---|---|---|---|
| `--mode gate` | Called by `project_audit_loop.py` | Single candidate repo / URL | JSON verdict (`SAFE`, `CAUTION`, `DO_NOT_INSTALL`) consumed by ingest loop |
| `--mode sweep` | Weekly cron (Sat 03:00 UTC) | Approved catalog rows (`skills`, `agents`) | Updates `security_scans` table; generates delta report if new CVEs arise |
| `--mode repo` | Monthly cron (1st of month) | Local `.agents/skills/` and `~/.claude/skills/` | Markdown audit in `knowledge/inbox/from-hermes/` |

---

## 4. Functional Requirements

### FR-1: Standalone Scanner CLI (`skill_security.py`)
- Resides on the VPS in `~/.hermes/scripts/skill_security.py`.
- Accepts arguments: `--mode [gate|sweep|repo]`, `--target <path|url>`, `--out <json-path>`.
- Invokes Dockerized SkillSpector with `--no-llm --format json`.
- Handles exit code 1 (`risk_score > 50`) as valid JSON output rather than a script crash (exit 2 is reserved for true execution errors).
- Integrates with OSV.dev API over HTTPS for live CVE lookup with bundled offline fallback.

### FR-2: Content Loop Pre-Flight Gate Integration
- Updates `project_audit_loop.py` (`content` mode) to invoke `skill_security.py --mode gate` before candidate grounding.
- If verdict is `DO_NOT_INSTALL`, logs rejection to `logs/audit_loop.log` and moves to the next candidate without sandbox execution.
- If verdict is `CAUTION`, includes security findings in the candidate payload submitted to `/api/agentauth`.

### FR-3: Strict Sandbox Grounding Verifier
- Fixes `ground_cli_mcp_candidate` and `ground_skill_candidate` in `project_audit_loop.py`:
  - Drops the fallback assignment `grounded = bool(candidate.get("description_hint"))`.
  - Enforces successful execution (exit code 0 on install / `--help` probe) inside the transient Docker sandbox.
  - Ensures no host credentials (`GH_TOKEN`, `CLAUDE_CODE_OAUTH_TOKEN`) are injected into the container (GHSA-rhgp-j443-p4rf compliance).

### FR-4: Database Migration (`security_scans` table)
- Creates `supabase/migrations/20260830000000_security_scans.sql`:
  - Table `public.security_scans`:
    - `id` (uuid, primary key)
    - `entity_type` (text: 'skill' | 'agent' | 'vibe')
    - `entity_id` (text, nullable)
    - `entity_slug` (text, not null)
    - `scanner_version` (text, not null)
    - `risk_score` (numeric, not null)
    - `severity` (text: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL')
    - `verdict` (text: 'SAFE' | 'CAUTION' | 'DO_NOT_INSTALL')
    - `findings_count` (jsonb: `{ low: 0, medium: 0, high: 0, critical: 0 }`)
    - `cve_count` (int, default 0)
    - `raw_report` (jsonb, nullable)
    - `scanned_at` (timestamptz, default now())
  - Unique index on `(entity_type, entity_slug, scanned_at desc)`.
  - Migration script is idempotent and reversible.

### FR-5: Tolerant Read Helpers & Database Client
- Adds `getLatestSecurityScan(entityType, entitySlug)` in `src/lib/db.ts`.
- Fails open gracefully (returns `null`) if the table does not exist or has no scan for the requested entity.
- Connects using `ssl: { rejectUnauthorized: false }` over the IPv4 pooler.

### FR-6: Detail Page Security Telemetry Component
- Creates `src/app/components/SecurityAuditBox.tsx`:
  - Renders a clean, card-styled container on `/skills/[slug]`, `/cli/[slug]`, and `/mcp/[slug]`.
  - Header: *"Sikkerhedsscanning"* with scan date and SkillSpector version.
  - Metrics: Findings badge breakdown (*0 sårbarheder fundet*, *0 CVEs*).
  - Expandable accordion for `CAUTION` findings showing rule category and description.
  - Follows Danish UX standards: no em-dashes (`—`/`–`), no hype words, technical precision.

### FR-7: PR Manifest Security Summary
- Updates `.github/workflows/submission-review.yml` and `scripts/review-queue.mjs`:
  - Emits the SkillSpector risk score and findings summary in the generated pull request body.
  - Enables Kasper to inspect security status in 5 seconds before merging.

---

## 5. Non-Functional & Security Constraints

1. **Zero Metered API Spend:**
   - SkillSpector static scan runs model-free in Docker (`--no-llm`).
   - `ANTHROPIC_API_KEY` is never set on the VPS.
2. **Credential Isolation (GHSA-rhgp-j443-p4rf):**
   - SkillSpector and grounding containers run ephemeral (`--rm`) with `--network bridge`, memory cap `512m`, CPU cap `1.0`.
   - Never inject `CLAUDE_CODE_OAUTH_TOKEN`, `GH_TOKEN`, or DB passwords into container environments.
3. **Migration Safety & Backward Compatibility:**
   - Tolerant read helpers in `src/lib/db.ts` must ship before the migration is executed against Supabase.
   - Direct database scripts must use IPv4 pooler fallback (`aws-0-eu-west-1.pooler.supabase.com`).

---

## 6. Definition of Done & Success Criteria

1. **Static Gating Proof:** A test candidate containing a deliberate prompt injection or malicious pattern is flagged as `DO_NOT_INSTALL` and dropped before entering the Docker sandbox.
2. **Grounding Fallback Proof:** A failing CLI candidate is verified as `grounded: false` and dropped, proving the former `description_hint` bug is eliminated.
3. **Clean Migration & Tolerant Read:** `20260830000000_security_scans.sql` applies cleanly via `scripts/apply-migration.mjs`; detail pages render correctly with and without scan records.
4. **Baseline Catalog Sweep:** A full sweep across approved catalog items executes without errors and seeds baseline scan records.
5. **No Visual Fluff:** Detail pages render factual security telemetry without liability-inducing "safe" claims.
