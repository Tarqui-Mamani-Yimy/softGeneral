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

  const [soundEnabled, setSoundEnabled] = useState(false);
  const [highlightedAlertIds, setHighlightedAlertIds] = useState<Set<string>>(new Set());

  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [clipUrl, setClipUrl] = useState<string | null>(null);
  const [isLoadingEvidence, setIsLoadingEvidence] = useState(false);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);

  const [reviewNotes, setReviewNotes] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

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
      // Ignorar bloqueo de autoplay
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
        playAlertSound();
      }
    },
    [statusFilter, typeFilter, videoJobIdFilter, playAlertSound]
  );

  const { isConnected } = useAlertStream({
    enabled: true,
    onAlert: handleIncomingAlert,
  });

  const loadAlerts = useCallback(
    async (isPolling = false) => {
      if (!isPolling) setIsLoadingAlerts(true);
      try {
        const data = await listAlerts({
          status: statusFilter || undefined,
          alert_type: typeFilter || undefined,
          video_job_id: videoJobIdFilter || undefined,
          limit: 100,
        });
        setAlerts(data);
        setAlertsError(null);
        setSelectedAlertId((prev) => {
          if (prev && data.some((a) => a.id === prev)) return prev;
          return data.length > 0 ? data[0].id : null;
        });
      } catch (err) {
        if (!isPolling) {
          setAlertsError(err instanceof ApiError ? err.detail : 'Error al consultar incidentes');
        }
      } finally {
        if (!isPolling) setIsLoadingAlerts(false);
      }
    },
    [statusFilter, typeFilter, videoJobIdFilter]
  );

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  useEffect(() => {
    if (isConnected) return;
    const intervalId = setInterval(() => {
      loadAlerts(true);
    }, 5000);
    return () => clearInterval(intervalId);
  }, [isConnected, loadAlerts]);

  const selectedAlert = alerts.find((a) => a.id === selectedAlertId) ?? null;

  useEffect(() => {
    clearBlobUrls();
    setEvidenceError(null);
    setReviewError(null);
    setReviewNotes(selectedAlert?.review_notes ?? '');

    if (!selectedAlert) return;

    let isCancelled = false;

    const loadEvidence = async () => {
      setIsLoadingEvidence(true);
      try {
        if (selectedAlert.has_snapshot) {
          const snapBlob = await fetchAlertSnapshotBlob(selectedAlert.id);
          if (!isCancelled) {
            const url = URL.createObjectURL(snapBlob);
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
          setEvidenceError(
            err instanceof ApiError ? err.detail : 'Archivo de evidencia no disponible en almacenamiento local'
          );
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
  }, [selectedAlert?.id]);

  const handleStatusFilterChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('status', value);
    else next.delete('status');
    setSearchParams(next);
  };

  const handleTypeFilterChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set('alert_type', value);
    else next.delete('alert_type');
    setSearchParams(next);
  };

  const handleClearVideoFilter = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('video_job_id');
    setSearchParams(next);
  };

  const handleReview = async (status: 'confirmed' | 'false_alarm') => {
    if (!selectedAlert) return;
    setIsSubmittingReview(true);
    setReviewError(null);
    try {
      const updated = await reviewAlert(selectedAlert.id, {
        status,
        notes: reviewNotes.trim() || undefined,
      });
      setAlerts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (err) {
      setReviewError(err instanceof ApiError ? err.detail : 'Error al registrar dictamen');
    } finally {
      setIsSubmittingReview(false);
    }
  };

  const renderStatusBadge = (status: Alert['status']) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-amber-800/60 bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono uppercase text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Pendiente
          </span>
        );
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-red-800/60 bg-red-950/60 px-2 py-0.5 text-[10px] font-mono uppercase text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            Confirmada
          </span>
        );
      case 'false_alarm':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-[#282e3d] bg-[#161a24] px-2 py-0.5 text-[10px] font-mono uppercase text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
            Falsa Alarma
          </span>
        );
    }
  };

  const renderTypeBadge = (type: string) => {
    switch (type) {
      case 'weapon':
        return (
          <span className="inline-flex items-center rounded border border-rose-700/60 bg-rose-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-200">
            Arma
          </span>
        );
      case 'fire_smoke':
        return (
          <span className="inline-flex items-center rounded border border-orange-700/60 bg-orange-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-orange-200">
            Fuego / Humo
          </span>
        );
      case 'fight':
        return (
          <span className="inline-flex items-center rounded border border-amber-700/60 bg-amber-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-200">
            Pelea
          </span>
        );
      case 'intrusion':
        return (
          <span className="inline-flex items-center rounded border border-blue-700/60 bg-blue-950/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-200">
            Intrusión
          </span>
        );
      case 'face_match':
        return (
          <span className="inline-flex items-center rounded border border-red-600/80 bg-red-950/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-200">
            Persona Vetada
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded border border-[#2a3142] bg-[#181c26] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-300">
            {type}
          </span>
        );
    }
  };

  const formatAlertTypeName = (type: string) => {
    switch (type) {
      case 'weapon':
        return 'Detección de Arma';
      case 'fire_smoke':
        return 'Detección de Fuego / Humo';
      case 'fight':
        return 'Detección de Altercado / Pelea';
      case 'intrusion':
        return 'Intrusión en Perímetro Restringido';
      case 'face_match':
        return 'Identificación Biométrica de Persona Vetada';
      default:
        return `Incidente (${type})`;
    }
  };

  return (
    <div className="space-y-4">
      {/* Barra superior de herramientas y filtros */}
      <section
        aria-label="Filtros de alertas"
        className="rounded-md border border-[#1e2330] bg-[#12151c] p-3.5 flex flex-wrap items-center justify-between gap-3"
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor="filter-status" className="text-xs font-medium text-slate-400">
              Dictamen:
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => handleStatusFilterChange(e.target.value)}
              className="rounded border border-[#252b3b] bg-[#0e1117] px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Todos los Estados</option>
              <option value="pending">Pendientes de Revisión</option>
              <option value="confirmed">Confirmadas</option>
              <option value="false_alarm">Falsas Alarmas</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="filter-type" className="text-xs font-medium text-slate-400">
              Categoría:
            </label>
            <select
              id="filter-type"
              value={typeFilter}
              onChange={(e) => handleTypeFilterChange(e.target.value)}
              className="rounded border border-[#252b3b] bg-[#0e1117] px-2.5 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Todas las Categorías</option>
              <option value="face_match">Persona Vetada (Biometría)</option>
              <option value="weapon">Arma</option>
              <option value="intrusion">Intrusión</option>
              <option value="fire_smoke">Fuego / Humo</option>
              <option value="fight">Pelea</option>
            </select>
          </div>

          {videoJobIdFilter && (
            <div className="flex items-center gap-2 rounded border border-blue-800/50 bg-blue-950/40 px-2.5 py-1 text-xs">
              <span className="font-mono text-blue-300">
                TRABAJO: {videoJobIdFilter.slice(0, 8)}
              </span>
              <button
                type="button"
                onClick={handleClearVideoFilter}
                className="text-slate-400 hover:text-white underline cursor-pointer"
              >
                Quitar filtro
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-mono ${
              isConnected
                ? 'border-emerald-800/50 bg-emerald-950/30 text-emerald-300'
                : 'border-[#252b3b] bg-[#0e1117] text-slate-400'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {isConnected ? 'STREAM WS ACTIVO' : 'POLLING 5S'}
          </span>

          <button
            type="button"
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              soundEnabled
                ? 'border-blue-600/60 bg-blue-950/50 text-blue-200'
                : 'border-[#252b3b] bg-[#0e1117] text-slate-400 hover:text-slate-200'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z" />
            </svg>
            Alerta Sonora: {soundEnabled ? 'ACTIVA' : 'SILENCIADA'}
          </button>
        </div>
      </section>

      {/* Consola dividida: Cola de Incidentes (Izquierda) + Estación de Inspección (Derecha) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Cola de Incidentes */}
        <div className="lg:col-span-4 rounded-md border border-[#1e2330] bg-[#12151c] flex flex-col overflow-hidden">
          <div className="border-b border-[#1e2330] bg-[#161a23] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Cola de Eventos
            </h3>
            <span className="rounded bg-[#0e1117] border border-[#252b3b] px-2 py-0.5 font-mono text-[11px] text-slate-300">
              {alerts.length} registros
            </span>
          </div>

          {alertsError && (
            <div role="alert" className="m-3 rounded border border-red-500/30 bg-red-950/30 p-2.5 text-xs text-red-300">
              {alertsError}
            </div>
          )}

          {isLoadingAlerts ? (
            <div role="status" className="p-10 text-center text-xs text-slate-500">
              Cargando cola de incidentes...
            </div>
          ) : alerts.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500">
              No existen eventos que coincidan con los filtros aplicados.
            </div>
          ) : (
            <ul className="divide-y divide-[#1a1f2b] max-h-[680px] overflow-y-auto">
              {alerts.map((alert) => {
                const isSelected = alert.id === selectedAlertId;
                const isHighlighted = highlightedAlertIds.has(alert.id);
                return (
                  <li key={alert.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedAlertId(alert.id)}
                      className={`w-full text-left px-4 py-3 transition-colors cursor-pointer border-l-2 ${
                        isHighlighted
                          ? 'border-l-amber-400 bg-amber-950/20'
                          : isSelected
                            ? 'border-l-blue-500 bg-[#191e2b]'
                            : 'border-l-transparent hover:bg-[#161a24]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {renderTypeBadge(alert.alert_type)}
                          {isHighlighted && (
                            <span className="rounded bg-amber-500 px-1.5 py-0.2 text-[9px] font-bold uppercase text-black">
                              NUEVO
                            </span>
                          )}
                        </div>
                        {renderStatusBadge(alert.status)}
                      </div>

                      {alert.alert_type === 'face_match' && Boolean(alert.details?.full_name) && (
                        <div className="text-xs font-semibold text-red-300 truncate mb-1">
                          Sujeto: {String(alert.details?.full_name)}
                        </div>
                      )}

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>CONF: {(alert.confidence * 100).toFixed(1)}%</span>
                        <span>
                          {new Date(alert.occurred_at).toLocaleTimeString('es-BO', {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                            hour12: false,
                          })}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Panel de Detalle y Evidencia */}
        <div className="lg:col-span-8">
          {!selectedAlert ? (
            <div className="rounded-md border border-[#1e2330] bg-[#12151c] p-16 text-center text-xs text-slate-500">
              Seleccione un evento de la cola izquierda para examinar su evidencia audiovisual y emitir un dictamen.
            </div>
          ) : (
            <div className="rounded-md border border-[#1e2330] bg-[#12151c] overflow-hidden">
              {/* Cabecera técnica del incidente */}
              <div className="border-b border-[#1e2330] bg-[#161a23] px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-sm font-semibold text-white">
                      {formatAlertTypeName(selectedAlert.alert_type)}
                    </h3>
                    {renderStatusBadge(selectedAlert.status)}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-4 text-[11px] font-mono text-slate-400">
                    <span>
                      FECHA/HORA: <strong className="text-slate-200">{new Date(selectedAlert.occurred_at).toLocaleString('es-BO')}</strong>
                    </span>
                    <span>
                      CONFIANZA: <strong className="text-emerald-400">{(selectedAlert.confidence * 100).toFixed(1)}%</strong>
                    </span>
                    {selectedAlert.track_id !== null && (
                      <span>
                        PISTA ID: <strong className="text-slate-200">#{selectedAlert.track_id}</strong>
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right font-mono text-[10px] text-slate-500">
                  UUID: {selectedAlert.id}
                </div>
              </div>

              <div className="p-5 space-y-5">
                {/* Ficha de Identificación Biométrica si es persona vetada */}
                {selectedAlert.alert_type === 'face_match' && selectedAlert.details && (
                  <div className="rounded border border-red-800/60 bg-red-950/30 p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-red-300">
                        ● Coincidencia en Padrón Biométrico de Personas Vetadas
                      </span>
                      {Boolean(selectedAlert.details.severity) && (
                        <span className="rounded bg-red-900/60 border border-red-700/60 px-2 py-0.5 font-mono text-[10px] uppercase text-red-200">
                          RIESGO: {String(selectedAlert.details.severity)}
                        </span>
                      )}
                    </div>
                    {Boolean(selectedAlert.details.full_name) && (
                      <p className="text-sm font-bold text-white">
                        Sujeto Identificado: {String(selectedAlert.details.full_name)}
                      </p>
                    )}
                    {Boolean(selectedAlert.details.reason) && (
                      <p className="text-xs text-red-200/90">
                        Causal registrada: {String(selectedAlert.details.reason)}
                      </p>
                    )}
                  </div>
                )}

                {/* Visores de Evidencia Audiovisual */}
                <section aria-label="Evidencia del incidente" className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Evidencia Registrada
                    </h4>
                    <span className="font-mono text-[10px] text-slate-500">
                      ALMACENAMIENTO FORENSE LOCAL
                    </span>
                  </div>

                  {evidenceError && (
                    <div role="alert" className="rounded border border-red-500/30 bg-red-950/30 p-2.5 text-xs text-red-300">
                      {evidenceError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Fotograma JPEG */}
                    <div className="rounded border border-[#222836] bg-[#0b0d11] overflow-hidden">
                      <div className="border-b border-[#1e2330] bg-[#10131a] px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>CAPTURA DE FOTOGRAMA</span>
                        <span>JPEG</span>
                      </div>
                      <div className="aspect-video flex items-center justify-center bg-black">
                        {isLoadingEvidence ? (
                          <span className="text-xs font-mono text-slate-500">Decodificando imagen...</span>
                        ) : snapshotUrl ? (
                          <img
                            src={snapshotUrl}
                            alt={`Captura de incidente ${selectedAlert.alert_type}`}
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <span className="text-xs font-mono text-slate-600">SIN CAPTURA DISPONIBLE</span>
                        )}
                      </div>
                    </div>

                    {/* Clip MP4 */}
                    <div className="rounded border border-[#222836] bg-[#0b0d11] overflow-hidden">
                      <div className="border-b border-[#1e2330] bg-[#10131a] px-3 py-1.5 flex items-center justify-between text-[11px] font-mono text-slate-400">
                        <span>SECUENCIA DE VIDEO</span>
                        <span>MP4 / H.264</span>
                      </div>
                      <div className="aspect-video flex items-center justify-center bg-black">
                        {isLoadingEvidence ? (
                          <span className="text-xs font-mono text-slate-500">Cargando flujo de video...</span>
                        ) : clipUrl ? (
                          <video
                            src={clipUrl}
                            controls
                            preload="metadata"
                            aria-label="Clip de evidencia del incidente"
                            className="max-h-full max-w-full"
                          />
                        ) : (
                          <span className="text-xs font-mono text-slate-600">SIN CLIP DISPONIBLE</span>
                        )}
                      </div>
                    </div>
                  </div>
                </section>

                {/* Sección de Evaluación y Dictamen del Operador */}
                <section aria-label="Acciones de revisión" className="border-t border-[#1e2330] pt-4 space-y-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Dictamen Operativo de Sala de Control
                  </h4>

                  {selectedAlert.status !== 'pending' ? (
                    <div className="rounded border border-[#222836] bg-[#0e1117] p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">Resolución registrada:</span>
                        {renderStatusBadge(selectedAlert.status)}
                      </div>
                      {selectedAlert.reviewed_at && (
                        <div className="text-slate-400 font-mono text-[11px]">
                          TIMESTAMP REVISIÓN:{' '}
                          <span className="text-slate-200">
                            {new Date(selectedAlert.reviewed_at).toLocaleString('es-BO')}
                          </span>
                        </div>
                      )}
                      {selectedAlert.reviewed_by && (
                        <div className="text-slate-400 font-mono text-[11px]">
                          OPERADOR ID: <span className="text-slate-200">{selectedAlert.reviewed_by}</span>
                        </div>
                      )}
                      {selectedAlert.review_notes && (
                        <div className="pt-1.5">
                          <span className="text-[11px] text-slate-500 block mb-1">Observaciones en acta:</span>
                          <p className="rounded border border-[#1e2330] bg-[#12151c] p-2.5 text-slate-300">
                            {selectedAlert.review_notes}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : canReview ? (
                    <div className="rounded border border-[#222836] bg-[#0e1117] p-4 space-y-3">
                      <div>
                        <label htmlFor="review-notes" className="block text-xs font-medium text-slate-300 mb-1">
                          Observaciones del Operador (opcional)
                        </label>
                        <textarea
                          id="review-notes"
                          rows={2}
                          maxLength={1000}
                          value={reviewNotes}
                          disabled={isSubmittingReview}
                          onChange={(e) => setReviewNotes(e.target.value)}
                          placeholder="Consigne las acciones tomadas o detalles relevantes de la verificación..."
                          className="w-full rounded border border-[#252b3b] bg-[#12151c] p-2 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                        />
                      </div>

                      {reviewError && (
                        <div role="alert" className="rounded border border-red-500/30 bg-red-950/30 p-2.5 text-xs text-red-300">
                          {reviewError}
                        </div>
                      )}

                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => handleReview('confirmed')}
                          disabled={isSubmittingReview}
                          className="rounded bg-red-600 hover:bg-red-500 px-4 py-2 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isSubmittingReview ? 'Procesando...' : 'Confirmar Incidente Real'}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleReview('false_alarm')}
                          disabled={isSubmittingReview}
                          className="rounded border border-[#282e3d] bg-[#161a24] hover:bg-[#1e2433] px-4 py-2 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isSubmittingReview ? 'Procesando...' : 'Descartar como Falsa Alarma'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Este evento se encuentra pendiente de dictamen por un operador con privilegios de revisión.
                    </p>
                  )}
                </section>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
