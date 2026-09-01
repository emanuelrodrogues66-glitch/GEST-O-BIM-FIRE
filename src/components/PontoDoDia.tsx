import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { TarefaDaAgenda } from '../lib/agenda'
import { corDoResponsavel } from '../lib/agenda'
import { HUMORES } from './MoodView'
import { ROTULO_TIPO, hojeLocal } from '../lib/ponto'
import type { TipoBatida } from '../lib/ponto'

type Humor = (typeof HUMORES)[number]['valor']

/**
 * O que aparece logo depois da batida.
 *
 * Bater o ponto é o único momento do dia em que se tem certeza de que a pessoa
 * está olhando a tela. É onde a lista de tarefas do dia e o humor têm chance de
 * serem vistos — pedir isso em qualquer outra hora é pedir no vazio.
 */
export default function PontoDoDia({
  colaborador,
  tipo,
  hora,
  onFechar,
}: {
  colaborador: string
  tipo: TipoBatida
  hora: string
  onFechar: () => void
}) {
  const hoje = hojeLocal()
  const [tarefas, setTarefas] = useState<TarefaDaAgenda[]>([])
  const [humor, setHumor] = useState<Humor | null>(null)
  const [salvandoHumor, setSalvandoHumor] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    ;(async () => {
      const [{ data: t }, { data: h }] = await Promise.all([
        supabase
          .from('project_tasks')
          .select('*, projects(nome, numero), task_categories(nome, cor)')
          .neq('status', 'Concluído')
          .lte('data_prazo', hoje)
          .order('data_prazo'),
        supabase
          .from('mood_checkins')
          .select('humor')
          .eq('colaborador', colaborador)
          .eq('data', hoje)
          .maybeSingle(),
      ])

      // O filtro por responsável fica aqui e não na consulta: `responsaveis` é
      // um array e a coluna antiga `responsavel` ainda vale para as tarefas
      // criadas antes de existir mais de um responsável.
      const minhas = ((t as TarefaDaAgenda[]) || []).filter((x) => {
        const lista = x.responsaveis?.length ? x.responsaveis : [x.responsavel]
        return lista.some((n) => (n || '').trim().toLowerCase() === colaborador.toLowerCase())
      })

      setTarefas(minhas)
      setHumor(((h as { humor: Humor } | null)?.humor as Humor) || null)
      setCarregando(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colaborador])

  async function registrarHumor(valor: Humor) {
    const h = HUMORES.find((x) => x.valor === valor)!
    setSalvandoHumor(true)
    const { error } = await supabase.from('mood_checkins').upsert(
      { colaborador, data: hoje, humor: valor, nota: h.nota, updated_at: new Date().toISOString() },
      { onConflict: 'colaborador,data' }
    )
    setSalvandoHumor(false)
    if (error) return alert(error.message)
    setHumor(valor)
  }

  async function concluir(id: string) {
    const { error } = await supabase
      .from('project_tasks')
      .update({ status: 'Concluído', data_conclusao: hoje })
      .eq('id', id)
    if (error) return alert(error.message)
    setTarefas((lista) => lista.filter((t) => t.id !== id))
  }

  const { atrasadas, doDia } = useMemo(
    () => ({
      atrasadas: tarefas.filter((t) => t.data_prazo < hoje),
      doDia: tarefas.filter((t) => t.data_prazo === hoje),
    }),
    [tarefas, hoje]
  )

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden">
        {/* ---------- confirmação da batida ---------- */}
        <div className="bg-emerald-600 text-white px-5 py-4">
          <p className="text-sm font-semibold">
            ✓ {ROTULO_TIPO[tipo]} registrada às {hora}
          </p>
          <p className="text-[11px] text-white/80">
            {colaborador}, aqui está o seu dia.
          </p>
        </div>

        <div className="overflow-auto flex-1 p-5 space-y-5">
          {/* ---------- humor ---------- */}
          {!humor && (
            <div className="border border-slate-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-slate-700">Como você está hoje?</p>
              <p className="text-[10px] text-slate-400 mb-2">
                Você ainda não marcou. Leva um segundo.
              </p>
              <div className="flex gap-1.5">
                {HUMORES.map((h) => (
                  <button
                    key={h.valor}
                    onClick={() => registrarHumor(h.valor)}
                    disabled={salvandoHumor}
                    title={h.rotulo}
                    className="flex-1 py-2 text-2xl rounded-lg border border-slate-200 hover:border-slate-400 hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    {h.emoji}
                  </button>
                ))}
              </div>
            </div>
          )}

          {humor && (
            <p className="text-[11px] text-slate-500 text-center">
              Humor de hoje: {HUMORES.find((h) => h.valor === humor)?.emoji}{' '}
              {HUMORES.find((h) => h.valor === humor)?.rotulo}
            </p>
          )}

          {/* ---------- tarefas ---------- */}
          {carregando ? (
            <p className="text-xs text-slate-400 text-center py-6">Buscando suas tarefas...</p>
          ) : tarefas.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-2xl mb-1">✓</p>
              <p className="text-xs text-slate-500">Nada vencendo hoje. Bom trabalho.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {atrasadas.length > 0 && (
                <Bloco
                  titulo={`Atrasadas (${atrasadas.length})`}
                  cor="red"
                  tarefas={atrasadas}
                  hoje={hoje}
                  onConcluir={concluir}
                />
              )}
              {doDia.length > 0 && (
                <Bloco
                  titulo={`Para hoje (${doDia.length})`}
                  cor="indigo"
                  tarefas={doDia}
                  hoje={hoje}
                  onConcluir={concluir}
                />
              )}
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3">
          <button
            onClick={onFechar}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium"
          >
            Bom trabalho
          </button>
        </div>
      </div>
    </div>
  )
}

function Bloco({
  titulo,
  cor,
  tarefas,
  hoje,
  onConcluir,
}: {
  titulo: string
  cor: 'red' | 'indigo'
  tarefas: TarefaDaAgenda[]
  hoje: string
  onConcluir: (id: string) => void
}) {
  return (
    <div>
      <h3
        className={`text-[11px] font-semibold uppercase mb-1.5 ${
          cor === 'red' ? 'text-red-700' : 'text-indigo-700'
        }`}
      >
        {titulo}
      </h3>
      <div className="space-y-1.5">
        {tarefas.map((t) => {
          const dias = Math.round(
            (new Date(`${hoje}T12:00:00`).getTime() - new Date(`${t.data_prazo}T12:00:00`).getTime()) /
              86400000
          )
          return (
            <div
              key={t.id}
              className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${
                cor === 'red' ? 'border-red-200 bg-red-50/50' : 'border-slate-200 bg-white'
              }`}
            >
              <input
                type="checkbox"
                onChange={() => onConcluir(t.id)}
                className="mt-0.5 shrink-0"
                title="Marcar como concluída"
              />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-800 leading-snug">{t.nome}</p>
                <p className="text-[10px] text-slate-500 truncate">
                  {t.projects
                    ? `${t.projects.numero ? `${t.projects.numero} · ` : ''}${t.projects.nome}`
                    : t.task_categories?.nome || 'Tarefa geral'}
                  {t.hora_inicio && ` · ${t.hora_inicio.slice(0, 5)}`}
                  {dias > 0 && ` · ${dias} dia${dias === 1 ? '' : 's'} de atraso`}
                </p>
              </div>
              {t.responsaveis && t.responsaveis.length > 1 && (
                <span
                  className="text-[9px] font-medium shrink-0"
                  style={{ color: corDoResponsavel(t.responsaveis[0]) }}
                  title={`Com ${t.responsaveis.join(', ')}`}
                >
                  +{t.responsaveis.length - 1}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
