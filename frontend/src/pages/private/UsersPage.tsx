import React, { useCallback, useEffect, useState } from 'react';
import { RoleItem, UserCreatePayload, UserItem, UserUpdatePayload } from '../../types/user';
import { createUser, deleteUser, fetchRoles, fetchUsers, updateUser } from '../../services/apiClient';
import { useAuth } from '../../hooks';

export const UsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterActive, setFilterActive] = useState('all');

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [formData, setFormData] = useState<{
    username: string;
    email: string;
    full_name: string;
    password: string;
    role: string;
    is_active: boolean;
  }>({
    username: '',
    email: '',
    full_name: '',
    password: '',
    role: 'guard',
    is_active: true,
  });
  const [modalError, setModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersRes, rolesRes] = await Promise.all([
        fetchUsers({
          search: search || undefined,
          role: filterRole !== 'all' ? filterRole : undefined,
          is_active: filterActive === 'all' ? undefined : filterActive === 'active',
        }),
        fetchRoles(),
      ]);
      setUsers(usersRes);
      setRoles(rolesRes);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  }, [search, filterRole, filterActive]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenCreate = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      email: '',
      full_name: '',
      password: '',
      role: roles.length > 0 ? roles[0].code : 'guard',
      is_active: true,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (target: UserItem) => {
    setEditingUser(target);
    setFormData({
      username: target.username,
      email: target.email,
      full_name: target.full_name,
      password: '',
      role: target.role,
      is_active: target.is_active,
    });
    setModalError(null);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingUser(null);
    setModalError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setModalError(null);

    try {
      if (editingUser) {
        const payload: UserUpdatePayload = {
          email: formData.email,
          full_name: formData.full_name,
          role: formData.role,
          is_active: formData.is_active,
        };
        if (formData.password.trim()) {
          payload.password = formData.password.trim();
        }
        await updateUser(editingUser.id, payload);
        setSuccessMsg(`Usuario ${formData.username} actualizado exitosamente.`);
      } else {
        if (!formData.password) {
          setModalError('La contraseña es requerida para un nuevo usuario.');
          setSubmitting(false);
          return;
        }
        const payload: UserCreatePayload = {
          username: formData.username.trim(),
          email: formData.email.trim(),
          full_name: formData.full_name.trim(),
          password: formData.password,
          role: formData.role,
          is_active: formData.is_active,
        };
        await createUser(payload);
        setSuccessMsg(`Usuario ${formData.username} registrado exitosamente.`);
      }
      handleCloseModal();
      await loadData();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Error al guardar usuario');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (target: UserItem) => {
    if (currentUser?.id === target.id) {
      alert('No puedes desactivar tu propia cuenta activa.');
      return;
    }
    try {
      await updateUser(target.id, { is_active: !target.is_active });
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado de usuario');
    }
  };

  const handleDelete = async (target: UserItem) => {
    if (currentUser?.id === target.id) {
      alert('No puedes eliminar tu propia cuenta en sesión activa.');
      return;
    }
    if (!window.confirm(`¿Estás seguro de eliminar permanentemente al usuario ${target.username}?`)) {
      return;
    }
    try {
      await deleteUser(target.id);
      setSuccessMsg(`Usuario ${target.username} eliminado correctamente.`);
      await loadData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar usuario');
    }
  };

  const totalUsers = users.length;
  const adminCount = users.filter((u) => u.role === 'admin').length;
  const guardCount = users.filter((u) => u.role === 'guard').length;
  const activeCount = users.filter((u) => u.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-white uppercase font-mono">
              Gestión de Usuarios y Accesos
            </h1>
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono tracking-widest bg-blue-950 border border-blue-800 text-blue-400">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
              CONTROL RBAC ACTIVO
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Administración de cuentas de operadores de guardia, supervisores y permisos de acceso al sistema SIV-Estadio.
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded border border-blue-500 shadow-sm transition"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Registrar Usuario
        </button>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-xs rounded font-mono flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}
      {error && (
        <div className="p-3 bg-red-950/40 border border-red-800 text-red-300 text-xs rounded font-mono flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-[10px] font-mono uppercase text-slate-400 tracking-wider">Total Cuentas</span>
          <p className="mt-2 text-2xl font-bold font-mono text-white">{totalUsers}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Usuarios en base de datos</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-[10px] font-mono uppercase text-emerald-400 tracking-wider">Guardias / Operadores</span>
          <p className="mt-2 text-2xl font-bold font-mono text-emerald-400">{guardCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Operación de sala y alertas</p>
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
          <span className="text-[10px] font-mono uppercase text-purple-400 tracking-wider">Administradores</span>
          <p className="mt-2 text-2xl font-bold font-mono text-purple-400">{adminCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Acceso y control total</p>
        </div>

        <div className="rounded-lg border border-blue-900/40 bg-blue-950/20 p-4">
          <span className="text-[10px] font-mono uppercase text-blue-400 tracking-wider">Cuentas Habilitadas</span>
          <p className="mt-2 text-2xl font-bold font-mono text-white">{activeCount}</p>
          <p className="text-[11px] text-slate-500 mt-0.5">Acceso activo al sistema</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between bg-slate-900/50 p-3 rounded-lg border border-slate-800">
        <div className="relative w-full md:w-80">
          <input
            type="text"
            placeholder="Buscar por nombre, usuario o email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500 font-mono"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500 font-mono"
          >
            <option value="all">Todos los Roles</option>
            {roles.map((r) => (
              <option key={r.code} value={r.code}>
                {r.name}
              </option>
            ))}
          </select>

          <select
            value={filterActive}
            onChange={(e) => setFilterActive(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500 font-mono"
          >
            <option value="all">Todos los Estados</option>
            <option value="active">Solo Activos</option>
            <option value="inactive">Solo Inactivos</option>
          </select>

          <button
            onClick={() => loadData()}
            className="px-3 py-1.5 text-xs font-mono text-slate-300 bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Users Table */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-xs font-mono text-slate-500">Cargando usuarios...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-xs font-mono text-slate-500">No se encontraron usuarios coincidentes.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Usuario</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Rol del Sistema</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Último Acceso</th>
                  <th className="py-3 px-4 text-right">Operaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {users.map((item) => {
                  const isCurrent = currentUser?.id === item.id;
                  const initials = item.full_name
                    .split(' ')
                    .map((n) => n[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase();

                  return (
                    <tr key={item.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-300 text-xs">
                            {initials}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white">{item.full_name}</span>
                              {isCurrent && (
                                <span className="bg-blue-950 border border-blue-800 text-blue-400 text-[9px] px-1.5 py-0.2 rounded font-sans">
                                  TÚ
                                </span>
                              )}
                            </div>
                            <span className="text-[11px] text-slate-400">@{item.username}</span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-slate-300">{item.email}</td>

                      <td className="py-3 px-4">
                        {item.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase bg-purple-950/80 border border-purple-700/60 text-purple-300">
                            🛡️ Administrador
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[11px] font-semibold uppercase bg-emerald-950/80 border border-emerald-700/60 text-emerald-300">
                            👮 Guardia
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <button
                          onClick={() => handleToggleActive(item)}
                          title="Haga clic para cambiar estado"
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase transition ${
                            item.is_active
                              ? 'bg-emerald-950/50 border border-emerald-800 text-emerald-400 hover:bg-emerald-900/60'
                              : 'bg-red-950/50 border border-red-800 text-red-400 hover:bg-red-900/60'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${item.is_active ? 'bg-emerald-400' : 'bg-red-400'}`} />
                          {item.is_active ? 'Habilitado' : 'Deshabilitado'}
                        </button>
                      </td>

                      <td className="py-3 px-4 text-slate-400 text-[11px]">
                        {item.last_login_at
                          ? new Date(item.last_login_at).toLocaleString()
                          : 'Sin registro'}
                      </td>

                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEdit(item)}
                          className="px-2.5 py-1 text-xs text-blue-400 hover:text-white bg-blue-950/60 hover:bg-blue-900/80 border border-blue-800/80 rounded transition"
                        >
                          Editar
                        </button>
                        {!isCurrent && (
                          <button
                            onClick={() => handleDelete(item)}
                            className="px-2.5 py-1 text-xs text-red-400 hover:text-white bg-red-950/60 hover:bg-red-900/80 border border-red-800/80 rounded transition"
                          >
                            Eliminar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Crear / Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                {editingUser ? `Editar Usuario @${editingUser.username}` : 'Registrar Nuevo Usuario'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-500 hover:text-white">✕</button>
            </div>

            {modalError && (
              <div className="p-2.5 bg-red-950/50 border border-red-800 text-red-300 text-xs rounded">
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Nombre Completo</label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="Ej: Sofía Mendoza"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-slate-400 mb-1">Nombre de Usuario (Login)</label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Ej: smendoza"
                    className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-400 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="smendoza@estadio.gob"
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">
                  {editingUser ? 'Nueva Contraseña (dejar en blanco para no cambiar)' : 'Contraseña de Acceso'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder={editingUser ? '••••••••' : 'Mínimo 6 caracteres'}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Rol Operativo</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-white outline-none focus:border-blue-500"
                >
                  {roles.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.name} — {r.description}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="user_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="rounded border-slate-800 bg-slate-950 text-blue-500 focus:ring-0"
                />
                <label htmlFor="user_active" className="text-slate-300 cursor-pointer">
                  Habilitar cuenta inmediatamente
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3 py-1.5 text-slate-400 hover:text-white bg-slate-800 rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 text-white bg-blue-600 hover:bg-blue-500 rounded font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : editingUser ? 'Actualizar Usuario' : 'Crear Usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
