# Planeación del proyecto

**Asistente de visión artificial para seguridad en estadios de fútbol**

Última actualización: 2026-11-18

---

## 1. Resumen

Sistema de visión artificial que sirve de **ayudante a los guardias de seguridad** de un estadio de fútbol. Analiza video de cámaras de seguridad **en tiempo real** y también **videos cargados por el usuario**, detecta eventos de riesgo (intrusos en la cancha, armas y objetos prohibidos, fuego y humo, peleas) y avisa a los guardias con una alerta que incluye captura, clip, cámara y hora. **La decisión final siempre es de una persona.**

Además de la parte de seguridad, el sistema genera **reportes automáticos** y ofrece una **plataforma web** donde se ve el estado del procesamiento, se reproduce el video analizado con sus anotaciones y se comparten resultados mediante enlaces públicos (solo con información deportiva, nunca con datos de seguridad).

---

## 2. Requisito clave: tiempo real y video cargado

El sistema debe funcionar de **dos maneras, con el mismo pipeline**:

| Modo | Entrada | Salida |
|---|---|---|
| **A. Video cargado** | El usuario sube un archivo de video (.mp4, .avi, etc.) | Video anotado con cajas y alertas, registro de eventos, reporte. Se muestra el avance del procesamiento |
| **B. Tiempo real** | Cámara de seguridad (RTSP), cámara IP o webcam | Alertas inmediatas por WebSocket, vista en vivo con anotaciones, clip de cada evento |

**Cómo se garantiza que ambos modos sean posibles**

- Una interfaz de fuente de video única (`VideoSource`) con dos implementaciones: `FileSource` (archivo) y `RTSPSource` (cámara). El resto del código no distingue entre ambas.
- En tiempo real, un hilo lector que **conserva solo el último fotograma y descarta los viejos**, para que el análisis nunca acumule retraso.
- Análisis cada 2-3 fotogramas en los módulos más pesados.
- Para desarrollar y probar sin cámaras reales, simular una cámara RTSP con MediaMTX + FFmpeg a partir de un video en bucle.

**Objetivos de rendimiento (por validar con el hardware real)**

- Latencia desde el evento hasta la alerta en pantalla: **≤ 2 segundos**.
- Fotogramas procesados por cámara: **≥ 10 FPS**.
- Falsos positivos por hora medidos sobre video largo sin eventos (métrica principal de aceptación).

---

## 3. Requisitos

### Funcionales

- [ ] **RF1. Tiempo real:** analizar flujos RTSP/webcam con baja latencia.
- [ ] **RF2. Video cargado:** subir un video, ponerlo en cola, procesarlo y descargar el resultado anotado.
- [ ] **RF3. Armas y objetos prohibidos:** detección con cajas delimitadoras.
- [ ] **RF4. Fuego y humo:** detección con confirmación temporal.
- [ ] **RF5. Intrusos en cancha:** detección de personas que entran al campo sin autorización, usando zonas, seguimiento y origen de la persona.
- [ ] **RF6. Peleas:** clasificación de secuencias con suavizado temporal.
- [ ] **RF7. Seguimiento de personas:** IDs estables y reidentificación entre cámaras.
- [ ] **RF8. Jugadores, árbitros y balón:** detección y seguimiento (parte deportiva).
- [ ] **RF9. Reconocimiento facial en accesos** *(opcional)*: lista de vetados, siempre con verificación humana.
- [ ] **RF10. Alertas:** captura, clip, cámara, hora, confianza y botón de confirmar o falsa alarma.
- [ ] **RF11. Reportes automáticos:** estadísticas y resumen del evento en PDF/HTML.
- [ ] **RF12. Plataforma web:** estado del procesamiento, reproducción del video anotado y enlaces públicos.

### No funcionales

- **Privacidad:** separar la vista privada (guardias) de la pública. La vista pública no muestra alertas de seguridad, rostros ni datos biométricos.
- **Humano en el circuito:** el sistema avisa, no decide ni bloquea el acceso.
- **Configurable sin programar:** cámaras, zonas y umbrales en archivos de configuración.
- **Trazabilidad:** registro de cada alerta y de la respuesta del guardia.

---

## 4. Arquitectura

