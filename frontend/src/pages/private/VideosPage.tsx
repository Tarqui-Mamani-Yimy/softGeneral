import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../hooks';
import {
  listVideos,
  uploadVideo,
  downloadVideoOutput,
  ApiError,
} from '../../services/apiClient';
import type { VideoJob } from '../../types/video';

const ALLOWED_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv'];

export const VideosPage: React.FC = () => {
  const { user } = useAuth();
  const canUpload = user?.permissions.includes('videos.upload') ?? false;

  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  // Upload states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Download states
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const fetchJobs = useCallback(async (isPolling = false) => {
    try {
      const data = await listVideos();
      setJobs(data);
      setJobsError(null);
    } catch (err) {
      if (!isPolling) {
        setJobsError(err instanceof ApiError ? err.detail : 'Failed to load video jobs');
      }
    } finally {
      if (!isPolling) {
        setIsLoadingJobs(false);
      }
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // Polling every 2s while any job is queued or processing
  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (job) => job.status === 'queued' || job.status === 'processing'
    );

    if (!hasActiveJobs) return;

    const intervalId = setInterval(() => {
      fetchJobs(true);
    }, 2000);

    return () => clearInterval(intervalId);
  }, [jobs, fetchJobs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadSuccess(null);
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasValidExt) {
      setUploadError('Unsupported video format. Allowed formats: .mp4, .avi, .mov, .mkv');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const newJob = await uploadVideo(selectedFile, (progress) => {
        setUploadProgress(progress);
      });

      setUploadSuccess(`Video "${newJob.original_filename}" uploaded successfully and queued for analysis.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchJobs(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setUploadError(err.detail);
      } else if (err instanceof Error) {
        setUploadError(err.message);
      } else {
        setUploadError('Upload failed. Please try again.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (job: VideoJob) => {
    setDownloadingId(job.id);
    setDownloadError(null);
    try {
      await downloadVideoOutput(job.id, job.original_filename);
    } catch (err) {
      if (err instanceof ApiError) {
        setDownloadError(`Download failed: ${err.detail}`);
      } else {
        setDownloadError('Failed to download output video');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const renderStatusBadge = (status: VideoJob['status']) => {
    switch (status) {
      case 'queued':
        return (
          <span className="inline-flex items-center rounded-full border border-amber-800 bg-amber-950 px-2.5 py-0.5 text-xs font-medium text-amber-300">
            Queued
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-800 bg-blue-950 px-2.5 py-0.5 text-xs font-medium text-blue-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" aria-hidden="true" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center rounded-full border border-emerald-800 bg-emerald-950 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center rounded-full border border-red-800 bg-red-950 px-2.5 py-0.5 text-xs font-medium text-red-300">
            Failed
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Video Job Processing</h2>
        <p className="text-sm text-slate-400">
          Upload match footage (.mp4, .avi, .mov, .mkv) for asynchronous computer vision analysis and report generation.
        </p>
      </div>

      {/* Upload card - hidden when user lacks videos.upload permission */}
      {canUpload && (
        <section aria-labelledby="upload-heading" className="rounded-lg border border-slate-800 bg-slate-950 p-6 space-y-4">
          <h3 id="upload-heading" className="text-base font-semibold text-white">Upload Video</h3>

          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label htmlFor="video-file-input" className="block text-xs font-medium text-slate-300 mb-2">
                Select video file (.mp4, .avi, .mov, .mkv)
              </label>
              <input
                ref={fileInputRef}
                id="video-file-input"
                name="video"
                type="file"
                accept=".mp4,.avi,.mov,.mkv"
                disabled={isUploading}
                onChange={handleFileChange}
                aria-describedby={uploadError ? 'upload-error-msg' : uploadSuccess ? 'upload-success-msg' : undefined}
                className="block w-full text-xs text-slate-400 file:mr-4 file:rounded file:border-0 file:bg-slate-800 file:px-4 file:py-2 file:text-xs file:font-medium file:text-slate-200 hover:file:bg-slate-700 cursor-pointer disabled:opacity-50"
              />
            </div>

            {selectedFile && !isUploading && (
              <p className="text-xs text-slate-400">
                Selected: <span className="text-slate-200 font-medium">{selectedFile.name}</span> ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </p>
            )}

            {isUploading && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="upload-progress-bar">Uploading to server...</label>
                  <span className="font-mono">{uploadProgress}%</span>
                </div>
                <progress
                  id="upload-progress-bar"
                  max={100}
                  value={uploadProgress}
                  aria-label="Upload progress"
                  className="w-full h-2 rounded bg-slate-800"
                />
              </div>
            )}

            {uploadError && (
              <div
                id="upload-error-msg"
                role="alert"
                aria-live="polite"
                className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
              >
                {uploadError}
              </div>
            )}

            {uploadSuccess && (
              <div
                id="upload-success-msg"
                role="status"
                aria-live="polite"
                className="rounded border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400"
              >
                {uploadSuccess}
              </div>
            )}

            <button
              type="submit"
              disabled={!selectedFile || isUploading}
              className="inline-flex items-center justify-center rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isUploading ? 'Uploading...' : 'Upload Video'}
            </button>
          </form>
        </section>
      )}

      {/* Jobs queue table */}
      <section aria-labelledby="jobs-heading" className="rounded-lg border border-slate-800 bg-slate-950 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 id="jobs-heading" className="text-base font-semibold text-white">Processing Queue</h3>
          <button
            type="button"
            onClick={() => fetchJobs()}
            className="text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            Refresh
          </button>
        </div>

        {downloadError && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
          >
            {downloadError}
          </div>
        )}

        {jobsError && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400"
          >
            {jobsError}
          </div>
        )}

        {isLoadingJobs ? (
          <div role="status" aria-live="polite" className="py-8 text-center text-xs text-slate-500">
            Loading video jobs...
          </div>
        ) : jobs.length === 0 ? (
          <p className="py-8 text-center text-xs text-slate-500">No video jobs in queue.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <caption className="sr-only">Video Processing Jobs</caption>
              <thead className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="pb-3 pr-4 font-semibold">Filename</th>
                  <th scope="col" className="pb-3 px-4 font-semibold">Status</th>
                  <th scope="col" className="pb-3 px-4 font-semibold">Progress</th>
                  <th scope="col" className="pb-3 px-4 font-semibold">Created</th>
                  <th scope="col" className="pb-3 pl-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-900/40 transition-colors">
                    <td className="py-3 pr-4 font-medium text-white max-w-xs truncate" title={job.original_filename}>
                      {job.original_filename}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderStatusBadge(job.status)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <progress
                          max={100}
                          value={job.progress}
                          aria-label={`Processing progress for ${job.original_filename}`}
                          className="w-20 h-2 rounded bg-slate-800"
                        />
                        <span className="font-mono text-slate-400">{Math.round(job.progress)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-slate-400">
                      {new Date(job.created_at).toLocaleString()}
                    </td>
                    <td className="py-3 pl-4 whitespace-nowrap text-right">
                      {job.status === 'completed' ? (
                        <button
                          type="button"
                          onClick={() => handleDownload(job)}
                          disabled={downloadingId === job.id}
                          className="inline-flex items-center rounded bg-emerald-600/20 px-2.5 py-1 text-xs font-medium text-emerald-300 hover:bg-emerald-600/30 border border-emerald-500/30 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {downloadingId === job.id ? 'Downloading...' : 'Download'}
                        </button>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
