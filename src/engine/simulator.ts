import chalk from 'chalk';
import { SimulationReport, UpcomingGame, ModelWeights } from '../data/types';
import { buildBelief } from './belief';
import { buildOptimalParlay, calculateParlayStats } from './parlayBuilder';
import { runRecalibration } from './recalibrator';

interface WeekData {
  week: number;
  games: UpcomingGame[];
  results: Record<string, { homeScore: number; awayScore: number }>;
}

export async function loadHistoricalSeason(
  season: number
): Promise<WeekData[]> {
  const { default: axios } = await import('axios');
  const apiKey = process.env.BALLDONTLIE_API_KEY ?? '';
  const weeks: WeekData[] = [];

  try {
    const res = await axios.get('https://api.balldontlie.io/v1/games', {
      timeout: 10_000,
      headers: { Authorization: apiKey },
      params: {
        per_page: 100,
        postseason: true,
        'seasons[]': [season],
      },
    });

    const rawGames: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];

    // Group by week (7-day buckets from playoff start)
    const sorted = rawGames
      .filter((g) => g.home_team_score && g.visitor_team_score)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));

    if (sorted.length === 0) return [];

    const startDate = new Date(sorted[0].date as string);
    const weekMap: Map<number, typeof sorted> = new Map();

    for (const g of sorted) {
      const gameDate = new Date(g.date as string);
      const weekNum = Math.floor((gameDate.getTime() - startDate.getTime()) / (7 * 86_400_000)) + 1;
      if (!weekMap.has(weekNum)) weekMap.set(weekNum, []);
      weekMap.get(weekNum)!.push(g);
    }

    for (const [week, games] of weekMap) {
      const results: Record<string, { homeScore: number; awayScore: number }> = {};
      const upcomingGames: UpcomingGame[] = [];

      for (const g of games) {
        results[String(g.id)] = {
          homeScore: g.home_team_score as number,
          awayScore: g.visitor_team_score as number,
        };
      }

      weeks.push({ week, games: upcomingGames, results });
    }
  } catch (err) {
    console.error(chalk.red(`Failed to load historical season ${season}: ${String(err)}`));
  }

  return weeks.slice(0, 20); // Cap at 20 weeks
}

export async function runSimulation(
  season: number,
  weeks: number
): Promise<SimulationReport> {
  console.log(chalk.cyan(`Running simulation for ${season} season, ${weeks} weeks...`));

  const weeklyData = await loadHistoricalSeason(season);
  const targetWeeks = weeklyData.slice(0, weeks);

  let totalPicks = 0;
  let totalWins = 0;
  const parlayResults: SimulationReport['parlayResults'] = [];
  const weeklyWinRates: number[] = [];
  const roiByWeek: number[] = [];
  const modelWeightEvolution: ModelWeights[] = [];
  let parlayHits = 0;

  for (const weekData of targetWeeks) {
    const { week, games, results } = weekData;
    console.log(chalk.gray(`  Week ${week}: ${games.length} games`));

    const weekBeliefs = [];
    let weekWins = 0;
    let weekTotal = 0;

    for (const game of games) {
      try {
        const belief = await buildBelief(game, 'moneyline', 'home');
        // Simulate outcome
        const result = results[game.id];
        if (result) {
          const won = result.homeScore > result.awayScore;
          belief.result = won ? 'WIN' : 'LOSS';
          belief.actualOutcome = `${result.homeScore}-${result.awayScore}`;
          if (won) weekWins++;
          weekTotal++;
          weekBeliefs.push(belief);
          totalPicks++;
          if (won) totalWins++;
        }
      } catch { /* skip */ }
    }

    // Parlay for the week
    const eligible = weekBeliefs.filter((b) => b.cvsScore >= 68);
    const parlayPicks = buildOptimalParlay(eligible);
    const parlayHit = parlayPicks.every((p) => p.result === 'WIN');
    if (parlayPicks.length >= 2) {
      const stats = calculateParlayStats(parlayPicks);
      parlayResults.push({ week, legs: parlayPicks.length, hit: parlayHit, odds: stats.combinedOdds });
      if (parlayHit) parlayHits++;
    }

    const weekWinRate = weekTotal > 0 ? weekWins / weekTotal : 0;
    weeklyWinRates.push(weekWinRate);
    roiByWeek.push(weekWins * 0.909 - (weekTotal - weekWins));

    // Recalibrate after each week
    try {
      const recalResult = await runRecalibration();
      const { loadCalibration } = await import('./recalibrator');
      const config = loadCalibration();
      modelWeightEvolution.push({ ...config.modelWeights });
    } catch { /* ignore */ }
  }

  const overallWinRate = totalPicks > 0 ? totalWins / totalPicks : 0;
  const parlayHitRate = parlayResults.length > 0 ? parlayHits / parlayResults.length : 0;

  const bestWeekIdx = weeklyWinRates.reduce((bi, wr, i) => wr > (weeklyWinRates[bi] ?? 0) ? i : bi, 0);
  const worstWeekIdx = weeklyWinRates.reduce((wi, wr, i) => wr < (weeklyWinRates[wi] ?? 1) ? i : wi, 0);

  const { loadCalibration } = await import('./recalibrator');
  const finalConfig = loadCalibration();

  return {
    season,
    weeksSimulated: targetWeeks.length,
    totalPicks,
    overallWinRate,
    parlayResults,
    parlayHitRate,
    weeklyWinRates,
    modelWeightEvolution,
    roiByWeek,
    bestWeek: { week: (targetWeeks[bestWeekIdx]?.week ?? 0), winRate: weeklyWinRates[bestWeekIdx] ?? 0 },
    worstWeek: { week: (targetWeeks[worstWeekIdx]?.week ?? 0), winRate: weeklyWinRates[worstWeekIdx] ?? 0 },
    finalModelWeights: finalConfig.modelWeights,
  };
}
