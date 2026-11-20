import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks';
import {
  listCameras,
  createCamera,
  updateCamera,
  disableCamera,
  ApiError,
} from '../../services/apiClient';
import type { Camera, CameraSourceType } from '../../types/camera';

const isSecure = typeof window !== 'undefined' && window.location.protocol === 'https:';
const defaultMtxUrl = isSecure ? '/mediamtx' : 'http://localhost:8889';
const MEDIAMTX_URL = (import.meta.env.VITE_MEDIAMTX_WEBRTC_URL ?? defaultMtxUrl).replace(/\/+$/, '');
const CODE_REGEX = /^[a-z][a-z0-9_]{1,31}$/;

export const CamerasPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('cameras.manage') ?? false;

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCamera, setEditingCamera] = useState<Camera | null>(null);
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formSourceType, setFormSourceType] = useState<CameraSourceType>('rtsp');
  const [formSourceUrl, setFormSourceUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadCameras = useCallback(async () => {
    try {
      const data = await listCameras();
      setCameras(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Error al consultar la matriz de cámaras');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  const openCreateModal = () => {
    setEditingCamera(null);
    setFormCode('');
    setFormName('');
    setFormLocation('');
    setFormSourceType('rtsp');
    setFormSourceUrl('');
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cam: Camera) => {
    setEditingCamera(cam);
    setFormCode(cam.code);
    setFormName(cam.name);
    setFormLocation(cam.location);
    setFormSourceType(cam.source_type);
    setFormSourceUrl(cam.source_url ?? '');
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCamera(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!editingCamera) {
      if (!CODE_REGEX.test(formCode)) {
        setFormError(
          'El código identificador debe iniciar con letra minúscula y contener solo a-z, 0-9 o guion bajo (2-32 caracteres).'
        );
        return;
      }
    }

    if (!formName.trim()) {
      setFormError('El nombre descriptivo del canal es obligatorio.');
      return;
    }

    if (!editingCamera || formSourceUrl) {
      if (formSourceType === 'rtsp') {
        const lower = formSourceUrl.trim().toLowerCase();
        if (!lower.startsWith('rtsp://') && !lower.startsWith('rtsps://')) {
          setFormError('El flujo de origen RTSP debe iniciar con rtsp:// o rtsps://');
          return;
        }
      } else if (formSourceType === 'webcam') {
        if (!/^\d+$/.test(formSourceUrl.trim())) {
          setFormError('Para dispositivo local ingrese el índice numérico (ej. 0)');
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      if (editingCamera) {
        await updateCamera(editingCamera.id, {
          name: formName.trim(),
          location: formLocation.trim(),
          source_type: formSourceType,
          source_url: formSourceUrl.trim() || undefined,
        });
      } else {
        await createCamera({
          code: formCode.trim(),
          name: formName.trim(),
          location: formLocation.trim(),
          source_type: formSourceType,
          source_url: formSourceUrl.trim(),
        });
      }
      closeModal();
      await loadCameras();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.detail : 'Error al guardar la configuración del canal');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async (cam: Camera) => {
    if (!confirm(`¿Confirma dar de baja el canal de cámara "${cam.name}" (${cam.code})?`)) {
      return;
    }
    try {
      await disableCamera(cam.id);
      await loadCameras();
    } catch (err) {
      alert(err instanceof ApiError ? err.detail : 'Error al desactivar la cámara');
    }
  };

  const activeCameras = cameras.filter((c) => c.is_active);

  return (
    <div className="space-y-5">
      {/* Barra superior */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#1e2330] pb-4">
        <div className="flex items-center gap-3 text-xs">
          <div className="rounded border border-[#222836] bg-[#12151c] px-3 py-1.5 flex items-center gap-2">
            <span className="text-slate-400">Canales en Línea:</span>
            <span className="font-mono font-bold text-white">{activeCameras.length}</span>
          </div>
          <div className="rounded border border-[#222836] bg-[#12151c] px-3 py-1.5 flex items-center gap-2 font-mono text-[11px] text-slate-400">
            <span>SERVIDOR DE MEDIOS:</span>
            <span className="text-blue-400">{MEDIAMTX_URL}</span>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer self-start sm:self-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Dar de Alta Cámara
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {isLoading ? (
        <div role="status" className="rounded-md border border-[#1e2330] bg-[#12151c] p-12 text-center text-xs text-slate-500">
          Consultando canales de videovigilancia...
        </div>
      ) : activeCameras.length === 0 ? (
        <div className="rounded-md border border-[#1e2330] bg-[#12151c] p-12 text-center space-y-2">
          <p className="text-xs font-medium text-slate-300">No hay canales de cámara activos en la matriz.</p>
          {canManage && (
            <p className="text-[11px] text-slate-500">
              Utilice el botón "Dar de Alta Cámara" para vincular un flujo RTSP o dispositivo local.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {activeCameras.map((camera) => {
            const playerUrl = `${MEDIAMTX_URL}/${camera.live_path}/`;
            return (
              <div
                key={camera.id}
                className="flex flex-col justify-between rounded-md border border-[#1e2330] bg-[#12151c] overflow-hidden"
              >
                <div>
                  {/* Cabecera OSD de Monitor */}
                  <div className="border-b border-[#1e2330] bg-[#161a23] px-3.5 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 flex-shrink-0" />
                      <span className="font-mono text-xs font-semibold text-white truncate">
                        {camera.code.toUpperCase()}
                      </span>
                      <span className="text-xs text-slate-400 truncate">• {camera.name}</span>
                    </div>
                    <span className="rounded bg-[#0e1117] border border-[#252b3b] px-1.5 py-0.5 font-mono text-[10px] uppercase text-slate-300">
                      {camera.source_type}
                    </span>
                  </div>

                  {/* Visor 16:9 */}
                  <div className="relative aspect-video w-full bg-black border-b border-[#1e2330]">
                    <iframe
                      src={playerUrl}
                      title={`Canal en vivo ${camera.name}`}
                      allow="autoplay"
                      className="h-full w-full border-0"
                    />
                  </div>

                  {/* Metadatos técnicos */}
                  <div className="p-3.5 space-y-1 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Sector / Ubicación:</span>
                      <span className="text-slate-200 font-medium">{camera.location || 'Sector General'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Ruta MediaMTX:</span>
                      <span className="font-mono text-blue-400">{camera.live_path}</span>
                    </div>
                    {canManage && camera.source_url && (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-500 flex-shrink-0">Origen:</span>
                        <span className="font-mono text-slate-400 truncate">{camera.source_url}</span>
                      </div>
                    )}
                  </div>
                </div>

                {canManage && (
                  <div className="border-t border-[#1a1f2b] bg-[#0e1117] px-3.5 py-2.5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(camera)}
                      className="rounded border border-[#282e3d] bg-[#161a24] hover:bg-[#1e2433] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors cursor-pointer"
                    >
                      Configurar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisable(camera)}
                      className="rounded border border-[#282e3d] bg-[#161a24] hover:border-red-800/60 hover:bg-red-950/40 hover:text-red-300 px-2.5 py-1 text-[11px] font-medium text-slate-400 transition-colors cursor-pointer"
                    >
                      Desactivar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Configuración de Canal */}
      {isModalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-md border border-[#242a38] bg-[#12151c] shadow-2xl overflow-hidden">
            <div className="border-b border-[#1e2330] bg-[#161a23] px-5 py-3.5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">
                {editingCamera ? `Configurar Canal: ${editingCamera.code}` : 'Alta de Nuevo Canal de Video'}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {formError && (
                <div role="alert" className="rounded border border-red-500/30 bg-red-950/30 p-2.5 text-xs text-red-300">
                  {formError}
                </div>
              )}

              {!editingCamera && (
                <div>
                  <label htmlFor="camera-code" className="block text-xs font-medium text-slate-300 mb-1">
                    Código Identificador (ID Técnico) *
                  </label>
                  <input
                    id="camera-code"
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toLowerCase())}
                    placeholder="ej. cam_acceso_norte_01"
                    className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs font-mono text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Solo minúsculas, dígitos y guion bajo (2 a 32 caracteres).
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="camera-name" className="block text-xs font-medium text-slate-300 mb-1">
                  Designación del Canal *
                </label>
                <input
                  id="camera-name"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="ej. Torniquetes Tribuna Norte"
                  className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="camera-location" className="block text-xs font-medium text-slate-300 mb-1">
                  Sector / Ubicación Física
                </label>
                <input
                  id="camera-location"
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="ej. Puerta 4 - Nivel Calle"
                  className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="camera-type" className="block text-xs font-medium text-slate-300 mb-1">
                  Tipo de Entrada
                </label>
                <select
                  id="camera-type"
                  value={formSourceType}
                  onChange={(e) => setFormSourceType(e.target.value as CameraSourceType)}
                  className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="rtsp">Flujo de Red RTSP / IP</option>
                  <option value="webcam">Dispositivo USB / Cámara Local</option>
                  <option value="file">Archivo de Video en Bucle</option>
                </select>
              </div>

              <div>
                <label htmlFor="camera-url" className="block text-xs font-medium text-slate-300 mb-1">
                  Dirección URI o Índice de Origen
                </label>
                <input
                  id="camera-url"
                  type="text"
                  required={!editingCamera}
                  value={formSourceUrl}
                  onChange={(e) => setFormSourceUrl(e.target.value)}
                  placeholder={
                    formSourceType === 'rtsp'
                      ? 'rtsp://127.0.0.1:8554/cam_norte_01'
                      : formSourceType === 'webcam'
                        ? '0'
                        : '/datos/muestra.mp4'
                  }
                  className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs font-mono text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#1e2330]">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting}
                  className="rounded border border-[#282e3d] bg-[#161a24] px-3.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Guardando...' : editingCamera ? 'Actualizar Canal' : 'Registrar Canal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
