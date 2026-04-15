import { getDb } from './schema';
import {
  Belief,
  ParlayCard,
  ModelWeights,
  CVSWeights,
  PickResult,
  PickType,
  BeliefLabel,
  RecalibrationResult,
  PropBelief,
  PropStat,
  FactorPerformance,
  ParlayMode,
} from '../data/types';

// ---------------------------------------------------------------------------
// Belief queries
// ---------------------------------------------------------------------------

function rowToBelief(row: Record<string, unknown>): Belief {
  return {
    pickId: row.pick_id as string,
    generatedAt: row.generated_at as string,
    game: row.game as string,
    gameDate: row.game_date as string,
    homeTeam: row.home_team as string,
    awayTeam: row.away_team as string,
    pickType: row.pick_type as Belief['pickType'],
    pickSide: row.pick_side as Belief['pickSide'],
    pickValue: row.pick_value as string,
    pickedTeamOrSide: row.picked_team_or_side as string,
    odds: row.odds as number,
    poissonWinProb: row.poisson_win_prob as number,
    eloWinProb: row.elo_win_prob as number,
    powerRatingEdge: row.power_rating_edge as number,
    impliedProbability: row.implied_probability as number,
    modelConsensusScore: row.model_consensus_score as number,
    modelStdDeviation: row.model_std_deviation as number,
    cvsScore: row.cvs_score as number,
    beliefScore: row.belief_score as number,
    beliefLabel: row.belief_label as BeliefLabel,
    kellyFraction: row.kelly_fraction as number,
    recommendedUnits: row.recommended_units as number,
    beliefRationale: JSON.parse(row.belief_rationale as string),
    scoutingReport: row.scouting_report as string,
    result: row.result as PickResult,
    actualOutcome: row.actual_outcome as string | null,
    resultFetchedAt: row.result_fetched_at as string | null,
    parlayId: row.parlay_id as string | undefined,
  };
}

export function saveBelief(belief: Belief): void {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO beliefs (
      pick_id, generated_at, game, game_date, home_team, away_team,
      pick_type, pick_side, pick_value, picked_team_or_side, odds,
      poisson_win_prob, elo_win_prob, power_rating_edge, implied_probability,
      model_consensus_score, model_std_deviation,
      cvs_score, belief_score, belief_label, kelly_fraction, recommended_units,
      belief_rationale, scouting_report, result, actual_outcome, result_fetched_at, parlay_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    belief.pickId, belief.generatedAt, belief.game, belief.gameDate,
    belief.homeTeam, belief.awayTeam,
    belief.pickType, belief.pickSide, belief.pickValue, belief.pickedTeamOrSide, belief.odds,
    belief.poissonWinProb, belief.eloWinProb, belief.powerRatingEdge, belief.impliedProbability,
    belief.modelConsensusScore, belief.modelStdDeviation,
    belief.cvsScore, belief.beliefScore, belief.beliefLabel,
    belief.kellyFraction, belief.recommendedUnits,
    JSON.stringify(belief.beliefRationale), belief.scoutingReport,
    belief.result, belief.actualOutcome, belief.resultFetchedAt,
    belief.parlayId ?? null
  );
}

export function updateBeliefResult(
  pickId: string,
  result: PickResult,
  actualOutcome: string
): void {
  getDb().prepare(`
    UPDATE beliefs SET result = ?, actual_outcome = ?, result_fetched_at = ? WHERE pick_id = ?
  `).run(result, actualOutcome, new Date().toISOString(), pickId);
}

export function getPendingBeliefs(): Belief[] {
  const rows = getDb().prepare(`
    SELECT * FROM beliefs WHERE result = 'PENDING' ORDER BY game_date ASC
  `).all() as Record<string, unknown>[];
  return rows.map(rowToBelief);
}

export function getBeliefsByDateRange(startDate: string, endDate: string): Belief[] {
  const rows = getDb().prepare(`
    SELECT * FROM beliefs WHERE game_date >= ? AND game_date <= ? ORDER BY game_date ASC
  `).all(startDate, endDate) as Record<string, unknown>[];
  return rows.map(rowToBelief);
}

export function getBeliefsByLabel(label: BeliefLabel): Belief[] {
  const rows = getDb().prepare(`
    SELECT * FROM beliefs WHERE belief_label = ? ORDER BY generated_at DESC
  `).all(label) as Record<string, unknown>[];
  return rows.map(rowToBelief);
}

