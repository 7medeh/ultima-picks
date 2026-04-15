import { v4 as uuidv4 } from 'uuid';
import {
  Belief,
  BeliefLabel,
  ModelOutput,
  PickSide,
  PickType,
  UpcomingGame,
} from '../data/types';
import { runPoissonModel } from '../models/poisson';
import { runEloModel } from '../models/elo';
import { runPowerRatingModel } from '../models/powerRating';
import { runImpliedProbabilityModel, americanToImplied, removeVig } from '../models/impliedProbability';
import { fractionalKelly, kellyToUnits, americanToDecimal } from '../models/kelly';
import { calculateCVS } from './cvs';
import { getWinRateByPickType } from '../db/queries';
import { calculateInjuryImpact } from '../models/powerRating';

export function calculateModelConsensus(modelOutputs: ModelOutput[]): {
  consensusScore: number;
  stdDeviation: number;
  avgProbability: number;
} {
  const probs = modelOutputs.map((m) => m.homeWinProbability);
  const avg = probs.reduce((a, b) => a + b, 0) / probs.length;
  const variance = probs.reduce((sum, p) => sum + Math.pow(p - avg, 2), 0) / probs.length;
  const stdDev = Math.sqrt(variance);
  const consensusScore = Math.max(0, 100 - stdDev * 500);
  return { consensusScore, stdDeviation: stdDev, avgProbability: avg };
}

export function getHistoricalAccuracy(pickType: PickType): number {
  try {
    const r20 = getWinRateByPickType(pickType, 20);
    const r50 = getWinRateByPickType(pickType, 50);
    const r100 = getWinRateByPickType(pickType, 100);
    // Fallback if no data: assume 52% (slight edge)
    const a20 = r20 || 0.52;
    const a50 = r50 || 0.52;
    const a100 = r100 || 0.52;
    return a20 * 0.5 + a50 * 0.3 + a100 * 0.2;
  } catch {
    return 0.52;
  }
}

export function scoreMarketDisagreement(
  modelAvgProb: number,
  marketImpliedProb: number
): number {
  const edge = modelAvgProb - marketImpliedProb;
  if (edge >= 0.15) return 100;
  if (edge >= 0.10) return 75;
  if (edge >= 0.05) return 50;
  if (edge >= 0) return 25;
  return 0;
}

export function calculateBeliefScore(
  cvsScore: number,
  consensusScore: number,
  historicalAccuracy: number,
  marketDisagreementScore: number
): number {
  return (
    cvsScore * 0.30 +
    consensusScore * 0.35 +
    historicalAccuracy * 100 * 0.20 +
    marketDisagreementScore * 0.15
  );
}

export function getBeliefLabel(beliefScore: number): BeliefLabel {
  if (beliefScore >= 75) return 'CONVICTION';
  if (beliefScore >= 60) return 'LEAN';
  return 'SPECULATIVE';
}

