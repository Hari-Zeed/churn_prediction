// Simulated IBM Telco Customer Churn dataset — 500 customers
export type ContractType = 'Month-to-month' | 'One year' | 'Two year';

export interface Customer {
  id: string;
  tenure: number;            // months
  monthlyCharges: number;   // INR
  contractType: ContractType;
  techSupport: boolean;
  onlineSecurity: boolean;
  supportTickets: number;
  churnProbability: number;  // 0-1 pre-calculated
}

function weightedRisk(c: Omit<Customer, 'id' | 'churnProbability'>): number {
  let risk = 0;

  if (c.contractType === 'Month-to-month') risk += 0.35;
  else if (c.contractType === 'One year') risk += 0.10;
  // Two year = 0 extra

  if (c.tenure < 6) risk += 0.28;
  else if (c.tenure < 24) risk += 0.12;

  if (c.monthlyCharges > 10000) risk += 0.18;
  else if (c.monthlyCharges > 5000) risk += 0.08;

  if (!c.techSupport) risk += 0.10;
  if (!c.onlineSecurity) risk += 0.08;

  if (c.supportTickets > 3) risk += 0.12;

  // Add ±10% noise
  risk += (Math.random() - 0.5) * 0.20;

  return Math.min(0.99, Math.max(0.01, risk));
}

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function generateCustomers(): Customer[] {
  const contracts: ContractType[] = ['Month-to-month', 'One year', 'Two year'];
  return Array.from({ length: 500 }, (_, i) => {
    const r = seededRandom(i);
    const tenure = Math.floor(seededRandom(i + 100) * 72) + 1;
    const monthlyCharges = 1000 + seededRandom(i + 200) * 10000;
    const contractType = contracts[Math.floor(seededRandom(i + 300) * 3)];
    const techSupport = seededRandom(i + 400) > 0.5;
    const onlineSecurity = seededRandom(i + 500) > 0.5;
    const supportTickets = Math.floor(seededRandom(i + 600) * 6);

    const base = { tenure, monthlyCharges, contractType, techSupport, onlineSecurity, supportTickets };
    return {
      id: `CUST-${String(1000 + i).padStart(4, '0')}`,
      ...base,
      churnProbability: weightedRisk(base),
    };
  });
}

// Pre-generated at module load — acts as our in-memory "database"
export const MOCK_CUSTOMERS: Customer[] = generateCustomers();
