import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { Loading, ToastProvider } from './ui.jsx';
import Home from './marketing/Home.jsx';
import Auth from './pages/Auth.jsx';

const Shell = lazy(() => import('./pages/Shell.jsx'));

function ScrollTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = loading, null = signed out
  const refresh = useCallback(async () => {
    try { setSession(await api.get('/api/me')); } catch { setSession(null); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ToastProvider>
      <ScrollTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={session ? <Navigate to="/app" replace /> : <Auth mode="login" onAuthed={refresh} />} />
        <Route path="/signup" element={session ? <Navigate to="/app" replace /> : <Auth mode="signup" onAuthed={refresh} />} />
        <Route
          path="/app/*"
          element={
            session === undefined ? <div style={{ padding: 40 }}><Loading label="Opening your workspace" /></div>
              : session === null ? <Navigate to="/login" replace />
                : <Suspense fallback={<div style={{ padding: 40 }}><Loading /></div>}><Shell session={session} onSignOut={() => setSession(null)} /></Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}
