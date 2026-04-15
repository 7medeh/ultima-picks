import chalk from 'chalk';
import Table from 'cli-table3';
import {
  getLifetimeStats,
  getRecentParlays,
  getWinRateByPickType,
  getWinRateByBeliefLabel,
  getRolling5Parlays,
} from '../db/queries';

const SPARKLINE_BLOCKS = ['▂', '▃', '▄', '▅', '▆', '▇', '█'];

function toSparkline(values: number[]): string {
  if (values.length === 0) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v) => {
      const idx = Math.floor(((v - min) / range) * (SPARKLINE_BLOCKS.length - 1));
      const block = SPARKLINE_BLOCKS[idx] ?? '▂';
      return v >= 0.55 ? chalk.green(block) : v >= 0.45 ? chalk.yellow(block) : chalk.red(block);
    })
    .join('');
}

function formatOdds(o: number): string {
  return o > 0 ? `+${o}` : String(o);
}

export function runTrack(last?: number): void {
  console.log(chalk.cyan.bold('\nNBA Picks Engine — Performance Tracker\n'));

  // Lifetime stats
  const stats = getLifetimeStats();
  console.log(chalk.bold.white('LIFETIME STATS'));
  console.log(chalk.white(`  Total Picks: ${chalk.cyan(String(stats.totalPicks))}`));
  console.log(chalk.white(`  Win Rate:    ${chalk.yellow((stats.winRate * 100).toFixed(1) + '%')}  (${stats.wins}W / ${stats.losses}L)`));
  console.log(chalk.white(`  ROI:         ${stats.roi >= 0 ? chalk.green : chalk.red}(stats.roi >= 0 ? '+' : '')(${(stats.roi * 100).toFixed(1)}%`));
  console.log(chalk.white(`  Parlay Rate: ${chalk.yellow((stats.parlayHitRate * 100).toFixed(1) + '%')}`));
  console.log();

  // Win rate by pick type
  console.log(chalk.bold.white('WIN RATE BY PICK TYPE'));
  const moneylineRate = getWinRateByPickType('moneyline', 100);
  const spreadRate = getWinRateByPickType('spread', 100);
  const totalRate = getWinRateByPickType('total', 100);
  const pickTypeTable = new Table({
    head: ['Type', 'Win Rate', 'Bar'],
    style: { head: ['cyan'] },
  });
  const bar = (rate: number): string => {
    const filled = Math.round(rate * 20);
    const color = rate >= 0.55 ? chalk.green : rate >= 0.45 ? chalk.yellow : chalk.red;
    return color('█'.repeat(filled)) + chalk.gray('░'.repeat(20 - filled));
  };
  pickTypeTable.push(
    ['Moneyline', `${(moneylineRate * 100).toFixed(1)}%`, bar(moneylineRate)],
    ['Spread', `${(spreadRate * 100).toFixed(1)}%`, bar(spreadRate)],
    ['Total', `${(totalRate * 100).toFixed(1)}%`, bar(totalRate)],
  );
  console.log(pickTypeTable.toString());

  // Win rate by belief label
  console.log(chalk.bold.white('WIN RATE BY BELIEF LABEL'));
  const convictionRate = getWinRateByBeliefLabel('CONVICTION');
  const leanRate = getWinRateByBeliefLabel('LEAN');
  const specRate = getWinRateByBeliefLabel('SPECULATIVE');
  const labelTable = new Table({
    head: ['Label', 'Win Rate'],
    style: { head: ['cyan'] },
  });
  labelTable.push(
    [chalk.green('CONVICTION'), `${(convictionRate * 100).toFixed(1)}%`],
    [chalk.yellow('LEAN'), `${(leanRate * 100).toFixed(1)}%`],
    [chalk.gray('SPECULATIVE'), `${(specRate * 100).toFixed(1)}%`],
  );
  console.log(labelTable.toString());

  // Rolling 5 parlays
  const rolling5 = getRolling5Parlays();
  console.log(chalk.bold.white('ROLLING 5-PARLAY TRACKER (3/5 target)'));
  if (rolling5.length === 0) {
    console.log(chalk.gray('  No parlay history yet.\n'));
  } else {
    const streak = rolling5
      .map((p) => {
        if (p.result === 'WIN') return chalk.green.bold('W');
        if (p.result === 'LOSS') return chalk.red.bold('L');
        return chalk.yellow.bold('?');
      })
      .join(' ');
    const hits = rolling5.filter((p) => p.result === 'WIN').length;
    const target = hits >= 3 ? chalk.green(`${hits}/5 ✓`) : chalk.red(`${hits}/5`);
    console.log(`  ${streak}  ${target}\n`);
  }

  // Recent parlays
  const limit = last ?? 10;
  const recentParlays = getRecentParlays(limit);
  console.log(chalk.bold.white(`LAST ${limit} PARLAYS`));
  if (recentParlays.length === 0) {
    console.log(chalk.gray('  No parlay history yet.\n'));
    return;
  }

  const parlayTable = new Table({
    head: ['Date', 'Legs', 'Odds', 'Result', 'Mode'],
    style: { head: ['cyan'] },
  });

  for (const p of recentParlays) {
    const resultStr =
      p.result === 'WIN'
        ? chalk.green('WIN')
        : p.result === 'LOSS'
        ? chalk.red('LOSS')
        : chalk.yellow('PENDING');
    parlayTable.push([
      p.targetDate,
      String(p.picks.length),
      formatOdds(p.combinedOdds),
      resultStr,
      p.mode,
    ]);
  }
  console.log(parlayTable.toString());

  // Win rate sparkline
  const dailyRates = recentParlays.map((p) =>
    p.result === 'WIN' ? 1 : p.result === 'LOSS' ? 0 : 0.5
  );
  if (dailyRates.length >= 3) {
    console.log(chalk.bold.white('\nRESULT TREND'));
    console.log('  ' + toSparkline(dailyRates));
    console.log();
  }
}