export function getWinRateByPickType(pickType: PickType, limit: number = 100): number {
  const row = getDb().prepare(`
    SELECT
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) * 1.0 / NULLIF(COUNT(CASE WHEN result IN ('WIN','LOSS') THEN 1 END), 0) as win_rate
    FROM (SELECT * FROM beliefs WHERE pick_type = ? AND result IN ('WIN','LOSS','PUSH') ORDER BY generated_at DESC LIMIT ?)
  `).get(pickType, limit) as Record<string, unknown>;
  return (row?.win_rate as number) ?? 0;
}

export function getWinRateByCVSBucket(
  minCVS: number,
  maxCVS: number
): { wins: number; total: number } {
  const row = getDb().prepare(`
    SELECT
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result IN ('WIN','LOSS') THEN 1 END) as total
    FROM beliefs
    WHERE cvs_score >= ? AND cvs_score < ? AND result IN ('WIN','LOSS')
  `).get(minCVS, maxCVS) as Record<string, unknown>;
  return { wins: (row?.wins as number) ?? 0, total: (row?.total as number) ?? 0 };
}

export function getRecentBeliefs(limit: number = 100): Belief[] {
  const rows = getDb().prepare(`
    SELECT * FROM beliefs WHERE result IN ('WIN','LOSS','PUSH') ORDER BY generated_at DESC LIMIT ?
  `).all(limit) as Record<string, unknown>[];
  return rows.map(rowToBelief);
}

// ---------------------------------------------------------------------------
// Parlay queries
// ---------------------------------------------------------------------------

function rowToParlay(row: Record<string, unknown>, beliefs: Belief[]): ParlayCard {
  const pickIds: string[] = JSON.parse(row.pick_ids as string);
  const picks = pickIds.map((id) => beliefs.find((b) => b.pickId === id)).filter(Boolean) as Belief[];
  return {
    parlayId: row.parlay_id as string,
    generatedAt: row.generated_at as string,
    targetDate: row.target_date as string,
    mode: row.mode as ParlayMode,
    picks,
    combinedOdds: row.combined_odds as number,
    expectedValue: row.expected_value as number,
    totalCvsScore: row.total_cvs_score as number,
    recommendedUnits: row.recommended_units as number,
    result: row.result as PickResult,
    gamesAvailable: row.games_available as number,
    picksEligible: row.picks_eligible as number,
  };
}

export function saveParlay(parlay: ParlayCard): void {
  const db = getDb();
  // Save all beliefs first
  for (const pick of parlay.picks) {
    saveBelief({ ...pick, parlayId: parlay.parlayId });
  }
  db.prepare(`
    INSERT OR REPLACE INTO parlays (
      parlay_id, generated_at, target_date, mode, pick_ids,
      combined_odds, expected_value, total_cvs_score, recommended_units,
      games_available, picks_eligible, result
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    parlay.parlayId, parlay.generatedAt, parlay.targetDate, parlay.mode,
    JSON.stringify(parlay.picks.map((p) => p.pickId)),
    parlay.combinedOdds, parlay.expectedValue, parlay.totalCvsScore,
    parlay.recommendedUnits, parlay.gamesAvailable, parlay.picksEligible,
    parlay.result
  );
}

export function updateParlayResult(parlayId: string, result: PickResult): void {
  getDb().prepare(`UPDATE parlays SET result = ? WHERE parlay_id = ?`).run(result, parlayId);
}

export function getRecentParlays(limit: number = 10): ParlayCard[] {
  const rows = getDb().prepare(`
    SELECT * FROM parlays ORDER BY generated_at DESC LIMIT ?
  `).all(limit) as Record<string, unknown>[];

  if (rows.length === 0) return [];

  const allPickIds = rows.flatMap((r) => JSON.parse(r.pick_ids as string) as string[]);
  const beliefs = allPickIds.length > 0
    ? (getDb().prepare(`SELECT * FROM beliefs WHERE pick_id IN (${allPickIds.map(() => '?').join(',')})`)
        .all(...allPickIds) as Record<string, unknown>[]).map(rowToBelief)
    : [];

  return rows.map((r) => rowToParlay(r, beliefs));
}

export function getParlayByDate(targetDate: string): ParlayCard | null {
  const row = getDb().prepare(`
    SELECT * FROM parlays WHERE target_date = ? ORDER BY generated_at DESC LIMIT 1
  `).get(targetDate) as Record<string, unknown> | undefined;
  if (!row) return null;
  const pickIds: string[] = JSON.parse(row.pick_ids as string);
  const beliefs = pickIds.length > 0
    ? (getDb().prepare(`SELECT * FROM beliefs WHERE pick_id IN (${pickIds.map(() => '?').join(',')})`)
        .all(...pickIds) as Record<string, unknown>[]).map(rowToBelief)
    : [];
  return rowToParlay(row, beliefs);
}

// ---------------------------------------------------------------------------
// Model weight queries
// ---------------------------------------------------------------------------

export function saveModelWeights(weights: ModelWeights, triggerEvent?: string): void {
  getDb().prepare(`
    INSERT INTO model_weights (recorded_at, poisson, elo, power_rating, implied_probability, version, trigger_event)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    weights.poisson, weights.elo, weights.powerRating, weights.impliedProbability,
    weights.version, triggerEvent ?? null
  );
}

