import React from 'react';

export const CamerasPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Camera Streams</h2>
        <p className="text-sm text-slate-400">
          Live stadium surveillance camera feeds and zone monitoring.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((camId) => (
          <div key={camId} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
            <div className="aspect-video w-full rounded bg-slate-900 flex items-center justify-center border border-slate-800">
              <span className="text-xs text-slate-500 font-mono">Stream Offline (RTSP / MediaMTX)</span>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-medium text-white">Camera #{camId}</h4>
                <p className="text-xs text-slate-400">Zone placeholder</p>
              </div>
              <span className="h-2 w-2 rounded-full bg-slate-600" title="Offline" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
