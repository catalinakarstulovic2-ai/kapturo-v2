/**
 * ScoreBadge — muestra el score numérico de un prospecto.
 *
 * variant="light"  → fondo claro con texto de color  (Inmobiliaria, Licitaciones)
 * variant="solid"  → círculo sólido con texto blanco  (Prospector)
 */

interface ScoreBadgeProps {
  score: number
  variant?: 'light' | 'solid'
}

export default function ScoreBadge({ score, variant = 'light' }: ScoreBadgeProps) {
  const rounded = Math.round(score)

  if (variant === 'solid') {
    const bg =
      score >= 70 ? 'bg-emerald-500'
      : score >= 40 ? 'bg-amber-500'
      : 'bg-red-500'
    return (
      <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
        {rounded}
      </div>
    )
  }

  // variant === 'light'
  const color =
    score >= 75 ? 'bg-emerald-100 text-emerald-700'
    : score >= 65 ? 'bg-green-100 text-green-700'
    : score >= 40 ? 'bg-amber-100 text-amber-700'
    : 'bg-red-100 text-red-500'
  return (
    <span className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-sm font-bold ${color}`}>
      {rounded}
    </span>
  )
}
