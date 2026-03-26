"""
expand_dataset.py
-----------------
Reads the original customer_data.csv and synthetically generates missing
enterprise features: Monthly_Charges, Contract_Type, and Payment_Method.
Overwrites the customer_data.csv so that train_model.py and batch_predict.py
can utilize these new fields.
"""

import os
import pandas as pd  # type: ignore
import numpy as np  # type: ignore

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BASE_DIR, "customer_data.csv")

def main():
    print("Loading original dataset...")
    df = pd.read_csv(DATA_PATH)
    
    # Force re-expansion to update Monthly_Charges to INR scale

    print("Generating synthetic enterprise features...")
    
    np.random.seed(42)  # For reproducible synthetic generation
    size = len(df)
    
    # 1. Monthly_Charges
    # Let's say monthly charges vary from ₹2,000 to ₹15,000
    df["Monthly_Charges"] = np.random.uniform(2000.0, 15000.0, size).round(2)
    
    # 2. Contract_Type
    # Map probabilities: Churners are more likely to have Month-to-Month contracts
    contract_types = ["Month-to-Month", "1-Year", "2-Year"]
    
    # We assign contract types based on Churn status to teach the model a real dependency
    is_churn = df["Churn"] == 1
    
    churn_count = len(df[is_churn])
    loyal_count = size - churn_count
    
    # For churners: 80% Month-to-Month, 15% 1-Year, 5% 2-Year
    churn_contracts = np.random.choice(contract_types, size=churn_count, p=[0.80, 0.15, 0.05])
    
    # For loyal customers: 30% Month-to-Month, 40% 1-Year, 30% 2-Year
    loyal_contracts = np.random.choice(contract_types, size=loyal_count, p=[0.30, 0.40, 0.30])
    
    df.loc[is_churn, "Contract_Type"] = churn_contracts  # type: ignore
    df.loc[~is_churn, "Contract_Type"] = loyal_contracts  # type: ignore
    
    # 3. Payment_Method
    payment_methods = ["Credit Card", "Bank Transfer", "PayPal"]
    
    # Slight correlation: High payment failures -> Bank Transfer or Credit card issues
    high_failures = df["Payment_Failures"] > 1
    
    df["Payment_Method"] = np.random.choice(payment_methods, size=size, p=[0.50, 0.30, 0.20])
    df.loc[high_failures, "Payment_Method"] = np.random.choice(["Bank Transfer", "Credit Card"], size=high_failures.sum(), p=[0.60, 0.40])

    # Reorder columns to insert them neatly before 'Churn'
    cols = list(df.columns)
    cols.remove("Monthly_Charges")
    cols.remove("Contract_Type")
    cols.remove("Payment_Method")
    churn_idx = cols.index("Churn")
    cols.insert(churn_idx, "Monthly_Charges")
    cols.insert(churn_idx + 1, "Contract_Type")
    cols.insert(churn_idx + 2, "Payment_Method")
    df = df[cols]
    
    df.to_csv(DATA_PATH, index=False)
    print(f"Dataset successfully expanded and saved to {DATA_PATH}.")
    print("New columns: Monthly_Charges, Contract_Type, Payment_Method")

if __name__ == "__main__":
    main()
