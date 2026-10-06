import { useEffect, useState } from 'react'
import type { Campanha } from '../lib/prospeccao'
import { carregarCampanhas, telefoneBonito } from '../lib/prospeccao'
import type { ContatoParaLigar } from '../lib/ligacoes'
import { RESULTADOS, filaParaLigar, registrarLigacao } from '../lib/ligacoes'
import { nomeDoUsuario } from '../lib/pendencias'

function quandoCurto(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return p(d.getDate()) + '/' + p(d.getMonth() + 1)
}

/**
 * Ligar para os contatos de uma campanha.
 *
 * Quem nao responde no WhatsApp as vezes atende o telefone — e esse trabalho
 * nao tinha lugar nenhum: a campanha so sabia de mensagem. Aqui a mesma lista
 * vira fila de ligacao, e cada ligacao cai no relatorio junto com as outras.
 */
export default function CrmLigacoesCampanha({ aoRegistrar }: { aoRegistrar?: () => void }) {
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [campanha, setCampanha] = useState('')
  const [soNaoLigados, setSoNaoLigados] = useState(true)
  const [lista, setLista] = useState<ContatoParaLigar[]>([])
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState<string | null>(null)
  const [resultado, setResultado] = useState('atendeu')
  const [minutos, setMinutos] = useState('')
  const [observacao, setObservacao] = useState('')

  useEffect(() => {
    carregarCampanhas()
      .then((cs) => {
        setCampanhas(cs)
        if (cs.length && !campanha) setCampanha(cs[0].id)
      })
      .catch(() => setCampanhas([]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function puxar() {
    if (!campanha) return
    setCarregando(true)
    try {
      setLista(await filaParaLigar(campanha, soNaoLigados))
    } catch (e: any) {
      alert(e.message || 'Não foi possível puxar a campanha.')
    } finally {
      setCarregando(false)
    }
  }

  async function registrar(c: ContatoParaLigar) {
    try {
      await registrarLigacao({
        telefone: c.telefone,
        resultado,
        contatoId: c.contato_id,
        nome: c.nome || c.empresa,
        duracaoSegundos: Math.round((Number(String(minutos).replace(',', '.')) || 0) * 60),
        observacao,
        quem: await nomeDoUsuario(),
        origem: 'crm',
      })
      setAberto(null)
      setMinutos('')
      setObservacao('')
      setResultado('atendeu')
      setLista((prev) =>
        prev.map((x) =>
          x.contato_id === c.contato_id
            ? { ...x, ligacoes: Number(x.ligacoes) + 1, ultima_ligacao: new Date().toISOString() }
            : x
        )
      )
      aoRegistrar?.()
    } catch (e: any) {
      alert(e.message || 'Não foi possível registrar.')
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Ligar para uma campanha</h3>
        <select
          value={campanha}
          onChange={(e) => setCampanha(e.target.value)}
          className="text-xs border border-slate-200 rounded px-2 py-1 max-w-[16rem]"
        >
          {campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
          <input
            type="checkbox"
            checked={soNaoLigados}
            onChange={(e) => setSoNaoLigados(e.target.checked)}
          />
          só quem ainda não recebeu ligação
        </label>
        <button
          onClick={puxar}
          disabled={!campanha || carregando}
          className="px-3 py-1 rounded-md bg-indigo-600 text-white text-[11px] disabled:bg-slate-300"
        >
          {carregando ? 'Puxando...' : 'puxar contatos'}
        </button>
      </div>

      {lista.length === 0 ? (
        <p className="text-[11px] text-slate-400">
          Escolha a campanha e clique em puxar. Quem já respondeu aparece primeiro.
        </p>
      ) : (
        <div className="space-y-1 max-h-[26rem] overflow-y-auto">
          {lista.map((c) => (
            <div key={c.contato_id} className="border border-slate-200 rounded-lg p-2">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="font-medium text-slate-700">
                  {c.nome || c.empresa || telefoneBonito(c.telefone)}
                </span>
                <a
                  href={'tel:+55' + c.telefone}
                  className="text-indigo-600 hover:underline"
                >
                  {telefoneBonito(c.telefone)}
                </a>
                <span className="text-slate-400">{c.cidade || ''}</span>
                <span className="text-slate-500">{c.situacao}</span>
                {Number(c.ligacoes) > 0 && (
                  <span className="text-amber-700">
                    {c.ligacoes} ligação(ões) · última {quandoCurto(c.ultima_ligacao)}
                  </span>
                )}
                <button
                  onClick={() => setAberto(aberto === c.contato_id ? null : c.contato_id)}
                  className="ml-auto text-[11px] text-indigo-600 hover:underline"
                >
                  {aberto === c.contato_id ? 'fechar' : 'registrar ligação'}
                </button>
              </div>

              {aberto === c.contato_id && (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <select
                    value={resultado}
                    onChange={(e) => setResultado(e.target.value)}
                    className="border border-slate-200 rounded px-2 py-1 text-xs"
                  >
                    {RESULTADOS.map((r) => (
                      <option key={r.valor} value={r.valor}>
                        {r.rotulo}
                      </option>
                    ))}
                  </select>
                  <input
                    value={minutos}
                    onChange={(e) => setMinutos(e.target.value)}
                    placeholder="min"
                    className="w-16 border border-slate-200 rounded px-2 py-1 text-xs"
                  />
                  <input
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="O que a pessoa disse"
                    className="flex-1 min-w-[12rem] border border-slate-200 rounded px-2 py-1 text-xs"
                  />
                  <button
                    onClick={() => registrar(c)}
                    className="px-3 py-1 rounded-md bg-emerald-600 text-white text-[11px]"
                  >
                    registrar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
