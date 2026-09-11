import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';

export const dynamic = 'force-dynamic';

interface PredictRequestInput {
  tenureMonths: number;
  monthlyCharges: number;
  contractType: string | number;
  paymentMethod: string | number;
  engagementScore: number;
  paymentReliability: number;
}

export interface TopFactor {
  feature: string;
  impact: number;
}

interface PredictResponse {
  churnProbability: number;
  predictedChurn: boolean;
  riskLevel: 'Low' | 'Medium' | 'High';
  churnReason?: string;
  retentionAction?: string;
  topFactors?: TopFactor[];
}

const VALID_CONTRACT_STRINGS = [
  'month-to-month',
  'month to month',
  'month_to_month',
  'one year',
  '1-year',
  '1 year',
  'one_year',
  'two year',
  '2-year',
  '2 year',
  'two_year',
];

const VALID_PAYMENT_STRINGS = [
  'electronic check',
  'electronic_check',
  'e-check',
  'mailed check',
  'mailed_check',
  'bank transfer (automatic)',
  'bank transfer',
  'bank_transfer',
  'credit card (automatic)',
  'credit card',
  'credit_card',
];

/**
 * Validates the request body and returns an array of error messages (if any).
 */
function validateInput(body: any): { errors: string[]; sanitized?: PredictRequestInput } {
  const errors: string[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: ['Request body must be a valid JSON object.'] };
  }

  // 1. tenureMonths
  const tenureMonths = body.tenureMonths ?? body.tenure;
  if (tenureMonths === undefined || tenureMonths === null) {
    errors.push('Field "tenureMonths" is required.');
  } else if (typeof tenureMonths !== 'number' || isNaN(tenureMonths) || tenureMonths < 0) {
    errors.push('Field "tenureMonths" must be a non-negative number.');
  }

  // 2. monthlyCharges
  const monthlyCharges = body.monthlyCharges;
  if (monthlyCharges === undefined || monthlyCharges === null) {
    errors.push('Field "monthlyCharges" is required.');
  } else if (typeof monthlyCharges !== 'number' || isNaN(monthlyCharges) || monthlyCharges < 0) {
    errors.push('Field "monthlyCharges" must be a non-negative number.');
  }

  // 3. contractType
  const contractType = body.contractType;
  if (contractType === undefined || contractType === null) {
    errors.push('Field "contractType" is required (e.g., "Month-to-Month", "1-Year", "2-Year" or numeric 0, 1, 2).');
  } else if (typeof contractType === 'number') {
    if (![0, 1, 2].includes(contractType)) {
      errors.push('Field "contractType" numeric value must be 0 (Month-to-Month), 1 (1-Year), or 2 (2-Year).');
    }
  } else if (typeof contractType === 'string') {
    const norm = contractType.trim().toLowerCase();
    if (!VALID_CONTRACT_STRINGS.includes(norm) && !['0', '1', '2'].includes(norm)) {
      errors.push(`Invalid "contractType": "${contractType}". Expected Month-to-Month, 1-Year, or 2-Year.`);
    }
  } else {
    errors.push('Field "contractType" must be a string or number.');
  }

  // 4. paymentMethod
  const paymentMethod = body.paymentMethod;
  if (paymentMethod === undefined || paymentMethod === null) {
    errors.push('Field "paymentMethod" is required (e.g., "Electronic Check", "Mailed Check", "Bank Transfer", "Credit Card" or numeric 0-3).');
  } else if (typeof paymentMethod === 'number') {
    if (![0, 1, 2, 3].includes(paymentMethod)) {
      errors.push('Field "paymentMethod" numeric value must be between 0 and 3.');
    }
  } else if (typeof paymentMethod === 'string') {
    const norm = paymentMethod.trim().toLowerCase();
    if (!VALID_PAYMENT_STRINGS.includes(norm) && !['0', '1', '2', '3'].includes(norm)) {
      errors.push(`Invalid "paymentMethod": "${paymentMethod}". Expected Electronic Check, Mailed Check, Bank Transfer, or Credit Card.`);
    }
  } else {
    errors.push('Field "paymentMethod" must be a string or number.');
  }

  // 5. engagementScore
  const engagementScore = body.engagementScore;
  if (engagementScore === undefined || engagementScore === null) {
    errors.push('Field "engagementScore" is required.');
  } else if (typeof engagementScore !== 'number' || isNaN(engagementScore) || engagementScore < 0) {
    errors.push('Field "engagementScore" must be a non-negative number.');
  }

  // 6. paymentReliability
  const paymentReliability = body.paymentReliability;
  if (paymentReliability === undefined || paymentReliability === null) {
    errors.push('Field "paymentReliability" is required.');
  } else if (typeof paymentReliability !== 'number' || isNaN(paymentReliability) || paymentReliability < 0) {
    errors.push('Field "paymentReliability" must be a non-negative number.');
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    sanitized: {
      tenureMonths: Number(tenureMonths),
      monthlyCharges: Number(monthlyCharges),
      contractType,
      paymentMethod,
      engagementScore: Number(engagementScore),
      paymentReliability: Number(paymentReliability),
    },
  };
}

/**
 * Executes predict_single.py to load model.pkl and compute the prediction.
 */
function runModelPrediction(input: PredictRequestInput): Promise<PredictResponse> {
  return new Promise((resolve, reject) => {
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(process.cwd(), 'ml_churn_prediction', 'predict_single.py');
    const inputJson = JSON.stringify(input);

    const proc = spawn(pythonCmd, [scriptPath, inputJson], {
      cwd: path.join(process.cwd(), 'ml_churn_prediction'),
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error('Inference timed out after 10 seconds.'));
    }, 10000);

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        let errMessage = stderr.trim();
        try {
          const parsedErr = JSON.parse(errMessage);
          if (parsedErr.error) errMessage = parsedErr.error;
        } catch {}
        return reject(new Error(errMessage || `Prediction process exited with code ${code}`));
      }

      try {
        const result = JSON.parse(stdout.trim());
        if (typeof result.churnProbability !== 'number') {
          return reject(new Error('Invalid output format from model prediction.'));
        }

        resolve({
          churnProbability: result.churnProbability,
          predictedChurn: Boolean(result.predictedChurn),
          riskLevel: result.riskLevel as 'Low' | 'Medium' | 'High',
          churnReason: result.churnReason,
          retentionAction: result.retentionAction,
          topFactors: result.topFactors,
        });
      } catch (parseError) {
        reject(new Error(`Failed to parse model output: ${stdout.trim()}`));
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function POST(req: Request) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          error: 'Bad Request',
          message: 'Invalid JSON payload provided.',
        },
        { status: 400 }
      );
    }

    // Step 1: Validate input
    const { errors, sanitized } = validateInput(body);
    if (errors.length > 0 || !sanitized) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          message: 'One or more required fields are missing or invalid.',
          details: errors,
        },
        { status: 400 }
      );
    }

    // Step 2: Load model.pkl & Predict
    const prediction = await runModelPrediction(sanitized);

    // Step 3: Return production response
    return NextResponse.json({
      churnProbability: prediction.churnProbability,
      predictedChurn: prediction.predictedChurn,
      riskLevel: prediction.riskLevel,
      churnReason: prediction.churnReason,
      retentionAction: prediction.retentionAction,
      topFactors: prediction.topFactors,
    });
  } catch (error: any) {
    console.error('[/api/predict] Inference error:', error);
    return NextResponse.json(
      {
        error: 'Prediction Error',
        message: 'An unexpected error occurred during model inference.',
      },
      { status: 500 }
    );
  }
}
