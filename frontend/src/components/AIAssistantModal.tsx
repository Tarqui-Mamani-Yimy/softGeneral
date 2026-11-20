import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  requestNotificationPermission,
  sendNativePushNotification,
  getNotificationPermission,
} from '../services/pushNotification';

interface Message {
  sender: 'user' | 'assistant';
  text: string;
  actionUrl?: string;
  actionLabel?: string;
  timestamp: string;
}

const FAQ_KNOWLEDGE_BASE: Array<{
  keywords: string[];
  question: string;
  answer: string;
  actionUrl?: string;
  actionLabel?: string;
}> = [
  {
    keywords: ['modelo', 'ia', 'inteligencia', 'algoritmo', 'redes', 'neuronal', 'yolo', 'sface', 'peleas', 'futbol'],
    question: '¿Qué modelos de Inteligencia Artificial utiliza el sistema?',
    answer:
      'SIV-Estadio ejecuta **4 motores de Deep Learning en modo 100% local**:\n' +
      '1. **YOLOv8 (`yolov8n.pt`):** Detección multiclase de personas, armas de fuego, armas blancas y fuego/humo.\n' +
      '2. **Modelo Forense de Violencia (`peleas.pt`):** Detector especializado en riñas y agresiones físicas con suavizado temporal (ventana de 4/6 cuadros) para evitar falsos positivos.\n' +
      '3. **Modelo Deportivo (`futbol.pt`):** Tracking especializado de jugadores, árbitros y balón para telemetría de campo.\n' +
      '4. **Biometría Facial (YuNet + SFace):** Extracción de embeddings de 128 dimensiones y comparación por similitud coseno contra el padrón de personas vetadas.',
    actionUrl: '/demo',
    actionLabel: 'Probar Modelos en Vivo',
  },
  {
    keywords: ['vetado', 'vetados', 'persona', 'rostro', 'foto', 'biometria', 'registrar', 'padron', 'sface'],
    question: '¿Cómo registrar una persona en el padrón de personas vetadas?',
    answer:
      'Para vetar a un infractor:\n' +
      '1. Dirígete a **Padrón de Vetados** en el menú lateral.\n' +
      '2. Haz clic en **Registrar Infractor** y completa su nombre, documento y motivo.\n' +
      '3. Carga una fotografía frontal de su rostro.\n' +
      '4. La red neuronal **YuNet + SFace** extraerá automáticamente el vector facial de 128 dimensiones y lo almacenará en PostgreSQL.\n' +
      '5. Cuando cualquier cámara detecte esa cara con similitud > 65%, se disparará una alerta crítica inmediata.',
    actionUrl: '/banned-persons',
    actionLabel: 'Ir al Padrón de Vetados',
  },
  {
    keywords: ['forense', 'video', 'grabacion', 'subir', 'archivo', 'evidencia', 'mp4'],
    question: '¿Cómo analizar una grabación o video forense?',
    answer:
      'En el módulo de **Análisis Forense**:\n' +
      '1. Haz clic en **Subir Grabación Forense** y selecciona tu archivo MP4/AVI.\n' +
      '2. El worker de visión en segundo plano procesará cada fotograma ejecutando los modelos de peleas, objetos y rostros.\n' +
      '3. Al finalizar, podrás reproducir el video con los recuadros analíticos (OSD) y descargar el reporte de incidentes y clips de evidencia recortados.',
    actionUrl: '/videos',
    actionLabel: 'Ir a Análisis Forense',
  },
  {
    keywords: ['camara', 'demo', 'en vivo', 'webcam', 'probar', 'canal', 'webrtc', 'whip'],
    question: '¿Cómo probar el sistema en vivo con mi webcam?',
    answer:
      'Ve al módulo **Canal de Prueba** (`/demo`):\n' +
      '1. Haz clic en el botón azul **Iniciar Transmisión de Prueba** y permite el acceso a tu cámara.\n' +
      '2. El sistema enviará tu video por WebRTC (WHIP) hacia MediaMTX en el servidor AWS.\n' +
      '3. En **CH-01** verás tu cámara local y en **CH-02** verás la señal procesada por la IA con los cuadros delimitadores y el reconocimiento de personas en tiempo real.',
    actionUrl: '/demo',
    actionLabel: 'Iniciar Canal de Prueba',
  },
  {
    keywords: ['deporte', 'deportivo', 'futbol', 'jugador', 'arbitro', 'balon', 'pelota', 'partido'],
    question: '¿Cómo funciona la analítica y eventos deportivos?',
    answer:
      'El módulo de **Eventos Deportivos** opera de forma desacoplada de la seguridad:\n' +
      '1. Detecta automáticamente las posiciones de **jugadores**, **árbitros** y **balón** usando el modelo `futbol.pt`.\n' +
      '2. Registra la telemetría en la base de datos sin contaminar las alertas de seguridad ciudadana.\n' +
      '3. Muestra métricas de posesión, distribución espacial y fotos instantáneas de cada evento registrado.',
    actionUrl: '/sports',
    actionLabel: 'Ver Eventos Deportivos',
  },
  {
    keywords: ['movil', 'celular', 'app', 'push', 'notificacion', 'instalar', 'pwa', 'android', 'iphone'],
    question: '¿Cómo instalar la app en el celular y recibir notificaciones push?',
    answer:
      'SIV-Estadio es una **Progressive Web App (PWA)** completa:\n' +
      '1. Abre **`https://xavioverland.com`** en Chrome o Safari desde tu teléfono.\n' +
      '2. Pulsa en el menú del navegador y selecciona **"Agregar a pantalla principal"** o **"Instalar aplicación"**.\n' +
      '3. La app se instalará con su icono propio como cualquier app nativa.\n' +
      '4. Activa las **Notificaciones Push** en este asistente para recibir alertas del sistema operativo en tu pantalla de bloqueo ante cualquier incidente.',
  },
  {
    keywords: ['aws', 'nube', 'servidor', 'despliegue', 'arquitectura', 'nginx', 'docker', 'ubuntu'],
    question: '¿Cuál es la infraestructura de despliegue en AWS?',
    answer:
      'La solución está desplegada en **AWS EC2 (Ubuntu 24.04 LTS)** en la región `us-east-1`:\n' +
      '• **Dominio & SSL:** `https://xavioverland.com` con certificado oficial Let\'s Encrypt.\n' +
      '• **Microservicios Docker:** Base de datos PostgreSQL 17 y servidor MediaMTX (WebRTC/RTSP).\n' +
      '• **Nginx Reverse Proxy:** Terminación TLS, compresión y enrutamiento WebSockets (`wss://`).\n' +
      '• **Servicios Systemd:** API FastAPI (`siv-api`), Worker de procesamiento (`siv-worker`) y Supervisor en vivo (`siv-live`).',
  },
  {
    keywords: ['usuario', 'usuarios', 'roles', 'rbac', 'guardia', 'admin', 'permisos'],
    question: '¿Qué roles y permisos existen en la plataforma?',
    answer:
      'El sistema cuenta con control de acceso basado en roles (**RBAC**):\n' +
      '• **Administrador (`admin`):** Gestión total de usuarios, configuración de cámaras, reglas de visión y auditoría.\n' +
      '• **Guardia / Operador (`guard`):** Acceso al centro de control, recepción de alertas e inspección de video, con restricciones para no eliminar datos ni alterar usuarios.\n' +
      '• **Seguridad Crítica:** Se previene el auto-borrado y el bloqueo accidental del último administrador.',
    actionUrl: '/users',
    actionLabel: 'Administrar Usuarios',
  },
];

