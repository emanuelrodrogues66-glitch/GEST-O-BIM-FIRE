import { useEffect, useState } from 'react'
import type { ModeloMensagem } from '../lib/crm'
import { apagarModelo, carregarModelos, salvarModelo } from '../lib/crm'

/**
 * Textos prontos de abordagem.
 *
 * Ficam aqui, e nao dentro da extensao, para a equipe inteira usar as mesmas
 * palavras e para corrigir um texto nao exigir uma versao nova do plugin.
 */
export default function CrmModelos({ podeEditar }: { podeEditar: boolean }) {
  const [lista, setLista] = useState<ModeloMensagem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState<Partial<ModeloMensagem> | null>(null)

  async function carregar() {
    setCarregando(true)
    try {
      setLista(await carregarModelos())
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  async function salvar() {
    if (!editando) return
    if (!(editando.nome || '').trim() || !(editando.texto || '').trim()) {
      alert('Dê um nome e escreva o texto.')
      return
    }
    try {
      await salvarModelo(editando)
      setEditando(null)
      carregar()
    } catch (e: any) {
      alert(e.message || 'Não foi possível salvar.')
    }
  }

  async function remover(m: ModeloMensagem) {
    if (!confirm('Apagar o modelo "' + m.nome + '"?')) return
    try {
      await apagarModelo(m.id)
      carregar()
    } catch (e: any) {
      alert(e.message || 'Não foi possível apagar.')
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-700">Modelos de mensagem</h3>
        {podeEditar && !editando && (
          <button
            onClick={() => setEditando({ nome: '', texto: '', ordem: lista.length + 1, ativo: true })}
            className="ml-auto text-[11px] text-indigo-600 hover:underline"
          >
            + novo modelo
          </button>
        )}
      </div>
      <p className="text-[11px] text-slate-500">
        O plugin do WhatsApp lê estes textos na aba Negociações. Use {'{{nome}}'} para o nome do
        contato.
      </p>

      {editando && (
        <div className="border border-indigo-200 bg-indigo-50/40 rounded-lg p-3 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <input
              value={editando.nome || ''}
              onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
              placeholder="Nome do modelo"
              className="col-span-2 border border-slate-200 rounded px-2 py-1.5 text-xs"
            />
            <input
              value={String(editando.ordem ?? '')}
              onChange={(e) => setEditando({ ...editando, ordem: Number(e.target.value) || 0 })}
              placeholder="Ordem"
              className="border border-slate-200 rounded px-2 py-1.5 text-xs"
            />
          </div>
          <textarea
            value={editando.texto || ''}
            onChange={(e) => setEditando({ ...editando, texto: e.target.value })}
            rows={4}
            placeholder="Texto da mensagem"
            className="w-full border border-slate-200 rounded px-2 py-1.5 text-xs"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input
              type="checkbox"
              checked={editando.ativo !== false}
              onChange={(e) => setEditando({ ...editando, ativo: e.target.checked })}
            />
            aparece no plugin
          </label>
          <div className="flex gap-3">
            <button onClick={salvar} className="px-3 py-1 rounded-md bg-indigo-600 text-white text-[11px]">
              salvar
            </button>
            <button onClick={() => setEditando(null)} className="text-[11px] text-slate-500">
              cancelar
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <p className="text-xs text-slate-400">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhum modelo cadastrado ainda.</p>
      ) : (
        <div className="space-y-2">
          {lista.map((m) => (
            <div key={m.id} className="border border-slate-200 rounded-lg p-2.5">
              <p className="text-xs font-semibold text-slate-700">
                {m.nome}
                {!m.ativo && <span className="ml-2 text-[10px] text-slate-400">desligado</span>}
              </p>
              <p className="text-[11px] text-slate-600 whitespace-pre-wrap mt-0.5">{m.texto}</p>
              {podeEditar && (
                <div className="flex gap-3 mt-1">
                  <button onClick={() => setEditando(m)} className="text-[10px] text-indigo-600 hover:underline">
                    editar
                  </button>
                  <button onClick={() => remover(m)} className="text-[10px] text-rose-600 hover:underline">
                    apagar
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
