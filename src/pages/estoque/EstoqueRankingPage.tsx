import { useMemo, useState } from 'react';
import { CabecalhoImpressao, Painel, SemDados, useImpressao } from '../../components/estoque/Elementos';
import { FiltrosProdutos } from '../../components/estoque/FiltrosProdutos';
import { ProdutoDetalheModal } from '../../components/estoque/ProdutoDetalheModal';
import { TabelaProdutos } from '../../components/estoque/TabelaProdutos';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { ROTULO_CRITERIO_RANKING, filtrarProdutos, ordenarRanking, type CriterioRanking, type FiltrosProduto } from '../../utils/estoqueAnalise';

const LIMITES = [
  { valor: 25, rotulo: 'Top 25' },
  { valor: 50, rotulo: 'Top 50' },
  { valor: 100, rotulo: 'Top 100' },
  { valor: 0, rotulo: 'Todos' },
];

/** Ranking de prioridades: a mesma base de produtos, ordenada pelo critério que a gestão escolher. */
export function EstoqueRankingPage() {
  useDocumentTitle('Ranking de prioridades');
  const { analisados, config } = useEstoque();
  const { imprimindo, imprimir } = useImpressao();
  const [criterio, setCriterio] = useState<CriterioRanking>('pontuacao');
  const [limite, setLimite] = useState(50);
  const [filtros, setFiltros] = useState<FiltrosProduto>({});
  const [aberto, setAberto] = useState<string | null>(null);

  const lista = useMemo(() => {
    const ranqueaveis = filtrarProdutos(analisados, filtros).filter((p) => p.ranking !== null);
    const ordenada = ordenarRanking(ranqueaveis, criterio).map((p, i) => ({ ...p, ranking: i + 1 }));
    return limite ? ordenada.slice(0, limite) : ordenada;
  }, [analisados, filtros, criterio, limite]);

  if (!analisados.length) return <SemDados />;

  const { quantidade, valor, tempo } = config.pesos;
  const soma = quantidade + valor + tempo || 1;
  const pct = (n: number) => `${Math.round((n / soma) * 100)}%`;

  return (
    <div className="est-pagina">
      <CabecalhoImpressao titulo={`Ranking de prioridades — ${ROTULO_CRITERIO_RANKING[criterio]}`} />

      <div className="est-nao-imprimir">
        <FiltrosProdutos valor={filtros} onChange={setFiltros} campos={['busca', 'laboratorio', 'fornecedor', 'grupo', 'prioridade']} />
      </div>

      <Painel
        titulo="Ranking"
        acoes={
          <div className="est-barra-botoes est-nao-imprimir">
            <label className="est-inline">
              Ordenar por
              <select value={criterio} onChange={(e) => setCriterio(e.target.value as CriterioRanking)}>
                {(Object.keys(ROTULO_CRITERIO_RANKING) as CriterioRanking[]).map((c) => (
                  <option key={c} value={c}>
                    {ROTULO_CRITERIO_RANKING[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="est-inline">
              Mostrar
              <select value={limite} onChange={(e) => setLimite(Number(e.target.value))}>
                {LIMITES.map((l) => (
                  <option key={l.valor} value={l.valor}>
                    {l.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn-ghost" onClick={imprimir}>
              🖨️ Imprimir
            </button>
          </div>
        }
      >
        <p className="est-dica">
          A <strong>pontuação</strong> combina a posição de cada produto em quantidade ({pct(quantidade)}), valor investido ({pct(valor)}) e tempo desde a última entrada ({pct(tempo)}) — os pesos ficam em Configurações. A coluna “#” é a
          posição na ordenação escolhida acima.
        </p>
        <TabelaProdutos
          produtos={lista}
          colunas={['ranking', 'pontuacao', 'prioridade', 'produto', 'laboratorio', 'fornecedor', 'saldo', 'valor', 'dias', 'status']}
          onAbrir={(p) => setAberto(p.id)}
          ordenavel={false}
          imprimirTudo={imprimindo}
          chaveReset={JSON.stringify([filtros, criterio, limite])}
        />
      </Painel>

      {aberto && <ProdutoDetalheModal id={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}
