-- Add a source_url column to public.agents (canonical repo/site for a tool,
-- like skills' github_url) and backfill it for the 13 Danish MCP/CLI entries
-- imported on 2026-07-03, whose source links were temporarily appended to the
-- description text ("Kilde: …" / "Source: …") because no column existed.
-- The backfill also strips those description suffixes (the link is structural
-- now) and simplifies two install commands that contained '&&' — the
-- agentSchema validator forbids shell metacharacters in installCommand, and
-- curated rows should honor the same invariant; full build steps live at the
-- source link.
--
-- Idempotent: add column if not exists; every UPDATE converges (fixed values,
-- and the regexp strips match nothing once removed).
-- Rollback: alter table public.agents drop column if exists source_url;
-- (the stripped "Kilde:/Source:" description suffixes are re-derivable from
-- source_url if ever needed).

alter table public.agents add column if not exists source_url text;

update public.agents set source_url = v.url
from (values
  ('FirmaAPI MCP',            'https://firmaapi.dk/mcp'),
  ('Nordic Registry MCP',     'https://github.com/olgasafonova/nordic-registry-mcp-server'),
  ('mcp-danish-cvr',          'https://github.com/robobobby/mcp-danish-cvr'),
  ('Danmarks Statistik MCP',  'https://github.com/wdkmp/mcp-dst-remote'),
  ('mcp-danish-weather',      'https://github.com/robobobby/mcp-danish-weather'),
  ('mcp-danish-energy',       'https://github.com/robobobby/mcp-danish-energy'),
  ('mcp-danish-addresses',    'https://github.com/robobobby/mcp-danish-addresses'),
  ('Rejseplanen MCP',         'https://github.com/ShredderAlex/rejseplanen-mcp-fastmcp'),
  ('aula-mcp',                'https://github.com/Casperjuel/aula-mcp'),
  ('aula-mcp-server',         'https://github.com/ilenhart/aula-mcp-server'),
  ('aula (API-klient)',       'https://github.com/scaarup/aula'),
  ('mcp-norwegian-companies', 'https://github.com/robobobby/mcp-norwegian-companies'),
  ('mcp-finnish-companies',   'https://github.com/robobobby/mcp-finnish-companies')
) as v(name, url)
where public.agents.name = v.name;

-- Strip the now-redundant source suffix from the imported descriptions.
update public.agents
set description_da = regexp_replace(description_da, '\s*Kilde: \S+$', ''),
    description_en = regexp_replace(description_en, '\s*Source: \S+$', '')
where description_da ~ '\s*Kilde: \S+$' or description_en ~ '\s*Source: \S+$';

-- Honor the no-shell-metacharacters invariant on install_command.
update public.agents
set install_command = 'git clone https://github.com/wdkmp/mcp-dst-remote'
where name = 'Danmarks Statistik MCP';

update public.agents
set install_command = 'git clone https://github.com/ShredderAlex/rejseplanen-mcp-fastmcp'
where name = 'Rejseplanen MCP';

update public.agents
set install_command = 'git clone https://github.com/ilenhart/aula-mcp-server'
where name = 'aula-mcp-server';

-- ---------------------------------------------------------------------------
-- POST-MIGRATION VERIFICATION (run manually after applying; not executed here)
-- ---------------------------------------------------------------------------
--   -- Expect 13 rows with a source_url:
--   select count(*) from public.agents where source_url is not null;
--   -- Expect 0 rows still carrying a text suffix:
--   select count(*) from public.agents where description_da like '%Kilde: %' or description_en like '%Source: %';
--   -- Expect 0 rows with shell metacharacters in install_command:
--   select count(*) from public.agents where install_command ~ '[;&|`$<>]';
