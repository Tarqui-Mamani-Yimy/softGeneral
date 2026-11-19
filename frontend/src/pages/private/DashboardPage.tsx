import React, { useEffect, useState } from 'react';
import { getHealth, HealthResponse } from '../../services/apiClient';

export const DashboardPage: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    getHealth()
      .then((data) => setHealth(data))
      .catch((err: Error) => setHealthError(err.message));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Dashboard Overview</h2>
        <p className="text-sm text-slate-400">
          Real-time stadium vision monitoring summary and system health.
        </p>
      </div>

      {/* Backend API Connectivity Status */}
      <section className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">
          Backend API Connection
        </h3>
        <div className="mt-2 text-sm">
          {health ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span>Connected: Status {health.status}</span>
            </div>
          ) : healthError ? (
            <div className="flex items-center gap-2 text-amber-400">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span>Offline / Unreachable ({healthError})</span>
            </div>
          ) : (
            <div className="text-slate-500">Checking backend health...</div>
          )}
        </div>
      </section>

      {/* Overview Cards Placeholder */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="text-xs uppercase text-slate-400">Active Cameras</div>
          <div className="mt-2 text-2xl font-semibold text-white">0</div>
          <div className="mt-1 text-xs text-slate-500">RTSP Stream feeds</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="text-xs uppercase text-slate-400">Pending Alerts</div>
          <div className="mt-2 text-2xl font-semibold text-amber-400">0</div>
          <div className="mt-1 text-xs text-slate-500">Awaiting guard confirmation</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="text-xs uppercase text-slate-400">Video Jobs</div>
          <div className="mt-2 text-2xl font-semibold text-white">0</div>
          <div className="mt-1 text-xs text-slate-500">Uploaded files processing</div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="text-xs uppercase text-slate-400">AI Detection Models</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-400">4 Active</div>
          <div className="mt-1 text-xs text-slate-500">Football, Weapons, Fire, Fights</div>
        </div>
      </div>
    </div>
  );
};
