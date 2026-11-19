import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks';

interface NavItem {
  name: string;
  to: string;
}

const navItems: NavItem[] = [
  { name: 'Dashboard', to: '/dashboard' },
  { name: 'Alerts', to: '/alerts' },
  { name: 'Cameras', to: '/cameras' },
  { name: 'Videos', to: '/videos' },
];

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const canManageCameras = user?.permissions.includes('cameras.manage') ?? false;

  const currentNavItems: NavItem[] = [
    ...navItems,
    ...(canManageCameras ? [{ name: 'Try demo', to: '/demo' }] : []),
  ];

  return (
    <div className="flex min-h-screen bg-slate-900 text-slate-100">
      {/* Sidebar navigation for security operations */}
      <aside className="w-64 flex-shrink-0 border-r border-slate-800 bg-slate-950 p-4 flex flex-col justify-between">
        <div className="space-y-6">
          <div className="px-2">
            <h1 className="text-xl font-bold tracking-tight text-emerald-400">softGeneral</h1>
            <p className="text-xs text-slate-400">Stadium Security Console</p>
          </div>

          <nav aria-label="Main Navigation" className="flex flex-col gap-1">
            {currentNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-emerald-600/20 text-emerald-300 border-l-4 border-emerald-500'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`
                }
              >
                {item.name}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User / Guard session status & Logout */}
        <div className="border-t border-slate-800 pt-4 px-2">
          <div className="mb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active Operator</p>
            <p className="text-sm font-medium text-slate-200">{user?.full_name ?? 'Authenticated Operator'}</p>
            <p className="text-xs font-mono capitalize text-emerald-400">{user?.role ?? 'guard'}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="w-full rounded bg-slate-800 hover:bg-slate-700 px-3 py-2 text-xs font-medium text-slate-200 hover:text-white transition-colors cursor-pointer text-center"
          >
            Log out
          </button>
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-slate-800 bg-slate-950/70 px-6 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              System Live • Guard Operations Mode
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
