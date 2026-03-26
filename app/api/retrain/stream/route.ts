import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

const ML_DIR = path.join(process.cwd(), 'ml_churn_prediction');

// Standardizing SSE encoder
const encoder = new TextEncoder();
const sendEvent = (controller: ReadableStreamDefaultController, log: string) => {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ log })}\n\n`));
};
const sendComplete = (controller: ReadableStreamDefaultController, success: boolean, error?: string) => {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ success, error })}\n\n`));
  controller.close();
};

export async function GET(req: Request) {
  // Use a TransformStream to construct standard SSE format
  const stream = new ReadableStream({
    async start(controller) {
      sendEvent(controller, '[1/2] Initiating ML pipeline sequence...');
      sendEvent(controller, 'Validating current dataset vectors...');
      sendEvent(controller, 'Starting train_model.py...');

      try {
        const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
        
        // --- STEP 1: TRAIN ---
        const trainProc = spawn(pythonCmd, ['train_model.py'], {
          cwd: ML_DIR,
          env: { ...process.env },
        });

        await new Promise<void>((resolve, reject) => {
          trainProc.stdout.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (line.trim()) sendEvent(controller, line.trim());
            }
          });
          trainProc.stderr.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (line.trim()) sendEvent(controller, `[WARN] ${line.trim()}`);
            }
          });
          trainProc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`train_model.py exited with code ${code}`));
          });
          trainProc.on('error', reject);
        });

        sendEvent(controller, '[1/2] Training complete.');
        sendEvent(controller, '[2/2] Running batch_predict.py...');

        // --- STEP 2: PREDICT ---
        const predictProc = spawn(pythonCmd, ['batch_predict.py'], {
          cwd: ML_DIR,
          env: { ...process.env },
        });

        await new Promise<void>((resolve, reject) => {
          predictProc.stdout.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (line.trim()) sendEvent(controller, line.trim());
            }
          });
          predictProc.stderr.on('data', (chunk) => {
            const lines = chunk.toString().split('\n');
            for (const line of lines) {
              if (line.trim()) sendEvent(controller, `[WARN] ${line.trim()}`);
            }
          });
          predictProc.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`batch_predict.py exited with code ${code}`));
          });
          predictProc.on('error', reject);
        });

        sendEvent(controller, '[2/2] Predictions written to database.');
        sendEvent(controller, '✅ Pipeline completed successfully.');
        sendComplete(controller, true);

      } catch (error: any) {
        sendEvent(controller, `❌ Pipeline failed: ${error.message}`);
        sendComplete(controller, false, error.message);
      }
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
