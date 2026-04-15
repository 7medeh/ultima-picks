import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import {
  ModelWeights,
  CVSWeights,
  RecalibrationResult,
  FactorPerformance,
  Belief,
} from '../data/types';
import {
  getRecentBeliefs,
  getWinRateByCVSBucket,
  saveModelWeights,
  saveRecalibrationRun,
  saveFactorPerformance,
} from '../db/queries';

const CALIBRATION_PATH = path.resolve('./data/calibration.json');
const LEARNING_LOG_PATH = path.resolve('./learning_log.md');
const FACTOR_PERF_PATH = path.resolve('./data/factor_performance.json');

interface CalibrationFile {
  modelWeights: ModelWeights;
  cvsWeights: CVSWeights;
  cvsThreshold: number;
  beliefThresholds: { conviction: number; lean: number };
  learningRate: number;
  minModelWeight: number;
  maxModelWeight: number;
  eloRatings?: Record<string, number>;
}

const DEFAULT_CALIBRATION: CalibrationFile = {
  modelWeights: {
    poisson: 0.28,
    elo: 0.24,
    powerRating: 0.26,
    impliedProbability: 0.22,
    lastUpdated: new Date().toISOString(),
    version: 1,
  },
  cvsWeights: {
    modelEdge: 0.25,
    eloProb: 0.20,
    restAdvantage: 0.10,
    homeCourtFactor: 0.10,
    injuryImpact: 0.15,
    momentumScore: 0.10,
    h2hHistory: 0.10,
    lastUpdated: new Date().toISOString(),
  },
  cvsThreshold: 68,
  beliefThresholds: { conviction: 75, lean: 60 },
  learningRate: 0.05,
  minModelWeight: 0.10,
  maxModelWeight: 0.50,
};

export function loadCalibration(): CalibrationFile {
  try {
    if (!fs.existsSync(CALIBRATION_PATH)) return DEFAULT_CALIBRATION;
    return JSON.parse(fs.readFileSync(CALIBRATION_PATH, 'utf-8')) as CalibrationFile;
  } catch {
    return DEFAULT_CALIBRATION;
  }
}

export function saveCalibration(config: CalibrationFile): void {
  const tmp = CALIBRATION_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, CALIBRATION_PATH);
}

export function ensureCalibrationExists(): void {
  if (!fs.existsSync(CALIBRATION_PATH)) {
    const dir = path.dirname(CALIBRATION_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    saveCalibration(DEFAULT_CALIBRATION);
  }
}

export function calculateModelAccuracy(
  modelName: 'poisson' | 'elo' | 'powerRating' | 'impliedProbability',
  beliefs: Belief[]
): number {
  const resolved = beliefs.filter((b) => b.result === 'WIN' || b.result === 'LOSS');
  if (resolved.length === 0) return 0.52;

  let correct = 0;
  for (const b of resolved) {
    let modelProb: number;
    const isPickingHome = b.pickSide === 'home';
    switch (modelName) {
      case 'poisson':
        modelProb = isPickingHome ? b.poissonWinProb : 1 - b.poissonWinProb;
        break;
      case 'elo':
        modelProb = isPickingHome ? b.eloWinProb : 1 - b.eloWinProb;
        break;
      case 'powerRating':
        modelProb = 0.5 + b.powerRatingEdge;
        break;
      case 'impliedProbability':
        modelProb = b.impliedProbability;
        break;
    }
    const predicted = modelProb > 0.5;
    const actual = b.result === 'WIN';
    if (predicted === actual) correct++;
  }
  return correct / resolved.length;
}

export function updateModelWeights(
  currentWeights: ModelWeights,
  accuracies: Record<string, number>,
  learningRate: number,
  minWeight: number,
  maxWeight: number
): ModelWeights {
  const models = ['poisson', 'elo', 'powerRating', 'impliedProbability'] as const;
  const avgAccuracy =
    models.reduce((sum, m) => sum + (accuracies[m] ?? 0.52), 0) / models.length;

  const rawWeights: Record<string, number> = {};
  for (const m of models) {
    const acc = accuracies[m] ?? 0.52;
    const current = currentWeights[m];
    const adjustment = learningRate * (acc - avgAccuracy);
    rawWeights[m] = Math.min(maxWeight, Math.max(minWeight, current + adjustment));
  }

  // Normalize to sum to 1.0
  const total = Object.values(rawWeights).reduce((a, b) => a + b, 0);
  return {
    poisson: rawWeights.poisson / total,
    elo: rawWeights.elo / total,
    powerRating: rawWeights.powerRating / total,
    impliedProbability: rawWeights.impliedProbability / total,
    lastUpdated: new Date().toISOString(),
    version: currentWeights.version + 1,
  };
}

export function tuneThreshold(
  currentThreshold: number,
  bucketStats: Record<string, { wins: number; total: number }>
): number {
  const MIN_THRESHOLD = 62;
  const MAX_THRESHOLD = 80;

  // If low-CVS buckets are under-performing, raise threshold
  const lowBuckets = ['60-64', '65-69'];
  for (const bucket of lowBuckets) {
    const stats = bucketStats[bucket];
    if (stats && stats.total >= 10 && stats.wins / stats.total < 0.52) {
      return Math.min(MAX_THRESHOLD, currentThreshold + 2);
    }
  }

  // If 70-74 bucket is performing well, consider lowering
  const midBucket = bucketStats['70-74'];
  if (midBucket && midBucket.total >= 10 && midBucket.wins / midBucket.total > 0.65) {
    return Math.max(MIN_THRESHOLD, currentThreshold - 1);
  }

  return currentThreshold;
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  if (xs.length !== ys.length || xs.length < 2) return 0;
  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((sum, x, i) => sum + (x - meanX) * ((ys[i] ?? 0) - meanY), 0);
  const denX = Math.sqrt(xs.reduce((sum, x) => sum + Math.pow(x - meanX, 2), 0));
  const denY = Math.sqrt(ys.reduce((sum, y) => sum + Math.pow(y - meanY, 2), 0));
  if (denX === 0 || denY === 0) return 0;
  return num / (denX * denY);
}

export function analyzeFactorPerformance(recentBeliefs: Belief[]): FactorPerformance[] {
  const resolved = recentBeliefs.filter((b) => b.result === 'WIN' || b.result === 'LOSS');
  if (resolved.length < 5) return [];

  const outcomes = resolved.map((b) => (b.result === 'WIN' ? 1 : 0));

  const factors: Array<{ name: string; values: number[] }> = [
    { name: 'modelEdge', values: resolved.map((b) => b.modelConsensusScore) },
    { name: 'eloProb', values: resolved.map((b) => b.eloWinProb) },
    { name: 'poissonProb', values: resolved.map((b) => b.poissonWinProb) },
    { name: 'cvsScore', values: resolved.map((b) => b.cvsScore) },
    { name: 'beliefScore', values: resolved.map((b) => b.beliefScore) },
    { name: 'kellyFraction', values: resolved.map((b) => b.kellyFraction) },
  ];

  const results: FactorPerformance[] = [];
  for (const factor of factors) {
    const last20 = resolved.slice(-20);
    const last50 = resolved.slice(-50);
    const corr20 = pearsonCorrelation(factor.values.slice(-20), outcomes.slice(-20));
    const corr50 = pearsonCorrelation(factor.values.slice(-50), outcomes.slice(-50));
    const corr100 = pearsonCorrelation(factor.values, outcomes);
    results.push({
      factorName: factor.name,
      rollingCorrelation20: corr20,
      rollingCorrelation50: corr50,
      rollingCorrelation100: corr100,
      lastUpdated: new Date().toISOString(),
    });
  }

  // Save to file
  try {
    const tmp = FACTOR_PERF_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(results, null, 2), 'utf-8');
    fs.renameSync(tmp, FACTOR_PERF_PATH);
  } catch { /* ignore */ }

  return results;
}

