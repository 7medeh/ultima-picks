import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import {
  Belief,
  PropBelief,
  PropStat,
  PropDirection,
  PropOddsLine,
  PlayerProfile,
  BeliefLabel,
  PickResult,
  OpponentDefenseRating,
} from '../data/types';
import {
  runPropsModel,
  hitRateVsLine,
  assessLineValue,
  checkFloorCeiling,
  getSeasonAvg,
} from '../models/propsModel';
import { americanToImplied, removeVig } from '../models/impliedProbability';
import { fractionalKelly, kellyToUnits, americanToDecimal } from '../models/kelly';

// ---------------------------------------------------------------------------
// CVS weights for props
// ---------------------------------------------------------------------------

const PROP_CVS_WEIGHTS = {
  modelEdge: 0.30,       // Our probability vs market implied
  recentForm: 0.25,      // Last 5 game hit rate vs this line
  matchupStrength: 0.20, // Opponent's defense vs this stat
  usageRate: 0.10,       // Player's role / usage
  restAndPace: 0.05,     // Rest days + game pace
  injuryContext: 0.05,   // Teammates out = usage bump
  lineValue: 0.05,       // How far projection is from the line
};

// ---------------------------------------------------------------------------
// CVS component scorers
// ---------------------------------------------------------------------------

export function scorePropModelEdge(modelEdge: number): number {
  // 15%+ edge = 100, 0% = 25, negative = 0
  if (modelEdge >= 0.15) return 100;
  if (modelEdge >= 0.10) return 75;
  if (modelEdge >= 0.05) return 50;
  if (modelEdge >= 0) return 25;
  return 0;
}

export function scorePropRecentForm(hitsOverInLast5: number, direction: PropDirection): number {
  // For over: more hits = better. For under: fewer hits = better.
  const relevantHits = direction === 'over' ? hitsOverInLast5 : (5 - hitsOverInLast5);
  // 5/5 = 100, 4/5 = 80, 3/5 = 60, 2/5 = 40, 1/5 = 20, 0/5 = 0
  return relevantHits * 20;
}

export function scorePropMatchup(
  opponentDefense: OpponentDefenseRating,
  stat: PropStat,
  direction: PropDirection
): number {
  let multiplier: number;
  switch (stat) {
    case 'points': multiplier = opponentDefense.pointsAllowedToPosition; break;
    case 'rebounds': multiplier = opponentDefense.reboundsAllowedToPosition; break;
    case 'assists': multiplier = opponentDefense.assistsAllowedToPosition; break;
    default: multiplier = (opponentDefense.pointsAllowedToPosition + opponentDefense.reboundsAllowedToPosition) / 2;
  }

  // multiplier > 1 = bad defense = good for OVER
  // multiplier < 1 = good defense = good for UNDER
  if (direction === 'over') {
    return Math.min(100, Math.max(0, 50 + (multiplier - 1) * 200));
  } else {
    return Math.min(100, Math.max(0, 50 - (multiplier - 1) * 200));
  }
}

export function scorePropUsage(usageRate: number): number {
  // High usage = more opportunity to accumulate stats
  // League avg ~20%, stars ~28-35%
  if (usageRate >= 0.30) return 100;
  if (usageRate >= 0.25) return 80;
  if (usageRate >= 0.20) return 60;
  if (usageRate >= 0.15) return 40;
  return 20;
}

export function scorePropRestAndPace(
  daysOfRest: number,
  opponentPace: number,
  leagueAvgPace: number = 98
): number {
  const restScore = daysOfRest >= 2 ? 70 : daysOfRest === 1 ? 50 : 30;
  const paceScore = Math.min(100, (opponentPace / leagueAvgPace) * 50);
  return (restScore + paceScore) / 2;
}

