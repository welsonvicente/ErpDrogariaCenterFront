import { useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Painel } from '../../components/estoque/Elementos';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { mensagemDeErro } from '../../services/estoqueService';
import type { ImportacaoEstoque } from '../../types/estoque';
import { NAO_INFORMADO, fmtData, fmtDataHora, fmtInteiro, fmtMoeda, fmtQuantidade } from '../../utils/estoqueFormat';
import {
  CAMPOS_IMPORTACAO,
  LIMITE_ARQUIVO_GUARDADO_BYTES,
  NOME_ARQUIVO_DEMONSTRACAO,
  arquivoParaBase64,
  detectarLinhaCabecalho,
  detectarMapeamento,
  extrairLinhas,
  gerarLinhasDemonstracao,
  lerPlanilha,
  mapeamentoVazio,
  type AbaPlanilha,
  type Mapeamento,
  type ResultadoLeitura,
} from '../../utils/estoqueImportacao';

type Fonte = { tipo: 'arquivo'; nome: string; abas: AbaPlanilha[]; arquivo: File } | { tipo: 'demo'; nome: string };

function letraDaColuna(indice: number): string {
  let texto = '';
  let n = indice;
  do {
    texto = String.fromCharCode(65 + (n % 26)) + texto;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return texto;
}

const LIMITE_PROBLEMAS_VISIVEIS = 100;

export function EstoqueImportarPage() {
  useDocumentTitle('Importar relatório — Estoque');
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { produtos, ultimaImportacao, importar, hoje } = useEstoque();
  const entrada = useRef<HTMLInputElement>(null);

  const [fonte, setFonte] = useState<Fonte | null>(null);
  const [abaIdx, setAbaIdx] = useState(0);
  const [linhaCabecalho, setLinhaCabecalho] = useState(1);
  const [mapa, setMapa] = useState<Mapeamento>(mapeamentoVazio());
  const [cabecalhoNaoAchado, setCabecalhoNaoAchado] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [erroLeitura, setErroLeitura] = useState('');

  const [modo, setModo] = useState<'ATUALIZAR' | 'SUBSTITUIR'>('ATUALIZAR');
  const [confirmaSubstituir, setConfirmaSubstituir] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erroEnvio, setErroEnvio] = useState('');
  const [resultado, setResultado] = useState<ImportacaoEstoque | null>(null);
  const [arrastando, setArrastando] = useState(false);

  const base = `/${orgSlug}/gerente/estoque`;
  const temDados = produtos.length > 0;
  const baseSoTemDemo = produtos.every((p) => p.produto.startsWith('[DEMO]'));

  const abaAtual = fonte?.tipo === 'arquivo' ? fonte.abas[abaIdx] : undefined;
  const linhaCabecalhoCelulas = abaAtual?.linhas[linhaCabecalho - 1] ?? [];
  const colunas = linhaCabecalhoCelulas.map((celula, i) => ({ indice: i, rotulo: `${letraDaColuna(i)} — ${String(celula ?? '').trim() || '(sem título)'}` }));
  const obrigatoriosOk = mapa.codigoTrier !== null && mapa.produto !== null;

  const leitura = useMemo<ResultadoLeitura | null>(() => {
    if (!fonte) return null;
    if (fonte.tipo === 'demo') {
      const linhas = gerarLinhasDemonstracao(hoje);
      return { linhas, totalDoRelatorio: null, totalLidas: linhas.length, vazias: 0, ignoradas: 0, problemas: [] };
    }
    if (!abaAtual || !obrigatoriosOk) return null;
    return extrairLinhas(abaAtual.linhas, linhaCabecalho - 1, mapa);
  }, [fonte, abaAtual, linhaCabecalho, mapa, obrigatoriosOk, hoje]);

  /** Comparação com o que já está no sistema — ajuda a decidir entre atualizar e substituir. */
  const comparacao = useMemo(() => {
    if (!leitura) return null;
    const existentes = new Set(produtos.map((p) => p.codigoTrier));
    const doArquivo = new Set(leitura.linhas.map((l) => l.codigoTrier));
    const novos = leitura.linhas.filter((l) => !existentes.has(l.codigoTrier)).length;
    const sairiam = produtos.filter((p) => p.ativo && !doArquivo.has(p.codigoTrier)).length;
    return { novos, atualizados: leitura.linhas.length - novos, sairiam };
  }, [leitura, produtos]);

  function aplicarAba(abas: AbaPlanilha[], indice: number) {
    const linhas = abas[indice].linhas;
    const detectada = detectarLinhaCabecalho(linhas);
    const idx = detectada >= 0 ? detectada : 0;
    setAbaIdx(indice);
    setLinhaCabecalho(idx + 1);
    setMapa(detectarMapeamento(linhas[idx] ?? []));
    setCabecalhoNaoAchado(detectada < 0);
  }

  function limparEstado() {
    setFonte(null);
    setErroLeitura('');
    setErroEnvio('');
    setResultado(null);
    setConfirmaSubstituir(false);
    setCabecalhoNaoAchado(false);
  }

  async function escolherArquivo(arquivo: File | undefined) {
    if (!arquivo) return;
    limparEstado();
    setLendo(true);
    try {
      const abas = await lerPlanilha(arquivo);
      // Prefere a primeira aba em que o cabeçalho é reconhecido (relatórios às vezes trazem uma capa antes).
      const indice = Math.max(0, abas.findIndex((a) => detectarLinhaCabecalho(a.linhas) >= 0));
      setFonte({ tipo: 'arquivo', nome: arquivo.name, abas, arquivo });
      aplicarAba(abas, indice);
      setModo(temDados && baseSoTemDemo ? 'SUBSTITUIR' : 'ATUALIZAR');
    } catch (e) {
      setErroLeitura(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    } finally {
      setLendo(false);
      if (entrada.current) entrada.current.value = '';
    }
  }

  function usarDemonstracao() {
    limparEstado();
    setFonte({ tipo: 'demo', nome: NOME_ARQUIVO_DEMONSTRACAO });
    setModo('ATUALIZAR');
  }

  function aoSoltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setArrastando(false);
    void escolherArquivo(e.dataTransfer.files?.[0]);
  }

  const demoBloqueada = fonte?.tipo === 'demo' && temDados && !baseSoTemDemo;
  const precisaConfirmar = modo === 'SUBSTITUIR' && temDados;
  const podeImportar = !!leitura && leitura.linhas.length > 0 && !demoBloqueada && (!precisaConfirmar || confirmaSubstituir) && !enviando;

  async function confirmarImportacao() {
    if (!fonte || !leitura) return;
    setEnviando(true);
    setErroEnvio('');
    try {
      // O .xlsx original vai junto pra ficar guardado no servidor (acessível de qualquer aparelho). Acima do limite, só os dados são salvos.
      const guardarOriginal = fonte.tipo === 'arquivo' && fonte.arquivo.size <= LIMITE_ARQUIVO_GUARDADO_BYTES;
      const arquivo =
        guardarOriginal && fonte.tipo === 'arquivo'
          ? { mime: fonte.arquivo.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', conteudoBase64: await arquivoParaBase64(fonte.arquivo) }
          : undefined;
      const feito = await importar({ nomeArquivo: fonte.nome, modo, totalLinhasLidas: leitura.totalLidas, linhas: leitura.linhas, arquivo });
      limparEstado();
      setResultado(feito);
    } catch (e) {
      setErroEnvio(mensagemDeErro(e, 'Não foi possível importar. Nada foi alterado.'));
    } finally {
      setEnviando(false);
    }
  }

  /** Soma do que foi lido × o "Total Geral" que o relatório traz — se bater, a leitura está íntegra. */
  const conferencia = useMemo(() => {
    const total = leitura?.totalDoRelatorio;
    if (!leitura || !total) return null;
    const saldo = leitura.linhas.reduce((s, l) => s + (l.saldo ?? 0), 0);
    const valor = leitura.linhas.reduce((s, l) => s + (l.valorTotal ?? (l.saldo !== null && l.custoUnitario !== null ? l.saldo * l.custoUnitario : 0)), 0);
    return {
      saldo,
      valor,
      saldoConfere: total.saldo === null || Math.abs(saldo - total.saldo) < 0.5,
      valorConfere: total.valorTotal === null || Math.abs(valor - total.valorTotal) < 1,
      total,
    };
  }, [leitura]);

  const erros = leitura?.problemas.filter((p) => p.nivel === 'erro').length ?? 0;
  const avisos = leitura?.problemas.filter((p) => p.nivel === 'aviso').length ?? 0;

  return (
    <div className="est-pagina est-pagina-estreita">
      {resultado && (
        <div className="est-alerta est-alerta-ok" role="status">
          ✅ <strong>Importação concluída</strong> — {resultado.resumo.novos} novos, {resultado.resumo.atualizados} atualizados
          {resultado.resumo.saiuDoRelatorio > 0 && `, ${resultado.resumo.saiuDoRelatorio} saíram do relatório`}
          {resultado.resumo.removidos > 0 && `, ${resultado.resumo.removidos} apagados`}
          {resultado.resumo.ignoradas > 0 && `, ${resultado.resumo.ignoradas} linhas ignoradas`}.{' '}
          <Link to={base}>Ver o dashboard</Link> · <Link to={`${base}/produtos`}>Ver os produtos</Link>
        </div>
      )}

      <Painel titulo="1. Escolha o relatório do Trier">
        <label
          className={`est-dropzone ${arrastando ? 'ativa' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setArrastando(true);
          }}
          onDragLeave={() => setArrastando(false)}
          onDrop={aoSoltar}
        >
          <input ref={entrada} type="file" accept=".xlsx,.xls" onChange={(e) => void escolherArquivo(e.target.files?.[0])} />
          <span className="est-dropzone-icone">📄</span>
          <strong>{lendo ? 'Lendo o arquivo…' : 'Clique para escolher ou arraste o arquivo Excel aqui'}</strong>
          <small>Relatório de produtos parados do Trier (.xlsx ou .xls). Os dados e o arquivo original ficam salvos no sistema e podem ser acessados de qualquer lugar.</small>
        </label>
        {erroLeitura && (
          <p className="error-text" role="alert">
            {erroLeitura}
          </p>
        )}

        <p className="est-dica">
          {ultimaImportacao ? (
            <>
              Dados atuais: <strong>{fmtInteiro(produtos.filter((p) => p.ativo).length)}</strong> produtos, de <em>{ultimaImportacao.nomeArquivo}</em> ({fmtDataHora(ultimaImportacao.criadoEm)}).
            </>
          ) : (
            'Ainda não há dados importados.'
          )}{' '}
          Quer só conhecer o sistema?{' '}
          <button type="button" className="est-link" onClick={usarDemonstracao}>
            Carregar dados de demonstração
          </button>{' '}
          (fictícios, identificados com “[DEMO]”).
        </p>
      </Painel>

      {fonte && (
        <>
          {fonte.tipo === 'demo' && (
            <div className="est-alerta est-alerta-aviso">
              🧪 <strong>Dados de demonstração</strong> — produtos fictícios para testar o sistema. Depois, importe o relatório real no modo “Substituir tudo”.
              {demoBloqueada && (
                <>
                  {' '}
                  <strong>Bloqueado:</strong> já existem dados reais, e a demonstração os misturaria. Ela só pode ser carregada em uma base vazia ou que tenha apenas demonstração.
                </>
              )}
            </div>
          )}

          {fonte.tipo === 'arquivo' && abaAtual && (
            <Painel titulo="2. Confira as colunas">
              <div className="est-form-grid">
                {fonte.abas.length > 1 && (
                  <label className="field">
                    <span>Aba da planilha</span>
                    <select value={abaIdx} onChange={(e) => aplicarAba(fonte.abas, Number(e.target.value))}>
                      {fonte.abas.map((a, i) => (
                        <option key={a.nome} value={i}>
                          {a.nome}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="field">
                  <span>Linha do cabeçalho (títulos das colunas)</span>
                  <input
                    type="number"
                    min={1}
                    max={Math.max(1, abaAtual.linhas.length)}
                    value={linhaCabecalho}
                    onChange={(e) => {
                      const v = Math.min(Math.max(1, Number(e.target.value) || 1), abaAtual.linhas.length || 1);
                      setLinhaCabecalho(v);
                      setMapa(detectarMapeamento(abaAtual.linhas[v - 1] ?? []));
                      setCabecalhoNaoAchado(false);
                    }}
                  />
                </label>
              </div>

              {cabecalhoNaoAchado && (
                <div className="est-alerta est-alerta-aviso">
                  Não reconheci a linha de cabeçalho automaticamente. Ajuste o número da linha acima e escolha, abaixo, qual coluna é cada informação.
                </div>
              )}

              <div className="est-tabela-rolagem">
                <table className="data-table est-tabela est-mapeamento">
                  <thead>
                    <tr>
                      <th>Informação do sistema</th>
                      <th>Coluna do arquivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAMPOS_IMPORTACAO.map((def) => (
                      <tr key={def.campo}>
                        <td>
                          {def.rotulo}
                          {def.obrigatorio && <span className="est-obrigatorio"> *</span>}
                        </td>
                        <td>
                          <select
                            value={mapa[def.campo] ?? ''}
                            onChange={(e) => setMapa((m) => ({ ...m, [def.campo]: e.target.value === '' ? null : Number(e.target.value) }) as Mapeamento)}
                            aria-label={def.rotulo}
                          >
                            <option value="">{def.obrigatorio ? '— escolha a coluna —' : 'Não está no arquivo (ficará “não informado”)'}</option>
                            {colunas.map((c) => (
                              <option key={c.indice} value={c.indice}>
                                {c.rotulo}
                              </option>
                            ))}
                          </select>
                          {mapa[def.campo] === null && !def.obrigatorio && <small className="est-nao-informado"> {NAO_INFORMADO}</small>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!obrigatoriosOk && <p className="error-text">Escolha as colunas obrigatórias (*): o código do produto no Trier e o nome do produto.</p>}
            </Painel>
          )}

          {leitura && (
            <Painel titulo={fonte.tipo === 'arquivo' ? '3. Confira os dados antes de importar' : 'Prévia dos dados'}>
              <div className="est-chips">
                <span className="est-chip est-chip-ok">{fmtInteiro(leitura.linhas.length)} produtos prontos</span>
                <span className="est-chip">{fmtInteiro(leitura.totalLidas)} linhas lidas</span>
                <span className="est-chip">{fmtInteiro(leitura.vazias)} vazias</span>
                {erros > 0 || leitura.ignoradas > 0 ? <span className="est-chip est-chip-erro">{fmtInteiro(leitura.ignoradas)} ignoradas</span> : null}
                {avisos > 0 && <span className="est-chip est-chip-aviso">{fmtInteiro(avisos)} avisos</span>}
              </div>

              {conferencia && (
                <div className={`est-alerta ${conferencia.saldoConfere && conferencia.valorConfere ? 'est-alerta-ok' : 'est-alerta-aviso'}`} role="status">
                  {conferencia.saldoConfere && conferencia.valorConfere ? '✅ Confere com o “Total Geral” do relatório: ' : '⚠️ Diferença em relação ao “Total Geral” do relatório: '}
                  {conferencia.total.saldo !== null && (
                    <>
                      <strong>{fmtQuantidade(conferencia.saldo)}</strong> unidades lidas (relatório: {fmtQuantidade(conferencia.total.saldo)})
                    </>
                  )}
                  {conferencia.total.valorTotal !== null && (
                    <>
                      {conferencia.total.saldo !== null ? ' · ' : ''}
                      <strong>{fmtMoeda(conferencia.valor)}</strong> em valor (relatório: {fmtMoeda(conferencia.total.valorTotal)})
                    </>
                  )}
                  .
                </div>
              )}

              {comparacao && temDados && (
                <p className="est-dica">
                  Em relação ao que já está no sistema: <strong>{fmtInteiro(comparacao.novos)}</strong> produtos novos, <strong>{fmtInteiro(comparacao.atualizados)}</strong> já existentes (relacionados pelo código Trier) e{' '}
                  <strong>{fmtInteiro(comparacao.sairiam)}</strong> que não vieram neste arquivo.
                </p>
              )}

              {leitura.problemas.length > 0 && (
                <details className="est-problemas">
                  <summary>
                    Ver {fmtInteiro(leitura.problemas.length)} ocorrência(s) da leitura
                  </summary>
                  <ul>
                    {leitura.problemas.slice(0, LIMITE_PROBLEMAS_VISIVEIS).map((p, i) => (
                      <li key={i} className={`est-problema est-problema-${p.nivel}`}>
                        <strong>Linha {p.linha}:</strong> {p.mensagem}
                      </li>
                    ))}
                  </ul>
                  {leitura.problemas.length > LIMITE_PROBLEMAS_VISIVEIS && <p className="est-dica">Mostrando as primeiras {LIMITE_PROBLEMAS_VISIVEIS}.</p>}
                </details>
              )}

              {leitura.linhas.length === 0 ? (
                <p className="error-text">Nenhum produto válido foi encontrado nesse arquivo. Confira a linha do cabeçalho e as colunas escolhidas.</p>
              ) : (
                <div className="est-tabela-rolagem">
                  <table className="data-table est-tabela">
                    <thead>
                      <tr>
                        <th>Código</th>
                        <th>Produto</th>
                        <th>Laboratório</th>
                        <th>Grupo</th>
                        <th>Fornecedor</th>
                        <th className="est-direita">Estoque</th>
                        <th className="est-direita">Custo</th>
                        <th className="est-direita">Valor total</th>
                        <th>Última entrada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leitura.linhas.slice(0, 10).map((l) => (
                        <tr key={l.codigoTrier}>
                          <td>
                            <code>{l.codigoTrier}</code>
                          </td>
                          <td>
                            <strong>{l.produto}</strong>
                          </td>
                          <td>{l.laboratorio ?? <span className="est-nao-informado">{NAO_INFORMADO}</span>}</td>
                          <td>{l.grupo ?? <span className="est-nao-informado">{NAO_INFORMADO}</span>}</td>
                          <td>{l.fornecedor ?? <span className="est-nao-informado">{NAO_INFORMADO}</span>}</td>
                          <td className="est-direita">{fmtQuantidade(l.saldo)}</td>
                          <td className="est-direita">{fmtMoeda(l.custoUnitario)}</td>
                          <td className="est-direita">{fmtMoeda(l.valorTotal)}</td>
                          <td>{fmtData(l.dataUltimaEntrada)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {leitura.linhas.length > 10 && <p className="est-dica">Prévia das 10 primeiras linhas de {fmtInteiro(leitura.linhas.length)}.</p>}
            </Painel>
          )}

          {leitura && leitura.linhas.length > 0 && (
            <Painel titulo={fonte.tipo === 'arquivo' ? '4. Como importar' : 'Como importar'}>
              <div className="est-modos">
                <label className={`est-modo ${modo === 'ATUALIZAR' ? 'ativo' : ''}`}>
                  <input type="radio" name="modo" checked={modo === 'ATUALIZAR'} onChange={() => setModo('ATUALIZAR')} />
                  <span>
                    <strong>Atualizar mantendo as ações (recomendado)</strong>
                    <small>Relaciona os produtos pelo código Trier. Quantidades, custos e datas são atualizados; planos de ação, status, responsáveis e observações ficam como estão. O que não veio no arquivo fica guardado como “fora do relatório”.</small>
                  </span>
                </label>
                <label className={`est-modo ${modo === 'SUBSTITUIR' ? 'ativo' : ''}`}>
                  <input type="radio" name="modo" checked={modo === 'SUBSTITUIR'} onChange={() => setModo('SUBSTITUIR')} />
                  <span>
                    <strong>Substituir tudo</strong>
                    <small>Apaga os produtos atuais — inclusive planos de ação e observações — e começa do zero com este arquivo. O histórico de importações é mantido.</small>
                  </span>
                </label>
              </div>

              {precisaConfirmar && (
                <label className="est-check est-confirma">
                  <input type="checkbox" checked={confirmaSubstituir} onChange={(e) => setConfirmaSubstituir(e.target.checked)} />
                  Entendo que os {fmtInteiro(produtos.length)} produtos atuais e as ações/observações cadastradas serão apagados.
                </label>
              )}

              <p className="error-text" role="alert">
                {erroEnvio}
              </p>
              <div className="est-barra-botoes">
                <button type="button" className="btn-primary" onClick={() => void confirmarImportacao()} disabled={!podeImportar}>
                  {enviando ? 'Importando…' : `Confirmar importação de ${fmtInteiro(leitura.linhas.length)} produtos`}
                </button>
                <button type="button" className="btn-ghost" onClick={limparEstado} disabled={enviando}>
                  Cancelar
                </button>
              </div>
            </Painel>
          )}
        </>
      )}
    </div>
  );
}
