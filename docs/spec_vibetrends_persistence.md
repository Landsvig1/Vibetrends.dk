# Spec: vibetrends.dk State Persistence & API Integration

## Objective
Gøre vibetrends.dk fuldt persisterende og dynamisk ved at erstatte alle klientside-stater (modals, upvotes, oprettelser) med Next.js API-kald, som muterer og henter data direkte fra den globale cache-database. Understøtte autogenererede brugernavne for u-authenticatede brugere, tilføje en login-prompt og implementere slettefunktioner til oprydning.

## Tech Stack
*   Next.js `16.2.9` (App Router)
*   React `19.2.4`
*   Tailwind CSS `v4`
*   TypeScript strict-mode

## Commands
*   **Dev server**: `npm run dev`
*   **Build code**: `npm run build`
*   **Lint checks**: `npm run lint`

## Project Structure
*   `src/app/api/` $\rightarrow$ Next.js 16 Route Handlers (REST endpoints)
    *   `api/skills/` $\rightarrow$ Hent og book skills
    *   `api/showcase/` $\rightarrow$ Hent, opret og slet projekter
    *   `api/forum/` $\rightarrow$ Hent og slet tråde
    *   `api/forum/thread/` $\rightarrow$ Opret ny tråd
    *   `api/forum/reply/` $\rightarrow$ Opret og slet svar på tråd
    *   `api/agents/` $\rightarrow$ Hent, registrer og slet agenter/MCP-værktøjer
*   `docs/` $\rightarrow$ Dokumentation og specifikationer

---

## Code Style
API endpoints skal følge standard Next.js 16 Route Handlers syntax, med fejlsikring og korrekte HTTP statuskoder.

```typescript
// Eksempel: src/app/api/forum/thread/route.ts
import { NextResponse } from "next/server";
import { createThread } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const { title, author, category, content } = await request.json();

    if (!title || !category || !content) {
      return NextResponse.json(
        { error: "Manglende påkrævede felter" },
        { status: 400 }
      );
    }

    // Autogenerer navn hvis det mangler
    const finalAuthor = author || `vibecoder_${Math.random().toString(36).substring(2, 7)}`;

    const newThread = await createThread(title, finalAuthor, category, content);
    return NextResponse.json(newThread, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Ugyldig anmodning" }, 
      { status: 400 }
    );
  }
}
```

---

## Testing Strategy
Manuelle e2e-tests samt build-validering. Da dette er et runtime-persisterende setup, tjekkes det via konsollen, at state overlever navigering mellem ruter.

---

## Boundaries
*   **Always**: Kør `npm run build` før merge; valider payloads i Route Handlers.
*   **Ask first**: Ændringer i mock-databasens datamodeller (interface ændringer i `db.ts`).
*   **Never**: Gemme følsomme data (fx booking-beskeder) i rå, ubeskyttede offentlige API-kald uden minimal payload sanitizing.

---

## Success Criteria
- [ ] Oprettelse af nye Showcase-projekter persisteres i `db.ts` cache og sletning via `DELETE /api/showcase` virker.
- [ ] Oprettelse af Forum-tråde og tilføjelse af svar sker asynkront via API-kald og gemmes i cache. Sletning via `DELETE /api/forum` fjerner tråden.
- [ ] Registrering af nye agenter/MCP-værktøjer persisteres i databasen, og de kan slettes via `DELETE /api/agents`.
- [ ] Hvis brugernavn udelades i forum/showcase, autogenereres et tilfældigt `@vibecoder_XXXXX` brugernavn.
- [ ] Der tilføjes en login-prompt/modal i UI'et, der simulerer login med Email, Gmail eller GitHub og sætter et klientside-flag (fx cookie eller localStorage).
- [ ] Knapper til sletning tilføjes i brugerfladen på egne/nyoprettede emner.
