import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import AuthPage from './pages/AuthPage'
import ChatPage from './pages/ChatPage'
import SafetyDashboard from './pages/SafetyDashboard'
import SettingsPage from './pages/SettingsPage'

function Protected({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="h-full grid place-items-center text-gray-400">Loading…</div>
  return user ? children : <Navigate to="/auth" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth" element={<AuthPage />} />
        <Route path="/" element={<Protected><ChatPage /></Protected>} />
        <Route path="/safety" element={<Protected><SafetyDashboard /></Protected>} />
        <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
