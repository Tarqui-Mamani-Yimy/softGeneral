import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  getHealth,
  listCameras,
  listAlerts,
  listBannedPersons,
  listVideos,
  HealthResponse,
} from '../../services/apiClient';
import type { Camera } from '../../types/camera';
import type { Alert } from '../../types/alert';
import type { BannedPerson } from '../../types/bannedPerson';
import type { VideoJob } from '../../types/video';

const ALERT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  face_match: { label: 'Persona Vetada', color: 'border-red-700/60 bg-red-950/60 text-red-300' },
  weapon: { label: 'Arma Detectada', color: 'border-rose-700/60 bg-rose-950/60 text-rose-300' },
  fire_smoke: { label: 'Fuego / Humo', color: 'border-orange-700/60 bg-orange-950/60 text-orange-300' },
  fight: { label: 'Altercado / Pelea', color: 'border-amber-700/60 bg-amber-950/60 text-amber-300' },
  intrusion: { label: 'Intrusión de Zona', color: 'border-blue-700/60 bg-blue-950/60 text-blue-300' },
};

export const DashboardPage: React.FC = () => {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [bannedPersons, setBannedPersons] = useState<BannedPerson[]>([]);
  const [videos, setVideos] = useState<VideoJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboardData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [healthRes, camsRes, alertsRes, bannedRes, videosRes] = await Promise.allSettled([
        getHealth(),
        listCameras(),
        listAlerts({ limit: 15 }),
        listBannedPersons(false),
        listVideos(15, 0),
      ]);

      if (healthRes.status === 'fulfilled') {
        setHealth(healthRes.value);
        setHealthError(null);
      } else {
        setHealthError(healthRes.reason?.message ?? 'Error de conexión');
      }

      if (camsRes.status === 'fulfilled') setCameras(camsRes.value);
      if (alertsRes.status === 'fulfilled') setAlerts(alertsRes.value);
      if (bannedRes.status === 'fulfilled') setBannedPersons(bannedRes.value);
      if (videosRes.status === 'fulfilled') setVideos(videosRes.value);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const activeCameras = cameras.filter((c) => c.is_active);
  const pendingAlerts = alerts.filter((a) => a.status === 'pending');
  const confirmedAlerts = alerts.filter((a) => a.status === 'confirmed');
  const highRiskBanned = bannedPersons.filter((p) => p.severity === 'high');
  const completedVideos = videos.filter((v) => v.status === 'completed');
  const activeVideos = videos.filter((v) => v.status === 'processing' || v.status === 'queued');

  return (
    <div className="space-y-6">
      {/* Barra superior de acciones de resumen */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1e2330] pb-4">
        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-2 rounded border px-2.5 py-1 text-xs font-medium ${
              health
                ? 'border-emerald-800/60 bg-emerald-950/30 text-emerald-300'
                : healthError
                  ? 'border-red-800/60 bg-red-950/30 text-red-300'
                  : 'border-[#252b3b] bg-[#141821] text-slate-400'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                health ? 'bg-emerald-400' : healthError ? 'bg-red-400' : 'bg-slate-500'
              }`}
            />
            <span>
              {health
                ? `Servidor Central En Línea (${health.status.toUpperCase()})`
                : healthError
                  ? `Servidor Inalcanzable (${healthError})`
                  : 'Comprobando telemetría...'}
            </span>
          </div>
          <span className="text-xs text-slate-500 hidden md:inline">
            Actualización en tiempo real vía WebSocket habilitada
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadDashboardData}
            className="inline-flex items-center gap-1.5 rounded border border-[#252b3b] bg-[#141821] hover:bg-[#1a202c] px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sincronizar Datos
          </button>
          <Link
            to="/demo"
            className="inline-flex items-center gap-1.5 rounded bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white transition-colors"
          >
            Abrir Canal en Vivo
          </Link>
        </div>
      </div>

      {/* Tarjetas de Indicadores Operativos (KPIs reales) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Link
          to="/cameras"
          className="group rounded-md border border-[#1e2330] bg-[#12151c] hover:border-[#2e364a] p-4 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Canales de Video Activos</span>
            <span className="rounded bg-blue-950/60 border border-blue-800/50 px-1.5 py-0.5 text-[10px] font-mono text-blue-300">
              RTSP / WebRTC
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {isLoading ? '—' : activeCameras.length}
            </span>
            <span className="text-xs text-slate-500">
              de {cameras.length} registrados
            </span>
          </div>
        </Link>

        <Link
          to="/alerts"
          className="group rounded-md border border-[#1e2330] bg-[#12151c] hover:border-[#2e364a] p-4 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Incidentes sin Resolver</span>
            <span
              className={`rounded border px-1.5 py-0.5 text-[10px] font-mono ${
                pendingAlerts.length > 0
                  ? 'border-amber-800/60 bg-amber-950/60 text-amber-300'
                  : 'border-[#252b3b] bg-[#161a24] text-slate-400'
              }`}
            >
              {pendingAlerts.length > 0 ? 'REQUIERE ATENCIÓN' : 'AL DÍA'}
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-amber-400 tabular-nums">
              {isLoading ? '—' : pendingAlerts.length}
            </span>
            <span className="text-xs text-slate-500">
              {confirmedAlerts.length} confirmados recientes
            </span>
          </div>
        </Link>

        <Link
          to="/banned-persons"
          className="group rounded-md border border-[#1e2330] bg-[#12151c] hover:border-[#2e364a] p-4 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Padrón Biométrico de Vetos</span>
            <span className="rounded bg-red-950/60 border border-red-800/50 px-1.5 py-0.5 text-[10px] font-mono text-red-300">
              SFACE 128-D
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {isLoading ? '—' : bannedPersons.length}
            </span>
            <span className="text-xs text-slate-500">
              {highRiskBanned.length} de peligrosidad alta
            </span>
          </div>
        </Link>

        <Link
          to="/videos"
          className="group rounded-md border border-[#1e2330] bg-[#12151c] hover:border-[#2e364a] p-4 transition-all"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Trabajos Forenses de Video</span>
            <span className="rounded bg-[#181c26] border border-[#252b3b] px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
              BATCH
            </span>
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-white tabular-nums">
              {isLoading ? '—' : videos.length}
            </span>
            <span className="text-xs text-slate-500">
              {completedVideos.length} completados • {activeVideos.length} en curso
            </span>
          </div>
        </Link>
      </div>

      {/* Área Operativa Principal: Últimos Incidentes + Estado de Sub-sistemas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Tabla de Incidentes Recientes */}
        <section className="lg:col-span-8 rounded-md border border-[#1e2330] bg-[#12151c] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#1e2330] px-5 py-3.5">
              <div>
                <h2 className="text-sm font-semibold text-white">Bitácora Reciente de Incidentes</h2>
                <p className="text-xs text-slate-400">
                  Últimos eventos reportados por los motores de visión en cámaras y grabaciones
                </p>
              </div>
              <Link
                to="/alerts"
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                Ver consola completa →
              </Link>
            </div>

            {isLoading ? (
              <div className="p-10 text-center text-xs text-slate-500">
                Consultando bitácora de incidentes...
              </div>
            ) : alerts.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-xs text-slate-400">No se registran incidentes en la bitácora reciente.</p>
                <p className="text-[11px] text-slate-500">
                  Inicie una transmisión en <Link to="/demo" className="text-blue-400 underline">Canal de Prueba</Link> o procese una grabación en <Link to="/videos" className="text-blue-400 underline">Análisis Forense</Link>.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#1e2330] bg-[#0e1117] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="py-2.5 px-4">Clasificación</th>
                      <th className="py-2.5 px-4">Detalle / Sujeto</th>
                      <th className="py-2.5 px-4">Confianza</th>
                      <th className="py-2.5 px-4">Estado</th>
                      <th className="py-2.5 px-4">Hora de Registro</th>
                      <th className="py-2.5 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1a1f2b]">
                    {alerts.slice(0, 8).map((alert) => {
                      const meta = ALERT_TYPE_LABELS[alert.alert_type] ?? {
                        label: alert.alert_type.toUpperCase(),
                        color: 'border-slate-700 bg-slate-900 text-slate-300',
                      };
                      const subjectName =
                        alert.alert_type === 'face_match' && typeof alert.details?.full_name === 'string'
                          ? alert.details.full_name
                          : typeof alert.details?.zone === 'string'
                            ? `Zona: ${alert.details.zone}`
                            : alert.track_id !== null
                              ? `Pista #${alert.track_id}`
                              : 'Detección general';

                      return (
                        <tr key={alert.id} className="hover:bg-[#161a24] transition-colors">
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium ${meta.color}`}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-300 font-medium truncate max-w-[180px]">
                            {subjectName}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap font-mono text-slate-200">
                            {(alert.confidence * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {alert.status === 'pending' && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                                Pendiente
                              </span>
                            )}
                            {alert.status === 'confirmed' && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-red-400">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                                Confirmada
                              </span>
                            )}
                            {alert.status === 'false_alarm' && (
                              <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                                Descartada
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                            {new Date(alert.occurred_at).toLocaleString('es-BO', {
                              day: '2-digit',
                              month: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                              hour12: false,
                            })}
                          </td>
                          <td className="py-2.5 px-4 whitespace-nowrap text-right">
                            <Link
                              to="/alerts"
                              className="rounded border border-[#262c3d] bg-[#161a24] hover:bg-[#1e2433] px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
                            >
                              Auditar
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="border-t border-[#1e2330] bg-[#0e1117] px-5 py-2.5 flex items-center justify-between text-[11px] text-slate-500">
            <span>Mostrando hasta 8 eventos más recientes</span>
            <span className="font-mono">RETENCIÓN DE EVIDENCIA: MP4 + JPEG</span>
          </div>
        </section>

        {/* Columna Derecha: Motores Analíticos y Estado de Infraestructura */}
        <div className="lg:col-span-4 space-y-6">
          {/* Motores de Visión Activos */}
          <section className="rounded-md border border-[#1e2330] bg-[#12151c]">
            <div className="border-b border-[#1e2330] px-4 py-3">
              <h2 className="text-sm font-semibold text-white">Módulos Analíticos Cargados</h2>
              <p className="text-[11px] text-slate-400">Pipeline de inferencia neuronal en ejecución</p>
            </div>
            <div className="divide-y divide-[#1a1f2b] text-xs">
              <div className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-200">Reconocimiento Biométrico</p>
                  <p className="text-[11px] text-slate-500">OpenCV YuNet + SFace ONNX (128-D)</p>
                </div>
                <span className="rounded bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  ACTIVO
                </span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-200">Rastreo Multi-Objeto e Intrusión</p>
                  <p className="text-[11px] text-slate-500">YOLOv8n + ByteTrack (Polígonos de Zona)</p>
                </div>
                <span className="rounded bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  ACTIVO
                </span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-200">Detección de Armas</p>
                  <p className="text-[11px] text-slate-500">Clasificador especializado (`armas.pt`)</p>
                </div>
                <span className="rounded bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  ACTIVO
                </span>
              </div>
              <div className="px-4 py-2.5 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-200">Fuego, Bengala y Humo</p>
                  <p className="text-[11px] text-slate-500">Detector pirotécnico (`fuegoHumo.pt`)</p>
                </div>
                <span className="rounded bg-emerald-950/50 border border-emerald-800/50 px-2 py-0.5 text-[10px] font-mono text-emerald-300">
                  ACTIVO
                </span>
              </div>
            </div>
          </section>

          {/* Operaciones Rápidas */}
          <section className="rounded-md border border-[#1e2330] bg-[#12151c] p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Operaciones Frecuentes
            </h2>
            <div className="grid grid-cols-1 gap-2 text-xs">
              <Link
                to="/banned-persons"
                className="flex items-center justify-between rounded border border-[#222836] bg-[#161a24] hover:bg-[#1c212e] px-3 py-2.5 text-slate-200 transition-colors"
              >
                <span className="font-medium">Registrar Persona en Lista de Veto</span>
                <span className="font-mono text-slate-400">→</span>
              </Link>
              <Link
                to="/cameras"
                className="flex items-center justify-between rounded border border-[#222836] bg-[#161a24] hover:bg-[#1c212e] px-3 py-2.5 text-slate-200 transition-colors"
              >
                <span className="font-medium">Configurar Canal de Cámara RTSP</span>
                <span className="font-mono text-slate-400">→</span>
              </Link>
              <Link
                to="/videos"
                className="flex items-center justify-between rounded border border-[#222836] bg-[#161a24] hover:bg-[#1c212e] px-3 py-2.5 text-slate-200 transition-colors"
              >
                <span className="font-medium">Subir Evidencia de Video para Análisis</span>
                <span className="font-mono text-slate-400">→</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
