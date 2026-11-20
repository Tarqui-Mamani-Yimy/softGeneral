# softGeneral Frontend Skeleton

A minimal, production-ready frontend skeleton for the **softGeneral** stadium computer vision security assistant.

Built with:
- **React 19**
- **Vite**
- **TypeScript**
- **Tailwind CSS v4** (via official `@tailwindcss/vite` plugin)
- **React Router**

---

## Architecture & Routes

The application maintains a strict separation between private operational security surveillance and public sports analytics:

### 1. Private Guard Operations (Internal Console)
- `/login` — Operator authentication placeholder (JWT RBAC integration with `guard` and `admin` roles).
- `/dashboard` — Security operations overview and backend connectivity status.
- `/alerts` — Real-time security incident stream (intruder, weapon, fire/smoke, fight detections) with confirm / false alarm controls.
- `/cameras` — Live RTSP / MediaMTX surveillance camera feeds and zone monitoring.
- `/videos` — Video file upload for asynchronous processing and batch analysis.

### 2. Public Sports Metrics
- `/share/:token` — Public match telemetry sharing page. Restricted exclusively to athletic analytics (ball possession, player tracking, event statistics). Security alerts, facial data, and internal surveillance are strictly omitted.

---

## Getting Started

### Prerequisites
- **Node.js**: v24+
- **npm**: v10+

### Installation
Install project dependencies:
```bash
npm install
```

### Environment Configuration
Copy `.env.example` to `.env` to configure the backend API endpoint:
```bash
cp .env.example .env
```
Default configuration:
```env
VITE_API_URL=http://localhost:8000/api/v1
```

### Development Server
Run the local Vite development server:
```bash
npm run dev
```

### Production Build
Type-check and build the optimized production assets to `dist/`:
```bash
npm run build
```

### Linting
Run ESLint to check code consistency and quality:
```bash
npm run lint
```
