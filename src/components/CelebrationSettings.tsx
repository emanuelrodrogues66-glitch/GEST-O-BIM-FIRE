import { useState } from 'react'
import { comemoracao, comemorarConclusao } from '../lib/celebracao'

/** Liga/desliga o confete e o som que tocam quando um projeto é concluído. */
export default function CelebrationSettings() {
  const [aberto, setAberto] = useState(false)
  const [confete, setConfete] = useState(comemoracao.confeteLigado())
  const [som, setSom] = useState(comemoracao.somLigado())

  function alternarConfete(v: boolean) {
    setConfete(v)
    comemoracao.setConfete(v)
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
        title="Comemoração ao concluir projeto"
      >
        🎉
      </button>

      {aberto && (
        <>
          {/* Camada invisível para fechar ao clicar fora */}
          <div className="fixed inset-0 z-20" onClick={() => setAberto(false)} />

          <div className="absolute right-0 top-9 z-30 w-64 bg-white border border-slate-200 rounded-xl shadow-lg p-3">
            <p className="text-xs font-semibold text-slate-700 mb-0.5">Ao concluir um projeto</p>
            <p className="text-[11px] text-slate-400 mb-2.5">Vale só para este computador.</p>

            <label className="flex items-center gap-2 text-xs text-slate-700 py-1 cursor-pointer">
              <input type="checkbox" checked={confete} onChange={(e) => alternarConfete(e.target.checked)} />
              Soltar confete
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-700 py-1 cursor-pointer">
              <input type="checkbox" checked={som} onChange={(e) => alternarSom(e.target.checked)} />
              Tocar som
            </label>

            <button
              onClick={() => comemorarConclusao()}
              className="w-full mt-2 text-[11px] border border-slate-300 hover:border-indigo-400 hover:bg-slate-50 rounded-lg py-1.5 font-medium text-slate-600"
            >
              Testar agora
            </button>
          </div>
        </>
      )}
    </div>
  )
}
