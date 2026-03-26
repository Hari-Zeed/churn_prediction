'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  Brain, Database, Activity, RefreshCcw, Save,
  User, Building, MonitorSmartphone, Upload, Sparkles,
  CheckCircle2, AlertCircle, Cpu, ShieldCheck,
} from 'lucide-react';
import { triggerRetrain } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export default function SettingsPage() {
  const [retraining, setRetraining] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [settings, setSettings] = useState({
    theme: 'dark',
    confidenceThreshold: 0.75,
    autoTrainEnabled: true,
    dataRefreshInterval: '24h',
  });

  const [profile, setProfile] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    title: '',
    department: '',
    twoFactor: false,
  });

  // Fetch initial data
  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setProfile({
            firstName: data.profile?.firstName || '',
            lastName: data.profile?.lastName || '',
            email: data.user?.email || '',
            phone: data.profile?.phone || '',
            title: data.profile?.title || '',
            department: data.profile?.department || '',
            twoFactor: data.profile?.twoFactor || false,
          });
          setSettings({
            theme: data.settings?.theme || 'dark',
            confidenceThreshold: data.settings?.confidenceThreshold ?? 0.75,
            autoTrainEnabled: data.settings?.autoTrainEnabled ?? true,
            dataRefreshInterval: data.settings?.dataRefreshInterval || '24h',
          });
        }
      } catch (err) {
        toast.error('Failed to load settings data');
      } finally {
        setLoadingInitial(false);
      }
    }
    loadData();
  }, []);

  const applyTheme = (t: string) => {
    if (t === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else if (t === 'light') {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
      localStorage.removeItem('theme');
    }
  };

  const handleThemeChange = async (t: string) => {
    setSettings((prev) => ({ ...prev, theme: t }));
    applyTheme(t);
    // Persist immediately
    try {
      await fetch('/api/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...settings, theme: t }),
      });
      toast.success(`Theme changed to ${t}`);
    } catch {
      toast.error('Failed to save theme');
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileSaved(false);
    try {
      const res = await fetch('/api/settings/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      });
      if (res.ok) {
        toast.success('Profile Updated', { description: 'Your personal information has been saved.' });
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 3000);
      } else {
        toast.error('Error', { description: 'Failed to update profile.' });
      }
    } catch {
      toast.error('Error', { description: 'Network error updating profile.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleSaveSystem = async () => {
    setSavingSettings(true);
    try {
      const res = await fetch('/api/settings/system', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        toast.success('System Configuration Saved', { description: 'Global parameters updated successfully.' });
        if (settings.theme === 'dark') {
          document.documentElement.classList.add('dark');
          localStorage.setItem('theme', 'dark');
        } else if (settings.theme === 'light') {
          document.documentElement.classList.remove('dark');
          localStorage.setItem('theme', 'light');
        } else {
          if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          localStorage.removeItem('theme');
        }
      } else {
        toast.error('Error', { description: 'Failed to update system settings.' });
      }
    } catch {
      toast.error('Error', { description: 'Network error.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRetrain = () => {
    if (retraining) return;
    setRetraining(true);
    setLogs([]);

    const eventSource = new EventSource('/api/retrain/stream');

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.log) {
          setLogs((prev) => [...prev, data.log]);
        }
        if (data.success !== undefined) {
          if (data.success) {
            toast.success('ML Model Retrained', { description: 'XGBoost model weights updated.' });
          } else {
            toast.error('Pipeline Error', { description: data.error || 'Failed to retrain model.' });
          }
          eventSource.close();
          setRetraining(false);
        }
      } catch (e) {
        console.error('Failed to parse SSE data', e);
      }
    };

    eventSource.onerror = (err) => {
      setLogs((prev) => [...prev, '❌ Connection to ML Control Node lost.']);
      toast.error('Stream Interrupted', { description: 'Lost connection to the backend.' });
      eventSource.close();
      setRetraining(false);
    };
  };

  if (loadingInitial) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-muted-foreground animate-pulse">Loading workspace...</p>
        </div>
      </div>
    );
  }

  const tabVariants: any = {
    hidden: { opacity: 0, y: 15, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 300, damping: 30 } },
    exit: { opacity: 0, scale: 0.95, transition: { duration: 0.15 } },
  };

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'User';
  const initials = [profile.firstName?.[0], profile.lastName?.[0]].filter(Boolean).join('').toUpperCase() || 'U';

  return (
    <div className="space-y-10 pb-20 min-h-screen">
      {/* ── Page Header ─────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div className="space-y-1.5">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
            <Badge className="bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 text-[9px] font-black uppercase tracking-[0.3em] rounded-full h-5 px-3">
              Admin
            </Badge>
          </div>
          <p className="text-sm font-medium text-muted-foreground/70">
            Manage your account profile and ML pipeline configuration.
          </p>
        </div>
        <div className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[9px] font-black text-emerald-400 uppercase tracking-widest">System Online</span>
        </div>
      </motion.div>

      {/* ── Tabs ─────────────────────────────────────── */}
      <Tabs defaultValue="profile" className="w-full">
        <div className="border-b border-border/40 pb-4 mb-8">
          <TabsList className="bg-transparent h-auto p-0 gap-8">
            <TabsTrigger
              value="profile"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground text-muted-foreground font-bold text-sm uppercase tracking-widest border-b-2 border-transparent data-[state=active]:border-cyan-500 rounded-none pb-3 px-0 transition-all hover:text-foreground"
            >
              <User className="w-4 h-4 mr-2" /> My Profile
            </TabsTrigger>
            <TabsTrigger
              value="system"
              className="data-[state=active]:bg-transparent data-[state=active]:shadow-none data-[state=active]:text-foreground text-muted-foreground font-bold text-sm uppercase tracking-widest border-b-2 border-transparent data-[state=active]:border-violet-500 rounded-none pb-3 px-0 transition-all hover:text-foreground"
            >
              <Database className="w-4 h-4 mr-2" /> System &amp; ML
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="relative">
          <AnimatePresence mode="wait">

            {/* ═══════════════════════════════════════════
                TAB 1 — MY PROFILE
            ═══════════════════════════════════════════ */}
            <TabsContent key="profile-tab" value="profile" asChild forceMount>
              <motion.div variants={tabVariants} initial="hidden" animate="visible" exit="exit" className="outline-none">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                  {/* ── Main form ──────────────────────────── */}
                  <div className="lg:col-span-2 space-y-6">
                    <Card className="glass premium-shadow overflow-hidden border-white/5">
                      <CardHeader className="border-b border-border/20 bg-white/[0.02] pb-5">
                        <CardTitle className="text-base font-bold flex items-center gap-2.5">
                          <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                            <User className="w-4 h-4 text-cyan-400" />
                          </div>
                          Personal Information
                          {profileSaved && (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                              className="ml-auto flex items-center gap-1.5 text-[10px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-full uppercase tracking-widest"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Saved
                            </motion.span>
                          )}
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground/60">
                          Update your name, role, and department. All changes are persisted to the database.
                        </CardDescription>
                      </CardHeader>

                      <CardContent className="pt-8 space-y-8">
                        {/* Avatar row */}
                        <div className="flex items-center gap-6 p-5 rounded-2xl border border-white/5 bg-white/[0.02]">
                          <div className="relative flex-shrink-0">
                            <Avatar className="w-20 h-20 border-2 border-white/10 shadow-xl transition-all duration-300">
                              <AvatarImage src={`https://api.dicebear.com/7.x/notionists/svg?seed=${profile.firstName || 'user'}`} alt="Avatar" />
                              <AvatarFallback className="bg-gradient-to-br from-cyan-600 to-violet-600 text-white text-2xl font-black">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                            {/* Online dot */}
                            <span className="absolute bottom-0.5 right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-background rounded-full shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-base text-foreground truncate">{displayName}</p>
                            <p className="text-xs text-muted-foreground truncate">{profile.email}</p>
                          </div>
                        </div>

                        {/* Name row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">First Name</Label>
                            <Input
                              value={profile.firstName}
                              onChange={(e) => setProfile({ ...profile, firstName: e.target.value })}
                              placeholder="e.g. Hari"
                              className="h-12 bg-white/[0.03] border-white/10 focus-visible:ring-cyan-500/30 focus-visible:border-cyan-500/50 rounded-xl transition-all"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Last Name</Label>
                            <Input
                              value={profile.lastName}
                              onChange={(e) => setProfile({ ...profile, lastName: e.target.value })}
                              placeholder="e.g. Sharma"
                              className="h-12 bg-white/[0.03] border-white/10 focus-visible:ring-cyan-500/30 focus-visible:border-cyan-500/50 rounded-xl transition-all"
                            />
                          </div>
                        </div>

                        {/* Role & Department */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Job Title</Label>
                            <div className="relative">
                              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                              <Input
                                value={profile.title}
                                onChange={(e) => setProfile({ ...profile, title: e.target.value })}
                                placeholder="e.g. Data Scientist"
                                className="pl-10 h-12 bg-white/[0.03] border-white/10 focus-visible:ring-cyan-500/30 focus-visible:border-cyan-500/50 rounded-xl transition-all"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Department</Label>
                            <div className="relative">
                              <Building className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
                              <Input
                                value={profile.department}
                                onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                                placeholder="e.g. Analytics"
                                className="pl-10 h-12 bg-white/[0.03] border-white/10 focus-visible:ring-cyan-500/30 focus-visible:border-cyan-500/50 rounded-xl transition-all"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Email — read only */}
                        <div className="space-y-2">
                          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Email Address <span className="text-muted-foreground/40 normal-case tracking-normal font-medium">(linked to account)</span></Label>
                          <div className="h-12 px-4 flex items-center rounded-xl border border-white/5 bg-white/[0.015] text-sm text-muted-foreground font-mono select-none cursor-not-allowed">
                            {profile.email || '—'}
                          </div>
                        </div>

                        {/* Interface Theme */}
                        <div className="pt-4 border-t border-border/10 space-y-4">
                          <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Interface Theme</Label>
                          <div className="grid grid-cols-3 gap-3">
                            {(['dark', 'light', 'system'] as const).map((t) => (
                              <button
                                key={t}
                                onClick={() => handleThemeChange(t)}
                                className={cn(
                                  'flex flex-col items-center justify-center gap-2 p-4 rounded-xl border transition-all text-xs font-black capitalize',
                                  settings.theme === t
                                    ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.1)] ring-1 ring-cyan-500/20'
                                    : 'border-white/5 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.04] hover:border-white/10'
                                )}
                              >
                                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', settings.theme === t ? 'bg-cyan-500/20' : 'bg-white/5')}>
                                  {t === 'dark' ? <Sparkles className="w-4 h-4" /> : t === 'light' ? <Activity className="w-4 h-4" /> : <MonitorSmartphone className="w-4 h-4" />}
                                </div>
                                {t}
                                {settings.theme === t && <CheckCircle2 className="w-3 h-3 text-cyan-400" />}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Save button */}
                        <div className="pt-6 border-t border-border/10 flex items-center justify-between">
                          <p className="text-xs text-muted-foreground/50">Changes are saved to your account database immediately.</p>
                          <Button
                            onClick={handleSaveProfile}
                            disabled={savingProfile}
                            className="gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-black uppercase tracking-widest text-[11px] h-12 px-8 rounded-xl shadow-[0_0_20px_rgba(8,145,178,0.3)] hover:shadow-[0_0_30px_rgba(8,145,178,0.5)] transition-all disabled:opacity-60"
                          >
                            {savingProfile ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {savingProfile ? 'Saving...' : 'Save Changes'}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* ── Sidebar ────────────────────────────────── */}
                  <div className="space-y-5">
                    {/* Account Summary */}
                    <Card className="glass premium-shadow overflow-hidden border-white/5 relative">
                      <div className="absolute top-0 right-0 w-28 h-28 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
                      <CardContent className="p-6 space-y-5">
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                            <ShieldCheck className="w-4 h-4 text-cyan-400" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground/60">Account Status</p>
                            <p className="font-black text-sm text-emerald-400">● Active</p>
                          </div>
                        </div>
                        <div className="space-y-3 pt-2">
                          <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                            <span className="text-xs text-muted-foreground">Role</span>
                            <span className="text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-widest border border-cyan-500/20">Administrator</span>
                          </div>
                          <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                            <span className="text-xs text-muted-foreground">Plan</span>
                            <span className="text-xs font-bold text-foreground">Enterprise</span>
                          </div>
                          <div className="flex justify-between items-center py-2.5 border-b border-white/5">
                            <span className="text-xs text-muted-foreground">Joined</span>
                            <span className="text-xs font-bold text-foreground tabular-nums">Oct 24, 2024</span>
                          </div>
                          <div className="flex justify-between items-center py-2.5">
                            <span className="text-xs text-muted-foreground">Last Login</span>
                            <span className="text-xs font-bold text-foreground tabular-nums">Today, 09:41 AM</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>


                    {/* Tips card */}
                    <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 flex gap-3">
                      <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-300/80 leading-relaxed">
                        Your email address cannot be changed as it is tied to your authentication method.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            </TabsContent>

            {/* ═══════════════════════════════════════════
                TAB 2 — SYSTEM & ML
            ═══════════════════════════════════════════ */}
            <TabsContent key="system-tab" value="system" asChild forceMount>
              <motion.div variants={tabVariants} initial="hidden" animate="visible" exit="exit" className="space-y-6 outline-none">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Pipeline Config */}
                  <Card className="glass premium-shadow overflow-hidden border-white/5">
                    <CardHeader className="border-b border-border/20 bg-white/[0.02] pb-5">
                      <CardTitle className="text-base font-bold flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20">
                          <Database className="w-4 h-4 text-violet-400" />
                        </div>
                        Pipeline Configuration
                      </CardTitle>
                      <CardDescription className="text-xs text-muted-foreground/60">Adjust global ML pipeline parameters.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-8 space-y-8">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-black uppercase tracking-widest text-foreground">Risk Confidence Threshold</Label>
                          <span className="text-xs font-black text-violet-400 bg-violet-500/10 px-2.5 py-1 rounded-lg border border-violet-500/20 tabular-nums">
                            {(settings.confidenceThreshold * 100).toFixed(0)}%
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground/60 leading-relaxed">Customers above this probability will be classified as High Risk in the dashboard.</p>
                        <Input
                          type="number"
                          min="0" max="1" step="0.05"
                          value={settings.confidenceThreshold}
                          onChange={(e) => setSettings({ ...settings, confidenceThreshold: parseFloat(e.target.value) })}
                          className="h-11 bg-white/[0.03] border-white/10 font-mono text-sm rounded-xl focus-visible:ring-violet-500/30 w-40"
                        />
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-border/10">
                        <div className="space-y-1 max-w-[70%]">
                          <Label className="text-xs font-black uppercase tracking-widest text-foreground">Automated Telemetry Sync</Label>
                          <p className="text-xs text-muted-foreground/60 leading-relaxed">Allow background workers to fetch customer telemetry automatically.</p>
                        </div>
                        <Switch
                          checked={settings.autoTrainEnabled}
                          onCheckedChange={(c) => setSettings({ ...settings, autoTrainEnabled: c })}
                          className="data-[state=checked]:bg-emerald-500"
                        />
                      </div>

                      <div className="pt-6 border-t border-border/10 flex justify-end">
                        <Button onClick={handleSaveSystem} disabled={savingSettings} className="gap-2 bg-violet-600 hover:bg-violet-500 text-white font-black uppercase tracking-widest text-[11px] h-11 px-8 rounded-xl shadow-[0_0_20px_rgba(139,92,246,0.3)] transition-all">
                          {savingSettings ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                          {savingSettings ? 'Committing...' : 'Commit Config'}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ML Control Node */}
                  <Card className="glass premium-shadow border-violet-500/20 bg-violet-500/[0.03] overflow-hidden relative group">
                    <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 to-transparent pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-700" />
                    <CardHeader className="border-b border-violet-500/15 bg-violet-500/[0.06] pb-5 relative">
                      <CardTitle className="text-base font-black uppercase tracking-widest flex items-center gap-3 text-violet-400">
                        <div className="p-1.5 rounded-lg bg-violet-500/20 border border-violet-500/30">
                          <Brain className="w-4 h-4" />
                        </div>
                        ML Control Node
                        <span className="relative flex h-2 w-2 ml-auto">
                          <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75', retraining ? 'bg-amber-400 animate-ping' : 'bg-emerald-400')} />
                          <span className={cn('relative inline-flex rounded-full h-2 w-2', retraining ? 'bg-amber-500' : 'bg-emerald-500')} />
                        </span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-8 space-y-6 relative">
                      <p className="text-xs text-foreground/70 leading-relaxed">
                        Dispatch the ML training sequence. Executes{' '}
                        <code className="bg-black/30 px-1.5 py-0.5 rounded text-violet-300 border border-violet-500/20 font-mono text-[10px]">train_model.py</code>
                        {' '}then{' '}
                        <code className="bg-black/30 px-1.5 py-0.5 rounded text-violet-300 border border-violet-500/20 font-mono text-[10px]">batch_predict.py</code>
                        {' '}to update all risk scores.
                      </p>

                      <div className="flex items-center gap-3 p-3 rounded-xl border border-white/5 bg-white/[0.02]">
                        <Cpu className="w-4 h-4 text-violet-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Model</p>
                          <p className="text-xs font-bold text-foreground">XGBoost v17 · Accuracy: 82.9%</p>
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[9px] font-black uppercase tracking-widest">Ready</Badge>
                      </div>

                      <Button
                        onClick={handleRetrain}
                        disabled={retraining}
                        className={cn(
                          'w-full h-14 font-black uppercase tracking-widest text-[11px] transition-all duration-500 rounded-xl border',
                          retraining
                            ? 'bg-muted/30 text-muted-foreground border-border/30'
                            : 'bg-violet-600 text-white border-violet-500 shadow-[0_0_25px_rgba(139,92,246,0.35)] hover:bg-violet-500 hover:scale-[1.02] hover:shadow-[0_0_40px_rgba(139,92,246,0.55)]'
                        )}
                      >
                        {retraining ? (
                          <div className="flex items-center gap-2 text-violet-300">
                            <RefreshCcw className="w-4 h-4 animate-spin" />
                            Processing Neural Weights...
                          </div>
                        ) : 'Force Retrain Pipeline'}
                      </Button>

                      {logs.length > 0 && (
                        <div className="bg-black/40 rounded-xl border border-white/5 p-4 space-y-2 h-44 overflow-y-auto font-mono text-[10px] shadow-inner">
                          {logs.map((log, i) => {
                            const isSuccess = log.includes('✅');
                            const isError = log.includes('❌');
                            return (
                              <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} key={i} className="flex gap-2.5">
                                <span className="text-violet-500/40 flex-shrink-0">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
                                <span className={cn('text-muted-foreground leading-relaxed', isSuccess && 'text-emerald-400 font-bold', isError && 'text-rose-400 font-bold')}>{log}</span>
                              </motion.div>
                            );
                          })}
                          {retraining && (
                            <div className="flex gap-2.5 text-violet-400">
                              <span className="opacity-40 flex-shrink-0">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
                              <span className="animate-pulse">Awaiting pipeline stdout...</span>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            </TabsContent>

          </AnimatePresence>
        </div>
      </Tabs>
    </div>
  );
}
