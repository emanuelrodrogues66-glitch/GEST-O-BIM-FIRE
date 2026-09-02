import { useMemo, useState } from 'react'
import type { Lead } from '../lib/crm'
import {
  ajustarComissao,
  dataBR,
  definirValorFechado,
  marcarComissaoPaga,
  reais,
} from '../lib/crm'
import { carimboDeHoje, exportarParaExcel } from '../lib/exportarExcel'

/**
 * Comissões por vendedor.
 *
 * A tela existe para fechar o mês: quem vendeu o quê, quanto rendeu, o que já
 * foi pago e o que falta. Por isso tudo o que muda o número é editável aqui
 * mesmo — valor fechado, percentual e a marca de pago — em vez de obrigar a
 * abrir cartão por cartão.
 *
 * Mexer no percentual trava o lead: a partir daí a regra vigente não o
 * sobrescreve mais, porque foi uma pessoa que decidiu. O "voltar à regra"
 * desfaz isso.
 */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function rotuloMes(chave: string): string {
  const [a, m] = chave.split('-')
  return `${MESES[Number(m) - 1]}/${a}`
}

/** A data que vale para comissão é a do fechamento — não a da abertura. */
function mesDoFechamento(l: Lead): string | null {
  return l.data_fechamento ? l.data_fechamento.slice(0, 7) : null
}

