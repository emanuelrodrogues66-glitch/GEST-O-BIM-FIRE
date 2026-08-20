import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Linha = {
  responsavel: string
  atrasadas: number
  maisAntiga: string
}

/** Chave de sessão: o aviso aparece uma vez por abertura do sistema. */
const CHAVE_SESSAO = 'bimfire:aviso-atrasadas:visto'

function hojeStr() {
  return new Date().toISOString().slice(0, 10)
}

function formatarData(d: string) {
  const [y, m, dia] = d.split('-')
  return `${dia}/${m}/${y}`
}

function diasDeAtraso(prazo: string): number {
  const ms = new Date(`${hojeStr()}T00:00:00Z`).getTime() - new Date(`${prazo}T00:00:00Z`).getTime()
  return Math.max(0, Math.round(ms / 86400000))
}

/**
 * Aviso de abertura: quem está acumulando tarefas atrasadas.
 *
 * Conta só tarefas em aberto com prazo vencido — tarefa concluída fora do
 * prazo já não dá para "colocar em dia", então não entra na cobrança.
 */
export default function AvisoAtrasadas({ onVerRelatorio }: { onVerRelatorio: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [aberto, setAberto] = useState(false)
  const [nomeUsuario, setNomeUsuario] = useState('')

  useEffect(() => {
    if (sessionStorage.getItem(CHAVE_SESSAO)) return
    carregar()
  }, [])

  async function carregar() {
    const { data: sessao } = await supabase.auth.getSession()
    const meta = sessao.session?.user.user_metadata as any
    setNomeUsuario(meta?.nome || sessao.session?.user.email?.split('@')[0] || '')

    const { data, error } = await supabase
      .from('project_tasks')
      .select('responsavel, data_prazo, status')
      .neq('status', 'Concluído')
      .lt('data_prazo', hojeStr())

    if (error || !data?.length) return

    const mapa = new Map<string, Linha>()
    for (const t of data as { responsavel: string | null; data_prazo: string }[]) {
      const nome = (t.responsavel || 'Sem responsável').trim()
      const atual = mapa.get(nome)
      if (!atual) {
        mapa.set(nome, { responsavel: nome, atrasadas: 1, maisAntiga: t.data_prazo })
      } else {
        atual.atrasadas += 1
        if (t.data_prazo < atual.maisAntiga) atual.maisAntiga = t.data_prazo
      }
    }

    const ordenadas = Array.from(mapa.values()).sort(
      (a, b) => b.atrasadas - a.atrasadas || a.maisAntiga.localeCompare(b.maisAntiga)
    )

    setLinhas(ordenadas)
    setAberto(true)
  }

  function fechar() {
    sessionStorage.setItem(CHAVE_SESSAO, '1')
    setAberto(false)
  }

  if (!aberto || linhas.length === 0) return null

  const lider = linhas[0]
  const total = linhas.reduce((s, l) => s + l.atrasadas, 0)
  const souEu = lider.responsavel.toLowerCase() === nomeUsuario.trim().toLowerCase()
  const maximo = lider.atrasadas || 1

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="text-2xl leading-none">⚠️</span>
            <div>
              <h2 className="text-base font-semibold text-amber-900">
                {total} tarefa{total !== 1 ? 's' : ''} atrasada{total !== 1 ? 's' : ''} no momento
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                {souEu ? (
                  <>
                    <b>Você</b> é quem tem mais tarefas vencidas: {lider.atrasadas}. Vale começar o dia
                    colocando-as em dia.
                  </>
                ) : (
                  <>
                    <b>{lider.responsavel}</b> é quem tem mais tarefas vencidas: {lider.atrasadas}, a mais
                    antiga desde {formatarData(lider.maisAntiga)} ({diasDeAtraso(lider.maisAntiga)} dias).
                  </>
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-2 max-h-72 overflow-y-auto">
          {linhas.map((l, i) => {
            const euMesmo = l.responsavel.toLowerCase() === nomeUsuario.trim().toLowerCase()
            return (
              <div key={l.responsavel} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-slate-400 text-right">{i + 1}</span>
                <span
                  className={`w-32 truncate ${euMesmo ? 'font-semibold text-indigo-700' : 'text-slate-700'}`}
                  title={l.responsavel}
                >
                  {l.responsavel}
                  {euMesmo && ' (você)'}
                </span>
                <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${i === 0 ? 'bg-red-500' : 'bg-amber-400'}`}
                    style={{ width: `${(l.atrasadas / maximo) * 100}%` }}
                  />
                </div>
                <span className="w-12 text-right text-slate-600 font-medium">{l.atrasadas}</span>
              </div>
            )
          })}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
          <button
            onClick={fechar}
            className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg"
          >
            Depois
          </button>
          <button
            onClick={() => {
              fechar()
              onVerRelatorio()
            }}
            className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"
          >
            Ver tarefas atrasadas
          </button>
        </div>
      </div>
    </div>
  )
}
