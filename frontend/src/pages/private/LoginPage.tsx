import React from 'react';
import { Link } from 'react-router-dom';

export const LoginPage: React.FC = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold tracking-tight text-emerald-400">softGeneral</h1>
          <p className="text-sm text-slate-400">Stadium Computer Vision Assistant</p>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="username" className="block text-xs font-medium text-slate-300">
              Username or Badge ID
            </label>
            <input
              id="username"
              type="text"
              disabled
              placeholder="guard_operator_01"
              className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 placeholder-slate-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-medium text-slate-300">
              Password
            </label>
            <input
              id="password"
              type="password"
              disabled
              placeholder="••••••••••••"
              className="mt-1 block w-full rounded border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-300 placeholder-slate-500 cursor-not-allowed"
            />
          </div>

          <div className="rounded border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300">
            Authentication placeholder: JWT auth integration with backend RBAC roles (guard, admin) will be wired in upcoming tasks.
          </div>

          <Link
            to="/dashboard"
            className="flex w-full justify-center rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Enter Console (Bypass Placeholder)
          </Link>
        </div>
      </div>
    </div>
  );
};
