# NBA Picks Engine

A self-learning NBA Playoff Picks Engine that generates optimal 4-leg daily parlays, assigns confidence and belief scores to each pick, fetches real outcomes autonomously, and recalibrates its own models over time.

**Target:** 3/5 parlay hit rate measured per 5-parlay rolling window.

---

## Prerequisites

- Node.js 18+
- npm
- API keys (see below)

---

## Installation

```bash
git clone <repo>
cd nba-picks-engine
npm install
cp .env.example .env
# Edit .env with your API keys
```

---

## API Key Setup

### balldontlie API (game data, stats)
1. Register at [balldontlie.io](https://www.balldontlie.io)
2. Free tier includes historical games and team stats
3. Add to `.env`: `BALLDONTLIE_API_KEY=your_key`

### The Odds API (betting lines)
1. Register at [the-odds-api.com](https://the-odds-api.com)
2. Free tier: 500 requests/month
3. Add to `.env`: `ODDS_API_KEY=your_key`

---

## CLI Commands

### Generate a Parlay

```bash
# Today's games
npm run picks

# Specific date
npm run picks -- --date 2025-05-10

# Tomorrow
npm run picks -- --tomorrow

# Next available game day (skips no-game days)
npm run picks -- --next
```

**Sample output:**
```
 DAILY PARLAY CARD │ Saturday, May 10 │ 4 games on slate │ Combined: +847

  Boston Celtics (moneyline)  -165  CVS: 78.4  [LEAN]  2u
    Celtics @ Heat · 2025-05-10
    The models strongly favor Boston at ~63.2% win probability...

  Denver Nuggets (spread)  -3.5 (-110)  CVS: 82.1  [CONVICTION]  3u
    ...
```

### Deep Matchup Analysis

```bash
npm run analyze -- --team1 "Lakers" --team2 "Celtics"
```

Shows all 4 model probabilities, CVS factor breakdown, team stats comparison, and all pick candidates.

### Playoff Standings

```bash
npm run standings
```

Shows current playoff teams ranked by Elo rating with implied win percentages.

### Performance Tracker

```bash
npm run track
npm run track -- --last 10
```

Shows lifetime stats, win rate by pick type and belief label, rolling 5-parlay tracker, and ASCII sparkline trend.

### Sync Results

```bash
npm run sync-results
```

Fetches outcomes for all pending picks. Auto-triggers recalibration if 5+ picks are resolved.

### Recalibrate Models

```bash
npm run recalibrate
```

Manually runs full model weight recalibration. Appends to `learning_log.md`.

### Backtest Simulation

```bash
npm run simulate -- --season 2024 --weeks 12
```

Runs the picks engine on historical data week by week, recalibrating as it goes.

### Generate HTML Report

```bash
npm run report
npm run report -- --date 2025-05-10
```

Generates `output/report.html` with a dark-themed full report including pick breakdowns, model health, and season tracker.

### Auto-Scheduler

```bash
npm run schedule
```

Starts two cron jobs:
- **9:00 AM daily** — generates parlay for today (skips no-game days automatically)
- **1:00 AM daily** — syncs results and runs recalibration

---

## Formula Documentation

### Poisson Model

Treats each team's score as an independent Poisson process. Expected points are calculated from offensive rating vs opponent's defensive rating, adjusted for pace:

```
expected_pts = (offRtg * leagueAvg / defRtg) * (avgPace / leagueAvgPace) * 48/100
```

A score probability matrix (80-150 for each team) is built and win/push/loss probabilities are derived from it.

### Elo Rating System

- Starting Elo: 1500 for all teams
- K-factor: 20 (how much each game moves ratings)
- Home court boost: +100 Elo points (~7% win probability boost)
- Margin of victory multiplier: `ln(|pointDiff| + 1) * (2.2 / (eloDiff * 0.001 + 2.2))`
- 25 Elo points ≈ 1 point on the spread

### Power Rating

Composite formula:
```
powerRating = (injuryAdjustedNetRtg * 0.40) + (SOS * 0.20) + (momentum * 0.25) + (injuryAdjustedNetRtg * 0.15)
```

Injury impact weights: out=1.0, doubtful=0.75, questionable=0.50, probable=0.15

Win probability uses logistic function: `1 / (1 + e^(-0.15 * powerRatingDiff))`

### CVS (Confidence Value Score)

```
CVS = (modelEdge * 0.25) + (eloProb * 0.20) + (restAdv * 0.10) +
      (homeCourtFactor * 0.10) + (injuryImpact * 0.15) +
      (momentumScore * 0.10) + (h2hHistory * 0.10)
```

Minimum CVS to qualify: **68** (adjustable via recalibration).

Labels: STRONG LOCK (80+), VALUE PLAY (68-79), RADAR (60-67), REJECT (<60)

### Belief Score

```
beliefScore = (CVS * 0.30) + (modelConsensus * 0.35) +
              (historicalAccuracy * 100 * 0.20) + (marketDisagreement * 0.15)
```

Labels: CONVICTION (75+), LEAN (60-74), SPECULATIVE (<60)

### How Recalibration Works

```
┌─────────────────────────────────────────────────────┐
│                  RECALIBRATION CYCLE                 │
│                                                      │
│  Resolved picks (10+ required)                      │
│         ↓                                           │
│  Calculate per-model accuracy (last 20/50/100)      │
│         ↓                                           │
│  Adjust model weights (learning rate = 0.05)        │
│  • Accurate model → weight ↑                        │
│  • Inaccurate model → weight ↓                      │
│  • Always normalize to sum = 1.0                    │
│         ↓                                           │
│  Tune CVS threshold (±2 points based on buckets)   │
│         ↓                                           │
│  Detect anomalies                                   │
│         ↓                                           │
│  Save to calibration.json + learning_log.md         │
└─────────────────────────────────────────────────────┘
```

---

## How to Interpret Picks

| CVS Score | Label       | Meaning                                    |
|-----------|-------------|-------------------------------------------|
| 80+       | STRONG LOCK | All factors strongly align                 |
| 68-79     | VALUE PLAY  | Sufficient confidence to include in parlay |
| 60-67     | RADAR       | Worth watching, below parlay threshold     |
| <60       | REJECT      | Insufficient confidence                    |

| Belief Label  | Score | Meaning                              |
|---------------|-------|--------------------------------------|
| CONVICTION    | 75+   | Models agree, strong market edge      |
| LEAN          | 60-74 | Models lean this way, some disagreement |
| SPECULATIVE   | <60   | Weak signal, use with caution         |

---

## The 3/5 Parlay Strategy

The engine targets a **3/5 hit rate** measured over rolling 5-parlay windows. Key principles:

1. **4 legs** per parlay — enough upside, not overextended
2. **CVS threshold** ensures only high-confidence picks are included
3. **Correlation penalty** prevents correlated legs (same series same night)
4. **Kelly sizing** caps parlay recommendation at 1-3 units
5. **Rolling window** evaluation resets every 5 parlays so recent performance drives calibration

---

## Bankroll Management

- Treat 1 unit = 1% of total bankroll
- Maximum parlay recommendation: 3 units
- If parlay hit rate drops below 40% over last 10: drop to 1-unit parlays
- Never exceed 5% of bankroll on a single parlay
- The engine uses **fractional Kelly (25%)** for conservative sizing

---

## Troubleshooting

**"No picks met confidence threshold today"**
- Normal on light game slates (1-2 games)
- Try `--next` to find a better slate day

**"BALLDONTLIE_API_KEY not set"**
- Copy `.env.example` to `.env` and add your keys

**"Not enough resolved picks for recalibration"**
- Need 10+ resolved picks before weights adjust
- Run `npm run sync-results` after games finish to resolve pending picks

**Parlay odds look wrong**
- Verify `ODDS_API_KEY` is set
- Fallback odds are used when the API is unavailable (they're generic placeholders)

**TypeScript errors on build**
- Run `npm install` to ensure all types are installed
- Node.js 18+ required

---

## Data Files

| File | Purpose |
|------|---------|
| `data/picks.db` | All picks, parlays, and recalibration history |
| `data/calibration.json` | Live model weights and CVS threshold |
| `data/factor_performance.json` | Rolling correlation data per CVS factor |
| `data/cache/` | API response cache (auto-cleared based on TTL) |
| `learning_log.md` | Human-readable recalibration history |
| `output/report.html` | Latest generated HTML report |
