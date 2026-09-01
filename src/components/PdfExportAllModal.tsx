import { useEffect, useMemo, useRef, useState } from 'react'
import { exportElementToPdf } from '../lib/pdfExport'
import type { BasesDoRateio } from '../lib/rankingPontos'
import {
  carregarBasesDoRateio,
  carregarProgressoDoMes,
  projetosComMovimentoNoMes,
  rankingComRateio,
} from '../lib/rankingPontos'
import type { Project } from '../types'
import { CATEGORIAS } from '../types'
import type { MonthRef } from '../lib/month'
import { monthLabel, monthRange } from '../lib/month'
import PdfReportView from './PdfReportView'

export default function PdfExportAllModal({
  projects: todosOsProjetos,
  month,
  onClose,
}: {
  projects: Project[]
  month: MonthRef
  onClose: () => void
}) {
  const [progressMap, setProgressMap] = useState<Record<string, Record<number, string>>>({})
  const [bases, setBases] = useState<BasesDoRateio | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [doneIndexes, setDoneIndexes] = useState<number[]>([])
  const [error, setError] = useState<string | null>(null)
  const refs = useRef<(HTMLDivElement | null)[]>([])

  // Só entra no PDF quem andou no mês; ver a regra em projetosComMovimentoNoMes.
  const grupos = useMemo(
    () =>
      CATEGORIAS.map((cat) => ({
        categoria: cat,
        projetos: projetosComMovimentoNoMes(
          todosOsProjetos.filter((p) => p.categoria === cat),
          progressMap,
          month
        ),
      })),
    [todosOsProjetos, progressMap, month]
  )

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { start, end } = monthRange(month)
      const [mapa, b] = await Promise.all([
        carregarProgressoDoMes(todosOsProjetos.map((p) => p.id), start, end),
        carregarBasesDoRateio(),
      ])
      setProgressMap(mapa)
      setBases(b)
      setLoading(false)
    }
    load()
  }, [todosOsProjetos, month])

  async function handleExportAll() {
    setExporting(true)
    setError(null)
    setDoneIndexes([])
    try {
      for (let i = 0; i < grupos.length; i++) {
        if (grupos[i].projetos.length === 0) continue
        setCurrentIndex(i)
        const el = refs.current[i]
        if (!el) continue
        const filename = `Relatorio ${grupos[i].categoria} - ${monthLabel(month)}.pdf`
        await exportElementToPdf(el, filename)
        setDoneIndexes((d) => [...d, i])
        // pequena pausa entre downloads para o navegador processar cada um
        await new Promise((r) => setTimeout(r, 700))
      }
    } catch (err: any) {
      console.error(err)
      setError(
        'Não foi possível gerar todos os PDFs. Se o navegador bloqueou downloads múltiplos, permita "vários downloads" para este site e tente novamente.'
      )
    } finally {
      setExporting(false)
      setCurrentIndex(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">Gerar todos os PDFs</h2>
        <p className="text-xs text-slate-500 mb-4">
          {monthLabel(month)} · um arquivo por categoria, com os projetos que tiveram movimentação no
          mês ({grupos.filter((g) => g.projetos.length > 0).length} arquivo(s)).
        </p>

        <ul className="space-y-1.5 mb-4">
          {grupos.map((g, i) => (
            <li
              key={g.categoria}
              className="flex items-center justify-between text-sm border border-slate-200 rounded-lg px-3 py-2"
            >
              <span className="text-slate-700">{g.categoria}</span>
              <span className="text-xs text-slate-400 flex items-center gap-2">
                {g.projetos.length} projetos
                {exporting && currentIndex === i && (
                  <span className="text-indigo-600 font-medium">Gerando...</span>
                )}
                {doneIndexes.includes(i) && <span className="text-emerald-600 font-medium">Baixado ✓</span>}
              </span>
            </li>
          ))}
        </ul>

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            Fechar
          </button>
          <button
            onClick={handleExportAll}
            disabled={loading || exporting}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium"
          >
            {loading ? 'Carregando...' : exporting ? 'Gerando PDFs...' : 'Baixar todos os PDFs'}
          </button>
        </div>

        {/* Cópias ocultas em tamanho real, uma por categoria, usadas apenas para a captura de cada PDF */}
        {!loading && (
          <div style={{ position: 'fixed', top: 0, left: -99999, pointerEvents: 'none' }}>
            {grupos.map((g, i) => (
              <PdfReportView
                key={g.categoria}
                ref={(el) => {
                  refs.current[i] = el
                }}
                categoria={g.categoria}
                projects={g.projetos}
                progressMap={progressMap}
                month={month}
                ranking={bases ? rankingComRateio(g.projetos, bases) : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
