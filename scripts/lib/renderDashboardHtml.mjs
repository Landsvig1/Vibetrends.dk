/**
 * Standalone Interactive HTML Dashboard Compiler for VibeTrends.dk Analytics
 * Renders a single-file, zero-dependency HTML dashboard with client-side tabs,
 * KPI delta badges, searchable tables, user-type segmentation, and actionable insights.
 */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderDeltaBadge(delta) {
  if (!delta || delta.direction === 'flat') {
    return `<span class="badge badge-neutral">0%</span>`;
  }
  const isUp = delta.direction === 'up';
  const cls = isUp ? 'badge-positive' : 'badge-negative';
  const icon = isUp ? '↑' : '↓';
  const prefix = isUp ? '+' : '';
  return `<span class="badge ${cls}">${icon} ${prefix}${delta.percent}%</span>`;
}

export function renderDashboardHtml(analyticsData) {
  const data = analyticsData || {};
  const vercel = data.vercel || {};
  const gsc = data.gsc || {};
  const supabase = data.supabase || {};
  const seo = data.seo || null;
  const funnel = supabase.funnel || null;
  const windowDays = data.windowDays || 30;
  const genDate = data.generatedAt ? new Date(data.generatedAt).toLocaleString('da-DK', { dateStyle: 'long', timeStyle: 'short' }) : 'Nu';

  // Totals & deltas
  const visitors = vercel.totals?.visitors || 0;
  const visitorsDelta = vercel.totals?.visitorsDelta;
  const pageviews = vercel.totals?.pageviews || 0;
  const pageviewsDelta = vercel.totals?.pageviewsDelta;
  
  const gscClicks = gsc.summary?.clicks || 0;
  const gscClicksDelta = gsc.summary?.clicksDelta;
  const gscImpressions = gsc.summary?.impressions || 0;
  const gscImpressionsDelta = gsc.summary?.impressionsDelta;

  const totalUsers = supabase.users?.total || 0;
  const currentSignups = supabase.users?.current || 0;
  const signupsDelta = supabase.users?.delta;
  const typesSummary = supabase.users?.typesSummary || { humans: 0, agents: 0, curatorBots: 0 };

  const topPages = vercel.topPages || [];
  const referrers = vercel.referrers || [];
  const countries = vercel.countries || [];
  const devices = vercel.devices || [];
  const os = vercel.os || [];

  const topQueries = gsc.topQueries || [];
  const gscPages = gsc.topPages || [];
  const opportunities = gsc.growthOpportunities || [];

  const signupsByDay = supabase.signupsByDay || [];
  const contentStats = supabase.content || [];
  const upvotesStats = supabase.upvotes || [];
  const apiActivity = supabase.apiActivity || [];
  const userProfiles = supabase.userProfiles || [];

  return `<!DOCTYPE html>
<html lang="da">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VibeTrends.dk — Brugeraktivitet & Telemetri</title>
  <style>
    :root {
      --bg: #FAF9F6;
      --card-bg: #FFFFFF;
      --foreground: #1C1917;
      --muted: #78716C;
      --border: #E7E5E4;
      --accent: #264021;
      --accent-light: #EBF3E8;
      --accent-hover: #1F341B;
      --positive: #15803D;
      --positive-bg: #DCFCE7;
      --negative: #B91C1C;
      --negative-bg: #FEE2E2;
      --neutral-bg: #F5F5F4;
      --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--foreground);
      font-family: var(--font-sans);
      line-height: 1.5;
      padding: 24px;
      -webkit-font-smoothing: antialiased;
    }

    .container {
      max-width: 1200px;
      margin: 0 auto;
    }

    header {
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 12px;
    }

    .brand-title {
      font-size: 24px;
      font-weight: 700;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .meta-tag {
      font-size: 13px;
      color: var(--muted);
      margin-top: 4px;
    }

    .pill-period {
      background: var(--accent-light);
      color: var(--accent);
      font-weight: 600;
      font-size: 13px;
      padding: 4px 12px;
      border-radius: 9999px;
      display: inline-block;
    }

    /* KPI Grid */
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .kpi-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 16px 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }

    .kpi-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .kpi-value-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
    }

    .kpi-value {
      font-size: 26px;
      font-weight: 700;
      color: var(--foreground);
    }

    .badge {
      font-size: 12px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 6px;
      display: inline-flex;
      align-items: center;
    }

    .badge-positive { background: var(--positive-bg); color: var(--positive); }
    .badge-negative { background: var(--negative-bg); color: var(--negative); }
    .badge-neutral { background: var(--neutral-bg); color: var(--muted); }
    .badge-human { background: #E0E7FF; color: #3730A3; }
    .badge-agent { background: #FEF3C7; color: #92400E; }
    .badge-bot { background: #F3E8FF; color: #6B21A8; }

    /* Tabs */
    .tabs-nav {
      display: flex;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
      overflow-x: auto;
    }

    .tab-btn {
      background: none;
      border: none;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.15s ease;
      white-space: nowrap;
    }

    .tab-btn:hover {
      color: var(--foreground);
    }

    .tab-btn.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    .tab-pane {
      display: none;
    }

    .tab-pane.active {
      display: block;
    }

    /* Content Cards & Tables */
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }

    .card-title {
      font-size: 17px;
      font-weight: 600;
      margin-bottom: 14px;
      color: var(--accent);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .table-container {
      width: 100%;
      overflow-x: auto;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      text-align: left;
    }

    th {
      padding: 10px 12px;
      background: var(--bg);
      color: var(--muted);
      font-weight: 600;
      border-bottom: 1px solid var(--border);
    }

    td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
      color: var(--foreground);
    }

    tr:last-child td {
      border-bottom: none;
    }

    tr:hover td {
      background: rgba(0,0,0,0.01);
    }

    .search-bar {
      width: 100%;
      max-width: 320px;
      padding: 8px 12px;
      border: 1px solid var(--border);
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 12px;
      background: #FFF;
      outline: none;
    }

    .search-bar:focus {
      border-color: var(--accent);
    }

    .filter-pills {
      display: flex;
      gap: 6px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }

    .filter-pill {
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid var(--border);
      background: #FFF;
      cursor: pointer;
      color: var(--muted);
    }

    .filter-pill.active {
      background: var(--accent);
      color: #FFF;
      border-color: var(--accent);
    }

    /* Visual Bars */
    .bar-row {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
      font-size: 13px;
    }

    .bar-label {
      width: 110px;
      font-weight: 500;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .bar-track {
      flex: 1;
      height: 10px;
      background: var(--neutral-bg);
      border-radius: 9999px;
      overflow: hidden;
    }

    .bar-fill {
      height: 100%;
      background: var(--accent);
      border-radius: 9999px;
    }

    .bar-count {
      width: 60px;
      text-align: right;
      font-weight: 600;
      color: var(--muted);
    }

    /* Opportunity Cards */
    .opp-card {
      border-left: 4px solid var(--accent);
      background: var(--card-bg);
      border-top: 1px solid var(--border);
      border-right: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      border-radius: 6px;
      padding: 14px 16px;
      margin-bottom: 12px;
    }

    .opp-term {
      font-size: 15px;
      font-weight: 700;
      color: var(--foreground);
      margin-bottom: 4px;
    }

    .opp-stats {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .opp-rec {
      font-size: 13px;
      color: var(--accent);
      font-weight: 500;
      background: var(--accent-light);
      padding: 6px 10px;
      border-radius: 4px;
      display: inline-block;
    }

    .grid-2 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
      gap: 20px;
    }

    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <div class="brand-title">🐨 VibeTrends.dk — Brugeraktivitet</div>
        <div class="meta-tag">Rapport genereret: ${escapeHtml(genDate)} &bull; VibeTrends Telemetri</div>
      </div>
      <div>
        <span class="pill-period">Sidste ${windowDays} dage (med WoW/MoM delta)</span>
      </div>
    </header>

    <!-- Top KPI Grid -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Unikke Besøgende (Vercel)</div>
        <div class="kpi-value-row">
          <div class="kpi-value">${visitors}</div>
          ${renderDeltaBadge(visitorsDelta)}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Sidevisninger (Vercel)</div>
        <div class="kpi-value-row">
          <div class="kpi-value">${pageviews}</div>
          ${renderDeltaBadge(pageviewsDelta)}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Google Søge-Klik (GSC)</div>
        <div class="kpi-value-row">
          <div class="kpi-value">${gscClicks}</div>
          ${renderDeltaBadge(gscClicksDelta)}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Google Visninger (GSC)</div>
        <div class="kpi-value-row">
          <div class="kpi-value">${gscImpressions}</div>
          ${renderDeltaBadge(gscImpressionsDelta)}
        </div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Nye Tilmeldinger (Supabase)</div>
        <div class="kpi-value-row">
          <div class="kpi-value">${currentSignups}</div>
          ${renderDeltaBadge(signupsDelta)}
        </div>
      </div>
    </div>

    <!-- Navigation Tabs -->
    <div class="tabs-nav">
      <button class="tab-btn active" onclick="switchTab('overview')">Overblik</button>
      <button class="tab-btn" onclick="switchTab('user-types')">Brugertyper & Aktivitet</button>
      <button class="tab-btn" onclick="switchTab('traffic')">Trafik & Sider</button>
      <button class="tab-btn" onclick="switchTab('search')">Google Søgning & SEO</button>
      <button class="tab-btn" onclick="switchTab('users')">Agent Auth & Telemetri</button>
      <button class="tab-btn" onclick="switchTab('indexing')">Indeksering & Teknisk SEO</button>
      <button class="tab-btn" onclick="switchTab('opportunities')">Vækstmuligheder</button>
    </div>

    <!-- TAB 1: OVERVIEW -->
    <div id="tab-overview" class="tab-pane active">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Vigtigste Konklusioner</div>
          <div style="font-size: 14px; line-height: 1.7; color: var(--foreground);">
            <p style="margin-bottom: 10px;">
              <strong>🚀 Aula Breakout:</strong> Siderne for <code>aula-api-klient</code> og <code>aula-mcp</code> driver over 80% af alle organiske Google-klik med en høj CTR på 7–13%.
            </p>
            <p style="margin-bottom: 10px;">
              <strong>📈 Stærk Søgevisningsvækst:</strong> Google Search Console registrerede 556 visninger (+755%) i de seneste 30 dage.
            </p>
            <p style="margin-bottom: 10px;">
              <strong>👥 Brugere & Agenter:</strong> ${totalUsers} registrerede konti (${typesSummary.humans} mennesker, ${typesSummary.agents} AI-agenter, ${typesSummary.curatorBots} intern curator bot).
            </p>
            <p>
              <strong>💡 Næste Skridt:</strong> Optimer titler og meta descriptions på Side 1-nøgleord med 0% CTR (Boligsiden, Rejseplanen, Motion) for at konvertere visninger til klik.
            </p>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Katalog & Fællesskabsstatus</div>
          <table style="font-size: 13px;">
            <thead>
              <tr>
                <th>Entitet</th>
                <th>Totalt</th>
                <th>Bruger/Agent Skabt</th>
              </tr>
            </thead>
            <tbody>
              ${contentStats.map(c => `
                <tr>
                  <td><strong>${escapeHtml(c.type)}</strong></td>
                  <td>${c.total}</td>
                  <td>${c.user_authored || 0}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div style="margin-top: 14px; font-size: 13px; color: var(--muted);">
            Opvotes: <strong>${upvotesStats.reduce((acc, u) => acc + Number(u.upvotes || 0), 0)}</strong> &bull; Forum tråde: <strong>0</strong>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 2: USER TYPES & ENGAGEMENT (NEW) -->
    <div id="tab-user-types" class="tab-pane">
      <div class="grid-3">
        <div class="kpi-card" style="border-top: 3px solid #3730A3;">
          <div class="kpi-label">🧑 Menneskelige Brugere</div>
          <div class="kpi-value">${typesSummary.humans}</div>
          <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">Google OAuth & Magic Link (f.eks. Relaite-skaber)</div>
        </div>
        <div class="kpi-card" style="border-top: 3px solid #D97706;">
          <div class="kpi-label">🤖 AI Coding Agenter</div>
          <div class="kpi-value">${typesSummary.agents}</div>
          <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">Anonyme API-sessioner (/api/agentauth)</div>
        </div>
        <div class="kpi-card" style="border-top: 3px solid #6B21A8;">
          <div class="kpi-label">⚙️ System Curator Bot</div>
          <div class="kpi-value">${typesSummary.curatorBots}</div>
          <div style="font-size: 12px; color: var(--muted); margin-top: 4px;">vibes-bot@vibetrends.dk (49 skills kurateret)</div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Hvor kommer brugerne fra? (Geografi & Oprindelse)</div>
          <div style="font-size: 13px; line-height: 1.6; margin-bottom: 12px;">
            <p style="margin-bottom: 8px;"><strong>Besøgende på web (Vercel):</strong></p>
            <ul style="padding-left: 20px; color: var(--muted); margin-bottom: 12px;">
              <li><strong>Danmark (54%):</strong> Primær målgruppe for danske Claude/MCP tools og Aula/Rejseplanen.</li>
              <li><strong>USA (37%):</strong> Globale AI-udviklere der søger efter Next.js/Motion skills og Claude Code patterns.</li>
              <li><strong>Tyskland / UK / Sverige / Norge (9%):</strong> Øvrig europæisk tech-trafik.</li>
            </ul>
            <p style="margin-bottom: 8px;"><strong>Registrerede konti:</strong></p>
            <ul style="padding-left: 20px; color: var(--muted);">
              <li><strong>Mennesker:</strong> Danske domæner (<code>.dk</code>), Hotmail og Google Workspace.</li>
              <li><strong>Agenter:</strong> Headless scripts, Hermes feeds og IDE CLI-kald.</li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Hvad har de tilføjet eller downloadet?</div>
          <div style="font-size: 13px; line-height: 1.6;">
            <p style="margin-bottom: 8px;"><strong>📦 Tilføjet Indhold (Submissions):</strong></p>
            <ul style="padding-left: 20px; color: var(--muted); margin-bottom: 12px;">
              <li><strong>Mennesker:</strong> Projektet <code>Relaite</code> (af @webdev82_vibe) + 2 upvotes.</li>
              <li><strong>Agenter:</strong> 8 indsendte skills (herunder <code>dk-techblog</code>, <code>simply-launch</code>, <code>gsc-admin</code>, <code>bot-pr-review</code>) holdt i Review Gate (pending).</li>
              <li><strong>Curator Bot:</strong> 49 godkendte og verificerede katalog-skills.</li>
            </ul>
            <p style="margin-bottom: 8px;"><strong>⚡ Forbrug & Connects (Interactions):</strong></p>
            <ul style="padding-left: 20px; color: var(--muted);">
              <li><strong>MCP Toolkald:</strong> Registrerede <code>mcp:*</code> endpoint events.</li>
              <li><strong>Agent Write Quotas:</strong> 20+ rate-limited write events afviklet sikkert.</li>
              <li><strong>Copy & Install:</strong> 1-click git clone og MCP JSON config-kopieringer via Connect Blocks.</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- User Profiles Table with Live Search and Type Filters -->
      <div class="card">
        <div class="card-title">
          <span>Oversigt over Alle Registrerede Brugere & Agenter (${userProfiles.length})</span>
        </div>

        <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px;">
          <input type="text" id="userFilterInput" class="search-bar" placeholder="Søg i brugere, agenter, skills, upvotes..." onkeyup="filterUserTable()">
          <div class="filter-pills">
            <button class="filter-pill active" onclick="filterUserType('all', this)">Alle (${userProfiles.length})</button>
            <button class="filter-pill" onclick="filterUserType('human', this)">Mennesker (${typesSummary.humans})</button>
            <button class="filter-pill" onclick="filterUserType('agent', this)">Agenter (${typesSummary.agents})</button>
            <button class="filter-pill" onclick="filterUserType('curator_bot', this)">System Bot (${typesSummary.curatorBots})</button>
          </div>
        </div>

        <div class="table-container">
          <table id="userProfilesTable">
            <thead>
              <tr>
                <th>Bruger / Identitet</th>
                <th>Type</th>
                <th>Oprindelse</th>
                <th>Oprettet</th>
                <th>Tilføjet Indhold</th>
                <th>Upvotes</th>
                <th>API Hændelser</th>
              </tr>
            </thead>
            <tbody>
              ${userProfiles.map(u => {
                const typeBadge = u.userType === 'human'
                  ? '<span class="badge badge-human">🧑 Menneske</span>'
                  : u.userType === 'curator_bot'
                  ? '<span class="badge badge-bot">⚙️ Curator Bot</span>'
                  : '<span class="badge badge-agent">🤖 AI Agent</span>';

                const contentBadge = (u.skillsCount + u.vibesCount + u.agentsCount) > 0
                  ? `<strong>${u.skillsCount} skills</strong>${u.skillsPending > 0 ? ` (${u.skillsPending} pending)` : ''}, ${u.vibesCount} vibes, ${u.agentsCount} agents`
                  : '<span style="color: var(--muted);">-</span>';

                const createdDate = u.created_at ? new Date(u.created_at).toLocaleDateString('da-DK', { dateStyle: 'short' }) : 'N/A';

                return `
                  <tr data-usertype="${escapeHtml(u.userType)}">
                    <td>
                      <div style="font-weight: 600;">${escapeHtml(u.displayName)}</div>
                      <div style="font-size: 11px; color: var(--muted); font-family: monospace;">${escapeHtml(u.id.slice(0, 13))}...</div>
                    </td>
                    <td>${typeBadge}</td>
                    <td><span style="font-size: 12px;">${escapeHtml(u.origin)}</span></td>
                    <td>${createdDate}</td>
                    <td>${contentBadge}</td>
                    <td><strong>${u.upvotesCount}</strong></td>
                    <td><code>${u.apiEventsCount}</code></td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 3: TRAFFIC & PAGES -->
    <div id="tab-traffic" class="tab-pane">
      <div class="card">
        <div class="card-title">Aktiveringsfunnel</div>
        ${!funnel ? `
          <p style="font-size:13px;color:var(--muted);">Ikke tilgængelig i denne kørsel.</p>
        ` : funnel.error ? `
          <p style="font-size:13px;color:var(--muted);">${escapeHtml(funnel.error)}</p>
        ` : `
          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">Besøgende</div>
              <div class="kpi-value-row"><div class="kpi-value">${visitors}</div></div>
              <div class="kpi-label">Vercel Analytics</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Sessioner der kopierede</div>
              <div class="kpi-value-row"><div class="kpi-value">${funnel.copySessions}</div>${renderDeltaBadge(funnel.copySessionsDelta)}</div>
              <div class="kpi-label">${visitors ? Math.round((funnel.copySessions / visitors) * 1000) / 10 : 0}% af besøgende</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Nye konti</div>
              <div class="kpi-value-row"><div class="kpi-value">${supabase.users?.current || 0}</div></div>
              <div class="kpi-label">i perioden</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Kopieringer i alt</div>
              <div class="kpi-value-row"><div class="kpi-value">${funnel.copyEvents}</div></div>
              <div class="kpi-label">${funnel.itemsCopied} forskellige emner, ${funnel.copiesBySignedIn} fra indloggede</div>
            </div>
          </div>
          ${funnel.topItems?.length ? `
            <div class="table-container" style="margin-top:16px;">
              <table>
                <thead><tr><th>Emne</th><th>Type</th><th>Kopieringer</th><th>Sessioner</th></tr></thead>
                <tbody>
                  ${funnel.topItems.map(it => `
                    <tr>
                      <td><strong>${escapeHtml(it.item_slug || '')}</strong></td>
                      <td>${escapeHtml(it.item_type || '')}</td>
                      <td>${it.copies}</td>
                      <td>${it.sessions}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          ` : `<p style="font-size:12px;color:var(--muted);margin-top:10px;">Ingen kopieringshændelser registreret endnu. Hændelserne begynder at tikke ind, når ConnectBlock-ændringen er deployet.</p>`}
        `}
      </div>


      <div class="card">
        <div class="card-title">Mest Besøgte Sider (Vercel Analytics)</div>
        <input type="text" id="trafficSearch" class="search-bar" placeholder="Søg i stier (f.eks. /skills, /cli)..." onkeyup="filterTable('trafficSearch', 'trafficTable')">
        <div class="table-container">
          <table id="trafficTable">
            <thead>
              <tr>
                <th>Sti (Request Path)</th>
                <th>Unikke Besøgende</th>
                <th>Sidevisninger</th>
              </tr>
            </thead>
            <tbody>
              ${topPages.map(p => `
                <tr>
                  <td><code>${escapeHtml(p.requestPath)}</code></td>
                  <td>${p.visitors}</td>
                  <td>${p.pageviews}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Trafikkilder (Referrers)</div>
          <table>
            <thead>
              <tr>
                <th>Kilde</th>
                <th>Besøgende</th>
                <th>Sidevisninger</th>
              </tr>
            </thead>
            <tbody>
              ${referrers.map(r => `
                <tr>
                  <td>${escapeHtml(r.referrerHostname || 'Direkte / Bogmærke')}</td>
                  <td>${r.visitors}</td>
                  <td>${r.pageviews}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-title">Geografi & Lande</div>
          <div>
            ${countries.map(c => {
              const maxV = countries[0]?.visitors || 1;
              const pct = Math.round((c.visitors / maxV) * 100);
              return `
                <div class="bar-row">
                  <div class="bar-label">${escapeHtml(c.country || 'Ukendt')}</div>
                  <div class="bar-track"><div class="bar-fill" style="width: ${pct}%;"></div></div>
                  <div class="bar-count">${c.visitors} v</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <div class="grid-2">
        <div class="card">
          <div class="card-title">Enheder (Devices)</div>
          <div>
            ${devices.map(d => {
              const maxV = devices[0]?.visitors || 1;
              const pct = Math.round((d.visitors / maxV) * 100);
              return `
                <div class="bar-row">
                  <div class="bar-label">${escapeHtml(d.deviceType || 'desktop')}</div>
                  <div class="bar-track"><div class="bar-fill" style="width: ${pct}%;"></div></div>
                  <div class="bar-count">${d.visitors} v</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-title">Styresystemer (OS)</div>
          <div>
            ${os.map(o => {
              const maxV = os[0]?.visitors || 1;
              const pct = Math.round((o.visitors / maxV) * 100);
              return `
                <div class="bar-row">
                  <div class="bar-label">${escapeHtml(o.osName || 'Ukendt')}</div>
                  <div class="bar-track"><div class="bar-fill" style="width: ${pct}%;"></div></div>
                  <div class="bar-count">${o.visitors} v</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: SEARCH & SEO -->
    <div id="tab-search" class="tab-pane">
      <div class="card">
        <div class="card-title">Top Søgeord (Google Search Console)</div>
        <input type="text" id="searchQueryFilter" class="search-bar" placeholder="Søg i nøgleord (f.eks. aula, boligsiden)..." onkeyup="filterTable('searchQueryFilter', 'searchTable')">
        <div class="table-container">
          <table id="searchTable">
            <thead>
              <tr>
                <th>Søgeord</th>
                <th>Klik</th>
                <th>Visninger</th>
                <th>CTR</th>
                <th>Gns. Placering</th>
              </tr>
            </thead>
            <tbody>
              ${topQueries.map(q => {
                const term = Array.isArray(q.keys) ? q.keys[0] : (q.query || '');
                const ctrPct = Math.round((Number(q.ctr) || 0) * 1000) / 10;
                const pos = Math.round((Number(q.position) || 0) * 10) / 10;
                return `
                  <tr>
                    <td><strong>${escapeHtml(term)}</strong></td>
                    <td>${q.clicks || 0}</td>
                    <td>${q.impressions || 0}</td>
                    <td>${ctrPct}%</td>
                    <td>#${pos}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card">
        <div class="card-title">Top Landingssider fra Google</div>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Landingsside</th>
                <th>Klik</th>
                <th>Visninger</th>
                <th>CTR</th>
                <th>Gns. Placering</th>
              </tr>
            </thead>
            <tbody>
              ${gscPages.map(p => {
                const url = Array.isArray(p.keys) ? p.keys[0] : (p.page || '');
                const ctrPct = Math.round((Number(p.ctr) || 0) * 1000) / 10;
                const pos = Math.round((Number(p.position) || 0) * 10) / 10;
                return `
                  <tr>
                    <td><code>${escapeHtml(url.replace('https://vibetrends.dk', ''))}</code></td>
                    <td>${p.clicks || 0}</td>
                    <td>${p.impressions || 0}</td>
                    <td>${ctrPct}%</td>
                    <td>#${pos}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 5: AGENTS & SUPABASE TELEMETRY -->
    <div id="tab-users" class="tab-pane">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Brugeroprettelser per dag (Supabase)</div>
          <table>
            <thead>
              <tr>
                <th>Dato</th>
                <th>Nye Oprettelser</th>
              </tr>
            </thead>
            <tbody>
              ${signupsByDay.map(s => `
                <tr>
                  <td>${new Date(s.day).toLocaleDateString('da-DK', { dateStyle: 'medium' })}</td>
                  <td><strong>+${s.count}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="card">
          <div class="card-title">Agent API & Rate Limit Telemetri</div>
          <table>
            <thead>
              <tr>
                <th>Handling (Endpoint)</th>
                <th>Antal Hændelser</th>
                <th>Seneste Aktivitet</th>
              </tr>
            </thead>
            <tbody>
              ${apiActivity.map(a => `
                <tr>
                  <td><code>${escapeHtml(a.action)}</code></td>
                  <td>${a.total_events}</td>
                  <td>${a.latest_activity ? new Date(a.latest_activity).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' }) : 'N/A'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- TAB 6: OPPORTUNITIES -->
    <div id="tab-indexing" class="tab-pane">
      ${!seo ? `
        <div class="card">
          <div class="card-title">Indeksering</div>
          <p>Ikke indsamlet i denne kørsel (kørt med <code>--no-seo</code>).</p>
        </div>
      ` : seo.error ? `
        <div class="card">
          <div class="card-title">Indeksering — utilgængelig</div>
          <p>${escapeHtml(seo.error)}</p>
        </div>
      ` : `
        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Indekseret</div>
            <div class="kpi-value-row"><div class="kpi-value">${seo.indexing.indexed}/${seo.indexing.inspected}</div></div>
            <div class="kpi-label">af de inspicerede sider</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Ikke indekseret</div>
            <div class="kpi-value-row"><div class="kpi-value">${seo.indexing.notIndexed}</div></div>
            <div class="kpi-label">kræver handling</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Canonical-konflikter</div>
            <div class="kpi-value-row"><div class="kpi-value">${seo.indexing.canonicalMismatches}</div></div>
            <div class="kpi-label">Google valgte en anden URL</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Structured data</div>
            <div class="kpi-value-row"><div class="kpi-value">${seo.indexing.withStructuredData}</div></div>
            <div class="kpi-label">sider med rich results</div>
          </div>
        </div>

        <div class="card">
          <div class="card-title">Sitemap</div>
          ${seo.sitemap.registered ? `
            <table>
              <tbody>
                <tr><th>Sti</th><td>${escapeHtml(seo.sitemap.path || '')}</td></tr>
                <tr><th>URL'er i live sitemap</th><td>${seo.sitemap.liveUrlCount}</td></tr>
                <tr><th>Registreret i GSC</th><td>${seo.sitemap.submitted}${seo.sitemap.drift ? ` <strong>(afvigelse: ${seo.sitemap.drift > 0 ? '+' : ''}${seo.sitemap.drift})</strong>` : ''}</td></tr>
                <tr><th>Fejl / advarsler</th><td>${seo.sitemap.errors} / ${seo.sitemap.warnings}</td></tr>
                <tr><th>Sidst hentet af Google</th><td>${seo.sitemap.lastDownloaded ? new Date(seo.sitemap.lastDownloaded).toLocaleString('da-DK') : '—'}${seo.sitemap.stale ? ' <strong>(forældet)</strong>' : ''}</td></tr>
              </tbody>
            </table>
            <p style="font-size:12px;color:var(--muted);margin-top:10px;">GSC's „indexed“-felt er udgået og returnerer altid 0. Det vises derfor ikke her — brug tabellen nedenfor i stedet.</p>
          ` : `<p>${escapeHtml(seo.sitemap.note || 'Sitemap ikke registreret')}</p>`}
        </div>

        ${seo.indexing.problems.length ? `
        <div class="card">
          <div class="card-title">Sider der kræver handling (${seo.indexing.problems.length})</div>
          <div class="table-container">
            <table>
              <thead><tr><th>URL</th><th>Status</th><th>Hvorfor inspiceret</th><th>Google canonical</th></tr></thead>
              <tbody>
                ${seo.indexing.problems.map(pg => `
                  <tr>
                    <td><strong>${escapeHtml(String(pg.url || '').replace('https://vibetrends.dk', ''))}</strong></td>
                    <td>${escapeHtml(pg.coverageState)}</td>
                    <td>${escapeHtml(pg.reason || '')}</td>
                    <td>${pg.canonicalMismatch ? escapeHtml(String(pg.googleCanonical || '').replace('https://vibetrends.dk', '')) : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>` : ''}

        <div class="card">
          <div class="card-title">Alle inspicerede sider</div>
          <input type="text" id="indexFilter" class="search-bar" placeholder="Søg i URL'er..." onkeyup="filterTable('indexFilter', 'indexTable')">
          <div class="table-container">
            <table id="indexTable">
              <thead><tr><th>URL</th><th>Status</th><th>Rich results</th><th>Sidst crawlet</th></tr></thead>
              <tbody>
                ${seo.pages.map(pg => `
                  <tr>
                    <td><strong>${escapeHtml(String(pg.url || '').replace('https://vibetrends.dk', ''))}</strong></td>
                    <td>${pg.indexed ? '✓ ' : '⚠ '}${escapeHtml(pg.coverageState)}</td>
                    <td>${escapeHtml((pg.richResultTypes || []).join(', ') || '—')}</td>
                    <td>${pg.lastCrawlTime ? new Date(pg.lastCrawlTime).toLocaleDateString('da-DK') : '—'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `}
    </div>

    <div id="tab-opportunities" class="tab-pane">
      <div class="card">
        <div class="card-title">Identificerede Vækstmuligheder (Høj Visning / Lav CTR)</div>
        <p style="font-size: 13px; color: var(--muted); margin-bottom: 16px;">
          Disse søgeord rangerer allerede i Top 20 på Google med pæne visningstal, men konverterer under 5% til klik. 
        </p>

        ${opportunities.length === 0 ? `
          <div style="color: var(--muted); font-size: 14px;">Ingen specifikke CTR-anomalier fundet i denne periode.</div>
        ` : opportunities.map(o => `
          <div class="opp-card">
            <div class="opp-term">🔍 "${escapeHtml(o.term)}"</div>
            <div class="opp-stats">
              Visninger: <strong>${o.impressions}</strong> &bull; 
              Klik: <strong>${o.clicks}</strong> &bull; 
              CTR: <strong>${o.ctr}%</strong> &bull; 
              Placering: <strong>#${o.position}</strong>
            </div>
            <div class="opp-rec">Anbefaling: ${escapeHtml(o.recommendation)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>

  <script>
    let activeUserFilter = 'all';

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
      
      const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick').includes(tabId));
      const targetPane = document.getElementById('tab-' + tabId);
      
      if (targetBtn) targetBtn.classList.add('active');
      if (targetPane) targetPane.classList.add('active');
    }

    function filterTable(inputId, tableId) {
      const input = document.getElementById(inputId);
      const filter = input.value.toLowerCase();
      const table = document.getElementById(tableId);
      const rows = table.getElementsByTagName('tr');

      for (let i = 1; i < rows.length; i++) {
        const text = rows[i].textContent || rows[i].innerText;
        if (text.toLowerCase().indexOf(filter) > -1) {
          rows[i].style.display = '';
        } else {
          rows[i].style.display = 'none';
        }
      }
    }

    function filterUserType(type, buttonEl) {
      activeUserFilter = type;
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      if (buttonEl) buttonEl.classList.add('active');
      filterUserTable();
    }

    function filterUserTable() {
      const input = document.getElementById('userFilterInput');
      const search = (input ? input.value : '').toLowerCase();
      const table = document.getElementById('userProfilesTable');
      if (!table) return;
      const rows = table.getElementsByTagName('tr');

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const userType = row.getAttribute('data-usertype') || '';
        const text = (row.textContent || row.innerText).toLowerCase();

        const matchesType = (activeUserFilter === 'all' || userType === activeUserFilter);
        const matchesSearch = (!search || text.indexOf(search) > -1);

        if (matchesType && matchesSearch) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      }
    }
  </script>
</body>
</html>`;
}