export function detectAnomalies(beliefs: Belief[], modelWeights: ModelWeights): string[] {
  const anomalies: string[] = [];
  const resolved = beliefs.filter((b) => b.result === 'WIN' || b.result === 'LOSS');
  if (resolved.length < 5) return anomalies;

  // SPECULATIVE outperforming CONVICTION
  const speculativeWins = resolved.filter((b) => b.beliefLabel === 'SPECULATIVE' && b.result === 'WIN').length;
  const speculativeTotal = resolved.filter((b) => b.beliefLabel === 'SPECULATIVE').length;
  const convictionWins = resolved.filter((b) => b.beliefLabel === 'CONVICTION' && b.result === 'WIN').length;
  const convictionTotal = resolved.filter((b) => b.beliefLabel === 'CONVICTION').length;
  if (speculativeTotal >= 5 && convictionTotal >= 5) {
    const specRate = speculativeWins / speculativeTotal;
    const convRate = convictionWins / convictionTotal;
    if (specRate > convRate) {
      anomalies.push(`⚠️ ANOMALY: SPECULATIVE picks (${(specRate * 100).toFixed(1)}%) outperforming CONVICTION (${(convRate * 100).toFixed(1)}%) over last ${resolved.length} picks`);
    }
  }

  // Single model dominating
  const maxWeight = Math.max(modelWeights.poisson, modelWeights.elo, modelWeights.powerRating, modelWeights.impliedProbability);
  if (maxWeight > 0.60) {
    anomalies.push(`⚠️ ANOMALY: Single model has ${(maxWeight * 100).toFixed(1)}% weight — consider manual review`);
  }

  // Win rate dropping
  const last15 = resolved.slice(-15);
  if (last15.length >= 15) {
    const recentWinRate = last15.filter((b) => b.result === 'WIN').length / 15;
    if (recentWinRate < 0.45) {
      anomalies.push(`🚨 ANOMALY: Win rate has dropped to ${(recentWinRate * 100).toFixed(1)}% over last 15 picks — model review recommended`);
    }
  }

  return anomalies;
}

