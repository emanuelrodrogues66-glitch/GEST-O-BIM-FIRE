import { useMemo, useRef, useState, useEffect } from 'react'

/** Um trecho colorido dentro da barra (ex.: o período em que o projeto ficou "Tramitando"). */
export type GanttSegment = {
  start: string // yyyy-mm-dd
  end: string // yyyy-mm-dd
  color: string
  label?: string
}

export type GanttItem = {
  id: string
  label: string
  sublabel?: string
  start: string // yyyy-mm-dd
  end: string // yyyy-mm-dd
  color: string
  textColor?: string
  tooltip?: string
  /** Se preenchido, a barra é desenhada em trechos coloridos em vez de cor única. */
  segments?: GanttSegment[]
  /** Meio-tom: usado na barra "planejado" para diferenciar da real. */
  muted?: boolean
  /** Oculta o nome dentro da barra (usado na linha planejada, que fica logo abaixo da real). */
  hideLabel?: boolean
  /** Aproxima esta linha da anterior, agrupando real + planejado do mesmo projeto. */
  attached?: boolean
}

const MS_DIA = 86400000

function parseDate(d: string): Date {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}

function diffDias(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / MS_DIA)
}

function fmt(d: string): string {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
]

type DayCol = {
  date: Date
  day: number
  weekend: boolean
  isToday: boolean
  monthStart: boolean
}

