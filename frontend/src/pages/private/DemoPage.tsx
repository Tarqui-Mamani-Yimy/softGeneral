import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useAlertStream } from '../../hooks';
import {
  createDemoSession,
  getCurrentDemoSession,
  deleteDemoSession,
  getDemoStreamStatus,
  ApiError,
  API_URL,
  getAuthToken,
} from '../../services/apiClient';
import {
  startWhipPublish,
  cleanupWhipKeepalive,
  type WhipConnection,
} from '../../services/whipClient';
import type { DemoSession, DemoStatus } from '../../types/demo';
import type { Alert } from '../../types/alert';

const MEDIAMTX_URL = (
  import.meta.env.VITE_MEDIAMTX_WEBRTC_URL ?? 'http://localhost:8889'
).replace(/\/+$/, '');

const STATUS_LABELS: Record<DemoStatus, string> = {
  idle: 'Ready to start',
  requesting_camera: 'Requesting camera',
  publishing: 'Publishing',
  waiting_for_analysis: 'Waiting for analysis',
  live: 'Live',
  error: 'Error',
};

export const DemoPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('cameras.manage') ?? false;

  const [status, setStatus] = useState<DemoStatus>('idle');
  const [session, setSession] = useState<DemoSession | null>(null);
  const [existingSession, setExistingSession] = useState<DemoSession | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isStopping, setIsStopping] = useState<boolean>(false);
  const [isCheckingExisting, setIsCheckingExisting] = useState<boolean>(true);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const whipConnRef = useRef<WhipConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activeSessionRef = useRef<DemoSession | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    activeSessionRef.current = session;
  }, [session]);

  // Check for any currently active demo session on mount
  useEffect(() => {
    let isCancelled = false;

    const checkCurrent = async () => {
      try {
        const current = await getCurrentDemoSession();
        if (!isCancelled && current) {
          setExistingSession(current);
        }
      } catch {
        // ignore 404 or transient initial load error
      } finally {
        if (!isCancelled) {
          setIsCheckingExisting(false);
        }
      }
    };

    if (canManage) {
      checkCurrent();
    } else {
      setIsCheckingExisting(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [canManage]);

  // Check if demo is currently active in any setup or streaming state
  const isDemoActive = status !== 'idle' && status !== 'error';

  const handleIncomingAlert = useCallback(
    (alert: Alert) => {
      const activeId = activeSessionRef.current?.id;
      if (activeId && alert.camera_id === activeId) {
        setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, 50));
      }
    },
    []
  );

  useAlertStream({
    enabled: isDemoActive && !!session,
    onAlert: handleIncomingAlert,
  });

  // Clean up all resources when stopping demo
  const cleanupAll = useCallback(async (deleteRemoteSession = true) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (whipConnRef.current) {
      try {
        await whipConnRef.current.stop();
      } catch {
        // ignore
      }
      whipConnRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }

    const currentSession = activeSessionRef.current;
    if (deleteRemoteSession && currentSession) {
      try {
        await deleteDemoSession(currentSession.id);
      } catch {
        // best effort
      }
    }

    setSession(null);
    setExistingSession(null);
    setStatus('idle');
  }, []);

  // Handle pagehide best effort cleanup
  useEffect(() => {
    const handlePageHide = () => {
      const whipResource = whipConnRef.current?.whipResourceUrl ?? null;
      const sessId = activeSessionRef.current?.id ?? null;
      const token = getAuthToken();
      cleanupWhipKeepalive(whipResource, sessId, API_URL, token);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (whipConnRef.current?.pc) {
        try {
          whipConnRef.current.pc.close();
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }
      if (whipConnRef.current) {
        whipConnRef.current.stop().catch(() => {});
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const s = activeSessionRef.current;
      if (s) {
        deleteDemoSession(s.id).catch(() => {});
      }
    };
  }, []);

  // Poll for the annotated output stream in MediaMTX once publishing
  const waitForAnnotatedStream = useCallback(
    (sessionId: string) => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }

      // The backend asks the MediaMTX control API; poll until the annotated
      // stream is really being published. The first frame can take a while
      // (camera keyframe + model loading), so keep polling while the session lives.
      pollTimerRef.current = setTimeout(async () => {
        if (activeSessionRef.current?.id !== sessionId) {
          return;
        }
        try {
          const { annotated_ready } = await getDemoStreamStatus(sessionId);
          if (annotated_ready) {
            setStatus('live');
            return;
          }
        } catch {
          // transient API error: keep polling
        }
        waitForAnnotatedStream(sessionId);
      }, 1500);
    },
    []
  );

  const startDemo = async (resumeExisting?: DemoSession) => {
    setErrorMessage(null);
    setAlerts([]);
    setStatus('requesting_camera');

    // 1. Request camera access
    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setStatus('error');
      setErrorMessage(
        'Webcam access is not supported by your browser or the page is not in a secure context (HTTPS or http://localhost).'
      );
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
    } catch (err: unknown) {
      setStatus('error');
      const errorObj = err as { name?: string };
      if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
        setErrorMessage(
          'Webcam permission was denied. Please grant camera access in your browser address bar settings and retry.'
        );
      } else if (errorObj?.name === 'NotFoundError' || errorObj?.name === 'DevicesNotFoundError') {
        setErrorMessage(
          'No camera device was found on your computer. Please connect a webcam and retry.'
        );
      } else if (errorObj?.name === 'NotReadableError' || errorObj?.name === 'TrackStartError') {
        setErrorMessage(
          'Your webcam is already in use by another application. Please close other camera programs and retry.'
        );
      } else {
        setErrorMessage('Failed to access local webcam. Please check your camera permissions.');
      }
      return;
    }

    // 2. Initialize or reuse demo session
    let activeSess: DemoSession;
    try {
      if (resumeExisting) {
        activeSess = resumeExisting;
      } else {
        activeSess = await createDemoSession();
      }
      setSession(activeSess);
      setExistingSession(null);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setStatus('error');
      setErrorMessage(
        err instanceof ApiError ? `Session API error: ${err.detail}` : 'Failed to create demo session with the server.'
      );
      return;
    }

    // 3. Publish over WHIP
    setStatus('publishing');
    try {
      const connection = await startWhipPublish(stream, activeSess.whip_url);
      whipConnRef.current = connection;
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setStatus('error');
      const msg = err instanceof Error ? err.message : 'MediaMTX WHIP endpoint is unreachable.';
      setErrorMessage(msg);
      // Clean up session if WHIP publish fails
      deleteDemoSession(activeSess.id).catch(() => {});
      return;
    }

    // 4. Waiting for vision analysis
    setStatus('waiting_for_analysis');
    waitForAnnotatedStream(activeSess.id);
  };

  const stopDemo = async () => {
    setIsStopping(true);
    try {
      await cleanupAll(true);
    } finally {
      setIsStopping(false);
    }
  };

  const endExistingSession = async () => {
    if (!existingSession) return;
    setIsStopping(true);
    try {
      await deleteDemoSession(existingSession.id);
      setExistingSession(null);
      setStatus('idle');
    } catch (err) {
      setErrorMessage(
        err instanceof ApiError ? err.detail : 'Failed to terminate existing session.'
      );
    } finally {
      setIsStopping(false);
    }
  };

  if (!canManage) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Try demo</h2>
          <p className="text-sm text-slate-400">Webcam live security surveillance demonstration.</p>
        </div>
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-6 text-center text-sm text-red-400">
          Access restricted. You require the <code className="font-mono text-red-300">cameras.manage</code> permission to run the webcam demo.
        </div>
      </div>
    );
  }

  const livePlayerUrl = session ? `${MEDIAMTX_URL}/${session.live_path}` : '';

  const getStepState = (targetStep: DemoStatus): 'pending' | 'active' | 'completed' => {
    const order: DemoStatus[] = ['requesting_camera', 'publishing', 'waiting_for_analysis', 'live'];
    const currentIndex = order.indexOf(status);
    const targetIndex = order.indexOf(targetStep);
    if (currentIndex === -1) return 'pending';
    if (currentIndex > targetIndex) return 'completed';
    if (currentIndex === targetIndex) return 'active';
    return 'pending';
  };

  const renderStepDotClass = (state: 'pending' | 'active' | 'completed') => {
    if (state === 'active') return 'bg-amber-400 animate-pulse';
    if (state === 'completed') return 'bg-emerald-400';
    return 'bg-slate-600';
  };

  return (
    <div className="space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-white">Try demo</h2>
            {status !== 'idle' && status !== 'error' && (
              <span
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                  status === 'live'
                    ? 'border-emerald-800 bg-emerald-950/80 text-emerald-300'
                    : 'border-amber-800 bg-amber-950/80 text-amber-300'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    status === 'live' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400 animate-ping'
                  }`}
                />
                {STATUS_LABELS[status]}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            Stream your computer's webcam to the softGeneral AI vision engine and observe real-time detections and live alerts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isDemoActive ? (
            <button
              type="button"
              onClick={stopDemo}
              disabled={isStopping}
              className="rounded bg-rose-600 hover:bg-rose-500 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {isStopping ? 'Stopping Demo...' : 'Stop Demo'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startDemo()}
              disabled={isCheckingExisting || isStopping}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              Start Demo
            </button>
          )}
        </div>
      </div>

      {/* Security notice regarding browser media capture requirements */}
      <div className="rounded-md border border-slate-800 bg-slate-950/80 px-4 py-2.5 text-xs text-slate-400 flex items-center gap-2">
        <span className="font-semibold text-slate-300">Browser Security Requirement:</span>
        <span>
          Browsers only allow webcam capture in secure contexts (<code className="font-mono text-emerald-400">https://</code> or <code className="font-mono text-emerald-400">http://localhost</code>).
        </span>
      </div>

      {/* Error notification */}
      {errorMessage && (
        <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-400">
          <p className="font-semibold mb-1">Demo Error</p>
          <p>{errorMessage}</p>
        </div>
      )}

      {/* Existing Session Prompt */}
      {existingSession && !isDemoActive && (
        <section
          aria-label="Active session detected"
          className="rounded-lg border border-amber-600/30 bg-amber-950/20 p-5 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-amber-300">Active Demo Session Detected</h3>
              <p className="text-xs text-slate-300 mt-1">
                A demo camera session is currently open (<span className="font-mono text-amber-200">{existingSession.camera_code}</span>).
                You can resume streaming your webcam to this session or terminate it to start fresh.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => startDemo(existingSession)}
              className="rounded bg-emerald-600 hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer"
            >
              Resume Demo
            </button>
            <button
              type="button"
              onClick={endExistingSession}
              disabled={isStopping}
              className="rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {isStopping ? 'Ending...' : 'End Session'}
            </button>
          </div>
        </section>
      )}

      {/* Progress / Status Steps indicator during setup */}
      {isDemoActive && status !== 'live' && (
        <section aria-label="Demo progress" className="rounded-lg border border-slate-800 bg-slate-950 p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${renderStepDotClass(getStepState('requesting_camera'))}`} />
              <span className={getStepState('requesting_camera') === 'active' ? 'font-bold text-amber-300' : getStepState('requesting_camera') === 'completed' ? 'text-slate-300' : 'text-slate-500'}>
                1. Requesting camera
              </span>
            </div>
            <span className="hidden sm:inline text-slate-600">→</span>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${renderStepDotClass(getStepState('publishing'))}`} />
              <span className={getStepState('publishing') === 'active' ? 'font-bold text-amber-300' : getStepState('publishing') === 'completed' ? 'text-slate-300' : 'text-slate-500'}>
                2. Publishing
              </span>
            </div>
            <span className="hidden sm:inline text-slate-600">→</span>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${renderStepDotClass(getStepState('waiting_for_analysis'))}`} />
              <span className={getStepState('waiting_for_analysis') === 'active' ? 'font-bold text-amber-300' : getStepState('waiting_for_analysis') === 'completed' ? 'text-slate-300' : 'text-slate-500'}>
                3. Waiting for analysis
              </span>
            </div>
            <span className="hidden sm:inline text-slate-600">→</span>
            <div className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${renderStepDotClass(getStepState('live'))}`} />
              <span className={getStepState('live') === 'active' ? 'font-bold text-emerald-300' : 'text-slate-500'}>
                4. Live
              </span>
            </div>
          </div>
        </section>
      )}

      {/* Grid: Local Preview + Annotated Stream + Live Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Local Preview & Annotated View */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Local Preview */}
            <section aria-labelledby="local-preview-title" className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 id="local-preview-title" className="text-sm font-semibold text-slate-200">
                  Local Webcam Preview
                </h3>
                <span className="text-[11px] text-slate-400">Browser capture</span>
              </div>
              <div className="relative aspect-video w-full overflow-hidden rounded-md border border-slate-800 bg-black flex items-center justify-center">
                <video
                  ref={localVideoRef}
                  muted
                  playsInline
                  autoPlay
                  className="h-full w-full object-cover"
                />
                {!isDemoActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-4 text-center">
                    <p className="text-xs text-slate-400 mb-2">Camera inactive</p>
                    <p className="text-[11px] text-slate-500">
                      Click "Start Demo" above to request camera permission and start streaming.
                    </p>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Direct local feed captured via <code className="text-slate-400">getUserMedia</code> and encoded to H.264.
              </p>
            </section>

            {/* Annotated Live View */}
            <section aria-labelledby="annotated-view-title" className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 id="annotated-view-title" className="text-sm font-semibold text-slate-200">
                  Annotated Live Stream
                </h3>
                {status === 'live' ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Realtime
                  </span>
                ) : (
                  <span className="text-[11px] text-slate-500">AI pipeline output</span>
                )}
              </div>
              <div className="relative aspect-video w-full overflow-hidden rounded-md border border-slate-800 bg-black flex items-center justify-center">
                {isDemoActive && session ? (
                  <iframe
                    src={livePlayerUrl}
                    title="Annotated live vision stream"
                    allow="autoplay"
                    className="h-full w-full border-0"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 p-4 text-center">
                    <p className="text-xs text-slate-400 mb-1">No stream active</p>
                    <p className="text-[11px] text-slate-500">
                      Vision annotations will display here once the demo session starts.
                    </p>
                  </div>
                )}
                {status === 'waiting_for_analysis' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs p-4 text-center">
                    <span className="h-4 w-4 rounded-full border-2 border-emerald-400 border-t-transparent animate-spin mb-2" />
                    <p className="text-xs font-semibold text-white">Waiting for analysis...</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Connecting live vision worker to output stream.
                    </p>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Low-latency WebRTC output rendered from MediaMTX path <span className="font-mono text-emerald-400">{session?.live_path ?? 'demo_*'}</span>.
              </p>
            </section>
          </div>
        </div>

        {/* Right Column: Live Alerts Panel */}
        <div className="lg:col-span-4">
          <section aria-labelledby="live-alerts-title" className="rounded-lg border border-slate-800 bg-slate-950 p-4 space-y-3 flex flex-col h-full min-h-[360px]">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 id="live-alerts-title" className="text-sm font-semibold text-slate-200">
                  Demo Security Alerts
                </h3>
                <p className="text-[11px] text-slate-400">
                  Real-time events from this camera session
                </p>
              </div>
              <span className="rounded bg-slate-900 px-2 py-0.5 text-xs font-mono text-slate-300">
                {alerts.length}
              </span>
            </div>

            {alerts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 space-y-2">
                <span className="h-2 w-2 rounded-full bg-slate-600" />
                <p>
                  {status === 'live'
                    ? 'No incidents detected yet. Move or test scenarios in front of your webcam.'
                    : 'Waiting for stream to begin...'}
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5 overflow-y-auto max-h-[500px] pr-1">
                {alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="rounded-md border border-slate-800 bg-slate-900/70 p-3 space-y-1.5 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center rounded bg-amber-900/40 text-amber-300 border border-amber-700/50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider">
                        {alert.alert_type.replace('_', ' ')}
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        {new Date(alert.occurred_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
                      <span>Confidence:</span>
                      <strong className="text-emerald-400 font-mono">
                        {(alert.confidence * 100).toFixed(0)}%
                      </strong>
                    </div>
                    {typeof alert.details?.zone === 'string' && (
                      <div className="text-xs text-slate-400">
                        {typeof alert.details?.origin_zone === 'string'
                          ? `${alert.details.origin_zone} → ${alert.details.zone}`
                          : `Zone: ${alert.details.zone}`}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
export default DemoPage;
