import axios from 'axios';
import * as cache from './cache';
import {
  PlayerProfile,
  PlayerGameLog,
  PropOddsLine,
  PropStat,
  OpponentDefenseRating,
} from './types';
import chalk from 'chalk';

const BDL_V1     = 'https://api.balldontlie.io/v1';
const BDL_NBA_V1 = 'https://api.balldontlie.io/nba/v1';
const BDL_V2     = 'https://api.balldontlie.io/v2';
const TIMEOUT    = 12_000;

const LEAGUE_AVG_DEF_RATING = 110;
const LEAGUE_AVG_PACE       = 98;

// BDL prop_type → our PropStat (only over_under types we care about)
const BDL_PROP_TYPE_MAP: Partial<Record<string, PropStat>> = {
  points:                   'points',
  rebounds:                 'rebounds',
  assists:                  'assists',
  threes:                   'threes',
  steals:                   'steals',
  blocks:                   'blocks',
  points_rebounds_assists:  'points_rebounds_assists',
  points_rebounds:          'points_rebounds',
  points_assists:           'points_assists',
  rebounds_assists:         'rebounds',  // closest available
};

function bdlHeaders(): Record<string, string> {
  return { Authorization: process.env.BALLDONTLIE_API_KEY ?? '' };
}

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

function currentSeason(): number {
  const now = new Date();
  return now.getFullYear() - (now.getMonth() < 9 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Player lookup by ID — Free: /v1/players/{id}
// ---------------------------------------------------------------------------

export async function getPlayerById(
  playerId: number
): Promise<{ id: number; name: string; teamId: number; teamName: string; position: string } | null> {
  const cacheKey = `player_by_id_${playerId}`;
  try {
    return await withRetry(async () => {
      const res = await axios.get(`${BDL_V1}/players/${playerId}`, {
        timeout: TIMEOUT, headers: bdlHeaders(),
      });
      const p = res.data?.data as Record<string, unknown>;
      if (!p) return null;
      const team = p.team as Record<string, unknown>;
      return {
        id:       p.id as number,
        name:     `${p.first_name} ${p.last_name}`,
        teamId:   (team?.id as number) ?? 0,
        teamName: (team?.full_name as string) ?? '',
        position: (p.position as string) ?? 'G',
      };
    }, cacheKey);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Player search by name — Free: /v1/players?search=
// ---------------------------------------------------------------------------

export async function searchPlayer(
  name: string
): Promise<{ id: number; name: string; teamId: number; teamName: string } | null> {
  const cacheKey = `player_search_${name.replace(/\s+/g, '_').toLowerCase()}`;
  try {
    return await withRetry(async () => {
      const res = await axios.get(`${BDL_V1}/players`, {
        timeout: TIMEOUT,
        headers: bdlHeaders(),
        params: { search: name, per_page: 5 },
      });
      const players: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
      if (players.length === 0) return null;
      const p    = players[0];
      const team = p.team as Record<string, unknown>;
      return {
        id:       p.id as number,
        name:     `${p.first_name} ${p.last_name}`,
        teamId:   (team?.id as number) ?? 0,
        teamName: (team?.full_name as string) ?? '',
      };
    }, cacheKey);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Player profile — GOAT: /v1/season_averages/general + /v1/stats game logs
// ---------------------------------------------------------------------------

export async function getPlayerProfile(
  playerId: number,
  playerName: string,
  teamId: number,
  teamName: string
): Promise<PlayerProfile> {
  const cacheKey = `player_profile_v2_${playerId}`;
  return withRetry(async () => {
    const season = currentSeason();

    // Season averages — GOAT: /v1/season_averages/general
    // type=Base for counting stats, type=Advanced for usg_pct
    // Try playoffs first (current stage), fall back to regular
    let base: Record<string, unknown> = {};
    let adv:  Record<string, unknown> = {};
    let position = 'G';

    for (const seasonType of ['playoffs', 'regular'] as const) {
      try {
        const [baseRes, advRes] = await Promise.all([
          axios.get(`${BDL_V1}/season_averages/general`, {
            timeout: TIMEOUT, headers: bdlHeaders(),
            params: { season, season_type: seasonType, type: 'Base', 'player_ids[]': [playerId] },
          }),
          axios.get(`${BDL_V1}/season_averages/general`, {
            timeout: TIMEOUT, headers: bdlHeaders(),
            params: { season, season_type: seasonType, type: 'Advanced', 'player_ids[]': [playerId] },
          }),
        ]);
        const baseData: Record<string, unknown>[] = (baseRes.data?.data as Record<string, unknown>[]) ?? [];
        const advData:  Record<string, unknown>[] = (advRes.data?.data  as Record<string, unknown>[]) ?? [];
        if (baseData.length > 0) {
          base     = (baseData[0].stats  as Record<string, unknown>) ?? {};
          adv      = (advData[0]?.stats  as Record<string, unknown>) ?? {};
          const player = (baseData[0].player as Record<string, unknown>) ?? {};
          position = (player.position as string) ?? 'G';
          break;
        }
      } catch {
        // try next season_type
      }
    }

    // Recent game logs — All-Star: /v1/stats (include postseason for current playoff context)
    const logsRes = await axios.get(`${BDL_V1}/stats`, {
      timeout: TIMEOUT,
      headers: bdlHeaders(),
      params: { 'player_ids[]': [playerId], 'seasons[]': [season], per_page: 15, postseason: true },
    }).catch(() => ({ data: { data: [] } }));
    // Also try regular season if playoff logs are empty
    const playoffLogs: Record<string, unknown>[] = (logsRes.data?.data as Record<string, unknown>[]) ?? [];
    const fallbackLogsRes = playoffLogs.length < 5
      ? await axios.get(`${BDL_V1}/stats`, {
          timeout: TIMEOUT,
          headers: bdlHeaders(),
          params: { 'player_ids[]': [playerId], 'seasons[]': [season], per_page: 15, postseason: false },
        }).catch(() => ({ data: { data: [] } }))
      : null;
    const regularLogs: Record<string, unknown>[] = (fallbackLogsRes?.data?.data as Record<string, unknown>[]) ?? [];
    // Merge: playoff logs first (more recent), fill with regular season
    const combinedLogs = [...playoffLogs, ...regularLogs].slice(0, 15);
    const gameLogs: PlayerGameLog[] = combinedLogs
      .filter((l) => (l.min as string) && (l.min as string) !== '0:00')
      .map((l) => {
        const game   = l.game as Record<string, unknown>;
        const isHome = (game.home_team_id as number) === teamId;
        const opp    = isHome
          ? (game.visitor_team as Record<string, unknown>)
          : (game.home_team as Record<string, unknown>);
        const minStr = (l.min as string) ?? '0:00';
        const [minPart, secPart] = minStr.split(':');
        const minutes = parseInt(minPart ?? '0') + (parseInt(secPart ?? '0') / 60);
        return {
          date:      (game.date as string)?.split('T')[0] ?? '',
          opponent:  (opp?.full_name as string) ?? 'Unknown',
          isHome,
          minutes,
          points:    (l.pts as number) ?? 0,
          rebounds:  (l.reb as number) ?? 0,
          assists:   (l.ast as number) ?? 0,
          threes:    (l.fg3m as number) ?? 0,
          steals:    (l.stl as number) ?? 0,
          blocks:    (l.blk as number) ?? 0,
          usageRate: (l.usg_pct as number) ?? 0.2,
        };
      });

    const last5 = gameLogs.slice(0, 5);
    const avg5  = (stat: keyof PlayerGameLog) =>
      last5.length > 0
        ? last5.reduce((s, g) => s + (g[stat] as number), 0) / last5.length
        : 0;

    // BDL Base stats: pts, reb, ast, fg3m, stl, blk, min, tov
    // BDL Advanced stats: usg_pct, pace, off_rating, def_rating
    const pts    = (base.pts  as number) ?? 0;
    const reb    = (base.reb  as number) ?? 0;
    const ast    = (base.ast  as number) ?? 0;
    const fg3m   = (base.fg3m as number) ?? 0;
    const stl    = (base.stl  as number) ?? 0;
    const blk    = (base.blk  as number) ?? 0;
    const minAvg = (base.min  as number) ?? 0;
    const usgPct = (adv.usg_pct as number) ?? 0.2;

    const last5Avg: Record<PropStat, number> = {
      points:                  avg5('points'),
      rebounds:                avg5('rebounds'),
      assists:                 avg5('assists'),
      threes:                  avg5('threes'),
      steals:                  avg5('steals'),
      blocks:                  avg5('blocks'),
      points_rebounds_assists: avg5('points') + avg5('rebounds') + avg5('assists'),
      points_rebounds:         avg5('points') + avg5('rebounds'),
      points_assists:          avg5('points') + avg5('assists'),
    };

    return {
      playerId,
      name: playerName,
      teamId,
      teamName,
      position,
      seasonAvgPoints:    pts,
      seasonAvgRebounds:  reb,
      seasonAvgAssists:   ast,
      seasonAvgThrees:    fg3m,
      seasonAvgSteals:    stl,
      seasonAvgBlocks:    blk,
      seasonAvgMinutes:   minAvg,
      seasonAvgUsageRate: usgPct,
      last5Avg,
      recentGameLogs: gameLogs,
      injuryStatus:   'active',
    };
  }, cacheKey);
}

// ---------------------------------------------------------------------------
// Player prop odds — GOAT: /v2/odds/player_props?game_id=
// ---------------------------------------------------------------------------

export async function getPropOddsForGame(
  gameId: string,
  homeTeamName?: string,
  awayTeamName?: string
): Promise<PropOddsLine[]> {
  const cacheKey = `prop_odds_bdl_${gameId}`;
  try {
    return await withRetry(async () => {
      const res = await axios.get(`${BDL_V2}/odds/player_props`, {
        timeout: TIMEOUT,
        headers: bdlHeaders(),
        params: { game_id: Number(gameId) },
      });

      const rows: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];

      if (rows.length === 0) {
        const label = homeTeamName && awayTeamName ? `${awayTeamName} @ ${homeTeamName}` : `game ${gameId}`;
        console.log(chalk.gray(`  [props] BDL returned 0 prop lines for ${label} — may not be available yet`));
        return [];
      }

      const lines: PropOddsLine[] = [];
      // Resolve player_id → name (batch unique IDs)
      const playerIds = [...new Set(rows.map((r) => r.player_id as number))];
      const playerMap = new Map<number, string>();

      await Promise.all(
        playerIds.map(async (pid) => {
          const p = await getPlayerById(pid).catch(() => null);
          if (p) playerMap.set(pid, p.name);
        })
      );

      // Prefer one line per player+stat from best vendor
      const PREFERRED = ['draftkings', 'fanduel', 'caesars', 'betmgm', 'betrivers'];
      const bestLines  = new Map<string, Record<string, unknown>>();

      for (const row of rows) {
        const market = row.market as Record<string, unknown>;
        if ((market?.type as string) !== 'over_under') continue; // skip milestone props

        const propType = row.prop_type as string;
        const stat     = BDL_PROP_TYPE_MAP[propType];
        if (!stat) continue;

        const pid    = row.player_id as number;
        const vendor = (row.vendor as string).toLowerCase();
        const key    = `${pid}_${stat}`;
        const existing = bestLines.get(key);
        if (!existing) {
          bestLines.set(key, row);
        } else {
          const existRank = PREFERRED.indexOf((existing.vendor as string).toLowerCase());
          const newRank   = PREFERRED.indexOf(vendor);
          if (newRank !== -1 && (existRank === -1 || newRank < existRank)) {
            bestLines.set(key, row);
          }
        }
      }

      for (const row of bestLines.values()) {
        const pid        = row.player_id as number;
        const playerName = playerMap.get(pid);
        if (!playerName) continue;

        const propType = row.prop_type as string;
        const stat     = BDL_PROP_TYPE_MAP[propType];
        if (!stat) continue;

        const market   = row.market as Record<string, unknown>;
        const overOdds  = (market.over_odds  as number) ?? -110;
        const underOdds = (market.under_odds as number) ?? -110;

        lines.push({
          playerId:    pid,
          playerName,
          stat,
          line:        parseFloat(row.line_value as string),
          overOdds,
          underOdds,
          bookmaker:   row.vendor as string,
          lastUpdated: (row.updated_at as string) ?? new Date().toISOString(),
        });
      }

      return lines;
    }, cacheKey);
  } catch (err) {
    const label = homeTeamName && awayTeamName ? `${awayTeamName} @ ${homeTeamName}` : `game ${gameId}`;
    console.log(chalk.gray(`  [props] BDL props unavailable for ${label}: ${(err as Error).message?.slice(0, 80)}`));
    return [];
  }
}

// ---------------------------------------------------------------------------
// Opponent defensive rating — GOAT: /nba/v1/team_season_averages/defense
// ---------------------------------------------------------------------------

export async function getOpponentDefenseRating(
  opponentTeamId: number,
  opponentTeamName: string,
  _position: string
): Promise<OpponentDefenseRating> {
  const cacheKey = `opp_defense_v2_${opponentTeamId}`;
  try {
    return await withRetry(async () => {
      const season = currentSeason();
      const res    = await axios.get(`${BDL_NBA_V1}/team_season_averages/general`, {
        timeout: TIMEOUT,
        headers: bdlHeaders(),
        params: { season, season_type: 'regular', type: 'Advanced', 'team_ids[]': [opponentTeamId] },
      });
      const data: Record<string, unknown>[] = (res.data?.data as Record<string, unknown>[]) ?? [];
      const stats = (data[0]?.stats as Record<string, unknown>) ?? {};

      // BDL Advanced type uses def_rating and off_rating (not defensive_rating)
      const defRating = (stats.def_rating as number) ?? LEAGUE_AVG_DEF_RATING;
      const pace      = (stats.pace       as number) ?? LEAGUE_AVG_PACE;

      // multiplier > 1 = weak defense (allows more than average) = good for overs
      const defMultiplier  = defRating / LEAGUE_AVG_DEF_RATING;
      const paceMultiplier = pace / LEAGUE_AVG_PACE;

      return {
        teamId:                    opponentTeamId,
        teamName:                  opponentTeamName,
        pointsAllowedToPosition:   defMultiplier,
        reboundsAllowedToPosition: defMultiplier * 0.85 + 0.15, // pace-adjusted proxy
        assistsAllowedToPosition:  defMultiplier * 0.75 + 0.25,
        paceAdjustment:            paceMultiplier,
      };
    }, cacheKey);
  } catch {
    return {
      teamId:                    opponentTeamId,
      teamName:                  opponentTeamName,
      pointsAllowedToPosition:   1.0,
      reboundsAllowedToPosition: 1.0,
      assistsAllowedToPosition:  1.0,
      paceAdjustment:            1.0,
    };
  }
}

// ---------------------------------------------------------------------------
// Top players for a team — GOAT: /v1/season_averages/general
// ---------------------------------------------------------------------------

export async function getTopPlayersForTeam(
  teamId: number,
  teamName: string,
  limit: number = 5
): Promise<Array<{ id: number; name: string; avgPoints: number; avgMinutes: number }>> {
  const cacheKey = `top_players_v2_${teamId}`;
  try {
    return await withRetry(async () => {
      const season = currentSeason();
      // Fetch active players on this team first
      const playersRes = await axios.get(`${BDL_V1}/players/active`, {
        timeout: TIMEOUT,
        headers: bdlHeaders(),
        params: { 'team_ids[]': [teamId], per_page: 20 },
      });
      const players: Record<string, unknown>[] = (playersRes.data?.data as Record<string, unknown>[]) ?? [];
      const playerIds = players.map((p) => p.id as number);
      if (playerIds.length === 0) return [];

      // Get Base season averages (pts, min, etc.) for those players
      const avgsRes = await axios.get(`${BDL_V1}/season_averages/general`, {
        timeout: TIMEOUT,
        headers: bdlHeaders(),
        params: { season, season_type: 'regular', type: 'Base', 'player_ids[]': playerIds },
      });
      const avgs: Record<string, unknown>[] = (avgsRes.data?.data as Record<string, unknown>[]) ?? [];

      return avgs
        .map((a) => {
          const stats  = (a.stats  as Record<string, unknown>) ?? {};
          const player = (a.player as Record<string, unknown>) ?? {};
          // BDL Base: min is a number (not a string like the old endpoint)
          const minVal = (stats.min as number) ?? 0;
          return {
            id:         player.id as number,
            name:       `${player.first_name} ${player.last_name}`,
            avgPoints:  (stats.pts as number) ?? 0,
            avgMinutes: minVal,
          };
        })
        .filter((p) => p.avgMinutes >= 18 && p.avgPoints >= 6)
        .sort((a, b) => b.avgPoints - a.avgPoints)
        .slice(0, limit);
    }, cacheKey);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Synthetic prop lines — fallback when BDL props unavailable
// ---------------------------------------------------------------------------

export function buildSyntheticPropLines(
  playerName: string,
  seasonAvgPoints: number,
  seasonAvgRebounds: number,
  seasonAvgAssists: number,
  seasonAvgThrees: number,
  stats: PropStat[] = ['points', 'rebounds', 'assists', 'threes']
): PropOddsLine[] {
  const avgs: Partial<Record<PropStat, number>> = {
    points:   seasonAvgPoints,
    rebounds: seasonAvgRebounds,
    assists:  seasonAvgAssists,
    threes:   seasonAvgThrees,
  };

  return stats
    .filter((stat) => (avgs[stat] ?? 0) >= 1)
    .map((stat) => ({
      playerName,
      stat,
      line:        Math.round((avgs[stat]!) * 2) / 2,
      overOdds:    -115,
      underOdds:   -105,
      bookmaker:   'synthetic',
      lastUpdated: new Date().toISOString(),
    }));
}
