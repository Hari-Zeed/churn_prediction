'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  LayoutDashboard,
  Users,
  TrendingUp,
  BarChart3,
  Settings,
  Menu,
  X,
  Brain,
  Lightbulb,
  Activity,
  IndianRupee,
  Cpu,
  Circle,
  LogOut,
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/customers', label: 'Customers', icon: Users },
  { href: '/dashboard/predictions', label: 'Predictions', icon: TrendingUp },
  { href: '/dashboard/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/dashboard/insights', label: 'AI Insights', icon: Lightbulb },
  { href: '/dashboard/revenue', label: 'Revenue Impact', icon: IndianRupee },
  { href: '/dashboard/analytics/model-eval', label: 'Model Perf.', icon: Activity },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      {/* Mobile Menu Button */}
      <div className="md:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setIsOpen(!isOpen)}
          className="border-white/10 bg-background/80 backdrop-blur-xl rounded-xl"
        >
          {isOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </Button>
      </div>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-background/70 backdrop-blur-sm md:hidden z-40"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-64 glass-dark border-r border-white/5 transition-transform duration-300 z-40 flex flex-col',
          'shadow-[4px_0_30px_rgba(0,0,0,0.3)]',
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {/* Subtle top glow */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />

        {/* Logo */}
        <div className="p-7 border-b border-white/5 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />
          <div className="flex items-center gap-3 relative group cursor-pointer">
            {/* Animated glow logo */}
            <div className="relative w-10 h-10 flex-shrink-0">
              {/* Rotating glow ring */}
              <svg className="absolute inset-0 w-full h-full animate-spin" style={{ animationDuration: '6s' }}>
                <defs>
                  <linearGradient id="logo-ring" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0" />
                    <stop offset="40%" stopColor="#8b5cf6" stopOpacity="0.8" />
                    <stop offset="60%" stopColor="#06b6d4" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <circle cx="20" cy="20" r="18" fill="none" stroke="url(#logo-ring)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
              {/* Inner */}
              <div className="absolute inset-1 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-600 flex items-center justify-center text-white font-black text-sm shadow-[0_0_20px_rgba(139,92,246,0.4)] group-hover:shadow-[0_0_30px_rgba(139,92,246,0.7)] transition-shadow duration-500">
                <Brain className="w-4 h-4" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="font-black text-lg tracking-tighter text-foreground leading-none">DataSync</span>
              <span className="text-[8px] font-black uppercase tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400 leading-none mt-0.5">
                Intelligence
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 py-6 space-y-1 scrollbar-none">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);

            return (
              <Link key={item.href} href={item.href}>
                <button
                  onClick={() => setIsOpen(false)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all duration-300 border border-transparent group/nav relative overflow-hidden',
                    'opacity-0',
                    mounted && 'opacity-100',
                    isActive
                      ? 'bg-gradient-to-r from-violet-500/15 to-cyan-500/5 text-foreground border-violet-500/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-white/5 hover:translate-x-0.5',
                  )}
                  style={{
                    transition: `opacity 0.4s ease ${idx * 50 + 200}ms, transform 0.4s ease ${idx * 50 + 200}ms, background 0.3s ease, border 0.3s ease`,
                    transform: mounted ? 'translateX(0)' : 'translateX(-8px)',
                  }}
                >
                  {/* Active left bar */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full bg-gradient-to-b from-violet-400 to-cyan-400 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
                  )}
                  {/* Shimmer on hover */}
                  <div className="absolute inset-0 -translate-x-full group-hover/nav:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/3 to-transparent pointer-events-none" />
                  <Icon className={cn('w-4 h-4 flex-shrink-0 transition-all duration-300', isActive ? 'text-violet-400' : 'group-hover/nav:scale-110')} />
                  <span className={cn('text-[10px] font-black uppercase tracking-widest', isActive ? 'opacity-100' : 'opacity-60')}>{item.label}</span>
                  {isActive && (
                    <div className="ml-auto w-1.5 h-1.5 rounded-full bg-gradient-to-r from-violet-400 to-cyan-400 shadow-[0_0_8px_rgba(139,92,246,0.8)]" />
                  )}
                </button>
              </Link>
            );
          })}
        </nav>

        {/* System Status Widget */}
        <div className="p-4 border-t border-white/5 space-y-3">
          <div className="rounded-xl bg-white/[0.03] border border-white/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-black uppercase tracking-[0.25em] text-muted-foreground/40">System Status</span>
              <span className="flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-emerald-400">
                <Circle className="w-1.5 h-1.5 fill-emerald-400 animate-pulse" />
                All Online
              </span>
            </div>
            <div className="space-y-1.5">
              {[
                { label: 'ML Model', value: 'XGBoost v17', color: 'text-violet-400', dot: 'bg-violet-400' },
                { label: 'Database', value: 'SQLite', color: 'text-cyan-400', dot: 'bg-cyan-400' },
                { label: 'API', value: '12ms',  color: 'text-emerald-400', dot: 'bg-emerald-400' },
              ].map(s => (
                <div key={s.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('w-1 h-1 rounded-full', s.dot)} />
                    <span className="text-[9px] font-bold text-muted-foreground/50 uppercase tracking-widest">{s.label}</span>
                  </div>
                  <span className={cn('text-[9px] font-black tabular-nums', s.color)}>{s.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Sign out */}
          <Button
            variant="ghost"
            className="w-full text-muted-foreground/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all rounded-xl border border-transparent hover:border-rose-500/15 font-black text-[9px] uppercase tracking-[0.25em] gap-2 h-9"
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            <LogOut className="w-3.5 h-3.5" />
            Shutdown
          </Button>
        </div>
      </aside>
    </>
  );
}
