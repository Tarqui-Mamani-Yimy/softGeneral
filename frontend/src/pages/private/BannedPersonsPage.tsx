import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../hooks';
import {
  listBannedPersons,
  createBannedPerson,
  deleteBannedPerson,
  fetchBannedPersonPhotoBlob,
  ApiError,
} from '../../services/apiClient';
import type { BannedPerson, SeverityLevel } from '../../types/bannedPerson';

export const BannedPersonsPage: React.FC = () => {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('banned_persons.manage') ?? false;

  const [persons, setPersons] = useState<BannedPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string>('');

  // Fotos cacheadas en blobs
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const activeBlobUrlsRef = useRef<string[]>([]);

  // Modal para vetar persona
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [reason, setReason] = useState('');
  const [severity, setSeverity] = useState<SeverityLevel>('high');
  const [notes, setNotes] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modo de captura: archivo local o cámara web
  const [photoMode, setPhotoMode] = useState<'upload' | 'camera'>('upload');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  const clearBlobUrls = () => {
    activeBlobUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    activeBlobUrlsRef.current = [];
  };

  const stopCamera = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop());
      cameraStreamRef.current = null;
    }
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError('El navegador no admite captura de video o requiere un contexto seguro (HTTPS / localhost).');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
        },
        audio: false,
      });
      cameraStreamRef.current = stream;
      setIsCameraActive(true);
      if (cameraVideoRef.current) {
        cameraVideoRef.current.srcObject = stream;
        cameraVideoRef.current.play().catch(() => {});
      }
    } catch (err: unknown) {
      const errorObj = err as { name?: string };
      if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
        setCameraError('Permiso de cámara denegado. Habilite el acceso en el navegador e intente nuevamente.');
      } else if (errorObj?.name === 'NotFoundError' || errorObj?.name === 'DevicesNotFoundError') {
        setCameraError('No se detectó ningún dispositivo de cámara conectado al equipo.');
      } else {
        setCameraError('No fue posible inicializar el dispositivo de captura de video.');
      }
      setIsCameraActive(false);
    }
  };

  const capturePhoto = () => {
    if (!cameraVideoRef.current) return;
    const video = cameraVideoRef.current;
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const file = new File([blob], `captura_biometrica_${Date.now()}.jpg`, { type: 'image/jpeg' });
        setSelectedPhoto(file);
        if (photoPreview) {
          URL.revokeObjectURL(photoPreview);
        }
        const previewUrl = URL.createObjectURL(blob);
        setPhotoPreview(previewUrl);
        stopCamera();
        setFormError(null);
      },
      'image/jpeg',
      0.95
    );
  };

  useEffect(() => {
    return () => {
      clearBlobUrls();
      stopCamera();
      if (photoPreview) URL.revokeObjectURL(photoPreview);
    };
  }, [photoPreview]);

  const loadPersons = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listBannedPersons(false);
      setPersons(data);
      setError(null);

      data.forEach(async (p) => {
        try {
          const blob = await fetchBannedPersonPhotoBlob(p.id);
          const url = URL.createObjectURL(blob);
          activeBlobUrlsRef.current.push(url);
          setPhotoUrls((prev) => ({ ...prev, [p.id]: url }));
        } catch {
          // Ignorar error de carga individual
        }
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Error al consultar el padrón de personas vetadas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPersons();
  }, [loadPersons]);

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
    if (!file) {
      setSelectedPhoto(null);
      return;
    }
    setSelectedPhoto(file);
    const previewUrl = URL.createObjectURL(file);
    setPhotoPreview(previewUrl);
    setFormError(null);
  };

  const openModal = () => {
    setFullName('');
    setDocumentId('');
    setReason('');
    setSeverity('high');
    setNotes('');
    setSelectedPhoto(null);
    setPhotoMode('upload');
    stopCamera();
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    stopCamera();
    setIsModalOpen(false);
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPhoto) {
      setFormError('Se requiere una fotografía frontal clara para extraer el descriptor biométrico.');
      return;
    }
    if (!fullName.trim()) {
      setFormError('El nombre completo del sujeto es obligatorio.');
      return;
    }
    if (!reason.trim()) {
      setFormError('Debe especificar la causal o motivo de la restricción.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    const formData = new FormData();
    formData.append('full_name', fullName.trim());
    if (documentId.trim()) formData.append('document_id', documentId.trim());
    formData.append('reason', reason.trim());
    formData.append('severity', severity);
    if (notes.trim()) formData.append('notes', notes.trim());
    formData.append('photo', selectedPhoto);

    try {
      await createBannedPerson(formData);
      closeModal();
      await loadPersons();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.detail);
      } else if (err instanceof Error) {
        setFormError(err.message);
      } else {
        setFormError('No se pudo completar el registro biométrico.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (person: BannedPerson) => {
    if (!confirm(`¿Confirma levantar la restricción y eliminar el expediente de "${person.full_name}"?`)) {
      return;
    }
    try {
      await deleteBannedPerson(person.id);
      await loadPersons();
    } catch (err) {
      alert(err instanceof ApiError ? err.detail : 'Error al eliminar el registro');
    }
  };

  const filteredPersons = persons.filter((p) => {
    const matchesSearch =
      !searchTerm ||
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.document_id && p.document_id.toLowerCase().includes(searchTerm.toLowerCase())) ||
      p.reason.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSeverity = !severityFilter || p.severity === severityFilter;
    return matchesSearch && matchesSeverity;
  });

  const renderSeverityBadge = (sev: SeverityLevel) => {
    switch (sev) {
      case 'high':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-red-800/60 bg-red-950/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            Riesgo Alto
          </span>
        );
      case 'medium':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-amber-800/60 bg-amber-950/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Riesgo Medio
          </span>
        );
      case 'low':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-blue-800/60 bg-blue-950/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-300">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
            Riesgo Bajo
          </span>
        );
    }
  };

  const highCount = persons.filter((p) => p.severity === 'high').length;
  const mediumCount = persons.filter((p) => p.severity === 'medium').length;

  return (
    <div className="space-y-5">
      {/* Barra de métricas y botón de registro */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#1e2330] pb-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <div className="rounded border border-[#222836] bg-[#12151c] px-3 py-1.5 flex items-center gap-2">
            <span className="text-slate-400">Expedientes Activos:</span>
            <span className="font-mono font-bold text-white">{persons.length}</span>
          </div>
          <div className="rounded border border-red-900/40 bg-red-950/20 px-3 py-1.5 flex items-center gap-2">
            <span className="text-red-300/80">Nivel Crítico / Alto:</span>
            <span className="font-mono font-bold text-red-300">{highCount}</span>
          </div>
          <div className="rounded border border-amber-900/40 bg-amber-950/20 px-3 py-1.5 flex items-center gap-2">
            <span className="text-amber-300/80">Nivel Medio:</span>
            <span className="font-mono font-bold text-amber-300">{mediumCount}</span>
          </div>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-2 rounded bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white transition-colors cursor-pointer self-start sm:self-auto"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Registrar Sujeto Vetado
          </button>
        )}
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <section aria-label="Filtros de personas vetadas" className="rounded-md border border-[#1e2330] bg-[#12151c] p-3.5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex-1 relative">
            <input
              id="search-banned"
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar expediente por nombre, documento de identidad o causal..."
              className="w-full rounded border border-[#252b3b] bg-[#0e1117] pl-3 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div className="w-full sm:w-52">
            <select
              id="severity-filter"
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">Todos los niveles de riesgo</option>
              <option value="high">Riesgo Alto</option>
              <option value="medium">Riesgo Medio</option>
              <option value="low">Riesgo Bajo</option>
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div role="alert" className="rounded border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Lista de Expedientes Biométricos */}
      {isLoading ? (
        <div role="status" className="rounded-md border border-[#1e2330] bg-[#12151c] p-12 text-center text-xs text-slate-500">
          Consultando base de datos biométrica...
        </div>
      ) : filteredPersons.length === 0 ? (
        <div className="rounded-md border border-[#1e2330] bg-[#12151c] p-12 text-center space-y-2">
          <p className="text-xs font-medium text-slate-300">No se encontraron expedientes de restricción activos.</p>
          <p className="text-[11px] text-slate-500">
            Utilice el botón "Registrar Sujeto Vetado" para dar de alta un nuevo perfil facial en el motor de reconocimiento.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPersons.map((person) => {
            const photoSrc = photoUrls[person.id];
            return (
              <div
                key={person.id}
                className="flex flex-col justify-between rounded-md border border-[#1e2330] bg-[#12151c] overflow-hidden"
              >
                <div>
                  {/* Cabecera del expediente con foto y datos clave */}
                  <div className="flex gap-3.5 p-4 border-b border-[#1a1f2b]">
                    <div className="h-24 w-20 rounded border border-[#262c3d] bg-[#0b0d11] overflow-hidden flex-shrink-0 flex items-center justify-center relative">
                      {photoSrc ? (
                        <img
                          src={photoSrc}
                          alt={`Fotografía de ${person.full_name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] font-mono text-slate-600 text-center px-1">SIN IMAGEN</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-semibold text-white truncate" title={person.full_name}>
                          {person.full_name}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5">
                        {renderSeverityBadge(person.severity)}
                        <span className="rounded border border-[#252b3b] bg-[#161a24] px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                          {person.document_id ? `DOC: ${person.document_id}` : 'SIN DOC'}
                        </span>
                      </div>

                      <div className="pt-1 flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        <span>DESCRIPTOR 128-D ACTIVO</span>
                      </div>

                      <p className="text-[10px] font-mono text-slate-500">
                        ALTA: {new Date(person.banned_at).toLocaleDateString('es-BO')}
                      </p>
                    </div>
                  </div>

                  {/* Causal y observaciones */}
                  <div className="p-4 space-y-2 text-xs">
                    <div>
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">
                        Causal de Restricción
                      </span>
                      <p className="text-slate-200 leading-relaxed">{person.reason}</p>
                    </div>

                    {person.notes && (
                      <div className="pt-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-0.5">
                          Observaciones de Inteligencia
                        </span>
                        <p className="text-slate-400 text-[11px]">{person.notes}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Pie de tarjeta */}
                <div className="border-t border-[#1a1f2b] bg-[#0e1117] px-4 py-2.5 flex items-center justify-between">
                  <span className="font-mono text-[10px] text-slate-500">
                    ID: {person.id.slice(0, 8).toUpperCase()}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleDelete(person)}
                      className="rounded border border-[#282e3d] bg-[#161a24] hover:border-red-800/60 hover:bg-red-950/40 hover:text-red-300 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition-colors cursor-pointer"
                    >
                      Revocar Restricción
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Alta Biométrica */}
      {isModalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-md border border-[#242a38] bg-[#12151c] shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="border-b border-[#1e2330] bg-[#161a23] px-5 py-3.5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-white">Alta de Expediente Biométrico de Restricción</h3>
                <p className="text-[11px] text-slate-400">
                  Extracción automática de vector facial mediante red neuronal SFace
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto">
              {formError && (
                <div role="alert" className="rounded border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
                  {formError}
                </div>
              )}

              {/* Selector de Fotografía: Archivo o Cámara */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-slate-300">
                    Muestra Facial de Referencia *
                  </label>
                  <div className="flex items-center rounded border border-[#252b3b] bg-[#0e1117] p-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        stopCamera();
                        setPhotoMode('upload');
                      }}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-xs transition-colors cursor-pointer ${
                        photoMode === 'upload'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Archivo Local
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoMode('camera');
                        startCamera();
                      }}
                      className={`px-2.5 py-1 text-[11px] font-medium rounded-xs transition-colors flex items-center gap-1 cursor-pointer ${
                        photoMode === 'camera'
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      Tomar Foto
                    </button>
                  </div>
                </div>

                {photoMode === 'camera' ? (
                  <div className="rounded border border-[#222836] bg-[#0e1117] p-3 space-y-3">
                    {cameraError && (
                      <div role="alert" className="rounded border border-red-500/30 bg-red-950/30 p-2 text-xs text-red-300">
                        {cameraError}
                      </div>
                    )}

                    {isCameraActive ? (
                      <div className="relative aspect-video w-full overflow-hidden rounded border border-[#282e3d] bg-black">
                        <video
                          ref={(el) => {
                            cameraVideoRef.current = el;
                            if (el && cameraStreamRef.current && el.srcObject !== cameraStreamRef.current) {
                              el.srcObject = cameraStreamRef.current;
                              el.play().catch(() => {});
                            }
                          }}
                          autoPlay
                          playsInline
                          muted
                          className="h-full w-full object-cover transform -scale-x-100"
                        />
                        {/* Retícula técnica de encuadre biométrico */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="w-36 h-48 border border-blue-400/50 relative">
                            <span className="absolute -top-0.5 -left-0.5 w-3 h-3 border-t-2 border-l-2 border-blue-400" />
                            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 border-t-2 border-r-2 border-blue-400" />
                            <span className="absolute -bottom-0.5 -left-0.5 w-3 h-3 border-b-2 border-l-2 border-blue-400" />
                            <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 border-b-2 border-r-2 border-blue-400" />
                          </div>
                        </div>
                        <div className="absolute top-2 left-2 rounded bg-black/70 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
                          ● CAM-CAPTURA ACTIVA
                        </div>
                        <div className="absolute bottom-3 inset-x-0 flex justify-center gap-2">
                          <button
                            type="button"
                            onClick={capturePhoto}
                            className="rounded bg-blue-600 hover:bg-blue-500 px-4 py-1.5 text-xs font-medium text-white shadow-lg flex items-center gap-1.5 cursor-pointer"
                          >
                            Capturar Fotograma
                          </button>
                          <button
                            type="button"
                            onClick={stopCamera}
                            className="rounded border border-slate-700 bg-slate-900/90 hover:bg-slate-800 px-3 py-1.5 text-xs text-slate-300 cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-4">
                        <div className="h-24 w-20 rounded border border-[#262c3d] bg-[#12151c] overflow-hidden flex items-center justify-center flex-shrink-0">
                          {photoPreview ? (
                            <img src={photoPreview} alt="Captura de rostro" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-mono text-slate-600 text-center px-1">SIN CAPTURA</span>
                          )}
                        </div>
                        <div className="flex-1 space-y-2">
                          <button
                            type="button"
                            onClick={startCamera}
                            className="rounded border border-blue-700/60 bg-blue-950/50 hover:bg-blue-900/60 px-3 py-1.5 text-xs font-medium text-blue-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            {photoPreview ? 'Repetir Captura con Cámara' : 'Activar Cámara Web'}
                          </button>
                          <p className="text-[11px] text-slate-500">
                            {photoPreview
                              ? 'Fotograma capturado y listo para extracción de vector facial.'
                              : 'Ubique el rostro del sujeto frente a la cámara con iluminación uniforme.'}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-4 rounded border border-[#222836] bg-[#0e1117] p-3">
                    <div className="h-24 w-20 rounded border border-[#262c3d] bg-[#12151c] overflow-hidden flex items-center justify-center flex-shrink-0">
                      {photoPreview ? (
                        <img src={photoPreview} alt="Vista previa" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-[10px] font-mono text-slate-600 text-center px-1">SIN IMAGEN</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        disabled={isSubmitting}
                        onChange={handlePhotoSelect}
                        className="block w-full text-xs text-slate-400 file:mr-3 file:rounded file:border file:border-[#2a3142] file:bg-[#161a24] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200 hover:file:bg-[#1e2433] cursor-pointer"
                      />
                      <p className="text-[11px] text-slate-500 mt-1.5">
                        Formatos admitidos: JPEG, PNG. El rostro debe estar descubierto y mirando al frente.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="person-name" className="block text-xs font-medium text-slate-300 mb-1">
                    Nombre y Apellidos *
                  </label>
                  <input
                    id="person-name"
                    type="text"
                    required
                    disabled={isSubmitting}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="ej. Carlos Mendoza Rivera"
                    className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="person-doc" className="block text-xs font-medium text-slate-300 mb-1">
                    Documento de Identidad (C.I. / DNI)
                  </label>
                  <input
                    id="person-doc"
                    type="text"
                    disabled={isSubmitting}
                    value={documentId}
                    onChange={(e) => setDocumentId(e.target.value)}
                    placeholder="ej. 8392102 LP"
                    className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="person-severity" className="block text-xs font-medium text-slate-300 mb-1">
                  Clasificación de Peligrosidad
                </label>
                <select
                  id="person-severity"
                  value={severity}
                  disabled={isSubmitting}
                  onChange={(e) => setSeverity(e.target.value as SeverityLevel)}
                  className="w-full rounded border border-[#252b3b] bg-[#0e1117] px-3 py-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                >
                  <option value="high">Riesgo Alto — Antecedentes de violencia, portación de armas o agresión</option>
                  <option value="medium">Riesgo Medio — Invasión de perímetro o disturbios</option>
                  <option value="low">Riesgo Bajo — Infracción administrativa o acceso no autorizado</option>
                </select>
              </div>

              <div>
                <label htmlFor="person-reason" className="block text-xs font-medium text-slate-300 mb-1">
                  Causal Oficial de Restricción *
                </label>
                <textarea
                  id="person-reason"
                  rows={2}
                  required
                  disabled={isSubmitting}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Describa el incidente o resolución que motiva la prohibición de ingreso..."
                  className="w-full rounded border border-[#252b3b] bg-[#0e1117] p-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label htmlFor="person-notes" className="block text-xs font-medium text-slate-300 mb-1">
                  Notas Operativas (opcional)
                </label>
                <textarea
                  id="person-notes"
                  rows={2}
                  disabled={isSubmitting}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sector habitual, filiación o señas particulares..."
                  className="w-full rounded border border-[#252b3b] bg-[#0e1117] p-2 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
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
                  {isSubmitting ? 'Procesando biometría...' : 'Guardar Expediente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BannedPersonsPage;
