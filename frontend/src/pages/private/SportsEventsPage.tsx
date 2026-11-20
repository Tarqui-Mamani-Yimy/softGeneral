import React, { useCallback, useEffect, useState } from 'react';
import { SportsEvent, SportsEventType, SportsSummary } from '../../types/sports';
import { fetchSportsEvents, fetchSportsSnapshotBlob, fetchSportsSummary } from '../../services/apiClient';

export const SportsEventsPage: React.FC = () => {
  const [summary, setSummary] = useState<SportsSummary | null>(null);
  const [events, setEvents] = useState<SportsEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<SportsEvent | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryRes, eventsRes] = await Promise.all([
        fetchSportsSummary(),
        fetchSportsEvents({
          event_type: filterType !== 'all' ? filterType : undefined,
          limit: 100,
        }),
      ]);
      setSummary(summaryRes);
      setEvents(eventsRes);
      if (eventsRes.length > 0 && !selectedEvent) {
        setSelectedEvent(eventsRes[0]);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar eventos deportivos');
    } finally {
      setLoading(false);
    }
  }, [filterType, selectedEvent]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Load snapshot image blob when selection changes
  useEffect(() => {
    let active = true;
    if (!selectedEvent || !selectedEvent.has_snapshot) {
      setSnapshotUrl(null);
      return;
    }
    setSnapshotLoading(true);
    fetchSportsSnapshotBlob(selectedEvent.id)
      .then((blob) => {
        if (active) {
          const url = URL.createObjectURL(blob);
          setSnapshotUrl(url);
        }
      })
      .catch(() => {
        if (active) setSnapshotUrl(null);
      })
      .finally(() => {
        if (active) setSnapshotLoading(false);
      });

    return () => {
      active = false;
      if (snapshotUrl) {
        URL.revokeObjectURL(snapshotUrl);
      }
    };
  }, [selectedEvent]);

  const getEventBadge = (type: SportsEventType) => {
    switch (type) {
      case 'ball_in_play':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
            <span>⚽</span> Balón en Juego
          </span>
        );
      case 'match_formation':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-sky-950/80 border border-sky-700/60 text-sky-300">
            <span>🏃</span> Formación de Jugadores
          </span>
        );
      case 'referee_active':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-amber-950/80 border border-amber-700/60 text-amber-300">
            <span>🟨</span> Árbitro en Acción
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wider bg-slate-800 text-slate-300">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Telemetry Header */}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded font-mono">
          {error}
        </div>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono">
              Eventos y Analítica Deportiva
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-widest bg-cyan-950 border border-cyan-800 text-cyan-400">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              MÓDULO DEPORTIVO INDEPENDIENTE
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Detección de jugadores, árbitros y balón mediante modelo YOLO11s especializado en fútbol. Totalmente separado de incidentes de seguridad.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400 border border-slate-800 bg-slate-900/80 px-2.5 py-1 rounded">
            Motor: <span className="text-cyan-400 font-semibold">futbol.pt</span>
          </span>
          <button
            onClick={() => loadData()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Actualizar
          </button>
        </div>
      </div>

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wider font-mono">
            <span>Balón en Juego</span>
            <span>⚽</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-400">
              {summary?.total_ball_events ?? 0}
            </span>
            <span className="text-[11px] text-slate-500">registros</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Seguimiento de balón activo</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wider font-mono">
            <span>Jugadores / Formación</span>
            <span>🏃</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-sky-400">
              {summary?.total_formation_events ?? 0}
            </span>
            <span className="text-[11px] text-slate-500">despliegues</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Agrupaciones de jugadores</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 uppercase tracking-wider font-mono">
            <span>Árbitro Rastreado</span>
            <span>🟨</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-amber-400">
              {summary?.total_referee_events ?? 0}
            </span>
            <span className="text-[11px] text-slate-500">momentos</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Presencia arbitral en jugada</p>
        </div>

        <div className="rounded-lg border border-cyan-900/40 bg-cyan-950/20 p-4">
          <div className="flex items-center justify-between text-xs text-cyan-400 uppercase tracking-wider font-mono">
            <span>Total Telemetría</span>
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-white">
              {summary?.total_events ?? 0}
            </span>
            <span className="text-[11px] text-cyan-300/70">eventos</span>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Historial deportivo acumulado</p>
        </div>
      </div>

      {/* Main Grid: List of events + Details / Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Event List */}
        <div className="lg:col-span-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">
              Registro de Jugadas y Telemetría ({events.length})
            </h2>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs bg-slate-900 border border-slate-800 text-slate-300 rounded px-2 py-1 outline-none focus:border-cyan-500 font-mono"
            >
              <option value="all">Todas las Categorías</option>
              <option value="ball_in_play">Balón en Juego</option>
              <option value="match_formation">Formación de Jugadores</option>
              <option value="referee_active">Árbitro en Acción</option>
            </select>
          </div>

          {loading && events.length === 0 ? (
            <div className="p-8 text-center border border-slate-800 rounded-lg bg-slate-900/40 text-xs text-slate-500 font-mono">
              Cargando eventos deportivos...
            </div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-slate-800 rounded-lg bg-slate-900/30 space-y-3">
              <span className="text-3xl">⚽</span>
              <p className="text-xs font-mono text-slate-400">
                Aún no hay eventos deportivos registrados.
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                Sube o analiza un video de un partido de fútbol en <strong>Análisis Forense</strong>. El modelo detectará automáticamente jugadores, árbitro y balón sin mezclarse con las alertas de seguridad.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[640px] overflow-y-auto pr-1">
              {events.map((event) => {
                const isSelected = selectedEvent?.id === event.id;
                return (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`p-3 rounded-lg border transition cursor-pointer ${
                      isSelected
                        ? 'border-cyan-500 bg-cyan-950/20 shadow-md shadow-cyan-950/30'
                        : 'border-slate-800/80 bg-slate-900/50 hover:bg-slate-900 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {getEventBadge(event.event_type)}
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(event.occurred_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs font-mono text-slate-400">
                      <span>
                        Confianza: <strong className="text-white">{(event.confidence * 100).toFixed(1)}%</strong>
                      </span>
                      {event.details.active_players !== undefined && (
                        <span>
                          Jugadores: <strong className="text-sky-400">{event.details.active_players}</strong>
                        </span>
                      )}
                      {event.details.players_count !== undefined && (
                        <span>
                          Jugadores: <strong className="text-sky-400">{event.details.players_count}</strong>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Event Inspection & Snapshot */}
        <div className="lg:col-span-7">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-xs font-mono font-bold tracking-wider text-slate-300 uppercase">
                  Inspección Visual de Telemetría
                </h3>
                <p className="text-[11px] text-slate-500 font-mono">
                  {selectedEvent ? `ID: ${selectedEvent.id}` : 'Selecciona un evento para inspeccionar'}
                </p>
              </div>
              {selectedEvent && getEventBadge(selectedEvent.event_type)}
            </div>

            {selectedEvent ? (
              <div className="space-y-4">
                {/* Snapshot display */}
                <div className="aspect-video w-full rounded-lg bg-slate-950 border border-slate-800 overflow-hidden flex items-center justify-center relative">
                  {snapshotLoading ? (
                    <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                      <span className="w-3 h-3 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                      Cargando fotograma...
                    </div>
                  ) : snapshotUrl ? (
                    <img
                      src={snapshotUrl}
                      alt="Captura de jugada deportiva"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="text-center p-6 text-slate-600 font-mono text-xs">
                      <span>⚽</span>
                      <p className="mt-1">Fotograma no disponible</p>
                    </div>
                  )}

                  <div className="absolute top-2 left-2 bg-slate-950/80 border border-slate-800 px-2 py-0.5 rounded text-[10px] font-mono text-cyan-400">
                    IA: YOLO11s (futbol.pt)
                  </div>
                </div>

                {/* Detail parameters */}
                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  <div className="p-3 rounded bg-slate-950/60 border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] uppercase">Tipo de Detección</span>
                    <span className="text-white font-medium capitalize mt-0.5 block">
                      {selectedEvent.event_type.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <div className="p-3 rounded bg-slate-950/60 border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] uppercase">Certeza de la Red</span>
                    <span className="text-emerald-400 font-bold mt-0.5 block">
                      {(selectedEvent.confidence * 100).toFixed(2)}%
                    </span>
                  </div>

                  <div className="p-3 rounded bg-slate-950/60 border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] uppercase">Fecha y Hora</span>
                    <span className="text-slate-300 mt-0.5 block">
                      {new Date(selectedEvent.occurred_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-3 rounded bg-slate-950/60 border border-slate-800/80">
                    <span className="text-slate-500 block text-[10px] uppercase">Datos Tácticos</span>
                    <span className="text-slate-300 mt-0.5 block truncate">
                      {JSON.stringify(selectedEvent.details)}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500 font-mono text-xs">
                Selecciona un evento deportivo del registro izquierdo para inspeccionar sus métricas.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
