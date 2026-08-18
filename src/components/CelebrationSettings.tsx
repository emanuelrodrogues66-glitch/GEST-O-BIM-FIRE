import { useState } from 'react'
import { alertarCorrecao, comemoracao, comemorarConclusao } from '../lib/celebracao'

/** Liga/desliga os avisos visuais e sonoros de mudança de status. */
export default function CelebrationSettings() {
  const [aberto, setAberto] = useState(false)
  const [confete, setConfete] = useState(comemoracao.confeteLigado())
  const [alerta, setAlerta] = useState(comemoracao.alertaLigado())
  const [som, setSom] = useState(comemoracao.somLigado())

  function alternarConfete(v: boolean) {
    setConfete(v)
    comemoracao.setConfete(v)
  }

  function alternarAlerta(v: boolean) {
    setAlerta(v)
    comemoracao.setAlerta(v)
  }

  function alternarSom(v: boolean) {
    setSom(v)
    comemoracao.setSom(v)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className="text-slate-400 hover:text-slate-700 px-2 py-1.5 text-base leading-none"
        title="Avisos de mudança de status"
      >
        🔔
      </button>

      {aberto && (
        <>
          {/* Camada invisível para fechar ao clicar fora */}
          <div className="fixed inset-0 z-20" onClick={() => setAberto(false)} />

          <div className="absolute right-0 top-9 z-30 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
            <p className="text-xs font-semibold text-slate-700 mb-0.5">Avisos de mudança de status</p>
            <p className="text-[11px] text-slate-400 mb-2.5">Vale só para este computador.</p>

            <label className="flex items-start gap-2 text-xs text-slate-700 py-1 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={confete}
                onChange={(e) => alternarConfete(e.target.checked)}
              />
              <span>
                Confete ao <b>concluir</b>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 py-1 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={alerta}
                onChange={(e) => alternarAlerta(e.target.checked)}
              />
              <span>
                Alerta vermelho ao entrar em <b>correção</b>
              </span>
            </label>
            <label className="flex items-start gap-2 text-xs text-slate-700 py-1 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={som}
                onChange={(e) => alternarSom(e.target.checked)}
              />
              <span>Tocar som nos dois casos</span>
            </label>

            <div className="grid grid-cols-2 gap-2 mt-2.5">
              <button
                onClick={() => comemorarConclusao()}
                className="text-[11px] border border-slate-300 hover:border-green-500 hover:bg-green-50 rounded-lg py-1.5 font-medium text-slate-600"
              >
                Testar conclusão
              </button>
              <button
                onClick={() => alertarCorrecao('Projeto de exemplo')}
                className="text-[11px] border border-slate-300 hover:border-red-500 hover:bg-red-50 rounded-lg py-1.5 font-medium text-slate-600"
              >
                Testar correção
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
