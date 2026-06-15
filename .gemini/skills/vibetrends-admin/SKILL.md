---
name: vibetrends-admin
description: Navigation and administration guide for the vibetrends.dk community platform. Use when an agent needs to manage content, users, or system configuration for the Next.js/GitHub-backend stack.
---

# VibeTrends.dk Admin Skill

This skill guides agents in maintaining and evolving the `vibetrends.dk` platform.

## Architecture Overview

- **Frontend**: Next.js 15 (App Router), Tailwind CSS 4, shadcn/ui.
- **Backend**: GitHub-as-a-backend (Octokit REST). Data lives in `src/data/db.json`.
- **Theme**: Light "off-white" aesthetic. Colors: `--background (#FAF9F6)`, `--accent-primary (#264021)`.
- **Mascot**: Koala (SVG component in `src/app/components/KoalaIcon.tsx`).

## Content Management (GitHub Backend)

All dynamic data (Skills, Showcase, Forum, Agents) is persisted via `src/lib/db.ts` which calls `src/lib/github.ts`.

### Schema Reference: `src/data/db.json`

- **Skills**: Community resource library. No pricing/booking logic.
- **Showcase**: Vibe-coded project displays.
- **Forum**: Threaded discussions with upvotes.
- **Agents**: Registry for MCP servers and system prompts.

### Workflow: Updating Data

Always use the async helper functions in `src/lib/db.ts` (e.g., `createSkill`, `deleteThread`). These functions handle GitHub SHA management and base64 encoding automatically.

## UI/UX Standards

- **Buttons**: Use the `.btn-primary` or `.btn-secondary` classes.
- **Modals**: Must be rendered outside `<header>` (see `Header.tsx`) to avoid `backdrop-filter` trap.
- **Icons**: Favor `KoalaIcon` for brand elements and `lucide-react` for UI actions.
- **Language**: User-facing UI is Danish. Code and commits are English.

## SEO & Security

- **Metadata**: Dynamic pages MUST implement `generateMetadata` using data from `getDb()`.
- **Structured Data**: Every content page should inject JSON-LD (WebSite, SoftwareApplication, etc.).
- **Security**: All POST/DELETE routes MUST validate with Zod and verify the `x-username` header.

## Common Tasks

- **Adding a Placeholder**: Edit `src/data/db.json` directly. Keep exactly 3 items per category.
- **Deploying**: Run `npx vercel --yes` for previews or `vercel --prod` for production.
- **Env Vars**: Requires `GITHUB_ACCESS_TOKEN`, `GITHUB_OWNER`, and `GITHUB_REPO` in production.
