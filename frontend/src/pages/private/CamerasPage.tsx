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

const MEDIAMTX_URL = (import.meta.env.VITE_MEDIAMTX_WEBRTC_URL ?? 'http://localhost:8889').replace(/\/+$/, '');
const CODE_REGEX = /^[a-z][a-z0-9_]{1,31}$/;

export const CamerasPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('cameras.manage') ?? false;

  const [cameras, setCameras] = useState<Camera[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form modal state
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
      setError(err instanceof ApiError ? err.detail : 'Failed to load cameras list');
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

    // Validation
    if (!editingCamera) {
      if (!CODE_REGEX.test(formCode)) {
        setFormError('Code must start with lowercase letter, contain only a-z, 0-9, and underscore (2-32 chars).');
        return;
      }
    }

    if (!formName.trim()) {
      setFormError('Camera name is required.');
      return;
    }

    if (!editingCamera || formSourceUrl) {
      if (formSourceType === 'rtsp') {
        const lower = formSourceUrl.trim().toLowerCase();
        if (!lower.startsWith('rtsp://') && !lower.startsWith('rtsps://')) {
          setFormError('RTSP source URL must start with rtsp:// or rtsps://');
          return;
        }
      } else if (formSourceType === 'webcam') {
        if (!/^\d+$/.test(formSourceUrl.trim())) {
          setFormError('Webcam source URL must be device index digits (e.g. 0)');
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
      setFormError(err instanceof ApiError ? err.detail : 'Failed to save camera');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDisable = async (cam: Camera) => {
    if (!confirm(`Are you sure you want to disable camera '${cam.name}'?`)) {
      return;
    }
    try {
      await disableCamera(cam.id);
      await loadCameras();
    } catch (err) {
      alert(err instanceof ApiError ? err.detail : 'Failed to disable camera');
    }
  };

  const activeCameras = cameras.filter((c) => c.is_active);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Live Camera Surveillance</h2>
          <p className="text-sm text-slate-400">
            Real-time low-latency video streams from stadium cameras via WebRTC.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openCreateModal}
            className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors cursor-pointer self-start sm:self-auto"
          >
            + Register New Camera
          </button>
        )}
      </div>

      {error && (
        <div role="alert" className="rounded border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-400">
          {error}
        </div>
      )}

      {isLoading ? (
        <div role="status" className="rounded-lg border border-slate-800 bg-slate-950 p-12 text-center text-xs text-slate-500">
          Loading surveillance cameras...
        </div>
      ) : activeCameras.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-950 p-12 text-center text-xs text-slate-500 space-y-2">
          <p>No active cameras registered in the system.</p>
          {canManage && (
            <p className="text-slate-400">Click "+ Register New Camera" above to configure your first camera feed.</p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {activeCameras.map((camera) => {
            const playerUrl = `${MEDIAMTX_URL}/${camera.live_path}`;
            return (
              <div
                key={camera.id}
                className="flex flex-col justify-between rounded-lg border border-slate-800 bg-slate-950 p-4 shadow-md"
              >
                <div className="space-y-3">
                  {/* Embedded WebRTC Live Player */}
                  <div className="relative aspect-video w-full overflow-hidden rounded-md border border-slate-800 bg-black">
                    <iframe
                      src={playerUrl}
                      title={`${camera.name} live feed`}
                      allow="autoplay"
                      className="h-full w-full border-0"
                    />
                  </div>

                  {/* Camera Metadata */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm font-bold text-white capitalize">{camera.name}</h4>
                      <p className="text-xs text-slate-400">{camera.location || 'Stadium Ground'}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-800 bg-emerald-950 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </span>
                  </div>

                  <div className="text-[11px] text-slate-400 space-y-0.5">
                    <p>
                      Code: <span className="font-mono text-slate-200">{camera.code}</span>
                    </p>
                    <p>
                      Stream: <span className="font-mono text-emerald-400">{camera.live_path}</span>
                    </p>
                    {canManage && camera.source_url && (
                      <p className="truncate text-slate-500">
                        Source: <span className="font-mono text-slate-400">{camera.source_url}</span>
                      </p>
                    )}
                  </div>
                </div>

                {canManage && (
                  <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-800/80 pt-3">
                    <button
                      type="button"
                      onClick={() => openEditModal(camera)}
                      className="rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDisable(camera)}
                      className="rounded border border-rose-900/50 bg-rose-950/40 hover:bg-rose-900/60 px-2.5 py-1 text-xs font-medium text-rose-300 transition-colors cursor-pointer"
                    >
                      Disable
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Admin Camera Management Modal */}
      {isModalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-950 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingCamera ? `Edit Camera: ${editingCamera.name}` : 'Register New Camera'}
            </h3>

            {formError && (
              <div role="alert" className="mb-4 rounded border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-400">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {!editingCamera && (
                <div>
                  <label htmlFor="camera-code" className="block text-xs font-medium text-slate-300 mb-1">
                    Camera Code (slug)
                  </label>
                  <input
                    id="camera-code"
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toLowerCase())}
                    placeholder="e.g. cam_north_01"
                    className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Lowercase letters, numbers, underscores (2-32 characters).
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="camera-name" className="block text-xs font-medium text-slate-300 mb-1">
                  Camera Display Name
                </label>
                <input
                  id="camera-name"
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. North Stand Main"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="camera-location" className="block text-xs font-medium text-slate-300 mb-1">
                  Location (optional)
                </label>
                <input
                  id="camera-location"
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="e.g. North Stand, Gate 4"
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="camera-type" className="block text-xs font-medium text-slate-300 mb-1">
                  Source Protocol
                </label>
                <select
                  id="camera-type"
                  value={formSourceType}
                  onChange={(e) => setFormSourceType(e.target.value as CameraSourceType)}
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="rtsp">RTSP Network Stream</option>
                  <option value="webcam">Local Webcam Device</option>
                  <option value="file">Video File Loop</option>
                </select>
              </div>

              <div>
                <label htmlFor="camera-url" className="block text-xs font-medium text-slate-300 mb-1">
                  Source URL
                </label>
                <input
                  id="camera-url"
                  type="text"
                  required={!editingCamera}
                  value={formSourceUrl}
                  onChange={(e) => setFormSourceUrl(e.target.value)}
                  placeholder={
                    formSourceType === 'rtsp'
                      ? 'rtsp://127.0.0.1:8554/cam_north_01'
                      : formSourceType === 'webcam'
                        ? '0'
                        : '/path/to/video.mp4'
                  }
                  className="w-full rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs text-slate-200 focus:border-emerald-500 focus:outline-none"
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  {formSourceType === 'rtsp'
                    ? 'Must start with rtsp:// or rtsps://'
                    : formSourceType === 'webcam'
                      ? 'Numeric device index (e.g. 0 for /dev/video0)'
                      : 'Absolute or relative path to video'}
                </p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={isSubmitting}
                  className="rounded border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-1.5 text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Saving...' : editingCamera ? 'Save Changes' : 'Create Camera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