export function scorePropInjuryContext(
  teammatesOut: number,
  isPlayerQuestionable: boolean
): number {
  if (isPlayerQuestionable) return 0; // Don't pick questionable players
  // Each missing teammate = usage bump
  return Math.min(100, 50 + teammatesOut * 15);
}

// ---------------------------------------------------------------------------
// Master CVS for props
// ---------------------------------------------------------------------------

export function calculatePropCVS(
  modelEdge: number,
  hitsOverInLast5: number,
  direction: PropDirection,
  opponentDefense: OpponentDefenseRating,
  stat: PropStat,
  usageRate: number,
  daysOfRest: number,
  opponentPace: number,
  teammatesOut: number,
  isPlayerQuestionable: boolean,
  lineValueScore: number
): number {
  const scores = {
    modelEdge: scorePropModelEdge(modelEdge),
    recentForm: scorePropRecentForm(hitsOverInLast5, direction),
    matchupStrength: scorePropMatchup(opponentDefense, stat, direction),
    usageRate: scorePropUsage(usageRate),
    restAndPace: scorePropRestAndPace(daysOfRest, opponentPace),
    injuryContext: scorePropInjuryContext(teammatesOut, isPlayerQuestionable),
    lineValue: lineValueScore,
  };

  return Math.min(100, Math.max(0,
    scores.modelEdge * PROP_CVS_WEIGHTS.modelEdge +
    scores.recentForm * PROP_CVS_WEIGHTS.recentForm +
    scores.matchupStrength * PROP_CVS_WEIGHTS.matchupStrength +
    scores.usageRate * PROP_CVS_WEIGHTS.usageRate +
    scores.restAndPace * PROP_CVS_WEIGHTS.restAndPace +
    scores.injuryContext * PROP_CVS_WEIGHTS.injuryContext +
    scores.lineValue * PROP_CVS_WEIGHTS.lineValue
  ));
}

// ---------------------------------------------------------------------------
// Belief label
// ---------------------------------------------------------------------------

export function getPropBeliefLabel(cvsScore: number, modelEdge: number): BeliefLabel {
  if (cvsScore >= 72 && Math.abs(modelEdge) >= 0.08) return 'CONVICTION';
  if (cvsScore >= 60) return 'LEAN';
  return 'SPECULATIVE';
}

// ---------------------------------------------------------------------------
// Rationale generator
// ---------------------------------------------------------------------------

