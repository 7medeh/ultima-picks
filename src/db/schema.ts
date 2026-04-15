import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const DB_PATH = path.resolve(process.env.DB_PATH ?? './data/picks.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  return _db;
}

export function initializeSchema(): void {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS beliefs (
      pick_id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      game TEXT NOT NULL,
      game_date TEXT NOT NULL,
      home_team TEXT NOT NULL,
      away_team TEXT NOT NULL,
      pick_type TEXT NOT NULL,
      pick_side TEXT NOT NULL,
      pick_value TEXT NOT NULL,
      picked_team_or_side TEXT NOT NULL,
      odds INTEGER NOT NULL,
      poisson_win_prob REAL,
      elo_win_prob REAL,
      power_rating_edge REAL,
      implied_probability REAL,
      model_consensus_score REAL,
      model_std_deviation REAL,
      cvs_score REAL NOT NULL,
      belief_score REAL NOT NULL,
      belief_label TEXT NOT NULL,
      kelly_fraction REAL,
      recommended_units INTEGER,
      belief_rationale TEXT NOT NULL,
      scouting_report TEXT,
      result TEXT NOT NULL DEFAULT 'PENDING',
      actual_outcome TEXT,
      result_fetched_at TEXT,
      parlay_id TEXT
    );

    CREATE TABLE IF NOT EXISTS parlays (
      parlay_id TEXT PRIMARY KEY,
      generated_at TEXT NOT NULL,
      target_date TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'on-demand',
      pick_ids TEXT NOT NULL,
      combined_odds INTEGER NOT NULL,
      expected_value REAL,
      total_cvs_score REAL,
      recommended_units INTEGER,
      games_available INTEGER,
      picks_eligible INTEGER,
      result TEXT NOT NULL DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS model_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at TEXT NOT NULL,
      poisson REAL NOT NULL,
      elo REAL NOT NULL,
      power_rating REAL NOT NULL,
      implied_probability REAL NOT NULL,
      version INTEGER NOT NULL,
      trigger_event TEXT
    );

    CREATE TABLE IF NOT EXISTS cvs_weights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at TEXT NOT NULL,
      model_edge REAL NOT NULL,
      elo_prob REAL NOT NULL,
      rest_advantage REAL NOT NULL,
      home_court_factor REAL NOT NULL,
      injury_impact REAL NOT NULL,
      momentum_score REAL NOT NULL,
      h2h_history REAL NOT NULL
    );

    CREATE TABLE IF NOT EXISTS factor_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at TEXT NOT NULL,
      factor_name TEXT NOT NULL,
      rolling_correlation_20 REAL,
      rolling_correlation_50 REAL,
      rolling_correlation_100 REAL
    );

    CREATE TABLE IF NOT EXISTS recalibration_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT NOT NULL,
      picks_resolved INTEGER NOT NULL,
      wins INTEGER NOT NULL,
      losses INTEGER NOT NULL,
      pushes INTEGER NOT NULL,
      win_rate REAL NOT NULL,
      anomalies_detected TEXT,
      summary TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS simulation_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_at TEXT NOT NULL,
      season INTEGER NOT NULL,
      weeks_simulated INTEGER NOT NULL,
      overall_win_rate REAL NOT NULL,
      parlay_hit_rate REAL NOT NULL,
      report_json TEXT NOT NULL
    );
  `);
}
