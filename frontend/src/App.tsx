import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import Navbar from './components/Navbar';
import LoginPage from './pages/LoginPage';
import LobbyPage from './pages/LobbyPage';
import AgentListPage from './pages/AgentListPage';
import AgentEditPage from './pages/AgentEditPage';
import RoomPage from './pages/RoomPage';
import GamePage from './pages/GamePage';
import GameResultPage from './pages/GameResultPage';
import HistoryPage from './pages/HistoryPage';
import ProfilePage from './pages/ProfilePage';
import { useAuthStore } from './stores/authStore';

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-darker">
      <Navbar />
      <main className="pt-16">{children}</main>
    </div>
  );
}

function App() {
  const loadUser = useAuthStore((s) => s.loadUser);

  React.useEffect(() => {
    loadUser();
  }, [loadUser]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <AppLayout>
                <LobbyPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents"
          element={
            <ProtectedRoute>
              <AppLayout>
                <AgentListPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents/:id/edit"
          element={
            <ProtectedRoute>
              <AppLayout>
                <AgentEditPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/rooms/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <RoomPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/:id"
          element={
            <ProtectedRoute>
              <AppLayout>
                <GamePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/games/:id/result"
          element={
            <ProtectedRoute>
              <AppLayout>
                <GameResultPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <AppLayout>
                <HistoryPage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <AppLayout>
                <ProfilePage />
              </AppLayout>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