```
[Fuente]                 [Procesamiento (worker, GPU)]                    [Salida]
Video cargado  ─┐
Cámara RTSP    ─┼─► Lector ─► Detección ─► Seguimiento ─► Reglas ─► Alertas ─► API (FastAPI)
Webcam         ─┘  (descarta   (YOLO)       (BoT-SORT)    (zonas,    (captura,    │  REST + WebSocket
                    fotogramas                            tiempos)   clip)        ▼
                    viejos)                                                  Base de datos
                                                                                  │
                                                          ┌───────────────────────┴───────────┐
                                                          ▼                                   ▼
                                                 Frontend privado                    Frontend público
                                                 (guardias, con login)               (solo métricas deportivas)
```

Módulos pesados (pose/peleas, rostros, atributos) se ejecutan **en cascada**, solo cuando hacen falta, y no en todos los fotogramas.

---

## 5. Stack tecnológico

| Capa | Tecnología |
|---|---|
| Visión | Python, Ultralytics (YOLO), OpenCV, BoxMOT (BoT-SORT/ByteTrack) |
| Objetos pequeños | SAHI (solo en zonas de interés) |
| Facial *(opcional)* | InsightFace/ArcFace, ONNX Runtime, FAISS |
| Audio *(opcional)* | YAMNet |
| Backend / API | FastAPI + Uvicorn, WebSocket |
| Proceso de análisis | `worker.py` separado de la API |
| Cola y eventos | Hilos en memoria al inicio; Redis después |
| Base de datos | SQLite al inicio; PostgreSQL si crece |
| Autenticación | JWT con roles `guardia` y `admin` |
| Enlaces públicos | Token aleatorio de solo lectura con caducidad |
| Video en navegador | MP4/H.264 con FFmpeg; MediaMTX (RTSP → WebRTC/HLS) en vivo |
| Reportes | Jinja2 + WeasyPrint (PDF) |
| Frontend | React + Vite + TypeScript + Tailwind, Recharts |
| Despliegue | Docker Compose; Cloudflare Tunnel para publicar |
| Entrenamiento | Kaggle Notebooks (GPU T4) |

---

## 6. Estructura de carpetas

```
softGeneral/
├── backend/
│   ├── app/            # main.py, api/, core/, db/, schemas/, servicios/
│   ├── vision/         # fuentes/, deteccion/, seguimiento/, reglas/, facial/, audio/, metricas/, alertas/
│   ├── worker.py
│   ├── tests/
│   └── Dockerfile
├── frontend/
│   └── src/            # paginas/privado, paginas/publico, componentes/, servicios/, hooks/
├── modelos/            # futbol.pt, armas.pt, fuegoHumo.pt, peleas.pt (versionados en Git)
├── config/             # camaras.yaml, zonas.json, reglas.yaml
├── datos/              # videos_prueba/, salidas/, alertas/, eventos.db (no subir a Git)
├── entrenamiento/      # notebooks/, resultados/
├── scripts/            # zonas_picker.py, probar_modelo.py, exportar_onnx.py
└── docker-compose.yml
```

---

## 7. Modelos

| Modelo | Base | Dataset | Estado | Resultados |
|---|---|---|---|---|
| **Fútbol** (ball, player, referee) | YOLO11s, 960 px, 40 épocas | Roboflow `footballai-xndiy/football-players-ball` v6 | **Entrenado** | mAP50 0.944, mAP50-95 0.708. Por clase (mAP50-95): ball 0.559, player 0.816, referee 0.749. Inferencia ~10 ms/imagen en T4 |
| **Armas** (gun) | YOLO11s, 640 px, 25 épocas | Roboflow `workspace-1qko2/gun-detection-ghlzd` v1 (9,041 originales; la versión incluye aumentos) | **Entrenado** | Prueba corta de 5 épocas con el 25% de los datos: mAP50 0.567. **Métricas finales por registrar** |
| **Fuego y humo** (fire, smoke) | YOLO11s, 640 px, 25 épocas | Roboflow `mytest-blult/fire-smoke-detection-eozii` v1 | **Entrenado** | **Métricas por registrar** |
| **Peleas** (fight, normal) | YOLO11s-cls, 224 px, 15 épocas | Kaggle `mohamedmustafa/real-life-violence-situations-dataset` (2000 videos, 1000 por clase, 10 fotogramas por video, separación 80/20 por video) | **Entrenado** | **Métricas por registrar** |

**Modelos preentrenados (sin entrenar):** detector de personas (COCO), BoT-SORT/BoxMOT, OSNet (Re-ID), YOLO-Pose, InsightFace + FAISS, YAMNet.

**Limitaciones conocidas**

