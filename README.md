# Customer Churn Prediction Platform (DataSync)

Full-stack SaaS platform that delivers real-time churn prediction and revenue impact analysis to support business decision-making.

## Key Features
- Real-time churn prediction with AI-generated insights
- Revenue impact analysis for at-risk customers
- 8 REST API endpoints powering predictions and analytics
- Scalable 3-tier architecture (frontend, backend, ML pipeline)

## Tech Stack
- **Frontend:** Next.js
- **Backend:** Python, REST APIs
- **ML:** XGBoost, feature engineering
- **Database:** Prisma, Turso
- **Auth:** NextAuth

## Key Results
- 87–92% model accuracy
- 0.91–0.96 ROC-AUC on production data
- 8 REST API endpoints in production use

## Setup
```bash
git clone https://github.com/Hari-Zeed/churn_prediction.git
cd churn_prediction
npm install
npm run dev
```
Configure environment variables (database URL, auth secrets) in a `.env` file before running.

## Demo
🔗 [https://churn-dashboard-kappa.vercel.app/login](https://churn-dashboard-kappa.vercel.app/login)