export function writeLearningLog(result: RecalibrationResult): void {
  const entry = `
## Recalibration Run — ${new Date(result.runAt).toLocaleString()}

**Picks Resolved:** ${result.picksResolved} (${result.wins}W / ${result.losses}L / ${result.pushes}P)
**Win Rate:** ${(result.winRate * 100).toFixed(1)}%

### Model Weight Changes
${Object.entries(result.modelWeightChanges)
  .map(([model, change]) => `- **${model}**: ${(change.before * 100).toFixed(1)}% → ${(change.after * 100).toFixed(1)}% (${change.delta >= 0 ? '+' : ''}${(change.delta * 100).toFixed(2)}%)`)
  .join('\n')}

${result.cvsThresholdChange ? `### CVS Threshold\n${result.cvsThresholdChange.before} → ${result.cvsThresholdChange.after}\n` : ''}

${result.anomaliesDetected.length > 0 ? `### Anomalies\n${result.anomaliesDetected.join('\n')}\n` : ''}

---
`;

  try {
    fs.appendFileSync(LEARNING_LOG_PATH, entry, 'utf-8');
  } catch (err) {
    console.error(chalk.red(`Failed to write learning log: ${String(err)}`));
  }
}

export async function runRecalibration(): Promise<RecalibrationResult> {
  const config = loadCalibration();
  const recentBeliefs = getRecentBeliefs(200);
  const resolved = recentBeliefs.filter((b) => b.result === 'WIN' || b.result === 'LOSS' || b.result === 'PUSH');

  if (resolved.length < 10) {
    console.log(chalk.yellow(`Not enough resolved picks for recalibration (need 10, have ${resolved.length}). Logging results only.`));
    const result: RecalibrationResult = {
      runAt: new Date().toISOString(),
      picksResolved: resolved.length,
      wins: resolved.filter((b) => b.result === 'WIN').length,
      losses: resolved.filter((b) => b.result === 'LOSS').length,
      pushes: resolved.filter((b) => b.result === 'PUSH').length,
      winRate: 0,
      modelWeightChanges: {},
      cvsThresholdChange: null,
      factorPerformanceUpdates: [],
      anomaliesDetected: [],
      learningLogEntry: 'Insufficient data for recalibration',
    };
    saveRecalibrationRun(result);
    return result;
  }

  const wins = resolved.filter((b) => b.result === 'WIN').length;
  const losses = resolved.filter((b) => b.result === 'LOSS').length;
  const pushes = resolved.filter((b) => b.result === 'PUSH').length;
  const winRate = wins / (wins + losses || 1);

  // Model accuracy
  const accuracies: Record<string, number> = {
    poisson: calculateModelAccuracy('poisson', resolved),
    elo: calculateModelAccuracy('elo', resolved),
    powerRating: calculateModelAccuracy('powerRating', resolved),
    impliedProbability: calculateModelAccuracy('impliedProbability', resolved),
  };

  const oldWeights = { ...config.modelWeights };
  const newWeights = updateModelWeights(
    config.modelWeights,
    accuracies,
    config.learningRate,
    config.minModelWeight,
    config.maxModelWeight
  );

  const modelWeightChanges: RecalibrationResult['modelWeightChanges'] = {};
  for (const key of ['poisson', 'elo', 'powerRating', 'impliedProbability'] as const) {
    modelWeightChanges[key] = {
      before: oldWeights[key],
      after: newWeights[key],
      delta: newWeights[key] - oldWeights[key],
    };
  }

  // CVS threshold tuning
  const buckets = ['60-64', '65-69', '70-74', '75-79', '80-84', '85-100'];
  const bucketStats: Record<string, { wins: number; total: number }> = {};
  const ranges: Record<string, [number, number]> = {
    '60-64': [60, 65], '65-69': [65, 70], '70-74': [70, 75],
    '75-79': [75, 80], '80-84': [80, 85], '85-100': [85, 101],
  };
  for (const [label, [min, max]] of Object.entries(ranges)) {
    bucketStats[label] = getWinRateByCVSBucket(min, max);
  }

  const oldThreshold = config.cvsThreshold;
  const newThreshold = tuneThreshold(config.cvsThreshold, bucketStats);
  const cvsThresholdChange =
    newThreshold !== oldThreshold ? { before: oldThreshold, after: newThreshold } : null;

  // Factor performance
  const factorPerformanceUpdates = analyzeFactorPerformance(recentBeliefs);
  for (const fp of factorPerformanceUpdates) {
    try { saveFactorPerformance(fp); } catch { /* ignore */ }
  }

  // Anomaly detection
  const anomaliesDetected = detectAnomalies(recentBeliefs, newWeights);

  // Save updated calibration
  config.modelWeights = newWeights;
  config.cvsThreshold = newThreshold;
  saveCalibration(config);
  saveModelWeights(newWeights, 'recalibration');

  const result: RecalibrationResult = {
    runAt: new Date().toISOString(),
    picksResolved: resolved.length,
    wins,
    losses,
    pushes,
    winRate,
    modelWeightChanges,
    cvsThresholdChange,
    factorPerformanceUpdates,
    anomaliesDetected,
    learningLogEntry: `Win rate: ${(winRate * 100).toFixed(1)}% | Picks: ${resolved.length}`,
  };

  writeLearningLog(result);
  saveRecalibrationRun(result);

  return result;
}