- Los datasets de fútbol vienen de transmisión de TV; una cámara de seguridad alta y lejana rendirá peor, sobre todo con el balón.
- El modelo de fútbol clasificará a un intruso como `player`. La detección de intrusos usa el detector de personas general más zonas y seguimiento.
- El clasificador de peleas analiza un fotograma a la vez y puede aprender el fondo. Es la versión simplificada; ST-GCN o un modelo de video quedan como mejora.

---

## 8. Alcance mínimo (MVP para la demostración)

Lo que **debe** funcionar en la demo. Todo lo demás es complementario y solo se aborda cuando el MVP esté completo.

| Incluido en el MVP | Requisitos |
|---|---|
| Video cargado (Modo A) de principio a fin | RF2 |
| Intrusos en cancha | RF5 |
| Armas | RF3 |
| Fuego y humo, con regla por zona para no alertar por bengalas en tribuna | RF4 |
| Alertas con captura, clip y confirmar/falsa alarma | RF10 |
| Web privada básica: subir video, ver avance y alertas | RF12 (parcial) |

**Fuera del MVP:** tiempo real (RF1), peleas (RF6), Re-ID entre cámaras (RF7), métricas deportivas (RF8), reconocimiento facial (RF9), reportes (RF11) y vista pública.

**Riesgos técnicos a prototipar temprano**

- **Intrusos:** distinguir invasor de jugador, árbitro o personal con zonas y origen de la persona. Es la parte con más incertidumbre.
- **Bengalas:** el modelo de fuego y humo va a detectarlas en tribuna; hace falta una regla por zona.
- **Peleas:** el dataset es de calle y cámaras cercanas; un festejo de gol puede clasificarse como `fight`.

---

## 9. Fases y tareas

### Fase 0. Modelos *(casi terminada)*
- [x] Modelo de fútbol entrenado
- [x] Modelos de armas, fuego/humo y peleas entrenados
- [x] Descargar los cuatro `best.pt` y renombrarlos (`futbol.pt`, `armas.pt`, `fuegoHumo.pt`, `peleas.pt`)
- [x] Comprobar las clases de cada modelo (`model.names`)
- [ ] Registrar las métricas finales de armas, fuego/humo y peleas
- [ ] Probar inferencia real de los cuatro modelos con `ultralytics`
- [x] Distribuir los `.pt`: se versionan directamente en el repositorio (`modelos/`)

### Fase 1. Pipeline con video cargado (Modo A)
- [ ] Interfaz `VideoSource` y `FileSource`
- [ ] Carga de los modelos y filtrado de clases
- [ ] Detección de personas + seguimiento (BoT-SORT)
- [ ] Salida de video anotado con OpenCV
- [ ] Script de prueba rápida de cada modelo

### Fase 2. Tiempo real (Modo B)
- [ ] `RTSPSource` con hilo lector que descarta fotogramas viejos
- [ ] Cámara simulada con MediaMTX + FFmpeg
- [ ] Medir FPS y latencia
- [ ] Exportar modelos a ONNX/TensorRT si hace falta velocidad

### Fase 3. Reglas y alertas
- [ ] Herramienta para dibujar zonas (`zonas_picker.py`)
- [ ] Intrusos en cancha (zona de cancha, zona autorizada, origen de la persona)
- [ ] Fuego y humo con confirmación temporal
- [ ] Armas y objetos prohibidos
- [ ] Peleas con suavizado (por ejemplo, 8 de 12 fotogramas)
- [ ] Alertas con captura, clip y registro; cooldown y deduplicación por ID

### Fase 4. Backend
- [ ] FastAPI: rutas de cámaras, alertas, videos, reportes
- [ ] Cola de trabajos con estado y porcentaje de avance
- [ ] Base de datos de eventos
- [ ] WebSocket para alertas en vivo
- [ ] Autenticación y roles
- [ ] Enlaces públicos con token y caducidad

### Fase 5. Frontend
- [ ] Vista privada: alertas en vivo, cámaras, video anotado, confirmar/falsa alarma
- [ ] Subida de video y estado del procesamiento
- [ ] Vista pública: video con métricas deportivas, sin datos de seguridad

### Fase 6. Reportes
- [ ] Reporte automático (PDF/HTML): alertas por tipo, línea de tiempo, mapas de calor, estadísticas del partido

### Fase 7. Pruebas y optimización
- [ ] Prueba con video de partido y con video largo sin eventos
- [ ] Medir falsos positivos por hora y ajustar umbrales
- [ ] Revisar rendimiento en tiempo real

