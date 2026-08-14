# Plan: Danish Platform Candidate Feeder

**Filename:** `docs/plans/2026-08-14-001-feat-danish-platform-candidate-feeder-plan.md`  
**Date:** 2026-08-14  
**Origin:** `docs/brainstorms/2026-08-14-danish-candidate-feeder-requirements.md`  
**Depth:** Standard  
**Target Repositories / Paths:**
- `Agents/Hermes/scripts/fetch_danish_candidates.py` (New standalone feeder script on VPS)
- `Agents/Hermes/project_audit_loop.py` (Buffer ingestion & status updating)
- `Agents/Hermes/ROADMAP.md` (Operational backlog & scheduling)
- `projects/vibetrends-dk/` (Reference schema & test verification)

---

## 1. Problem Frame & Motivation

Organic traffic data demonstrates that 100% of search clicks and top rankings (positions 4–11) come from queries for Danish platform developer tools (e.g. `aula api`, `aula mcp`, `rejseplanen`, `dawa`, `boligsiden`). While the initial local skills pool contains 61 candidates, sustaining the bi-weekly vibetrends content loop requires an automated, upstream discovery feeder that actively monitors Danish developer ecosystems and registries for newly published and unindexed MCP servers, CLIs, SDK wrappers, and prompt skills.

---

## 2. Requirements Traceability

- **FR-1 (Ecosystem & Registry Scanner):** Standalone Python script (`fetch_danish_candidates.py`) querying GitHub Search API (authenticated via `GITHUB_TOKEN`), npm registry search API, and PyPI search API.
- **FR-2 (Deterministic Live Catalog Deduplication):** Cross-checks candidates against live endpoints `/api/skills`, `/api/cli`, `/api/mcp-servers`, and `/api/vibes` model-free.
- **FR-3 (Minimum Viability Gate):** Drops archived repositories, empty READMEs (<100 bytes), repos inactive for >18 months, or repos lacking recognizable entry points.
- **FR-4 (Decoupled Candidate Buffer):** Persists candidates in `~/.hermes/knowledge/danish_candidate_buffer.json` with status tracking (`buffered`, `processed`, `rejected`).
- **FR-5 (Content Loop Ingestion):** `project_audit_loop.py` consumes top buffered candidates before falling back to local skills and marks submitted candidates as `processed`.

---

## 3. Architecture & Data Flow

```
[ GitHub API / npm / PyPI ]
           │
           ▼
[ fetch_danish_candidates.py ]  <──  Weekly Cron (Sunday 05:00 UTC)
     │   │
     │   ├── (1) Query Matrix (DAWA, CVR, Aula, MitID, Rejseplanen, e-conomic, Dinero, Billy, MobilePay)
     │   ├── (2) Live REST Dedup against vibetrends.dk/api/...
     │   └── (3) Minimum Viability Gate (Activity <18m, README >100B, valid entry point)
     ▼
[ ~/.hermes/knowledge/danish_candidate_buffer.json ]  (Persistent Buffer)
     │
     ▼ (Reads top 2 candidates per run)
[ project_audit_loop.py --mode content ]  <──  Mon/Thu 06:00 UTC
     │
     ├── Grounding (Docker sandbox / SKILL.md AST inspection)
     ├── 3-Pass Resumed Claude Session (dk-techblog rules, falsifiable claim)
     ├── Submit via /api/agentauth (HTTP 202 review_state='pending')
     └── Update buffer status -> 'processed'
```

---

## 4. Key Technical Decisions & Boundaries

