'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import Field from '@/components/Field';

const errorMessages = {
  not_allowed: "This email isn't authorized to access this CRM. Ask an admin to add it to the allowlist.",
  google_failed: 'Something went wrong signing in with Google. Please try again.',
  server_error: 'Something went wrong on our end. Please try again.',
};

export default function Login() {
  const { login, signup } = useAuth();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    api.getAuthConfig().then((c) => setGoogleEnabled(c.googleEnabled));
  }, []);

  useEffect(() => {
    const oauthError = searchParams.get('error');
    if (oauthError) setError(errorMessages[oauthError] || 'Sign-in failed. Please try again.');
  }, [searchParams]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await signup(form.name, form.email, form.password);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="w-9 h-9 rounded bg-ledger flex items-center justify-center font-display text-lg font-semibold text-white">
            L
          </div>
          <div>
            <p className="font-display text-lg leading-tight tracking-tight">Ledgerline</p>
            <p className="text-[11px] text-ink-muted leading-tight tracking-wide uppercase">CRM</p>
          </div>
        </div>

        <div className="index-card rounded-lg p-6 animate-fade-in">
          <h1 className="font-display text-xl mb-4">{mode === 'login' ? 'Sign in' : 'Create an account'}</h1>

          {error && (
            <p className="text-sm text-brick bg-brick-soft rounded-md px-3 py-2 mb-4">{error}</p>
          )}

          {googleEnabled && (
            <>
              <a
                href="/api/auth/google"
                className="flex items-center justify-center gap-2 w-full border border-black/10 bg-card text-sm py-2 rounded-md hover:bg-paper transition-colors"
              >
                <GoogleIcon className="w-4 h-4" />
                Continue with Google
              </a>
              <div className="flex items-center gap-3 my-4">
                <div className="h-px bg-black/10 flex-1" />
                <span className="text-xs text-ink-muted">or</span>
                <div className="h-px bg-black/10 flex-1" />
              </div>
            </>
          )}

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="input"
                  required
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input"
                required
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input"
                minLength={mode === 'signup' ? 8 : undefined}
                required
              />
            </Field>
            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-ledger text-white text-sm py-2 rounded-md hover:bg-ledger/90 transition-colors mt-2 disabled:opacity-60"
            >
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="text-xs text-ink-muted text-center mt-4">
            {mode === 'login' ? (
              <>
                Need an account?{' '}
                <button onClick={() => { setMode('signup'); setError(null); }} className="text-ledger hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{' '}
                <button onClick={() => { setMode('login'); setError(null); }} className="text-ledger hover:underline">
                  Sign in
                </button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function GoogleIcon(props) {
  return (
    <svg viewBox="0 0 20 20" {...props}>
      <path fill="#4285F4" d="M19.6 10.23c0-.68-.06-1.36-.18-2H10v3.79h5.4a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.75 2.97-4.32 2.97-7.31z" />
      <path fill="#34A853" d="M10 20c2.7 0 4.96-.89 6.62-2.42l-3.23-2.5c-.9.6-2.05.95-3.39.95-2.6 0-4.8-1.76-5.59-4.12H1.06v2.58A10 10 0 0 0 10 20z" />
      <path fill="#FBBC05" d="M4.41 11.9a6 6 0 0 1 0-3.8V5.52H1.06a10 10 0 0 0 0 8.96l3.35-2.58z" />
      <path fill="#EA4335" d="M10 3.98c1.47 0 2.79.5 3.83 1.5l2.87-2.87A9.6 9.6 0 0 0 10 0 10 10 0 0 0 1.06 5.52L4.41 8.1C5.2 5.74 7.4 3.98 10 3.98z" />
    </svg>
  );
}
