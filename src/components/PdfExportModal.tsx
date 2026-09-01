import { useEffect, useRef, useState } from 'react'
import { exportElementToPdf } from '../lib/pdfExport'
import type { BasesDoRateio } from '../lib/rankingPontos'
import { carregarBasesDoRateio, carregarProgressoDoMes, rankingComRateio } from '../lib/rankingPontos'
import type { Project } from '../types'
import type { MonthRef } from '../lib/month'
import { monthLabel, monthRange } from '../lib/month'
import PdfReportView from './PdfReportView'

export default function PdfExportModal({
  categoria,
  projects,
  month,
  onClose,
}: {
  categoria: string
  projects: Project[]
  month: MonthRef
  onClose: () => void
}) {
  const [progressMap, setProgressMap] = useState<Record<string, Record<number, string>>>({})
  const [bases, setBases] = useState<BasesDoRateio | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const { start, end } = monthRange(month)
      const [mapa, b] = await Promise.all([
        carregarProgressoDoMes(projects.map((p) => p.id), start, end),
        carregarBasesDoRateio(),
      ])
      setProgressMap(mapa)
      setBases(b)
      setLoading(false)
    }
    load()
  }, [projects, month])

  async function handleExport() {
    if (!reportRef.current) return
    setExporting(true)
    setError(null)
    try {
      const filename = `Relatorio ${categoria} - ${monthLabel(month)}.pdf`
      await exportElementToPdf(reportRef.current, filename)
    } catch (err: any) {
      console.error(err)
      setError('Não foi possível gerar o PDF. Tente novamente ou reduza o número de projetos filtrados.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="border-b border-slate-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Exportar relatório em PDF</h2>
            <p className="text-xs text-slate-500">
              {categoria} · {projects.length} projeto{projects.length !== 1 ? 's' : ''}
            </p>
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              Fechar
            </button>
            <button
              onClick={handleExport}
              disabled={loading || exporting}
              className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium"
            >
              {exporting ? 'Gerando PDF...' : 'Baixar PDF'}
            </button>
          </div>
        </div>

        <div className="overflow-auto flex-1 bg-slate-100 p-6">
          {loading ? (
            <p className="text-sm text-slate-400 text-center py-20">Carregando progresso diário...</p>
          ) : (
            <div className="origin-top-left" style={{ transform: 'scale(0.45)', width: 2200, height: 'fit-content' }}>
              <PdfReportView
                categoria={categoria}
                projects={projects}
                progressMap={progressMap}
                month={month}
                ranking={bases ? rankingComRateio(projects, bases) : undefined}
              />
            </div>
          )}
        </div>

        {/* Cópia oculta em tamanho real, usada apenas para a captura do PDF */}
        {!loading && (
          <div style={{ position: 'fixed', top: 0, left: -99999, pointerEvents: 'none' }}>
            <PdfReportView
              ref={reportRef}
              categoria={categoria}
              projects={projects}
              progressMap={progressMap}
              month={month}
              ranking={bases ? rankingComRateio(projects, bases) : undefined}
            />
          </div>
        )}
      </div>
    </div>
  )
}