export default function GanttChart({
  items,
  labelWidth = 180,
  rowHeight = 32,
  dayWidth = 28,
  onItemClick,
}: {
  items: GanttItem[]
  labelWidth?: number
  rowHeight?: number
  dayWidth?: number
  /** Se informado, o nome e a barra viram clicáveis. */
  onItemClick?: (id: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const todayColRef = useRef<HTMLDivElement>(null)

  // Arrastar com o mouse para rolar na horizontal (mais confortável que a barra de rolagem).
  const [arrastando, setArrastando] = useState(false)
  const panRef = useRef({ ativo: false, inicioX: 0, inicioScroll: 0, moveu: false })

  function iniciarPan(e: React.MouseEvent) {
    // Só com o botão esquerdo, e nunca em cima de um link ou campo.
    if (e.button !== 0) return
    const alvo = e.target as HTMLElement
    if (alvo.closest('a, input, select, textarea, button')) return
    const el = scrollRef.current
    if (!el) return
    panRef.current = { ativo: true, inicioX: e.clientX, inicioScroll: el.scrollLeft, moveu: false }
    setArrastando(true)
  }

  function moverPan(e: React.MouseEvent) {
    const p = panRef.current
    if (!p.ativo || !scrollRef.current) return
    const dx = e.clientX - p.inicioX
    if (Math.abs(dx) > 4) p.moveu = true
    scrollRef.current.scrollLeft = p.inicioScroll - dx
  }

  function encerrarPan() {
    if (!panRef.current.ativo) return
    panRef.current.ativo = false
    setArrastando(false)
    // Deixa o flag "moveu" vivo por um instante para o clique seguinte ser ignorado.
    setTimeout(() => {
      panRef.current.moveu = false
    }, 0)
  }

  /** Ignora o clique quando ele foi, na verdade, o fim de um arrasto. */
  function clicarItem(id: string) {
    if (panRef.current.moveu) return
    onItemClick?.(id)
  }

  const { min, days, months } = useMemo(() => {
    let minT: number
    let maxT: number
    const hoje = new Date()
    const hojeUTC = new Date(Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())).getTime()
    if (items.length === 0) {
      minT = hojeUTC - 7 * MS_DIA
      maxT = hojeUTC + 21 * MS_DIA
    } else {
      minT = Infinity
      maxT = -Infinity
      for (const it of items) {
        const s = parseDate(it.start).getTime()
        const e = parseDate(it.end || it.start).getTime()
        if (s < minT) minT = s
        if (e > maxT) maxT = e
      }
      // padding de alguns dias em cada ponta, e garante que "hoje" apareça no intervalo
      minT = Math.min(minT, hojeUTC) - 3 * MS_DIA
      maxT = Math.max(maxT, hojeUTC) + 3 * MS_DIA
    }
    const min = new Date(minT)
    const max = new Date(maxT)

    const days: DayCol[] = []
    const cursor = new Date(min)
    while (cursor <= max) {
      const dow = cursor.getUTCDay()
      days.push({
        date: new Date(cursor),
        day: cursor.getUTCDate(),
        weekend: dow === 0 || dow === 6,
        isToday: cursor.getTime() === hojeUTC,
        monthStart: cursor.getUTCDate() === 1,
      })
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }

    const months: { label: string; days: number }[] = []
    days.forEach((d) => {
      const label = `${MESES_ABREV[d.date.getUTCMonth()]}/${String(d.date.getUTCFullYear()).slice(2)}`
      const last = months[months.length - 1]
      if (last && last.label === label) {
        last.days += 1
      } else {
        months.push({ label, days: 1 })
      }
    })

    return { min, max, days, months }
  }, [items])

  const totalDias = days.length
  const timelineWidth = totalDias * dayWidth
  const todayIndex = days.findIndex((d) => d.isToday)

  useEffect(() => {
    if (todayColRef.current && scrollRef.current) {
      const el = todayColRef.current
      const container = scrollRef.current
      container.scrollLeft = Math.max(0, el.offsetLeft - container.clientWidth / 2)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length])

  if (items.length === 0) {
    return <p className="text-xs text-slate-400 py-6 text-center">Sem itens para exibir no cronograma.</p>
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <div
        ref={scrollRef}
        className={`overflow-x-auto select-none ${arrastando ? 'cursor-grabbing' : 'cursor-grab'}`}
        onMouseDown={iniciarPan}
        onMouseMove={moverPan}
        onMouseUp={encerrarPan}
        onMouseLeave={encerrarPan}
      >
        <div style={{ width: labelWidth + timelineWidth, minWidth: '100%' }}>
          {/* Cabeçalho: meses */}
          <div className="flex sticky top-0 z-20 bg-slate-50 border-b border-slate-200">
            <div
              style={{ width: labelWidth }}
              className="shrink-0 sticky left-0 z-30 bg-slate-50 px-2 py-1 border-r border-slate-200 flex items-end text-[10px] font-semibold text-slate-500"
            >
              Item
            </div>
            <div className="flex">
              {months.map((m, i) => (
                <div
                  key={i}
                  style={{ width: m.days * dayWidth }}
                  className="shrink-0 text-center text-[10px] font-semibold text-slate-500 py-1 border-r border-slate-200 last:border-r-0"
                >
                  {m.label}
                </div>
              ))}
            </div>
          </div>
          {/* Cabeçalho: dias */}
          <div className="flex sticky bg-white border-b border-slate-200" style={{ top: 22 }}>
            <div
              style={{ width: labelWidth }}
              className="shrink-0 sticky left-0 z-30 bg-white border-r border-slate-200"
            />
            <div className="flex">
              {days.map((d, i) => (
                <div
                  key={i}
                  ref={d.isToday ? todayColRef : undefined}
                  style={{ width: dayWidth }}
                  className={`shrink-0 text-center text-[9px] py-1 ${
                    d.isToday
                      ? 'bg-red-100 text-red-700 font-bold'
                      : d.weekend
                        ? 'bg-slate-100 text-slate-400'
                        : 'text-slate-400'
                  } ${d.monthStart ? 'border-l border-slate-200' : ''}`}
                >
                  {d.day}
                </div>
              ))}
            </div>
          </div>

          {/* Linhas */}
          <div className="relative">
            {/* fundo: fins de semana + hoje, atrás das barras */}
            <div className="absolute top-0 bottom-0 flex pointer-events-none" style={{ left: labelWidth }}>
              {days.map((d, i) => (
                <div
                  key={i}
                  style={{ width: dayWidth }}
                  className={`h-full shrink-0 ${d.isToday ? 'bg-red-50' : d.weekend ? 'bg-slate-50/70' : ''}`}
                />
              ))}
            </div>
            {todayIndex >= 0 && (
              <div
                className="absolute top-0 bottom-0 w-px bg-red-400 z-10"
                style={{ left: labelWidth + todayIndex * dayWidth + dayWidth / 2 }}
                title="Hoje"
              />
            )}

            {items.map((it) => {
              const s = parseDate(it.start)
              const e = parseDate(it.end || it.start)
              const left = diffDias(min, s) * dayWidth
              const width = Math.max(dayWidth * 0.6, (diffDias(s, e) + 1) * dayWidth)
              const opacity = it.muted ? 0.45 : 1
              const alturaBarra = it.muted ? 7 : 5 // planejada um pouco mais fina

              return (
                <div
                  key={it.id}
                  className={`flex items-center ${
                    it.attached ? '' : 'border-b border-slate-100'
                  } last:border-b-0`}
                  style={{ height: it.attached ? rowHeight * 0.7 : rowHeight }}
                >
                  <div
                    style={{ width: labelWidth }}
                    onClick={onItemClick ? () => clicarItem(it.id) : undefined}
                    className={`shrink-0 sticky left-0 z-10 bg-white px-2 text-xs text-slate-700 border-r border-slate-200 truncate ${
                      onItemClick ? 'cursor-pointer hover:bg-indigo-50 hover:text-indigo-700' : ''
                    }`}
                    title={onItemClick ? 'Abrir o projeto' : undefined}
                  >
                    {it.attached ? (
                      <div className="truncate text-[10px] text-slate-400 pl-2">{it.sublabel || 'Planejado'}</div>
                    ) : (
                      <>
                        <div className="truncate font-medium">{it.label}</div>
                        {it.sublabel && <div className="truncate text-[10px] text-slate-400">{it.sublabel}</div>}
                      </>
                    )}
                  </div>
                  <div
                    className="relative"
                    style={{ width: timelineWidth, height: it.attached ? rowHeight * 0.7 : rowHeight }}
                  >
                    {/* Trilho da barra: define a área total e captura o hover */}
                    <div
                      className={`absolute rounded-md flex items-center px-1.5 text-[10px] font-medium ${
                        onItemClick ? 'cursor-pointer hover:brightness-95' : 'cursor-default'
                      } ${it.muted ? 'border border-dashed border-slate-400' : 'shadow-sm'}`}
                      style={{
                        left,
                        width,
                        top: alturaBarra,
                        bottom: alturaBarra,
                        background: it.segments?.length ? 'transparent' : it.color,
                        opacity,
                        color: it.textColor || '#fff',
                        overflow: 'hidden',
                      }}
                      onClick={onItemClick ? () => clicarItem(it.id) : undefined}
                      onMouseEnter={() => setHover(it.id)}
                      onMouseLeave={() => setHover(null)}
                    >
                      {/* Trechos coloridos: mostram por quais status o projeto passou */}
                      {it.segments?.map((seg, i) => {
                        const segStart = parseDate(seg.start)
                        const segEnd = parseDate(seg.end || seg.start)
                        const segLeft = diffDias(s, segStart) * dayWidth
                        const segWidth = Math.max(2, (diffDias(segStart, segEnd) + 1) * dayWidth)
                        return (
                          <div
                            key={i}
                            className="absolute top-0 bottom-0"
                            style={{ left: segLeft, width: segWidth, background: seg.color }}
                            title={seg.label}
                          />
                        )
                      })}
                      {!it.hideLabel && (
                        <span className="truncate relative z-10 drop-shadow-sm">{it.label}</span>
                      )}
                    </div>

                    {hover === it.id && (
                      <div
                        className="absolute bg-slate-800 text-white text-[10px] rounded px-2 py-1 whitespace-nowrap z-30 shadow-lg pointer-events-none"
                        style={{ left, top: -4 }}
                      >
                        {it.tooltip || `${fmt(it.start)} → ${fmt(it.end)}`}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