export function getLatestModelWeights(): ModelWeights | null {
  const row = getDb().prepare(`
    SELECT * FROM model_weights ORDER BY id DESC LIMIT 1
  `).get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    poisson: row.poisson as number,
    elo: row.elo as number,
    powerRating: row.power_rating as number,
    impliedProbability: row.implied_probability as number,
    lastUpdated: row.recorded_at as string,
    version: row.version as number,
  };
}

// ---------------------------------------------------------------------------
// Recalibration queries
// ---------------------------------------------------------------------------

export function saveRecalibrationRun(result: RecalibrationResult): void {
  getDb().prepare(`
    INSERT INTO recalibration_runs (run_at, picks_resolved, wins, losses, pushes, win_rate, anomalies_detected, summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.runAt, result.picksResolved, result.wins, result.losses, result.pushes,
    result.winRate, JSON.stringify(result.anomaliesDetected), result.learningLogEntry
  );
}

// ---------------------------------------------------------------------------
// Lifetime stats
// ---------------------------------------------------------------------------

export function getLifetimeStats(): {
  totalPicks: number;
  wins: number;
  losses: number;
  winRate: number;
  roi: number;
  parlayHitRate: number;
} {
  const db = getDb();
  const picksRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses
    FROM beliefs WHERE result IN ('WIN','LOSS','PUSH')
  `).get() as Record<string, unknown>;

  const totalPicks = (picksRow?.total as number) ?? 0;
  const wins = (picksRow?.wins as number) ?? 0;
  const losses = (picksRow?.losses as number) ?? 0;
  const winRate = totalPicks > 0 ? wins / totalPicks : 0;

  // Simple ROI: average units returned (assumes 1 unit per pick at -110)
  const roi = totalPicks > 0 ? (wins * 0.909 - losses) / totalPicks : 0;

  const parlayRow = db.prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins
    FROM parlays WHERE result IN ('WIN','LOSS')
  `).get() as Record<string, unknown>;
  const totalParlays = (parlayRow?.total as number) ?? 0;
  const parlayWins = (parlayRow?.wins as number) ?? 0;
  const parlayHitRate = totalParlays > 0 ? parlayWins / totalParlays : 0;

  return { totalPicks, wins, losses, winRate, roi, parlayHitRate };
}

export function getWinRateByBeliefLabel(label: BeliefLabel, limit: number = 100): number {
  const row = getDb().prepare(`
    SELECT
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) * 1.0 /
      NULLIF(COUNT(CASE WHEN result IN ('WIN','LOSS') THEN 1 END), 0) as win_rate
    FROM (SELECT * FROM beliefs WHERE belief_label = ? AND result IN ('WIN','LOSS','PUSH') ORDER BY generated_at DESC LIMIT ?)
  `).get(label, limit) as Record<string, unknown>;
  return (row?.win_rate as number) ?? 0;
}

export function getRolling5Parlays(): ParlayCard[] {
  return getRecentParlays(5);
}

export function saveFactorPerformance(fp: FactorPerformance): void {
  getDb().prepare(`
    INSERT INTO factor_performance (recorded_at, factor_name, rolling_correlation_20, rolling_correlation_50, rolling_correlation_100)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    fp.lastUpdated, fp.factorName, fp.rollingCorrelation20, fp.rollingCorrelation50, fp.rollingCorrelation100
  );
}

// ---------------------------------------------------------------------------
// Prop belief queries
// ---------------------------------------------------------------------------

