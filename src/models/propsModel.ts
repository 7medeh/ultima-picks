import { PropStat, PlayerProfile, PlayerGameLog, PropModelOutput, OpponentDefenseRating } from '../data/types';
import { americanToImplied } from './impliedProbability';

// ---------------------------------------------------------------------------
// Normal distribution helpers
// ---------------------------------------------------------------------------

// Standard normal CDF using Abramowitz & Stegun approximation (error < 1.5e-7)
export function normalCDF(x: number): number {
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const t = 1.0 / (1.0 + p * Math.abs(x) / Math.sqrt(2));
  const poly = t * (a1 + t * (a2 + t * (a3 + t * (a4 + t * a5))));
  const erf = 1.0 - poly * Math.exp(-(x * x) / 2);
  return 0.5 * (1.0 + sign * erf);
}

// P(X > line) where X ~ N(mean, stdDev)
export function probOver(mean: number, stdDev: number, line: number): number {
  if (stdDev <= 0) return mean > line ? 1 : 0;
  const z = (line - mean) / stdDev;
  return 1 - normalCDF(z);
}

// P(X < line) where X ~ N(mean, stdDev)
export function probUnder(mean: number, stdDev: number, line: number): number {
  if (stdDev <= 0) return mean < line ? 1 : 0;
  const z = (line - mean) / stdDev;
  return normalCDF(z);
}

// ---------------------------------------------------------------------------
// Projection engine
// ---------------------------------------------------------------------------

export function getStatFromLog(log: PlayerGameLog, stat: PropStat): number {
  switch (stat) {
    case 'points': return log.points;
    case 'rebounds': return log.rebounds;
    case 'assists': return log.assists;
    case 'threes': return log.threes;
    case 'steals': return log.steals;
    case 'blocks': return log.blocks;
    case 'points_rebounds_assists': return log.points + log.rebounds + log.assists;
    case 'points_rebounds': return log.points + log.rebounds;
    case 'points_assists': return log.points + log.assists;
  }
}

export function getSeasonAvg(profile: PlayerProfile, stat: PropStat): number {
  switch (stat) {
    case 'points': return profile.seasonAvgPoints;
    case 'rebounds': return profile.seasonAvgRebounds;
    case 'assists': return profile.seasonAvgAssists;
    case 'threes': return profile.seasonAvgThrees;
    case 'steals': return profile.seasonAvgSteals;
    case 'blocks': return profile.seasonAvgBlocks;
    case 'points_rebounds_assists':
      return profile.seasonAvgPoints + profile.seasonAvgRebounds + profile.seasonAvgAssists;
    case 'points_rebounds':
      return profile.seasonAvgPoints + profile.seasonAvgRebounds;
    case 'points_assists':
      return profile.seasonAvgPoints + profile.seasonAvgAssists;
  }
}

// Weighted average: season avg (40%) + last 10 avg (35%) + last 5 avg (25%)
export function calculateProjectedValue(
  profile: PlayerProfile,
  stat: PropStat,
  opponentDefense: OpponentDefenseRating
): number {
  const seasonAvg = getSeasonAvg(profile, stat);
  const last5Avg = profile.last5Avg[stat] ?? seasonAvg;
  const last10Logs = profile.recentGameLogs.slice(0, 10);
  const last10Avg = last10Logs.length > 0
    ? last10Logs.reduce((sum, log) => sum + getStatFromLog(log, stat), 0) / last10Logs.length
    : seasonAvg;

  const rawProjection = seasonAvg * 0.40 + last10Avg * 0.35 + last5Avg * 0.25;

  // Apply matchup adjustment
  const defenseMultiplier = getDefenseMultiplier(stat, opponentDefense);

  // Apply pace adjustment
  const paceAdjusted = rawProjection * opponentDefense.paceAdjustment;

  return paceAdjusted * defenseMultiplier;
}

