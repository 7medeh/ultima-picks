import chalk from 'chalk';
import { runRecalibration } from '../engine/recalibrator';

export async function runRecalibrateCommand(): Promise<void> {
  console.log(chalk.cyan.bold('\nRunning model recalibration...\n'));

  const result = await runRecalibration();

  console.log(chalk.bold.white(`Recalibration Complete — ${new Date(result.runAt).toLocaleString()}`));
  console.log(chalk.white(`  Picks Resolved: ${result.picksResolved}`));
  console.log(chalk.white(`  Win Rate: ${(result.winRate * 100).toFixed(1)}% (${result.wins}W / ${result.losses}L / ${result.pushes}P)`));
  console.log();

  if (Object.keys(result.modelWeightChanges).length > 0) {
    console.log(chalk.bold.white('Model Weight Changes:'));
    for (const [model, change] of Object.entries(result.modelWeightChanges)) {
      const arrow = change.delta > 0.005 ? chalk.green('↑') : change.delta < -0.005 ? chalk.red('↓') : chalk.gray('→');
      console.log(
        `  ${arrow} ${model}: ${(change.before * 100).toFixed(1)}% → ${chalk.bold((change.after * 100).toFixed(1))}%`
      );
    }
    console.log();
  }

  if (result.cvsThresholdChange) {
    console.log(chalk.bold.white('CVS Threshold:'));
    console.log(
      `  ${result.cvsThresholdChange.before} → ${chalk.bold(String(result.cvsThresholdChange.after))}`
    );
    console.log();
  }

  if (result.anomaliesDetected.length > 0) {
    console.log(chalk.bold.red('Anomalies Detected:'));
    for (const a of result.anomaliesDetected) {
      console.log(`  ${a}`);
    }
    console.log();
  }

  if (result.factorPerformanceUpdates.length > 0) {
    console.log(chalk.bold.white('Factor Performance (20-pick correlation):'));
    for (const fp of result.factorPerformanceUpdates) {
      const corr = fp.rollingCorrelation20;
      const color = corr > 0.2 ? chalk.green : corr > 0 ? chalk.yellow : chalk.red;
      console.log(`  ${fp.factorName}: ${color(corr.toFixed(3))}`);
    }
    console.log();
  }

  console.log(chalk.gray('Learning log updated: ./learning_log.md'));
}
