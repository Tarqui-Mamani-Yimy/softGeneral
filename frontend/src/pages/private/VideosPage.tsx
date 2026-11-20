import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../hooks';
import {
  listVideos,
  uploadVideo,
  downloadVideoOutput,
  ApiError,
} from '../../services/apiClient';
import type { VideoJob } from '../../types/video';

const ALLOWED_EXTENSIONS = ['.mp4', '.avi', '.mov', '.mkv'];

export const VideosPage: React.FC = () => {
  const { user } = useAuth();
  const canUpload = user?.permissions.includes('videos.upload') ?? false;

  const [jobs, setJobs] = useState<VideoJob[]>([]);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const fetchJobs = useCallback(async (isPolling = false) => {
    try {
      const data = await listVideos();
      setJobs(data);
      setJobsError(null);
    } catch (err) {
      if (!isPolling) {
        setJobsError(err instanceof ApiError ? err.detail : 'Error al consultar la cola de análisis forense');
      }
    } finally {
      if (!isPolling) {
        setIsLoadingJobs(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    const hasActiveJobs = jobs.some(
      (job) => job.status === 'queued' || job.status === 'processing'
    );

    if (!hasActiveJobs) return;

    const intervalId = setInterval(() => {
      fetchJobs(true);
    }, 2000);

    return () => clearInterval(intervalId);
  }, [jobs, fetchJobs]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setUploadSuccess(null);
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const lowerName = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    if (!hasValidExt) {
      setUploadError('Formato contenedor no soportado. Utilice archivos .mp4, .avi, .mov o .mkv');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const newJob = await uploadVideo(selectedFile, (progress) => {
        setUploadProgress(progress);
      });

      setUploadSuccess(`Grabación "${newJob.original_filename}" ingresada a la cola de procesamiento analítico.`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchJobs(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setUploadError(err.detail);
      } else if (err instanceof Error) {
        setUploadError(err.message);
      } else {
        setUploadError('Error durante la transferencia del archivo.');
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleDownload = async (job: VideoJob) => {
    setDownloadingId(job.id);
    setDownloadError(null);
    try {
      await downloadVideoOutput(job.id, job.original_filename);
    } catch (err) {
      if (err instanceof ApiError) {
        setDownloadError(`Error al descargar exportación: ${err.detail}`);
      } else {
        setDownloadError('Error al descargar el archivo de video anotado');
      }
    } finally {
      setDownloadingId(null);
    }
  };

  const renderStatusBadge = (status: VideoJob['status']) => {
    switch (status) {
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-amber-800/60 bg-amber-950/60 px-2 py-0.5 text-[10px] font-mono uppercase text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            En Cola
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-blue-800/60 bg-blue-950/60 px-2 py-0.5 text-[10px] font-mono uppercase text-blue-300">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
            Procesando
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-emerald-800/60 bg-emerald-950/60 px-2 py-0.5 text-[10px] font-mono uppercase text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Finalizado
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1 rounded border border-red-800/60 bg-red-950/60 px-2 py-0.5 text-[10px] font-mono uppercase text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
            Fallido
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Módulo de ingesta de archivos */}
      {canUpload && (
        <section
          aria-labelledby="upload-heading"
          className="rounded-md border border-[#1e2330] bg-[#12151c] overflow-hidden"
        >
          <div className="border-b border-[#1e2330] bg-[#161a23] px-5 py-3 flex items-center justify-between">
            <div>
              <h3 id="upload-heading" className="text-sm font-semibold text-white">
                Ingesta de Grabación para Análisis Forense
              </h3>
              <p className="text-[11px] text-slate-400">
                Inspección cuadro por cuadro mediante detectores YOLOv8 y biometría SFace
              </p>
            </div>
            <span className="font-mono text-[10px] text-slate-500">MP4 • AVI • MOV • MKV</span>
          </div>

          <form onSubmit={handleUpload} className="p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <label htmlFor="video-file-input" className="sr-only">
                  Seleccionar archivo de video
                </label>
                <input
                  ref={fileInputRef}
                  id="video-file-input"
                  name="video"
                  type="file"
                  accept=".mp4,.avi,.mov,.mkv"
                  disabled={isUploading}
                  onChange={handleFileChange}
                  aria-describedby={uploadError ? 'upload-error-msg' : uploadSuccess ? 'upload-success-msg' : undefined}
                  className="block w-full rounded border border-[#252b3b] bg-[#0e1117] p-1.5 text-xs text-slate-400 file:mr-3 file:rounded file:border file:border-[#2a3142] file:bg-[#161a24] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200 hover:file:bg-[#1e2433] cursor-pointer disabled:opacity-50"
                />
              </div>

              <button
                type="submit"
                disabled={!selectedFile || isUploading}
                className="inline-flex items-center justify-center rounded bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex-shrink-0"
              >
                {isUploading ? 'Transfiriendo...' : 'Iniciar Procesamiento'}
              </button>
            </div>

            {selectedFile && !isUploading && (
              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
                <span>ARCHIVO: <strong className="text-slate-200">{selectedFile.name}</strong></span>
                <span>•</span>
                <span>TAMAÑO: {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB</span>
              </div>
            )}

            {isUploading && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs text-slate-400">
                  <label htmlFor="upload-progress-bar">Transfiriendo archivo al nodo de procesamiento...</label>
                  <span className="font-mono text-blue-400">{uploadProgress}%</span>
                </div>
                <progress
                  id="upload-progress-bar"
                  max={100}
                  value={uploadProgress}
                  aria-label="Progreso de subida"
                  className="w-full h-1.5"
                />
              </div>
            )}

            {uploadError && (
              <div
                id="upload-error-msg"
                role="alert"
                aria-live="polite"
                className="rounded border border-red-500/30 bg-red-950/30 p-2.5 text-xs text-red-300"
              >
                {uploadError}
              </div>
            )}

            {uploadSuccess && (
              <div
                id="upload-success-msg"
                role="status"
                aria-live="polite"
                className="rounded border border-emerald-500/30 bg-emerald-950/30 p-2.5 text-xs text-emerald-300"
              >
                {uploadSuccess}
              </div>
            )}
          </form>
        </section>
      )}

      {/* Tabla de Trabajos de Procesamiento */}
      <section
        aria-labelledby="jobs-heading"
        className="rounded-md border border-[#1e2330] bg-[#12151c] overflow-hidden"
      >
        <div className="border-b border-[#1e2330] bg-[#161a23] px-5 py-3 flex items-center justify-between">
          <div>
            <h3 id="jobs-heading" className="text-sm font-semibold text-white">
              Registro de Trabajos de Procesamiento ({jobs.length})
            </h3>
            <p className="text-[11px] text-slate-400">
              Historial y estado de ejecución de análisis sobre evidencia grabada
            </p>
          </div>
          <button
            type="button"
            onClick={() => fetchJobs()}
            className="rounded border border-[#252b3b] bg-[#0e1117] hover:bg-[#181c26] px-3 py-1 text-xs font-medium text-slate-300 transition-colors cursor-pointer"
          >
            Actualizar Cola
          </button>
        </div>

        {downloadError && (
          <div role="alert" className="m-4 rounded border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
            {downloadError}
          </div>
        )}

        {jobsError && (
          <div role="alert" className="m-4 rounded border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300">
            {jobsError}
          </div>
        )}

        {isLoadingJobs ? (
          <div role="status" className="p-10 text-center text-xs text-slate-500">
            Consultando cola de trabajos...
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-10 text-center text-xs text-slate-500">
            No se registran trabajos de análisis de video en la base de datos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <caption className="sr-only">Tareas de Procesamiento de Video</caption>
              <thead className="border-b border-[#1e2330] bg-[#0e1117] text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th scope="col" className="py-2.5 px-4 font-semibold">ID Trabajo</th>
                  <th scope="col" className="py-2.5 px-4 font-semibold">Archivo Original</th>
                  <th scope="col" className="py-2.5 px-4 font-semibold">Estado</th>
                  <th scope="col" className="py-2.5 px-4 font-semibold">Avance</th>
                  <th scope="col" className="py-2.5 px-4 font-semibold">Fecha de Ingreso</th>
                  <th scope="col" className="py-2.5 px-4 font-semibold text-right">Operaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1a1f2b]">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-[#161a24] transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500 whitespace-nowrap">
                      {job.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-3 px-4 font-medium text-white max-w-xs truncate" title={job.original_filename}>
                      {job.original_filename}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderStatusBadge(job.status)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <progress
                          max={100}
                          value={job.progress}
                          aria-label={`Progreso de procesamiento de ${job.original_filename}`}
                          className="w-24 h-1.5"
                        />
                        <span className="font-mono text-[11px] text-slate-300 tabular-nums">
                          {Math.round(job.progress)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {new Date(job.created_at).toLocaleString('es-BO')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right space-x-2">
                      <Link
                        to={`/alerts?video_job_id=${job.id}`}
                        className="inline-flex items-center rounded border border-[#282e3d] bg-[#161a24] hover:bg-[#1e2433] px-2.5 py-1 text-[11px] font-medium text-slate-200 transition-colors"
                      >
                        Inspeccionar Alertas
                      </Link>
                      {job.status === 'completed' && (
                        <button
                          type="button"
                          onClick={() => handleDownload(job)}
                          disabled={downloadingId === job.id}
                          className="inline-flex items-center rounded border border-blue-700/60 bg-blue-950/50 hover:bg-blue-900/60 px-2.5 py-1 text-[11px] font-medium text-blue-200 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {downloadingId === job.id ? 'Exportando...' : 'Exportar MP4'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
