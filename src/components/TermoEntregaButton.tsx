import { useState } from 'react'
import type { Project, ProjectClient } from '../types'
import { gerarTermoDeEntrega, nomeDoArquivoTermo } from '../lib/termoEntrega'

function hojeStr() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Gera o termo de entrega já preenchido com os dados do cartão.
 *
 * Abre uma janelinha antes de baixar porque três informações não estão no
 * sistema: quem assina, quando recebeu e onde foi entregue. Preenchidas aqui,
 * o termo sai pronto; deixadas em branco, saem como linha para escrever à mão.
 */
export default function TermoEntregaButton({
  projeto,
  cliente,
}: {
  projeto: Project
  cliente: Partial<ProjectClient>
}) {
  const [aberto, setAberto] = useState(false)
  const [recebedor, setRecebedor] = useState(cliente.nome_responsavel || '')
  const [dataRecebimento, setDataRecebimento] = useState(hojeStr())
  const [enderecoEntrega, setEnderecoEntrega] = useState(cliente.endereco_completo || '')
  const [preencherAMao, setPreencherAMao] = useState(false)

  function gerar(baixar: boolean) {
    const pdf = gerarTermoDeEntrega({
      projeto,
      cliente,
      recebedor: preencherAMao ? '' : recebedor,
      dataRecebimento: preencherAMao ? '' : dataRecebimento,
      enderecoEntrega: preencherAMao ? '' : enderecoEntrega,
    })
    if (baixar) pdf.save(nomeDoArquivoTermo(projeto))
    else pdf.output('dataurlnewwindow')
    setAberto(false)
  }

  // O que falta nos Dados do cliente aparece antes de gerar, para não sair
  // um termo com buraco no meio sem ninguém perceber.
  const faltando: string[] = []
  if (!cliente.cidade) faltando.push('cidade')
  if (!cliente.numero_re) faltando.push('nº do NIB / RE')
  if (!cliente.cnpj) faltando.push('CNPJ ou CPF')
  if (!cliente.endereco_completo) faltando.push('endereço')
  if (!cliente.data_aprovacao) faltando.push('data de aprovação')

  return (
    <>
      <button
        onClick={() => setAberto(true)}
        className="text-xs font-medium px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 hover:border-red-400 hover:text-red-700"
        title="Gera o termo em PDF com os dados deste projeto"
      >
        📄 Gerar termo de entrega
      </button>

      {aberto && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Termo de entrega dos projetos</h3>
              <button
                onClick={() => setAberto(false)}
                className="text-slate-400 hover:text-slate-700 text-lg leading-none px-1"
              >
                ×
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {faltando.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-[11px] text-amber-900">
                    Faltando nos Dados do cliente: <b>{faltando.join(', ')}</b>. O termo sai assim
                    mesmo, com linha em branco no lugar.
                  </p>
                </div>
              )}

              <label className="flex items-center gap-2 text-xs text-slate-600 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={preencherAMao}
                  onChange={(e) => setPreencherAMao(e.target.checked)}
                />
                Sair em branco para preencher à mão na hora da entrega
              </label>

              {!preencherAMao && (
                <>
                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      Quem assina o recebimento
                    </label>
                    <input
                      value={recebedor}
                      onChange={(e) => setRecebedor(e.target.value)}
                      placeholder="Nome de quem recebe o projeto"
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      Data do recebimento
                    </label>
                    <input
                      type="date"
                      value={dataRecebimento}
                      onChange={(e) => setDataRecebimento(e.target.value)}
                      className="border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-medium text-slate-500 mb-1">
                      Endereço de entrega do projeto
                    </label>
                    <input
                      value={enderecoEntrega}
                      onChange={(e) => setEnderecoEntrega(e.target.value)}
                      placeholder="Onde o projeto foi entregue"
                      className="w-full border border-slate-300 rounded-md px-2 py-1.5 text-xs"
                    />
                  </div>
                </>
              )}

              <p className="text-[10px] text-slate-400">
                O CPF de quem assina e a assinatura saem sempre como linha em branco — são
                preenchidos na hora, com o cliente presente.
              </p>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                onClick={() => setAberto(false)}
                className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-200 rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => gerar(false)}
                className="px-3 py-1.5 text-sm border border-slate-300 bg-white text-slate-600 hover:border-slate-400 rounded-lg font-medium"
              >
                Visualizar
              </button>
              <button
                onClick={() => gerar(true)}
                className="px-4 py-1.5 text-sm bg-red-700 hover:bg-red-800 text-white rounded-lg font-medium"
              >
                Baixar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
