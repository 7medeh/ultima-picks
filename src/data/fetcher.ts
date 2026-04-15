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

// ---------------------------------------------------------------------------
// Base URLs — BDL has multiple versioned bases
// ---------------------------------------------------------------------------

const BDL_V1     = 'https://api.balldontlie.io/v1';
const BDL_NBA_V1 = 'https://api.balldontlie.io/nba/v1';
const BDL_V2     = 'https://api.balldontlie.io/v2';
const ODDS_BASE  = 'https://api.the-odds-api.com/v4'; // fallback only
const TIMEOUT    = 12_000;

const LEAGUE_AVG_DEF_RATING = 110;
const LEAGUE_AVG_PACE       = 98;

// ---------------------------------------------------------------------------
// HTTP clients
// ---------------------------------------------------------------------------

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? '' };
}

function bdl(base: string = BDL_V1): AxiosInstance {
  return axios.create({ baseURL: base, timeout: TIMEOUT, headers: bdlHeaders() });
}

// ---------------------------------------------------------------------------
// Cache-wrapped fetch with single retry
// ---------------------------------------------------------------------------

async function withRetry<T>(fn: () => Promise<T>, cacheKey: string): Promise<T> {
  const cached = cache.get<T>(cacheKey);
  if (cached !== null) return cached;
  try {
    const result = await fn();
    cache.set(cacheKey, result);
    return result;
  } catch {
    try {
      const result = await fn();
      cache.set(cacheKey, result);
      return result;
    } catch (err) {
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
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

function currentSeason(): number {
  const now = new Date();
  return now.getFullYear() - (now.getMonth() < 9 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Standings — GOAT: /v1/standings?season=
// ---------------------------------------------------------------------------

async function getStandings(season: number): Promise<Map<number, Record<string, unknown>>> {
  const cacheKey = `standings_${season}`;
  const rows = await withRetry(async () => {
    const res = await bdl().get('/standings', { params: { season } });
    return (res.data?.data as Record<string, unknown>[]) ?? [];
  }, cacheKey);

  const map = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const team = row.team as Record<string, unknown>;
    map.set(team.id as number, row);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Team season averages — GOAT: /nba/v1/team_season_averages/{category}
// ---------------------------------------------------------------------------

async function getTeamSeasonAverages(
  teamId: number,
  season: number,
  type: 'Base' | 'Advanced' = 'Advanced',
  seasonType: 'regular' | 'playoffs' = 'regular'
): Promise<Record<string, unknown>> {
  const cacheKey = `team_avg_${type}_${season}_${seasonType}_${teamId}`;
  return withRetry(async () => {
    const res = await bdl(BDL_NBA_V1).get('/team_season_averages/general', {
      params: { season, season_type: seasonType, type, 'team_ids[]': [teamId] },
    });
    const data: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
    return (data[0]?.stats as Record<string, unknown>) ?? {};
  }, cacheKey);
}

// ---------------------------------------------------------------------------
// Player injuries — All-Star: /v1/player_injuries?team_ids[]=
// ---------------------------------------------------------------------------

async function getTeamInjuries(teamId: number): Promise<InjuredPlayer[]> {
  const cacheKey = `injuries_${teamId}`;
  return withRetry(async () => {
    const res = await bdl().get('/player_injuries', {
      params: { 'team_ids[]': [teamId], per_page: 25 },
    });
    const rows: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
    return rows.map((r) => {
      const player = r.player as Record<string, unknown>;
      return {
        name: `${player.first_name} ${player.last_name}`,
        status: mapInjuryStatus(r.status as string),
        minutesPerGame: 0,   // not in injury endpoint — enriched separately if needed
        pointsPerGame: 0,
        isTopThreeInMinutes: false,
      };
    });
  }, cacheKey);
}

function mapInjuryStatus(raw: string): InjuredPlayer['status'] {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('out'))          return 'out';
  if (s.includes('doubtful'))     return 'doubtful';
  if (s.includes('questionable')) return 'questionable';
  return 'probable';
}

// ---------------------------------------------------------------------------
// Game betting odds — GOAT: /v2/odds?dates[]=  or  ?game_ids[]=
// Returns a map of BDL game_id → GameOdds (best available line)
// ---------------------------------------------------------------------------

const PREFERRED_VENDORS = ['draftkings', 'fanduel', 'caesars', 'betmgm', 'betrivers'];

export async function getOddsForDate(date: string): Promise<Map<number, GameOdds>> {
  const cacheKey = `bdl_odds_date_${date}`;
  const rows = await withRetry(async () => {
    const res = await bdl(BDL_V2).get('/odds', {
      params: { 'dates[]': [date], per_page: 100 },
    });
    return (res.data?.data as Record<string, unknown>[]) ?? [];
  }, cacheKey);

  // Prefer a specific vendor; fall back to first available
  const best = new Map<number, Record<string, unknown>>();
  for (const row of rows) {
    const gid = row.game_id as number;
    const vendor = (row.vendor as string).toLowerCase();
    const existing = best.get(gid);
    if (!existing) {
      best.set(gid, row);
    } else {
      const existingRank = PREFERRED_VENDORS.indexOf((existing.vendor as string).toLowerCase());
      const newRank      = PREFERRED_VENDORS.indexOf(vendor);
      if (newRank !== -1 && (existingRank === -1 || newRank < existingRank)) {
        best.set(gid, row);
      }
    }
  }

  const result = new Map<number, GameOdds>();
  for (const [gid, row] of best) {
    result.set(gid, {
      homeMoneyline:  (row.moneyline_home_odds as number) ?? -110,
      awayMoneyline:  (row.moneyline_away_odds as number) ?? -110,
      spread:         (row.spread_home_value   as number) ?? -2.5,
      homeSpreadOdds: (row.spread_home_odds    as number) ?? -110,
      awaySpreadOdds: (row.spread_away_odds    as number) ?? -110,
      totalLine:      (row.total_value         as number) ?? 218.5,
      overOdds:       (row.total_over_odds     as number) ?? -110,
      underOdds:      (row.total_under_odds    as number) ?? -110,
      bookmaker:      (row.vendor              as string) ?? 'balldontlie',
      lastUpdated:    (row.updated_at          as string) ?? new Date().toISOString(),
    });
  }
  return result;
}

// Fallback: The Odds API (kept for when BDL odds aren't available)
async function getOddsFromOddsApi(homeTeam: string, awayTeam: string): Promise<GameOdds | null> {
  try {
    const apiKey = process.env.ODDS_API_KEY ?? '';
    if (!apiKey) return null;
    const res = await axios.get(`${ODDS_BASE}/sports/basketball_nba/odds`, {
      timeout: TIMEOUT,
      params: { apiKey, regions: 'us', markets: 'h2h,spreads,totals', oddsFormat: 'american' },
    });
    const games: Record<string, unknown>[] = res.data as Record<string, unknown>[];
    const homeWord = homeTeam.toLowerCase().split(' ').pop() ?? '';
    const awayWord = awayTeam.toLowerCase().split(' ').pop() ?? '';
    const match = games.find((g) => {
      const home = (g.home_team as string).toLowerCase();
      const away = (g.away_team as string).toLowerCase();
      return home.includes(homeWord) || away.includes(awayWord);
    });
    if (!match) return null;
    const bookmakers: Record<string, unknown>[] = (match.bookmakers as Record<string, unknown>[]) ?? [];
    const book = bookmakers[0];
    if (!book) return null;
    const markets: Record<string, unknown>[] = (book.markets as Record<string, unknown>[]) ?? [];
    const h2h     = markets.find((m) => m.key === 'h2h');
    const spreads = markets.find((m) => m.key === 'spreads');
    const totals  = markets.find((m) => m.key === 'totals');
    const h2hO    = (h2h?.outcomes     as Record<string, unknown>[]) ?? [];
    const sprO    = (spreads?.outcomes as Record<string, unknown>[]) ?? [];
    const totO    = (totals?.outcomes  as Record<string, unknown>[]) ?? [];
    const homeH2H   = h2hO.find((o) => (o.name as string).toLowerCase().includes(homeWord));
    const awayH2H   = h2hO.find((o) => (o.name as string).toLowerCase().includes(awayWord));
    const homeSprd  = sprO.find((o)  => (o.name as string).toLowerCase().includes(homeWord));
    const awaySprd  = sprO.find((o)  => (o.name as string).toLowerCase().includes(awayWord));
    const over      = totO.find((o)  => o.name === 'Over');
    const under     = totO.find((o)  => o.name === 'Under');
    return {
      homeMoneyline:  (homeH2H?.price  as number) ?? -110,
      awayMoneyline:  (awayH2H?.price  as number) ?? -110,
      spread:         (homeSprd?.point as number) ?? -2.5,
      homeSpreadOdds: (homeSprd?.price as number) ?? -110,
      awaySpreadOdds: (awaySprd?.price as number) ?? -110,
      totalLine:      (over?.point     as number) ?? 218.5,
      overOdds:       (over?.price     as number) ?? -110,
      underOdds:      (under?.price    as number) ?? -110,
      bookmaker:      book.title as string,
      lastUpdated:    new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Team stats — GOAT: team season averages + standings + injuries
// ---------------------------------------------------------------------------

export async function getTeamStats(teamId: number): Promise<GameStats> {
  const cacheKey = `team_stats_v2_${teamId}`;
  return withRetry(async () => {
    const season = currentSeason();

    // Team season averages — type=Advanced for ratings/pace, type=Base for tov/reb
    const avg = await getTeamSeasonAverages(teamId, season, 'Advanced').catch(() => ({} as Record<string, unknown>));
    const base = await getTeamSeasonAverages(teamId, season, 'Base').catch(() => ({} as Record<string, unknown>));

    // Standings — real win/loss/home/away records
    const standings = await getStandings(season).catch(() => new Map<number, Record<string, unknown>>());
    const standing = standings.get(teamId) ?? {};

    // Injuries
    const injuryReport = await getTeamInjuries(teamId).catch(() => [] as InjuredPlayer[]);

    // Recent games for rest days
    const recentRes = await bdl().get('/games', {
      params: { 'team_ids[]': [teamId], per_page: 5, 'seasons[]': [season] },
    }).catch(() => ({ data: { data: [] } }));
    const recentGames: Record<string, unknown>[] = (recentRes.data?.data as Record<string, unknown>[]) ?? [];
    const lastGameDate = recentGames.length > 0
      ? new Date((recentGames[0].date as string))
      : null;
    const daysOfRest = lastGameDate
      ? Math.max(0, Math.floor((Date.now() - lastGameDate.getTime()) / 86_400_000))
      : 2;

    // Parse records from standings
    const parseRecord = (s: string | undefined) => {
      if (!s) return { wins: 0, losses: 0 };
      const [w, l] = (s).split('-').map(Number);
      return { wins: w ?? 0, losses: l ?? 0 };
    };

    const homeRecord = parseRecord(standing.home_record as string);
    const awayRecord = parseRecord(standing.road_record as string);
    const wins       = (standing.wins   as number) ?? 0;
    const losses     = (standing.losses as number) ?? 0;

    // Real ratings — BDL Advanced type uses off_rating/def_rating/net_rating/pace
    const offRating = (avg.off_rating as number) ?? 110;
    const defRating = (avg.def_rating as number) ?? 110;
    const netRating = (avg.net_rating as number) ?? (offRating - defRating);
    const pace      = (avg.pace       as number) ?? LEAGUE_AVG_PACE;
    // Counting stats from Base type
    const tov = (base.tov as number) ?? 14;
    const reb = (base.reb as number) ?? 0;

    // Top players from injuries list for context
    const topPlayers: PlayerStat[] = [];

    return {
      teamId,
      teamName: '',
      offensiveRating:     offRating,
      defensiveRating:     defRating,
      netRating,
      pace,
      last10Record:        { wins: Math.min(wins, 10), losses: Math.min(losses, 10) },
      last10PointDiff:     netRating * 0.5,
      homeRecord,
      awayRecord,
      daysOfRest,
      strengthOfSchedule:  1500,
      turnoversPerGame:    tov,
      reboundDifferential: reb,
      threePointRateAllowed: (avg.opp_three_point_pct as number) ?? 0.35,
      injuryReport,
      topPlayers,
    };
  }, cacheKey);
}

// ---------------------------------------------------------------------------
// Game result (unchanged — works on all tiers)
// ---------------------------------------------------------------------------

export async function getGameResult(
  gameId: string
): Promise<{ homeScore: number; awayScore: number; finalScore: string } | null> {
  const cacheKey = `result_${gameId}`;
  try {
    return await withRetry(async () => {
      const res = await bdl().get(`/games/${gameId}`);
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

// ---------------------------------------------------------------------------
// Head-to-head (unchanged)
// ---------------------------------------------------------------------------

export async function getHeadToHead(
  team1Id: number,
  team2Id: number,
  seasons: number[]
): Promise<{ team1Wins: number; team2Wins: number; avgMargin: number }> {
  const cacheKey = `h2h_${team1Id}_${team2Id}_${seasons.join('_')}`;
  return withRetry(async () => {
    let team1Wins = 0;
    let team2Wins = 0;
    const margins: number[] = [];

    for (const season of seasons) {
      const res = await bdl().get('/games', {
        params: { per_page: 100, 'team_ids[]': [team1Id, team2Id], 'seasons[]': [season] },
      });
      const rawGames: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
      for (const g of rawGames) {
        const homeId    = (g.home_team as Record<string, unknown>)?.id as number;
        const homeScore = g.home_team_score as number;
        const visScore  = g.visitor_team_score as number;
        const t1Home    = homeId === team1Id;
        const diff      = t1Home ? homeScore - visScore : visScore - homeScore;
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
// Fallbacks
// ---------------------------------------------------------------------------

function buildFallbackStats(teamId: number, teamName: string): GameStats {
  return {
    teamId, teamName,
    offensiveRating: 112, defensiveRating: 112, netRating: 0, pace: 98,
    last10Record: { wins: 5, losses: 5 }, last10PointDiff: 0,
    homeRecord: { wins: 25, losses: 16 }, awayRecord: { wins: 20, losses: 21 },
    daysOfRest: 2, strengthOfSchedule: 1500,
    turnoversPerGame: 14, reboundDifferential: 0, threePointRateAllowed: 0.35,
    injuryReport: [], topPlayers: [],
  };
}

function buildFallbackOdds(): GameOdds {
  return {
    homeMoneyline: -150, awayMoneyline: 130,
    spread: -3.5, homeSpreadOdds: -110, awaySpreadOdds: -110,
    totalLine: 218.5, overOdds: -110, underOdds: -110,
    bookmaker: 'fallback', lastUpdated: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Games for date — batches odds in a single call
// ---------------------------------------------------------------------------

export async function getGamesForDate(date: string): Promise<UpcomingGame[]> {
  const cacheKey = `games_date_${date}`;
  return withRetry(async () => {
    // 1. Fetch games
    const res = await bdl().get('/games', { params: { per_page: 100, 'dates[]': [date] } });
    const rawGames: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
    if (rawGames.length === 0) return [];

    // 2. Batch-fetch all odds for the date in ONE call (GOAT tier)
    let oddsMap = new Map<number, GameOdds>();
    try {
      oddsMap = await getOddsForDate(date);
    } catch {
      console.log(chalk.gray('  [odds] BDL odds unavailable, trying The Odds API...'));
    }

    const games: UpcomingGame[] = [];

    for (const g of rawGames) {
      const homeTeamRaw = g.home_team    as Record<string, unknown>;
      const awayTeamRaw = g.visitor_team as Record<string, unknown>;
      const homeTeam    = mapTeam(homeTeamRaw);
      const awayTeam    = mapTeam(awayTeamRaw);

      // Team stats
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

      // Odds: BDL first, Odds API second, fallback third
      const bdlGameId = g.id as number;
      let odds = oddsMap.get(bdlGameId);
      if (!odds) {
        odds = await getOddsFromOddsApi(homeTeam.name, awayTeam.name).catch(() => null) ?? undefined;
      }
      if (!odds) {
        console.log(chalk.gray(`  [odds] No odds found for ${awayTeam.name} @ ${homeTeam.name} — using fallback`));
        odds = buildFallbackOdds();
      }

      games.push({
        id: String(bdlGameId),
        homeTeam,
        awayTeam,
        gameDate:     (g.date as string).split('T')[0],
        gameDatetime: g.date as string,
        odds,
        homeTeamStats: homeStats,
        awayTeamStats: awayStats,
      });
    }

    return games;
  }, cacheKey);
}

// ---------------------------------------------------------------------------
// Upcoming games (unchanged interface)
// ---------------------------------------------------------------------------

export async function getUpcomingPlayoffGames(daysAhead: number): Promise<UpcomingGame[]> {
  const today = new Date();
  const dates: string[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const allGames: UpcomingGame[] = [];
  for (const date of dates) {
    const games = await getGamesForDate(date).catch(() => []);
    allGames.push(...games);
  }
  return allGames;
}
