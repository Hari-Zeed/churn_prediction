export interface ChurnFeatures {
  customerId: string;
  tenure: number;
  monthlyCharges: number;
  contractType: 'Month-to-month' | 'One year' | 'Two year';
  [key: string]: string | number;
}

export interface ChurnPredictionResult {
  churn_prediction: 0 | 1;
  churn_probability: number;
  confidence: string;
  features_analyzed: number;
  error?: string;
}

export async function predictChurn(features: ChurnFeatures): Promise<ChurnPredictionResult> {
  try {
    const response = await fetch('/api/churn/predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(features),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data: ChurnPredictionResult = await response.json();
    return data;
  } catch (error) {
    console.error("ML Client Error:", error);
    return {
      churn_prediction: 0,
      churn_probability: 0,
      confidence: '0.0',
      features_analyzed: 0,
      error: "Prediction service unavailable."
    };
  }
}