### Fase 8. Cierre
- [ ] Documentación, demo y empaquetado con Docker Compose

### Opcionales (si queda tiempo)
- [ ] Balón y métricas deportivas (posesión aproximada, mapas de calor)
- [ ] Reconocimiento facial en accesos, con verificación humana
- [ ] Re-ID entre cámaras
- [ ] Audio con YAMNet
- [ ] Más objetos prohibidos (cuchillos, botellas)
- [ ] Peleas con un modelo de video o pose + ST-GCN
- [ ] Atributos con PP-Human, reglas con Qwen2.5-VL/MobileCLIP, CLIP-ReID

---

## 10. Pruebas y criterios de aceptación

- **Video cargado:** un video de partido se procesa de principio a fin y devuelve un video anotado y un reporte.
- **Tiempo real:** una cámara simulada (RTSP) produce alertas en menos de 2 s, sin acumular retraso.
- **Falsos positivos:** se mide por hora sobre 20-30 minutos de partido sin eventos, y se registra por tipo de alerta.
- **Intrusos:** probar con videos de invasiones de campo y con partidos normales.
- **Separación público/privado:** verificar que la vista pública nunca expone alertas, rostros ni datos de seguridad.

---

## 11. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Falsos positivos que cansan a los guardias | Confirmación temporal, zonas, cooldown, prioridades, botón de falsa alarma |
| Los datos de entrenamiento no se parecen a cámaras de estadio | Probar con video real y agregar imágenes propias si hace falta |
| Balón muy pequeño | Entrenar a mayor resolución; SAHI en zonas de interés |
| Poca potencia de cómputo | Modelos pequeños, ONNX/TensorRT, análisis cada N fotogramas |
| Tiempo limitado | Priorizar: pipeline, intrusos, alertas, web básica; dejar opcionales para el final |
| Cuota de GPU de Kaggle | Entrenamientos en segundo plano; Colab o GPU rentada como respaldo |
| Poco espacio en disco | Conservar solo los cuatro `.pt` (versionados en `modelos/`); videos y salidas fuera de Git |
| Licencias | Ultralytics es AGPL-3.0 (licencia empresarial para uso comercial cerrado); los modelos preentrenados de InsightFace son de uso no comercial; revisar la licencia de cada dataset |

---

## 12. Privacidad y consideraciones legales

- El reconocimiento facial usa **datos biométricos**, sensibles y regulados. Verificar la normativa de protección de datos del país antes de usarlo con personas reales.
- Si se usa: lista de vetados controlada, motivo de inclusión documentado, solo embeddings cifrados, registro de cada coincidencia, plazo máximo de retención y proceso para retirar a una persona.
- Umbral conservador (pocas falsas coincidencias) y **verificación humana obligatoria** antes de cualquier acción.
- Para pruebas y demostración, usar solo personas que den su consentimiento.
- El sistema detecta **conductas** (pelea, fuego, entrada a la cancha), no perfila a las personas por su aspecto o pertenencia a un grupo.
- La vista pública no incluye datos de seguridad ni imágenes identificables.

---

## 13. Pendientes y preguntas abiertas

- [ ] **(Bloqueante)** Confirmar el **hardware** donde correrá el sistema (¿GPU NVIDIA? ¿modelo?). Sin este dato no se pueden validar los objetivos de FPS y latencia. El sistema operativo parece ser Linux, a confirmar.
- [ ] Confirmar si las **cámaras son fijas o PTZ**: cambia cómo se definen las zonas.
- [ ] Confirmar si las **métricas deportivas** (balón, posesión, jugadas) son obligatorias o complementarias.
- [ ] Conseguir **videos de prueba** de partidos y, si es posible, del estadio real.
- [ ] Definir el plazo de entrega y el alcance mínimo para la demostración.
- [ ] Verificar licencias de los datasets usados.

---

## 14. Decisiones tomadas

- Un solo pipeline para video cargado y tiempo real.
- Backend y frontend separados; análisis en un `worker` aparte de la API.
- Entrenamiento en Kaggle con YOLO11s.
- Peleas con clasificador por fotograma + suavizado temporal, como primera versión.
- Reconocimiento facial opcional y siempre con verificación humana.
- Vista pública separada de la privada.
- La pirotecnia específica (bengalas) se descartó: se cubre con el modelo genérico de fuego y humo.
