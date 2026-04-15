import chalk from 'chalk';
import Table from 'cli-table3';
import { getGamesForDate } from '../data/fetcher';
import { runPoissonModel } from '../models/poisson';
import { runEloModel } from '../models/elo';
import { runPowerRatingModel } from '../models/powerRating';
import { runImpliedProbabilityModel, americanToImplied, removeVig } from '../models/impliedProbability';
import { calculateCVS, loadCVSWeights, DEFAULT_CVS_WEIGHTS } from '../engine/cvs';
import { buildBelief, calculateModelConsensus } from '../engine/belief';
import { ModelOutput, PickSide, PickType } from '../data/types';

function formatOdds(o: number): string {
  return o > 0 ? `+${o}` : String(o);
}
function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export async function runAnalyze(team1: string, team2: string): Promise<void> {
  console.log(chalk.cyan.bold(`\nDeep Matchup Analysis: ${team1} vs ${team2}\n`));

  const today = new Date().toISOString().split('T')[0];
  let games = await getGamesForDate(today);

  // Also look ahead 3 days
  if (games.length === 0) {
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setDate(d.getDate() + i);
      games = await getGamesForDate(d.toISOString().split('T')[0]);
      if (games.length > 0) break;
    }
  }

  const game = games.find(
    (g) =>
      g.homeTeam.name.toLowerCase().includes(team1.toLowerCase()) ||
      g.awayTeam.name.toLowerCase().includes(team1.toLowerCase()) ||
      g.homeTeam.name.toLowerCase().includes(team2.toLowerCase()) ||
      g.awayTeam.name.toLowerCase().includes(team2.toLowerCase())
  );

  if (!game) {
    console.log(chalk.red(`No upcoming game found between ${team1} and ${team2}.`));
    return;
  }

  const models: ModelOutput[] = [
    runPoissonModel(game.homeTeamStats, game.awayTeamStats),
    runEloModel(game.homeTeam, game.awayTeam),
    runPowerRatingModel(game.homeTeamStats, game.awayTeamStats),
    runImpliedProbabilityModel(game.odds),
  ];

  const homeImplied = americanToImplied(game.odds.homeMoneyline);
  const awayImplied = americanToImplied(game.odds.awayMoneyline);
  const { homeTrue, awayTrue } = removeVig(homeImplied, awayImplied);

  // Model breakdown table
  console.log(chalk.bold.white('━'.repeat(60)));
  console.log(chalk.bold.cyan(' MODEL BREAKDOWN'));
  console.log(chalk.bold.white('━'.repeat(60)));
  const modelTable = new Table({
    head: ['Model', `${game.homeTeam.name}`, `${game.awayTeam.name}`, 'Spread'],
    style: { head: ['cyan'] },
  });
  for (const m of models) {
    modelTable.push([
      m.modelName,
      pct(m.homeWinProbability),
      pct(m.awayWinProbability),
      m.predictedSpread.toFixed(1),
    ]);
  }
  modelTable.push([
    chalk.bold('Market'),
    pct(homeTrue),
    pct(awayTrue),
    String(game.odds.spread),
  ]);
  console.log(modelTable.toString());

  const { consensusScore, stdDeviation } = calculateModelConsensus(models);
  console.log(chalk.gray(`  Model Consensus: ${consensusScore.toFixed(1)} | Std Dev: ${stdDeviation.toFixed(3)}`));

  // Team stats comparison
  console.log(chalk.bold.white('\n━'.repeat(60)));
  console.log(chalk.bold.cyan(' TEAM STATS COMPARISON'));
  console.log(chalk.bold.white('━'.repeat(60)));
  const statsTable = new Table({
    head: ['Stat', game.homeTeam.name, game.awayTeam.name],
    style: { head: ['cyan'] },
  });
  const h = game.homeTeamStats;
  const a = game.awayTeamStats;
  statsTable.push(
    ['Off Rating', h.offensiveRating.toFixed(1), a.offensiveRating.toFixed(1)],
    ['Def Rating', h.defensiveRating.toFixed(1), a.defensiveRating.toFixed(1)],
    ['Net Rating', h.netRating.toFixed(1), a.netRating.toFixed(1)],
    ['Pace', h.pace.toFixed(1), a.pace.toFixed(1)],
    ['Last 10', `${h.last10Record.wins}-${h.last10Record.losses}`, `${a.last10Record.wins}-${a.last10Record.losses}`],
    ['Days Rest', String(h.daysOfRest), String(a.daysOfRest)],
    ['Injuries', String(h.injuryReport.filter((p) => p.status === 'out').length) + ' out', String(a.injuryReport.filter((p) => p.status === 'out').length) + ' out'],
  );
  console.log(statsTable.toString());

  // CVS breakdown for both sides
  console.log(chalk.bold.white('\n━'.repeat(60)));
  console.log(chalk.bold.cyan(' CVS BREAKDOWN'));
  console.log(chalk.bold.white('━'.repeat(60)));
  const h2hRecord = { team1Wins: 0, team2Wins: 0 };
  const sides: PickSide[] = ['home', 'away'];
  for (const side of sides) {
    const cvs = calculateCVS(game, side, models, h2hRecord);
    const teamName = side === 'home' ? game.homeTeam.name : game.awayTeam.name;
    const color = cvs >= 68 ? chalk.green : cvs >= 60 ? chalk.yellow : chalk.gray;
    console.log(color(`  ${teamName} (${side}) — CVS: ${cvs.toFixed(1)}`));
  }
  const overCvs = calculateCVS(game, 'over', models, h2hRecord);
  const underCvs = calculateCVS(game, 'under', models, h2hRecord);
  console.log(chalk.gray(`  Over ${game.odds.totalLine} — CVS: ${overCvs.toFixed(1)}`));
  console.log(chalk.gray(`  Under ${game.odds.totalLine} — CVS: ${underCvs.toFixed(1)}`));

  // All pick candidates
  console.log(chalk.bold.white('\n━'.repeat(60)));
  console.log(chalk.bold.cyan(' PICK CANDIDATES'));
  console.log(chalk.bold.white('━'.repeat(60)));
  const pickOptions: Array<{ type: PickType; side: PickSide }> = [
    { type: 'moneyline', side: 'home' },
    { type: 'moneyline', side: 'away' },
    { type: 'spread', side: 'home' },
    { type: 'spread', side: 'away' },
    { type: 'total', side: 'over' },
    { type: 'total', side: 'under' },
  ];
  for (const { type, side } of pickOptions) {
    try {
      const belief = await buildBelief(game, type, side);
      const labelColor =
        belief.beliefLabel === 'CONVICTION' ? chalk.green :
        belief.beliefLabel === 'LEAN' ? chalk.yellow : chalk.gray;
      console.log(
        `  ${chalk.bold(belief.pickedTeamOrSide)} ${belief.pickType} ${formatOdds(belief.odds)}` +
        chalk.gray(` CVS: ${belief.cvsScore.toFixed(1)}`) +
        chalk.gray(` Belief: ${belief.beliefScore.toFixed(1)}`) +
        ` ${labelColor(`[${belief.beliefLabel}]`)}`
      );
      for (const r of belief.beliefRationale) {
        console.log(chalk.dim(`    ${r}`));
      }
      console.log();
    } catch { /* skip */ }
  }
}
