import chalk from 'chalk';
import {
  getPendingBeliefs,
  updateBeliefResult,
  getRecentParlays,
  updateParlayResult,
} from '../db/queries';
import { getGameResult } from '../data/fetcher';
import { PickResult } from '../data/types';

function determineResult(
  pickType: string,
  pickSide: string,
  pickValue: string,
  homeScore: number,
  awayScore: number,
  odds: GameOdds
): PickResult {
  switch (pickType) {
    case 'moneyline': {
      const homeWon = homeScore > awayScore;
      if (pickSide === 'home') return homeWon ? 'WIN' : 'LOSS';
      if (pickSide === 'away') return !homeWon ? 'WIN' : 'LOSS';
      break;
    }
    case 'spread': {
      const spreadValue = parseFloat(pickValue);
      const homeMargin = homeScore - awayScore;
      if (pickSide === 'home') {
        const adjusted = homeMargin + spreadValue;
        if (adjusted > 0) return 'WIN';
        if (adjusted < 0) return 'LOSS';
        return 'PUSH';
      } else {
        const adjusted = (awayScore - homeScore) + Math.abs(spreadValue);
        if (adjusted > 0) return 'WIN';
        if (adjusted < 0) return 'LOSS';
        return 'PUSH';
      }
    }
    case 'total': {
      const totalLine = parseFloat(pickValue);
      const actualTotal = homeScore + awayScore;
      if (pickSide === 'over') {
        if (actualTotal > totalLine) return 'WIN';
        if (actualTotal < totalLine) return 'LOSS';
        return 'PUSH';
      } else {
        if (actualTotal < totalLine) return 'WIN';
        if (actualTotal > totalLine) return 'LOSS';
        return 'PUSH';
      }
    }
  }
  return 'PENDING';
}

// Temp interface to satisfy TS in determineResult
interface GameOdds {
  spread: number;
  totalLine: number;
}

export async function syncResults(): Promise<{
  resolved: number;
  wins: number;
  losses: number;
  pushes: number;
}> {
  const pending = getPendingBeliefs();
  const today = new Date().toISOString().split('T')[0];
  const pastPending = pending.filter((b) => b.gameDate < today);

  if (pastPending.length === 0) {
    console.log(chalk.gray('No pending picks to resolve.'));
    return { resolved: 0, wins: 0, losses: 0, pushes: 0 };
  }

  console.log(chalk.cyan(`Resolving ${pastPending.length} pending picks...`));

  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let resolved = 0;

  for (const belief of pastPending) {
    try {
      const result = await getGameResult(belief.game.replace(' @ ', '_'));
      if (!result) continue;

      const pickResult = determineResult(
        belief.pickType,
        belief.pickSide,
        belief.pickValue,
        result.homeScore,
        result.awayScore,
        { spread: parseFloat(belief.pickValue) || 0, totalLine: parseFloat(belief.pickValue) || 0 }
      );

      updateBeliefResult(belief.pickId, pickResult, result.finalScore);
      resolved++;

      if (pickResult === 'WIN') wins++;
      else if (pickResult === 'LOSS') losses++;
      else if (pickResult === 'PUSH') pushes++;
    } catch (err) {
      console.error(chalk.red(`Failed to resolve pick ${belief.pickId}: ${String(err)}`));
    }
  }

  // Update parlay results
  const recentParlays = getRecentParlays(20);
  for (const parlay of recentParlays) {
    if (parlay.result !== 'PENDING') continue;
    const allResolved = parlay.picks.every((p) => p.result !== 'PENDING');
    if (!allResolved) continue;
    const parlayWon = parlay.picks.every((p) => p.result === 'WIN');
    const parlayLost = parlay.picks.some((p) => p.result === 'LOSS');
    if (parlayWon) {
      updateParlayResult(parlay.parlayId, 'WIN');
    } else if (parlayLost) {
      updateParlayResult(parlay.parlayId, 'LOSS');
    }
  }

  const winRate = resolved > 0 ? ((wins / resolved) * 100).toFixed(1) : '0.0';
  console.log(
    chalk.green(`Resolved ${resolved} picks: ${wins} wins, ${losses} losses, ${pushes} pushes (${winRate}% win rate)`)
  );

  return { resolved, wins, losses, pushes };
}
