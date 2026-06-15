# Technical Implementation Plan & Task Breakdown: State Persistence & API Integration

This document breaks down the implementation steps needed to satisfy the requirements defined in [spec_vibetrends_persistence.md](file:///Users/kasperlandsvig/Documents/Claude%20Cowork/projects/vibetrends-dk/docs/spec_vibetrends_persistence.md).

---

## Phase 1: Database Operations & Route Handlers (Foundation)

- [ ] **Task 1: Extend Database Functions in db.ts**
  - **Acceptance**: Add helper functions to `src/lib/db.ts` for adding projects, deleting projects, deleting threads, deleting replies, adding agents, and deleting agents.
  - **Verify**: Functions export correctly, types are preserved.
  - **Files**: [src/lib/db.ts](file:///Users/kasperlandsvig/Documents/Claude%20Cowork/projects/vibetrends-dk/src/lib/db.ts)
  - **Scope**: Small

- [ ] **Task 2: Implement Showcase & Agent Mutation API Routes**
  - **Acceptance**: Expose POST and DELETE handlers under `/api/showcase` and `/api/agents`.
  - **Verify**: API calls with `fetch` succeed and return modified databases.
  - **Files**:
    - `src/app/api/showcase/route.ts`
    - `src/app/api/agents/route.ts`
  - **Scope**: Medium

- [ ] **Task 3: Implement Forum Thread & Reply Mutation API Routes**
  - **Acceptance**: Expose POST and DELETE handlers under `/api/forum`, `/api/forum/thread`, and `/api/forum/reply`.
  - **Verify**: API requests create threads, add replies, and delete them correctly.
  - **Files**:
    - `src/app/api/forum/route.ts`
    - `src/app/api/forum/thread/route.ts`
    - `src/app/api/forum/reply/route.ts`
  - **Scope**: Medium

---

## Phase 2: Auth Simulation & Login Prompts

- [ ] **Task 4: Create Simulated Auth Provider**
  - **Acceptance**: Create a client-side context that stores current user details (email, username, provider: google/github/email) in localStorage/cookie.
  - **Verify**: Renders active state, supports logging in and out.
  - **Files**:
    - `src/app/components/AuthProvider.tsx`
    - [src/app/layout.tsx](file:///Users/kasperlandsvig/Documents/Claude%20Cowork/projects/vibetrends-dk/src/app/layout.tsx)
  - **Scope**: Medium

- [ ] **Task 5: Implement Login Prompts & Modals**
  - **Acceptance**: Add a Login Modal UI supporting email input, Google link, and GitHub link, popping up when required or when clicking "Login".
  - **Verify**: Modal works, registers session correctly.
  - **Files**:
    - `src/app/components/LoginModal.tsx`
    - [src/app/components/Header.tsx](file:///Users/kasperlandsvig/Documents/Claude%20Cowork/projects/vibetrends-dk/src/app/components/Header.tsx)
  - **Scope**: Medium

---

## Phase 3: Frontend Integration & Deletes

- [ ] **Task 6: Connect Showcase UI to Endpoints**
  - **Acceptance**: Enable Showcase forms to POST to API, fetch items dynamic-ready, and show Delete buttons on items created by the user.
  - **Verify**: Projects successfully created, deleted, and upvoted persist across browser reloads.
  - **Files**:
    - [src/app/showcase/page.tsx](file:///Users/kasperlandsvig/Documents/Claude%20Cowork/projects/vibetrends-dk/src/app/showcase/page.tsx)
  - **Scope**: Medium

- [ ] **Task 7: Connect Forum UI to Endpoints**
  - **Acceptance**: Update Forum threads to load from `/api/forum`, allow writing new threads/replies with anonymous fallback (`@vibecoder_XXXXX`), and support thread/reply deletion.
  - **Verify**: Forum data persists correctly, random names generated if user is guest.
  - **Files**:
    - [src/app/forum/page.tsx](file:///Users/kasperlandsvig/Documents/Claude%20Cowork/projects/vibetrends-dk/src/app/forum/page.tsx)
  - **Scope**: Medium

- [ ] **Task 8: Connect Agents UI to Endpoints**
  - **Acceptance**: Enable registering new agents/MCP servers via `/api/agents`, show delete button on user-submitted agents, and persist list in cache.
  - **Verify**: Agent creation and deletions persist correctly.
  - **Files**:
    - [src/app/agents/page.tsx](file:///Users/kasperlandsvig/Documents/Claude%20Cowork/projects/vibetrends-dk/src/app/agents/page.tsx)
  - **Scope**: Medium
