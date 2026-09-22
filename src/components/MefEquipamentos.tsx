import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { usePermissoes } from '../lib/permissoes'
import type { TipoEquipamento, Vencimento } from '../lib/mef'
import {
  DIAS_DE_ANTECEDENCIA,
  gerarOrcamentoRecarga,
  carregarTiposEquipamento,
  carregarVencimentos,
  dataBR,
  diasAte,
  hoje,
  registrarServico,
} from '../lib/mef'

type Faixa = 'vencidos' | 'aVencer' | 'todos' | 'semData'

const FAIXAS: [Faixa, string][] = [
  ['vencidos', 'Vencidos'],
  ['aVencer', 'A vencer'],
  ['semData', 'Sem data'],
  ['todos', 'Todos'],
]

/**
 * Carteira de equipamentos da MEF.
 *
 * Cada extintor instalado é uma linha, com os dois relógios: a recarga e o
 * teste hidrostático. Agrupa por cliente e endereço porque é assim que a venda
 * acontece — catorze extintores do mesmo prédio viram uma ligação, não catorze.
 */
export default function MefEquipamentos({
  aoAbrirOrcamento,
}: {
  aoAbrirOrcamento?: (id: string) => void
}) {
  const { pode } = usePermissoes()
  const podeEditar = pode('mef.equipamentos.editar')
  const podeOrcar = pode('mef.orcamento.criar')

  const [linhas, setLinhas] = useState<Vencimento[]>([])
  const [tipos, setTipos] = useState<TipoEquipamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [faixa, setFaixa] = useState<Faixa>('aVencer')
  const [dias, setDias] = useState(DIAS_DE_ANTECEDENCIA)
  const [novo, setNovo] = useState(false)
  const [gerando, setGerando] = useState('')

  useEffect(() => {
    carregar()
  }, [])

  async function carregar(silencioso = false) {
    if (!silencioso) setCarregando(true)
    setErro('')
    try {
      const [v, t] = await Promise.all([carregarVencimentos(), carregarTiposEquipamento()])
      setLinhas(v)
      setTipos(t)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setCarregando(false)
    }
  }

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return linhas.filter((l) => {
      if (l.situacao !== 'ativo') return false
      const d = diasAte(l.proximo_vencimento)
      if (faixa === 'vencidos' && (d === null || d >= 0)) return false
      if (faixa === 'aVencer' && (d === null || d < 0 || d > dias)) return false
      if (faixa === 'semData' && l.proximo_vencimento !== null) return false
      if (!q) return true
      const alvo = [l.nome_cliente, l.endereco, l.local, l.numero_selo, l.tipo, l.capacidade]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return alvo.includes(q)
    })
  }, [linhas, busca, faixa, dias])

  // Agrupa por cliente e endereço: é a unidade da conversa com o cliente.
  const grupos = useMemo(() => {
    const m = new Map<string, Vencimento[]>()
    for (const l of filtradas) {
      const k = l.nome_cliente + ' ||| ' + (l.endereco || '')
      const lista = m.get(k)
      if (lista) lista.push(l)
      else m.set(k, [l])
    }
    return Array.from(m.entries()).sort((a, b) => {
      const da = diasAte(a[1][0].proximo_vencimento)
      const db = diasAte(b[1][0].proximo_vencimento)
      if (da === null) return 1
      if (db === null) return -1
      return da - db
    })
  }, [filtradas])

  const contagem = useMemo(() => {
    let vencidos = 0
    let aVencer = 0
    let semData = 0
    for (const l of linhas) {
      if (l.situacao !== 'ativo') continue
      const d = diasAte(l.proximo_vencimento)
      if (d === null) semData++
      else if (d < 0) vencidos++
      else if (d <= dias) aVencer++
    }
    return { vencidos, aVencer, semData, total: linhas.filter((l) => l.situacao === 'ativo').length }
  }, [linhas, dias])


  /**
   * Vira negociação e orçamento numerado, de uma vez.
   *
   * Leva os equipamentos daquele cliente e endereço que estão na faixa — é
   * assim que a venda acontece: uma ligação para o prédio inteiro, não uma
   * por extintor.
   */
  async function gerarRecarga(chave: string, equipamentos: Vencimento[]) {
    const partes = chave.split(' ||| ')
    if (
      !confirm(
        'Gerar orçamento de recarga para ' + partes[0] + ' com ' + equipamentos.length + ' equipamento(s)?'
      )
    ) {
      return
    }
    setGerando(chave)
    try {
      const r = await gerarOrcamentoRecarga(equipamentos.map((x) => x.equipamento_id))
      alert(
        'Orçamento ' + r.numero + ' criado com ' + r.itens + ' item(ns), e a negociação entrou no funil MEF — Recarga.'
      )
      if (aoAbrirOrcamento) aoAbrirOrcamento(r.orcamento_id)
    } catch (err) {
      alert((err as Error).message)
    } finally {
      setGerando('')
    }
  }
  async function registrar(l: Vencimento, evento: 'manutencao' | 'teste') {
    const rotulo = evento === 'manutencao' ? l.rotulo_manutencao : l.rotulo_teste
    const data = prompt(rotulo + ' feita em que dia? (aaaa-mm-dd)', hoje())
    if (!data) return
    try {
      await registrarServico(l.equipamento_id, evento, data)
      carregar(true)
    } catch (e) {
      alert((e as Error).message)
    }
  }

  if (carregando) {
    return <p className="text-sm text-slate-400 text-center py-16">Montando a carteira...</p>
  }

  return (
    <div className="space-y-3">
      {erro && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          {erro}
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Caixa titulo="Vencidos" valor={contagem.vencidos} destaque={contagem.vencidos > 0 ? 'ruim' : undefined} />
        <Caixa titulo={'A vencer em ' + dias + ' dias'} valor={contagem.aVencer} destaque="atencao" />
        <Caixa titulo="Sem data registrada" valor={contagem.semData} />
        <Caixa titulo="Equipamentos ativos" valor={contagem.total} />
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 overflow-hidden">
          {FAIXAS.map((par) => (
            <button
              key={par[0]}
              onClick={() => setFaixa(par[0])}
              className={
                'text-xs font-medium px-3 py-1.5 ' +
                (faixa === par[0] ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-50')
              }
            >
              {par[1]}
            </button>
          ))}
        </div>
        {faixa === 'aVencer' && (
          <label className="flex items-center gap-1 text-xs text-slate-500">
            até
            <input
              type="number"
              value={dias}
              onChange={(e) => setDias(Number(e.target.value) || 0)}
              className="w-16 border border-slate-300 rounded-md px-2 py-1 text-xs text-right"
            />
            dias
          </label>
        )}
        <input
          placeholder="Buscar cliente, local ou selo..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 flex-1 min-w-[180px] max-w-xs"
        />
        <span className="text-xs text-slate-400">{filtradas.length} equipamento(s)</span>
        {podeEditar && (
          <button
            onClick={() => setNovo(true)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
          >
            + equipamentos
          </button>
        )}
      </div>

      {novo && podeEditar && (
        <NovoEquipamento
          tipos={tipos}
          aoFechar={() => setNovo(false)}
          aoSalvar={() => {
            setNovo(false)
            carregar()
          }}
        />
      )}

      {grupos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16 bg-white border border-slate-200 rounded-xl shadow-sm">
          {linhas.length === 0
            ? 'Nenhum equipamento cadastrado ainda. Comece pelo botão + equipamentos.'
            : 'Nada nesta faixa.'}
        </p>
      ) : (
        <div className="space-y-2">
          {grupos.map((g) => {
            const partes = g[0].split(' ||| ')
            const proximo = diasAte(g[1][0].proximo_vencimento)
            return (
              <div key={g[0]} className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2">
                  <div className="flex-1 min-w-[160px]">
                    <p className="text-sm font-semibold text-slate-800">{partes[0]}</p>
                    {partes[1] && <p className="text-[11px] text-slate-400">{partes[1]}</p>}
                  </div>
                  <span className="text-[11px] text-slate-400">{g[1].length} equipamento(s)</span>
                  {proximo !== null && <Prazo dias={proximo} />}
                  {podeOrcar && (
                    <button
                      onClick={() => gerarRecarga(g[0], g[1])}
                      disabled={gerando === g[0]}
                      className="text-[10px] font-medium px-2.5 py-1 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200"
                      title="Cria a negociação no funil de recarga e o orçamento numerado"
                    >
                      {gerando === g[0] ? 'gerando...' : 'gerar orçamento'}
                    </button>
                  )}
                </div>

                <div className="divide-y divide-slate-50">
                  {g[1].map((l) => (
                    <div key={l.equipamento_id} className="px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-xs font-medium text-slate-700 w-32">
                        {l.tipo}
                        {l.capacidade && <span className="text-slate-400"> {l.capacidade}</span>}
                      </span>
                      <span className="text-[11px] text-slate-500 flex-1 min-w-[120px]">
                        {l.local || '—'}
                        {l.numero_selo && (
                          <span className="text-slate-400"> · selo {l.numero_selo}</span>
                        )}
                      </span>

                      <Relogio
                        rotulo={l.rotulo_manutencao}
                        feito={l.ultima_manutencao}
                        vence={l.proxima_manutencao}
                        onRegistrar={podeEditar ? () => registrar(l, 'manutencao') : undefined}
                      />
                      <Relogio
                        rotulo={l.rotulo_teste}
                        feito={l.ultimo_teste}
                        vence={l.proximo_teste}
                        onRegistrar={podeEditar ? () => registrar(l, 'teste') : undefined}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-400">
        O vencimento é calculado na hora, pelo prazo de cada tipo de equipamento. Mudar o prazo
        corrige a carteira inteira. Equipamento sem data de última recarga aparece em "Sem data" —
        é preciso registrar a primeira para o relógio começar a contar.
      </p>
    </div>
  )
}

function Relogio({
  rotulo,
  feito,
  vence,
  onRegistrar,
}: {
  rotulo: string
  feito: string | null
  vence: string | null
  onRegistrar?: () => void
}) {
  const dias = diasAte(vence)
  return (
    <div className="w-44">
      <p className="text-[9px] uppercase text-slate-400 leading-none">{rotulo}</p>
      <div className="flex items-center gap-1.5">
        {vence ? (
          <>
            <span className="text-[11px] text-slate-600">{dataBR(vence)}</span>
            {dias !== null && <Prazo dias={dias} />}
          </>
        ) : (
          <span className="text-[11px] text-slate-300">{feito ? '—' : 'sem registro'}</span>
        )}
        {onRegistrar && (
          <button
            onClick={onRegistrar}
            className="text-[10px] text-indigo-600 hover:underline ml-auto"
            title="Registra o serviço e empurra o próximo vencimento"
          >
            feito
          </button>
        )}
      </div>
    </div>
  )
}

function Prazo({ dias }: { dias: number }) {
  const texto =
    dias < 0 ? 'vencido há ' + Math.abs(dias) + 'd' : dias === 0 ? 'vence hoje' : 'em ' + dias + 'd'
  const cor =
    dias < 0
      ? 'bg-red-100 text-red-700'
      : dias <= 30
        ? 'bg-amber-100 text-amber-800'
        : 'bg-slate-100 text-slate-500'
  return <span className={'text-[9px] px-1.5 py-0.5 rounded-full font-medium ' + cor}>{texto}</span>
}

function Caixa({
  titulo,
  valor,
  destaque,
}: {
  titulo: string
  valor: number
  destaque?: 'ruim' | 'atencao'
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-3 py-2.5">
      <p className="text-[10px] uppercase text-slate-400">{titulo}</p>
      <p
        className={
          'text-base font-semibold tabular-nums ' +
          (destaque === 'ruim'
            ? 'text-red-600'
            : destaque === 'atencao'
              ? 'text-amber-700'
              : 'text-slate-800')
        }
      >
        {valor}
      </p>
    </div>
  )
}

/**
 * Cadastro em lote.
 *
 * Na visita ninguém cadastra um extintor por vez: são catorze do mesmo prédio,
 * quase todos iguais. Aqui informa uma vez e diz quantos — o local de cada um
 * recebe um número, e quem quiser detalha depois.
 */
function NovoEquipamento({
  tipos,
  aoFechar,
  aoSalvar,
}: {
  tipos: TipoEquipamento[]
  aoFechar: () => void
  aoSalvar: () => void
}) {
  const [form, setForm] = useState({
    tipo_id: tipos.length > 0 ? tipos[0].id : '',
    nome_cliente: '',
    endereco: '',
    local: '',
    capacidade: '',
    fabricante: '',
    ultima_manutencao: '',
    ultimo_teste: '',
    quantidade: '1',
  })
  const [salvando, setSalvando] = useState(false)

  const tipo = tipos.find((t) => t.id === form.tipo_id)
  const qtd = Math.max(1, Math.min(60, Number(form.quantidade) || 1))

  async function salvar() {
    if (!form.nome_cliente.trim() || !form.tipo_id) return
    setSalvando(true)
    const linhas = []
    for (let i = 1; i <= qtd; i++) {
      linhas.push({
        tipo_id: form.tipo_id,
        nome_cliente: form.nome_cliente.trim(),
        endereco: form.endereco.trim() || null,
        local: form.local.trim() ? form.local.trim() + (qtd > 1 ? ' ' + i : '') : null,
        capacidade: form.capacidade.trim() || null,
        fabricante: form.fabricante.trim() || null,
        ultima_manutencao: form.ultima_manutencao || null,
        ultimo_teste: form.ultimo_teste || null,
      })
    }
    const { data, error } = await supabase.from('mef_equipamentos').insert(linhas).select('id')
    if (error) {
      setSalvando(false)
      alert(error.message)
      return
    }
    // A instalação fica no histórico desde o primeiro dia.
    const ids = (data as { id: string }[]) || []
    if (ids.length > 0) {
      await supabase.from('mef_equipamento_eventos').insert(
        ids.map((x) => ({
          equipamento_id: x.id,
          evento: form.ultima_manutencao ? 'vistoria' : 'instalacao',
          data: form.ultima_manutencao || hoje(),
          observacao: 'Cadastro inicial',
        }))
      )
    }
    setSalvando(false)
    aoSalvar()
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-xl shadow-sm p-3 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <Campo titulo="Cliente" largura="flex-1 min-w-[180px]">
          <input
            value={form.nome_cliente}
            onChange={(e) => setForm({ ...form, nome_cliente: e.target.value })}
            placeholder="Nome da empresa"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />
        </Campo>
        <Campo titulo="Endereço" largura="flex-1 min-w-[180px]">
          <input
            value={form.endereco}
            onChange={(e) => setForm({ ...form, endereco: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />
        </Campo>
        <Campo titulo="Tipo" largura="w-44">
          <select
            value={form.tipo_id}
            onChange={(e) => setForm({ ...form, tipo_id: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          >
            {tipos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo titulo="Capacidade" largura="w-24">
          <input
            value={form.capacidade}
            onChange={(e) => setForm({ ...form, capacidade: e.target.value })}
            placeholder="4 kg"
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />
        </Campo>
        <Campo titulo="Quantos" largura="w-20">
          <input
            type="number"
            min="1"
            max="60"
            value={form.quantidade}
            onChange={(e) => setForm({ ...form, quantidade: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs text-right"
          />
        </Campo>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Campo titulo="Local" largura="flex-1 min-w-[160px]">
          <input
            value={form.local}
            onChange={(e) => setForm({ ...form, local: e.target.value })}
            placeholder={qtd > 1 ? 'Corredor (vira Corredor 1, Corredor 2...)' : 'Corredor 2, perto da saída'}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />
        </Campo>
        <Campo titulo="Fabricante" largura="w-32">
          <input
            value={form.fabricante}
            onChange={(e) => setForm({ ...form, fabricante: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />
        </Campo>
        <Campo titulo={tipo ? 'Última ' + tipo.rotulo_manutencao.toLowerCase() : 'Última manutenção'} largura="w-40">
          <input
            type="date"
            value={form.ultima_manutencao}
            onChange={(e) => setForm({ ...form, ultima_manutencao: e.target.value })}
            className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
          />
        </Campo>
        {tipo && tipo.meses_teste !== null && (
          <Campo titulo={'Último ' + tipo.rotulo_teste.toLowerCase()} largura="w-40">
            <input
              type="date"
              value={form.ultimo_teste}
              onChange={(e) => setForm({ ...form, ultimo_teste: e.target.value })}
              className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
            />
          </Campo>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={salvar}
          disabled={salvando || !form.nome_cliente.trim()}
          className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200"
        >
          {qtd > 1 ? 'Cadastrar ' + qtd + ' equipamentos' : 'Cadastrar equipamento'}
        </button>
        <button onClick={aoFechar} className="text-xs text-slate-500 hover:text-slate-700">
          Cancelar
        </button>
        {tipo && (
          <span className="text-[10px] text-slate-400">
            {tipo.rotulo_manutencao} a cada {tipo.meses_manutencao} meses
            {tipo.meses_teste !== null && ' · ' + tipo.rotulo_teste + ' a cada ' + tipo.meses_teste + ' meses'}
          </span>
        )}
      </div>
    </div>
  )
}

function Campo({
  titulo,
  largura,
  children,
}: {
  titulo: string
  largura: string
  children: ReactNode
}) {
  return (
    <div className={largura}>
      <label className="block text-[10px] font-medium text-slate-500 mb-1">{titulo}</label>
      {children}
    </div>
  )
}
