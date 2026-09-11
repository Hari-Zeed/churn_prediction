import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

const ML_DIR = path.join(process.cwd(), 'ml_churn_prediction');

// ─── Safe path validation ─────────────────────────────────────────────────────
// Ensure only known scripts inside ML_DIR can be spawned (no path traversal)
const ALLOWED_SCRIPTS = new Set(['train_model.py', 'batch_predict.py']);

function runPythonScript(scriptName: string): Promise<{ success: boolean; output: string; error: string }> {
  return new Promise((resolve) => {
    // Guard: only allow pre-approved script names
    if (!ALLOWED_SCRIPTS.has(scriptName)) {
      resolve({ success: false, output: '', error: 'Script not allowed.' });
      return;
    }

    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(ML_DIR, scriptName);

    // Validate resolved path stays within ML_DIR (path traversal guard)
    if (!scriptPath.startsWith(ML_DIR)) {
      resolve({ success: false, output: '', error: 'Invalid script path.' });
      return;
    }

    const proc = spawn(pythonCmd, [scriptPath], {
      cwd: ML_DIR,
      env: { ...process.env },
    });

    let output = '';
    let errorOutput = '';

    proc.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    proc.stderr.on('data', (data: Buffer) => { errorOutput += data.toString(); });

    proc.on('close', (code) => {
      resolve({
        success: code === 0,
        output: output.trim(),
        error: errorOutput.trim(),
      });
    });

    proc.on('error', (err) => {
      resolve({ success: false, output: '', error: err.message });
    });
  });
}

export async function POST() {
  try {
    const logs: string[] = [];

    // Step 1: Train the model
    logs.push('[1/2] Running train_model.py...');
    const trainResult = await runPythonScript('train_model.py');

    if (!trainResult.success) {
      // Log full error internally, return safe message to client
      console.error('[/api/retrain] Training failed (stderr):', trainResult.error);
      return NextResponse.json({
        success: false,
        step: 'training',
        logs,
        error: 'Model training failed. Check server logs for details.',
      }, { status: 500 });
    }

    logs.push('[1/2] Training complete.');
    logs.push('[2/2] Running batch_predict.py...');

    // Step 2: Batch predict
    const predictResult = await runPythonScript('batch_predict.py');

    if (!predictResult.success) {
      console.error('[/api/retrain] Batch prediction failed (stderr):', predictResult.error);
      return NextResponse.json({
        success: false,
        step: 'prediction',
        logs,
        error: 'Batch prediction failed. Check server logs for details.',
      }, { status: 500 });
    }

    logs.push('[2/2] Predictions written to database.');

    return NextResponse.json({
      success: true,
      logs,
    });
  } catch (error) {
    console.error('[/api/retrain] Error:', error);
    return NextResponse.json({ error: 'Internal error occurred' }, { status: 500 });
  }
}
