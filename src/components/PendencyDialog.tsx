import { useState } from 'react'
import { MOTIVOS_PENDENCIA } from '../types'
import type { DadosPendencia } from '../lib/pendencias'

/**
 * Pede a justificativa antes de deixar o projeto parado em Pendente.
 * Usado pelo Kanban (arrastar) e pela Lista (alteração em massa).
 */
export default function PendencyDialog({
  titulo,
  onCancelar,
  onConfirmar,
}: {
  titulo: string
  onCancelar: () => void
  onConfirmar: (dados: DadosPendencia) => void
}) {
  const [motivo, setMotivo] = useState<string>(MOTIVOS_PENDENCIA[0])
  const [justificativa, setJustificativa] = useState('')
  const [previsao, setPrevisao] = useState('')

  const podeConfirmar = justificativa.trim().length > 0

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="border-b border-slate-200 px-5 py-3.5">
          <h3 className="text-base font-semibold text-slate-800">Por que o projeto está pendente?</h3>
          <p className="text-xs text-slate-500 mt-0.5">{titulo}</p>
        </div>

        <div className="p-5 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Motivo</label>
            <select
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            >
              {MOTIVOS_PENDENCIA.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Justificativa <span className="text-red-500">*</span>
            </label>
            <textarea
              autoFocus
              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                justificativa.trim() ? 'border-slate-300' : 'border-red-300 bg-red-50/30'
              }`}
              rows={3}
              placeholder="Descreva o que o projeto está esperando. Ex.: cliente ficou de enviar a planta assinada."
              value={justificativa}
              onChange={(e) => setJustificativa(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">
              Previsão de retorno <span className="text-slate-400 font-normal">(opcional)</span>
            </label>
            <input
              type="date"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={previsao}
              onChange={(e) => setPrevisao(e.target.value)}
            />
          </div>

          <p className="text-[11px] text-slate-400">
            O sistema conta os dias enquanto a pendência estiver aberta e encerra sozinho quando o projeto
            mudar para outro status.
          </p>
        </div>

        <div className="border-t border-slate-200 px-5 py-3.5 flex justify-end gap-2">
          <button
            onClick={onCancelar}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            Cancelar
          </button>
          <button
            onClick={() =>
              onConfirmar({
                motivo,
                justificativa,
                previsao_retorno: previsao || null,
              })
            }
            disabled={!podeConfirmar}
            className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg font-medium"
          >
            Registrar pendência
          </button>
        </div>
      </div>
    </div>
  )
}
