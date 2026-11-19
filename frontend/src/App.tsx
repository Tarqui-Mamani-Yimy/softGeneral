import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { LoginPage } from './pages/private/LoginPage';
import { DashboardPage } from './pages/private/DashboardPage';
import { AlertsPage } from './pages/private/AlertsPage';
import { CamerasPage } from './pages/private/CamerasPage';
import { VideosPage } from './pages/private/VideosPage';
import { SharedResultPage } from './pages/public/SharedResultPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public auth / login */}
        <Route path="/login" element={<LoginPage />} />

        {/* Public sports metrics sharing */}
        <Route path="/share/:token" element={<SharedResultPage />} />

        {/* Private guards operations */}
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/alerts" element={<AlertsPage />} />
          <Route path="/cameras" element={<CamerasPage />} />
          <Route path="/videos" element={<VideosPage />} />
        </Route>

        {/* Fallback route */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
