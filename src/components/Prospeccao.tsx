import { useEffect, useMemo, useState } from 'react'
import type { Campanha, Contato, ContatoBruto, Resumo, Vinculos } from '../lib/prospeccao'
import ProspeccaoPainel from './ProspeccaoPainel'
import { reais } from '../lib/crm'
import {
  CORES,
  SITUACOES,
  baixarModeloPlanilha,
  carregarCampanhas,
  carregarContatos,
  carregarResumo,
  carregarVinculos,
  criarCampanha,
  descartar,
  importarContatos,
  importarPorEstado,
  lerPlanilha,
  linhasDoTexto,
  linkWhatsapp,
  marcarAbordado,
  mensagem,
  mudarSituacao,
  naoQuerReceber,
  nomeDoUsuario,
  podeAbordar,
  SEM_VINCULO,
  apagarCampanha,
  mudarCampanha,
  registrarNoCrm,
  reiniciarCampanha,
  telefoneBonito,
} from '../lib/prospeccao'

/**
 * Prospecção ativa.
 *
 * O que essa tela resolve não é o envio — é o rastro. Antes, abrir o WhatsApp
 * e falar com dez empresas não deixava nada para trás: no dia seguinte
 * ninguém sabia quem já tinha sido procurado nem o que respondeu. Aqui cada
 * conversa aberta vira negociação no funil de cliente final na hora, o número
 * que pediu para parar nunca mais aparece, e o mesmo contato não é procurado
 * duas vezes em 30 dias.
 *
 * Quem aperta enviar continua sendo a pessoa: o botão abre o WhatsApp com o
 * texto já montado.
 */
