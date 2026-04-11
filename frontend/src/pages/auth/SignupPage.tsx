import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import toast from 'react-hot-toast'
import { Zap } from 'lucide-react'

export default function SignupPage() {
  const navigate = useNavigate()
  const { signup } = useAuthStore()
  const [form, setForm] = useState({ companyName: '', fullName: '', email: '', password: '' })
  const [loading, setLoading] = useState(false)

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await signup(form.companyName, form.fullName, form.email, form.password)
      toast.success('Cuenta creada exitosamente')
      navigate('/dashboard')
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Error al crear cuenta')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-brand-500 rounded-xl mb-3">
            <Zap size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Crear cuenta en Kapturo</h1>
          <p className="text-gray-500 mt-1">Empieza a prospectar en minutos</p>
        </div>

        <div className="card p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre de tu empresa</label>
              <input className="input" value={form.companyName} onChange={set('companyName')} required placeholder="Mi Empresa SpA" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tu nombre</label>
              <input className="input" value={form.fullName} onChange={set('fullName')} required placeholder="Juan Pérez" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" className="input" value={form.email} onChange={set('email')} required placeholder="juan@empresa.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input type="password" className="input" value={form.password} onChange={set('password')} required placeholder="Mínimo 8 caracteres" />
            </div>
            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? 'Creando cuenta...' : 'Crear cuenta'}
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-gray-500 mt-4">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-brand-600 font-medium hover:underline">Ingresar</Link>
        </p>
      </div>
    </div>
  )
}
