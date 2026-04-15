import chalk from 'chalk';
import Table from 'cli-table3';
import { format } from 'date-fns';
import { PropBelief, PropStat } from '../data/types';
import { getGamesForDate } from '../data/fetcher';
import { generatePropsForGame } from '../engine/propsBelief';
import { savePropBelief, getPropLifetimeStats, getPropWinRateByStat, getRecentProps } from '../db/queries';
import { combineParlayOdds } from '../models/kelly';

const PROP_CVS_THRESHOLD = 60; // Lower than game picks — prop markets are softer

function beliefColor(label: string): chalk.Chalk {
  switch (label) {
    case 'CONVICTION': return chalk.green;
    case 'LEAN': return chalk.yellow;
    case 'SPECULATIVE': return chalk.gray;
    default: return chalk.white;
  }
}

function formatOdds(o: number): string {
  return o > 0 ? `+${o}` : String(o);
}

function statLabel(stat: PropStat): string {
  return stat.replace(/_/g, '+').replace(/\b\w/g, (c) => c.toUpperCase());
}

function edgeBar(edge: number): string {
  const pct = Math.round(edge * 100);
  const filled = Math.min(20, Math.max(0, Math.round(Math.abs(pct) / 2)));
  const color = edge >= 0.08 ? chalk.green : edge >= 0.04 ? chalk.yellow : chalk.gray;
  return color('█'.repeat(filled)) + chalk.gray('░'.repeat(20 - filled)) + ` ${pct > 0 ? '+' : ''}${pct}%`;
}

export async function runProps(flags: {
  date?: string;
  tomorrow?: boolean;
  player?: string;
  stat?: string;
  history?: boolean;
  parlay?: boolean;
}): Promise<void> {
  // History mode
  if (flags.history) {
    showPropsHistory();
    return;
  }

  let date = flags.date ?? new Date().toISOString().split('T')[0];
  if (flags.tomorrow) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    date = d.toISOString().split('T')[0];
  }

  const dateLabel = (() => {
    try { return format(new Date(date), 'EEEE, MMMM d'); } catch { return date; }
  })();

  console.log(chalk.cyan.bold(`\nNBA Props Engine — ${dateLabel}\n`));

  const games = await getGamesForDate(date);
  if (games.length === 0) {
    console.log(chalk.yellow(`No games found for ${date}.`));
    return;
  }

  console.log(chalk.gray(`Fetching prop odds for ${games.length} game${games.length !== 1 ? 's' : ''}...\n`));

  const allProps: PropBelief[] = [];

  for (const game of games) {
    console.log(chalk.gray(`  ${game.awayTeam.name} @ ${game.homeTeam.name}`));
    try {
      const props = await generatePropsForGame(
        game.id,
        { id: game.homeTeam.id, name: game.homeTeam.name },
        { id: game.awayTeam.id, name: game.awayTeam.name },
        game.gameDate,
        { home: game.homeTeamStats.daysOfRest, away: game.awayTeamStats.daysOfRest },
        game.homeTeamStats.pace,
        game.awayTeamStats.pace
      );

      // Filter to top-direction pick per player per stat (no opposite pairs)
      const seen = new Set<string>();
      for (const prop of props.sort((a, b) => b.cvsScore - a.cvsScore)) {
        const key = `${prop.playerName}_${prop.stat}`;
        if (!seen.has(key) && prop.cvsScore >= PROP_CVS_THRESHOLD) {
          seen.add(key);
          allProps.push(prop);
          savePropBelief(prop);
        }
      }
    } catch (err) {
      console.error(chalk.red(`  Failed to generate props for ${game.awayTeam.name} @ ${game.homeTeam.name}: ${String(err)}`));
    }
  }

  if (allProps.length === 0) {
    console.log(chalk.yellow('\nNo prop picks met the confidence threshold for this slate.'));
    console.log(chalk.gray('This usually means prop odds are unavailable on the free Odds API tier.'));
    console.log(chalk.gray('Player props require the Odds API "additional markets" add-on.'));
    return;
  }

  // Sort by CVS descending
  const sorted = allProps.sort((a, b) => b.cvsScore - a.cvsScore);

  // Header
  console.log('\n');
  console.log(chalk.bold.white('═'.repeat(72)));
  console.log(
    chalk.bold.cyan(' PLAYER PROPS CARD') +
    chalk.white(` │ ${dateLabel}`) +
    chalk.gray(` │ ${allProps.length} props above threshold`)
  );
  console.log(chalk.bold.white('═'.repeat(72)));

  for (const prop of sorted) {
    printPropRow(prop);
  }

  console.log(chalk.bold.white('─'.repeat(72)));

  // Optional props parlay (top 3-4 CONVICTION/LEAN picks)
  if (flags.parlay || sorted.filter((p) => p.beliefLabel !== 'SPECULATIVE').length >= 3) {
    const parlayPicks = sorted
      .filter((p) => p.beliefLabel !== 'SPECULATIVE' && p.cvsScore >= 65)
      .slice(0, 4);

    if (parlayPicks.length >= 2) {
      const combinedOdds = combineParlayOdds(parlayPicks.map((p) => p.odds));
      console.log(chalk.bold.cyan('\n  TOP PROPS PARLAY'));
      console.log(chalk.white(`  ${parlayPicks.length} legs │ Combined: ${chalk.bold.yellow(formatOdds(combinedOdds))}`));
      for (const p of parlayPicks) {
        console.log(chalk.gray(`    • ${p.playerName} ${statLabel(p.stat)} ${p.direction.toUpperCase()} ${p.line} (${formatOdds(p.odds)})`));
      }
      console.log();
    }
  }

  console.log(chalk.gray("Run 'npm run props -- --history' to see past prop performance"));
}

