import axios, { AxiosInstance } from 'axios';
import * as cache from './cache';
import {
  Team,
  GameStats,
  GameOdds,
  UpcomingGame,
  InjuredPlayer,
  PlayerStat,
} from './types';
import chalk from 'chalk';

const BALLDONTLIE_BASE = 'https://api.balldontlie.io/v1';
const ODDS_BASE = 'https://api.the-odds-api.com/v4';
const REQUEST_TIMEOUT = 10_000;

function makeClient(baseURL: string, apiKey: string): AxiosInstance {
  return axios.create({
    baseURL,
    timeout: REQUEST_TIMEOUT,
    headers: { Authorization: apiKey },
  });
}

async function withRetry<T>(fn: () => Promise<T>, cacheKey: string): Promise<T> {
  const cached = cache.get<T>(cacheKey);
  if (cached !== null) return cached;

  try {
    const result = await fn();
    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    // Retry once
    try {
      const result = await fn();
      cache.set(cacheKey, result);
      return result;
    } catch (retryErr) {
      chalk.red(`[fetcher] Request failed after retry: ${String(retryErr)}`);
      throw retryErr;
    }
  }
}

function oddsClient(): AxiosInstance {
  return makeClient(ODDS_BASE, '');
}

function bdlClient(): AxiosInstance {
  const key = process.env.BALLDONTLIE_API_KEY ?? '';
  return makeClient(BALLDONTLIE_BASE, key);
}

// ---------------------------------------------------------------------------
// Team helpers
// ---------------------------------------------------------------------------

function mapTeam(raw: Record<string, unknown>): Team {
  return {
    id: raw.id as number,
    name: raw.full_name as string,
    abbreviation: raw.abbreviation as string,
    conference: (raw.conference as string) ?? '',
    division: (raw.division as string) ?? '',
  };
}

// ---------------------------------------------------------------------------
// Game Stats
// ---------------------------------------------------------------------------

export async function getTeamStats(teamId: number): Promise<GameStats> {
  const cacheKey = `team_stats_${teamId}`;
  return withRetry(async () => {
    const client = bdlClient();

    // Season averages
    const seasonRes = await client.get('/season_averages', {
      params: { team_ids: [teamId], season: new Date().getFullYear() - (new Date().getMonth() < 9 ? 1 : 0) },
    });
    const avg = (seasonRes.data?.data?.[0] as Record<string, unknown>) ?? {};

    // Recent games for last-10 and days of rest
    const gamesRes = await client.get('/games', {
      params: {
        team_ids: [teamId],
        per_page: 15,
        'seasons[]': [new Date().getFullYear() - (new Date().getMonth() < 9 ? 1 : 0)],
        postseason: true,
      },
    });
    const recentGames: Record<string, unknown>[] = (gamesRes.data?.data as Record<string, unknown>[]) ?? [];

    let wins = 0;
    let losses = 0;
    let pointDiffs: number[] = [];
    let homeWins = 0;
    let homeLosses = 0;
    let awayWins = 0;
    let awayLosses = 0;
    let lastGameDate: Date | null = null;

    for (const g of recentGames.slice(0, 10)) {
      const homeId = (g.home_team as Record<string, unknown>)?.id;
      const homeScore = g.home_team_score as number;
      const visitorScore = g.visitor_team_score as number;
      const isHome = homeId === teamId;
      const teamScore = isHome ? homeScore : visitorScore;
      const oppScore = isHome ? visitorScore : homeScore;
      const diff = teamScore - oppScore;
      const won = diff > 0;
      pointDiffs.push(diff);
      if (won) {
        wins++;
        if (isHome) homeWins++; else awayWins++;
      } else {
        losses++;
        if (isHome) homeLosses++; else awayLosses++;
      }
    }

    if (recentGames.length > 0) {
      lastGameDate = new Date(recentGames[0].date as string);
    }
    const daysOfRest = lastGameDate
      ? Math.floor((Date.now() - lastGameDate.getTime()) / 86_400_000)
      : 2;

    const avgPointDiff = pointDiffs.length
      ? pointDiffs.reduce((a, b) => a + b, 0) / pointDiffs.length
      : 0;

    const injuryReport: InjuredPlayer[] = [];
    const topPlayers: PlayerStat[] = [];

    return {
      teamId,
      teamName: '',
      offensiveRating: (avg.pts as number) ?? 110,
      defensiveRating: 110 - ((avg.pts as number) ?? 0) * 0.3,
      netRating: ((avg.pts as number) ?? 0) * 0.3,
      pace: 98,
      last10Record: { wins, losses },
      last10PointDiff: avgPointDiff,
      homeRecord: { wins: homeWins, losses: homeLosses },
      awayRecord: { wins: awayWins, losses: awayLosses },
      daysOfRest,
      strengthOfSchedule: 1500,
      turnoversPerGame: (avg.turnover as number) ?? 14,
      reboundDifferential: (avg.reb as number) ?? 0,
      threePointRateAllowed: 0.35,
      injuryReport,
      topPlayers,
    };
  }, cacheKey);
}

// ---------------------------------------------------------------------------
// Odds
// ---------------------------------------------------------------------------

