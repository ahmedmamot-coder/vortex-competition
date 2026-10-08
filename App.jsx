import { Routes, Route, Navigate } from 'react-router-dom'
import AuthGate from './AuthGate.jsx'
import Console from './Console.jsx'
import Board from './Board.jsx'
import Register from './Register.jsx'

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
