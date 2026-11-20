import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth, useAlertStream } from '../../hooks';
import {
  createDemoSession,
  getCurrentDemoSession,
  deleteDemoSession,
  getDemoStreamStatus,
  listAlerts,
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

const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
const defaultMtxUrl = isSecure ? '/mediamtx' : 'http://localhost:8889';
const MEDIAMTX_URL = (
  import.meta.env.VITE_MEDIAMTX_WEBRTC_URL ?? defaultMtxUrl
).replace(/\/+$/, '');

const STATUS_LABELS: Record<DemoStatus, string> = {
  idle: 'Canal en espera',
  requesting_camera: 'Inicializando dispositivo',
  publishing: 'Publicando flujo WHIP',
  waiting_for_analysis: 'Sincronizando pipeline IA',
  live: 'Transmisión Activa',
  error: 'Fallo de enlace',
};

const DETECTION_LABELS: Record<string, string> = {
  person: 'Personas',
  face_match: 'Sujetos Vetados',
  weapon: 'Armas',
  fire_smoke: 'Fuego / Humo',
  fight: 'Pelea',
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

  useEffect(() => {
    let isCancelled = false;

    const checkCurrent = async () => {
      try {
        const current = await getCurrentDemoSession();
        if (!isCancelled && current) {
          setExistingSession(current);
        }
      } catch {
        // 404 = no hay sesión previa
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

  const isDemoActive = status !== 'idle' && status !== 'error';

  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleIncomingAlert = useCallback((alert: Alert) => {
    const activeId = activeSessionRef.current?.id;
    if (activeId && (!alert.camera_id || alert.camera_id.toLowerCase() === activeId.toLowerCase())) {
      setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)].slice(0, 50));
    }
  }, []);

  // Sincronizar periódicamente las alertas del canal activo
  useEffect(() => {
    if (!session?.id) return;
    const fetchSessionAlerts = async () => {
      try {
        const data = await listAlerts({ limit: 50 });
        const sessionAlerts = data.filter(
          (a) => a.camera_id && a.camera_id.toLowerCase() === session.id.toLowerCase()
        );
        if (sessionAlerts.length > 0) {
          setAlerts((prev) => {
            const merged = [...prev];
            sessionAlerts.forEach((item) => {
              if (!merged.some((m) => m.id === item.id)) {
                merged.push(item);
              }
            });
            merged.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime());
            return merged.slice(0, 50);
          });
        }
      } catch {
        // ignorar fallo de sondeo
      }
    };

    fetchSessionAlerts();
    const interval = setInterval(fetchSessionAlerts, 3000);
    return () => clearInterval(interval);
  }, [session?.id]);

  const { metricsByCamera } = useAlertStream({
    enabled: isDemoActive && !!session,
    onAlert: handleIncomingAlert,
  });

  const currentMetrics = session ? metricsByCamera[session.id] ?? null : null;
  const secondsAgo = currentMetrics
    ? Math.max(0, Math.floor((now - new Date(currentMetrics.updated_at).getTime()) / 1000))
    : 0;

  const cleanupAll = useCallback(async (deleteRemoteSession = true) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    if (whipConnRef.current) {
      try {
        await whipConnRef.current.stop();
      } catch {
        // ignorar
      }
      whipConnRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignorar
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
        // mejor esfuerzo
      }
    }

    setSession(null);
    setExistingSession(null);
    setStatus('idle');
  }, []);

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
          // ignorar
        }
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, []);

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

  const waitForAnnotatedStream = useCallback((sessionId: string) => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
    }

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
        // continuar sondeo
      }
      waitForAnnotatedStream(sessionId);
    }, 1500);
  }, []);

  const startDemo = async (resumeExisting?: DemoSession) => {
    setErrorMessage(null);
    setAlerts([]);
    setStatus('requesting_camera');

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setStatus('error');
      setErrorMessage(
        'El dispositivo de captura no está disponible o el navegador no opera bajo un contexto seguro (HTTPS / localhost).'
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
        setErrorMessage('Permiso de cámara denegado por el usuario.');
      } else if (errorObj?.name === 'NotFoundError' || errorObj?.name === 'DevicesNotFoundError') {
        setErrorMessage('No se detectó ningún dispositivo de captura de video conectado.');
      } else if (errorObj?.name === 'NotReadableError' || errorObj?.name === 'TrackStartError') {
        setErrorMessage('El dispositivo de video se encuentra ocupado por otro proceso.');
      } else {
        setErrorMessage('No fue posible inicializar la captura de video local.');
      }
      return;
    }

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
        err instanceof ApiError ? `Error del servidor: ${err.detail}` : 'Error al inicializar el canal en el servidor.'
      );
      return;
    }

    setStatus('publishing');
    try {
      const connection = await startWhipPublish(stream, activeSess.whip_url);
      whipConnRef.current = connection;
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      setStatus('error');
      const msg = err instanceof Error ? err.message : 'Servidor de medios MediaMTX (WHIP) inalcanzable.';
      setErrorMessage(msg);
      deleteDemoSession(activeSess.id).catch(() => {});
      return;
    }

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
        err instanceof ApiError ? err.detail : 'Error al cerrar la sesión activa.'
      );
    } finally {
      setIsStopping(false);
    }
  };

  if (!canManage) {
    return (
      <div className="rounded-md border border-red-500/30 bg-red-950/30 p-6 text-center text-xs text-red-300">
        Acceso restringido. Se requiere el privilegio <code className="font-mono">cameras.manage</code> para operar el canal de prueba.
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

  return (
    <div className="space-y-5">
      {/* Barra de Control de Canal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1e2330] pb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded border border-[#222836] bg-[#12151c] px-3 py-1.5 flex items-center gap-2 text-xs">
            <span className="text-slate-400">ID DE CANAL:</span>
            <span className="font-mono font-semibold text-white">
              {session ? session.camera_code.toUpperCase() : 'SIN ASIGNAR'}
            </span>
          </div>

          <div
            aria-live="polite"
            className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-mono ${
              status === 'live'
                ? 'border-emerald-800/60 bg-emerald-950/40 text-emerald-300'
                : isDemoActive
                  ? 'border-amber-800/60 bg-amber-950/40 text-amber-300'
                  : 'border-[#222836] bg-[#12151c] text-slate-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                status === 'live'
                  ? 'bg-emerald-400 animate-pulse'
                  : isDemoActive
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-slate-600'
              }`}
            />
            <span>ESTADO: {STATUS_LABELS[status].toUpperCase()}</span>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {isDemoActive ? (
            <button
              type="button"
              onClick={stopDemo}
              disabled={isStopping}
              className="inline-flex items-center gap-2 rounded bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="h-2 w-2 rounded-xs bg-white" />
              {isStopping ? 'Cerrando Canal...' : 'Detener Transmisión'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => startDemo()}
              disabled={isCheckingExisting || isStopping}
              className="inline-flex items-center gap-2 rounded bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              <span className="h-2 w-2 rounded-full bg-white" />
              Iniciar Transmisión de Prueba
            </button>
          )}
        </div>
      </div>

      {errorMessage && (
        <div role="alert" className="rounded border border-red-500/30 bg-red-950/30 p-3.5 text-xs text-red-300">
          <p className="font-semibold">Fallo en el Canal de Prueba</p>
          <p className="mt-0.5 text-red-200/80">{errorMessage}</p>
        </div>
      )}

      {/* Aviso de sesión previa */}
      {existingSession && !isDemoActive && (
        <section
          aria-label="Sesión activa detectada"
          className="rounded-md border border-amber-700/50 bg-amber-950/20 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        >
          <div className="text-xs">
            <h3 className="font-semibold text-amber-300">Sesión de Canal Previa Detectada</h3>
            <p className="text-slate-300 mt-0.5">
              El canal <span className="font-mono text-amber-200">{existingSession.camera_code}</span> continúa abierto en el servidor.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => startDemo(existingSession)}
              className="rounded bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer"
            >
              Reconectar Canal
            </button>
            <button
              type="button"
              onClick={endExistingSession}
              disabled={isStopping}
              className="rounded border border-[#282e3d] bg-[#161a24] hover:bg-[#1e2433] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
            >
              {isStopping ? 'Cerrando...' : 'Descartar Sesión'}
            </button>
          </div>
        </section>
      )}

      {/* Barra de progreso de enlace */}
      {isDemoActive && status !== 'live' && (
        <section aria-label="Progreso de conexión" className="rounded-md border border-[#1e2330] bg-[#12151c] px-4 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            {[
              { key: 'requesting_camera' as const, label: '01. CAPTURA LOCAL' },
              { key: 'publishing' as const, label: '02. ENLACE WHIP' },
              { key: 'waiting_for_analysis' as const, label: '03. PIPELINE IA' },
              { key: 'live' as const, label: '04. SEÑAL EN VIVO' },
            ].map((step) => {
              const st = getStepState(step.key);
              return (
                <div key={step.key} className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      st === 'active'
                        ? 'bg-amber-400 animate-pulse'
                        : st === 'completed'
                          ? 'bg-emerald-400'
                          : 'bg-slate-700'
                    }`}
                  />
                  <span
                    className={
                      st === 'active'
                        ? 'text-amber-300 font-semibold'
                        : st === 'completed'
                          ? 'text-emerald-400'
                          : 'text-slate-600'
                    }
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Matriz Principal: Monitores Duales + Bitácora de Eventos */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Columna Izquierda: Monitores y Telemetría */}
        <div className="lg:col-span-8 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Monitor 01: Señal de Entrada */}
            <section
              aria-labelledby="local-preview-title"
              className="rounded-md border border-[#1e2330] bg-[#12151c] overflow-hidden"
            >
              <div className="border-b border-[#1e2330] bg-[#161a23] px-3.5 py-2 flex items-center justify-between">
                <h3 id="local-preview-title" className="font-mono text-xs font-semibold text-slate-200">
                  CH-01 // SEÑAL DE ORIGEN
                </h3>
                <span className="font-mono text-[10px] text-slate-400">WEBRTC IN</span>
              </div>

              <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                <video
                  ref={localVideoRef}
                  muted
                  playsInline
                  autoPlay
                  className="h-full w-full object-cover"
                />
                {!isDemoActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0d11]/90 p-4 text-center">
                    <span className="font-mono text-xs text-slate-500">SIN SEÑAL DE ENTRADA</span>
                    <span className="text-[11px] text-slate-600 mt-1">
                      Inicie la transmisión para habilitar el dispositivo local
                    </span>
                  </div>
                )}
              </div>

              <div className="border-t border-[#1e2330] bg-[#0e1117] px-3.5 py-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
                <span>CODEC: H.264 / VP8</span>
                <span>ORIGEN: DISPOSITIVO LOCAL</span>
              </div>
            </section>

            {/* Monitor 02: Señal Procesada por IA */}
            <section
              aria-labelledby="annotated-view-title"
              className="rounded-md border border-[#1e2330] bg-[#12151c] overflow-hidden"
            >
              <div className="border-b border-[#1e2330] bg-[#161a23] px-3.5 py-2 flex items-center justify-between">
                <h3 id="annotated-view-title" className="font-mono text-xs font-semibold text-slate-200">
                  CH-02 // SALIDA ANALÍTICA IA
                </h3>
                {status === 'live' ? (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    REC • EN VIVO
                  </span>
                ) : (
                  <span className="font-mono text-[10px] text-slate-500">OSD OVERLAY</span>
                )}
              </div>

              <div className="relative aspect-video w-full bg-black flex items-center justify-center">
                {isDemoActive && session ? (
                  <iframe
                    src={livePlayerUrl}
                    title="Flujo analítico con anotaciones"
                    allow="autoplay"
                    className="h-full w-full border-0"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#0b0d11]/90 p-4 text-center">
                    <span className="font-mono text-xs text-slate-500">CANAL ANALÍTICO INACTIVO</span>
                    <span className="text-[11px] text-slate-600 mt-1">
                      Esperando vinculación con el supervisor de visión
                    </span>
                  </div>
                )}

                {status === 'waiting_for_analysis' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 p-4 text-center">
                    <span className="h-4 w-4 rounded-full border-2 border-blue-400 border-t-transparent animate-spin mb-2" />
                    <p className="font-mono text-xs text-white">INICIALIZANDO PIPELINE NEURONAL...</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Cargando detectores YOLOv8 y padrón biométrico SFace
                    </p>
                  </div>
                )}
              </div>

              <div className="border-t border-[#1e2330] bg-[#0e1117] px-3.5 py-2 flex items-center justify-between font-mono text-[10px] text-slate-500">
                <span>RUTA: {session?.live_path ?? '—'}</span>
                <span>DETECCIÓN + BIOMETRÍA</span>
              </div>
            </section>
          </div>

          {/* Telemetría del Procesador de Visión */}
          <section
            aria-labelledby="live-stats-title"
            aria-live="polite"
            className="rounded-md border border-[#1e2330] bg-[#12151c] overflow-hidden"
          >
            <div className="border-b border-[#1e2330] bg-[#161a23] px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 id="live-stats-title" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Telemetría de Procesamiento en Tiempo Real
                </h3>
                {currentMetrics && secondsAgo <= 10 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                )}
              </div>
              <div className="font-mono text-[11px] text-slate-400">
                {!currentMetrics ? (
                  <span className="text-slate-500">SIN TELEMETRÍA</span>
                ) : (
                  <span>SINCRONIZADO HACE {secondsAgo}S</span>
                )}
              </div>
            </div>

            {!currentMetrics ? (
              <div className="p-6 text-center text-xs text-slate-500">
                {isDemoActive
                  ? 'Recibiendo primeros paquetes de telemetría del trabajador en vivo...'
                  : 'Inicie el canal de prueba para visualizar métricas de rendimiento e inferencia.'}
              </div>
            ) : (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="rounded border border-[#222836] bg-[#0e1117] p-3">
                    <span className="block text-[10px] font-mono uppercase text-slate-500">FPS Inferencia IA</span>
                    <span className="mt-1 block text-lg font-bold font-mono text-emerald-400 tabular-nums">
                      {currentMetrics.analysis_fps.toFixed(1)}
                    </span>
                  </div>
                  <div className="rounded border border-[#222836] bg-[#0e1117] p-3">
                    <span className="block text-[10px] font-mono uppercase text-slate-500">FPS Codificación</span>
                    <span className="mt-1 block text-lg font-bold font-mono text-white tabular-nums">
                      {currentMetrics.published_fps.toFixed(1)}
                    </span>
                  </div>
                  <div className="rounded border border-[#222836] bg-[#0e1117] p-3">
                    <span className="block text-[10px] font-mono uppercase text-slate-500">Pistas Activas</span>
                    <span className="mt-1 block text-lg font-bold font-mono text-blue-400 tabular-nums">
                      {currentMetrics.people_tracked}
                    </span>
                  </div>
                  <div className="rounded border border-[#222836] bg-[#0e1117] p-3">
                    <span className="block text-[10px] font-mono uppercase text-slate-500">Latencia Alerta</span>
                    <span className="mt-1 block text-lg font-bold font-mono text-amber-300 tabular-nums">
                      {currentMetrics.frame_to_alert_ms !== null && currentMetrics.frame_to_alert_ms !== undefined
                        ? `${Math.round(currentMetrics.frame_to_alert_ms)} ms`
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#1a1f2b]">
                  <span className="text-[11px] font-mono text-slate-500">OBJETOS EN CUADRO:</span>
                  {Object.entries(currentMetrics.detections).length === 0 ? (
                    <span className="text-xs text-slate-500">Ninguno</span>
                  ) : (
                    Object.entries(currentMetrics.detections).map(([label, count]) => (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1.5 rounded border border-[#282e3d] bg-[#161a24] px-2.5 py-0.5 text-xs font-mono text-slate-200"
                      >
                        <span className="text-blue-400">{DETECTION_LABELS[label] ?? label}:</span>
                        <span className="font-bold">{count}</span>
                      </span>
                    ))
                  )}
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Columna Derecha: Bitácora de Alertas de la Sesión */}
        <div className="lg:col-span-4">
          <section
            aria-labelledby="live-alerts-title"
            className="rounded-md border border-[#1e2330] bg-[#12151c] flex flex-col h-full min-h-[420px] overflow-hidden"
          >
            <div className="border-b border-[#1e2330] bg-[#161a23] px-4 py-2.5 flex items-center justify-between">
              <div>
                <h3 id="live-alerts-title" className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Eventos de la Sesión
                </h3>
              </div>
              <span className="rounded bg-[#0e1117] border border-[#252b3b] px-2 py-0.5 text-[11px] font-mono text-slate-300">
                {alerts.length}
              </span>
            </div>

            {alerts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-xs text-slate-500 space-y-1.5">
                <p className="font-mono text-[11px]">SIN INCIDENTES REGISTRADOS</p>
                <p className="text-[11px] text-slate-600">
                  {status === 'live'
                    ? 'Las detecciones de personas vetadas, intrusiones o armas aparecerán aquí en tiempo real.'
                    : 'Inicie el canal para monitorear eventos.'}
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-[#1a1f2b] overflow-y-auto max-h-[540px]">
                {alerts.map((alert) => {
                  const isFaceMatch = alert.alert_type === 'face_match';
                  return (
                    <li
                      key={alert.id}
                      className={`p-3.5 space-y-1.5 border-l-2 ${
                        isFaceMatch
                          ? 'border-l-red-500 bg-red-950/15'
                          : 'border-l-amber-500 bg-[#141821]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`inline-flex items-center rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            isFaceMatch
                              ? 'border-red-700/70 bg-red-950/80 text-red-200'
                              : 'border-amber-700/60 bg-amber-950/60 text-amber-200'
                          }`}
                        >
                          {isFaceMatch ? 'PERSONA VETADA' : alert.alert_type.replace('_', ' ')}
                        </span>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {new Date(alert.occurred_at).toLocaleTimeString('es-BO', { hour12: false })}
                        </span>
                      </div>

                      {isFaceMatch && Boolean(alert.details?.full_name) && (
                        <div className="text-xs font-bold text-white">
                          Sujeto: {String(alert.details?.full_name)}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>CONFIANZA:</span>
                        <strong className="text-emerald-400">
                          {(alert.confidence * 100).toFixed(1)}%
                        </strong>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default DemoPage;
