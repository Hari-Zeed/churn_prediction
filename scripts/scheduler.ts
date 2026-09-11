/**
 * scripts/scheduler.ts
 * --------------------
 * Automated Batch Inference Scheduler for Customer Churn Prediction.
 *
 * Runs daily at 2:00 AM ('0 2 * * *') using node-cron.
 * Executes: python3 ml_churn_prediction/batch_predict.py
 *
 * Production Guarantees:
 *  - Overlap prevention: skips execution if previous batch run is still active.
 *  - Resiliency: catches process exit codes and stderr without crashing the host server/daemon.
 *  - Structured JSON observability: logs job_start, job_success, job_failure events.
 *  - Manual trigger support: executes immediately if --run-now is passed.
 */

import cron from 'node-cron';
import { spawn } from 'child_process';
import path from 'path';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRIPT_PATH = path.join(PROJECT_ROOT, 'ml_churn_prediction', 'batch_predict.py');

interface JobLogData {
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function logSchedulerEvent(event: string, data: Record<string, unknown> = {}): void {
  const payload: JobLogData = {
    event,
    timestamp: new Date().toISOString(),
    data,
  };
  console.log(JSON.stringify(payload));
}

let isJobRunning = false;

export function runBatchPredictionJob(): Promise<{ success: boolean; durationMs: number; error?: string }> {
  return new Promise((resolve) => {
    if (isJobRunning) {
      logSchedulerEvent('batch_job_skipped', {
        reason: 'Previous batch prediction job is still in progress.',
      });
      return resolve({ success: false, durationMs: 0, error: 'Job already running' });
    }

    isJobRunning = true;
    const startTime = Date.now();

    logSchedulerEvent('batch_job_start', {
      script: SCRIPT_PATH,
      cwd: PROJECT_ROOT,
    });

    // Execute python3 ml_churn_prediction/batch_predict.py
    const child = spawn('python3', [SCRIPT_PATH], {
      cwd: PROJECT_ROOT,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
      },
    });

    let stderrBuffer = '';
    let stdoutBuffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stdoutBuffer += text;
      // Stream raw process output directly to stdout for terminal and cloud loggers
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderrBuffer += text;
      process.stderr.write(text);
    });

    child.on('error', (err) => {
      isJobRunning = false;
      const durationMs = Date.now() - startTime;
      logSchedulerEvent('batch_job_error', {
        durationMs,
        error: err.message,
        stack: err.stack,
      });
      resolve({ success: false, durationMs, error: err.message });
    });

    child.on('close', (code) => {
      isJobRunning = false;
      const durationMs = Date.now() - startTime;

      if (code === 0) {
        logSchedulerEvent('batch_job_success', {
          durationMs,
          exitCode: code,
        });
        resolve({ success: true, durationMs });
      } else {
        logSchedulerEvent('batch_job_failed', {
          durationMs,
          exitCode: code,
          stderr: stderrBuffer.slice(-1000), // last 1KB of error
        });
        // Resolve cleanly instead of rejecting so the cron runner never crashes the Node daemon
        resolve({
          success: false,
          durationMs,
          error: `Process exited with code ${code}: ${stderrBuffer.slice(-200)}`,
        });
      }
    });
  });
}

// ─── Cron Schedule ────────────────────────────────────────────────────────────
// Daily at 2:00 AM: '0 2 * * *'
const CRON_SCHEDULE = process.env.BATCH_CRON_SCHEDULE || '0 2 * * *';

export function initScheduler(): void {
  logSchedulerEvent('scheduler_initialized', {
    schedule: CRON_SCHEDULE,
    timezone: 'System / UTC',
    nextRunDesc: 'Every day at 02:00 AM',
  });

  cron.schedule(CRON_SCHEDULE, async () => {
    logSchedulerEvent('cron_triggered', { schedule: CRON_SCHEDULE });
    try {
      await runBatchPredictionJob();
    } catch (err) {
      logSchedulerEvent('cron_unhandled_exception', {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

// CLI Execution Support
if (require.main === module || process.argv.includes('--start')) {
  initScheduler();

  if (process.argv.includes('--run-now')) {
    logSchedulerEvent('manual_run_requested', {});
    runBatchPredictionJob();
  } else {
    console.log(`[Scheduler] Cron active: Running on schedule "${CRON_SCHEDULE}". Press Ctrl+C to terminate.`);
  }
}
