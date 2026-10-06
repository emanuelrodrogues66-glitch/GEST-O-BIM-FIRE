import { useEffect, useState } from 'react'
import type { Duplicada } from '../lib/meuDia'
import { negociacoesDuplicadas } from '../lib/meuDia'
import { dataBR, reais } from '../lib/crm'

/**
 * Mesma pessoa em duas negociacoes abertas.
 *
 * Acontece quando o cliente volta a procurar e alguem abre um negocio novo em
 * vez de achar o antigo. O estrago e duplo: o cliente recebe dois contatos
 * diferentes e o funil soma o mesmo negocio duas vezes.
 */
export default function CrmDuplicadas({ onAbrirLead }: { onAbrirLead?: (id: string) => void }) {
  const [lista, setLista] = useState<Duplicada[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  async function carregar() {
    setCarregando(true)
    try {
      setLista(await negociacoesDuplicadas())
      setErro('')
    } catch (e: any) {
      setErro(e.message || 'Não foi possível carregar.')
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  if (carregando) return <p className="text-sm text-slate-400 text-center py-20">Procurando repetidas...</p>
  if (erro) return <p className="text-sm text-rose-600 text-center py-20">{erro}</p>

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Negociações repetidas</h3>
        <button onClick={carregar} className="ml-auto text-[11px] text-indigo-600 hover:underline">
          atualizar
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        Mesmo telefone ou mesmo cliente em mais de uma negociação aberta. Abra as duas, veja qual
        está mais adiantada e feche a outra com o motivo da perda, ou junte as informações na que
        vai seguir.
      </p>

      {lista.length === 0 ? (
        <p className="text-sm text-emerald-700">Nenhuma negociação repetida. O funil está limpo.</p>
      ) : (
        <div className="space-y-2">
          {lista.map((d) => (
            <div key={d.tipo + d.chave} className="border border-amber-200 bg-amber-50/40 rounded-lg p-2.5">
              <p className="text-xs font-medium text-slate-700">
                {d.tipo === 'telefone' ? 'Telefone ' : 'Cliente '}
                {d.chave}
                <span className="ml-2 text-[11px] text-amber-700">
                  {d.quantas} negociações abertas
                </span>
              </p>
              <div className="mt-1 space-y-1">
                {d.detalhe.map((x) => (
                  <div key={x.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                    <button
                      onClick={() => onAbrirLead?.(x.id)}
                      className="text-indigo-600 hover:underline font-medium"
                    >
                      {x.cliente || x.nome}
                    </button>
                    <span className="text-slate-500">{x.etapa || 'sem etapa'}</span>
                    <span className="text-slate-400">{x.responsavel || 'sem responsável'}</span>
                    <span className="text-slate-400">aberta em {dataBR(x.criado_em)}</span>
                    <span className="ml-auto text-slate-600">{reais(x.valor || 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