export function generatePropRationale(
  profile: PlayerProfile,
  stat: PropStat,
  direction: PropDirection,
  line: number,
  projectedValue: number,
  modelEdge: number,
  hitsOverInLast5: number,
  hitsOverInLast10: number,
  opponentDefense: OpponentDefenseRating,
  cvsScore: number
): string[] {
  const rationale: string[] = [];
  const seasonAvg = getSeasonAvg(profile, stat);
  const statLabel = stat.replace(/_/g, '+');

  // Projection vs line
  const gap = projectedValue - line;
  const gapPct = Math.abs(gap / (line || 1)) * 100;
  if (Math.abs(gap) >= 2) {
    rationale.push(
      gap > 0 && direction === 'over'
        ? `✅ Projection of ${projectedValue.toFixed(1)} ${statLabel} is ${gap.toFixed(1)} above the line (${gapPct.toFixed(0)}% edge)`
        : gap < 0 && direction === 'under'
        ? `✅ Projection of ${projectedValue.toFixed(1)} ${statLabel} is ${Math.abs(gap).toFixed(1)} below the line (${gapPct.toFixed(0)}% edge)`
        : `⚠️ Projection of ${projectedValue.toFixed(1)} ${statLabel} is on the wrong side of the line by ${Math.abs(gap).toFixed(1)}`
    );
  }

  // Season average context
  if (seasonAvg > 0) {
    rationale.push(
      seasonAvg > line
        ? `✅ Season average of ${seasonAvg.toFixed(1)} ${statLabel} is above the ${line} line`
        : `⚠️ Season average of ${seasonAvg.toFixed(1)} ${statLabel} is below the ${line} line`
    );
  }

  // Recent form
  const hitLabel = direction === 'over' ? hitsOverInLast5 : (5 - hitsOverInLast5);
  const missLabel = 5 - hitLabel;
  if (hitLabel >= 4) {
    rationale.push(`✅ Hit this ${direction} ${hitLabel}/5 times in last 5 games`);
  } else if (hitLabel <= 1) {
    rationale.push(`❌ Only hit this ${direction} ${hitLabel}/5 times in last 5 games`);
  } else {
    rationale.push(`⚠️ Mixed recent form — ${hitLabel}/5 in last 5 games`);
  }

  // 10-game hit rate
  const hit10 = direction === 'over' ? hitsOverInLast10 : (10 - hitsOverInLast10);
  if (hit10 >= 7) {
    rationale.push(`✅ Strong 10-game trend — ${hit10}/10 hit rate`);
  } else if (hit10 <= 3) {
    rationale.push(`❌ Weak 10-game trend — only ${hit10}/10`);
  }

  // Matchup
  const defMult = stat === 'points' ? opponentDefense.pointsAllowedToPosition
    : stat === 'rebounds' ? opponentDefense.reboundsAllowedToPosition
    : opponentDefense.assistsAllowedToPosition;

  if (defMult > 1.08) {
    rationale.push(`✅ Favorable matchup — opponent allows ${((defMult - 1) * 100).toFixed(0)}% more ${statLabel} than league average`);
  } else if (defMult < 0.92) {
    rationale.push(`❌ Tough matchup — opponent holds ${statLabel} ${((1 - defMult) * 100).toFixed(0)}% below league average`);
  }

  // Market edge
  if (Math.abs(modelEdge) >= 0.08) {
    rationale.push(
      modelEdge > 0
        ? `✅ Model shows ${(modelEdge * 100).toFixed(1)}% edge over market on the over`
        : `⚠️ Model edge favors the under by ${(Math.abs(modelEdge) * 100).toFixed(1)}%`
    );
  }

  // CVS summary
  if (cvsScore >= 75) {
    rationale.push(`✅ High-conviction prop — CVS ${cvsScore.toFixed(1)}`);
  }

  return rationale;
}

// ---------------------------------------------------------------------------
// Scouting report
// ---------------------------------------------------------------------------

