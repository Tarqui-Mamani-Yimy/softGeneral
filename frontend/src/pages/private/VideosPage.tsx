import React from 'react';

export const VideosPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Video Job Processing</h2>
        <p className="text-sm text-slate-400">
          Upload recorded match footage (.mp4, .avi) for asynchronous computer vision analysis and report generation.
        </p>
      </div>

      <div className="rounded-lg border-2 border-dashed border-slate-700 bg-slate-950 p-8 text-center">
        <div className="mx-auto flex max-w-sm flex-col items-center justify-center space-y-3">
          <div className="rounded-full bg-slate-800 p-3 text-slate-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <p className="text-sm font-medium text-slate-300">Upload video for pipeline analysis</p>
          <p className="text-xs text-slate-500">Drag and drop or select files to process</p>
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-950 p-6">
        <h3 className="text-base font-semibold text-white">Processing Queue</h3>
        <p className="mt-4 text-center text-xs text-slate-500">No active video processing jobs.</p>
      </div>
    </div>
  );
};
