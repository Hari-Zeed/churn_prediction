'use client';

import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatINR } from "@/lib/currency";
import { formatNumber } from "@/lib/utils/format";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";

export interface ChurnRowData {
  id: string;
  tenure: number;
  monthlyCharges: number;
  contractType: string;
  churnRisk: number;
}

interface ChurnRiskTableProps {
  data: ChurnRowData[];
  className?: string;
  isLoading?: boolean;
}

export function ChurnRiskTable({ data, className, isLoading }: ChurnRiskTableProps) {
  
  if (isLoading) {
    return (
      <div className="w-full h-64 flex items-center justify-center bg-card/50 backdrop-blur-xl rounded-xl border border-white/5">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground animate-pulse">Running Predictions...</span>
        </div>
      </div>
    );
  }

  const getRiskColor = (risk: number) => {
    if (risk > 70) return 'text-red-500 bg-red-500/10 border-red-500/20';
    if (risk >= 30) return 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    return 'text-green-500 bg-green-500/10 border-green-500/20';
  };

  const getRiskIcon = (risk: number) => {
    if (risk > 70) return <AlertCircle className="w-3.5 h-3.5 mr-1.5" />;
    if (risk >= 30) return <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />;
    return <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />;
  };

  const getRiskLabel = (risk: number) => {
    if (risk > 70) return 'HIGH';
    if (risk >= 30) return 'MEDIUM';
    return 'LOW';
  };

  return (
    <div className={cn("w-full overflow-hidden rounded-xl border border-white/5 bg-card/60 backdrop-blur-xl glass premium-shadow", className)}>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader className="bg-muted/30">
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Customer ID</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Tenure (Months)</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Monthly Charges</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground">Contract Type</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground text-right">Risk %</TableHead>
              <TableHead className="font-bold text-[10px] uppercase tracking-widest text-muted-foreground text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground text-sm font-medium">
                  No churn data available.
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, i) => (
                <TableRow key={row.id || `row-${i}`} className="border-border/40 hover:bg-muted/20 transition-colors group">
                  <TableCell className="font-mono text-xs font-bold text-foreground/80 group-hover:text-primary transition-colors">
                    {row.id}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-muted-foreground">
                    {row.tenure}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-foreground">
                    {formatINR(row.monthlyCharges)}
                  </TableCell>
                  <TableCell className="text-sm">
                    <span className="px-2 py-1 rounded-md text-[10px] font-bold bg-muted/50 border border-white/5 text-muted-foreground uppercase">
                        {row.contractType}
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-black text-sm">
                    {formatNumber(row.churnRisk, 2)}%
                  </TableCell>
                  <TableCell className="text-center">
                    <span className={cn(
                      "inline-flex items-center px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border",
                      getRiskColor(row.churnRisk)
                    )}>
                      {getRiskIcon(row.churnRisk)}
                      {getRiskLabel(row.churnRisk)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
