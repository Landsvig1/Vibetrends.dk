-- Point five skills at their own subdirectory instead of a monorepo root.
--
-- These rows were seeded with the repo root URL, so both the "View on GitHub"
-- link and the fetched documentation (see 20260728000000) resolved to a README
-- shared by every sibling skill in that repo — the near-duplicate content
-- problem the doc snapshot exists to fix.
--
-- scripts/refresh-skill-docs.mjs matches a skill to its own directory
-- automatically, but only on an EXACT directory-name match: attaching the wrong
-- skill's documentation is worse than showing a generic README. These five name
-- their directory differently upstream (expo prefixes with `expo-`, and
-- marketing drops the `-strategy` suffix), so the correct fix is the data, not
-- a fuzzier matcher.
--
-- Each mapping was verified by reading the target SKILL.md's frontmatter and
-- confirming it describes the same skill as the row's own description:
--
--   building-native-ui   -> expo-native-ui      "native-feeling Expo screens, native controls"
--   native-data-fetching -> expo-data-fetching  "network requests, caching, offline support"
--   upgrading-expo       -> expo-upgrade        "upgrading Expo SDK versions"
--   launch-strategy      -> launch              "plan a product launch, go-to-market"
--   pricing-strategy     -> pricing             "pricing decisions, packaging, monetization"
--
-- Idempotent: each statement is keyed by id and guarded on the old value, so a
-- re-run after the URL has already been corrected is a no-op.

update public.skills set github_url = 'https://github.com/expo/skills/tree/main/plugins/expo/skills/expo-native-ui'
 where id = 'seed_building-native-ui' and github_url = 'https://github.com/expo/skills';

update public.skills set github_url = 'https://github.com/expo/skills/tree/main/plugins/expo/skills/expo-data-fetching'
 where id = 'seed_native-data-fetching' and github_url = 'https://github.com/expo/skills';

update public.skills set github_url = 'https://github.com/expo/skills/tree/main/plugins/expo/skills/expo-upgrade'
 where id = 'seed_upgrading-expo' and github_url = 'https://github.com/expo/skills';

update public.skills set github_url = 'https://github.com/coreyhaines31/marketingskills/tree/main/skills/launch'
 where id = 'seed_launch-strategy' and github_url = 'https://github.com/coreyhaines31/marketingskills';

update public.skills set github_url = 'https://github.com/coreyhaines31/marketingskills/tree/main/skills/pricing'
 where id = 'seed_pricing-strategy' and github_url = 'https://github.com/coreyhaines31/marketingskills';

-- Re-run scripts/refresh-skill-docs.mjs for these ids afterwards so the stored
-- doc follows the corrected URL:
--
--   GITHUB_TOKEN=$(gh auth token) node --env-file=.env.local \
--     scripts/refresh-skill-docs.mjs --only seed_building-native-ui \
--     --only seed_native-data-fetching --only seed_upgrading-expo \
--     --only seed_launch-strategy --only seed_pricing-strategy
--
-- Rollback (restores the repo-root URLs; re-run the refresh afterwards):
--
--   update public.skills set github_url = 'https://github.com/expo/skills'
--    where id in ('seed_building-native-ui','seed_native-data-fetching','seed_upgrading-expo');
--   update public.skills set github_url = 'https://github.com/coreyhaines31/marketingskills'
--    where id in ('seed_launch-strategy','seed_pricing-strategy');
