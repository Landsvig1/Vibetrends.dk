-- Add the StarRewards vibe project (contributor: Martin Jeppesen).
--
-- A gaming-inspired reward system for families: parents create activities and
-- rewards, the child tracks their own progress, earns points and picks what to
-- save up for. Built for the contributor's own son, then opened up after other
-- families started using it.
--
-- description_da is a real Danish description written from the contributor's
-- own (Danish) submission text — it is NOT a copy of description_en, so the
-- withEnglishFallback path in src/lib/db.ts stays meaningful (see AGENTS.md).
--
-- image_url is left at the table default: the site is unreachable from the
-- environment this migration was authored in, so no thumbnail could be
-- captured. Replace it with a real screenshot when one is available:
--   update public.vibes set image_url = '/images/starrewards.jpg' where slug = 'starrewards';
--
-- Idempotent: keyed by id, ON CONFLICT DO NOTHING, and skipped entirely if the
-- slug is already taken.
-- Reversible:
--   delete from public.vibes where id = 'p_1789413596112';

INSERT INTO public.vibes (
  id,
  slug,
  title_da,
  title_en,
  author,
  description_da,
  description_en,
  tools,
  prompts,
  upvotes,
  demo_url,
  is_danish,
  review_state
)
SELECT
  'p_1789413596112',
  'starrewards',
  'StarRewards',
  'StarRewards',
  'Martin Jeppesen',
  'Et simpelt, gaming-inspireret belønningssystem til familier. Som forælder opretter du aktiviteter, opgaver og belønninger, og barnet kan selv følge med, optjene points og vælge, hvad det vil spare op til. Det startede som et værktøj til udviklerens egen dreng, der har det svært, og er siden vokset, fordi det virkede: det har hjulpet med at bryde vaner, prøve nye ting og få hverdagens opgaver til at glide.',
  'A simple, gaming-inspired reward system for families. Parents set up activities, chores and rewards; the child tracks their own progress, earns points and chooses what to save up for. Built for the maker''s own son, who finds everyday routines hard, and grown from there after it started working — breaking habits, trying new things and getting ordinary tasks done.',
  '{}',
  '{}',
  1,
  'https://go.starrewards.app/',
  true,
  'approved'
WHERE NOT EXISTS (
  SELECT 1 FROM public.vibes WHERE slug = 'starrewards'
)
ON CONFLICT (id) DO NOTHING;
