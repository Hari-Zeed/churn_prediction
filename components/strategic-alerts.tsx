'use client';

import { AlertTriangle, PhoneCall, Tag, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Customer } from '@/lib/customer-data';

interface Alert {
  title: string;
  subtitle: string;
  risk: string;
  action: string;
  severity: 'critical' | 'high' | 'medium';
  icon: typeof AlertTriangle;
}

function deriveAlerts(customers: Customer[]): Alert[] {
  const alerts: Alert[] = [];

  const mmCount = customers.filter(
    (c) => c.contractType === 'Month-to-month' && c.churnProbability > 0.6,
  ).length;
  if (mmCount > 0) {
    alerts.push({
      title: 'Month-to-Month Attrition Risk',
      subtitle: `${mmCount} customers at elevated risk`,
      risk: '87%',
      action: 'Offer loyalty discount or upgrade incentive',
      severity: 'critical',
      icon: AlertTriangle,
    });
  }

  const highValueNewCount = customers.filter(
    (c) => c.tenure < 6 && c.monthlyCharges > 10000,
  ).length;
  if (highValueNewCount > 0) {
    alerts.push({
      title: 'High-Value / Low-Tenure Segment',
      subtitle: `${highValueNewCount} premium customers with short tenure`,
      risk: '74%',
      action: 'Schedule proactive technical check-in',
      severity: 'high',
      icon: PhoneCall,
    });
  }

  const escalationCount = customers.filter((c) => c.supportTickets > 3).length;
  if (escalationCount > 0) {
    alerts.push({
      title: 'Support Escalation Cohort',
      subtitle: `${escalationCount} customers with 3+ unresolved tickets`,
      risk: '62%',
      action: 'Escalate to dedicated account manager',
      severity: 'medium',
      icon: Tag,
    });
  }

  return alerts;
}

const SEVERITY_STYLES = {
  critical: {
    border: 'border-red-500/30',
    bg: 'bg-red-500/5',
    badge: 'bg-red-500/10 text-red-400 border-red-500/20',
    icon: 'text-red-500',
    dot: 'bg-red-400',
  },
  high: {
    border: 'border-orange-500/30',
    bg: 'bg-orange-500/5',
    badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
    icon: 'text-orange-500',
    dot: 'bg-orange-400',
  },
  medium: {
    border: 'border-yellow-500/30',
    bg: 'bg-yellow-500/5',
    badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
    icon: 'text-yellow-500',
    dot: 'bg-yellow-400',
  },
};

interface StrategicAlertsProps {
  customers: Customer[];
}

export function StrategicAlerts({ customers }: StrategicAlertsProps) {
  const alerts = deriveAlerts(customers);

  return (
    <div className="space-y-4">
      {alerts.map((alert, i) => {
        const s = SEVERITY_STYLES[alert.severity];
        const Icon = alert.icon;
        return (
          <div
            key={i}
            className={cn(
              'rounded-2xl border p-5 transition-all duration-300 hover:scale-[1.01] cursor-default',
              s.border,
              s.bg,
            )}
          >
            <div className="flex items-start gap-4">
              <div className={cn('p-2 rounded-xl mt-0.5', `bg-${alert.severity === 'critical' ? 'red' : alert.severity === 'high' ? 'orange' : 'yellow'}-500/10`)}>
                <Icon className={cn('w-4 h-4', s.icon)} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <h4 className="text-sm font-bold text-foreground leading-tight">
                    {alert.title}
                  </h4>
                  <span className={cn('text-[10px] font-black px-2 py-0.5 rounded-full border whitespace-nowrap', s.badge)}>
                    Risk: {alert.risk}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{alert.subtitle}</p>
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <ArrowRight className="w-3 h-3" />
                  <span>{alert.action}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
