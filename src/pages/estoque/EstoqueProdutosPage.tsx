import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarraLote } from '../../components/estoque/BarraLote';
import { CabecalhoImpressao, SemDados, useImpressao } from '../../components/estoque/Elementos';
import { FiltrosProdutos } from '../../components/estoque/FiltrosProdutos';
import { ProdutoDetalheModal } from '../../components/estoque/ProdutoDetalheModal';
import { TabelaProdutos, type IdColuna } from '../../components/estoque/TabelaProdutos';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { calcularTotais, filtrarProdutos, type FiltrosProduto } from '../../utils/estoqueAnalise';
import { baixarCsv } from '../../utils/estoqueExport';
import { fmtInteiro, fmtMoeda, fmtQuantidade } from '../../utils/estoqueFormat';
import { descreverFiltros, filtrosDaUrl, filtrosParaUrl } from '../../utils/estoqueUrl';

const COLUNAS: IdColuna[] = ['ranking', 'prioridade', 'codigo', 'barras', 'produto', 'laboratorio', 'grupo', 'fornecedor', 'saldo', 'custo', 'valor', 'ultimaEntrada', 'mesAno', 'dias', 'status', 'acao'];

/** Tabela completa: busca, filtros combinados (guardados na URL), ordenação por coluna, seleção, edição em lote, impressão. */
export function EstoqueProdutosPage() {
  useDocumentTitle('Produtos — Estoque');
  const [params, setParams] = useSearchParams();
  const filtros = useMemo(() => filtrosDaUrl(params), [params]);
  const mudarFiltros = (f: FiltrosProduto) => setParams(filtrosParaUrl(f), { replace: true });

  const { analisados, config } = useEstoque();
  const { imprimindo, imprimir } = useImpressao();
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);

  const filtrados = useMemo(() => filtrarProdutos(analisados, filtros), [analisados, filtros]);
  const totais = useMemo(() => calcularTotais(filtrados, config), [filtrados, config]);

  if (!analisados.length) return <SemDados />;

  return (
    <div className="est-pagina">
      <CabecalhoImpressao titulo="Lista de produtos" detalhe={descreverFiltros(filtros)} />

      <div className="est-nao-imprimir">
        <FiltrosProdutos valor={filtros} onChange={mudarFiltros} />
      </div>

      <div className="est-barra-topo">
        <p className="est-resumo-filtro">
          <strong>{fmtInteiro(filtrados.length)}</strong> produto(s) · {fmtQuantidade(totais.unidades)} unidades · {fmtMoeda(totais.valor)} investidos
          {totais.semValor > 0 && <small> ({fmtInteiro(totais.semValor)} sem custo informado)</small>}
        </p>
        <div className="est-barra-botoes est-nao-imprimir">
          <button type="button" className="btn-ghost" onClick={() => baixarCsv(filtrados)} disabled={!filtrados.length}>
            ⬇️ Exportar CSV
          </button>
          <button type="button" className="btn-ghost" onClick={imprimir} disabled={!filtrados.length}>
            🖨️ Imprimir
          </button>
        </div>
      </div>

      <div className="est-nao-imprimir">
        <BarraLote selecionados={selecionados} onSelecionados={setSelecionados} filtrados={filtrados} />
      </div>

      <div className="card est-tabela-card">
        <TabelaProdutos
          produtos={filtrados}
          colunas={COLUNAS}
          onAbrir={(p) => setAberto(p.id)}
          selecionados={selecionados}
          onSelecionados={setSelecionados}
          ordenacaoInicial={{ chave: 'ranking', dir: 'asc' }}
          imprimirTudo={imprimindo}
          chaveReset={params.toString()}
        />
      </div>

      {aberto && <ProdutoDetalheModal id={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}