export const AIAssistantModal: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'chat' | 'tutorial' | 'cloud'>('chat');
  const [inputQuery, setInputQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'assistant',
      text: '👋 ¡Hola! Soy el **Asistente Inteligente de SIV-Estadio**. Estoy aquí para guiarte en el uso de la plataforma, explicarte cómo funcionan los modelos de IA (YOLOv8, Peleas, Deportes, SFace) y ayudarte a operar el sistema de seguridad.',
      timestamp: 'Ahora',
    },
  ]);
  const [notificationStatus, setNotificationStatus] = useState<NotificationPermission>(getNotificationPermission());
  const [testSent, setTestSent] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSend = (textToSend?: string) => {
    const query = (textToSend || inputQuery).trim();
    if (!query) return;

    const time = new Date().toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    const userMsg: Message = { sender: 'user', text: query, timestamp: time };

    // Search knowledge base
    const lower = query.toLowerCase();
    let bestMatch = FAQ_KNOWLEDGE_BASE.find((item) =>
      item.keywords.some((kw) => lower.includes(kw))
    );

    if (!bestMatch) {
      bestMatch = {
        keywords: [],
        question: 'Consulta General',
        answer:
          'Puedo ayudarte con información sobre:\n' +
          '• **Modelos de IA:** YOLOv8, detección de peleas (`peleas.pt`), tracking de fútbol y biometría SFace.\n' +
          '• **Operación:** Cómo subir videos forenses, registrar personas vetadas o probar la cámara en vivo.\n' +
          '• **Infraestructura:** Despliegue en AWS EC2, Nginx, Docker y app móvil PWA.\n\n' +
          'Selecciona una de las preguntas sugeridas abajo o escribe tu duda en detalle.',
      };
    }

    const assistantMsg: Message = {
      sender: 'assistant',
      text: bestMatch.answer,
      actionUrl: bestMatch.actionUrl,
      actionLabel: bestMatch.actionLabel,
      timestamp: time,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInputQuery('');
  };

  const handleActivatePush = async () => {
    const perm = await requestNotificationPermission();
    setNotificationStatus(perm);
    if (perm === 'granted') {
      await sendNativePushNotification({
        title: '🔔 ¡Notificaciones Push Activadas!',
        body: 'SIV-Estadio te enviará alertas críticas en tiempo real directamente a tu dispositivo.',
        url: '/alerts',
      });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 5000);
    }
  };

  const handleTestPush = async () => {
    await sendNativePushNotification({
      title: '🚨 ALERTA: Sujeto Vetado Detectado',
      body: 'Sector Sur - Acceso 02. Coincidencia biométrica SFace 88.5%. Intervención requerida.',
      url: '/alerts',
    });
    setTestSent(true);
    setTimeout(() => setTestSent(false), 5000);
  };

  return (
    <>
      {/* Botón Flotante en la esquina inferior derecha */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2.5 rounded-full bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 px-4 py-3 text-white shadow-xl shadow-blue-900/40 hover:shadow-blue-600/50 hover:scale-105 transition-all duration-200 cursor-pointer border border-blue-400/30 group"
        title="Abrir Asistente Inteligente"
      >
        <span className="relative flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </span>
        <div className="flex items-center gap-1.5 font-medium text-xs">
          <svg className="w-4 h-4 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
          <span>Asistente IA</span>
        </div>
      </button>

      {/* Modal / Ventana del Asistente */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-end sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            className="w-full sm:w-[480px] h-[85vh] sm:h-[650px] flex flex-col rounded-t-2xl sm:rounded-2xl border border-[#262c3d] bg-[#11141c] shadow-2xl overflow-hidden"
            role="dialog"
            aria-modal="true"
          >
            {/* Cabecera */}
            <div className="flex items-center justify-between border-b border-[#1e2330] bg-[#151924] px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 text-white shadow-md">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                </div>
                <div>
                  <h2 className="text-xs font-semibold text-white flex items-center gap-2">
                    SIV-Estadio Copilot
                    <span className="rounded bg-emerald-500/20 px-1.5 py-0.2 font-mono text-[9px] text-emerald-300 border border-emerald-500/30">
                      EN VIVO
                    </span>
                  </h2>
                  <p className="text-[10px] text-slate-400">Asistente Inteligente & Guía Operativa</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-[#1f2533] hover:text-white transition-colors"
                title="Cerrar asistente"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Pestañas de Navegación */}
            <div className="grid grid-cols-3 border-b border-[#1e2330] bg-[#0d1017] text-xs">
              <button
                type="button"
                onClick={() => setActiveTab('chat')}
                className={`py-2.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'chat'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                🤖 Consulta IA
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tutorial')}
                className={`py-2.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'tutorial'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                💡 Guía Rápida
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cloud')}
                className={`py-2.5 font-medium border-b-2 transition-colors ${
                  activeTab === 'cloud'
                    ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                ☁️ AWS & Móvil
              </button>
            </div>

            {/* Contenido según Pestaña */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeTab === 'chat' && (
                <>
                  {messages.map((msg, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-xs leading-relaxed shadow ${
                          msg.sender === 'user'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-[#181d28] border border-[#242b3b] text-slate-200 rounded-bl-none'
                        }`}
                      >
                        <div className="whitespace-pre-wrap">{msg.text}</div>

                        {msg.actionUrl && (
                          <div className="mt-2.5 pt-2 border-t border-slate-700/50">
                            <button
                              type="button"
                              onClick={() => {
                                setIsOpen(false);
                                navigate(msg.actionUrl!);
                              }}
                              className="inline-flex items-center gap-1.5 rounded bg-blue-500 hover:bg-blue-400 px-2.5 py-1 text-[11px] font-semibold text-white transition-colors"
                            >
                              <span>{msg.actionLabel || 'Ir a la sección'}</span>
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 px-1">{msg.timestamp}</span>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </>
              )}

              {activeTab === 'tutorial' && (
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wide">
                    Preguntas Frecuentes y Tutoriales:
                  </h3>
                  {FAQ_KNOWLEDGE_BASE.map((faq, idx) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-[#222838] bg-[#141822] p-3 hover:border-blue-500/40 transition-colors"
                    >
                      <p className="text-xs font-semibold text-blue-300">{faq.question}</p>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed whitespace-pre-line">{faq.answer}</p>
                      {faq.actionUrl && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsOpen(false);
                            navigate(faq.actionUrl!);
                          }}
                          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300"
                        >
                          <span>{faq.actionLabel}</span>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'cloud' && (
                <div className="space-y-4 text-xs">
                  {/* Tarjeta AWS */}
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                      <h4 className="font-semibold text-emerald-300">Infraestructura Cloud AWS Activa</h4>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      Servidor EC2 Ubuntu 24.04 LTS desplegado en la región <span className="font-mono text-emerald-400">us-east-1</span> con dominio oficial <span className="font-mono text-emerald-400">xavioverland.com</span> y cifrado SSL Let's Encrypt.
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5 font-mono text-[10px]">
                      <span className="rounded bg-[#121620] px-2 py-0.5 border border-[#222838] text-slate-300">Docker + Postgres 17</span>
                      <span className="rounded bg-[#121620] px-2 py-0.5 border border-[#222838] text-slate-300">MediaMTX WebRTC</span>
                      <span className="rounded bg-[#121620] px-2 py-0.5 border border-[#222838] text-slate-300">Nginx HTTPS Proxy</span>
                    </div>
                  </div>

                  {/* Tarjeta Móvil & Push */}
                  <div className="rounded-xl border border-blue-500/30 bg-blue-950/20 p-3.5">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                      <h4 className="font-semibold text-blue-300">Versión Móvil PWA & Notificaciones Push</h4>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1">
                      El sistema está listo para operar desde smartphones (Android e iOS). Permite instalar la app y recibir notificaciones push en tiempo real ante intrusiones o personas vetadas.
                    </p>

                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between bg-[#11141c] p-2 rounded-lg border border-[#222838]">
                        <span className="text-[11px] text-slate-400">Permiso de Notificaciones:</span>
                        <span
                          className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                            notificationStatus === 'granted'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          {notificationStatus === 'granted' ? 'HABILITADO' : 'PENDIENTE'}
                        </span>
                      </div>

                      {notificationStatus !== 'granted' ? (
                        <button
                          type="button"
                          onClick={handleActivatePush}
                          className="w-full rounded-lg bg-blue-600 hover:bg-blue-500 px-3 py-2 text-xs font-semibold text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
                        >
                          <span>🔔 Activar Notificaciones Push en este Dispositivo</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleTestPush}
                          className="w-full rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors cursor-pointer flex items-center justify-center gap-2"
                        >
                          <span>📲 Probar Alerta Push de Prueba</span>
                        </button>
                      )}

                      {testSent && (
                        <p className="text-[10px] font-medium text-emerald-400 text-center animate-pulse">
                          ✓ Notificación push enviada a tu dispositivo
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input de Chat (Solo en pestaña Chat) */}
            {activeTab === 'chat' && (
              <div className="border-t border-[#1e2330] bg-[#141822] p-3 space-y-2">
                {/* Sugerencias Rápidas */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 text-[10px] scrollbar-none">
                  {['Modelos de IA', '¿Cómo subir video?', 'Padrón de Vetados', 'App Móvil'].map((chip, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSend(chip)}
                      className="flex-shrink-0 rounded-full border border-[#2b3347] bg-[#191e2b] px-2.5 py-1 text-slate-300 hover:border-blue-500 hover:text-white transition-colors"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={inputQuery}
                    onChange={(e) => setInputQuery(e.target.value)}
                    placeholder="Pregúntale al Asistente IA sobre cualquier módulo..."
                    className="flex-1 rounded-lg border border-[#262c3d] bg-[#0c0e14] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={!inputQuery.trim()}
                    className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition-colors cursor-pointer"
                    title="Enviar pregunta"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

