import { useEffect, useState } from 'react'
import type { Ligacao } from '../lib/ligacoes'
import {
  RESULTADOS,
  corDoResultado,
  duracaoBonita,
  ligacoesDoLead,
  registrarLigacao,
  rotuloDoResultado,
} from '../lib/ligacoes'
import { nomeDoUsuario } from '../lib/pendencias'

/** "2026-10-06T13:40:00Z" vira "06/10 13:40". */
function quandoBonito(iso: string) {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}

/**
 * Ligacoes de uma negociacao: registrar e ver o que ja houve.
 *
 * Fica dentro do cartao porque a pergunta que importa na hora de ligar e
 * "quantas vezes ja tentei e o que a pessoa disse da ultima vez".
 */
export default function LigacoesDoLead({
  leadId,
  telefone,
  nome,
  podeEditar,
}: {
  leadId: string
  telefone: string | null
  nome: string | null
  podeEditar: boolean
}) {
  const [lista, setLista] = useState<Ligacao[]>([])
  const [abrindo, setAbrindo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState('atendeu')
  const [minutos, setMinutos] = useState('')
  const [observacao, setObservacao] = useState('')
  const [proximo, setProximo] = useState('')

  /** Daqui a N dias, no formato do campo de data. */
  function daquiA(dias: number) {
    const d = new Date()
    d.setDate(d.getDate() + dias)
    return d.toISOString().slice(0, 10)
  }

  /**
   * Nao atendeu ja sai com a proxima tentativa marcada.
   *
   * Quem nao atende hoje so volta a ser lembrado se ficar agendado; sem isso o
   * contato some ate alguem lembrar por acaso.
   */
  function escolherResultado(valor: string) {
    setResultado(valor)
    if (!proximo && valor !== 'atendeu' && valor !== 'sem_interesse' && valor !== 'numero_errado') {
      setProximo(daquiA(3))
    }
  }

  async function carregar() {
    try {
      setLista(await ligacoesDoLead(leadId))
    } catch {
      setLista([])
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId])

  async function salvar() {
    if (!telefone) {
      alert('Essa negociação não tem telefone no cadastro.')
      return
    }
    setSalvando(true)
    try {
      await registrarLigacao({
        telefone,
        resultado,
        leadId,
        nome,
        duracaoSegundos: Math.round((Number(String(minutos).replace(',', '.')) || 0) * 60),
        observacao,
        proximoPasso: proximo || null,
        quem: await nomeDoUsuario(),
        origem: 'crm',
      })
      setAbrindo(false)
      setMinutos('')
      setObservacao('')
      setProximo('')
      setResultado('atendeu')
      carregar()
    } catch (e: any) {
      alert(e.message || 'Não foi possível registrar.')
    } finally {
      setSalvando(false)
    }
  }

  const atendidas = lista.filter((l) => l.resultado === 'atendeu').length

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-700">Ligações</h4>
        <span className="text-[11px] text-slate-500">
          {lista.length} tentativa(s) · {atendidas} atendida(s)
        </span>
        {podeEditar && !abrindo && (
          <button
            onClick={() => setAbrindo(true)}
            className="ml-auto text-[11px] text-indigo-600 hover:underline"
          >
            + registrar ligação
          </button>
        )}
      </div>

      {abrindo && (
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-2.5 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <label className="text-[10px] text-slate-500">
              Resultado
              <select
                value={resultado}
                onChange={(e) => escolherResultado(e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
              >
                {RESULTADOS.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[10px] text-slate-500">
              Duração (min)
              <input
                value={minutos}
                onChange={(e) => setMinutos(e.target.value)}
                placeholder="ex.: 3"
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
              />
            </label>
            <label className="text-[10px] text-slate-500 md:col-span-2">
              Voltar a falar em
              <input
                type="date"
                value={proximo}
                onChange={(e) => setProximo(e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
              />
            </label>
          </div>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={2}
            placeholder="O que a pessoa disse"
            className="w-full border border-slate-200 rounded px-2 py-1 text-xs bg-white"
          />
          <div className="flex gap-3">
            <button
              onClick={salvar}
              disabled={salvando}
              className="px-3 py-1 rounded-md bg-indigo-600 text-white text-[11px] disabled:bg-slate-300"
            >
              {salvando ? 'Registrando...' : 'registrar'}
            </button>
            <button onClick={() => setAbrindo(false)} className="text-[11px] text-slate-500">
              cancelar
            </button>
            <span className="text-[10px] text-slate-500 self-center">
              A data do último contato da negociação é atualizada junto.
            </span>
          </div>
        </div>
      )}

      {lista.length === 0 ? (
        <p className="text-[11px] text-slate-400">Nenhuma ligação registrada.</p>
      ) : (
        <div className="space-y-1">
          {lista.map((l) => (
            <div key={l.id} className="text-[11px] border-b border-slate-100 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={'px-1.5 py-0.5 rounded-full ' + corDoResultado(l.resultado)}>
                  {rotuloDoResultado(l.resultado)}
                </span>
                <span className="text-slate-500">{quandoBonito(l.quando)}</span>
                {l.duracao_segundos > 0 && (
                  <span className="text-slate-500">{duracaoBonita(l.duracao_segundos)}</span>
                )}
                <span className="text-slate-400 ml-auto">{l.quem}</span>
              </div>
              {l.observacao && <p className="text-slate-600 mt-0.5">{l.observacao}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
