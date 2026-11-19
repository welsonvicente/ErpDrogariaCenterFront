import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CabecalhoImpressao, Kpi, Painel, SemDados, useImpressao } from '../../components/estoque/Elementos';
import { ProdutoDetalheModal } from '../../components/estoque/ProdutoDetalheModal';
import { TabelaProdutos, type IdColuna } from '../../components/estoque/TabelaProdutos';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { mensagemDeErro } from '../../services/estoqueService';
import { candidatoNegociacao } from '../../utils/estoqueAcoes';
import { agruparPor, calcularTotais, ordenarPor, type ProdutoAnalisado } from '../../utils/estoqueAnalise';
import { NAO_INFORMADO, fmtInteiro, fmtMoeda, fmtPercentual, fmtQuantidade } from '../../utils/estoqueFormat';
import { consultaDeFiltros } from '../../utils/estoqueUrl';

type Por = 'laboratorio' | 'fornecedor';

const TEXTOS: Record<Por, { titulo: string; singular: string; plural: string; filtro: 'laboratorio' | 'fornecedor' }> = {
  laboratorio: { titulo: 'Laboratórios', singular: 'laboratório', plural: 'laboratórios', filtro: 'laboratorio' },
  fornecedor: { titulo: 'Fornecedores', singular: 'fornecedor', plural: 'fornecedores', filtro: 'fornecedor' },
};

const LIMITE_NEGOCIACAO = 60;