export function generateBeliefRationale(
  game: UpcomingGame,
  pickSide: PickSide,
  modelOutputs: ModelOutput[],
  cvsScore: number,
  beliefScore: number,
  h2hRecord: { team1Wins: number; team2Wins: number }
): string[] {
  const rationale: string[] = [];
  const isHome = pickSide === 'home';
  const isTotalBet = pickSide === 'over' || pickSide === 'under';
  const pickedStats = isHome ? game.homeTeamStats : game.awayTeamStats;
  const oppStats = isHome ? game.awayTeamStats : game.homeTeamStats;
  const pickedTeam = isHome ? game.homeTeam.name : game.awayTeam.name;
  const oppTeam = isHome ? game.awayTeam.name : game.homeTeam.name;

  // Poisson
  const poissonModel = modelOutputs.find((m) => m.modelName === 'poisson');
  if (poissonModel) {
    const prob = isHome ? poissonModel.homeWinProbability : poissonModel.awayWinProbability;
    const homeImplied = americanToImplied(game.odds.homeMoneyline);
    const awayImplied = americanToImplied(game.odds.awayMoneyline);
    const { homeTrue, awayTrue } = removeVig(homeImplied, awayImplied);
    const marketProb = isHome ? homeTrue : awayTrue;
    const edge = prob - marketProb;
    if (Math.abs(edge) > 0.05) {
      rationale.push(
        edge > 0
          ? `✅ Poisson model gives ${pickedTeam} a ${(prob * 100).toFixed(1)}% win probability vs ${(marketProb * 100).toFixed(1)}% implied by market (+${(edge * 100).toFixed(1)}% edge)`
          : `❌ Poisson model only gives ${pickedTeam} ${(prob * 100).toFixed(1)}% vs ${(marketProb * 100).toFixed(1)}% market-implied (${(edge * 100).toFixed(1)}% edge)`
      );
    }
  }

  // Elo
  const eloModel = modelOutputs.find((m) => m.modelName === 'elo');
  if (eloModel) {
    const prob = isHome ? eloModel.homeWinProbability : eloModel.awayWinProbability;
    if (prob > 0.60) {
      rationale.push(`✅ Elo model strongly favors ${pickedTeam} at ${(prob * 100).toFixed(1)}% win probability`);
    } else if (prob < 0.45) {
      rationale.push(`❌ Elo model has ${pickedTeam} as underdogs at ${(prob * 100).toFixed(1)}% win probability`);
    } else {
      rationale.push(`⚠️ Elo model shows close matchup — ${pickedTeam} at ${(prob * 100).toFixed(1)}%`);
    }
  }

  // Model consensus
  const { consensusScore, stdDeviation } = calculateModelConsensus(modelOutputs);
  if (consensusScore >= 75) {
    rationale.push(`✅ Strong model consensus — all 4 models agree (std dev: ${stdDeviation.toFixed(3)})`);
  } else if (consensusScore < 50) {
    rationale.push(`⚠️ Mixed model signals — models diverge significantly (std dev: ${stdDeviation.toFixed(3)})`);
  }

  // Rest advantage
  if (!isTotalBet) {
    const restDiff = pickedStats.daysOfRest - oppStats.daysOfRest;
    if (restDiff >= 2) {
      rationale.push(`✅ ${pickedTeam} has significant rest advantage (${pickedStats.daysOfRest} vs ${oppStats.daysOfRest} days)`);
    } else if (restDiff <= -2) {
      rationale.push(`❌ ${pickedTeam} is at a rest disadvantage (${pickedStats.daysOfRest} vs ${oppStats.daysOfRest} days)`);
    }
  }

  // Injury situation
  const pickedInjuries = pickedStats.injuryReport.filter((p) => p.status === 'out' || p.status === 'doubtful');
  const oppInjuries = oppStats.injuryReport.filter((p) => p.status === 'out' || p.status === 'doubtful');
  if (oppInjuries.length > 0) {
    const names = oppInjuries.map((p) => p.name).join(', ');
    rationale.push(`✅ ${oppTeam} dealing with injuries: ${names}`);
  }
  if (pickedInjuries.length > 0) {
    const names = pickedInjuries.map((p) => p.name).join(', ');
    rationale.push(`❌ ${pickedTeam} missing key players: ${names}`);
  }

  // Momentum
  const { wins, losses } = pickedStats.last10Record;
  if (wins >= 8) {
    rationale.push(`✅ ${pickedTeam} in excellent form — ${wins}-${losses} last 10 games (+${pickedStats.last10PointDiff.toFixed(1)} avg margin)`);
  } else if (losses >= 8) {
    rationale.push(`❌ ${pickedTeam} struggling — ${wins}-${losses} last 10 games (${pickedStats.last10PointDiff.toFixed(1)} avg margin)`);
  }

  // Home court
  if (!isTotalBet) {
    if (isHome) {
      const homeWinPct = game.homeTeamStats.homeRecord.wins /
        (game.homeTeamStats.homeRecord.wins + game.homeTeamStats.homeRecord.losses || 1);
      if (homeWinPct >= 0.65) {
        rationale.push(`✅ ${pickedTeam} strong at home (${(homeWinPct * 100).toFixed(0)}% home win rate)`);
      } else {
        rationale.push(`⚠️ Home court advantage in play but ${pickedTeam} only ${(homeWinPct * 100).toFixed(0)}% at home`);
      }
    } else {
      rationale.push(`⚠️ Picking road team — ${pickedTeam} must win on the road`);
    }
  }

  // H2H
  const h2hTotal = h2hRecord.team1Wins + h2hRecord.team2Wins;
  if (h2hTotal >= 3) {
    const h2hRate = h2hRecord.team1Wins / h2hTotal;
    if (h2hRate >= 0.65) {
      rationale.push(`✅ Favorable H2H — ${pickedTeam} leads series ${h2hRecord.team1Wins}-${h2hRecord.team2Wins}`);
    } else if (h2hRate <= 0.35) {
      rationale.push(`❌ Unfavorable H2H — ${pickedTeam} trails series ${h2hRecord.team1Wins}-${h2hRecord.team2Wins}`);
    }
  }

  // CVS / belief summary
  if (cvsScore >= 80) {
    rationale.push(`✅ Elite CVS score of ${cvsScore.toFixed(1)} — this is a high-conviction spot`);
  }

  return rationale;
}