1. **Zero Metered API Cost:** The scanner is 100% deterministic Python without LLM calls. LLM reasoning happens solely within `project_audit_loop.py` on Claude Pro/Max subscription.
2. **GitHub API Authentication:** Uses `GITHUB_TOKEN` from `~/.hermes/.env` (standard in `project_audit_loop.py`) granting 5,000 requests/hour.
3. **Idempotent Buffer Schema:** Keys entries by normalized repository/package identifier (`norm_url`) to allow safe re-runs without duplication.
4. **Security & Sandbox Isolation ([GHSA-rhgp-j443-p4rf](https://github.com/advisories/GHSA-rhgp-j443-p4rf)):** No tokens are passed into Docker grounding runs.

---

## 5. Implementation Units

### Unit 1: Standalone Danish Ecosystem Scanner (`fetch_danish_candidates.py`)
- **Path:** `Agents/Hermes/scripts/fetch_danish_candidates.py`
- **Scope:**
  - Build query matrix covering Danish public platforms (DAWA, CVR, Aula, MitID, Rejseplanen, Skat) and Danish fintech (e-conomic, Dinero, Billy, MobilePay, Boliga, Boligsiden).
  - Query GitHub Search API (`q=topic:dawa+OR+cvr+OR+aula+OR+rejseplanen+OR+"danish-api"+OR+"danmark"`, `language:TypeScript`, `language:Python`).
  - Query npm registry search endpoint (`https://registry.npmjs.org/-/v1/search?text=dawa+OR+cvr+OR+rejseplanen+OR+aula-api&size=50`).
  - Implement minimum viability checks: last commit < 18 months, non-empty README, non-archived.
  - Implement live deduplication using `fetch_live_catalog()` imported or adapted from `project_audit_loop.py`.
  - Save/merge results to `~/.hermes/knowledge/danish_candidate_buffer.json`.
- **Verification:** Run standalone on VPS; assert output JSON contains valid candidates and zero duplicate entries.

### Unit 2: Buffer Ingestion in `project_audit_loop.py`
- **Path:** `Agents/Hermes/project_audit_loop.py`
- **Scope:**
  - In `discover_candidates()`, prioritize unindexed candidates from `danish_candidate_buffer.json` (`status == "buffered"`) before scanning local `~/.hermes/skills/`.
  - Upon successful submission (`submit_candidate_payload`), update candidate status in `danish_candidate_buffer.json` to `"processed"` with timestamp.
  - Add `--refresh-buffer` CLI flag to optionally run `fetch_danish_candidates.py` before executing the content loop.
- **Verification:** Test discovery ordering with populated buffer; verify that top buffer items are selected for grounding and writing.

### Unit 3: VPS Deployment & Cron Scheduling
- **Path:** Hermes VPS Crontab (`crontab -l`) & `Agents/Hermes/ROADMAP.md`
- **Scope:**
  - Add Sunday 05:00 UTC schedule for `fetch_danish_candidates.py` (before Monday's 06:00 UTC content loop run):
    `0 5 * * 0 /usr/bin/python3 /home/administrator/.hermes/scripts/fetch_danish_candidates.py >> /home/administrator/.hermes/logs/fetch_danish_candidates.log 2>&1`
  - Deploy `fetch_danish_candidates.py` to `~/.hermes/scripts/`.
  - Deploy updated `project_audit_loop.py`.
  - Update `ROADMAP.md` Done Log and active cron references.
- **Verification:** Run `fetch_danish_candidates.py` live under `env -i`, verify buffer generation, run `project_audit_loop.py --dry-run` to verify buffer consumption.

---

## 6. Test Scenarios & Verification Matrix

| Scenario | Input / Trigger | Expected Result |
| :--- | :--- | :--- |
| **1. GitHub Search Rate & Auth** | Run `fetch_danish_candidates.py` with `GITHUB_TOKEN` | Successfully performs searches without 403 rate-limit errors |
| **2. Deduplication Filter** | Candidate exists in live `/api/mcp-servers` (e.g. `aula-mcp`) | Scanner recognizes duplicate and drops candidate model-free |
| **3. Minimum Viability Filter** | Repo archived in 2022 or empty README | Candidate rejected before writing to buffer |
| **4. Buffer Persistence** | Initial run discovers 15 candidates | `danish_candidate_buffer.json` populated with 15 structured items |
| **5. Content Loop Ingestion** | Run `project_audit_loop.py --limit 1` under `env -i` | Consumes #1 candidate from buffer, grounds, runs 3-pass Claude, submits to `/api/agentauth`, marks `status: 'processed'` |
