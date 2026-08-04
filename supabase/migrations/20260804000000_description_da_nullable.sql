-- Make description_da nullable on skills, vibes and agents, and clear the rows
-- where it is a verbatim copy of the English.
--
-- The Danish column has existed since the initial schema, but every write path
-- (createSkill, createProject, createAgent in src/lib/db.ts) takes ONE
-- description argument and writes it to both description_da and
-- description_en. With both columns NOT NULL there is no way to distinguish
-- "someone wrote Danish here" from "the English got copied in", so a
-- fall-back-to-English read path is impossible to express — the fallback can
-- never fire, because the column is never empty.
--
-- Nulling the copies makes `null` mean "not translated yet". Verified counts
-- immediately before writing this migration (2026-08-04):
--
--     skills          100 rows, 100 with description_da = description_en
--     vibes            14 rows,  14 with description_da = description_en
--     agents           15 rows,   4 with description_da = description_en
--                                (11 already carry genuine Danish)
--
-- The equality predicate is deliberate: it targets only rows where the Danish
-- is provably a copy, so the 11 genuinely-translated agents rows are left
-- alone. A real Danish description that happens to be byte-identical to its
-- English one would also be cleared, which at description length is
-- vanishingly unlikely and costs a paraphrase rather than data.
--
-- No visible change: these rows render English today via the duplicate, and
-- render English tomorrow via the fallback in mapSkill/mapProject/mapAgent.
--
-- Idempotent: `drop not null` is a no-op on re-run, and the update converges
-- because a nulled row no longer matches the predicate.
--
-- Reversible / rollback (restores the copy, then the constraint — run in this
-- order or the NOT NULL will fail on the nulled rows):
--
--   update public.skills set description_da = description_en where description_da is null;
--   update public.vibes  set description_da = description_en where description_da is null;
--   update public.agents set description_da = description_en where description_da is null;
--   alter table public.skills alter column description_da set not null;
--   alter table public.vibes  alter column description_da set not null;
--   alter table public.agents alter column description_da set not null;

alter table public.skills alter column description_da drop not null;
alter table public.vibes  alter column description_da drop not null;
alter table public.agents alter column description_da drop not null;

update public.skills set description_da = null where description_da = description_en;
update public.vibes  set description_da = null where description_da = description_en;
update public.agents set description_da = null where description_da = description_en;

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- All three columns are nullable now (expect YES, YES, YES):
--   select table_name, is_nullable from information_schema.columns
--   where table_schema = 'public' and column_name = 'description_da'
--     and table_name in ('skills','vibes','agents') order by table_name;
--
--   -- Untranslated rows are now null (expect 0, 0, 11):
--   select count(*) from public.skills where description_da is not null;
--   select count(*) from public.vibes  where description_da is not null;
--   select count(*) from public.agents where description_da is not null;
--
--   -- No row kept a copy (expect 0 for each):
--   select count(*) from public.skills where description_da = description_en;
--   select count(*) from public.vibes  where description_da = description_en;
--   select count(*) from public.agents where description_da = description_en;
