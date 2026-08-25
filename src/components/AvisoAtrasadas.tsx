import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type Linha = {
  responsavel: string
  atrasadas: number
  maisAntiga: string
}

type ProjetoSimples = { id: string; nome: string; numero: number | null; responsavel: string | null }

/** Chave de sessão: o aviso de atrasadas aparece uma vez por abertura. */
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
 * Último dia útil antes de hoje.
 * Segunda-feira olha para a sexta: ninguém precisa assumir projeto no domingo.
 */
function ultimoDiaUtil(): string {
  const d = new Date()
  do {
    d.setDate(d.getDate() - 1)
  } while (d.getDay() === 0 || d.getDay() === 6)
  return d.toISOString().slice(0, 10)
}

/**
 * Aviso de abertura, com duas cobranças:
 *
 * 1. Quem não assumiu projeto no último dia útil — reaparece todo dia até
 *    a pessoa regularizar, porque é registro que não pode ficar em branco.
 * 2. Quem está acumulando tarefas vencidas.
 */
export default function AvisoAtrasadas({ onVerRelatorio }: { onVerRelatorio: () => void }) {
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [semAssumir, setSemAssumir] = useState<string[]>([])
  const [projetos, setProjetos] = useState<ProjetoSimples[]>([])
  const [escolha, setEscolha] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<string | null>(null)
  const [aberto, setAberto] = useState(false)
  const [nomeUsuario, setNomeUsuario] = useState('')

  const diaCobrado = useMemo(() => ultimoDiaUtil(), [])

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function carregar() {
    const { data: sessao } = await supabase.auth.getSession()
    const meta = sessao.session?.user.user_metadata as any
    setNomeUsuario(meta?.nome || sessao.session?.user.email?.split('@')[0] || '')

    const [tarefas, equipe, atividades, projetosRes] = await Promise.all([
      supabase
        .from('project_tasks')
        .select('responsavel, data_prazo, status')
        .neq('status', 'Concluído')
        .lt('data_prazo', hojeStr()),
      supabase.from('team_members').select('nome, ativo').eq('ativo', true).order('ordem'),
      supabase.from('project_activities').select('responsavel').eq('data', diaCobrado),
      supabase.from('projects').select('id, nome, numero, responsavel').order('numero'),
    ])

    // --- Quem não assumiu nenhum projeto no último dia útil ---
    const assumiram = new Set(
      ((atividades.data as { responsavel: string }[]) || []).map((a) => a.responsavel.trim().toLowerCase())
    )
    const faltantes = ((equipe.data as { nome: string }[]) || [])
      .map((m) => m.nome)
      .filter((nome) => !assumiram.has(nome.trim().toLowerCase()))

    setSemAssumir(faltantes)
    setProjetos((projetosRes.data as ProjetoSimples[]) || [])

    // --- Tarefas vencidas ---
    const mapa = new Map<string, Linha>()
    for (const t of ((tarefas.data as { responsavel: string | null; data_prazo: string }[]) || [])) {
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

    // Assunção pendente ignora o "já vi": tem que incomodar até regularizar.
    const jaViu = sessionStorage.getItem(CHAVE_SESSAO)
    if (faltantes.length > 0 || (!jaViu && ordenadas.length > 0)) {
      setAberto(true)
    }
  }

  /** Registra a assunção do dia cobrado, direto do aviso. */
  async function assumir(pessoa: string) {
    const projectId = escolha[pessoa]
    if (!projectId) return
    setSalvando(pessoa)
    const { error } = await supabase.from('project_activities').insert({
      project_id: projectId,
      responsavel: pessoa,
      data: diaCobrado,
      descricao: null,
    })
    setSalvando(null)
    if (error) {
      alert(error.message)
      return
    }
    setSemAssumir((prev) => prev.filter((p) => p !== pessoa))
  }

  function fechar() {
    sessionStorage.setItem(CHAVE_SESSAO, '1')
    setAberto(false)
  }

  if (!aberto || (semAssumir.length === 0 && linhas.length === 0)) return null

  const lider = linhas[0]
  const total = linhas.reduce((s, l) => s + l.atrasadas, 0)
  const souEu = lider && lider.responsavel.toLowerCase() === nomeUsuario.trim().toLowerCase()
  const maximo = lider?.atrasadas || 1

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
        {/* ---------- Assunção pendente ---------- */}
        {semAssumir.length > 0 && (
          <>
            <div className="bg-red-50 border-b border-red-200 px-5 py-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl leading-none">📌</span>
                <div>
                  <h2 className="text-base font-semibold text-red-900">
                    {semAssumir.length} {semAssumir.length === 1 ? 'pessoa não assumiu' : 'pessoas não assumiram'}{' '}
                    projeto em {formatarData(diaCobrado)}
                  </h2>
                  <p className="text-xs text-red-800 mt-0.5">
                    Todo dia útil cada projetista precisa registrar em qual projeto trabalhou. Este aviso
                    volta a aparecer até o dia ser regularizado.
                  </p>
                </div>
              </div>
            </div>

            <div className="px-5 py-4 space-y-2 border-b border-slate-200">
              {semAssumir.map((pessoa) => {
                const meus = projetos.filter(
                  (p) => (p.responsavel || '').trim().toLowerCase() === pessoa.trim().toLowerCase()
                )
                const opcoes = meus.length > 0 ? meus : projetos
                return (
                  <div key={pessoa} className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="w-20 font-semibold text-slate-800 truncate">{pessoa}</span>
                    <select
                      value={escolha[pessoa] || ''}
                      onChange={(e) => setEscolha((prev) => ({ ...prev, [pessoa]: e.target.value }))}
                      className="flex-1 min-w-[160px] text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
                    >
                      <option value="">Em qual projeto trabalhou?</option>
                      {opcoes.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.numero ? `${p.numero} · ` : ''}
                          {p.nome}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => assumir(pessoa)}
                      disabled={!escolha[pessoa] || salvando === pessoa}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-md font-medium"
                    >
                      {salvando === pessoa ? 'Salvando...' : 'Registrar'}
                    </button>
                  </div>
                )
              })}
              <p className="text-[10px] text-slate-400 pt-1">
                Precisa detalhar o que foi feito? Registre aqui e complemente depois no histórico do cartão.
              </p>
            </div>
          </>
        )}

        {/* ---------- Tarefas atrasadas ---------- */}
        {linhas.length > 0 && (
          <>
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

            <div className="px-5 py-4 space-y-2 overflow-y-auto">
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
          </>
        )}

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 mt-auto">
          <button onClick={fechar} className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg">
            {semAssumir.length > 0 ? 'Depois' : 'Fechar'}
          </button>
          {linhas.length > 0 && (
            <button
              onClick={() => {
                fechar()
                onVerRelatorio()
              }}
              className="px-3 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium"
            >
              Ver tarefas atrasadas
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
