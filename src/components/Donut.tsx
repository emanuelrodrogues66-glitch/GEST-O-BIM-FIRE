type Slice = { label: string; value: number; color: string }

export default function Donut({ data, size = 160 }: { data: Slice[]; size?: number }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  const radius = size / 2 - 14
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={20} />
          {data.map((d, i) => {
            const frac = d.value / total
            const dash = frac * circumference
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={d.color}
                strokeWidth={20}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-offset}
              />
            )
            offset += dash
            return el
          })}
        </g>
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="fill-slate-700" fontSize={18} fontWeight={700}>
          {total}
        </text>
      </svg>
      <div className="space-y-1">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: d.color }} />
            {d.label} · {total ? Math.round((d.value / total) * 100) : 0}%
          </div>
        ))}
      </div>
    </div>
  )
}
