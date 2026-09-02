import { useEffect, useMemo, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { usePermissoes } from '../lib/permissoes'
import { LOGO_BIM_FIRE_JPEG } from '../lib/logoBimFire'
import Login from './Login'
import CrmLeadModal from './CrmLeadModal'
import CadastrosView from './CadastrosView'
import type { Etapa, Funil, Lead } from '../lib/crm'
import {
  carregarEtapas,
  carregarFunis,
  carregarLeads,
  criarLead,
  dataBR,
  moverEtapa,
  reais,
} from '../lib/crm'
import { carimboDeHoje, exportarParaExcel } from '../lib/exportarExcel'

type Aba = 'funil' | 'lista' | 'cadastros'

/**
 * Comercial, em endereço próprio (/comercial).
 *
 * Separado da gestão de projetos porque são públicos diferentes: quem vende
 * não precisa atravessar o Kanban dos projetistas, e o projetista não deve
 * tropeçar em negociação perdida. O que liga os dois é o botão "Vendeu".
 */
export default function ComercialPage() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const { pode, carregando: carregandoPerm } = usePermissoes()
  const [aba, setAba] = useState<Aba>('funil')

  const [funis, setFunis] = useState<Funil[]>([])
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [leads, setLeads] = useState<Lead[]>([])
  const [funilSel, setFunilSel] = useState<string>('')
  const [busca, setBusca] = useState('')
  const [verEncerrados, setVerEncerrados] = useState(false)
  const [aberto, setAberto] = useState<Lead | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session && !carregandoPerm && pode('comercial.ver')) carregar()
    else if (session && !carregandoPerm) setCarregando(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, carregandoPerm])

  async function carregar() {
    setCarregando(true)
    const [f, e, l] = await Promise.all([carregarFunis(), carregarEtapas(), carregarLeads()])
    setFunis(f)
    setEtapas(e)
    setLeads(l)
    if (!funilSel && f[0]) setFunilSel(f[0].id)
    setCarregando(false)
  }

  const doFunil = useMemo(
    () => etapas.filter((e) => e.funnel_id === funilSel).sort((a, b) => a.ordem - b.ordem),
    [etapas, funilSel]
  )

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase()
    return leads.filter((l) => {
      if (l.funnel_id !== funilSel) return false
      if (!verEncerrados && l.estado !== 'aberta') return false
      if (!t) return true
      return [l.nome, l.nome_cliente, l.nome_parceiro, l.cidade, l.contato]
        .some((c) => (c || '').toLowerCase().includes(t))
    })
  }, [leads, funilSel, busca, verEncerrados])

  const porEtapa = useMemo(() => {
    const mapa = new Map<string, Lead[]>()
    for (const l of filtrados) {
      const k = l.stage_id || 'sem'
      if (!mapa.has(k)) mapa.set(k, [])
      mapa.get(k)!.push(l)
    }
    return mapa
  }, [filtrados])

  async function soltar(etapa: Etapa) {
    const lead = leads.find((l) => l.id === arrastando)
    setArrastando(null)
    if (!lead || lead.stage_id === etapa.id) return
    if (!pode('comercial.editar')) return
    try {
      await moverEtapa(lead, etapa, etapas.find((e) => e.id === lead.stage_id))
      carregar()
    } catch (e: any) {
      alert(e.message)
    }
  }

  async function novo() {
    const nome = prompt('Nome do negócio:')
    if (!nome?.trim()) return
    try {
      const l = await criarLead({
        nome: nome.trim(),
        funnel_id: funilSel,
        stage_id: doFunil[0]?.id,
        origem: 'app',
        responsavel: session?.user.email?.split('@')[0],
      })
      await carregar()
      setAberto(l)
    } catch (e: any) {
      alert(e.message)
    }
  }

  function exportar() {
    exportarParaExcel({
      nomeArquivo: `Comercial - ${carimboDeHoje()}.xlsx`,
      nomeAba: 'Leads',
      linhas: filtrados,
      colunas: [
        { titulo: 'Negócio', valor: (l) => l.nome, largura: 40 },
        { titulo: 'Etapa', valor: (l) => etapas.find((e) => e.id === l.stage_id)?.nome || '', largura: 24 },
        { titulo: 'Estado', valor: (l) => l.estado, largura: 10 },
        { titulo: 'Tipo', valor: (l) => l.tipo_cliente || '', largura: 14 },
        { titulo: 'Cliente', valor: (l) => l.nome_cliente || '', largura: 26 },
        { titulo: 'Parceiro', valor: (l) => l.nome_parceiro || '', largura: 26 },
        { titulo: 'Contato', valor: (l) => l.contato || '', largura: 18 },
        { titulo: 'E-mail', valor: (l) => l.email || '', largura: 26 },
        { titulo: 'Cidade', valor: (l) => l.cidade || '', largura: 20 },
        { titulo: 'Área m²', valor: (l) => l.area_m2 ?? '', largura: 10 },
        { titulo: 'Valor', valor: (l) => l.valor ?? '', largura: 12 },
        { titulo: 'Valor fechado', valor: (l) => l.valor_fechado ?? '', largura: 13 },
        { titulo: 'Responsável', valor: (l) => l.responsavel || '', largura: 16 },
        { titulo: 'Fonte', valor: (l) => l.fonte || '', largura: 22 },
        { titulo: 'Motivo da perda', valor: (l) => l.motivo_perda || '', largura: 28 },
        { titulo: 'Aberto em', valor: (l) => dataBR(l.criado_em), largura: 12 },
        { titulo: 'Fechado em', valor: (l) => dataBR(l.data_fechamento), largura: 12 },
        { titulo: 'Origem', valor: (l) => l.origem, largura: 10 },
        { titulo: 'Virou projeto', valor: (l) => (l.project_id ? 'Sim' : 'Não'), largura: 12 },
      ],
    })
  }

  if (session === undefined || carregandoPerm) {
    return <p className="text-sm text-slate-400 text-center py-20">Carregando...</p>
  }
  if (!session) return <Login />
  if (!pode('comercial.ver')) {
    return (
      <div className="min-h-screen bg-[#F7F6F5] flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm py-12 px-8 text-center">
          <p className="text-3xl mb-2">🔒</p>
          <p className="text-sm text-slate-600">Seu perfil não tem acesso ao comercial.</p>
          <a href="/" className="text-xs text-indigo-700 hover:underline mt-2 inline-block">
            Voltar para a gestão de projetos
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F7F6F5]">
      <header className="bg-carvao-900 text-white">
        <div className="max-w-[1600px] mx-auto px-4 py-3 flex items-center gap-3">
          <img src={LOGO_BIM_FIRE_JPEG} alt="BIM Fire" className="w-9 h-9 rounded-lg object-cover" />
          <div className="flex-1">
            <h1 className="text-sm font-semibold leading-tight">Comercial</h1>
            <p className="text-[11px] text-white/50 leading-tight">BIM Fire</p>
          </div>
          <a
            href="/"
            className="text-[11px] text-white/70 hover:text-white px-2.5 py-1.5 rounded-lg border border-white/20"
          >
            Gestão de Projetos
          </a>
          <button onClick={() => supabase.auth.signOut()} className="text-[11px] text-white/60 hover:text-white">
            Sair
          </button>
        </div>
      </header>

      <nav className="bg-white border-b border-slate-200">
        <div className="max-w-[1600px] mx-auto px-4 flex gap-1">
          {(
            [
              ['funil', 'Funil'],
              ['lista', 'Todos os negócios'],
              ['cadastros', 'Clientes e parceiros'],
            ] as [Aba, string][]
          ).map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => setAba(v)}
              className={`text-xs font-medium px-3 py-2.5 border-b-2 transition ${
                aba === v
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </nav>

      <main className="max-w-[1600px] mx-auto px-4 py-4">
        {carregando ? (
          <p className="text-sm text-slate-400 text-center py-20">Carregando negócios...</p>
        ) : aba === 'cadastros' ? (
          <CadastrosView />
        ) : (
          <>
            {/* ---------- filtros ---------- */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2 mb-4">
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {funis.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFunilSel(f.id)}
                    className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition ${
                      funilSel === f.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {f.nome}
                  </button>
                ))}
              </div>

              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar negócio, cliente, cidade..."
                className="text-xs border border-slate-300 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-sm"
              />

              <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                <input
                  type="checkbox"
                  checked={verEncerrados}
                  onChange={(e) => setVerEncerrados(e.target.checked)}
                />
                Incluir ganhos e perdidos
              </label>

              <span className="text-[11px] text-slate-500">{filtrados.length} negócio(s)</span>

              <button
                onClick={exportar}
                className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                ⬇ Excel
              </button>
              {pode('comercial.editar') && (
                <button
                  onClick={novo}
                  className="text-[11px] font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  + Novo negócio
                </button>
              )}
            </div>

            {aba === 'funil' ? (
              <div className="flex gap-3 overflow-x-auto pb-4">
                {doFunil.map((etapa) => {
                  const lista = porEtapa.get(etapa.id) || []
                  const total = lista.reduce((s, l) => s + (l.valor_fechado ?? l.valor ?? 0), 0)
                  return (
                    <div
                      key={etapa.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => soltar(etapa)}
                      className="w-[250px] shrink-0 bg-slate-100/70 rounded-xl p-2"
                    >
                      <div className="flex items-center gap-1.5 px-1 pb-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: etapa.cor || '#94a3b8' }}
                        />
                        <p className="text-[11px] font-semibold text-slate-700 truncate flex-1">
                          {etapa.nome}
                        </p>
                        <span className="text-[10px] text-slate-400">{lista.length}</span>
                      </div>
                      {total > 0 && (
                        <p className="px-1 pb-1.5 text-[10px] text-slate-500 tabular-nums">
                          {reais(total)}
                        </p>
                      )}

                      <div className="space-y-1.5">
                        {lista.map((l) => (
                          <div
                            key={l.id}
                            draggable={pode('comercial.editar')}
                            onDragStart={() => setArrastando(l.id)}
                            onClick={() => setAberto(l)}
                            className="bg-white border border-slate-200 rounded-lg p-2 cursor-pointer hover:border-indigo-400 hover:shadow-sm transition"
                          >
                            <p className="text-[11px] font-medium text-slate-800 leading-snug line-clamp-2">
                              {l.nome}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {l.nome_parceiro || l.nome_cliente || l.cidade || '—'}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                              {(l.valor_fechado ?? l.valor) ? (
                                <span className="text-[10px] font-medium text-slate-600 tabular-nums">
                                  {reais(l.valor_fechado ?? l.valor)}
                                </span>
                              ) : null}
                              {l.project_id && (
                                <span className="text-[9px] px-1 rounded bg-emerald-100 text-emerald-700">
                                  projeto
                                </span>
                              )}
                              {l.retorno_em && (
                                <span className="text-[9px] px-1 rounded bg-amber-100 text-amber-800 ml-auto">
                                  {dataBR(l.retorno_em)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                        {lista.length === 0 && (
                          <p className="text-[10px] text-slate-400 text-center py-4">vazio</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] uppercase text-slate-400 border-b border-slate-200">
                      <th className="text-left py-2 pl-4">Negócio</th>
                      <th className="text-left">Etapa</th>
                      <th className="text-left">Cliente / parceiro</th>
                      <th className="text-left">Cidade</th>
                      <th className="text-right">Valor</th>
                      <th className="text-left">Responsável</th>
                      <th className="text-left pr-4">Aberto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.slice(0, 400).map((l) => {
                      const e = etapas.find((x) => x.id === l.stage_id)
                      return (
                        <tr
                          key={l.id}
                          onClick={() => setAberto(l)}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50 cursor-pointer"
                        >
                          <td className="py-2 pl-4 max-w-[280px] truncate font-medium text-slate-800">
                            {l.nome}
                            {l.project_id && (
                              <span className="ml-1.5 text-[9px] px-1 rounded bg-emerald-100 text-emerald-700">
                                projeto
                              </span>
                            )}
                          </td>
                          <td>
                            <span
                              className="text-[10px] px-1.5 py-0.5 rounded"
                              style={{ background: (e?.cor || '#94a3b8') + '22', color: e?.cor || '#64748b' }}
                            >
                              {e?.nome || '—'}
                            </span>
                          </td>
                          <td className="text-slate-600 max-w-[200px] truncate">
                            {l.nome_parceiro || l.nome_cliente || '—'}
                          </td>
                          <td className="text-slate-500 max-w-[140px] truncate">{l.cidade || '—'}</td>
                          <td className="text-right tabular-nums text-slate-700">
                            {reais(l.valor_fechado ?? l.valor)}
                          </td>
                          <td className="text-slate-500">{l.responsavel || '—'}</td>
                          <td className="pr-4 text-slate-400 tabular-nums">{dataBR(l.criado_em)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {filtrados.length > 400 && (
                  <p className="px-4 py-2 text-[10px] text-slate-400">
                    Mostrando 400 de {filtrados.length}. Use a busca para afunilar, ou exporte para
                    Excel.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {aberto && (
        <CrmLeadModal
          lead={aberto}
          funis={funis}
          etapas={etapas}
          onFechar={() => setAberto(null)}
          onMudou={carregar}
          onAbrirProjeto={(id) => window.open(`/?projeto=${id}`, '_blank')}
        />
      )}
    </div>
  )
}