export default function Prospeccao({
  podeEditar,
  aoAbrirNegociacao,
}: {
  podeEditar: boolean
  aoAbrirNegociacao?: (leadId: string) => void
}) {
  const [aba, setAba] = useState<'lista' | 'painel'>('lista')
  const [vendo, setVendo] = useState<Contato | null>(null)
  const [vinculos, setVinculos] = useState<Vinculos>(SEM_VINCULO)
  const [buscandoVinculos, setBuscandoVinculos] = useState(false)
  const [campanhas, setCampanhas] = useState<Campanha[]>([])
  const [atual, setAtual] = useState('')
  const [contatos, setContatos] = useState<Contato[]>([])
  const [carregando, setCarregando] = useState(true)
  const [usuario, setUsuario] = useState('')
  const [filtro, setFiltro] = useState('fila')
  const [aviso, setAviso] = useState('')
  const [nova, setNova] = useState(false)
  const [nomeNovo, setNomeNovo] = useState('')
  const [modeloNovo, setModeloNovo] = useState(
    'Oi {{nome}}, tudo bem? Aqui é da BIM Fire, de Londrina. A gente faz projeto de prevenção de incêndio e regularização no Corpo de Bombeiros. Vocês já têm o PPCI da {{empresa}} em dia?'
  )
  const [colando, setColando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [nomeEdit, setNomeEdit] = useState('')
  const [modeloEdit, setModeloEdit] = useState('')
  const [statusEdit, setStatusEdit] = useState('aberta')
  const [confirmaNome, setConfirmaNome] = useState('')
  const [colado, setColado] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [sufixo, setSufixo] = useState('')
  const [andamento, setAndamento] = useState('')
  const [r, setR] = useState<Resumo>({
    total: 0, fila: 0, enviados: 0, falharam: 0,
    responderam: 0, no_funil: 0, bloqueados: 0, ja_na_base: 0,
  })

  const campanha = useMemo(() => campanhas.find((c) => c.id === atual) || null, [campanhas, atual])

  useEffect(() => {
    nomeDoUsuario().then(setUsuario)
  }, [])

  async function carregar() {
    try {
      const cs = await carregarCampanhas()
      setCampanhas(cs)
      const id = atual && cs.some((c) => c.id === atual) ? atual : cs[0] ? cs[0].id : ''
      setAtual(id)
    } catch (e) {
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }

  async function recarregarContatos(id: string) {
    if (!id) {
      setContatos([])
      return
    }
    try {
      const [lista, resumo] = await Promise.all([
        carregarContatos(id, filtro),
        carregarResumo(id),
      ])
      setContatos(lista)
      setR(resumo)
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  useEffect(() => {
    recarregarContatos(atual)
  }, [atual, filtro])

  async function abrirConversa(c: Contato) {
    if (!campanha) return
    setAviso('')
    if (c.situacao === 'fila') {
      const check = await podeAbordar(c.telefone)
      if (!check.pode) {
        setAviso(telefoneBonito(c.telefone) + ' — ' + check.motivo + '.')
        return
      }
    }
    // A janela abre antes do await para o navegador não tratar como pop-up.
    window.open(linkWhatsapp(c, campanha.modelo), '_blank')
    try {
      await marcarAbordado(c, usuario)
      await recarregarContatos(atual)
    } catch (e) {
      console.error(e)
      setAviso('A conversa abriu, mas o sistema nao conseguiu marcar o contato.')
    }
  }

  /** So aqui nasce negociacao. O envio conta o que fez; quem promove e voce. */
  async function virarLead(c: Contato) {
    setAviso('')
    try {
      const res = await registrarNoCrm(c.id, usuario)
      await recarregarContatos(atual)
      setAviso(
        res && res.criou_lead
          ? (c.empresa || c.nome || telefoneBonito(c.telefone)) + ' entrou no funil de cliente final.'
          : 'Esse contato ja tinha negociacao no funil.'
      )
    } catch (e) {
      console.error(e)
      setAviso('Nao deu para criar a negociacao.')
    }
  }

  async function descartarContato(c: Contato) {
    try {
      await descartar(c.id)
      await recarregarContatos(atual)
    } catch (e) {
      console.error(e)
    }
  }

  /** Lista grande: cada estado vira a sua campanha, pelo DDD do número. */
  async function espalharPorEstado(linhas: ContatoBruto[]) {
    setSalvando(true)
    setAviso('')
    try {
      const res = await importarPorEstado(linhas, sufixo, (a) => {
        setAndamento(a.campanha + ' — ' + a.feitos + ' de ' + a.total)
      })
      setAndamento('')
      setColando(false)
      const partes = [res.inseridos + ' contatos novos em ' + res.porCampanha.length + ' campanhas']
      if (res.jaEstavam) partes.push(res.jaEstavam + ' já estavam em alguma campanha')
      if (res.semTelefone) partes.push(res.semTelefone + ' sem telefone válido')
      setAviso(partes.join(' · '))
      await carregar()
      await recarregarContatos(atual)
    } catch (e) {
      console.error(e)
      setAndamento('')
      setAviso('A importação parou no meio: ' + (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  function abrirEdicao() {
    if (!campanha) return
    setNomeEdit(campanha.nome)
    setModeloEdit(campanha.modelo || '')
    setStatusEdit(campanha.status || 'aberta')
    setConfirmaNome('')
    setEditando(!editando)
  }

  async function salvarCampanha() {
    if (!campanha || !nomeEdit.trim()) return
    setSalvando(true)
    try {
      await mudarCampanha(campanha.id, {
        nome: nomeEdit.trim(),
        modelo: modeloEdit,
        status: statusEdit,
      })
      setEditando(false)
      setAviso('Campanha salva.')
      await carregar()
    } catch (e) {
      console.error(e)
      setAviso('Não deu para salvar: ' + (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function reiniciar() {
    if (!campanha) return
    if (!confirm('Devolver todos os contatos de "' + campanha.nome + '" para a fila?')) return
    setSalvando(true)
    try {
      const quantos = await reiniciarCampanha(campanha.id)
      setAviso(
        quantos + ' contatos voltaram para a fila. Quem foi procurado nos últimos 30 dias' +
        ' só sai de novo depois desse prazo.'
      )
      await recarregarContatos(atual)
    } catch (e) {
      console.error(e)
      setAviso('Não deu para reiniciar: ' + (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  async function apagar() {
    if (!campanha) return
    setSalvando(true)
    try {
      const quantos = await apagarCampanha(campanha.id, confirmaNome)
      setEditando(false)
      setConfirmaNome('')
      setAtual('')
      setAviso('Campanha apagada, com ' + quantos + ' contatos.')
      await carregar()
    } catch (e) {
      console.error(e)
      setAviso('Não deu para apagar: ' + (e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  /** O que a casa já tem sobre esse número. */
  async function verVinculos(contato: Contato) {
    setVendo(contato)
    setVinculos(SEM_VINCULO)
    setBuscandoVinculos(true)
    try {
      setVinculos(await carregarVinculos(contato.telefone))
    } catch (e) {
      console.error(e)
    } finally {
      setBuscandoVinculos(false)
    }
  }

  async function marcar(c: Contato, situacao: string) {
    try {
      await mudarSituacao(c.id, situacao)
      await recarregarContatos(atual)
    } catch (e) {
      console.error(e)
    }
  }

  async function bloquear(c: Contato) {
    const motivo = window.prompt('Pediu para não receber mais. Quer anotar o motivo?', '')
    if (motivo === null) return
    try {
      await naoQuerReceber(c, motivo)
      await recarregarContatos(atual)
    } catch (e) {
      console.error(e)
    }
  }

  async function salvarCampanha() {
    if (!nomeNovo.trim()) return
    setSalvando(true)
    try {
      const c = await criarCampanha(nomeNovo.trim(), modeloNovo, usuario)
      setNova(false)
      setNomeNovo('')
      setCampanhas([c].concat(campanhas))
      setAtual(c.id)
    } catch (e) {
      console.error(e)
      setAviso('Não deu para criar a campanha.')
    } finally {
      setSalvando(false)
    }
  }

  async function aplicar(linhas: ContatoBruto[]) {
    if (!atual || !linhas.length) return
    setSalvando(true)
    try {
      const res = await importarContatos(atual, linhas)
      const partes = [res.inseridos + ' na fila']
      if (res.repetidos) partes.push(res.repetidos + ' já estavam')
      if (res.bloqueados) partes.push(res.bloqueados + ' pediram para não receber')
      if (res.semTelefone) partes.push(res.semTelefone + ' sem telefone válido')
      setAviso(partes.join(' · '))
      setColado('')
      setColando(false)
      await recarregarContatos(atual)
    } catch (e) {
      console.error(e)
      setAviso('Não deu para importar.')
    } finally {
      setSalvando(false)
    }
  }

  /** A planilha é lida aqui no navegador; o arquivo não sobe para lugar nenhum. */
  async function aoEscolherArquivo(lista: FileList | null) {
    const arquivo = lista && lista[0]
    if (!arquivo || !atual) return
    setAviso('Lendo a planilha...')
    try {
      const linhas = await lerPlanilha(arquivo)
      if (!linhas.length) {
        setAviso('A planilha está vazia, ou a primeira linha não tem os títulos das colunas.')
        return
      }
      if (sufixo.trim()) {
        await espalharPorEstado(linhas)
        return
      }
      await aplicar(linhas)
    } catch (e) {
      console.error(e)
      setAviso('Não consegui ler esse arquivo. Vale .xlsx, .xls ou .csv, com títulos na primeira linha.')
    }
  }

  if (carregando) return <p className="text-sm text-slate-400 text-center py-20">Carregando prospecção...</p>

  const abas = (
    <div className="flex gap-1">
      {([['lista', 'Campanhas'], ['painel', 'Painel']] as ['lista' | 'painel', string][]).map(
        ([v, rotulo]) => (
          <button
            key={v}
            onClick={() => setAba(v)}
            className={
              'text-xs font-medium px-3 py-1.5 rounded-lg border ' +
              (aba === v
                ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                : 'border-slate-200 text-slate-500 hover:bg-slate-50')
            }
          >
            {rotulo}
          </button>
        )
      )}
    </div>
  )

  if (aba === 'painel') {
    return (
      <div className="space-y-4">
        {abas}
        <ProspeccaoPainel />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {abas}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
          className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
        >
          {!campanhas.length && <option value="">Nenhuma campanha ainda</option>}
          {campanhas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        {podeEditar && (
          <>
            <button
              onClick={() => setNova(!nova)}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              Nova campanha
            </button>
            <button
              onClick={abrirEdicao}
              disabled={!atual}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              Editar campanha
            </button>
            <button
              onClick={() => setColando(!colando)}
              disabled={!atual}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40"
            >
              Importar contatos
            </button>
          </>
        )}
        <div className="flex-1" />
        <div className="flex gap-1">
          {[
            ['fila', 'Na fila (' + r.fila + ')'],
            ['enviado', 'Enviados (' + r.enviados + ')'],
            ['respondeu', 'Responderam (' + r.responderam + ')'],
            ['falhou', 'Erros (' + r.falharam + ')'],
            ['todos', 'Todos (' + r.total + ')'],
          ].map(([v, rotulo]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={
                'text-[11px] px-2.5 py-1.5 rounded-lg border ' +
                (filtro === v
                  ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50')
              }
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <div className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
          {aviso}
        </div>
      )}

      {vendo && (
        <div className="bg-white border border-amber-300 rounded-xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700">
                {vendo.nome || telefoneBonito(vendo.telefone)}
              </p>
              <p className="text-[11px] text-slate-500">
                {telefoneBonito(vendo.telefone)} — esse número já existe na casa
              </p>
            </div>
            <button
              onClick={() => setVendo(null)}
              className="text-xs text-slate-400 hover:text-slate-700 px-2"
            >
              fechar
            </button>
          </div>

          {buscandoVinculos ? (
            <p className="text-xs text-slate-400">Procurando...</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Negociações</p>
                {!vinculos.negociacoes.length ? (
                  <p className="text-xs text-slate-400">Nenhuma.</p>
                ) : (
                  vinculos.negociacoes.map((n) => (
                    <button
                      key={n.id}
                      onClick={() => aoAbrirNegociacao && aoAbrirNegociacao(n.id)}
                      disabled={!aoAbrirNegociacao}
                      className="block w-full text-left text-xs px-2 py-1.5 rounded-lg border border-slate-200 mb-1 hover:bg-slate-50 disabled:hover:bg-white"
                    >
                      <span className="font-medium text-slate-700">{n.nome}</span>
                      <span className="block text-[10px] text-slate-400">
                        {n.funil} · {n.etapa}
                        {n.valor ? ' · ' + reais(Number(n.valor)) : ''}
                        {n.responsavel ? ' · ' + n.responsavel : ''}
                      </span>
                    </button>
                  ))
                )}
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Projetos</p>
                {!vinculos.projetos.length ? (
                  <p className="text-xs text-slate-400">Nenhum.</p>
                ) : (
                  vinculos.projetos.map((p) => (
                    <p key={p.id} className="text-xs text-slate-700 mb-1">
                      <span className="text-slate-400">#{p.numero} </span>
                      {p.nome}
                      <span className="block text-[10px] text-slate-400">
                        {p.status}
                        {p.responsavel ? ' · ' + p.responsavel : ''}
                      </span>
                    </p>
                  ))
                )}
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Cliente</p>
                {!vinculos.clientes.length ? (
                  <p className="text-xs text-slate-400">Não está no cadastro.</p>
                ) : (
                  vinculos.clientes.map((x) => (
                    <p key={x.id} className="text-xs text-slate-700">
                      {x.nome}
                      {x.cidade ? <span className="text-slate-400"> — {x.cidade}</span> : null}
                    </p>
                  ))
                )}
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">Parceiro</p>
                {!vinculos.parceiros.length ? (
                  <p className="text-xs text-slate-400">Não está no cadastro.</p>
                ) : (
                  vinculos.parceiros.map((x) => (
                    <p key={x.id} className="text-xs text-slate-700">{x.nome}</p>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {nova && podeEditar && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <input
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            placeholder="Nome da campanha (ex.: Indústrias da zona norte)"
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
          />
          <div>
            <label className="text-[11px] text-slate-500">
              Mensagem. Use {'{{nome}}'}, {'{{empresa}}'} e {'{{cidade}}'} — trocam pelos dados de cada contato.
            </label>
            <textarea
              value={modeloNovo}
              onChange={(e) => setModeloNovo(e.target.value)}
              rows={4}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <button
            onClick={salvarCampanha}
            disabled={salvando}
            className="text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-40"
          >
            Criar campanha
          </button>
        </div>
      )}

      {editando && podeEditar && campanha && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <input
            value={nomeEdit}
            onChange={(e) => setNomeEdit(e.target.value)}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2"
          />
          <div>
            <label className="text-[11px] text-slate-500">
              Mensagem. {'{{nome}}'}, {'{{empresa}}'} e {'{{cidade}}'} trocam pelos dados do contato.
            </label>
            <textarea
              value={modeloEdit}
              onChange={(e) => setModeloEdit(e.target.value)}
              rows={4}
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusEdit}
              onChange={(e) => setStatusEdit(e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white"
            >
              <option value="aberta">Aberta</option>
              <option value="pausada">Pausada</option>
              <option value="concluida">Concluída</option>
            </select>
            <button
              onClick={salvarCampanha}
              disabled={salvando}
              className="text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-40"
            >
              Salvar
            </button>
            <button
              onClick={reiniciar}
              disabled={salvando}
              className="text-xs px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
            >
              Reiniciar campanha
            </button>
            <span className="text-[11px] text-slate-400">
              devolve todos para a fila, mantendo o histórico
            </span>
          </div>

          <div className="border-t border-rose-100 pt-3">
            <p className="text-[11px] text-rose-700">
              Apagar leva junto os {r.total} contatos desta campanha, e não tem volta. As
              negociações que já nasceram dela continuam no funil. Para confirmar, digite o nome
              da campanha:
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <input
                value={confirmaNome}
                onChange={(e) => setConfirmaNome(e.target.value)}
                placeholder={campanha.nome}
                className="flex-1 min-w-[12rem] text-xs border border-rose-200 rounded-lg px-3 py-2"
              />
              <button
                onClick={apagar}
                disabled={salvando || confirmaNome.trim() !== campanha.nome}
                className="text-xs px-3 py-2 rounded-lg bg-rose-600 text-white disabled:opacity-30"
              >
                Apagar campanha
              </button>
            </div>
          </div>
        </div>
      )}

      {colando && podeEditar && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                aoEscolherArquivo(e.target.files)
                e.target.value = ''
              }}
              className="text-xs"
            />
            <button
              onClick={baixarModeloPlanilha}
              className="text-[11px] px-2.5 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50"
            >
              Baixar modelo
            </button>
          </div>
          <p className="text-[11px] text-slate-500">
            As colunas são reconhecidas pelo título: telefone (ou celular, whatsapp, fone), nome,
            empresa e cidade. A ordem não importa e coluna a mais é ignorada.
          </p>

          <div className="border-t border-slate-100 pt-3">
            <label className="text-[11px] text-slate-500">
              Distribuir por estado. Escreva aqui o que a lista é (Arquitetos, Engenheiros, Fixos) e
              cada número vai para a campanha do seu estado, descoberto pelo DDD. Quem já está em
              qualquer campanha fica de fora. Em branco, tudo entra na campanha escolhida acima.
            </label>
            <input
              value={sufixo}
              onChange={(e) => setSufixo(e.target.value)}
              placeholder="Arquitetos"
              className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 mt-1"
            />
          </div>

          {andamento && (
            <p className="text-[11px] text-indigo-700 bg-indigo-50 rounded-lg px-3 py-2">
              Importando: {andamento}
            </p>
          )}
          <details>
            <summary className="text-[11px] text-slate-500 cursor-pointer">
              Ou colar a lista na mão
            </summary>
            <textarea
              value={colado}
              onChange={(e) => setColado(e.target.value)}
              rows={5}
              placeholder="43999998888;João;Metalúrgica Alfa;Londrina"
              className="w-full text-xs font-mono border border-slate-300 rounded-lg px-3 py-2 mt-2"
            />
            <button
              onClick={() => aplicar(linhasDoTexto(colado))}
              disabled={salvando}
              className="text-xs px-3 py-2 rounded-lg bg-indigo-600 text-white disabled:opacity-40 mt-2"
            >
              Importar o que foi colado
            </button>
          </details>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
        {[
          ['Na fila', r.fila],
          ['Enviados', r.enviados],
          ['Erros', r.falharam],
          ['Responderam', r.responderam],
          ['No funil', r.no_funil],
          ['Já são da casa', r.ja_na_base],
        ].map(([rotulo, valor]) => (
          <div key={String(rotulo)} className="bg-white border border-slate-200 rounded-xl px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-slate-400">{rotulo}</p>
            <p className="text-lg font-semibold text-slate-700">{valor}</p>
          </div>
        ))}
      </div>

      {campanha && (
        <p className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
          <span className="font-medium text-slate-600">Mensagem: </span>
          {contatos[0] ? mensagem(campanha.modelo, contatos[0]) : campanha.modelo}
        </p>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Contato</th>
              <th className="text-left px-3 py-2 font-medium">Empresa</th>
              <th className="text-left px-3 py-2 font-medium">Cidade</th>
              <th className="text-left px-3 py-2 font-medium">Situação</th>
              <th className="text-right px-3 py-2 font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {!contatos.length && (
              <tr>
                <td colSpan={5} className="text-center text-slate-400 py-10">
                  Nada aqui ainda.
                </td>
              </tr>
            )}
            {contatos.map((c) => (
              <tr key={c.id} className="border-t border-slate-100">
                <td className="px-3 py-2">
                  <p className="font-medium text-slate-700">{c.nome || telefoneBonito(c.telefone)}</p>
                  <p className="text-[11px] text-slate-400">{telefoneBonito(c.telefone)}</p>
                  {(c.erro || c.mensagem) && (
                    <p
                      className="text-[10px] text-slate-400 max-w-[22rem] truncate"
                      title={c.erro || c.mensagem || ''}
                    >
                      {c.erro ? 'Erro: ' + c.erro : c.mensagem}
                    </p>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{c.empresa || '—'}</td>
                <td className="px-3 py-2 text-slate-600">{c.cidade || '—'}</td>
                <td className="px-3 py-2">
                  <span className={'px-2 py-0.5 rounded-full ' + (CORES[c.situacao] || CORES.fila)}>
                    {SITUACOES[c.situacao] || c.situacao}
                  </span>
                  {c.lead_id && <span className="ml-1 text-[10px] text-emerald-600">no funil</span>}
                  {c.ja_na_base && (
                    <button
                      onClick={() => verVinculos(c)}
                      className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] hover:bg-amber-200"
                      title="Ver o que já existe para esse número"
                    >
                      já é {c.ja_na_base} ›
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {podeEditar && c.situacao !== 'bloqueado' && (
                    <>
                      <button
                        onClick={() => abrirConversa(c)}
                        className="text-[11px] px-2 py-1 rounded-lg bg-emerald-600 text-white"
                      >
                        Abrir conversa
                      </button>
                      {c.abordado_em && c.situacao !== 'respondeu' && (
                        <button
                          onClick={() => marcar(c, 'respondeu')}
                          className="ml-1 text-[11px] px-2 py-1 rounded-lg border border-slate-300"
                        >
                          Respondeu
                        </button>
                      )}
                      {!c.lead_id && (
                        <button
                          onClick={() => virarLead(c)}
                          className="ml-1 text-[11px] px-2 py-1 rounded-lg bg-indigo-600 text-white"
                        >
                          Virar lead
                        </button>
                      )}
                      {c.situacao !== 'descartado' && (
                        <button
                          onClick={() => descartarContato(c)}
                          className="ml-1 text-[11px] px-2 py-1 rounded-lg border border-slate-300 text-slate-500"
                        >
                          Descartar
                        </button>
                      )}
                      <button
                        onClick={() => bloquear(c)}
                        className="ml-1 text-[11px] px-2 py-1 rounded-lg border border-rose-200 text-rose-600"
                      >
                        Não quer receber
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