export default function CrmComissoes({
  leads,
  podeEditar,
  onMudou,
}: {
  leads: Lead[]
  podeEditar: boolean
  onMudou: () => void
}) {
  const [mes, setMes] = useState('')
  const [quem, setQuem] = useState('')
  const [soPendentes, setSoPendentes] = useState(false)
  const [salvando, setSalvando] = useState<string | null>(null)

  const ganhos = useMemo(() => leads.filter((l) => l.estado === 'ganho'), [leads])

  const meses = useMemo(() => {
    const s = new Set<string>()
    for (const l of ganhos) {
      const m = mesDoFechamento(l)
      if (m) s.add(m)
    }
    return Array.from(s).sort().reverse()
  }, [ganhos])

  const responsaveis = useMemo(
    () => Array.from(new Set(ganhos.map((l) => l.responsavel || 'Sem responsável'))).sort(),
    [ganhos]
  )

  const filtrados = useMemo(() => {
    return ganhos
      .filter((l) => {
        if (mes === 'sem-data') {
          if (l.data_fechamento) return false
        } else if (mes && mesDoFechamento(l) !== mes) return false
        if (quem && (l.responsavel || 'Sem responsável') !== quem) return false
        if (soPendentes && (l.comissao_paga_em || !l.comissao_valor)) return false
        return true
      })
      .sort((a, b) => (b.data_fechamento || '').localeCompare(a.data_fechamento || ''))
  }, [ganhos, mes, quem, soPendentes])

  /** Um bloco por vendedor, cada um com seu subtotal. */
  const porPessoa = useMemo(() => {
    const mapa = new Map<string, Lead[]>()
    for (const l of filtrados) {
      const k = l.responsavel || 'Sem responsável'
      if (!mapa.has(k)) mapa.set(k, [])
      mapa.get(k)!.push(l)
    }
    return Array.from(mapa.entries()).sort((a, b) => somaComissao(b[1]) - somaComissao(a[1]))
  }, [filtrados])

  const totalFaturado = filtrados.reduce((s, l) => s + (l.valor_fechado ?? l.valor ?? 0), 0)
  const totalComissao = somaComissao(filtrados)
  const totalPago = somaComissao(filtrados.filter((l) => l.comissao_paga_em))
  const semRegra = filtrados.filter((l) => l.comissao_valor === null && !l.comissao_manual).length

  async function comSalvamento(id: string, acao: () => Promise<void>) {
    setSalvando(id)
    try {
      await acao()
      onMudou()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSalvando(null)
    }
  }

  function mudarValor(l: Lead) {
    const v = prompt(
      `Valor fechado de "${l.nome}":`,
      (l.valor_fechado ?? l.valor ?? '').toString()
    )
    if (v === null) return
    const n = v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'))
    if (n !== null && Number.isNaN(n)) return alert('Valor inválido.')
    comSalvamento(l.id, () => definirValorFechado(l.id, n))
  }

  function mudarPercentual(l: Lead) {
    const atual = l.comissao_percentual !== null ? (l.comissao_percentual * 100).toString() : ''
    const v = prompt(
      `Percentual da comissão de "${l.nome}", em %.\n\nDeixe vazio para voltar à regra do período.`,
      atual
    )
    if (v === null) return
    if (v.trim() === '') return comSalvamento(l.id, () => ajustarComissao(l.id, {}))
    const n = Number(v.replace(',', '.'))
    if (Number.isNaN(n) || n < 0 || n > 100) return alert('Percentual inválido.')
    comSalvamento(l.id, () => ajustarComissao(l.id, { percentual: n / 100 }))
  }

  function mudarValorComissao(l: Lead) {
    const v = prompt(
      `Valor da comissão de "${l.nome}", em reais.\n\nDeixe vazio para voltar à regra do período.`,
      l.comissao_valor?.toString() || ''
    )
    if (v === null) return
    if (v.trim() === '') return comSalvamento(l.id, () => ajustarComissao(l.id, {}))
    const n = Number(v.replace(/\./g, '').replace(',', '.'))
    if (Number.isNaN(n)) return alert('Valor inválido.')
    comSalvamento(l.id, () => ajustarComissao(l.id, { valor: n }))
  }

  function exportar() {
    exportarParaExcel({
      nomeArquivo: `Comissoes ${mes ? rotuloMes(mes) : 'tudo'} - ${carimboDeHoje()}.xlsx`,
      nomeAba: 'Comissões',
      linhas: filtrados,
      colunas: [
        { titulo: 'Responsável', valor: (l) => l.responsavel || '', largura: 16 },
        { titulo: 'Negócio', valor: (l) => l.nome, largura: 40 },
        { titulo: 'Cliente / parceiro', valor: (l) => l.nome_cliente || l.nome_parceiro || '', largura: 26 },
        { titulo: 'Fechado em', valor: (l) => l.data_fechamento || '', largura: 12 },
        { titulo: 'Tipo', valor: (l) => l.tipo_venda || '', largura: 12 },
        { titulo: 'Valor fechado', valor: (l) => l.valor_fechado ?? l.valor ?? '', largura: 14 },
        { titulo: '%', valor: (l) => (l.comissao_percentual ?? '') as any, largura: 8 },
        { titulo: 'Comissão', valor: (l) => l.comissao_valor ?? '', largura: 13 },
        { titulo: 'Paga em', valor: (l) => l.comissao_paga_em || '', largura: 12 },
      ],
    })
  }

  return (
    <div className="space-y-3">
      {/* ---------- filtros ---------- */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[10px] uppercase text-slate-400">Mês do fechamento</span>
          <select
            value={mes}
            onChange={(e) => setMes(e.target.value)}
            className="block mt-0.5 text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="">Todos os meses</option>
            {meses.map((m) => (
              <option key={m} value={m}>
                {rotuloMes(m)}
              </option>
            ))}
            <option value="sem-data">Sem data de fechamento</option>
          </select>
        </label>

        <label className="block">
          <span className="text-[10px] uppercase text-slate-400">Responsável</span>
          <select
            value={quem}
            onChange={(e) => setQuem(e.target.value)}
            className="block mt-0.5 text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="">Todos</option>
            {responsaveis.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-slate-600 pb-1.5">
          <input
            type="checkbox"
            checked={soPendentes}
            onChange={(e) => setSoPendentes(e.target.checked)}
          />
          Só o que falta pagar
        </label>

        <button
          onClick={exportar}
          className="ml-auto text-xs px-3 py-1.5 rounded-lg border border-slate-300 hover:border-slate-400"
        >
          ⬇ Excel
        </button>
      </div>

      {/* ---------- totais ---------- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Caixa titulo="Vendas" valor={filtrados.length.toString()} rodape={reais(totalFaturado)} />
        <Caixa titulo="Comissão" valor={reais(totalComissao)} tom="bom" />
        <Caixa titulo="Já paga" valor={reais(totalPago)} />
        <Caixa titulo="A pagar" valor={reais(totalComissao - totalPago)} tom="alerta" />
      </div>

      {semRegra > 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {semRegra} vend{semRegra === 1 ? 'a' : 'as'} sem comissão calculada — ou fecharam antes de
          abril/2026, quando ainda não havia regra, ou o responsável não bate com nenhuma regra
          cadastrada. Dá para lançar o valor à mão em cada uma.
        </p>
      )}

      {/* ---------- lista por vendedor ---------- */}
      {porPessoa.map(([pessoa, lista]) => (
        <div key={pessoa} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
          <div className="flex items-baseline gap-3 px-4 py-2.5 border-b border-slate-200">
            <h3 className="text-sm font-semibold text-slate-800">{pessoa}</h3>
            <span className="text-[11px] text-slate-400">
              {lista.length} venda{lista.length === 1 ? '' : 's'} ·{' '}
              {reais(lista.reduce((s, l) => s + (l.valor_fechado ?? l.valor ?? 0), 0))}
            </span>
            <span className="ml-auto text-sm font-semibold text-emerald-700 tabular-nums">
              {reais(somaComissao(lista))}
            </span>
            {somaComissao(lista.filter((l) => !l.comissao_paga_em)) > 0 && (
              <span className="text-[11px] text-amber-700">
                a pagar {reais(somaComissao(lista.filter((l) => !l.comissao_paga_em)))}
              </span>
            )}
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-100">
                <th className="text-left py-1.5 pl-4">Negócio</th>
                <th className="text-left">Cliente / parceiro</th>
                <th className="text-left">Fechou</th>
                <th className="text-left">Tipo</th>
                <th className="text-right">Valor fechado</th>
                <th className="text-right">%</th>
                <th className="text-right">Comissão</th>
                <th className="text-center pr-4">Paga</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((l) => (
                <tr
                  key={l.id}
                  className={`border-b border-slate-50 last:border-0 ${
                    salvando === l.id ? 'opacity-40' : ''
                  } ${l.comissao_paga_em ? 'bg-emerald-50/40' : ''}`}
                >
                  <td className="py-1.5 pl-4 max-w-[260px] truncate text-slate-800">{l.nome}</td>
                  <td className="text-slate-500 max-w-[180px] truncate">
                    {l.nome_cliente || l.nome_parceiro || '—'}
                  </td>
                  <td className="text-slate-400 tabular-nums">{dataBR(l.data_fechamento)}</td>
                  <td>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                      {l.tipo_venda === 'memorial'
                        ? 'memorial'
                        : l.tipo_venda === 'recompra'
                          ? 'ativo'
                          : l.tipo_venda === 'novo'
                            ? 'novo'
                            : '—'}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">
                    <Editavel
                      travado={!podeEditar}
                      onClick={() => mudarValor(l)}
                      texto={reais(l.valor_fechado ?? l.valor)}
                    />
                  </td>
                  <td className="text-right tabular-nums text-slate-500">
                    <Editavel
                      travado={!podeEditar}
                      onClick={() => mudarPercentual(l)}
                      texto={
                        l.comissao_percentual !== null
                          ? `${(l.comissao_percentual * 100).toLocaleString('pt-BR')}%`
                          : '—'
                      }
                      aviso={l.comissao_manual}
                    />
                  </td>
                  <td className="text-right tabular-nums font-medium text-emerald-700">
                    <Editavel
                      travado={!podeEditar}
                      onClick={() => mudarValorComissao(l)}
                      texto={l.comissao_valor !== null ? reais(l.comissao_valor) : '—'}
                    />
                  </td>
                  <td className="text-center pr-4">
                    <label className="inline-flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={!podeEditar || l.comissao_valor === null}
                        checked={!!l.comissao_paga_em}
                        onChange={(e) =>
                          comSalvamento(l.id, () => marcarComissaoPaga(l.id, e.target.checked))
                        }
                      />
                      {l.comissao_paga_em && (
                        <span className="text-[10px] text-emerald-700 tabular-nums">
                          {dataBR(l.comissao_paga_em)}
                        </span>
                      )}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {porPessoa.length === 0 && (
        <p className="text-center text-xs text-slate-400 py-10">
          Nenhuma venda com esses filtros.
        </p>
      )}

      <p className="text-[10px] text-slate-400 px-1">
        Clique no valor fechado, no percentual ou na comissão para alterar. Percentual ou valor
        mexido à mão trava a linha — o recálculo automático deixa de encostar nela até você limpar o
        campo, que a devolve à regra do período.
      </p>
    </div>
  )
}

function somaComissao(lista: Lead[]): number {
  return lista.reduce((s, l) => s + (l.comissao_valor ?? 0), 0)
}

function Editavel({
  texto,
  onClick,
  travado,
  aviso,
}: {
  texto: string
  onClick: () => void
  travado: boolean
  aviso?: boolean
}) {
  if (travado) return <span>{texto}</span>
  return (
    <button
      onClick={onClick}
      className="px-1 rounded hover:bg-slate-100 hover:underline decoration-dotted"
      title={aviso ? 'Ajustado à mão' : 'Clique para alterar'}
    >
      {texto}
      {aviso && <span className="text-cobre-600 ml-0.5">*</span>}
    </button>
  )
}

function Caixa({
  titulo,
  valor,
  rodape,
  tom,
}: {
  titulo: string
  valor: string
  rodape?: string
  tom?: 'bom' | 'alerta'
}) {
  const cor = tom === 'bom' ? 'text-emerald-700' : tom === 'alerta' ? 'text-amber-700' : 'text-slate-800'
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p className={`text-lg font-semibold tabular-nums ${cor}`}>{valor}</p>
      {rodape && <p className="text-[10px] text-slate-400">{rodape}</p>}
    </div>
  )
}