export function generatePropScoutingReport(
  profile: PlayerProfile,
  stat: PropStat,
  direction: PropDirection,
  line: number,
  projectedValue: number,
  hitsOverInLast5: number,
  opponentDefense: OpponentDefenseRating
): string {
  const statLabel = stat.replace(/_/g, '+');
  const dirWord = direction === 'over' ? 'exceed' : 'stay under';
  const gap = projectedValue - line;
  const seasonAvg = getSeasonAvg(profile, stat);
  const recentHits = direction === 'over' ? hitsOverInLast5 : 5 - hitsOverInLast5;

  const parts: string[] = [];

  parts.push(
    `The models project ${profile.name} for ${projectedValue.toFixed(1)} ${statLabel}, ${Math.abs(gap) >= 1 ? `${Math.abs(gap).toFixed(1)} ${gap > 0 ? 'above' : 'below'} the ${line} line` : `right near the ${line} line`}.`
  );

  if (recentHits >= 4) {
    parts.push(`Recent form strongly supports this — hitting the ${direction} in ${recentHits} of the last 5 games.`);
  } else if (recentHits <= 1) {
    parts.push(`Key concern here is recent form — only ${recentHits}/5 in the last 5 games.`);
  }

  const defMult = stat === 'points' ? opponentDefense.pointsAllowedToPosition : 1.0;
  if (defMult > 1.05) {
    parts.push(`The matchup is favorable — this opponent has been soft defending ${statLabel} all season.`);
  } else if (defMult < 0.95) {
    parts.push(`Sharp money may be fading this given the tough defensive matchup.`);
  }

  if (seasonAvg > 0) {
    parts.push(`Season average of ${seasonAvg.toFixed(1)} provides a solid baseline.`);
  }

  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// Master prop belief builder
// ---------------------------------------------------------------------------

export async function buildPropBelief(
  gameId: string,
  game: string,
  gameDate: string,
  homeTeamName: string,
  awayTeamName: string,
  profile: PlayerProfile,
  propLine: PropOddsLine,
  direction: PropDirection,
  opponentDefense: OpponentDefenseRating,
  daysOfRest: number = 2,
  opponentPace: number = 98,
  teammatesOut: number = 0
): Promise<PropBelief> {
  const isQuestionable = profile.injuryStatus === 'questionable' || profile.injuryStatus === 'doubtful';

  const modelOutput = runPropsModel(
    profile,
    propLine.stat,
    propLine.line,
    propLine.overOdds,
    propLine.underOdds,
    opponentDefense
  );

  const pickedOdds = direction === 'over' ? propLine.overOdds : propLine.underOdds;
  const pickedProb = direction === 'over' ? modelOutput.overProbability : modelOutput.underProbability;

  const marketOverImplied = americanToImplied(propLine.overOdds);
  const marketUnderImplied = americanToImplied(propLine.underOdds);
  const { homeTrue: trueOver } = removeVig(marketOverImplied, marketUnderImplied);
  const marketImpliedProb = direction === 'over' ? trueOver : 1 - trueOver;

  const modelEdge = pickedProb - marketImpliedProb;

  const hitsOverLast5 = hitRateVsLine(profile, propLine.stat, propLine.line, 5);
  const hitsOverLast10 = hitRateVsLine(profile, propLine.stat, propLine.line, 10);

  const lineValueScore = assessLineValue(propLine.line, modelOutput.projectedValue);

  const cvsScore = calculatePropCVS(
    modelEdge,
    hitsOverLast5,
    direction,
    opponentDefense,
    propLine.stat,
    profile.seasonAvgUsageRate,
    daysOfRest,
    opponentPace,
    teammatesOut,
    isQuestionable,
    lineValueScore
  );

  const beliefScore = Math.min(100,
    cvsScore * 0.50 +
    Math.abs(modelEdge) * 300 * 0.30 +  // Scale edge to 0-100 range
    modelOutput.confidence * 100 * 0.20
  );

  const beliefLabel = getPropBeliefLabel(cvsScore, modelEdge);

  const { floorOk, ceilingOk, comment } = checkFloorCeiling(profile, propLine.stat, propLine.line);

  const last10Logs = profile.recentGameLogs.slice(0, 10);
  const last10Avg = last10Logs.length > 0
    ? last10Logs.reduce((sum, l) => {
        const { getStatFromLog } = require('../models/propsModel');
        return sum + getStatFromLog(l, propLine.stat);
      }, 0) / last10Logs.length
    : getSeasonAvg(profile, propLine.stat);

  const kf = fractionalKelly(pickedProb, americanToDecimal(pickedOdds));
  const units = kellyToUnits(kf);

  const rationale = generatePropRationale(
    profile, propLine.stat, direction, propLine.line,
    modelOutput.projectedValue, modelEdge, hitsOverLast5, hitsOverLast10,
    opponentDefense, cvsScore
  );

  const scoutingReport = generatePropScoutingReport(
    profile, propLine.stat, direction, propLine.line,
    modelOutput.projectedValue, hitsOverLast5, opponentDefense
  );

  return {
    propId: uuidv4(),
    generatedAt: new Date().toISOString(),
    gameId,
    game,
    gameDate,
    playerName: profile.name,
    teamName: profile.teamName,
    opponentName: homeTeamName === profile.teamName ? awayTeamName : homeTeamName,
    stat: propLine.stat,
    direction,
    line: propLine.line,
    odds: pickedOdds,
    projectedValue: modelOutput.projectedValue,
    projectedStdDev: modelOutput.projectedStdDev,
    overProbability: modelOutput.overProbability,
    underProbability: modelOutput.underProbability,
    marketImpliedProb,
    modelEdge,
    seasonAvg: getSeasonAvg(profile, propLine.stat),
    last5Avg: profile.last5Avg[propLine.stat] ?? 0,
    last10Avg,
    hitsOverLineInLast5: hitsOverLast5,
    hitsOverLineInLast10: hitsOverLast10,
    opponentRankVsPosition: 15,
    matchupAdjustment: opponentDefense.pointsAllowedToPosition,
    cvsScore,
    beliefScore,
    beliefLabel,
    kellyFraction: kf,
    recommendedUnits: units,
    rationale,
    scoutingReport,
    result: 'PENDING',
    actualValue: null,
    resultFetchedAt: null,
  };
}

// ---------------------------------------------------------------------------
// Auto-generate top prop picks for a game slate
// ---------------------------------------------------------------------------

export async function generatePropsForGame(
  gameId: string,
  homeTeam: { id: number; name: string },
  awayTeam: { id: number; name: string },
  gameDate: string,
  daysOfRest: { home: number; away: number },
  homePace: number,
  awayPace: number
): Promise<PropBelief[]> {
  const {
    getPropOddsForGame,
    getPlayerProfile,
    getOpponentDefenseRating,
    getTopPlayersForTeam,
    buildSyntheticPropLines,
  } = await import('../data/propsFetcher');

  const gameLabel = `${awayTeam.name} @ ${homeTeam.name}`;
  const statsToFetch: PropStat[] = ['points', 'rebounds', 'assists', 'threes'];

  let propLines = await getPropOddsForGame(gameId, homeTeam.name, awayTeam.name);
  let usingFallback = false;

  // If no odds from BDL, generate synthetic lines from top players' season averages
  if (propLines.length === 0) {
    console.log(chalk.gray(`  [props] No market odds for ${gameLabel} — using synthetic lines from season averages`));
    usingFallback = true;

    for (const team of [homeTeam, awayTeam]) {
      const topPlayers = await getTopPlayersForTeam(team.id, team.name, 4);
      for (const player of topPlayers) {
        if (player.avgPoints < 8) continue;
        const profile = await getPlayerProfile(player.id, player.name, team.id, team.name);
        const synthLines = buildSyntheticPropLines(
          profile.name,
          profile.seasonAvgPoints,
          profile.seasonAvgRebounds,
          profile.seasonAvgAssists,
          profile.seasonAvgThrees,
          statsToFetch
        );
        propLines.push(...synthLines);
      }
    }

    if (propLines.length === 0) {
      console.log(chalk.gray(`  [props] Could not generate any prop lines for ${gameLabel}`));
      return [];
    }
    console.log(chalk.gray(`  [props] Generated ${propLines.length} synthetic prop lines for ${gameLabel}`));
  }

  const beliefs: PropBelief[] = [];
  const avgPace = (homePace + awayPace) / 2;

  // Group lines by playerId (preferred) or playerName
  const playerLines = new Map<string, PropOddsLine[]>();
  for (const line of propLines) {
    const key = line.playerId ? String(line.playerId) : line.playerName;
    if (!playerLines.has(key)) playerLines.set(key, []);
    playerLines.get(key)!.push(line);
  }

  for (const [playerKey, lines] of playerLines) {
    try {
      // Resolve player info — use playerId directly if available (avoids broken search)
      const { getPlayerById, searchPlayer } = await import('../data/propsFetcher');
      const firstLine = lines[0];
      let playerInfo: { id: number; name: string; teamId: number; teamName: string } | null = null;

      if (firstLine.playerId) {
        const p = await getPlayerById(firstLine.playerId);
        if (p) playerInfo = { id: p.id, name: p.name, teamId: p.teamId, teamName: p.teamName };
      }

      if (!playerInfo && !usingFallback) {
        playerInfo = await searchPlayer(firstLine.playerName);
      }

      if (!playerInfo) continue;

      const isHome    = playerInfo.teamId === homeTeam.id;
      const teamName  = isHome ? homeTeam.name : awayTeam.name;
      const profile   = await getPlayerProfile(playerInfo.id, playerInfo.name, playerInfo.teamId, teamName);

      const isHomePlayer = profile.teamId === homeTeam.id;
      const opponentId = isHomePlayer ? awayTeam.id : homeTeam.id;
      const opponentName = isHomePlayer ? awayTeam.name : homeTeam.name;
      const opponentDefense = await getOpponentDefenseRating(opponentId, opponentName, profile.position);
      const rest = isHomePlayer ? daysOfRest.home : daysOfRest.away;

      for (const line of lines) {
        for (const direction of ['over', 'under'] as PropDirection[]) {
          const belief = await buildPropBelief(
            gameId,
            gameLabel,
            gameDate,
            homeTeam.name,
            awayTeam.name,
            profile,
            line,
            direction,
            opponentDefense,
            rest,
            avgPace,
            0
          );

          // Keep only the direction with positive model edge
          if (belief.modelEdge > 0) {
            beliefs.push(belief);
          }
        }
      }
    } catch (err) {
      console.error(chalk.red(`  [props] Failed to process ${playerKey}: ${String(err)}`));
    }
  }

  console.log(chalk.gray(`  [props] ${beliefs.length} qualifying prop candidates for ${gameLabel}`));
  return beliefs;
}

// ---------------------------------------------------------------------------
// Convert a PropBelief into a Belief so it can enter the unified parlay pool
// ---------------------------------------------------------------------------

export function propBeliefToGameBelief(prop: PropBelief): Belief {
  const statLabel = prop.stat.replace(/_/g, '+');
  return {
    pickId: prop.propId,
    generatedAt: prop.generatedAt,
    game: prop.game,
    gameDate: prop.gameDate,
    homeTeam: prop.teamName,
    awayTeam: prop.opponentName,
    pickType: 'prop',
    pickSide: prop.direction as 'over' | 'under',
    pickValue: String(prop.line),
    pickedTeamOrSide: `${prop.playerName} ${statLabel} ${prop.direction.toUpperCase()} ${prop.line}`,
    odds: prop.odds,
    poissonWinProb: prop.direction === 'over' ? prop.overProbability : prop.underProbability,
    eloWinProb:     prop.direction === 'over' ? prop.overProbability : prop.underProbability,
    powerRatingEdge: prop.modelEdge,
    impliedProbability: prop.marketImpliedProb,
    modelConsensusScore: Math.min(100, Math.abs(prop.modelEdge) * 500),
    modelStdDeviation: prop.projectedStdDev / (prop.projectedValue || 1),
    cvsScore: prop.cvsScore,
    beliefScore: prop.beliefScore,
    beliefLabel: prop.beliefLabel,
    kellyFraction: prop.kellyFraction,
    recommendedUnits: prop.recommendedUnits,
    beliefRationale: prop.rationale,
    scoutingReport: prop.scoutingReport,
    result: prop.result,
    actualOutcome: prop.actualValue !== null ? String(prop.actualValue) : null,
    resultFetchedAt: prop.resultFetchedAt,
    parlayId: prop.parlayId,
    propDetails: {
      playerName: prop.playerName,
      stat: prop.stat,
      direction: prop.direction,
      line: prop.line,
      projectedValue: prop.projectedValue,
      projectedStdDev: prop.projectedStdDev,
      seasonAvg: prop.seasonAvg,
      last5Avg: prop.last5Avg,
      hitsOverLineInLast5: prop.hitsOverLineInLast5,
      propId: prop.propId,
    },
  };
}
