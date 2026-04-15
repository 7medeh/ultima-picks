import { ParlayCard, Belief, ModelWeights, FactorPerformance } from '../data/types';

interface ReportData {
  parlay: ParlayCard | null;
  date: string;
  modelWeights: ModelWeights | null;
  factorPerformance: FactorPerformance[];
  recentParlays: ParlayCard[];
  radarZone: Belief[];
  anomalies: string[];
}

function formatOdds(o: number): string {
  return o > 0 ? `+${o}` : String(o);
}

function cvsBarColor(score: number): string {
  if (score >= 80) return '#00ff88';
  if (score >= 68) return '#ffaa00';
  return '#888888';
}

function beliefBadgeColor(label: string): string {
  switch (label) {
    case 'CONVICTION': return '#00ff88';
    case 'LEAN': return '#ffaa00';
    case 'SPECULATIVE': return '#888888';
    default: return '#ffffff';
  }
}

function resultColor(result: string): string {
  if (result === 'WIN') return '#00ff88';
  if (result === 'LOSS') return '#ff4444';
  if (result === 'PUSH') return '#aaaaaa';
  return '#ffaa00';
}

export function buildHtmlReport(data: ReportData): string {
  const { parlay, date, modelWeights, factorPerformance, recentParlays, radarZone, anomalies } = data;

  const pickCards = parlay?.picks.map((pick) => `
    <div class="card pick-card">
      <div class="pick-header">
        <div class="pick-main">
          <span class="pick-team">${pick.pickedTeamOrSide}</span>
          <span class="pick-type-badge">${pick.pickType.toUpperCase()}</span>
          <span class="pick-odds">${formatOdds(pick.odds)}</span>
        </div>
        <div class="pick-meta">
          <span class="belief-badge" style="background: ${beliefBadgeColor(pick.beliefLabel)}20; color: ${beliefBadgeColor(pick.beliefLabel)}; border: 1px solid ${beliefBadgeColor(pick.beliefLabel)}">${pick.beliefLabel}</span>
          <span class="units">${pick.recommendedUnits}u</span>
        </div>
      </div>
      <div class="pick-game">${pick.game} · ${pick.gameDate}</div>
      <div class="cvs-bar-wrapper">
        <span class="cvs-label">CVS ${pick.cvsScore.toFixed(1)}</span>
        <div class="cvs-bar-bg">
          <div class="cvs-bar-fill" style="width: ${pick.cvsScore}%; background: ${cvsBarColor(pick.cvsScore)}"></div>
        </div>
      </div>
      <p class="scouting-report">${pick.scoutingReport}</p>
      <details class="breakdown-details">
        <summary>Full Breakdown</summary>
        <div class="breakdown-body">
          <div class="model-bars">
            <h4>Model Probabilities</h4>
            ${[
              { name: 'Poisson', prob: pick.poissonWinProb },
              { name: 'Elo', prob: pick.eloWinProb },
              { name: 'Market', prob: pick.impliedProbability },
            ].map((m) => `
              <div class="model-bar-row">
                <span class="model-bar-label">${m.name}</span>
                <div class="model-bar-bg">
                  <div class="model-bar-fill" style="width: ${(m.prob * 100).toFixed(1)}%"></div>
                </div>
                <span class="model-bar-pct">${(m.prob * 100).toFixed(1)}%</span>
              </div>
            `).join('')}
          </div>
          <div class="rationale-list">
            <h4>Rationale</h4>
            ${pick.beliefRationale.map((r) => `<p class="rationale-item">${r}</p>`).join('')}
          </div>
        </div>
      </details>
    </div>
  `).join('') ?? '<p class="no-data">No picks generated for this date.</p>';

  const parlayResultsCalendar = recentParlays.map((p) => `
    <div class="cal-cell" style="background: ${resultColor(p.result)}22; border: 1px solid ${resultColor(p.result)}44" title="${p.targetDate} — ${p.result}">
      <span class="cal-date">${p.targetDate.split('-').slice(1).join('/')}</span>
      <span class="cal-result" style="color: ${resultColor(p.result)}">${p.result === 'PENDING' ? '?' : p.result[0]}</span>
      <span class="cal-odds">${formatOdds(p.combinedOdds)}</span>
    </div>
  `).join('');

  const rolling5 = recentParlays.slice(0, 5);
  const parlayHits = rolling5.filter((p) => p.result === 'WIN').length;
  const parlayStreak = rolling5.map((p) => `
    <div class="streak-cell" style="background: ${resultColor(p.result)}33; border: 2px solid ${resultColor(p.result)}">
      <span style="color: ${resultColor(p.result)}">${p.result === 'WIN' ? 'W' : p.result === 'LOSS' ? 'L' : '?'}</span>
    </div>
  `).join('');

  const modelWeightBars = modelWeights ? ['poisson', 'elo', 'powerRating', 'impliedProbability'].map((m) => {
    const w = modelWeights[m as keyof ModelWeights] as number;
    return `
      <div class="weight-row">
        <span class="weight-label">${m}</span>
        <div class="weight-bar-bg">
          <div class="weight-bar-fill" style="width: ${(w * 100).toFixed(1)}%"></div>
        </div>
        <span class="weight-pct">${(w * 100).toFixed(1)}%</span>
      </div>
    `;
  }).join('') : '<p class="no-data">No weight data</p>';

  const factorTable = factorPerformance.length > 0
    ? `<table class="factor-table">
        <thead><tr><th>Factor</th><th>20-pick</th><th>50-pick</th><th>100-pick</th></tr></thead>
        <tbody>${factorPerformance.map((fp) => `
          <tr>
            <td>${fp.factorName}</td>
            <td style="color: ${fp.rollingCorrelation20 > 0.1 ? '#00ff88' : fp.rollingCorrelation20 < 0 ? '#ff4444' : '#ffaa00'}">${fp.rollingCorrelation20.toFixed(3)}</td>
            <td style="color: ${fp.rollingCorrelation50 > 0.1 ? '#00ff88' : fp.rollingCorrelation50 < 0 ? '#ff4444' : '#ffaa00'}">${fp.rollingCorrelation50.toFixed(3)}</td>
            <td style="color: ${fp.rollingCorrelation100 > 0.1 ? '#00ff88' : fp.rollingCorrelation100 < 0 ? '#ff4444' : '#ffaa00'}">${fp.rollingCorrelation100.toFixed(3)}</td>
          </tr>
        `).join('')}</tbody>
      </table>`
    : '<p class="no-data">Not enough data for factor analysis yet.</p>';

  const radarCards = radarZone.length > 0 ? radarZone.map((pick) => `
    <div class="card radar-card">
      <div class="watching-badge">WATCHING</div>
      <span class="pick-team">${pick.pickedTeamOrSide}</span>
      <span class="pick-odds">${formatOdds(pick.odds)}</span>
      <span class="cvs-label">CVS ${pick.cvsScore.toFixed(1)}</span>
      <p class="scouting-report">${pick.scoutingReport.slice(0, 120)}...</p>
    </div>
  `).join('') : '<p class="no-data">No radar picks for this slate.</p>';

  const anomalySection = anomalies.length > 0
    ? anomalies.map((a) => `<div class="anomaly-alert">${a}</div>`).join('')
    : '<p class="no-data">No anomalies detected.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NBA Picks Engine — ${date}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0a0a0a; color: #e0e0e0; font-family: 'Segoe UI', system-ui, sans-serif; padding: 24px; }
  h1 { font-size: 2rem; color: #00ff88; margin-bottom: 4px; }
  h2 { font-size: 1.3rem; color: #00ff88; margin: 32px 0 12px; border-bottom: 1px solid #222; padding-bottom: 8px; }
  h3 { font-size: 1rem; color: #aaa; margin-bottom: 12px; }
  h4 { font-size: 0.85rem; color: #888; margin-bottom: 8px; }
  .subtitle { color: #666; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 16px; }
  .card { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px; padding: 20px; }
  .pick-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
  .pick-main { display: flex; align-items: center; gap: 10px; }
  .pick-team { font-size: 1.1rem; font-weight: bold; color: #fff; }
  .pick-type-badge { font-size: 0.7rem; background: #2a2a2a; color: #888; padding: 2px 6px; border-radius: 4px; }
  .pick-odds { font-size: 1rem; font-weight: bold; color: #ffaa00; }
  .pick-meta { display: flex; gap: 8px; align-items: center; }
  .belief-badge { font-size: 0.75rem; font-weight: bold; padding: 3px 8px; border-radius: 4px; }
  .units { font-size: 0.8rem; color: #00ff88; font-weight: bold; }
  .pick-game { font-size: 0.8rem; color: #666; margin-bottom: 10px; }
  .cvs-bar-wrapper { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
  .cvs-label { font-size: 0.75rem; color: #888; width: 60px; flex-shrink: 0; }
  .cvs-bar-bg { flex: 1; height: 6px; background: #2a2a2a; border-radius: 3px; overflow: hidden; }
  .cvs-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
  .scouting-report { font-size: 0.82rem; color: #999; line-height: 1.5; margin-top: 8px; }
  .breakdown-details { margin-top: 12px; }
  .breakdown-details summary { cursor: pointer; font-size: 0.8rem; color: #555; }
  .breakdown-body { margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .model-bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .model-bar-label { width: 80px; font-size: 0.75rem; color: #888; }
  .model-bar-bg { flex: 1; height: 8px; background: #2a2a2a; border-radius: 4px; overflow: hidden; }
  .model-bar-fill { height: 100%; background: #00ff88; border-radius: 4px; }
  .model-bar-pct { width: 40px; font-size: 0.75rem; color: #aaa; text-align: right; }
  .rationale-item { font-size: 0.78rem; color: #888; margin-bottom: 4px; }
  .stats-row { display: flex; gap: 24px; margin-bottom: 20px; flex-wrap: wrap; }
  .stat-box { background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 8px; padding: 16px 24px; text-align: center; }
  .stat-value { font-size: 1.8rem; font-weight: bold; color: #00ff88; }
  .stat-label { font-size: 0.75rem; color: #666; margin-top: 4px; }
  .weight-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .weight-label { width: 140px; font-size: 0.8rem; color: #888; }
  .weight-bar-bg { flex: 1; height: 8px; background: #2a2a2a; border-radius: 4px; overflow: hidden; }
  .weight-bar-fill { height: 100%; background: #00ff88; border-radius: 4px; }
  .weight-pct { width: 40px; font-size: 0.75rem; color: #aaa; text-align: right; }
  .factor-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
  .factor-table th { color: #666; padding: 6px 10px; border-bottom: 1px solid #2a2a2a; text-align: left; }
  .factor-table td { padding: 6px 10px; border-bottom: 1px solid #1a1a1a; }
  .cal-grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .cal-cell { width: 80px; padding: 8px; border-radius: 6px; text-align: center; }
  .cal-date { display: block; font-size: 0.7rem; color: #666; }
  .cal-result { display: block; font-size: 1.1rem; font-weight: bold; }
  .cal-odds { display: block; font-size: 0.7rem; color: #888; }
  .streak-row { display: flex; gap: 10px; margin-bottom: 16px; }
  .streak-cell { width: 48px; height: 48px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.2rem; font-weight: bold; }
  .no-data { color: #444; font-style: italic; padding: 12px 0; }
  .anomaly-alert { background: #2a0000; border: 1px solid #ff444444; color: #ff8888; padding: 10px 14px; border-radius: 6px; margin-bottom: 8px; font-size: 0.85rem; }
  .radar-card { opacity: 0.7; }
  .watching-badge { font-size: 0.7rem; color: #888; background: #2a2a2a; padding: 2px 8px; border-radius: 4px; display: inline-block; margin-bottom: 8px; }
  .combined-odds { font-size: 2rem; font-weight: bold; color: #ffaa00; }
  canvas { max-width: 100%; }
</style>
</head>
<body>
<h1>🏀 NBA Picks Engine</h1>
<p class="subtitle">${date} · Generated ${new Date().toLocaleString()}</p>

<h2>Parlay Card</h2>
${parlay ? `
<div class="stats-row">
  <div class="stat-box"><div class="combined-odds">${formatOdds(parlay.combinedOdds)}</div><div class="stat-label">Combined Odds</div></div>
  <div class="stat-box"><div class="stat-value">${parlay.picks.length}</div><div class="stat-label">Legs</div></div>
  <div class="stat-box"><div class="stat-value">${(parlay.expectedValue * 100).toFixed(1)}%</div><div class="stat-label">Expected Value</div></div>
  <div class="stat-box"><div class="stat-value">${parlay.recommendedUnits}u</div><div class="stat-label">Recommended Units</div></div>
  <div class="stat-box"><div class="stat-value">${parlay.gamesAvailable}</div><div class="stat-label">Games on Slate</div></div>
</div>
` : ''}
<div class="grid">${pickCards}</div>

<h2>Brain Health — Self-Learning Status</h2>
<div class="card">
  <h3>Model Weights</h3>
  ${modelWeightBars}
</div>
<div class="card" style="margin-top: 16px;">
  <h3>Factor Performance (Pearson Correlation to Outcomes)</h3>
  ${factorTable}
</div>
${anomalies.length > 0 ? `
<div style="margin-top: 16px;">
  <h3>Active Anomaly Flags</h3>
  ${anomalySection}
</div>
` : ''}

<h2>Season Tracker</h2>
<div class="streak-row">
  ${parlayStreak || '<span style="color:#444">No parlay history yet</span>'}
</div>
<div class="card">
  <h3>Rolling 5-Parlay Target (${parlayHits}/5)</h3>
  <div class="cal-grid">${parlayResultsCalendar || '<p class="no-data">No parlay history yet.</p>'}</div>
</div>

<h2>Radar Zone</h2>
<p class="subtitle" style="margin-bottom:12px">Picks scoring 60-67 CVS — not in the parlay but worth watching</p>
<div class="grid">${radarCards}</div>

</body>
</html>`;
}
