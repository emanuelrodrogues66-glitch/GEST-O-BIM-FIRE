import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { usePerfil } from '../lib/perfil'
import type { TarefaDaAgenda } from '../lib/agenda'
import {
  carregarCategorias,
  carregarRecorrencias,
  carregarTarefas,
  corDoResponsavel,
  gerarOcorrencias,
  hojeStr,
} from '../lib/agenda'
import type { ProjectTask, TaskCategory, TaskRecurrence } from '../types'
import { DIAS_SEMANA, FREQUENCIAS, TASK_STATUS, TASK_STATUS_COLORS, descreverRecorrencia, isTaskLate } from '../types'
import GanttChart from './GanttChart'
import type { GanttItem } from './GanttChart'
import TaskCalendar from './TaskCalendar'

type Aba = 'lista' | 'calendario' | 'gantt' | 'recorrentes'
type Escopo = 'todas' | 'gerais' | 'projeto'

function formatarData(d: string | null) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

export default function AgendaView({
  responsaveis,
  onProjectClick,
}: {
  responsaveis: string[]
  onProjectClick?: (projectId: string) => void
}) {
  const { ehAdmin } = usePerfil()
  const [aba, setAba] = useState<Aba>('lista')
  const [tarefas, setTarefas] = useState<TarefaDaAgenda[]>([])
  const [categorias, setCategorias] = useState<TaskCategory[]>([])
  const [recorrencias, setRecorrencias] = useState<TaskRecurrence[]>([])
  const [carregando, setCarregando] = useState(true)

  const [escopo, setEscopo] = useState<Escopo>('gerais')
  const [categoriaFiltro, setCategoriaFiltro] = useState('')
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)
  const [busca, setBusca] = useState('')

  useEffect(() => {
    iniciar()
  }, [])

  async function iniciar() {
    setCarregando(true)
    // Materializa o que estiver faltando das regras antes de ler a lista.
    await gerarOcorrencias(60)
    await recarregar()
    setCarregando(false)
  }

  async function recarregar() {
    const [t, c, r] = await Promise.all([carregarTarefas(), carregarCategorias(), carregarRecorrencias()])
    setTarefas(t)
    setCategorias(c)
    setRecorrencias(r)
  }

  const filtradas = useMemo(() => {
    return tarefas.filter((t) => {
      if (escopo === 'gerais' && t.project_id) return false
      if (escopo === 'projeto' && !t.project_id) return false
      if (categoriaFiltro && t.categoria_id !== categoriaFiltro) return false
      if (!mostrarConcluidas && t.status === 'Concluído') return false
      if (busca) {
        const alvo = `${t.nome} ${t.responsavel || ''} ${t.projects?.nome || ''}`.toLowerCase()
        if (!alvo.includes(busca.toLowerCase())) return false
      }
      return true
    })
  }, [tarefas, escopo, categoriaFiltro, mostrarConcluidas, busca])

  const porCategoria = useMemo(() => {
    const mapa = new Map<string, { categoria: TaskCategory | null; items: TarefaDaAgenda[] }>()
    for (const t of filtradas) {
      const chave = t.categoria_id || 'sem'
      if (!mapa.has(chave)) {
        mapa.set(chave, {
          categoria: categorias.find((c) => c.id === t.categoria_id) || null,
          items: [],
        })
      }
      mapa.get(chave)!.items.push(t)
    }
    return Array.from(mapa.values()).sort((a, b) => {
      if (!a.categoria) return 1
      if (!b.categoria) return -1
      return a.categoria.ordem - b.categoria.ordem
    })
  }, [filtradas, categorias])

  const ganttItems: GanttItem[] = useMemo(
    () =>
      filtradas
        .filter((t) => t.data_prazo)
        .map((t) => {
          const atrasada = isTaskLate(t)
          const cor =
            t.status === 'Concluído'
              ? atrasada
                ? '#f59e0b'
                : '#10b981'
              : atrasada
                ? '#ef4444'
                : t.task_categories?.cor || corDoResponsavel(t.responsavel)
          return {
            id: t.id,
            label: t.nome,
            sublabel: t.responsavel || undefined,
            start: t.data_inicio || t.data_prazo,
            end: t.data_conclusao || t.data_prazo,
            color: cor,
            tooltip: `${t.nome}${t.responsavel ? ` · ${t.responsavel}` : ''} · ${t.status}${
              atrasada ? ' · ATRASADA' : ''
            }`,
          }
        }),
    [filtradas]
  )

  async function atualizarTarefa(id: string, patch: Partial<ProjectTask>) {
    setTarefas((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
    const { error } = await supabase.from('project_tasks').update(patch).eq('id', id)
    if (error) {
      alert(error.message)
      recarregar()
    }
  }

  async function mudarStatus(t: TarefaDaAgenda, status: string) {
    const patch: Partial<ProjectTask> = { status }
    patch.data_conclusao = status === 'Concluído' ? t.data_conclusao || hojeStr() : null
    await atualizarTarefa(t.id, patch)
  }

  async function excluirTarefa(t: TarefaDaAgenda) {
    const aviso = t.recurrence_id
      ? 'Excluir esta ocorrência? A regra continua gerando as próximas.'
      : 'Excluir esta tarefa?'
    if (!confirm(aviso)) return
    setTarefas((prev) => prev.filter((x) => x.id !== t.id))
    await supabase.from('project_tasks').delete().eq('id', t.id)
  }

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-10">Carregando agenda...</p>
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {(
            [
              ['lista', 'Lista'],
              ['calendario', 'Calendário'],
              ['gantt', 'Gantt'],
              ['recorrentes', 'Recorrentes'],
            ] as [Aba, string][]
          ).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => setAba(v)}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                aba === v ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba !== 'recorrentes' && (
          <>
            <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1">
              {(
                [
                  ['gerais', 'Gerais'],
                  ['projeto', 'De projeto'],
                  ['todas', 'Todas'],
                ] as [Escopo, string][]
              ).map(([v, rotulo]) => (
                <button
                  key={v}
                  onClick={() => setEscopo(v)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md transition ${
                    escopo === v ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {rotulo}
                </button>
              ))}
            </div>

            <select
              value={categoriaFiltro}
              onChange={(e) => setCategoriaFiltro(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
            >
              <option value="">Todas as categorias</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>

            <input
              placeholder="Buscar tarefa..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white flex-1 min-w-[160px] max-w-xs"
            />

            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={mostrarConcluidas}
                onChange={(e) => setMostrarConcluidas(e.target.checked)}
              />
              Mostrar concluídas
            </label>

            <span className="text-xs text-slate-400 ml-auto">{filtradas.length} tarefa(s)</span>
          </>
        )}
      </div>

      {aba === 'lista' && (
        <>
          <NovaTarefaGeral categorias={categorias} responsaveis={responsaveis} onCriada={recarregar} />

          {porCategoria.length === 0 && (
            <p className="text-sm text-slate-400 text-center py-10 bg-white border border-slate-200 rounded-xl">
              Nenhuma tarefa com os filtros atuais.
            </p>
          )}

          {porCategoria.map(({ categoria, items }) => (
            <div key={categoria?.id || 'sem'} className="bg-white border border-slate-200 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ background: categoria?.cor || '#cbd5e1' }}
                />
                {categoria?.nome || 'Sem categoria'}
                <span className="text-xs font-normal text-slate-400">· {items.length}</span>
              </h3>
              <div className="space-y-1.5">
                {items.map((t) => {
                  const atrasada = isTaskLate(t)
                  return (
                    <div
                      key={t.id}
                      className={`border rounded-lg px-2.5 py-1.5 ${
                        atrasada ? 'border-red-200 bg-red-50/40' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {t.codigo && (
                          <span className="text-[10px] font-semibold text-slate-400 tabular-nums shrink-0">
                            {t.codigo}
                          </span>
                        )}
                        <span
                          className={`font-medium ${
                            t.status === 'Concluído' ? 'line-through text-slate-400' : 'text-slate-800'
                          }`}
                        >
                          {t.nome}
                        </span>
                        {t.recurrence_id && (
                          <span className="text-[10px] text-indigo-500" title="Gerada por uma regra recorrente">
                            ↻
                          </span>
                        )}
                        {t.projects ? (
                          <button
                            onClick={() => t.project_id && onProjectClick?.(t.project_id)}
                            className="text-slate-500 hover:text-indigo-700 hover:underline"
                          >
                            · {t.projects.numero ? `${t.projects.numero} · ` : ''}
                            {t.projects.nome}
                          </button>
                        ) : (
                          <span className="text-slate-400">· geral</span>
                        )}
                        <input
                          className="w-28 border border-slate-200 rounded px-1.5 py-0.5 text-[11px]"
                          placeholder="Responsável"
                          list="agenda-resp"
                          defaultValue={t.responsavel || ''}
                          onBlur={(e) => atualizarTarefa(t.id, { responsavel: e.target.value || null })}
                        />
                        <span className={atrasada ? 'text-red-600' : 'text-slate-400'}>
                          · {formatarData(t.data_prazo)}
                        </span>
                        {atrasada && <span className="text-red-600 font-semibold text-[10px]">⚠ Atrasada</span>}
                        <select
                          value={t.status}
                          onChange={(e) => mudarStatus(t, e.target.value)}
                          className={`ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded border cursor-pointer ${
                            TASK_STATUS_COLORS[t.status] || ''
                          }`}
                        >
                          {TASK_STATUS.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => excluirTarefa(t)}
                          className="text-slate-300 hover:text-red-500 px-1"
                          title="Excluir"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {aba === 'calendario' && <TaskCalendar tarefas={filtradas} />}

      {aba === 'gantt' && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          {ganttItems.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nenhuma tarefa para mostrar no Gantt.</p>
          ) : (
            <GanttChart items={ganttItems} labelWidth={190} />
          )}
        </div>
      )}

      {aba === 'recorrentes' && (
        <Recorrentes
          recorrencias={recorrencias}
          categorias={categorias}
          ehAdmin={ehAdmin}
          onMudou={async () => {
            await gerarOcorrencias(60)
            await recarregar()
          }}
        />
      )}

      <datalist id="agenda-resp">
        {responsaveis.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  )
}

/** Formulário compacto para lançar uma tarefa sem vínculo com projeto. */
function NovaTarefaGeral({
  categorias,
  responsaveis,
  onCriada,
}: {
  categorias: TaskCategory[]
  responsaveis: string[]
  onCriada: () => void
}) {
  const [nome, setNome] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [prazo, setPrazo] = useState(hojeStr())
  const [salvando, setSalvando] = useState(false)

  async function criar() {
    if (!nome.trim() || !prazo) return
    setSalvando(true)
    const { error } = await supabase.from('project_tasks').insert({
      project_id: null,
      nome: nome.trim(),
      responsavel: responsavel.trim() || null,
      categoria_id: categoriaId || null,
      data_inicio: prazo,
      data_prazo: prazo,
      status: 'Pendente',
      ordem: 0,
    })
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    setNome('')
    onCriada()
  }

  return (
    <div className="border border-dashed border-slate-300 rounded-xl p-3 bg-slate-50 flex flex-wrap items-center gap-2">
      <input
        className="flex-1 min-w-[180px] border border-slate-300 rounded-md px-2 py-1.5 text-xs"
        placeholder="Nova tarefa geral (ex.: enviar relatório para o Emanuel)"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && criar()}
      />
      <input
        className="w-32 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
        placeholder="Responsável"
        list="agenda-resp"
        value={responsavel}
        onChange={(e) => setResponsavel(e.target.value)}
      />
      <select
        value={categoriaId}
        onChange={(e) => setCategoriaId(e.target.value)}
        className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
      >
        <option value="">Sem categoria</option>
        {categorias.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={prazo}
        onChange={(e) => setPrazo(e.target.value)}
        className="text-xs border border-slate-300 rounded-md px-2 py-1.5"
      />
      <button
        onClick={criar}
        disabled={salvando || !nome.trim()}
        className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
      >
        {salvando ? 'Salvando...' : '+ Adicionar'}
      </button>
      <datalist id="agenda-resp">
        {responsaveis.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
    </div>
  )
}

/** Regras que geram tarefas sozinhas + gestão de categorias (só ADM). */
function Recorrentes({
  recorrencias,
  categorias,
  ehAdmin,
  onMudou,
}: {
  recorrencias: TaskRecurrence[]
  categorias: TaskCategory[]
  ehAdmin: boolean
  onMudou: () => void
}) {
  const [nome, setNome] = useState('')
  const [responsavel, setResponsavel] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [frequencia, setFrequencia] = useState<TaskRecurrence['frequencia']>('semanal')
  const [dias, setDias] = useState<number[]>([1])
  const [diaMes, setDiaMes] = useState(1)
  const [salvando, setSalvando] = useState(false)

  const [novaCategoria, setNovaCategoria] = useState('')
  const [corCategoria, setCorCategoria] = useState('#6366f1')

  async function criarRegra() {
    if (!nome.trim()) return
    setSalvando(true)
    const { error } = await supabase.from('task_recurrences').insert({
      nome: nome.trim(),
      responsavel: responsavel.trim() || null,
      categoria_id: categoriaId || null,
      frequencia,
      dias_semana: frequencia === 'semanal' || frequencia === 'quinzenal' ? dias : [],
      dia_mes: frequencia === 'mensal' ? diaMes : null,
      data_inicio: hojeStr(),
    })
    setSalvando(false)
    if (error) {
      alert(error.message)
      return
    }
    setNome('')
    onMudou()
  }

  async function alternarAtiva(r: TaskRecurrence) {
    await supabase.from('task_recurrences').update({ ativa: !r.ativa }).eq('id', r.id)
    onMudou()
  }

  async function excluirRegra(r: TaskRecurrence) {
    if (!confirm(`Excluir a regra "${r.nome}"? As ocorrências futuras já geradas também saem.`)) return
    await supabase.from('task_recurrences').delete().eq('id', r.id)
    onMudou()
  }

  async function criarCategoria() {
    if (!novaCategoria.trim()) return
    const { error } = await supabase.from('task_categories').insert({
      nome: novaCategoria.trim(),
      cor: corCategoria,
      ordem: categorias.length + 1,
    })
    if (error) {
      alert(error.message)
      return
    }
    setNovaCategoria('')
    onMudou()
  }

  async function excluirCategoria(c: TaskCategory) {
    if (!confirm(`Excluir a categoria "${c.nome}"? As tarefas dela ficam sem categoria.`)) return
    const { error } = await supabase.from('task_categories').delete().eq('id', c.id)
    if (error) {
      alert(error.message)
      return
    }
    onMudou()
  }

  return (
    <div className="space-y-4">
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Tarefas recorrentes</h3>
        <p className="text-xs text-slate-500 mb-3">
          Cada repetição vira uma tarefa de verdade na agenda, que precisa ser concluída. As próximas
          60 dias são geradas automaticamente ao abrir esta tela.
        </p>

        <div className="border border-dashed border-slate-300 rounded-lg p-3 bg-slate-50 space-y-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="flex-1 min-w-[180px] border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              placeholder="Ex.: fazer café, enviar relatório, dar feedback aos clientes"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
            <input
              className="w-32 border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              placeholder="Responsável"
              list="agenda-resp"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
            />
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="">Sem categoria</option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={frequencia}
              onChange={(e) => setFrequencia(e.target.value as TaskRecurrence['frequencia'])}
              className="text-xs border border-slate-300 rounded-md px-2 py-1.5 bg-white"
            >
              {FREQUENCIAS.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>

            {(frequencia === 'semanal' || frequencia === 'quinzenal') && (
              <div className="flex gap-1">
                {DIAS_SEMANA.map((d) => {
                  const ativo = dias.includes(d.valor)
                  return (
                    <button
                      key={d.valor}
                      title={d.rotulo}
                      onClick={() =>
                        setDias((prev) =>
                          prev.includes(d.valor) ? prev.filter((x) => x !== d.valor) : [...prev, d.valor]
                        )
                      }
                      className={`w-7 h-7 rounded-md text-[11px] font-medium border transition ${
                        ativo
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-500 border-slate-300 hover:border-slate-400'
                      }`}
                    >
                      {d.curto}
                    </button>
                  )
                })}
              </div>
            )}

            {frequencia === 'mensal' && (
              <label className="flex items-center gap-1 text-xs text-slate-600">
                Dia do mês
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={diaMes}
                  onChange={(e) => setDiaMes(Number(e.target.value))}
                  className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs"
                />
              </label>
            )}

            <button
              onClick={criarRegra}
              disabled={salvando || !nome.trim()}
              className="ml-auto px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              {salvando ? 'Criando...' : '+ Criar recorrência'}
            </button>
          </div>
        </div>

        {recorrencias.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">Nenhuma tarefa recorrente ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {recorrencias.map((r) => {
              const cat = categorias.find((c) => c.id === r.categoria_id)
              return (
                <div
                  key={r.id}
                  className={`flex flex-wrap items-center gap-2 border rounded-lg px-2.5 py-1.5 text-xs ${
                    r.ativa ? 'border-slate-200' : 'border-slate-200 bg-slate-50 opacity-60'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: cat?.cor || '#cbd5e1' }}
                  />
                  <span className="font-medium text-slate-800">{r.nome}</span>
                  {r.responsavel && <span className="text-slate-500">· {r.responsavel}</span>}
                  <span className="text-slate-400">· {descreverRecorrencia(r)}</span>
                  {cat && <span className="text-slate-400">· {cat.nome}</span>}
                  <button
                    onClick={() => alternarAtiva(r)}
                    className={`ml-auto text-[10px] font-medium px-2 py-0.5 rounded border ${
                      r.ativa
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-300'
                        : 'bg-slate-100 text-slate-500 border-slate-300'
                    }`}
                  >
                    {r.ativa ? 'Ativa' : 'Pausada'}
                  </button>
                  <button
                    onClick={() => excluirRegra(r)}
                    className="text-slate-300 hover:text-red-500 px-1"
                    title="Excluir regra"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-1">Categorias</h3>
        <p className="text-xs text-slate-500 mb-3">
          {ehAdmin
            ? 'Como administrador, você cria e remove categorias.'
            : 'Só o administrador cria ou remove categorias.'}
        </p>

        {ehAdmin && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <input
              className="flex-1 min-w-[160px] border border-slate-300 rounded-md px-2 py-1.5 text-xs"
              placeholder="Nome da nova categoria"
              value={novaCategoria}
              onChange={(e) => setNovaCategoria(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && criarCategoria()}
            />
            <input
              type="color"
              value={corCategoria}
              onChange={(e) => setCorCategoria(e.target.value)}
              className="w-10 h-8 border border-slate-300 rounded-md cursor-pointer"
              title="Cor da categoria"
            />
            <button
              onClick={criarCategoria}
              disabled={!novaCategoria.trim()}
              className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-md font-medium"
            >
              + Criar categoria
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {categorias.map((c) => (
            <span
              key={c.id}
              className="flex items-center gap-1.5 text-xs border border-slate-200 rounded-full pl-2 pr-1 py-1"
            >
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: c.cor }} />
              {c.nome}
              {ehAdmin && (
                <button
                  onClick={() => excluirCategoria(c)}
                  className="text-slate-300 hover:text-red-500 px-1"
                  title="Excluir categoria"
                >
                  ×
                </button>
              )}
            </span>
          ))}
          {categorias.length === 0 && <p className="text-xs text-slate-400">Nenhuma categoria cadastrada.</p>}
        </div>
      </div>
    </div>
  )
}
