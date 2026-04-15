import { Team, GameStats, UpcomingGame, GameOdds, InjuredPlayer } from '../../src/data/types';

export const mockHomeTeam: Team = {
  id: 1,
  name: 'Boston Celtics',
  abbreviation: 'BOS',
  conference: 'East',
  division: 'Atlantic',
};

export const mockAwayTeam: Team = {
  id: 2,
  name: 'Miami Heat',
  abbreviation: 'MIA',
  conference: 'East',
  division: 'Southeast',
};

export const mockInjuredPlayer: InjuredPlayer = {
  name: 'Star Player',
  status: 'out',
  minutesPerGame: 34,
  pointsPerGame: 22,
  isTopThreeInMinutes: true,
};

export const mockHomeStats: GameStats = {
  teamId: 1,
  teamName: 'Boston Celtics',
  offensiveRating: 118.5,
  defensiveRating: 107.2,
  netRating: 11.3,
  pace: 99.5,
  last10Record: { wins: 8, losses: 2 },
  last10PointDiff: 7.4,
  homeRecord: { wins: 32, losses: 9 },
  awayRecord: { wins: 22, losses: 19 },
  daysOfRest: 2,
  strengthOfSchedule: 1520,
  turnoversPerGame: 12.8,
  reboundDifferential: 3.2,
  threePointRateAllowed: 0.33,
  injuryReport: [],
  topPlayers: [],
};

export const mockAwayStats: GameStats = {
  teamId: 2,
  teamName: 'Miami Heat',
  offensiveRating: 113.0,
  defensiveRating: 111.5,
  netRating: 1.5,
  pace: 96.0,
  last10Record: { wins: 5, losses: 5 },
  last10PointDiff: -1.2,
  homeRecord: { wins: 25, losses: 16 },
  awayRecord: { wins: 17, losses: 24 },
  daysOfRest: 1,
  strengthOfSchedule: 1490,
  turnoversPerGame: 14.1,
  reboundDifferential: -0.8,
  threePointRateAllowed: 0.37,
  injuryReport: [mockInjuredPlayer],
  topPlayers: [],
};

export const mockOdds: GameOdds = {
  homeMoneyline: -180,
  awayMoneyline: 155,
  spread: -4.5,
  homeSpreadOdds: -110,
  awaySpreadOdds: -110,
  totalLine: 218.5,
  overOdds: -110,
  underOdds: -110,
  bookmaker: 'DraftKings',
  lastUpdated: new Date().toISOString(),
};

export const mockGame: UpcomingGame = {
  id: 'game-123',
  homeTeam: mockHomeTeam,
  awayTeam: mockAwayTeam,
  gameDate: '2025-05-10',
  gameDatetime: '2025-05-10T19:30:00Z',
  seriesInfo: 'Celtics lead 2-1',
  odds: mockOdds,
  homeTeamStats: mockHomeStats,
  awayTeamStats: mockAwayStats,
};
