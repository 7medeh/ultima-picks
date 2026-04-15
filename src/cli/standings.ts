import chalk from 'chalk';
import Table from 'cli-table3';
import { loadEloRatings } from '../models/elo';
import { getUpcomingPlayoffGames } from '../data/fetcher';

export async function runStandings(): Promise<void> {
  console.log(chalk.cyan.bold('\nPlayoff Bracket — Elo Ratings\n'));

  const eloRatings = loadEloRatings();

  // Fetch upcoming games to get current playoff teams
  let games = await getUpcomingPlayoffGames(14);

  const teamsInPlayoffs = new Set<string>();
  for (const g of games) {
    teamsInPlayoffs.add(g.homeTeam.name);
    teamsInPlayoffs.add(g.awayTeam.name);
  }

  if (teamsInPlayoffs.size === 0) {
    console.log(chalk.yellow('No upcoming playoff games found. Showing all known Elo ratings.'));
    const sorted = Object.entries(eloRatings).sort(([, a], [, b]) => b - a);
    const table = new Table({
      head: ['Rank', 'Team', 'Elo Rating', 'vs League Avg'],
      style: { head: ['cyan'] },
    });
    sorted.forEach(([team, elo], i) => {
      const diff = elo - 1500;
      const diffStr = diff >= 0 ? chalk.green(`+${diff.toFixed(0)}`) : chalk.red(`${diff.toFixed(0)}`);
      table.push([String(i + 1), team, elo.toFixed(0), diffStr]);
    });
    console.log(table.toString());
    return;
  }

  // Sort by Elo
  const playoffTeams = Array.from(teamsInPlayoffs)
    .map((name) => ({ name, elo: eloRatings[name] ?? 1500 }))
    .sort((a, b) => b.elo - a.elo);

  const table = new Table({
    head: ['Rank', 'Team', 'Elo Rating', 'vs League Avg', 'Implied Win%'],
    style: { head: ['cyan'] },
  });

  for (let i = 0; i < playoffTeams.length; i++) {
    const { name, elo } = playoffTeams[i];
    const diff = elo - 1500;
    const diffStr = diff >= 0 ? chalk.green(`+${diff.toFixed(0)}`) : chalk.red(`${diff.toFixed(0)}`);
    const winPct = (1 / (1 + Math.pow(10, (1500 - elo) / 400)) * 100).toFixed(1) + '%';
    table.push([String(i + 1), name, elo.toFixed(0), diffStr, winPct]);
  }

  console.log(table.toString());
  console.log(chalk.gray(`\nBase Elo: 1500 | Home court boost: +100 Elo | K-factor: 20`));
}
