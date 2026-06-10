'use client';

import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { GoogleAuthProvider, User, onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';
import { Target } from 'lucide-react';
import { auth } from '@/lib/firebase';

export default function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => setLoading(false), 2500);
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      window.clearTimeout(timeout);
      setUser(currentUser);
      setLoading(false);
    });
    return () => {
      window.clearTimeout(timeout);
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = async () => {
    setError('');
    setNotice('');
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Google sign-in failed.');
    }
  };

  const submitEmail = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Email sign-in failed.');
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setError('Enter your email first.');
      return;
    }
    setError('');
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setNotice('Password reset email sent.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Password reset failed.');
    }
  };

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#030712] text-slate-100">
        <div className="rounded border border-cyan-300/30 bg-cyan-300/10 px-5 py-4 text-xs font-bold uppercase tracking-[0.2em] text-cyan-100">
          Verifying access
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#030712] px-4 text-slate-100">
        <div className="w-full max-w-md rounded border border-white/10 bg-slate-950/90 p-5 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded border border-cyan-300/40 bg-cyan-300/10 text-cyan-200">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white">AutoNateAI Opportunities</h1>
              <p className="text-xs text-slate-400">Sign in to load regional chamber intelligence.</p>
            </div>
          </div>

          <button onClick={signInWithGoogle} className="mt-5 w-full rounded border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm font-bold text-cyan-100 transition hover:bg-cyan-300/15">
            Continue with Google
          </button>

          <form onSubmit={submitEmail} className="mt-4 space-y-3">
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="Email" className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/50" />
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="Password" className="w-full rounded border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-cyan-300/50" />
            <button type="submit" className="w-full rounded bg-white px-4 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-cyan-100">
              Sign in
            </button>
          </form>

          <button onClick={resetPassword} className="mt-3 text-xs text-slate-400 hover:text-cyan-100">
            Send password reset
          </button>
          {error && <div className="mt-3 rounded border border-red-400/30 bg-red-400/10 p-2 text-xs text-red-100">{error}</div>}
          {notice && <div className="mt-3 rounded border border-emerald-400/30 bg-emerald-400/10 p-2 text-xs text-emerald-100">{notice}</div>}
        </div>
      </main>
    );
  }

  return children;
}