export function generateScoutingReport(
  game: UpcomingGame,
  pickSide: PickSide,
  belief: Partial<Belief>
): string {
  const isHome = pickSide === 'home';
  const isTotalBet = pickSide === 'over' || pickSide === 'under';
  const pickedTeam = isHome ? game.homeTeam.name : game.awayTeam.name;
  const oppTeam = isHome ? game.awayTeam.name : game.homeTeam.name;
  const pickedStats = isHome ? game.homeTeamStats : game.awayTeamStats;
  const oppStats = isHome ? game.awayTeamStats : game.homeTeamStats;

  const avgProb = ((belief.poissonWinProb ?? 0.5) + (belief.eloWinProb ?? 0.5)) / 2;
  const probStr = (avgProb * 100).toFixed(1);

  if (isTotalBet) {
    const direction = pickSide === 'over' ? 'OVER' : 'UNDER';
    const pace = ((game.homeTeamStats.pace + game.awayTeamStats.pace) / 2).toFixed(1);
    return `The models ${direction === 'OVER' ? 'strongly favor' : 'lean toward'} the ${direction} ${game.odds.totalLine} in this matchup. Both teams are running at a combined pace of ${pace} possessions per game, and the offensive ratings suggest a ${direction === 'OVER' ? 'high-scoring' : 'grind-it-out'} contest. Key concern here is late-game pace shifts in playoff basketball. Sharp money may be on the ${direction} given current line movement.`;
  }

  const restNote = pickedStats.daysOfRest > oppStats.daysOfRest
    ? `The rest advantage is notable — ${pickedTeam} has had ${pickedStats.daysOfRest} days off versus ${oppStats.daysOfRest} for ${oppTeam}.`
    : pickedStats.daysOfRest < oppStats.daysOfRest
    ? `Worth flagging: ${pickedTeam} is on shorter rest (${pickedStats.daysOfRest} days vs ${oppStats.daysOfRest}).`
    : '';

  const momentumNote = pickedStats.last10Record.wins >= 7
    ? `${pickedTeam} has been rolling — ${pickedStats.last10Record.wins}-${pickedStats.last10Record.losses} last 10.`
    : pickedStats.last10Record.losses >= 7
    ? `${pickedTeam} has been shaky recently — only ${pickedStats.last10Record.wins}-${pickedStats.last10Record.losses} last 10.`
    : '';

  const injuryNote = oppStats.injuryReport.some((p) => p.status === 'out')
    ? `${oppTeam} is short-handed with confirmed absences.`
    : '';

  const modelNote = belief.cvsScore && belief.cvsScore >= 75
    ? `The models strongly favor ${pickedTeam} at ~${probStr}% implied win probability.`
    : `The models lean toward ${pickedTeam} at ~${probStr}% win probability.`;

  const parts = [modelNote, restNote, momentumNote, injuryNote].filter(Boolean);
  if (parts.length < 3) {
    parts.push(`This is a ${isHome ? 'home' : 'road'} spot for ${pickedTeam} and the numbers support this side given current form.`);
  }

  return parts.join(' ');
}

