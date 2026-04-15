import { v4 as uuidv4 } from 'uuid';
import { Belief, ParlayCard, ParlayMode, PickType, PickSide, UpcomingGame } from '../data/types';
import { buildBelief } from './belief';
import { combineParlayOdds, parlayExpectedValue, kellyToUnits } from '../models/kelly';
import { getGamesForDate } from '../data/fetcher';
import chalk from 'chalk';

export function correlationPenalty(pick1: Belief, pick2: Belief): number {
  const sameGame = pick1.game === pick2.game;
  const sameSeries =
    pick1.homeTeam === pick2.homeTeam && pick1.awayTeam === pick2.awayTeam;
  const sameDate = pick1.gameDate === pick2.gameDate;

  if (sameGame) return 0.3; // Same game, different market — heavily penalize
  if (sameSeries && sameDate) return 0.5;
  if (sameSeries) return 0.8;
  return 1.0;
}

export function buildOptimalParlay(eligibleBeliefs: Belief[]): Belief[] {
  if (eligibleBeliefs.length === 0) return [];
  if (eligibleBeliefs.length <= 4) return eligibleBeliefs;

  const sorted = [...eligibleBeliefs].sort(
    (a, b) => b.cvsScore * b.beliefScore - a.cvsScore * a.beliefScore
  );

  const selected: Belief[] = [sorted[0]];

  for (const candidate of sorted.slice(1)) {
    if (selected.length >= 4) break;

    // Calculate correlation penalty against already-selected picks
    const minPenalty = selected.reduce(
      (min, s) => Math.min(min, correlationPenalty(candidate, s)),
      1.0
    );

    if (minPenalty < 0.4) continue; // Too correlated, skip

    // Prefer variety in pick types
    const typeCounts: Record<string, number> = {};
    for (const s of selected) typeCounts[s.pickType] = (typeCounts[s.pickType] ?? 0) + 1;
    const typeBonus = (typeCounts[candidate.pickType] ?? 0) === 0 ? 1.1 : 1.0;

    const score = candidate.cvsScore * candidate.beliefScore * minPenalty * typeBonus;

    if (score > 0) selected.push(candidate);
  }

  return selected;
}

export function calculateParlayStats(picks: Belief[]): {
  combinedOdds: number;
  impliedWinProbability: number;
  expectedValue: number;
  recommendedUnits: number;
} {
  if (picks.length === 0) {
    return { combinedOdds: 0, impliedWinProbability: 0, expectedValue: 0, recommendedUnits: 0 };
  }

  const combinedOdds = combineParlayOdds(picks.map((p) => p.odds));
  const evInputs = picks.map((p) => ({
    winProbability: Math.max(p.poissonWinProb, p.eloWinProb),
    americanOdds: p.odds,
  }));
  const expectedValue = parlayExpectedValue(evInputs);
  const impliedWinProbability = evInputs.reduce((acc, p) => acc * p.winProbability, 1);

  // Kelly-based units: 1-3 units for parlays (conservative)
  const kellyInput = picks.reduce(
    (acc, p) => Math.min(acc, p.kellyFraction),
    picks[0]?.kellyFraction ?? 0
  );
  const recommendedUnits = Math.min(3, kellyToUnits(kellyInput));

  return { combinedOdds, impliedWinProbability, expectedValue, recommendedUnits };
}

export async function hasGamesOnDate(date: string): Promise<boolean> {
  try {
    const games = await getGamesForDate(date);
    return games.length > 0;
  } catch {
    return false;
  }
}

export async function findNextGameDay(fromDate?: string): Promise<string | null> {
  const start = fromDate ? new Date(fromDate) : new Date();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const hasGames = await hasGamesOnDate(dateStr);
    if (hasGames) return dateStr;
  }
  return null;
}

const CVS_THRESHOLD_DEFAULT = 68;

function loadCVSThreshold(): number {
  try {
    const fs = require('fs');
    const path = require('path');
    const raw = JSON.parse(fs.readFileSync(path.resolve('./data/calibration.json'), 'utf-8'));
    return (raw.cvsThreshold as number) ?? CVS_THRESHOLD_DEFAULT;
  } catch {
    return CVS_THRESHOLD_DEFAULT;
  }
}

