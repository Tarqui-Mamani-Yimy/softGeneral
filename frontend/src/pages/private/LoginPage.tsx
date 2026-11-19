import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks';
import { ApiError } from '../../services/apiClient';

export const LoginPage: React.FC = () => {
  const { user, token, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, redirect to dashboard
  if (token && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ identifier, password });
      const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Invalid credentials');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-emerald-400">softGeneral</h1>
          <p className="text-sm text-slate-400">Stadium Computer Vision Assistant</p>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <div>
            <label htmlFor="login-identifier" className="block text-xs font-medium text-slate-300">
              Username or Email
            </label>
            <input
              id="login-identifier"
              name="identifier"
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              disabled={isSubmitting}
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value);
                if (error) setError(null);
              }}
              placeholder="operator or guard@example.com"
              aria-describedby={error ? 'login-error-msg' : undefined}
              className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <input
              id="login-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={isSubmitting}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (error) setError(null);
              }}
              placeholder="••••••••••••"
              aria-describedby={error ? 'login-error-msg' : undefined}
              className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
            />
          </div>

          {error && (
            <div
              id="login-error-msg"
              role="alert"
              aria-live="polite"
              className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !identifier.trim() || !password}
            className="flex w-full justify-center rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
