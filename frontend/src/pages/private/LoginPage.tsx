import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks';
import { ApiError } from '../../services/apiClient';

export const LoginPage: React.FC = () => {
  const { user, token, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (token && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await login({ identifier, password });
      const from = (location.state as { from?: { pathname?: string } })?.from?.pathname ?? '/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.detail);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Credenciales de acceso inválidas');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#0b0d11] px-4 py-8">
      {/* Cabecera superior discreta */}
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between border-b border-[#1e2330] pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600/15 border border-blue-500/30 text-blue-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="text-sm font-semibold tracking-tight text-white">SIV-Estadio</span>
          <span className="text-xs text-slate-500">| Plataforma de Videovigilancia y Control Biométrico</span>
        </div>
        <span className="font-mono text-[11px] text-slate-500">NODO LOCAL • v2.4</span>
      </div>

      {/* Tarjeta central de autenticación */}
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-md border border-[#222734] bg-[#12151c] shadow-2xl overflow-hidden">
          <div className="border-b border-[#1e2330] bg-[#161a23] px-6 py-4">
            <h1 className="text-base font-semibold text-white">Autenticación de Operador</h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Ingrese sus credenciales asignadas para acceder a la consola de monitoreo.
            </p>
          </div>

          <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
            <div>
              <label htmlFor="login-identifier" className="block text-xs font-medium text-slate-300 mb-1.5">
                Identificador de Usuario o Correo
              </label>
              <input
                id="login-identifier"
                name="identifier"
                type="text"
                required
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={isSubmitting}
                value={identifier}
                onChange={(e) => {
                  setIdentifier(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="ej. admin"
                aria-describedby={error ? 'login-error-msg' : undefined}
                className="block w-full rounded border border-[#282e3d] bg-[#0e1117] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-xs font-medium text-slate-300 mb-1.5">
                Clave de Acceso
              </label>
              <input
                id="login-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                disabled={isSubmitting}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="••••••••••••"
                aria-describedby={error ? 'login-error-msg' : undefined}
                className="block w-full rounded border border-[#282e3d] bg-[#0e1117] px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            {error && (
              <div
                id="login-error-msg"
                role="alert"
                aria-live="polite"
                className="rounded border border-red-500/30 bg-red-950/30 px-3 py-2.5 text-xs text-red-300 flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !identifier.trim() || !password}
                className="flex w-full justify-center items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting ? 'Verificando credenciales...' : 'Ingresar a Consola'}
              </button>
            </div>
          </form>

          <div className="border-t border-[#1e2330] bg-[#0e1117] px-6 py-3 flex items-center justify-between text-[11px] text-slate-500">
            <span>Acceso auditado por registro de seguridad</span>
            <span className="font-mono">TLS / JWT</span>
          </div>
        </div>
      </div>

      {/* Pie de página */}
      <div className="mx-auto w-full max-w-5xl text-center text-[11px] text-slate-600">
        Sistema de Seguridad Física y Analítica de Video para Recintos Deportivos
      </div>
    </div>
  );
};