export async function generateDailyParlay(
  targetDate?: string,
  mode: ParlayMode = 'on-demand'
): Promise<ParlayCard> {
  let date = targetDate ?? new Date().toISOString().split('T')[0];

  // In on-demand mode, find next game day if no games today
  if (mode === 'on-demand') {
    const hasGames = await hasGamesOnDate(date);
    if (!hasGames) {
      const nextDay = await findNextGameDay(date);
      if (nextDay) {
        console.log(chalk.yellow(`No games on ${date}. Generating parlay for ${nextDay} — next available game day.`));
        date = nextDay;
      } else {
        console.log(chalk.red('No upcoming games found in the next 7 days.'));
      }
    }
  }

  const games = await getGamesForDate(date);
  const cvsThreshold = loadCVSThreshold();

  console.log(chalk.gray(`Running models on ${games.length} matchup${games.length !== 1 ? 's' : ''}...`));

  const allBeliefs: Belief[] = [];
  const allCandidates: Belief[] = []; // track everything for debug output

  for (const game of games) {
    console.log(chalk.gray(`  ${game.awayTeam.name} @ ${game.homeTeam.name}`));
    const pickTypes: Array<{ type: PickType; side: PickSide }> = [
      { type: 'moneyline', side: 'home' },
      { type: 'moneyline', side: 'away' },
      { type: 'spread', side: 'home' },
      { type: 'spread', side: 'away' },
      { type: 'total', side: 'over' },
      { type: 'total', side: 'under' },
    ];

    for (const { type, side } of pickTypes) {
      try {
        const belief = await buildBelief(game, type, side);
        allCandidates.push(belief);
        if (belief.cvsScore >= cvsThreshold) {
          allBeliefs.push(belief);
        }
      } catch (err) {
        console.error(chalk.red(`Error building belief for ${game.homeTeam.name} vs ${game.awayTeam.name} (${type}/${side}): ${String(err)}`));
      }
    }
  }

  // If nothing qualified, show the top candidates so the user can see what scores were generated
  if (allBeliefs.length === 0 && allCandidates.length > 0) {
    const top5 = [...allCandidates].sort((a, b) => b.cvsScore - a.cvsScore).slice(0, 5);
    console.log(chalk.yellow(`\nNo picks cleared the CVS threshold of ${cvsThreshold}. Top candidates:`));
    for (const c of top5) {
      console.log(
        chalk.gray(`  ${c.pickedTeamOrSide} (${c.pickType}) — CVS: ${c.cvsScore.toFixed(1)} | Belief: ${c.beliefScore.toFixed(1)} | ${c.beliefLabel}`)
      );
    }
    console.log(chalk.gray(`\nTip: If odds are showing as 'fallback', check your ODDS_API_KEY in .env`));
  }

  const picksEligible = allBeliefs.length;
  const parlayPicks = buildOptimalParlay(allBeliefs);

  const stats = calculateParlayStats(parlayPicks);

  return {
    parlayId: uuidv4(),
    generatedAt: new Date().toISOString(),
    targetDate: date,
    mode,
    picks: parlayPicks,
    combinedOdds: stats.combinedOdds,
    expectedValue: stats.expectedValue,
    totalCvsScore: parlayPicks.reduce((acc, p) => acc + p.cvsScore, 0) / (parlayPicks.length || 1),
    recommendedUnits: stats.recommendedUnits,
    result: 'PENDING',
    gamesAvailable: games.length,
    picksEligible,
  };
}

export function startScheduler(): void {
  const cron = require('node-cron');

  console.log(chalk.cyan('Scheduler running. Morning picks: 9:00 AM. Overnight sync: 1:00 AM. Press Ctrl+C to stop.'));

  // Morning picks — 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    const today = new Date().toISOString().split('T')[0];
    const hasGames = await hasGamesOnDate(today);
    if (!hasGames) {
      console.log(chalk.gray(`[Scheduler] No games today (${today}). Skipping parlay generation.`));
      return;
    }
    console.log(chalk.cyan(`[Scheduler] Generating daily parlay for ${today}...`));
    try {
      const { saveParlay } = await import('../db/queries');
      const parlay = await generateDailyParlay(today, 'auto');
      saveParlay(parlay);
      console.log(chalk.green(`[Scheduler] Parlay saved for ${today}: ${parlay.picks.length} legs @ +${parlay.combinedOdds}`));
    } catch (err) {
      console.error(chalk.red(`[Scheduler] Morning parlay failed: ${String(err)}`));
    }
  });

  // Overnight sync — 1:00 AM
  cron.schedule('0 1 * * *', async () => {
    console.log(chalk.cyan('[Scheduler] Running overnight sync...'));
    try {
      const { syncResults } = await import('../cli/syncResults');
      await syncResults();
    } catch (err) {
      console.error(chalk.red(`[Scheduler] Overnight sync failed: ${String(err)}`));
    }
  });
}