export async function getOdds(homeTeam: string, awayTeam: string): Promise<GameOdds | null> {
  const cacheKey = `odds_${homeTeam}_${awayTeam}`.replace(/\s+/g, '_');
  try {
    return await withRetry(async () => {
      const apiKey = process.env.ODDS_API_KEY ?? '';
      const res = await axios.get(`${ODDS_BASE}/sports/basketball_nba/odds`, {
        timeout: REQUEST_TIMEOUT,
        params: {
          apiKey,
          regions: 'us',
          markets: 'h2h,spreads,totals',
          oddsFormat: 'american',
        },
      });

      const games: Record<string, unknown>[] = res.data as Record<string, unknown>[];
      const match = games.find((g) => {
        const home = (g.home_team as string).toLowerCase();
        const away = (g.away_team as string).toLowerCase();
        return (
          home.includes(homeTeam.toLowerCase().split(' ').pop() ?? '') ||
          away.includes(awayTeam.toLowerCase().split(' ').pop() ?? '')
        );
      });

      if (!match) return null;

      const bookmakers: Record<string, unknown>[] = (match.bookmakers as Record<string, unknown>[]) ?? [];
      const book = bookmakers[0];
      if (!book) return null;

      const markets: Record<string, unknown>[] = (book.markets as Record<string, unknown>[]) ?? [];
      const h2h = markets.find((m) => m.key === 'h2h');
      const spreads = markets.find((m) => m.key === 'spreads');
      const totals = markets.find((m) => m.key === 'totals');

      const h2hOutcomes: Record<string, unknown>[] = (h2h?.outcomes as Record<string, unknown>[]) ?? [];
      const spreadOutcomes: Record<string, unknown>[] = (spreads?.outcomes as Record<string, unknown>[]) ?? [];
      const totalOutcomes: Record<string, unknown>[] = (totals?.outcomes as Record<string, unknown>[]) ?? [];

      const homeH2H = h2hOutcomes.find((o) => (o.name as string).toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop() ?? ''));
      const awayH2H = h2hOutcomes.find((o) => (o.name as string).toLowerCase().includes(awayTeam.toLowerCase().split(' ').pop() ?? ''));
      const homeSpread = spreadOutcomes.find((o) => (o.name as string).toLowerCase().includes(homeTeam.toLowerCase().split(' ').pop() ?? ''));
      const awaySpread = spreadOutcomes.find((o) => (o.name as string).toLowerCase().includes(awayTeam.toLowerCase().split(' ').pop() ?? ''));
      const over = totalOutcomes.find((o) => o.name === 'Over');
      const under = totalOutcomes.find((o) => o.name === 'Under');

      return {
        homeMoneyline: (homeH2H?.price as number) ?? -110,
        awayMoneyline: (awayH2H?.price as number) ?? -110,
        spread: (homeSpread?.point as number) ?? -2.5,
        homeSpreadOdds: (homeSpread?.price as number) ?? -110,
        awaySpreadOdds: (awaySpread?.price as number) ?? -110,
        totalLine: (over?.point as number) ?? 218.5,
        overOdds: (over?.price as number) ?? -110,
        underOdds: (under?.price as number) ?? -110,
        bookmaker: book.title as string,
        lastUpdated: new Date().toISOString(),
      };
    }, cacheKey);
  } catch {
    // Return placeholder odds if API fails
    return {
      homeMoneyline: -150,
      awayMoneyline: 130,
      spread: -3.5,
      homeSpreadOdds: -110,
      awaySpreadOdds: -110,
      totalLine: 218.5,
      overOdds: -110,
      underOdds: -110,
      bookmaker: 'fallback',
      lastUpdated: new Date().toISOString(),
    };
  }
}

// ---------------------------------------------------------------------------
// Upcoming Games
// ---------------------------------------------------------------------------

export async function getUpcomingPlayoffGames(daysAhead: number): Promise<UpcomingGame[]> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const cacheKey = `upcoming_games_${dates[0]}_${daysAhead}`;
  return withRetry(async () => {
    const client = bdlClient();
    const res = await client.get('/games', {
      params: {
        per_page: 100,
        'dates[]': dates,
      },
    });

    const rawGames: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
    const games: UpcomingGame[] = [];

    for (const g of rawGames) {
      const homeTeamRaw = g.home_team as Record<string, unknown>;
      const awayTeamRaw = g.visitor_team as Record<string, unknown>;
      const homeTeam = mapTeam(homeTeamRaw);
      const awayTeam = mapTeam(awayTeamRaw);

      let homeStats: GameStats;
      let awayStats: GameStats;
      try {
        homeStats = await getTeamStats(homeTeam.id);
        homeStats.teamName = homeTeam.name;
      } catch {
        homeStats = buildFallbackStats(homeTeam.id, homeTeam.name);
      }
      try {
        awayStats = await getTeamStats(awayTeam.id);
        awayStats.teamName = awayTeam.name;
      } catch {
        awayStats = buildFallbackStats(awayTeam.id, awayTeam.name);
      }

      const odds = (await getOdds(homeTeam.name, awayTeam.name)) ?? buildFallbackOdds();

      games.push({
        id: String(g.id),
        homeTeam,
        awayTeam,
        gameDate: (g.date as string).split('T')[0],
        gameDatetime: g.date as string,
        odds,
        homeTeamStats: homeStats,
        awayTeamStats: awayStats,
      });
    }

    return games;
  }, cacheKey);
}

