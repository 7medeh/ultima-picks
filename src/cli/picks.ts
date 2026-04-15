import chalk from 'chalk';
import Table from 'cli-table3';
import readline from 'readline';
import { format } from 'date-fns';
import { ParlayCard, Belief } from '../data/types';
import { generateDailyParlay } from '../engine/parlayBuilder';
import { saveParlay, getParlayByDate } from '../db/queries';

function beliefColor(label: string): chalk.Chalk {
  switch (label) {
    case 'CONVICTION': return chalk.green;
    case 'LEAN': return chalk.yellow;
    case 'SPECULATIVE': return chalk.gray;
    default: return chalk.white;
  }
}

function cvsColor(score: number): chalk.Chalk {
  if (score >= 80) return chalk.magenta.bold;
  if (score >= 68) return chalk.green;
  if (score >= 60) return chalk.yellow;
  return chalk.gray;
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

async function askQuestion(query: string): Promise<string> {
  if (!process.stdin.isTTY) return 'y';
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function resolveTargetDate(flags: {
  date?: string;
  tomorrow?: boolean;
  next?: boolean;
}): string | undefined {
  if (flags.date) return flags.date;
  if (flags.tomorrow) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }
  // 'next' and today handled by generateDailyParlay itself
  return undefined;
}

export async function runPicks(flags: {
  date?: string;
  tomorrow?: boolean;
  next?: boolean;
}): Promise<void> {
  // ASCII header
  console.log(chalk.cyan.bold(`
 ███╗   ██╗██████╗  █████╗     ██████╗ ██╗ ██████╗██╗  ██╗███████╗
 ████╗  ██║██╔══██╗██╔══██╗    ██╔══██╗██║██╔════╝██║ ██╔╝██╔════╝
 ██╔██╗ ██║██████╔╝███████║    ██████╔╝██║██║     █████╔╝ ███████╗
 ██║╚██╗██║██╔══██╗██╔══██║    ██╔═══╝ ██║██║     ██╔═██╗ ╚════██║
 ██║ ╚████║██████╔╝██║  ██║    ██║     ██║╚██████╗██║  ██╗███████║
 ╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝    ╚═╝     ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝
                     E N G I N E
  `));

  const targetDate = resolveTargetDate(flags);

  // Check if parlay already exists
  const existingDate = targetDate ?? new Date().toISOString().split('T')[0];
  const existing = getParlayByDate(existingDate);
  if (existing) {
    const answer = await askQuestion(
      chalk.yellow(`A parlay for ${existingDate} already exists. Regenerate? (y/n): `)
    );
    if (answer !== 'y') {
      console.log(chalk.gray('Using existing parlay.'));
      printParlayCard(existing);
      return;
    }
  }

  console.log(chalk.cyan(`Fetching games for ${targetDate ?? 'today'}...`));

  let parlay: ParlayCard;
  try {
    parlay = await generateDailyParlay(targetDate, 'on-demand');
  } catch (err) {
    console.error(chalk.red(`Failed to generate parlay: ${String(err)}`));
    process.exit(1);
  }

  if (parlay.picks.length === 0) {
    console.log(chalk.red(`No picks met the confidence threshold for ${parlay.targetDate}.`));
    console.log(chalk.gray(`${parlay.gamesAvailable} games on slate, ${parlay.picksEligible} eligible picks.`));
    return;
  }

  if (parlay.picks.length < 4) {
    console.log(chalk.yellow(`⚠️  Only ${parlay.picks.length} picks met confidence threshold today. Parlay generated with ${parlay.picks.length} legs.`));
  }

  saveParlay(parlay);
  printParlayCard(parlay);

  console.log(chalk.gray("\nUse 'npm run report' to generate full HTML report"));
}

export function printParlayCard(parlay: ParlayCard): void {
  const dateLabel = (() => {
    try {
      return format(new Date(parlay.targetDate), 'EEEE, MMMM d');
    } catch {
      return parlay.targetDate;
    }
  })();

  console.log('\n');
  console.log(chalk.bold.white('═'.repeat(72)));
  console.log(
    chalk.bold.cyan(' DAILY PARLAY CARD') +
    chalk.white(` │ ${dateLabel}`) +
    chalk.gray(` │ ${parlay.gamesAvailable} games on slate`) +
    chalk.bold.yellow(` │ Combined: ${formatOdds(parlay.combinedOdds)}`)
  );
  console.log(chalk.bold.white('═'.repeat(72)));

  for (const pick of parlay.picks) {
    printPickRow(pick);
  }

  console.log(chalk.bold.white('─'.repeat(72)));
  console.log(
    chalk.white('  Expected Value: ') + chalk.yellow(`${(parlay.expectedValue * 100).toFixed(1)}%`) +
    chalk.white('  │  Recommended Units: ') + chalk.cyan(`${parlay.recommendedUnits.toFixed(1)}u`) +
    chalk.white('  │  Parlay Win Prob: ') + chalk.yellow(`${(parlay.picks.reduce((acc, p) => acc * Math.max(p.poissonWinProb, p.eloWinProb), 1) * 100).toFixed(1)}%`)
  );
  console.log(chalk.bold.white('═'.repeat(72)));
  console.log();
}

function printPickRow(pick: Belief): void {
  const colorFn = beliefColor(pick.beliefLabel);
  const cvsFn = cvsColor(pick.cvsScore);

  console.log(
    chalk.bold.white(`  ${pick.pickedTeamOrSide}`) +
    chalk.gray(` (${pick.pickType}${pick.pickType === 'total' ? '' : ''})`) +
    chalk.white('  ') +
    chalk.bold(formatOdds(pick.odds)) +
    chalk.gray('  CVS: ') + cvsFn(`${pick.cvsScore.toFixed(1)}`) +
    chalk.gray('  ') + colorFn(`[${pick.beliefLabel}]`) +
    chalk.gray(`  ${pick.recommendedUnits}u`)
  );
  console.log(chalk.gray(`    ${pick.game} · ${pick.gameDate}`));
  console.log(chalk.dim(`    ${pick.scoutingReport}`));
  console.log();
}
