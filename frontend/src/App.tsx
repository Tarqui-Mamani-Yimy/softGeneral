import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/private/LoginPage';
import { DashboardPage } from './pages/private/DashboardPage';
import { AlertsPage } from './pages/private/AlertsPage';
import { CamerasPage } from './pages/private/CamerasPage';
import { BannedPersonsPage } from './pages/private/BannedPersonsPage';
import { SportsEventsPage } from './pages/private/SportsEventsPage';
import { VideosPage } from './pages/private/VideosPage';
import { DemoPage } from './pages/private/DemoPage';
import { SharedResultPage } from './pages/public/SharedResultPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes outside auth guard */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/share/:token" element={<SharedResultPage />} />

          {/* Protected private operations */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/cameras" element={<CamerasPage />} />
              <Route path="/sports" element={<SportsEventsPage />} />
              <Route path="/banned-persons" element={<BannedPersonsPage />} />
              <Route path="/videos" element={<VideosPage />} />
              <Route path="/demo" element={<DemoPage />} />
            </Route>
          </Route>

          {/* Fallback route */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
