import chalk from 'chalk';
import Table from 'cli-table3';
import { runSimulation } from '../engine/simulator';
import { getDb } from '../db/schema';

export async function runSimulateCommand(season: number, weeks: number): Promise<void> {
  console.log(chalk.cyan.bold(`\nBacktest Simulation — ${season} Season (${weeks} weeks)\n`));

  const report = await runSimulation(season, weeks);

  console.log(chalk.bold.white('SIMULATION RESULTS'));
  console.log(chalk.white(`  Season:         ${report.season}`));
  console.log(chalk.white(`  Weeks Simulated: ${report.weeksSimulated}`));
  console.log(chalk.white(`  Total Picks:    ${report.totalPicks}`));
  console.log(
    chalk.white(`  Overall Win Rate: `) +
      (report.overallWinRate >= 0.55
        ? chalk.green(`${(report.overallWinRate * 100).toFixed(1)}%`)
        : chalk.yellow(`${(report.overallWinRate * 100).toFixed(1)}%`))
  );
  console.log(
    chalk.white(`  Parlay Hit Rate: `) +
      (report.parlayHitRate >= 0.6
        ? chalk.green(`${(report.parlayHitRate * 100).toFixed(1)}%`)
        : chalk.yellow(`${(report.parlayHitRate * 100).toFixed(1)}%`)) +
      chalk.gray(` (target: 60%)`)
  );
  console.log();

  // Weekly parlay results
  if (report.parlayResults.length > 0) {
    console.log(chalk.bold.white('PARLAY RESULTS BY WEEK'));
    const parlayTable = new Table({
      head: ['Week', 'Legs', 'Odds', 'Result'],
      style: { head: ['cyan'] },
    });
    for (const pr of report.parlayResults) {
      parlayTable.push([
        String(pr.week),
        String(pr.legs),
        pr.odds > 0 ? `+${pr.odds}` : String(pr.odds),
        pr.hit ? chalk.green('HIT') : chalk.red('MISS'),
      ]);
    }
    console.log(parlayTable.toString());
  }

  // Best/worst weeks
  console.log(chalk.white(`  Best Week:  Week ${report.bestWeek.week} (${(report.bestWeek.winRate * 100).toFixed(1)}%)`));
  console.log(chalk.white(`  Worst Week: Week ${report.worstWeek.week} (${(report.worstWeek.winRate * 100).toFixed(1)}%)`));
  console.log();

  // Final model weights
  console.log(chalk.bold.white('FINAL MODEL WEIGHTS (post-simulation)'));
  const weights = report.finalModelWeights;
  const wTable = new Table({
    head: ['Model', 'Weight'],
    style: { head: ['cyan'] },
  });
  wTable.push(
    ['Poisson', `${(weights.poisson * 100).toFixed(1)}%`],
    ['Elo', `${(weights.elo * 100).toFixed(1)}%`],
    ['Power Rating', `${(weights.powerRating * 100).toFixed(1)}%`],
    ['Implied Probability', `${(weights.impliedProbability * 100).toFixed(1)}%`],
  );
  console.log(wTable.toString());

  // Save to DB
  try {
    getDb().prepare(`
      INSERT INTO simulation_runs (run_at, season, weeks_simulated, overall_win_rate, parlay_hit_rate, report_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      new Date().toISOString(),
      report.season,
      report.weeksSimulated,
      report.overallWinRate,
      report.parlayHitRate,
      JSON.stringify(report)
    );
  } catch { /* ignore */ }
}