export function savePropBelief(prop: PropBelief): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO prop_beliefs (
      prop_id, generated_at, game_id, game, game_date, player_name, team_name, opponent_name,
      stat, direction, line, odds, projected_value, projected_std_dev,
      over_probability, under_probability, market_implied_prob, model_edge,
      season_avg, last5_avg, last10_avg, hits_over_last5, hits_over_last10,
      opponent_rank_vs_position, matchup_adjustment,
      cvs_score, belief_score, belief_label, kelly_fraction, recommended_units,
      rationale, scouting_report, result, actual_value, result_fetched_at, parlay_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
  `).run(
    prop.propId, prop.generatedAt, prop.gameId, prop.game, prop.gameDate,
    prop.playerName, prop.teamName, prop.opponentName,
    prop.stat, prop.direction, prop.line, prop.odds,
    prop.projectedValue, prop.projectedStdDev,
    prop.overProbability, prop.underProbability, prop.marketImpliedProb, prop.modelEdge,
    prop.seasonAvg, prop.last5Avg, prop.last10Avg,
    prop.hitsOverLineInLast5, prop.hitsOverLineInLast10,
    prop.opponentRankVsPosition, prop.matchupAdjustment,
    prop.cvsScore, prop.beliefScore, prop.beliefLabel,
    prop.kellyFraction, prop.recommendedUnits,
    JSON.stringify(prop.rationale), prop.scoutingReport,
    prop.result, prop.actualValue, prop.resultFetchedAt, prop.parlayId ?? null
  );
}

export function updatePropResult(propId: string, result: PickResult, actualValue: number): void {
  getDb().prepare(`
    UPDATE prop_beliefs SET result = ?, actual_value = ?, result_fetched_at = ? WHERE prop_id = ?
  `).run(result, actualValue, new Date().toISOString(), propId);
}

export function getPendingProps(): PropBelief[] {
  const rows = getDb().prepare(`
    SELECT * FROM prop_beliefs WHERE result = 'PENDING' ORDER BY game_date ASC
  `).all() as Record<string, unknown>[];
  return rows.map(rowToPropBelief);
}

export function getRecentProps(limit: number = 50): PropBelief[] {
  const rows = getDb().prepare(`
    SELECT * FROM prop_beliefs ORDER BY generated_at DESC LIMIT ?
  `).all(limit) as Record<string, unknown>[];
  return rows.map(rowToPropBelief);
}

export function getPropWinRateByStat(stat: PropStat): number {
  const row = getDb().prepare(`
    SELECT
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) * 1.0 /
      NULLIF(COUNT(CASE WHEN result IN ('WIN','LOSS') THEN 1 END), 0) as win_rate
    FROM prop_beliefs WHERE stat = ? AND result IN ('WIN','LOSS','PUSH')
  `).get(stat) as Record<string, unknown>;
  return (row?.win_rate as number) ?? 0;
}

export function getPropLifetimeStats(): {
  totalProps: number; wins: number; losses: number; winRate: number;
} {
  const row = getDb().prepare(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN result = 'WIN' THEN 1 END) as wins,
      COUNT(CASE WHEN result = 'LOSS' THEN 1 END) as losses
    FROM prop_beliefs WHERE result IN ('WIN','LOSS','PUSH')
  `).get() as Record<string, unknown>;
  const total = (row?.total as number) ?? 0;
  const wins = (row?.wins as number) ?? 0;
  const losses = (row?.losses as number) ?? 0;
  return { totalProps: total, wins, losses, winRate: total > 0 ? wins / total : 0 };
}

function rowToPropBelief(row: Record<string, unknown>): PropBelief {
  return {
    propId: row.prop_id as string,
    generatedAt: row.generated_at as string,
    gameId: row.game_id as string,
    game: row.game as string,
    gameDate: row.game_date as string,
    playerName: row.player_name as string,
    teamName: row.team_name as string,
    opponentName: row.opponent_name as string,
    stat: row.stat as PropStat,
    direction: row.direction as PropBelief['direction'],
    line: row.line as number,
    odds: row.odds as number,
    projectedValue: row.projected_value as number,
    projectedStdDev: row.projected_std_dev as number,
    overProbability: row.over_probability as number,
    underProbability: row.under_probability as number,
    marketImpliedProb: row.market_implied_prob as number,
    modelEdge: row.model_edge as number,
    seasonAvg: row.season_avg as number,
    last5Avg: row.last5_avg as number,
    last10Avg: row.last10_avg as number,
    hitsOverLineInLast5: row.hits_over_last5 as number,
    hitsOverLineInLast10: row.hits_over_last10 as number,
    opponentRankVsPosition: row.opponent_rank_vs_position as number,
    matchupAdjustment: row.matchup_adjustment as number,
    cvsScore: row.cvs_score as number,
    beliefScore: row.belief_score as number,
    beliefLabel: row.belief_label as BeliefLabel,
    kellyFraction: row.kelly_fraction as number,
    recommendedUnits: row.recommended_units as number,
    rationale: JSON.parse(row.rationale as string),
    scoutingReport: row.scouting_report as string,
    result: row.result as PickResult,
    actualValue: row.actual_value as number | null,
    resultFetchedAt: row.result_fetched_at as string | null,
    parlayId: row.parlay_id as string | undefined,
  };
}
