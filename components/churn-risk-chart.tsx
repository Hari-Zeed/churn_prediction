'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface BinData {
  bucket: string;
  count: number;
}

interface ChurnRiskChartProps {
  data: BinData[];
}

const BUCKET_COLORS = ['#22c55e', '#84cc16', '#f59e0b', '#f97316', '#ef4444'];

export function ChurnRiskChart({ data }: ChurnRiskChartProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }}>
        <defs>
          {BUCKET_COLORS.map((color, i) => (
            <linearGradient key={i} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.9} />
              <stop offset="100%" stopColor={color} stopOpacity={0.4} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid
          vertical={false}
          stroke="rgba(255,255,255,0.06)"
          strokeDasharray="4 4"
        />
        <XAxis
          dataKey="bucket"
          stroke="rgba(255,255,255,0.3)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          dy={8}
        />
        <YAxis
          stroke="rgba(255,255,255,0.3)"
          fontSize={11}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${v}`}
        />
        <Tooltip
          cursor={{ fill: 'rgba(255,255,255,0.04)' }}
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 20px 50px rgba(0,0,0,0.4)',
          }}
          labelStyle={{ fontWeight: 'bold', fontSize: 12 }}
          formatter={(value: number) => [`${value} customers`, 'Count']}
        />
        <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={60} animationDuration={1200}>
          {data.map((_, i) => (
            <Cell key={i} fill={`url(#grad-${i})`} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
