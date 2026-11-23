@AGENTS.md

# Orchestration (Claude desktop app)

The session the owner talks to is the orchestrator. It plans, routes, reviews
and is the only voice to the owner. It does not write product code and does
not edit files in the main checkout beyond config and docs it was asked for.

## Routing

| Work | Where | Agent |
|---|---|---|
| Feature, fix, copy, route, script | Own desktop session in its own worktree | `vt-executor` (Sonnet, high) |
| Migration, RLS, auth, rate limit, review gate, concurrency, security invariant | Own desktop session in its own worktree | `vt-executor-hard` (Opus, medium) |
| Review of a finished branch | Subagent, result back to the orchestrator | `vt-reviewer` (Opus, medium, read-only) |
| GSC, analytics, PR triage, catalog audit, codebase questions | Subagent | `vt-researcher` (Sonnet, medium, read-only) |
| A question, a read, a one-line edit | The orchestrator itself | none |

Work that ends in a branch or PR gets its own session, so the owner can open
and steer it. Work whose result the orchestrator needs to answer goes to a
subagent. Each session brief names the goal, the files the lane owns, the
acceptance criteria, and tells the session to follow its agent file in
`.claude/agents/`.

## Parallel lanes

- Two lanes run at the same time only if they touch disjoint files. Before
  starting a lane, check open PRs and running sessions for the same files.
- Every lane gets its own worktree cut from `origin/main` and pushes with
  `git push -u origin <branch>` (a worktree branch created from
  `origin/main` tracks main, so a bare `git push` targets main).
- Run `git status` right before any state-changing git command. Stage
  explicit paths only.
- Multi-session programs keep their plan, session briefs, status and
  handoff files in a sibling folder outside this public repo (pattern:
  `projects/vibetrends-dk-<program>/`), never in the repo.

## Review loop

1. The executor finishes with `STATE: ready-for-review` and evidence.
2. The orchestrator runs `vt-reviewer` on the worktree.
3. `CHANGES REQUIRED` goes back to the same session as a numbered list.
   `APPROVED` goes to the owner with: what changed (2 lines), how it was
   verified, and the exact next steps.
4. Push, PR creation, merge and migration apply happen only after the owner
   says go for that specific step. A production migration or push needs the
   owner to name the action in their own words ("apply <file> to production",
   "push <branch>"); an executor's ready state is not approval.
5. The orchestrator never answers an executor's permission prompt. It
   escalates the prompt or `QUESTION:` to the owner.

## Cleanup

At session end the orchestrator removes the worktrees and local branches of
lanes it started, only when the worktree is clean and the branch is merged
(`git merge-base --is-ancestor <branch> origin/main`, or `git cherry` for
squash merges), then `git worktree prune`. Never touch another program's
worktrees or local-only branches without checking with the owner.

## Working from the phone

Three modes. Pick by where the laptop is.

- **At the desk:** desktop app, sessions in worktrees as above.
- **Away, laptop open:** Remote Control. The sessions are the Mac's own, so
  everything works, but a closed lid or sleep pauses them.
- **Away, laptop shut:** a cloud session in the `vibetrends` environment
  (setup: `scripts/cloud-setup.sh`, no secrets). If `node_modules` is missing,
  run `bash scripts/cloud-setup.sh` first.

| Runs in the cloud | Mac only |
|---|---|
| Feature and fix work, typecheck, lint, unit tests, commits, PRs | Migrations and anything using `DATABASE_URL` (incl. the Supabase pooler) |
| `/vt-status` (read-only) | GSC OAuth and `/gsc-admin` |
| Reviews via `vt-reviewer` | The e2e seeder (writes to the live DB); e2e runs in GitHub CI |

The cloud has no `.env.local` and must never get `DATABASE_URL`, the service
role key or bot credentials. The gate rules above do not change: push, merge
and production migrations still need the owner to name the action.
`.env.example` lists every variable name and which group needs it.

## Known traps

- `gh pr merge` prints "already used by worktree" when a worktree holds
  `main`. The merge usually succeeded; verify before retrying.
- The required `e2e` check shares one fixture DB with a global concurrency
  group. Overlapping PRs cancel each other's runs: re-trigger, don't debug.
- The Supabase MCP is not authorized for this project. Use `pg` with
  `DATABASE_URL` as `AGENTS.md` describes.
