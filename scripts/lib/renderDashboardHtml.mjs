/**
 * Standalone Interactive HTML Dashboard Compiler for VibeTrends.dk Analytics
 * Renders a single-file, zero-dependency HTML dashboard with client-side tabs,
 * KPI delta badges, searchable tables, and actionable insights.
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
      <button class="tab-btn" onclick="switchTab('traffic')">Trafik & Sider</button>
      <button class="tab-btn" onclick="switchTab('search')">Google Søgning & SEO</button>
      <button class="tab-btn" onclick="switchTab('users')">Brugere & Agent Auth</button>
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
              <strong>📈 Stærk Søgevisningsvækst:</strong> Google Search Console registrerede en kraftig stigning til op mod 160+ visninger/dag i midten af august.
            </p>
            <p style="margin-bottom: 10px;">
              <strong>👥 Brugeraktivitet:</strong> ${totalUsers} registrerede konti (${currentSignups} nye i denne periode). Høj gennemsnitlig dybde på Mac/Desktop (~9 sidevisninger/besøg).
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

    <!-- TAB 2: TRAFFIC & PAGES -->
    <div id="tab-traffic" class="tab-pane">
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

    <!-- TAB 3: SEARCH & SEO -->
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

    <!-- TAB 4: USERS & AGENTS -->
    <div id="tab-users" class="tab-pane">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">Brugeroprettelser (Supabase)</div>
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

    <!-- TAB 5: OPPORTUNITIES -->
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
  </script>
</body>
</html>`;
}
