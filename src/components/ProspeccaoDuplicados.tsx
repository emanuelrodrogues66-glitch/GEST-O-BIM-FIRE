import { useEffect, useState } from 'react'
import type { Duplicado } from '../lib/prospeccao'
import { carregarDuplicados, resolverDuplicado, telefoneBonito } from '../lib/prospeccao'

/**
 * O mesmo numero em mais de uma campanha.
 *
 * Acontece com lista comprada e com numero incluido a mao depois. Sem olhar
 * isso, a mesma pessoa recebe a abordagem duas vezes, de dois estados
 * diferentes, e parece que a empresa nao sabe com quem esta falando.
 */
export default function ProspeccaoDuplicados({ podeEditar }: { podeEditar: boolean }) {
  const [lista, setLista] = useState<Duplicado[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  async function carregar() {
    setCarregando(true)
    try {
      setLista(await carregarDuplicados())
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

  async function manter(d: Duplicado, campanhaId: string, campanha: string) {
    const outras = d.detalhe.filter((x) => x.campanha_id !== campanhaId)
    const naFila = outras.filter((x) => x.situacao === 'fila')
    if (naFila.length === 0) {
      alert('As outras cópias já receberam mensagem — essas o sistema não apaga, para não perder o histórico.')
      return
    }
    if (!confirm('Manter só em ' + campanha + ' e tirar de ' + naFila.length + ' outra(s) campanha(s)?')) return
    try {
      await resolverDuplicado(d.telefone, campanhaId)
      carregar()
    } catch (e: any) {
      alert(e.message || 'Não foi possível resolver.')
    }
  }

  if (carregando) return <p className="text-sm text-slate-400 py-10 text-center">Procurando repetidos...</p>
  if (erro) return <p className="text-sm text-rose-600 py-10 text-center">{erro}</p>

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Números repetidos em campanhas diferentes</h3>
        <button onClick={carregar} className="text-[11px] text-indigo-600 hover:underline ml-auto">
          atualizar
        </button>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-emerald-700">Nenhum número repetido. As campanhas estão limpas.</p>
      ) : (
        <>
          <p className="text-[11px] text-slate-500">
            {lista.length} número(s) aparecem em mais de uma campanha. Escolha onde ele deve ficar; as
            cópias que ainda estão na fila saem das outras. Quem já recebeu mensagem fica como está,
            para não apagar o histórico.
          </p>
          <div className="space-y-2">
            {lista.map((d) => (
              <div key={d.telefone} className="border border-amber-200 bg-amber-50/40 rounded-lg p-2.5">
                <p className="text-sm font-medium text-slate-700">
                  {telefoneBonito(d.telefone)}
                  <span className="ml-2 text-[11px] text-amber-700">em {d.campanhas} campanhas</span>
                </p>
                <div className="mt-1.5 space-y-1">
                  {d.detalhe.map((x) => (
                    <div key={x.contato_id} className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="text-slate-700 font-medium">{x.campanha}</span>
                      <span className="text-slate-500">{x.situacao}</span>
                      {x.nome && <span className="text-slate-400">{x.nome}</span>}
                      {podeEditar && (
                        <button
                          onClick={() => manter(d, x.campanha_id, x.campanha)}
                          className="ml-auto text-[11px] text-indigo-600 hover:underline"
                        >
                          manter só aqui
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
