import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { EtapaTcac } from '../lib/etapasTcac'
import { carregarEtapas, gerarEtapas, lerTabelaColada, prazoEmDias } from '../lib/etapasTcac'
import { reais } from '../lib/financeiro'
import { diasAte } from '../types'
import CampoData from './CampoData'

function dataBR(iso: string | null) {
  if (!iso) return '—'
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

function hojeStr() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Cronograma físico-financeiro do TCAC.
 *
 * São as etapas que o cliente se comprometeu a executar, com prazo e custo.
 * Três caminhos para preencher, porque o cronograma chega de jeitos diferentes:
 * colar a tabela do termo, gerar as etapas anuais, ou digitar linha a linha.
 */
export default function CronogramaTcac({ projectId }: { projectId: string }) {
  const [etapas, setEtapas] = useState<EtapaTcac[]>([])
  const [carregando, setCarregando] = useState(true)
  const [modo, setModo] = useState<'' | 'colar' | 'gerar'>('')
  const [colado, setColado] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [ger, setGer] = useState({
    inicio: hojeStr(),
    quantidade: '2',
    meses: '12',
    custoTotal: '',
  })

  useEffect(() => {
    recarregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  async function recarregar() {
    setCarregando(true)
    setEtapas(await carregarEtapas(projectId))
    setCarregando(false)
  }

  async function atualizar(id: string, patch: Partial<EtapaTcac>) {
    setEtapas((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)))
    const { error } = await supabase.from('project_stages').update(patch).eq('id', id)
    if (error) {
      alert(error.message)
      recarregar()
    }
  }

  async function adicionar() {
    const ultima = etapas[etapas.length - 1]
    const { error } = await supabase.from('project_stages').insert({
      project_id: projectId,
      ordem: (ultima?.ordem || 0) + 1,
      descricao: `Etapa ${(ultima?.ordem || 0) + 1}`,
      // Encadeia na anterior: o término de uma é o começo da próxima.
      data_inicio: ultima?.data_termino || hojeStr(),
    })
    if (error) alert(error.message)
    recarregar()
  }

  /**
   * Apaga uma etapa lançada errado.
   *
   * Renumera as seguintes para o cronograma não ficar com buraco (1, 2, 4),
   * porque a ordem aqui é a numeração do termo — e um TCAC com etapa faltando
   * na sequência levanta dúvida na hora de prestar contas ao Bombeiro.
   */
  async function excluir(e: EtapaTcac) {
    const detalhes = [
      e.data_inicio && `início ${dataBR(e.data_inicio)}`,
      e.data_termino && `término ${dataBR(e.data_termino)}`,
      e.custo != null && reais(e.custo),
    ]
      .filter(Boolean)
      .join(' · ')

    if (
      !confirm(
        `Apagar a etapa ${e.ordem} — "${e.descricao}"?` +
          (detalhes ? `\n${detalhes}` : '') +
          '\n\nAs etapas seguintes são renumeradas. Não tem desfazer.'
      )
    )
      return

    const { error } = await supabase.from('project_stages').delete().eq('id', e.id)
    if (error) {
      alert(`Não foi possível apagar: ${error.message}`)
      return
    }

    const seguintes = etapas.filter((x) => x.ordem > e.ordem)
    for (const s of seguintes) {
      await supabase.from('project_stages').update({ ordem: s.ordem - 1 }).eq('id', s.id)
    }
    recarregar()
  }

  async function importarColado() {
    const linhas = lerTabelaColada(colado)
    if (linhas.length === 0) {
      alert('Não consegui reconhecer nenhuma etapa. Cole a tabela do termo com as colunas separadas.')
      return
    }
    if (!confirm(`Encontrei ${linhas.length} etapa(s). Adicionar ao cronograma?`)) return

    setSalvando(true)
    const base = (etapas[etapas.length - 1]?.ordem || 0) + 1
    const { error } = await supabase.from('project_stages').insert(
      linhas.map((l, i) => ({
        project_id: projectId,
        ordem: base + i,
        descricao: l.descricao,
        data_inicio: l.inicio,
        data_termino: l.termino,
        custo: l.custo,
      }))
    )
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    setColado('')
    setModo('')
    recarregar()
  }

  async function gerar() {
    setSalvando(true)
    try {
      await gerarEtapas({
        projectId,
        inicio: ger.inicio,
        quantidade: Number(ger.quantidade) || 2,
        mesesPorEtapa: Number(ger.meses) || 12,
        custoTotal: ger.custoTotal ? Number(ger.custoTotal) : undefined,
        substituir: etapas.length > 0 && confirm('Substituir as etapas que já existem?'),
      })
      setModo('')
      recarregar()
    } catch (e: any) {
      alert(e.message)
    } finally {
      setSalvando(false)
    }
  }

  const totais = useMemo(() => {
    const custo = etapas.reduce((s, e) => s + (Number(e.custo) || 0), 0)
    const dias = etapas.reduce((s, e) => s + (prazoEmDias(e) || 0), 0)
    const feitas = etapas.filter((e) => e.concluida).length
    return { custo, dias, feitas }
  }, [etapas])

  if (carregando) return <p className="text-xs text-slate-400 py-3">Carregando cronograma...</p>

  return (
    <div className="border border-slate-200 rounded-lg p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold text-slate-700">Cronograma físico-financeiro</h4>
        {etapas.length > 0 && (
          <span className="text-[10px] text-slate-400">
            {totais.feitas} de {etapas.length} concluída{etapas.length === 1 ? '' : 's'}
          </span>
        )}
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setModo(modo === 'colar' ? '' : 'colar')}
            className="text-[10px] text-indigo-600 hover:underline"
          >
            colar do termo
          </button>
          <button
            onClick={() => setModo(modo === 'gerar' ? '' : 'gerar')}
            className="text-[10px] text-indigo-600 hover:underline"
          >
            gerar etapas
          </button>
          <button onClick={adicionar} className="text-[10px] text-slate-500 hover:text-indigo-600">
            + etapa
          </button>
        </div>
      </div>

      {/* ---------- Colar a tabela do termo ---------- */}
      {modo === 'colar' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
          <p className="text-[10px] text-slate-500">
            Abra o TCAC, selecione a tabela do cronograma e cole aqui. Funciona com tabela do Word
            e do Excel — eu separo descrição, datas e custo sozinho.
          </p>
          <textarea
            value={colado}
            onChange={(e) => setColado(e.target.value)}
            rows={5}
            placeholder={'1\tRegularizar Rede de Hidrantes\t11/11/2025\t11/11/2026\t365 dias\tR$ 40.000,00'}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-[11px] font-mono resize-y"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setModo('')}
              className="px-2.5 py-1 text-[11px] text-slate-500 hover:bg-slate-100 rounded-md"
            >
              Cancelar
            </button>
            <button
              onClick={importarColado}
              disabled={!colado.trim() || salvando}
              className="px-3 py-1 text-[11px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              Ler tabela
            </button>
          </div>
        </div>
      )}

      {/* ---------- Gerar etapas anuais ---------- */}
      {modo === 'gerar' && (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-2">
          <p className="text-[10px] text-slate-500">
            O TCAC costuma ser anual e em sequência: o término de uma etapa é o início da próxima.
            Preencha a primeira data e o resto sai encadeado.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-500">Começa em</span>
              <input
                type="date"
                value={ger.inicio}
                onChange={(e) => setGer((g) => ({ ...g, inicio: e.target.value }))}
                className="border border-slate-300 rounded-md px-2 py-1 text-[11px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-500">Etapas</span>
              <input
                type="number"
                min={1}
                max={12}
                value={ger.quantidade}
                onChange={(e) => setGer((g) => ({ ...g, quantidade: e.target.value }))}
                className="w-16 border border-slate-300 rounded-md px-2 py-1 text-[11px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-500">Meses cada</span>
              <input
                type="number"
                min={1}
                max={60}
                value={ger.meses}
                onChange={(e) => setGer((g) => ({ ...g, meses: e.target.value }))}
                className="w-20 border border-slate-300 rounded-md px-2 py-1 text-[11px]"
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[10px] text-slate-500">Custo total (opcional)</span>
              <input
                type="number"
                step="0.01"
                value={ger.custoTotal}
                onChange={(e) => setGer((g) => ({ ...g, custoTotal: e.target.value }))}
                placeholder="0,00"
                className="w-28 border border-slate-300 rounded-md px-2 py-1 text-[11px] text-right"
              />
            </label>
            <button
              onClick={gerar}
              disabled={salvando}
              className="px-3 py-1.5 text-[11px] bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              Gerar
            </button>
          </div>
        </div>
      )}

      {/* ---------- As etapas ---------- */}
      {etapas.length === 0 ? (
        <p className="text-[11px] text-slate-400 py-2">
          Nenhuma etapa ainda. Cole a tabela do termo ou gere as etapas anuais.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase text-slate-400 border-b border-slate-200">
                <th className="text-left py-1.5 w-8">Nº</th>
                <th className="text-left">Descrição da etapa</th>
                <th className="text-left">Início</th>
                <th className="text-left">Término</th>
                <th className="text-right">Prazo</th>
                <th className="text-right">Custo</th>
                <th className="text-center w-20">Concluída</th>
                <th className="text-center w-16">Apagar</th>
              </tr>
            </thead>
            <tbody>
              {etapas.map((e) => {
                const dias = prazoEmDias(e)
                const restam = e.data_termino && !e.concluida ? diasAte(e.data_termino) : null
                const alerta = restam !== null && restam <= 60
                return (
                  <tr
                    key={e.id}
                    className={`border-b border-slate-100 last:border-0 ${
                      e.concluida ? 'bg-emerald-50/40' : alerta ? 'bg-amber-50/50' : ''
                    }`}
                  >
                    <td className="py-1.5 text-slate-400 tabular-nums">{e.ordem}</td>
                    <td>
                      <input
                        defaultValue={e.descricao}
                        onBlur={(ev) =>
                          ev.target.value.trim() !== e.descricao &&
                          atualizar(e.id, { descricao: ev.target.value.trim() })
                        }
                        className={`w-full min-w-[180px] border border-transparent hover:border-slate-200 focus:border-slate-300 rounded px-1 py-0.5 ${
                          e.concluida ? 'line-through text-slate-400' : 'text-slate-700'
                        }`}
                      />
                    </td>
                    <td>
                      <CampoData
                        valor={e.data_inicio}
                        onSalvar={(v) => atualizar(e.id, { data_inicio: v })}
                        className="border-slate-200"
                      />
                    </td>
                    <td>
                      <CampoData
                        valor={e.data_termino}
                        onSalvar={(v) => atualizar(e.id, { data_termino: v })}
                        className={alerta ? 'border-amber-400' : 'border-slate-200'}
                      />
                    </td>
                    <td className="text-right tabular-nums text-slate-500">
                      {dias !== null ? `${dias} dias` : '—'}
                    </td>
                    <td className="text-right">
                      <input
                        type="number"
                        step="0.01"
                        defaultValue={e.custo ?? ''}
                        onBlur={(ev) =>
                          atualizar(e.id, { custo: ev.target.value ? Number(ev.target.value) : null })
                        }
                        placeholder="—"
                        className="w-24 border border-transparent hover:border-slate-200 focus:border-slate-300 rounded px-1 py-0.5 text-right tabular-nums"
                      />
                    </td>
                    <td className="text-center">
                      <label className="flex items-center justify-center gap-1">
                        <input
                          type="checkbox"
                          checked={e.concluida}
                          onChange={(ev) => atualizar(e.id, { concluida: ev.target.checked })}
                        />
                        {e.concluida && e.data_conclusao && (
                          <span className="text-[9px] text-emerald-700 tabular-nums">
                            {dataBR(e.data_conclusao).slice(0, 5)}
                          </span>
                        )}
                      </label>
                    </td>
                    <td className="text-center">
                      <button
                        onClick={() => excluir(e)}
                        title={`Excluir a etapa ${e.ordem}`}
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-300 hover:text-red-700"
                      >
                        excluir
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 font-semibold text-slate-800">
                <td colSpan={4} className="py-1.5">
                  Total
                </td>
                <td className="text-right tabular-nums">{totais.dias} dias</td>
                <td className="text-right tabular-nums">{reais(totais.custo)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {etapas.some((e) => !e.concluida && e.data_termino && diasAte(e.data_termino) <= 60) && (
        <p className="text-[10px] text-amber-700">
          Etapa vencendo nos próximos 60 dias. Passar do prazo aqui não atrasa entrega do
          escritório — deixa o <b>cliente irregular</b> perante o Corpo de Bombeiros.
        </p>
      )}
    </div>
  )
}
