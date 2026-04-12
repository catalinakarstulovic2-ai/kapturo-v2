import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function ResetPage() {
  const navigate = useNavigate()
  useEffect(() => {
    localStorage.clear()
    sessionStorage.clear()
    navigate('/login', { replace: true })
  }, [])
  return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Limpiando sesión...</div>
}
