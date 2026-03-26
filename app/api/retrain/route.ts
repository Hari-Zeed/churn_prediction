import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

const ML_DIR = path.join(process.cwd(), 'ml_churn_prediction');

function runPythonScript(scriptName: string): Promise<{ success: boolean; output: string; error: string }> {
  return new Promise((resolve) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(ML_DIR, scriptName);

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
      return NextResponse.json({
        success: false,
        step: 'training',
        logs,
        error: trainResult.error || 'Model training failed.',
        output: trainResult.output,
      }, { status: 500 });
    }

    logs.push('[1/2] Training complete.');
    logs.push('[2/2] Running batch_predict.py...');

    // Step 2: Batch predict
    const predictResult = await runPythonScript('batch_predict.py');

    if (!predictResult.success) {
      return NextResponse.json({
        success: false,
        step: 'prediction',
        logs,
        error: predictResult.error || 'Batch prediction failed.',
        output: predictResult.output,
      }, { status: 500 });
    }

    logs.push('[2/2] Predictions written to database.');

    return NextResponse.json({
      success: true,
      logs,
      trainingOutput: trainResult.output,
      predictionOutput: predictResult.output,
    });
  } catch (error) {
    console.error('[/api/retrain] Error:', error);
    return NextResponse.json({ error: 'Internal server error during retraining.' }, { status: 500 });
  }
}
