'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchPredictions, type Customer } from '@/lib/api-client';
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle, 
  Users, 
  TrendingDown, 
  IndianRupee, 
  MoreVertical,
  Filter,
  Eye,
  ShieldAlert,
  Zap,
  ArrowUpDown
} from 'lucide-react';
import { 
  Dialog, 
  DialogContent, 
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/utils/format';
import { formatINR, formatINRCompact } from '@/lib/currency';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  // Filtering & Sorting
  const [filterRisk, setFilterRisk] = useState<string | undefined>(undefined);
  const [sortField, setSortField] = useState('churnProbability');
  const [sortOrder, setSortOrder] = useState('desc');
  const limit = 15;

  // Real data fetching
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await fetchPredictions(page, limit, filterRisk, sortField, sortOrder, searchQuery);
        setCustomers(data.data);
        setTotal(data.total);
      } finally {
        setLoading(false);
      }
    };
    
    // Add debounce for search query
    const timeoutId = setTimeout(() => {
      loadData();
    }, 300);
    
    return () => clearTimeout(timeoutId);
  }, [page, filterRisk, sortField, sortOrder, searchQuery]);

  const toggleSort = (field: string) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-10 pb-20 enterprise-gradient">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-extrabold tracking-tight text-gradient">
            Customer Intelligence
            <span className="ml-3 text-[10px] bg-primary/20 text-primary border border-primary/20 px-2.5 py-1 rounded-full uppercase font-black tracking-widest align-middle">Database</span>
          </h1>
          <p className="text-sm font-medium text-muted-foreground/80">Explore individual customer metrics powered by XGBoost churn predictions.</p>
        </div>
      </div>

      {/* Control Bar */}
      <div className="p-1 rounded-2xl glass-dark border border-white/5 shadow-2xl">
        <div className="flex flex-col md:flex-row items-center gap-2 p-1">
          <div className="relative flex-grow w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
            <Input
              placeholder="Search by Customer ID..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              className="pl-12 h-12 bg-black/20 border-white/5 rounded-xl focus:ring-1 focus:ring-primary/30 transition-all font-medium text-sm"
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto">
            <div className="flex bg-black/40 p-1 rounded-xl border border-white/5 h-12 whitespace-nowrap">
              {['All Risks', 'High', 'Medium', 'Low'].map((r) => {
                const val = r === 'All Risks' ? undefined : r;
                return (
                  <button 
                    key={r} 
                    onClick={() => { setFilterRisk(val); setPage(1); }}
                    className={cn(
                      "px-4 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
                      filterRisk === val ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                    )}
                  >
                    {r}
                  </button>
                )
              })}
            </div>
            <Button variant="outline" className="h-12 w-12 rounded-xl flex-shrink-0 border-white/5 bg-black/40 hover:bg-black/60">
              <Filter className="w-4 h-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </div>

      {/* ML Data Table */}
      <Card className="glass border-white/5 overflow-hidden shadow-2xl">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-20 flex flex-col items-center justify-center gap-4">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <div className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground animate-pulse">Querying ML Database...</div>
            </div>
          ) : customers.length === 0 ? (
            <div className="p-20 text-center space-y-4">
              <Search className="w-10 h-10 text-muted-foreground/20 mx-auto" />
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-4">No matching records found.</div>
            </div>
          ) : (
            <div className="overflow-x-auto custom-scrollbar min-h-64">
              <table className="w-full">
                <thead className="bg-white/5 border-b border-white/5">
                  <tr>
                    <th className="px-6 py-5 text-left">
                      <button onClick={() => toggleSort('id')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">
                        Customer ID <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </button>
                    </th>
                    <th className="px-6 py-5 text-left text-[10px] font-black uppercase tracking-widest text-muted-foreground">Contract</th>
                    <th className="px-6 py-5 text-left">
                      <button onClick={() => toggleSort('monthlyCharges')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">
                        Monthly Revenue <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </button>
                    </th>
                    <th className="px-6 py-5 text-left">
                      <button onClick={() => toggleSort('tenure')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">
                        Tenure (Mo) <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </button>
                    </th>
                    <th className="px-6 py-5 text-left">
                      <button onClick={() => toggleSort('churnProbability')} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">
                        ML Churn Risk <ArrowUpDown className="w-3 h-3 opacity-50" />
                      </button>
                    </th>
                    <th className="px-6 py-5 text-right text-[10px] font-black uppercase tracking-widest text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {customers.map((customer, i) => (
                    <tr 
                      key={customer.id || `row-${i}`} 
                      className="hover:bg-white/[0.02] transition-colors group cursor-pointer"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <td className="px-6 py-4">
                        <div className="text-xs font-black text-foreground group-hover:text-primary transition-colors tracking-widest uppercase">{customer.id}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{customer.contractType}</div>
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-foreground tracking-tight">{formatINR(customer.monthlyCharges)}</td>
                      <td className="px-6 py-4 text-xs font-bold text-muted-foreground">{customer.tenure}</td>
                      <td className="px-6 py-4">
                         <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black tracking-widest uppercase",
                          customer.riskLevel === 'Low' ? "bg-green-500/10 text-green-400 border-green-500/20" :
                          customer.riskLevel === 'High' ? "bg-red-500/10 text-red-500 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.1)]" :
                          "bg-orange-500/10 text-orange-400 border-orange-500/20"
                        )}>
                          {formatNumber(customer.churnProbability * 100, 1)}% ({customer.riskLevel})
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/5">
                              <MoreVertical className="w-4 h-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="glass-dark border-white/10 text-xs uppercase font-black tracking-widest min-w-[180px]">
                            <DropdownMenuLabel className="text-[9px] text-muted-foreground opacity-50">Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => setSelectedCustomer(customer)} className="flex items-center gap-2">
                                <Eye className="w-3.5 h-3.5 text-primary" /> View Analytics
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between glass p-4 rounded-2xl border-white/5 shadow-xl">
          <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Page {page} <span className="mx-2 opacity-30 text-xs">/</span> {totalPages} 
            <span className="ml-4 text-foreground/50">{total.toLocaleString()} Records</span>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className="h-9 w-9 rounded-xl border-white/5 bg-black/40 hover:bg-black/60"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className="h-9 w-9 rounded-xl border-white/5 bg-black/40 hover:bg-black/60"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Customer Modal / Profile Panel */}
      <Dialog open={!!selectedCustomer} onOpenChange={(open) => !open && setSelectedCustomer(null)}>
        <DialogContent className="sm:max-w-[700px] glass shadow-2xl border-white/10 p-0 overflow-hidden">
          <DialogTitle className="sr-only">Detailed Customer Profile</DialogTitle>
          <DialogDescription className="sr-only">Comprehensive view of customer metrics, churn risk analysis, and behavior drivers.</DialogDescription>
          {selectedCustomer && (
            <div className="flex flex-col bg-card/80 backdrop-blur-3xl p-10 space-y-8">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                    <div className="flex items-center gap-2">
                        <div className={cn(
                            "w-2 h-2 rounded-full animate-pulse",
                            selectedCustomer.riskLevel === 'Low' ? "bg-green-500" : selectedCustomer.riskLevel === 'Medium' ? "bg-orange-500" : "bg-red-500"
                        )} />
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">{selectedCustomer.contractType} Contract</span>
                    </div>
                    <h2 className="text-3xl font-black text-foreground tracking-widest uppercase">{selectedCustomer.id}</h2>
                    <p className="text-xs font-bold text-primary/80 tracking-widest uppercase">LTV: {formatINRCompact(selectedCustomer.lifetimeValue)} · Tenure: {selectedCustomer.tenure}Mo</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                    <h5 className="text-[9px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Monthly MRR</h5>
                    <p className="text-lg font-black text-foreground">{formatINR(selectedCustomer.monthlyCharges)}</p>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                    <h5 className="text-[9px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Revenue Risk</h5>
                    <p className={cn("text-lg font-black", selectedCustomer.riskLevel === 'High' ? "text-red-500" : "text-foreground")}>
                        {formatINR(selectedCustomer.predictedRevLoss)}
                    </p>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                    <h5 className="text-[9px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Avg Rating</h5>
                    <p className="text-lg font-black text-foreground">{formatNumber(selectedCustomer.avgRating, 1)} / 5</p>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                    <h5 className="text-[9px] font-black uppercase text-muted-foreground mb-1 tracking-widest">Churn Risk</h5>
                    <p className={cn("text-lg font-black", selectedCustomer.riskLevel === 'High' ? "text-red-500" : "text-green-500")}>
                        {formatNumber(selectedCustomer.churnProbability * 100, 1)}%
                    </p>
                </div>
              </div>

              <div className="space-y-4">
                <h5 className="text-[10px] font-black uppercase text-muted-foreground tracking-widest border-b border-white/5 pb-2">Behavior Drivers</h5>
                <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col bg-white/5 p-3 rounded-lg border border-white/5">
                        <span className="text-[9px] font-bold text-foreground/50 uppercase tracking-wider mb-1">Support</span>
                        <span className="text-sm font-black text-foreground">{selectedCustomer.supportCalls} calls/mo</span>
                    </div>
                    <div className="flex flex-col bg-white/5 p-3 rounded-lg border border-white/5">
                        <span className="text-[9px] font-bold text-foreground/50 uppercase tracking-wider mb-1">Discounting</span>
                        <span className="text-sm font-black text-foreground">{formatNumber(selectedCustomer.discountUsagePct * 100, 1)}% usage</span>
                    </div>
                    <div className="flex flex-col bg-white/5 p-3 rounded-lg border border-white/5">
                        <span className="text-[9px] font-bold text-foreground/50 uppercase tracking-wider mb-1">Competitor Exp</span>
                        <span className="text-sm font-black text-foreground">Level {selectedCustomer.competitorOffers}</span>
                    </div>
                </div>
              </div>

              {selectedCustomer.riskLevel === 'High' && (
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/20 space-y-2">
                    <div className="flex items-center gap-2">
                        <Zap className="w-3.5 h-3.5 text-primary" />
                        <h5 className="text-[10px] font-black uppercase text-primary tracking-widest">AI Strategic Vector</h5>
                    </div>
                    <p className="text-[11px] font-medium text-foreground/80 leading-relaxed">
                        Predicted Churn Level is CRITICAL. The system calculates {formatINR(selectedCustomer.predictedRevLoss)} is at risk of leaving the business. Given the competitor exposure and discount usage, an account rescue workflow with a retention offer is recommended immediately.
                    </p>
                  </div>
              )}

              <div className="pt-4 flex gap-3">
                <Button 
                    variant="outline" 
                    className="h-12 flex-grow border-white/10 bg-white/5 hover:bg-white/10 font-black uppercase tracking-widest text-[10px]"
                    onClick={() => setSelectedCustomer(null)}
                >
                    Dismiss
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
