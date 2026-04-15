import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { buildHtmlReport } from './template';
import { getParlayByDate, getRecentParlays, getLatestModelWeights } from '../db/queries';
import { detectAnomalies } from '../engine/recalibrator';
import { Belief, FactorPerformance } from '../data/types';

const OUTPUT_PATH = path.resolve('./output/report.html');
const FACTOR_PERF_PATH = path.resolve('./data/factor_performance.json');

function loadFactorPerformance(): FactorPerformance[] {
  try {
    if (!fs.existsSync(FACTOR_PERF_PATH)) return [];
    return JSON.parse(fs.readFileSync(FACTOR_PERF_PATH, 'utf-8')) as FactorPerformance[];
  } catch {
    return [];
  }
}

export async function generateReport(date: string): Promise<void> {
  console.log(chalk.cyan(`Generating HTML report for ${date}...`));

  const parlay = getParlayByDate(date);
  const recentParlays = getRecentParlays(20);
  const modelWeights = getLatestModelWeights();
  const factorPerformance = loadFactorPerformance();

  // Radar zone: picks with CVS 60-67 that didn't make the parlay
  const radarZone: Belief[] = [];
  if (parlay) {
    const parlayPickIds = new Set(parlay.picks.map((p) => p.pickId));
    // We don't have a direct "radar" query, but we can note picks just below threshold
    // For now, use picks from the parlay generation that were filtered out
    // This would require saving all candidates — for now, leave empty unless we have extras
  }

  // Anomalies
  const { getRecentBeliefs } = await import('../db/queries');
  const recentBeliefs = getRecentBeliefs(50);
  const anomalies = modelWeights
    ? detectAnomalies(recentBeliefs, modelWeights)
    : [];

  const html = buildHtmlReport({
    parlay,
    date,
    modelWeights,
    factorPerformance,
    recentParlays,
    radarZone,
    anomalies,
  });

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, html, 'utf-8');

  console.log(chalk.green(`Report saved to ${OUTPUT_PATH}`));
  console.log(chalk.gray(`Open in browser: file://${OUTPUT_PATH}`));
}
