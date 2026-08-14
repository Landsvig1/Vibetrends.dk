-- Set mikkelkrogsholm as author/contributor for Rentemester (slug: rentemester, id: p_1782890295301).
--
-- The row was previously created with an empty author string.
--
-- Idempotent: keyed by slug and id.
-- Reversible:
--   update public.vibes set author = '' where slug = 'rentemester' and id = 'p_1782890295301';

update public.vibes
   set author = 'mikkelkrogsholm'
 where slug = 'rentemester'
    or id = 'p_1782890295301';
