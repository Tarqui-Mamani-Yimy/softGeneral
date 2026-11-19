import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth, useAlertStream } from '../../hooks';
import {
  listAlerts,
  fetchAlertSnapshotBlob,
  fetchAlertClipBlob,
  reviewAlert,
  ApiError,
} from '../../services/apiClient';
import type { Alert } from '../../types/alert';

export const AlertsPage: React.FC = () => {
  const { user } = useAuth();
  const canReview = user?.permissions.includes('alerts.review') ?? false;

  const [searchParams, setSearchParams] = useSearchParams();
  const videoJobIdFilter = searchParams.get('video_job_id') ?? '';
  const statusFilter = searchParams.get('status') ?? '';
  const typeFilter = searchParams.get('alert_type') ?? '';

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [isLoadingAlerts, setIsLoadingAlerts] = useState(true);
  const [alertsError, setAlertsError] = useState<string | null>(null);

  // Realtime highlight & sound
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [highlightedAlertIds, setHighlightedAlertIds] = useState<Set<string>>(new Set());

  // Evidence state
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  // Review state
  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Refs for tracking blob URLs for cleanup
  const currentSnapshotUrlRef = useRef<string | null>(null);
  const currentClipUrlRef = useRef<string | null>(null);

  const clearBlobUrls = () => {
    if (currentSnapshotUrlRef.current) {
      URL.revokeObjectURL(currentSnapshotUrlRef.current);
      currentSnapshotUrlRef.current = null;
    }
    if (currentClipUrlRef.current) {
      URL.revokeObjectURL(currentClipUrlRef.current);
      currentClipUrlRef.current = null;
    }
    setSnapshotUrl(null);
    setClipUrl(null);
  };

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      clearBlobUrls();
    };
  }, []);

  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {
      // Audio autoplay or context may be blocked
    }
  }, [soundEnabled]);

  const handleIncomingAlert = useCallback(
    (incoming: Alert) => {
      const matchesStatus = !statusFilter || incoming.status === statusFilter;
      const matchesType = !typeFilter || incoming.alert_type === typeFilter;
      const matchesJob = !videoJobIdFilter || incoming.video_job_id === videoJobIdFilter;

      if (matchesStatus && matchesType && matchesJob) {
        setAlerts((prev) => [incoming, ...prev.filter((a) => a.id !== incoming.id)]);
        setHighlightedAlertIds((prev) => new Set(prev).add(incoming.id));
        setTimeout(() => {
          setHighlightedAlertIds((prev) => {
            const next = new Set(prev);
            next.delete(incoming.id);
            return next;
          });
        }, 5000);
      }

      playAlertSound();
    },
    [statusFilter, typeFilter, videoJobIdFilter, playAlertSound],
  );

  const { status: streamStatus, isConnected } = useAlertStream({
    onAlert: handleIncomingAlert,
  });

  const fetchAlertsList = useCallback(
    async (isPolling = false) => {
      try {
        const data = await listAlerts({
          status: statusFilter || undefined,
          alert_type: typeFilter || undefined,
          video_job_id: videoJobIdFilter || undefined,
        });
        setAlerts(data);
        setAlertsError(null);

        // Auto-select first alert if none selected or current selection disappeared
        setSelectedAlertId((prev) => {
          if (prev && data.some((a) => a.id === prev)) {
            return prev;
          }
          return data.length > 0 ? data[0].id : null;
        });
      } catch (err) {
        if (!isPolling) {
          setAlertsError(err instanceof ApiError ? err.detail : 'Failed to load security alerts');
        }
      } finally {
        if (!isPolling) {
          setIsLoadingAlerts(false);
        }
      }
    },
    [statusFilter, typeFilter, videoJobIdFilter],
  );

  // Initial and on filter change
  useEffect(() => {
    setIsLoadingAlerts(true);
    fetchAlertsList();
  }, [fetchAlertsList]);

  // Polling every 5s only while disconnected
  useEffect(() => {
    if (isConnected) {
      return;
    }
    const intervalId = setInterval(() => {
      fetchAlertsList(true);
    }, 5000);

    return () => clearInterval(intervalId);
  }, [fetchAlertsList, isConnected]);

  const selectedAlert = alerts.find((a) => a.id === selectedAlertId) ?? null;

  // Load evidence (snapshot and clip) when selected alert changes
  useEffect(() => {
    clearBlobUrls();
    setEvidenceError(null);
    setReviewError(null);
    setReviewNotes('');

    if (!selectedAlert) {
      return;
    }

    let isCancelled = false;

    const loadEvidence = async () => {
      setIsLoadingEvidence(true);
      try {
        if (selectedAlert.has_snapshot) {
          const blob = await fetchAlertSnapshotBlob(selectedAlert.id);
          if (!isCancelled) {
            const url = URL.createObjectURL(blob);
            currentSnapshotUrlRef.current = url;
            setSnapshotUrl(url);
          }
        }

        if (selectedAlert.has_clip) {
          const clipBlob = await fetchAlertClipBlob(selectedAlert.id);
          if (!isCancelled) {
            const url = URL.createObjectURL(clipBlob);
            currentClipUrlRef.current = url;
            setClipUrl(url);
          }
        }
      } catch (err) {
        if (!isCancelled) {
          setEvidenceError(err instanceof ApiError ? err.detail : 'Failed to load media evidence');
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingEvidence(false);
        }
      }
    };

    loadEvidence();

    return () => {
      isCancelled = true;
    };
  }, [selectedAlert]);

  const handleReview = async (status: 'confirmed' | 'false_alarm') => {
    if (!selectedAlert) return;
    setIsSubmittingReview(true);
    setReviewError(null);

    try {
      const updated = await reviewAlert(selectedAlert.id, {
        status,
        notes: reviewNotes.trim() || undefined,
      });

      // Update local state and refresh list
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      setReviewNotes('');
      fetchAlertsList(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setReviewError(err.detail);
      } else {
        setReviewError('Failed to submit review');
      }
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const handleStatusFilterChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set('status', val);
    else next.delete('status');
    setSearchParams(next);
  };

  const handleTypeFilterChange = (val: string) => {
    const next = new URLSearchParams(searchParams);
    if (val) next.set('alert_type', val);
    else next.delete('alert_type');
    setSearchParams(next);
  };

  const handleClearVideoFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('video_job_id');
    setSearchParams(next);
  };

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center rounded-full border border-amber-800 bg-amber-950 px-2 py-0.5 text-xs font-medium text-amber-300">
            Pending
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center rounded-full border border-rose-800 bg-rose-950 px-2 py-0.5 text-xs font-medium text-rose-300">
            Confirmed
          </span>
        );
      case 'false_alarm':
        return (
          <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
            False Alarm
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  const renderTypeBadge = (type: string) => {
    switch (type) {
      case 'intrusion':
        return (
          <span className="inline-flex items-center rounded bg-amber-900/40 text-amber-300 border border-amber-700/50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
            Intrusion
          </span>
        );
      case 'weapon':
        return (
          <span className="inline-flex items-center rounded bg-red-900/40 text-red-300 border border-red-700/50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
            Weapon
          </span>
        );
      case 'fire_smoke':
        return (
          <span className="inline-flex items-center rounded bg-orange-900/40 text-orange-300 border border-orange-700/50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
            Fire/Smoke
          </span>
        );
      case 'fight':
        return (
          <span className="inline-flex items-center rounded bg-purple-900/40 text-purple-300 border border-purple-700/50 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
            Fight
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-white">Security Alerts</h2>
            {streamStatus === 'connected' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-800 bg-emerald-950/80 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Live
              </span>
            ) : streamStatus === 'reconnecting' ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-800 bg-amber-950/80 px-2.5 py-0.5 text-xs font-medium text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                Reconnecting
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                <span className="h-2 w-2 rounded-full bg-slate-500" />
                Offline (Polling)
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            Real-time incident detection feed. Review evidence footage and confirm or dismiss alerts.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            aria-pressed={soundEnabled}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              soundEnabled
                ? 'border-emerald-600 bg-emerald-950 text-emerald-300'
                : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Audio Alert: {soundEnabled ? 'ON' : 'OFF'}</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <section aria-label="Alert filters" className="rounded-lg border border-slate-800 bg-slate-950 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label htmlFor="filter-status" className="block text-xs font-medium text-slate-400 mb-1">
              Status
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="false_alarm">False Alarm</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-type" className="block text-xs font-medium text-slate-400 mb-1">
              Alert Type
            </label>
            <select
              id="filter-type"
              value={typeFilter}
              onChange={(e) => handleTypeFilterChange(e.target.value)}
              className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
            >
              <option value="">All Types</option>
              <option value="intrusion">Intrusion</option>
              <option value="weapon">Weapon</option>
              <option value="fire_smoke">Fire / Smoke</option>
              <option value="fight">Fight</option>
              <option value="face_match">Face Match</option>
            </select>
          </div>

          {videoJobIdFilter && (
            <div className="flex items-center gap-2 mt-4 sm:mt-0">
              <span className="text-xs bg-emerald-950 text-emerald-300 border border-emerald-800 rounded px-2.5 py-1">
                Job: {videoJobIdFilter.slice(0, 8)}...
              </span>
              <button
                type="button"
                onClick={handleClearVideoFilter}
                className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
              >
                Clear job filter
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Main Grid: Alerts list + Detail view */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left column: Alerts list */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-semibold text-slate-300">Incident Feed ({alerts.length})</h3>
            <span className="text-[11px] text-slate-500">
              {isConnected ? 'Realtime (WebSocket)' : 'Auto-refresh: 5s'}
            </span>
          </div>

          {alertsError && (
            <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
              {alertsError}
            </div>
          )}

          {isLoadingAlerts ? (
            <div role="status" className="rounded-lg border border-slate-800 bg-slate-950 p-8 text-center text-xs text-slate-500">
              Loading incident feed...
            </div>
          ) : alerts.length === 0 ? (
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-8 text-center text-xs text-slate-500">
              No alerts match the selected criteria.
            </div>
          ) : (
            <ul className="space-y-2 max-h-[700px] overflow-y-auto pr-1">
              {alerts.map((alert) => {
                const isSelected = alert.id === selectedAlertId;
                const isHighlighted = highlightedAlertIds.has(alert.id);
                return (
                  <li key={alert.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedAlertId(alert.id)}
                      className={`w-full text-left rounded-lg border p-3.5 transition-all cursor-pointer ${
                        isHighlighted
                          ? 'border-emerald-400 bg-emerald-950/40 ring-2 ring-emerald-400/60 shadow-lg'
                          : isSelected
                            ? 'border-emerald-500 bg-slate-850 bg-slate-900 shadow-md ring-1 ring-emerald-500/40'
                            : 'border-slate-800 bg-slate-950 hover:bg-slate-900/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-2">
                          {renderTypeBadge(alert.alert_type)}
                          {isHighlighted && (
                            <span className="inline-flex items-center rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-black animate-pulse">
                              Live
                            </span>
                          )}
                        </div>
                        {renderStatusBadge(alert.status)}
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-400 mt-2">
                        <span>Confidence: {(alert.confidence * 100).toFixed(0)}%</span>
                        <span>{new Date(alert.occurred_at).toLocaleTimeString()}</span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Right column: Detail Panel */}
        <div className="lg:col-span-7">
          {selectedAlert ? (
            <article aria-labelledby="alert-detail-title" className="rounded-lg border border-slate-800 bg-slate-950 p-6 space-y-6">
              <header className="border-b border-slate-800 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h3 id="alert-detail-title" className="text-lg font-bold text-white capitalize">
                      {selectedAlert.alert_type.replace('_', ' ')} Incident
                    </h3>
                    {renderStatusBadge(selectedAlert.status)}
                  </div>
                  <span className="text-xs font-mono text-slate-400">ID: {selectedAlert.id}</span>
                </div>
                <div className="mt-2 text-xs text-slate-400 flex flex-wrap gap-x-6 gap-y-1">
                  <span>Occurred: <strong className="text-slate-200">{new Date(selectedAlert.occurred_at).toLocaleString()}</strong></span>
                  <span>Confidence: <strong className="text-emerald-400">{(selectedAlert.confidence * 100).toFixed(1)}%</strong></span>
                  {selectedAlert.track_id !== null && (
                    <span>Track ID: <strong className="text-slate-200">#{selectedAlert.track_id}</strong></span>
                  )}
                  {selectedAlert.video_job_id && (
                    <span>Video Job: <strong className="text-slate-200">{selectedAlert.video_job_id.slice(0, 8)}</strong></span>
                  )}
                </div>
              </header>

              {/* Evidence Media Section */}
              <section aria-label="Incident evidence" className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Evidence Footage</h4>

                {isLoadingEvidence && (
                  <p className="text-xs text-slate-500 py-4 text-center">Loading media evidence...</p>
                )}

                {evidenceError && (
                  <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-400">
                    {evidenceError}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Snapshot */}
                  <div className="space-y-2">
                    <span className="block text-xs font-medium text-slate-400">Snapshot (JPEG)</span>
                    <div className="rounded-md border border-slate-800 bg-black aspect-video flex items-center justify-center overflow-hidden">
                      {snapshotUrl ? (
                        <img
                          src={snapshotUrl}
                          alt={`Incident snapshot for alert ${selectedAlert.id}`}
                          className="h-full w-full object-contain"
                        />
                      ) : (
                        <span className="text-xs text-slate-600">
                          {selectedAlert.has_snapshot ? 'Loading image...' : 'No snapshot recorded'}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Clip */}
                  <div className="space-y-2">
                    <span className="block text-xs font-medium text-slate-400">Video Clip (MP4)</span>
                    <div className="rounded-md border border-slate-800 bg-black aspect-video flex items-center justify-center overflow-hidden">
                      {clipUrl ? (
                        <video controls src={clipUrl} className="h-full w-full object-contain">
                          <track kind="captions" />
                        </video>
                      ) : (
                        <span className="text-xs text-slate-600">
                          {selectedAlert.has_clip ? 'Loading video...' : 'No clip recorded'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              {/* Review Section */}
              <section aria-label="Review actions" className="border-t border-slate-800 pt-4 space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Review & Assessment</h4>

                {selectedAlert.status !== 'pending' ? (
                  <div className="rounded border border-slate-800 bg-slate-900/60 p-4 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Assessment Verdict:</span>
                      {renderStatusBadge(selectedAlert.status)}
                    </div>
                    {selectedAlert.reviewed_at && (
                      <div className="text-slate-400">
                        Reviewed at: <span className="text-slate-200">{new Date(selectedAlert.reviewed_at).toLocaleString()}</span>
                      </div>
                    )}
                    {selectedAlert.reviewed_by && (
                      <div className="text-slate-400">
                        Reviewed by Operator ID: <span className="font-mono text-slate-200">{selectedAlert.reviewed_by}</span>
                      </div>
                    )}
                    {selectedAlert.review_notes && (
                      <div className="pt-2 text-slate-300">
                        <span className="text-slate-500 block mb-0.5">Operator Notes:</span>
                        <p className="bg-slate-950 p-2.5 rounded border border-slate-800 italic">
                          "{selectedAlert.review_notes}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : canReview ? (
                  <div className="space-y-4 bg-slate-900/40 p-4 rounded-lg border border-slate-800">
                    <div>
                      <label htmlFor="review-notes" className="block text-xs font-medium text-slate-300 mb-1">
                        Review Notes (optional, max 1000 characters)
                      </label>
                      <textarea
                        id="review-notes"
                        rows={2}
                        maxLength={1000}
                        value={reviewNotes}
                        disabled={isSubmittingReview}
                        onChange={(e) => setReviewNotes(e.target.value)}
                        placeholder="Add operator assessment observations..."
                        className="w-full rounded border border-slate-700 bg-slate-900 p-2 text-xs text-slate-200 placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                      />
                    </div>

                    {reviewError && (
                      <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                        {reviewError}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleReview('confirmed')}
                        disabled={isSubmittingReview}
                        className="rounded bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingReview ? 'Submitting...' : 'Confirm Incident'}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleReview('false_alarm')}
                        disabled={isSubmittingReview}
                        className="rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingReview ? 'Submitting...' : 'Mark False Alarm'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Operator review is pending. Your active account lacks "alerts.review" permission to change this verdict.
                  </p>
                )}
              </section>
            </article>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-12 text-center text-xs text-slate-500">
              Select an alert from the feed to view footage and review details.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