export async function buildBelief(
  game: UpcomingGame,
  pickType: PickType,
  pickSide: PickSide
): Promise<Belief> {
  const modelOutputs: ModelOutput[] = [
    runPoissonModel(game.homeTeamStats, game.awayTeamStats),
    runEloModel(game.homeTeam, game.awayTeam),
    runPowerRatingModel(game.homeTeamStats, game.awayTeamStats),
    runImpliedProbabilityModel(game.odds),
  ];

  const isHome = pickSide === 'home';
  const isTotalBet = pickSide === 'over' || pickSide === 'under';

  // H2H — best effort
  let h2hRecord = { team1Wins: 0, team2Wins: 0, avgMargin: 0 };
  try {
    const { getHeadToHead } = await import('../data/fetcher');
    const currentYear = new Date().getFullYear();
    h2hRecord = await getHeadToHead(game.homeTeam.id, game.awayTeam.id, [currentYear, currentYear - 1]);
  } catch { /* ignore */ }

  const cvsRecord = isHome
    ? { team1Wins: h2hRecord.team1Wins, team2Wins: h2hRecord.team2Wins }
    : { team1Wins: h2hRecord.team2Wins, team2Wins: h2hRecord.team1Wins };

  const cvsScore = calculateCVS(game, pickSide, modelOutputs, cvsRecord);

  const { consensusScore, stdDeviation, avgProbability } = calculateModelConsensus(modelOutputs);
  const historicalAccuracy = getHistoricalAccuracy(pickType);

  const homeImplied = americanToImplied(game.odds.homeMoneyline);
  const awayImplied = americanToImplied(game.odds.awayMoneyline);
  const { homeTrue, awayTrue } = removeVig(homeImplied, awayImplied);
  const marketProb = isTotalBet ? 0.5 : isHome ? homeTrue : awayTrue;
  const marketDisagreementScore = scoreMarketDisagreement(avgProbability, marketProb);

  const beliefScore = calculateBeliefScore(cvsScore, consensusScore, historicalAccuracy, marketDisagreementScore);
  const beliefLabel = getBeliefLabel(beliefScore);

  // Pick details
  const pickedTeam = isTotalBet
    ? (pickSide === 'over' ? 'Over' : 'Under')
    : isHome
    ? game.homeTeam.name
    : game.awayTeam.name;

  const pickedOdds = isTotalBet
    ? (pickSide === 'over' ? game.odds.overOdds : game.odds.underOdds)
    : isHome
    ? (pickType === 'spread' ? game.odds.homeSpreadOdds : game.odds.homeMoneyline)
    : (pickType === 'spread' ? game.odds.awaySpreadOdds : game.odds.awayMoneyline);

  const pickValue = isTotalBet
    ? String(game.odds.totalLine)
    : pickType === 'spread'
    ? String(isHome ? game.odds.spread : -game.odds.spread)
    : pickedTeam;

  const modelProb = isTotalBet
    ? 0.5
    : isHome
    ? avgProbability
    : 1 - avgProbability;

  const decimalOdds = americanToDecimal(pickedOdds);
  const kf = fractionalKelly(modelProb, decimalOdds);
  const units = kellyToUnits(kf);

  const poissonOutput = modelOutputs.find((m) => m.modelName === 'poisson');
  const eloOutput = modelOutputs.find((m) => m.modelName === 'elo');
  const powerOutput = modelOutputs.find((m) => m.modelName === 'powerRating');

  const partialBelief: Partial<Belief> = {
    cvsScore,
    beliefScore,
    beliefLabel,
    poissonWinProb: isHome ? (poissonOutput?.homeWinProbability ?? 0.5) : (poissonOutput?.awayWinProbability ?? 0.5),
    eloWinProb: isHome ? (eloOutput?.homeWinProbability ?? 0.5) : (eloOutput?.awayWinProbability ?? 0.5),
    powerRatingEdge: (powerOutput?.homeWinProbability ?? 0.5) - marketProb,
    impliedProbability: marketProb,
    kellyFraction: kf,
    recommendedUnits: units,
  };

  const beliefRationale = generateBeliefRationale(
    game, pickSide, modelOutputs, cvsScore, beliefScore, cvsRecord
  );
  const scoutingReport = generateScoutingReport(game, pickSide, partialBelief);

  const belief: Belief = {
    pickId: uuidv4(),
    generatedAt: new Date().toISOString(),
    game: `${game.awayTeam.name} @ ${game.homeTeam.name}`,
    gameDate: game.gameDate,
    homeTeam: game.homeTeam.name,
    awayTeam: game.awayTeam.name,
    pickType,
    pickSide,
    pickValue,
    pickedTeamOrSide: pickedTeam,
    odds: pickedOdds,
    poissonWinProb: partialBelief.poissonWinProb ?? 0.5,
    eloWinProb: partialBelief.eloWinProb ?? 0.5,
    powerRatingEdge: partialBelief.powerRatingEdge ?? 0,
    impliedProbability: marketProb,
    modelConsensusScore: consensusScore,
    modelStdDeviation: stdDeviation,
    cvsScore,
    beliefScore,
    beliefLabel,
    kellyFraction: kf,
    recommendedUnits: units,
    beliefRationale,
    scoutingReport,
    result: 'PENDING',
    actualOutcome: null,
    resultFetchedAt: null,
  };

  return belief;
}
