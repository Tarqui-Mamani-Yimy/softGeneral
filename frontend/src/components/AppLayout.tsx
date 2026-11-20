import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks';
import { AIAssistantModal } from './AIAssistantModal';

interface NavItem {
  name: string;
  to: string;
  group: 'monitoreo' | 'control' | 'sistema' | 'deportiva';
  icon: React.ReactNode;
}

const SECTION_TITLES: Record<string, { title: string; subtitle: string }> = {
  '/dashboard': {
    title: 'Centro de Operaciones y Monitoreo',
    subtitle: 'Estado operativo de cámaras, analítica de video e incidentes activos',
  },
  '/alerts': {
    title: 'Consola de Gestión de Incidentes',
    subtitle: 'Recepción, verificación de evidencia audiovisual y dictamen operativo',
  },
  '/cameras': {
    title: 'Matriz de Cámaras de Vigilancia',
    subtitle: 'Administración de canales RTSP / WebRTC y visualización en tiempo real',
  },
  '/sports': {
    title: 'Eventos y Analítica Deportiva',
    subtitle: 'Detección y seguimiento de jugadores, árbitros y balón de fútbol mediante IA',
  },
  '/banned-persons': {
    title: 'Registro Biométrico de Restricción de Acceso',
    subtitle: 'Base de datos de vectores faciales SFace (128-D) de personas vetadas',
  },
  '/videos': {
    title: 'Análisis Forense de Grabaciones',
    subtitle: 'Procesamiento diferido de archivos de video e inspección de detecciones',
  },
  '/users': {
    title: 'Gestión de Usuarios y Accesos',
    subtitle: 'Administración de cuentas de operadores, roles y permisos de acceso RBAC',
  },
  '/demo': {
    title: 'Terminal de Prueba de Canal en Vivo',
    subtitle: 'Inyección de señal local por WebRTC (WHIP) hacia el motor analítico',
  },
};

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const canManageCameras = user?.permissions.includes('cameras.manage') ?? false;
  const canManageUsers = (user?.permissions.includes('users.manage') || user?.role === 'admin') ?? false;

  const [clock, setClock] = useState(() => new Date());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const navItems: NavItem[] = [
    {
      name: 'Centro de Control',
      to: '/dashboard',
      group: 'monitoreo',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
    },
    {
      name: 'Incidentes y Alertas',
      to: '/alerts',
      group: 'monitoreo',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
        </svg>
      ),
    },
    {
      name: 'Red de Cámaras',
      to: '/cameras',
      group: 'monitoreo',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
        </svg>
      ),
    },
    {
      name: 'Eventos Deportivos',
      to: '/sports',
      group: 'deportiva',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.504-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.004 0H9.496m5.004 0a5.25 5.25 0 00-5.004 0m5.004 0A6.75 6.75 0 0118 10.5V6a2.25 2.25 0 00-2.25-2.25H8.25A2.25 2.25 0 006 6v4.5c0 1.996.866 3.805 2.25 5.062" />
        </svg>
      ),
    },
    {
      name: 'Padrón de Vetados',
      to: '/banned-persons',
      group: 'control',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
        </svg>
      ),
    },
    {
      name: 'Análisis Forense',
      to: '/videos',
      group: 'control',
      icon: (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 7.746 6 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125m-12 5.25v-5.25m0 5.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125m-12 0v-1.5c0-.621-.504-1.125-1.125-1.125M18 18.375v-5.25m0 5.25v-1.5c0-.621.504-1.125 1.125-1.125M18 13.125v1.5c0 .621.504 1.125 1.125 1.125M18 13.125c0-.621.504-1.125 1.125-1.125M6 13.125v1.5c0 .621-.504 1.125-1.125 1.125M6 13.125C6 12.504 5.496 12 4.875 12m-1.5 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M19.125 12h1.5m0 0c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h1.5m14.25 0h1.5" />
        </svg>
      ),
    },
    ...(canManageUsers
      ? [
          {
            name: 'Gestión de Usuarios',
            to: '/users',
            group: 'control' as const,
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            ),
          },
        ]
      : []),
    ...(canManageCameras
      ? [
          {
            name: 'Canal de Prueba',
            to: '/demo',
            group: 'sistema' as const,
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
              </svg>
            ),
          },
        ]
      : []),
  ];

  const currentSection = SECTION_TITLES[location.pathname] ?? {
    title: 'Sistema Integrado de Videovigilancia',
    subtitle: 'Operaciones de seguridad del recinto deportivo',
  };

  const renderGroup = (groupKey: NavItem['group'], label: string) => {
    const items = navItems.filter((i) => i.group === groupKey);
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {label}
        </div>
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `group flex items-center gap-2.5 rounded px-3 py-2 text-[13px] font-medium transition-all ${
                isActive
                  ? 'bg-blue-600/15 text-blue-400 border-l-2 border-blue-500 pl-[10px]'
                  : 'text-slate-400 hover:bg-[#181c26] hover:text-slate-200'
              }`
            }
          >
            <span className="flex-shrink-0">{item.icon}</span>
            <span className="truncate">{item.name}</span>
          </NavLink>
        ))}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#0b0d11] text-slate-100 relative">
      {/* Backdrop móvil */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Barra lateral institucional */}
      <aside
        className={`${
          isMobileMenuOpen ? 'fixed inset-y-0 left-0 z-50 flex shadow-2xl' : 'hidden md:flex'
        } w-60 flex-shrink-0 border-r border-[#1e2330] bg-[#10131a] flex-col justify-between select-none transition-all duration-200`}
      >
        <div>
          {/* Cabecera de marca */}
          <div className="h-14 border-b border-[#1e2330] px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-blue-600/15 border border-blue-500/30 text-blue-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold tracking-tight text-white">SIV-Estadio</span>
                  <span className="rounded bg-[#1a1f2c] border border-[#2a3142] px-1 py-0.2 text-[9px] font-mono text-slate-400">
                    VMS
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">Seguridad & Biometría</p>
              </div>
            </div>

            {/* Botón cerrar en móvil */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(false)}
              className="md:hidden p-1 text-slate-400 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Menú de navegación agrupado */}
          <nav aria-label="Navegación principal" className="p-3 space-y-5">
            {renderGroup('monitoreo', 'Monitoreo en Vivo')}
            {renderGroup('deportiva', 'Analítica Deportiva')}
            {renderGroup('control', 'Control e Inteligencia')}
            {renderGroup('sistema', 'Diagnóstico')}
          </nav>
        </div>

        {/* Panel inferior de operador */}
        <div className="border-t border-[#1e2330] bg-[#0d1016] p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 px-1">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-200 truncate">
                {user?.full_name ?? 'Operador de Turno'}
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-mono uppercase text-slate-400">
                  {user?.role === 'admin' ? 'Administrador' : user?.role ?? 'Operador'}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Cerrar sesión"
              className="rounded border border-[#252b3b] bg-[#161a24] hover:bg-red-950/40 hover:border-red-800/60 hover:text-red-300 p-1.5 text-slate-400 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
            </button>
          </div>
          <div className="flex items-center justify-between rounded bg-[#131720] border border-[#1c212e] px-2.5 py-1 text-[10px] font-mono text-slate-500">
            <span>APP MÓVIL: PWA</span>
            <span className="text-blue-400">EN LÍNEA</span>
          </div>
        </div>
      </aside>

      {/* Contenedor principal */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Barra superior de estado operativo */}
        <header className="flex h-14 items-center justify-between border-b border-[#1e2330] bg-[#10131a] px-4 sm:px-6">
          <div className="flex items-center min-w-0">
            {/* Botón menú móvil */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden mr-3 p-1.5 rounded-lg border border-[#222836] bg-[#151922] text-slate-300 hover:text-white"
              title="Abrir menú"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-white truncate">{currentSection.title}</h1>
              <p className="text-[11px] text-slate-400 truncate hidden sm:block">{currentSection.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2 rounded border border-[#222836] bg-[#151922] px-3 py-1 text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="text-[11px] font-medium text-slate-300">Motor IA:</span>
              <span className="text-[11px] font-mono text-slate-400">YOLOv8 + SFace</span>
            </div>

            <div className="text-right font-mono">
              <div className="text-xs font-semibold text-slate-200 tabular-nums">
                {clock.toLocaleTimeString('es-BO', { hour12: false })}
              </div>
              <div className="text-[10px] text-slate-500 hidden sm:block">
                {clock.toLocaleDateString('es-BO', { day: '2-digit', month: 'short', year: 'numeric' })}
              </div>
            </div>
          </div>
        </header>

        {/* Área de trabajo */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>

      {/* Asistente Inteligente flotante */}
      <AIAssistantModal />
    </div>
  );
};
