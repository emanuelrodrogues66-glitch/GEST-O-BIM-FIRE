import { useState } from 'react'
import { LOGO_BIM_FIRE_JPEG } from '../lib/logoBimFire'
import {
  ESTADOS,
  PROFISSOES,
  RELACAO,
  TIPOS_DE_PROJETO,
  enviarFormulario,
} from '../lib/fornecedores'

/**
 * Formulário público de parceiros, em /parceiro.
 *
 * Fica fora do login de propósito: o endereço é mandado por WhatsApp e a
 * pessoa preenche no celular, sem cadastro nem senha. O banco só aceita
 * escrita nesta tabela — ninguém lê a lista por aqui.
 */
export default function FormularioParceiro() {
  const [nome, setNome] = useState('')
  const [profissao, setProfissao] = useState('')
  const [tipos, setTipos] = useState<string[]>([])
  const [outros, setOutros] = useState('')
  const [relacao, setRelacao] = useState('Não')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')
  const [estado, setEstado] = useState('')
  const [cidade, setCidade] = useState('')
  const [comentarios, setComentarios] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [pronto, setPronto] = useState(false)
  const [erro, setErro] = useState('')

  function alternar(tipo: string) {
    setTipos(tipos.includes(tipo) ? tipos.filter((t) => t !== tipo) : tipos.concat(tipo))
  }

  async function enviar() {
    setErro('')
    setEnviando(true)
    try {
      const extras = outros
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      await enviarFormulario({
        nome,
        profissao,
        tipos_projeto: tipos.concat(extras),
        ja_trabalhou: relacao,
        telefone,
        email,
        estado,
        cidade,
        comentarios,
      })
      setPronto(true)
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  if (pronto) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 max-w-md text-center">
          <img src={LOGO_BIM_FIRE_JPEG} alt="BIM Fire" className="w-14 h-14 rounded-xl mx-auto mb-4 object-cover" />
          <h1 className="text-lg font-semibold text-slate-800">Cadastro recebido</h1>
          <p className="text-sm text-slate-500 mt-2">
            Obrigado, {nome.split(' ')[0]}. Guardamos os seus dados e vamos procurar você quando
            aparecer trabalho na sua região e na sua área.
          </p>
          <p className="text-xs text-slate-400 mt-4">
            Se precisar de projeto de prevenção e combate a incêndio ou de aprovação no Corpo de
            Bombeiros, fale com a gente: (43) 9 9843-9725.
          </p>
        </div>
      </div>
    )
  }

  const rotulo = 'block text-xs font-medium text-slate-600 mb-1'
  const campo = 'w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white'

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-5">
          <img src={LOGO_BIM_FIRE_JPEG} alt="BIM Fire" className="w-12 h-12 rounded-xl object-cover" />
          <div>
            <h1 className="text-lg font-semibold text-slate-800 leading-tight">
              Cadastro de parceiros
            </h1>
            <p className="text-xs text-slate-500">BIM Fire Engenharia — Arapongas, PR</p>
          </div>
        </div>

        <div className="text-sm text-slate-600 bg-white border border-slate-200 rounded-xl p-4 mb-4 space-y-2">
          <p>
            Fazemos projetos de prevenção e combate a incêndio e cuidamos da aprovação no Corpo de
            Bombeiros em todo o Brasil.
          </p>
          <p>
            Quando surge uma demanda fora da nossa área, indicamos profissionais da nossa rede de
            parceiros.
          </p>
          <p>
            Quer fazer parte da nossa rede? Preencha o formulário, conte o que você faz e deixe seu
            contato. A recíproca também vale!
          </p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div>
            <label className={rotulo}>Nome completo ou do escritório *</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
          </div>

          <div>
            <label className={rotulo}>Profissão</label>
            <input
              list="profissoes"
              value={profissao}
              onChange={(e) => setProfissao(e.target.value)}
              placeholder="Engenheiro Civil, Arquiteto..."
              className={campo}
            />
            <datalist id="profissoes">
              {PROFISSOES.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div>
            <label className={rotulo}>Que tipos de projeto você faz?</label>
            <div className="grid grid-cols-2 gap-1">
              {TIPOS_DE_PROJETO.map((t) => (
                <label key={t} className="flex items-center gap-2 text-xs text-slate-600 py-0.5">
                  <input type="checkbox" checked={tipos.includes(t)} onChange={() => alternar(t)} />
                  {t}
                </label>
              ))}
            </div>
            <input
              value={outros}
              onChange={(e) => setOutros(e.target.value)}
              placeholder="Outros, separados por vírgula"
              className={campo + ' mt-2'}
            />
          </div>

          <div>
            <label className={rotulo}>Já trabalhou ou nos indicou?</label>
            <select value={relacao} onChange={(e) => setRelacao(e.target.value)} className={campo}>
              {RELACAO.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={rotulo}>WhatsApp com DDD *</label>
              <input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="(43) 99999-8888"
                inputMode="tel"
                className={campo}
              />
            </div>
            <div>
              <label className={rotulo}>E-mail</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                className={campo}
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={rotulo}>Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={campo}>
                <option value="">Escolha</option>
                {ESTADOS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={rotulo}>Cidade e região que atende</label>
              <input value={cidade} onChange={(e) => setCidade(e.target.value)} className={campo} />
            </div>
          </div>

          <div>
            <label className={rotulo}>Quer contar mais alguma coisa?</label>
            <textarea
              value={comentarios}
              onChange={(e) => setComentarios(e.target.value)}
              rows={3}
              className={campo}
            />
          </div>

          {erro && (
            <p className="text-xs bg-rose-50 border border-rose-200 text-rose-700 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}

          <button
            onClick={enviar}
            disabled={enviando || !nome.trim() || !telefone.trim()}
            className="w-full text-sm font-medium px-4 py-2.5 rounded-lg bg-indigo-600 text-white disabled:opacity-40"
          >
            {enviando ? 'Enviando...' : 'Enviar cadastro'}
          </button>

          <p className="text-[11px] text-slate-400">
            Usamos estes dados só para procurar você quando houver trabalho. Não repassamos a
            terceiros. Para sair da lista, é só pedir no WhatsApp acima.
          </p>
        </div>
      </div>
    </div>
  )
}