function getDefenseMultiplier(stat: PropStat, defense: OpponentDefenseRating): number {
  switch (stat) {
    case 'points': return defense.pointsAllowedToPosition;
    case 'rebounds': return defense.reboundsAllowedToPosition;
    case 'assists': return defense.assistsAllowedToPosition;
    case 'points_rebounds_assists':
      return (defense.pointsAllowedToPosition * 0.5 +
              defense.reboundsAllowedToPosition * 0.25 +
              defense.assistsAllowedToPosition * 0.25);
    case 'points_rebounds':
      return (defense.pointsAllowedToPosition * 0.6 + defense.reboundsAllowedToPosition * 0.4);
    case 'points_assists':
      return (defense.pointsAllowedToPosition * 0.6 + defense.assistsAllowedToPosition * 0.4);
    default: return 1.0;
  }
}

// Calculate standard deviation from recent game logs
export function calculateStdDev(
  profile: PlayerProfile,
  stat: PropStat,
  projectedValue: number
): number {
  const logs = profile.recentGameLogs.slice(0, 10);
  if (logs.length < 3) {
    // Fallback: use ~25% of projected value as std dev
    return projectedValue * 0.25;
  }
  const values = logs.map((l) => getStatFromLog(l, stat));
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const rawStdDev = Math.sqrt(variance);
  // Blend with projected mean to anchor std dev
  return Math.max(rawStdDev, projectedValue * 0.15);
}

// How many of the last N games did the player exceed the line?
export function hitRateVsLine(
  profile: PlayerProfile,
  stat: PropStat,
  line: number,
  lastN: number
): number {
  const logs = profile.recentGameLogs.slice(0, lastN);
  if (logs.length === 0) return 0;
  const hits = logs.filter((l) => getStatFromLog(l, stat) > line).length;
  return hits;
}

// ---------------------------------------------------------------------------
// Main model runner
// ---------------------------------------------------------------------------

export function runPropsModel(
  profile: PlayerProfile,
  stat: PropStat,
  line: number,
  overOdds: number,
  underOdds: number,
  opponentDefense: OpponentDefenseRating
): PropModelOutput {
  const projectedValue = calculateProjectedValue(profile, stat, opponentDefense);
  const projectedStdDev = calculateStdDev(profile, stat, projectedValue);

  const overProbability = probOver(projectedValue, projectedStdDev, line);
  const underProbability = probUnder(projectedValue, projectedStdDev, line);
  const pushProbability = Math.max(0, 1 - overProbability - underProbability);

  const marketOverImplied = americanToImplied(overOdds);
  const marketUnderImplied = americanToImplied(underOdds);
  // Remove vig from market
  const vigTotal = marketOverImplied + marketUnderImplied;
  const trueOverImplied = marketOverImplied / vigTotal;

  const modelEdge = overProbability - trueOverImplied;

  const confidence = Math.min(1, Math.abs(modelEdge) / 0.10) *
    Math.min(1, profile.recentGameLogs.length / 10);

  return {
    stat,
    projectedValue,
    projectedStdDev,
    overProbability,
    underProbability,
    pushProbability,
    modelEdge,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Line value assessment
// ---------------------------------------------------------------------------

// Is this line set at an exploitable number? (half-points, round numbers, etc.)
export function assessLineValue(line: number, projectedValue: number): number {
  const diff = Math.abs(projectedValue - line);
  const relativeEdge = diff / (projectedValue || 1);

  // Large gap between projection and line = potential value
  if (relativeEdge >= 0.15) return 100;
  if (relativeEdge >= 0.10) return 75;
  if (relativeEdge >= 0.05) return 50;
  return 25;
}

// Does the player consistently hit this stat range? (floor/ceiling check)
export function checkFloorCeiling(
  profile: PlayerProfile,
  stat: PropStat,
  line: number
): { floorOk: boolean; ceilingOk: boolean; comment: string } {
  const logs = profile.recentGameLogs.slice(0, 10);
  if (logs.length === 0) return { floorOk: true, ceilingOk: true, comment: 'No recent data' };

  const values = logs.map((l) => getStatFromLog(l, stat));
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    floorOk: max > line,       // Player can actually reach the line
    ceilingOk: min < line,     // Player can actually miss the line
    comment: `Range last 10: ${min.toFixed(1)}–${max.toFixed(1)}`,
  };
}
