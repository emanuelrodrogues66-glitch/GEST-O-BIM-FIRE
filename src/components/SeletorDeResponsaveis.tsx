import { corDoResponsavel } from '../lib/agenda'

/**
 * Escolha de várias pessoas por clique, sem menu suspenso.
 *
 * Com seis pessoas no escritório, mostrar todas de uma vez é mais rápido do
 * que abrir lista, e a cor de cada uma já é a mesma do calendário — dá para
 * conferir a seleção sem ler os nomes.
 */
export default function SeletorDeResponsaveis({
  titulo,
  opcoes,
  selecionados,
  onChange,
  compacto,
}: {
  titulo?: string
  opcoes: string[]
  selecionados: string[]
  onChange: (nomes: string[]) => void
  compacto?: boolean
}) {
  function alternar(nome: string) {
    onChange(
      selecionados.includes(nome)
        ? selecionados.filter((n) => n !== nome)
        : [...selecionados, nome]
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {titulo && <span className="text-[10px] font-medium text-slate-500 mr-0.5">{titulo}</span>}

      {opcoes.map((nome) => {
        const ativo = selecionados.includes(nome)
        const cor = corDoResponsavel(nome)
        return (
          <button
            key={nome}
            type="button"
            onClick={() => alternar(nome)}
            className={`flex items-center gap-1 rounded-full border transition ${
              compacto ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
            } ${
              ativo
                ? 'text-white font-medium border-transparent'
                : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
            }`}
            style={ativo ? { background: cor } : undefined}
          >
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: ativo ? 'rgba(255,255,255,0.85)' : cor }}
            />
            {nome}
          </button>
        )
      })}

      {opcoes.length === 0 && (
        <span className="text-[10px] text-slate-400">Nenhuma pessoa cadastrada na equipe.</span>
      )}
    </div>
  )
}