function printPropRow(prop: PropBelief): void {
  const colorFn = beliefColor(prop.beliefLabel);
  const statStr = statLabel(prop.stat);

  console.log(
    chalk.bold.white(`  ${prop.playerName}`) +
    chalk.gray(` — ${prop.teamName} vs ${prop.opponentName}`)
  );
  console.log(
    chalk.white(`  ${statStr} ${prop.direction.toUpperCase()} ${prop.line}`) +
    chalk.gray('  ') + chalk.bold(formatOdds(prop.odds)) +
    chalk.gray('  CVS: ') + (prop.cvsScore >= 68 ? chalk.green : chalk.yellow)(`${prop.cvsScore.toFixed(1)}`) +
    chalk.gray('  ') + colorFn(`[${prop.beliefLabel}]`) +
    chalk.gray(`  ${prop.recommendedUnits}u`)
  );

  // Projection line
  console.log(
    chalk.gray(`  Proj: ${prop.projectedValue.toFixed(1)} ± ${prop.projectedStdDev.toFixed(1)}`) +
    chalk.gray(`  │  Season avg: ${prop.seasonAvg.toFixed(1)}`) +
    chalk.gray(`  │  Last 5 avg: ${prop.last5Avg.toFixed(1)}`) +
    chalk.gray(`  │  L5 hit rate: ${prop.hitsOverLineInLast5}/5`)
  );

  // Edge bar
  console.log(chalk.gray('  Edge: ') + edgeBar(prop.modelEdge));

  // Scouting report
  console.log(chalk.dim(`  ${prop.scoutingReport}`));
  console.log();
}

function showPropsHistory(): void {
  console.log(chalk.cyan.bold('\nPlayer Props — Historical Performance\n'));

  const stats = getPropLifetimeStats();
  console.log(chalk.bold.white('LIFETIME PROPS STATS'));
  console.log(chalk.white(`  Total Props: ${chalk.cyan(String(stats.totalProps))}`));
  console.log(chalk.white(`  Win Rate:    ${chalk.yellow((stats.winRate * 100).toFixed(1) + '%')}  (${stats.wins}W / ${stats.losses}L)`));
  console.log();

  // Win rate by stat type
  const statTypes: PropStat[] = ['points', 'rebounds', 'assists', 'threes'];
  console.log(chalk.bold.white('WIN RATE BY STAT'));
  const statTable = new Table({
    head: ['Stat', 'Win Rate'],
    style: { head: ['cyan'] },
  });
  for (const stat of statTypes) {
    const rate = getPropWinRateByStat(stat);
    statTable.push([statLabel(stat), `${(rate * 100).toFixed(1)}%`]);
  }
  console.log(statTable.toString());

  // Recent props
  const recent = getRecentProps(20);
  if (recent.length === 0) {
    console.log(chalk.gray('\nNo prop history yet.'));
    return;
  }

  console.log(chalk.bold.white('\nRECENT PROPS'));
  const recentTable = new Table({
    head: ['Date', 'Player', 'Stat', 'Dir', 'Line', 'Proj', 'Result'],
    style: { head: ['cyan'] },
  });
  for (const p of recent.slice(0, 15)) {
    const resultStr =
      p.result === 'WIN' ? chalk.green('WIN') :
      p.result === 'LOSS' ? chalk.red('LOSS') :
      chalk.yellow('PENDING');
    recentTable.push([
      p.gameDate,
      p.playerName.split(' ').pop() ?? p.playerName,
      statLabel(p.stat),
      p.direction.toUpperCase(),
      String(p.line),
      p.projectedValue.toFixed(1),
      resultStr,
    ]);
  }
  console.log(recentTable.toString());
}
