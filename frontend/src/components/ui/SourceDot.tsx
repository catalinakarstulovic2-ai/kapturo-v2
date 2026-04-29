const SOURCES: Record<string, { label: string; color: string }> = {
  mercado_publico: { label: 'MP',       color: 'bg-info text-white' },
  apollo:          { label: 'Apollo',   color: 'bg-kap-600 text-white' },
  google_maps:     { label: 'Maps',     color: 'bg-orange-500 text-white' },
  apify_linkedin:  { label: 'LinkedIn', color: 'bg-blue-700 text-white' },
  manual:          { label: 'Manual',   color: 'bg-ink-5 text-white' },
}

export function SourceDot({ source }: { source: string }) {
  const s = SOURCES[source] ?? { label: source, color: 'bg-ink-4 text-white' }
  return (
    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full font-mono ${s.color}`}>
      {s.label}
    </span>
  )
}
