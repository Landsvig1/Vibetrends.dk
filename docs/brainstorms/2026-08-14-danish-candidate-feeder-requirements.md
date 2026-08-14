# Danish Platform Candidate Feeder — Requirements Brief

**Date:** 2026-08-14  
**Author:** Kasper Landsvig & Antigravity  
**Status:** Approved for Planning  
**Target Repository:** vibetrends.dk & Hermes Agent (`~/.hermes/`)

---

## 1. Problem Frame & Motivation

Search Console performance data on vibetrends.dk established a critical empirical insight:
- **100% of organic search clicks** (and ranking positions 4–11) come from queries targeting Danish platform tooling (`aula api`, `aula mcp`, `rejseplanen`, `dawa`, `boligsiden`).
- **0 clicks** and low visibility (positions 20–88) come from generic international software pages.

The existing vibetrends content loop running on Hermes (`project_audit_loop.py`, Mon/Thu 06:00 UTC) currently processes candidates from a finite local pool of 61 skills in `~/.hermes/skills/` and rolling signal logs. Once this initial pool is evaluated and cataloged, discovery will stall unless a continuous, automated upstream pipeline feeds newly discovered or unindexed Danish platform agent tools into the queue.

---

## 2. Product Decisions & Architectural Scope

1. **Discovery Strategy: Curated Ecosystem Watcher & Registry Scanner**
   - Focuses on a defined Danish platform matrix across public infrastructure, Danish enterprise APIs, and accounting/fintech SaaS.
   - Scans GitHub Search API (authenticated via `GITHUB_TOKEN`), npm registry API, and PyPI for wrappers, CLIs, MCP servers, and prompt skills.

2. **Quality Gate Floor: Minimum Viability Filter**
   - Rejects dead forks, unmaintained experiments, and student assignments before entering the LLM writing chain.
   - Criteria: Non-empty README (>100 characters), repository activity or package release within the last 18 months, and a verifiable entry point or export.

3. **Integration Pattern: Decoupled Candidate Buffer**
   - The scanner runs on a standalone cadence (e.g. weekly or on-demand) and populates `~/.hermes/knowledge/danish_candidate_buffer.json`.
   - The Mon/Thu content loop consumes the top 2 candidates from this buffer, executes first-hand grounding in Docker, runs the 3-pass Claude writing chain on subscription, and posts submissions to `/api/agentauth`.

---

## 3. Watched Danish Platform Matrix

The feeder monitors developer ecosystems associated with:

### A. Public & Civic Infrastructure (Danmark / Borger)
- **DAWA:** Danmarks Adressers Web API (adresser, matrikler, postnumre).
- **CVR / Virk:** Erhvervsstyrelsens CVR API, regnskabsdata.
- **Aula:** UNI-Login, institutionelle lektie- og beskedklienter.
- **Rejseplanen & DSB:** Rejseplanen API, realtidsdata for tog og bus.
- **MitID & Digitaliseringsstyrelsen:** Offentlig identitet og integrationsprotokoller.
- **Skat & Moms:** Indberetningsvejledninger, momsvalidering.
- **Sundhed.dk / Medicinkortet:** Offentlige sundhedsdata og patientintegrationer.

### B. Danish Fintech & SME SaaS
- **Regnskab & Bogføring:** e-conomic, Dinero, Billy, Corpay One.
- **Betalinger:** MobilePay (Vipps MobilePay developer API), Quickpay, Clearhaus.
- **Ejendomme:** Boliga, Boligsiden API-scraping/wrappers.
- **Rekruttering:** Jobnet, Jobindex åbne feeds.

---

## 4. Functional Requirements

### FR-1: Automated Ecosystem & Package Scanner
- Query the GitHub Search API using authenticated headers for repositories matching platform keywords, topics (e.g., `dawa`, `cvr`, `mcp-server`, `danish-api`), and Danish developer organizations.
- Query npm and PyPI search endpoints for published packages containing Danish platform keywords.
- Parse package metadata (name, description, repo URL, license, latest release date).

### FR-2: Deterministic Live Catalog Deduplication
- Fetch active catalog entries dynamically from `https://vibetrends.dk/api/{skills,vibes,cli,mcp-servers}`.
- Model-free deduplication: normalizes URLs, extracts GitHub `owner/repo` keys, and slugifies names to drop already indexed or previously reviewed entries.

### FR-3: Minimum Viability Gate
- Check repository status:
  - Non-archived.
  - Non-empty README (`size > 100 bytes`).
  - Last commit or release within the last 18 months.
  - Has recognizable entry point (`package.json`, `setup.py`, `pyproject.toml`, or `SKILL.md`).
- Candidates failing the gate are dropped with a logged reason.

### FR-4: Candidate Buffer Management (`danish_candidate_buffer.json`)
- Store qualified candidates in `~/.hermes/knowledge/danish_candidate_buffer.json`.
- Each candidate includes:
  - `name` / `title`
  - `type` (`cli`, `mcp`, `skill`, `vibe`)
  - `tier`: `Acquisition` (Danish platform)
  - `url` & `repo`
  - `description_hint`
  - `discovered_at` & `last_activity_date`
  - `status`: `buffered` | `processed` | `rejected`
- Idempotent: re-running discovery updates existing metadata without duplicate entries.

### FR-5: Seamless Content Loop Integration
- Update `project_audit_loop.py` discovery logic to read buffered candidates from `danish_candidate_buffer.json` prior to falling back to local skills.
- Mark processed candidates as `processed` upon submission to `/api/agentauth`.

---

## 5. Non-Functional & Security Constraints

1. **Zero Metered API Token Usage:**
   - Discovery, deduplication, and quality filtering run 100% deterministically in Python.
   - Evaluation and writing run strictly on Claude Code Pro/Max subscription (`invoke_claude.py`).
2. **Security & Sandbox Isolation (GHSA-rhgp-j443-p4rf):**
   - Grounding dry-runs for discovered npm/pip packages execute inside transient Docker containers (`nikolaik/python-nodejs:python3.11-nodejs20`) with strict memory/CPU limits and zero host secrets.
3. **Rate Limit Hygiene:**
   - GitHub API requests include `Authorization: token GITHUB_TOKEN` to access the 5,000 req/hour quota.
   - Implements backoff and respectful pagination.

---

## 6. Success Criteria

1. **Discovery Yield:** Scanner discovers and buffers at least 15 valid, unindexed Danish platform developer tools on its initial execution.
2. **Zero Duplicate Leaks:** 100% of already indexed entries (such as `aula-mcp` or `cvr-api`) are filtered before any LLM prompt is constructed.
3. **Clean Review Queue Ingestion:** Buffer candidates flow through `project_audit_loop.py --mode content` under `env -i`, resulting in HTTP 202 pending rows with authentic Danish descriptions and concrete falsifiable claims.