export async function getGameResult(
  gameId: string
): Promise<{ homeScore: number; awayScore: number; finalScore: string } | null> {
  const cacheKey = `result_${gameId}`;
  try {
    return await withRetry(async () => {
      const client = bdlClient();
      const res = await client.get(`/games/${gameId}`);
      const g = res.data?.data as Record<string, unknown>;
      if (!g || g.status !== 'Final') return null;
      const homeScore = g.home_team_score as number;
      const awayScore = g.visitor_team_score as number;
      return { homeScore, awayScore, finalScore: `${homeScore}-${awayScore}` };
    }, cacheKey);
  } catch {
    return null;
  }
}

export async function getHeadToHead(
  team1Id: number,
  team2Id: number,
  seasons: number[]
): Promise<{ team1Wins: number; team2Wins: number; avgMargin: number }> {
  const cacheKey = `h2h_${team1Id}_${team2Id}_${seasons.join('_')}`;
  return withRetry(async () => {
    const client = bdlClient();
    let team1Wins = 0;
    let team2Wins = 0;
    const margins: number[] = [];

    for (const season of seasons) {
      const res = await client.get('/games', {
        params: {
          per_page: 100,
          'team_ids[]': [team1Id, team2Id],
          'seasons[]': [season],
          postseason: true,
        },
      });
      const rawGames: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
      for (const g of rawGames) {
        const homeId = (g.home_team as Record<string, unknown>)?.id as number;
        const homeScore = g.home_team_score as number;
        const visitorScore = g.visitor_team_score as number;
        const team1IsHome = homeId === team1Id;
        const team1Score = team1IsHome ? homeScore : visitorScore;
        const team2Score = team1IsHome ? visitorScore : homeScore;
        const diff = team1Score - team2Score;
        margins.push(diff);
        if (diff > 0) team1Wins++;
        else if (diff < 0) team2Wins++;
      }
    }

    const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
    return { team1Wins, team2Wins, avgMargin };
  }, cacheKey);
}

// ---------------------------------------------------------------------------
// Fallback helpers
// ---------------------------------------------------------------------------

function buildFallbackStats(teamId: number, teamName: string): GameStats {
  return {
    teamId,
    teamName,
    offensiveRating: 112,
    defensiveRating: 112,
    netRating: 0,
    pace: 98,
    last10Record: { wins: 5, losses: 5 },
    last10PointDiff: 0,
    homeRecord: { wins: 25, losses: 16 },
    awayRecord: { wins: 20, losses: 21 },
    daysOfRest: 2,
    strengthOfSchedule: 1500,
    turnoversPerGame: 14,
    reboundDifferential: 0,
    threePointRateAllowed: 0.35,
    injuryReport: [],
    topPlayers: [],
  };
}

function buildFallbackOdds(): GameOdds {
  return {
    homeMoneyline: -150,
    awayMoneyline: 130,
    spread: -3.5,
    homeSpreadOdds: -110,
    awaySpreadOdds: -110,
    totalLine: 218.5,
    overOdds: -110,
    underOdds: -110,
    bookmaker: 'fallback',
    lastUpdated: new Date().toISOString(),
  };
}

export async function getGamesForDate(date: string): Promise<UpcomingGame[]> {
  const cacheKey = `games_date_${date}`;
  return withRetry(async () => {
    const client = bdlClient();
    // Don't filter by postseason — play-in games are not flagged as postseason
    // but are still games we want to pick on. Filter by date only.
    const res = await client.get('/games', {
      params: {
        per_page: 100,
        'dates[]': [date],
      },
    });

    const rawGames: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
    const games: UpcomingGame[] = [];

    for (const g of rawGames) {
      const homeTeamRaw = g.home_team as Record<string, unknown>;
      const awayTeamRaw = g.visitor_team as Record<string, unknown>;
      const homeTeam = mapTeam(homeTeamRaw);
      const awayTeam = mapTeam(awayTeamRaw);

      let homeStats: GameStats;
      let awayStats: GameStats;
      try {
        homeStats = await getTeamStats(homeTeam.id);
        homeStats.teamName = homeTeam.name;
      } catch {
        homeStats = buildFallbackStats(homeTeam.id, homeTeam.name);
      }
      try {
        awayStats = await getTeamStats(awayTeam.id);
        awayStats.teamName = awayTeam.name;
      } catch {
        awayStats = buildFallbackStats(awayTeam.id, awayTeam.name);
      }

      const odds = (await getOdds(homeTeam.name, awayTeam.name)) ?? buildFallbackOdds();

      games.push({
        id: String(g.id),
        homeTeam,
        awayTeam,
        gameDate: (g.date as string).split('T')[0],
        gameDatetime: g.date as string,
        odds,
        homeTeamStats: homeStats,
        awayTeamStats: awayStats,
      });
    }

    return games;
  }, cacheKey);
}
