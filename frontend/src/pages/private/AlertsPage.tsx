import React from 'react';

export const AlertsPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Security Alerts</h2>
        <p className="text-sm text-slate-400">
          Real-time incident detection feed. Review captured footage and confirm or mark false alarms.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <h3 className="text-base font-semibold text-white">Alert Queue (Live Stream)</h3>
          <span className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-400">
            WebSocket Connected (Placeholder)
          </span>
        </div>

        <div className="mt-8 text-center py-12">
          <p className="text-sm text-slate-400">No active alerts reported.</p>
          <p className="mt-1 text-xs text-slate-500">
            Detections for pitch intruders, weapons, smoke/fire, or violent altercations will appear here with snapshot and clip reviews.
          </p>
        </div>
      </div>
    </div>
  );
};
