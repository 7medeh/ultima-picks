import dotenv from 'dotenv';
dotenv.config();

import { program } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { runMigrations } from '../db/migrations';
import { ensureCalibrationExists } from '../engine/recalibrator';

// Startup checks
function runStartupChecks(): void {
  // API key warnings (not hard failures)
  if (!process.env.BALLDONTLIE_API_KEY) {
    console.warn(chalk.yellow('⚠️  BALLDONTLIE_API_KEY not set in .env — API calls will fail'));
  }
  if (!process.env.ODDS_API_KEY) {
    console.warn(chalk.yellow('⚠️  ODDS_API_KEY not set in .env — odds will use fallback values'));
  }

  // Ensure directories
  const dirs = ['./data', './data/cache', './output'];
  for (const dir of dirs) {
    const resolved = path.resolve(dir);
    if (!fs.existsSync(resolved)) fs.mkdirSync(resolved, { recursive: true });
  }

  // DB migrations
  try {
    runMigrations();
  } catch (err) {
    console.error(chalk.red(`DB initialization failed: ${String(err)}`));
    process.exit(1);
  }

  // Calibration file
  ensureCalibrationExists();
}

async function main(): Promise<void> {
  runStartupChecks();

  program
    .name('nba-picks-engine')
    .description('Self-learning NBA Playoff Picks Engine')
    .version('1.0.0');

  // picks
  program
    .command('picks')
    .description('Generate a daily parlay')
    .option('--date <date>', 'Target a specific date (YYYY-MM-DD)')
    .option('--tomorrow', 'Target tomorrow\'s games')
    .option('--next', 'Find and target the next available game day')
    .action(async (opts: { date?: string; tomorrow?: boolean; next?: boolean }) => {
      const { runPicks } = await import('./picks');
      await runPicks(opts);
    });

  // analyze
  program
    .command('analyze')
    .description('Deep matchup analysis')
    .requiredOption('--team1 <team1>', 'First team name')
    .requiredOption('--team2 <team2>', 'Second team name')
    .action(async (opts: { team1: string; team2: string }) => {
      const { runAnalyze } = await import('./analyze');
      await runAnalyze(opts.team1, opts.team2);
    });

  // standings
  program
    .command('standings')
    .description('Show playoff bracket with Elo ratings')
    .action(async () => {
      const { runStandings } = await import('./standings');
      await runStandings();
    });

  // track
  program
    .command('track')
    .description('Historical pick accuracy and P&L tracker')
    .option('--last <n>', 'Show last N parlay results', parseInt)
    .action((opts: { last?: number }) => {
      const { runTrack } = require('./track');
      runTrack(opts.last);
    });

  // sync-results
  program
    .command('sync-results')
    .description('Fetch outcomes for all pending picks')
    .action(async () => {
      const { syncResults } = await import('./syncResults');
      const { resolved } = await syncResults();
      if (resolved >= 5) {
        console.log(chalk.cyan('\nAuto-triggering recalibration (5+ picks resolved)...'));
        const { runRecalibration } = await import('../engine/recalibrator');
        await runRecalibration();
      } else if (resolved > 0) {
        console.log(chalk.gray("Run 'npm run recalibrate' to update model weights"));
      }
    });

  // recalibrate
  program
    .command('recalibrate')
    .description('Trigger full model recalibration')
    .action(async () => {
      const { runRecalibrateCommand } = await import('./recalibrate');
      await runRecalibrateCommand();
    });

  // simulate
  program
    .command('simulate')
    .description('Run historical backtest')
    .option('--season <year>', 'Season year', parseInt)
    .option('--weeks <n>', 'Number of weeks to simulate', parseInt)
    .action(async (opts: { season?: number; weeks?: number }) => {
      const { runSimulateCommand } = await import('./simulate');
      const season = opts.season ?? new Date().getFullYear() - 1;
      const weeks = opts.weeks ?? 8;
      await runSimulateCommand(season, weeks);
    });

  // props
  program
    .command('props')
    .description('Generate player prop picks for today\'s games')
    .option('--date <date>', 'Target a specific date (YYYY-MM-DD)')
    .option('--tomorrow', 'Target tomorrow\'s games')
    .option('--player <name>', 'Focus on a specific player')
    .option('--stat <stat>', 'Focus on a specific stat (points, rebounds, assists, threes)')
    .option('--history', 'Show historical prop performance')
    .option('--parlay', 'Force show a props parlay even with fewer picks')
    .action(async (opts: { date?: string; tomorrow?: boolean; player?: string; stat?: string; history?: boolean; parlay?: boolean }) => {
      const { runProps } = await import('./props');
      await runProps(opts);
    });

  // report
  program
    .command('report')
    .description('Export full HTML report')
    .option('--date <date>', 'Target a specific date (YYYY-MM-DD)')
    .action(async (opts: { date?: string }) => {
      const { generateReport } = await import('../report/generator');
      const date = opts.date ?? new Date().toISOString().split('T')[0];
      await generateReport(date);
    });

  // schedule
  program
    .command('schedule')
    .description('Start the auto-scheduler')
    .action(() => {
      const { startScheduler } = require('../engine/parlayBuilder');
      startScheduler();
    });

  await program.parseAsync(process.argv);
}

main().catch((err) => {
  console.error(chalk.red(`Fatal error: ${String(err)}`));
  process.exit(1);
});
