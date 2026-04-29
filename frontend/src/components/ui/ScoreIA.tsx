// Alta ≥ 75 · Media 45–74 · Baja < 45
export function ScoreIA({ score }: { score: number }) {
  const nivel = score >= 75 ? 'Alta' : score >= 45 ? 'Media' : 'Baja'
  const color =
    score >= 75
      ? 'text-ok bg-ok-light border-ok-border'
      : score >= 45
      ? 'text-warn bg-warn-light border-warn-border'
      : 'text-bad bg-bad-light border-bad-border'
  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-xl border ${color}`}>
      <div className="w-16 h-1.5 bg-ink-3 rounded-full overflow-hidden">
        <div className="h-1.5 rounded-full bg-current" style={{ width: `${score}%` }} />
      </div>
      <span className="font-mono font-bold text-sm">{score}</span>
      <span className="text-xs font-medium">{nivel}</span>
    </div>
  )
}
