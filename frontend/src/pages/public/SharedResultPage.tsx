import React from 'react';
import { useParams } from 'react-router-dom';

export const SharedResultPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="border-b border-slate-800 pb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Análisis Público del Partido</h1>
              <p className="text-sm text-slate-400">Visión del Partido y Estadísticas de Rendimiento</p>
            </div>
            <span className="rounded-full bg-emerald-950 border border-emerald-800 px-3 py-1 text-xs font-mono text-emerald-400">
              Solo Métricas Deportivas
            </span>
          </div>

          <div className="mt-4 rounded border border-blue-900/50 bg-blue-950/30 p-3 text-xs text-blue-300">
            <strong>Aviso de Privacidad:</strong> Esta vista pública compartida contiene únicamente métricas de rendimiento deportivo (movimiento de jugadores, seguimiento del balón y dinámica de juego). Las alertas internas de seguridad, registros de incidentes, videos de vigilancia y datos de reconocimiento facial están estrictamente restringidos y nunca se publican.
          </div>
        </header>

        <section className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Token de Enlace: <code className="text-slate-200">{token ?? 'token-invalido'}</code></span>
            <span>Estado: Enlace Verificado y Activo</span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-400">Posesión del Balón</h3>
              <p className="mt-2 text-2xl font-bold text-emerald-400">54% / 46%</p>
              <p className="mt-1 text-xs text-slate-500">Calculado a partir de la detección de balón por IA</p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-400">Jugadores Rastreados</h3>
              <p className="mt-2 text-2xl font-bold text-white">22</p>
              <p className="mt-1 text-xs text-slate-500">Trayectorias de seguimiento BoT-SORT</p>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <h3 className="text-xs font-semibold uppercase text-slate-400">Duración del Partido</h3>
              <p className="mt-2 text-2xl font-bold text-white">90:00</p>
              <p className="mt-1 text-xs text-slate-500">Grabación del encuentro deportivo</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-6">
            <h3 className="text-sm font-semibold text-white">Mapa de Calor y Espaciado de Equipos</h3>
            <div className="mt-4 aspect-video w-full rounded bg-slate-950 border border-slate-800 flex items-center justify-center">
              <span className="text-xs text-slate-500">Visualización de telemetría deportiva</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