/** Análise por laboratório ou fornecedor — mesma tela, muda só o agrupamento. Clicar numa linha mostra os produtos dele. */
export function EstoqueAgrupamentoPage({ por }: { por: Por }) {
  const t = TEXTOS[por];
  useDocumentTitle(t.titulo);
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { analisados, config } = useEstoque();
  const { imprimindo, imprimir } = useImpressao();
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const ativos = useMemo(() => analisados.filter((p) => p.ativo), [analisados]);
  const grupos = useMemo(() => agruparPor(ativos, (p) => p[por]), [ativos, por]);
  const totais = useMemo(() => calcularTotais(ativos, config), [ativos, config]);
  const doEscolhido = useMemo(() => (escolhido === null ? [] : ativos.filter((p) => (p[por] ?? NAO_INFORMADO) === escolhido)), [ativos, escolhido, por]);

  if (!analisados.length) return <SemDados />;

  const maior = grupos[0];
  const colunas: IdColuna[] = ['ranking', 'prioridade', 'produto', por === 'laboratorio' ? 'fornecedor' : 'laboratorio', 'saldo', 'valor', 'dias', 'status'];

  return (
    <div className="est-pagina">
      <CabecalhoImpressao titulo={`Análise por ${t.singular}`} />

      <div className="est-kpis est-kpis-3">
        <Kpi titulo={`${t.titulo} com produtos parados`} valor={fmtInteiro(grupos.length)} />
        <Kpi titulo="Capital investido" valor={fmtMoeda(totais.valor)} destaque />
        {maior && <Kpi titulo={`Maior concentração de capital`} valor={maior.chave} apoio={`${fmtMoeda(maior.valor)} (${fmtPercentual(totais.valor ? (maior.valor / totais.valor) * 100 : 0)} do total)`} />}
      </div>

      <Painel
        titulo={`Capital investido por ${t.singular}`}
        acoes={
          <button type="button" className="btn-ghost est-nao-imprimir" onClick={imprimir}>
            🖨️ Imprimir
          </button>
        }
      >
        <div className="est-tabela-rolagem">
          <table className="data-table est-tabela">
            <thead>
              <tr>
                <th>{por === 'laboratorio' ? 'Laboratório' : 'Fornecedor'}</th>
                <th className="est-direita">Produtos</th>
                <th className="est-direita">Unidades</th>
                <th className="est-direita">Capital investido</th>
                <th>% do capital</th>
                <th className="est-direita">Prioridade P1</th>
                <th className="est-direita">Marcados p/ negociar</th>
              </tr>
            </thead>
            <tbody>
              {(imprimindo ? grupos : grupos.slice(0, 200)).map((g) => {
                const pct = totais.valor ? (g.valor / totais.valor) * 100 : 0;
                return (
                  <tr key={g.chave} className={`est-linha ${escolhido === g.chave ? 'est-linha-ativa' : ''}`} onClick={() => setEscolhido(escolhido === g.chave ? null : g.chave)}>
                    <td>
                      <strong>{g.chave === NAO_INFORMADO ? <span className="est-nao-informado">{NAO_INFORMADO}</span> : g.chave}</strong>
                    </td>
                    <td className="est-direita">{fmtInteiro(g.produtos)}</td>
                    <td className="est-direita">{fmtQuantidade(g.unidades)}</td>
                    <td className="est-direita">
                      {fmtMoeda(g.valor)}
                      {g.semValor > 0 && <small className="est-nao-informado"> +{g.semValor} s/ custo</small>}
                    </td>
                    <td>
                      <span className="est-mini-trilho" title={fmtPercentual(pct)}>
                        <span className="est-mini-preenchimento" style={{ width: `${Math.max(1, pct)}%` }} />
                      </span>
                      <small> {fmtPercentual(pct)}</small>
                    </td>
                    <td className="est-direita">{fmtInteiro(g.imediatos)}</td>
                    <td className="est-direita">{fmtInteiro(g.negociaveis)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {grupos.length > 200 && !imprimindo && <p className="est-dica">Mostrando os 200 maiores de {fmtInteiro(grupos.length)}.</p>}
      </Painel>

      {escolhido !== null && (
        <Painel
          titulo={`Produtos — ${escolhido}`}
          acoes={
            <div className="est-barra-botoes est-nao-imprimir">
              <button type="button" className="btn-ghost" onClick={() => navigate(`/${orgSlug}/gerente/estoque/produtos${consultaDeFiltros({ [t.filtro]: escolhido })}`)}>
                Abrir na lista de produtos
              </button>
              <button type="button" className="btn-ghost" onClick={() => setEscolhido(null)}>
                Fechar
              </button>
            </div>
          }
        >
          <TabelaProdutos produtos={doEscolhido} colunas={colunas} onAbrir={(p) => setAberto(p.id)} ordenacaoInicial={{ chave: 'valor', dir: 'desc' }} imprimirTudo={imprimindo} chaveReset={escolhido} />
        </Painel>
      )}

      <NegociacaoPainel produtos={escolhido === null ? ativos : doEscolhido} escopo={escolhido} por={por} onAbrir={setAberto} />

      {aberto && <ProdutoDetalheModal id={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}

/**
 * Produtos que podem ser negociados para troca ou devolução: os que a gestão
 * já marcou e os que o sistema sugere (muito estoque + muito tempo desde a
 * última entrada). A sugestão é só uma indicação — marcar é decisão da gestão.
 */
function NegociacaoPainel({ produtos, escopo, por, onAbrir }: { produtos: ProdutoAnalisado[]; escopo: string | null; por: Por; onAbrir: (id: string) => void }) {
  const { config, atualizarProduto, avisar } = useEstoque();
  const [salvando, setSalvando] = useState<string | null>(null);

  const candidatos = useMemo(
    () => ordenarPor(produtos.filter((p) => p.negociarFornecedor || candidatoNegociacao(p, config)), 'valor', 'desc'),
    [produtos, config],
  );

  async function alternar(p: ProdutoAnalisado) {
    setSalvando(p.id);
    try {
      await atualizarProduto(p.id, { negociarFornecedor: !p.negociarFornecedor });
    } catch (e) {
      avisar(mensagemDeErro(e));
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Painel titulo={`Podem ser negociados para troca ou devolução${escopo ? ` — ${escopo}` : ''}`} className="est-nao-imprimir">
      <p className="est-dica">
        Sugestão automática: produtos com {config.faixas.p2Min} unidades ou mais e última entrada há mais de {config.diasAlerta} dias. Marque os que você quer levar para a conversa com o {TEXTOS[por].singular} — a marcação fica salva.
      </p>
      {candidatos.length === 0 ? (
        <p className="est-vazio-grafico">Nenhum produto se encaixa neste critério agora.</p>
      ) : (
        <div className="est-tabela-rolagem">
          <table className="data-table est-tabela">
            <thead>
              <tr>
                <th>Negociar</th>
                <th>Produto</th>
                <th>{por === 'laboratorio' ? 'Laboratório' : 'Fornecedor'}</th>
                <th className="est-direita">Estoque</th>
                <th className="est-direita">Valor</th>
                <th className="est-direita">Dias desde a entrada</th>
                <th>Origem</th>
              </tr>
            </thead>
            <tbody>
              {candidatos.slice(0, LIMITE_NEGOCIACAO).map((p) => (
                <tr key={p.id} className="est-linha" onClick={() => onAbrir(p.id)}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={p.negociarFornecedor} disabled={salvando === p.id} onChange={() => void alternar(p)} aria-label={`Negociar ${p.produto}`} />
                  </td>
                  <td>
                    <strong>{p.produto}</strong>
                  </td>
                  <td>{p[por] ?? <span className="est-nao-informado">{NAO_INFORMADO}</span>}</td>
                  <td className="est-direita">{fmtQuantidade(p.saldo)}</td>
                  <td className="est-direita">{p.valor === null ? <span className="est-nao-informado">{NAO_INFORMADO}</span> : fmtMoeda(p.valor)}</td>
                  <td className="est-direita">{p.dias ?? '—'}</td>
                  <td>{p.negociarFornecedor ? 'Marcado pela gestão' : 'Sugerido'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {candidatos.length > LIMITE_NEGOCIACAO && <p className="est-dica">Mostrando os {LIMITE_NEGOCIACAO} de maior valor, de {fmtInteiro(candidatos.length)}. Escolha um {TEXTOS[por].singular} acima para ver os dele.</p>}
    </Painel>
  );
}
