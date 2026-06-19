import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ToastProvider } from '@/components/Toast';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import Layout from '@/components/Layout';
import { useAuth } from '@/store/auth';
import Login from '@/pages/Login';
import Dashboard from '@/pages/Dashboard';
import Reserve from '@/pages/Reserve';
import Approvals from '@/pages/Approvals';
import ClassroomConfig from '@/pages/ClassroomConfig';
import CheckIn from '@/pages/CheckIn';
import History from '@/pages/History';
import Statistics from '@/pages/Statistics';
import './index.css';

function AppRoutes() {
  const { init, initialized, user } = useAuth();
  const location = useLocation();

  useEffect(() => {
    init();
  }, [init]);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-brand-600 text-sm">加载中...</div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/reserve"
        element={
          <ProtectedRoute roles={['student']}>
            <Layout>
              <Reserve />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/approvals"
        element={
          <ProtectedRoute roles={['admin']}>
            <Layout>
              <Approvals />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/classrooms"
        element={
          <ProtectedRoute roles={['admin']}>
            <Layout>
              <ClassroomConfig />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/checkin"
        element={
          <ProtectedRoute>
            <Layout>
              <CheckIn />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <Layout>
              <History />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/statistics"
        element={
          <ProtectedRoute roles={['admin']}>
            <Layout>
              <Statistics />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={user ? '/dashboard' : '/login'} state={{ from: location }} replace />} />
    </Routes>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <Router>
        <AppRoutes />
      </Router>
    </ToastProvider>
  </StrictMode>,
);
