-- Update description_da for Impeccable skill (slug: impeccable)
--
-- Idempotent & reversible.

update public.skills
   set description_da = '* Fjerner det typiske, klichéfyldte AI-look og renser dit layout for unødvendigt visuelt rod.
* Opretter automatisk en `DESIGN.md`-fil i dit projekt, som tvinger din AI til konsekvent at overholde dine faste designregler.
* Giver dig enkle kommandoer som `/polish` og `/distill` til at styre din AI''s designvalg uden lange prompts.
* Skaber en klar rød tråd og et roligt overblik, så siden er nem og behagelig at navigere i.
* Vælger automatisk harmoniske farver, god kontrast og skarp typografi til dit indhold.
* Tilføjer diskrete overgange og lækre detaljer, der får brugerfladen til at føles levende.
* Kom nemt i gang på under et minut ved at køre `npx impeccable install` i dit projekt.'
 where slug = 'impeccable';
