'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock, ArrowRight, BarChart2, CheckCircle2, AlertCircle } from 'lucide-react';

import { Suspense } from 'react';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);


  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast({
          title: 'Sign in failed',
          description: 'The email or password you entered is incorrect.',
          variant: 'destructive',
        });
        setIsLoading(false);
      } else {
        toast({
          title: 'Welcome back!',
          description: 'You have successfully signed in.',
        });
        router.push('/dashboard');
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };



  const fillDemo = async () => {
    setIsLoading(true);
    toast({
      title: 'Loading demo profile…',
      description: 'Signing you in automatically.',
    });

    try {
      const result = await signIn('credentials', {
        email: 'demo@datasync.app',
        password: 'Demo@1234',
        redirect: false,
      });

      if (result?.error) {
        toast({
          title: 'Demo sign in failed',
          description: 'Could not sign in with demo credentials. Please try manually.',
          variant: 'destructive',
        });
        setEmail('demo@datasync.app');
        setPassword('Demo@1234');
        setIsLoading(false);
      } else {
        toast({
          title: 'Welcome to the demo!',
          description: 'Redirecting you to the dashboard…',
        });
        router.push('/dashboard');
      }
    } catch {
      toast({
        title: 'Error',
        description: 'An unexpected error occurred.',
        variant: 'destructive',
      });
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#030712] selection:bg-indigo-500/30">
      {/* Left panel - Premium visuals */}
      <div className="hidden lg:flex lg:w-3/5 relative bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81] flex-col items-center justify-center p-16 overflow-hidden border-r border-white/5">
        {/* Animated background elements */}
        <div className="absolute top-[-20%] left-[-10%] w-[80%] h-[80%] bg-indigo-600/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-purple-600/20 rounded-full blur-[100px]" />
        
        {/* Abstract Data Mesh */}
        <div className="absolute inset-0 opacity-20 pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

        <div className="relative z-10 w-full max-w-lg">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 mb-8 shadow-2xl">
            <BarChart2 className="w-7 h-7 text-indigo-400" />
          </div>
          
          <h1 className="text-5xl font-extrabold text-white tracking-tight leading-[1.1] mb-6">
            Intelligent Analytics <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">Simplified.</span>
          </h1>
          
          <p className="text-indigo-100/70 text-xl leading-relaxed mb-12">
            Harness the power of enterprise-grade data synchronization and predictive modeling in one seamless dashboard.
          </p>

          <div className="space-y-6">
            {[
              "Real-time customer churn prediction",
              "Automated data pipeline synchronization",
              "Interactive global revenue insights"
            ].map((feature, idx) => (
              <div key={idx} className="flex items-center gap-4 text-indigo-100/80">
                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                  <CheckCircle2 className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-lg font-medium">{feature}</span>
              </div>
            ))}
          </div>

          <div className="mt-16 pt-12 border-t border-white/10 grid grid-cols-2 gap-8">
            <div>
              <div className="text-3xl font-bold text-white">99.9%</div>
              <div className="text-indigo-200/50 text-sm mt-1 uppercase tracking-wider font-semibold">Uptime SLA</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-white">2k+</div>
              <div className="text-indigo-200/50 text-sm mt-1 uppercase tracking-wider font-semibold">Active Nodes</div>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel – Login form */}
      <div className="flex-1 flex items-center justify-center px-8 lg:px-16 py-12 bg-background/50 backdrop-blur-3xl relative">
        <div className="w-full max-w-[420px] space-y-10">
          <header className="space-y-3">
            <div className="flex items-center gap-3 lg:hidden mb-8">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/20">
                <BarChart2 className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-foreground">DataSync</span>
            </div>
            <h2 className="text-4xl font-bold tracking-tight text-foreground">Get started</h2>
            <p className="text-muted-foreground text-lg">Enter your details to access your workspace.</p>
          </header>

          <div className="space-y-6">


            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-foreground/80">Work Email</label>
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-indigo-500 transition-colors" />
                  <Input
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-11 h-12 bg-input/50 border-border rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-foreground/80">Secret Password</label>
                  <Link href="#" className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">Forgot password?</Link>
                </div>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-indigo-500 transition-colors" />
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-11 pr-12 h-12 bg-input/50 border-border rounded-xl focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                size="lg"
                disabled={isLoading}
                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[16px] flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-xl shadow-indigo-600/20 disabled:opacity-70"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    Sign In to Portal
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </Button>
            </form>
          </div>

          <div className="space-y-6 pt-4">
            <div className="p-4 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-4">
              <AlertCircle className="w-5 h-5 text-indigo-400 mt-0.5" />
              <div className="space-y-2 flex-1">
                <p className="text-sm font-medium text-indigo-200/90 leading-relaxed">
                  Fast-track your experience by using our developer demo credentials.
                </p>
                <button
                  type="button"
                  onClick={fillDemo}
                  className="text-xs font-bold text-indigo-400 hover:text-indigo-300 underline underline-offset-4 tracking-wider"
                >
                  LOAD DEMO PROFILE
                </button>
              </div>
            </div>

            <p className="text-center text-sm text-muted-foreground">
              New to the platform?{' '}
              <Link href="/signup" className="text-white hover:text-indigo-400 font-bold transition-colors">
                Create free account
              </Link>
            </p>
          </div>

          {/* Footer branding */}
          <footer className="pt-8 text-center text-[10px] text-muted-foreground/40 font-medium uppercase tracking-[0.2em]">
            &copy; 2026 DataSync Intelligence Labs. All rights reserved.
          </footer>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#030712]">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
