import { Routes, Route, Navigate } from 'react-router-dom'
import AuthGate from './components/AuthGate.jsx'
import Console from './pages/Console.jsx'
import Board from './pages/Board.jsx'
import Register from './pages/Register.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/board" element={<AuthGate><Board /></AuthGate>} />
      <Route path="/" element={<AuthGate><Console /></AuthGate>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
