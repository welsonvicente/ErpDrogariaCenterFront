import { useMemo, useState } from 'react';
import { BarraLote } from '../../components/estoque/BarraLote';
import { CabecalhoImpressao, Kpi, SemDados, useImpressao } from '../../components/estoque/Elementos';
import { FiltrosProdutos, ROTULO_SITUACAO } from '../../components/estoque/FiltrosProdutos';
import { ProdutoDetalheModal } from '../../components/estoque/ProdutoDetalheModal';
import { TabelaProdutos } from '../../components/estoque/TabelaProdutos';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { filtrarProdutos, pertenceSituacao, type FiltrosProduto, type SituacaoAcao } from '../../utils/estoqueAnalise';
import { fmtInteiro } from '../../utils/estoqueFormat';
import { descreverFiltros } from '../../utils/estoqueUrl';

const SITUACOES = Object.keys(ROTULO_SITUACAO) as SituacaoAcao[];

/**
 * Plano de ação comercial: cada produto com a ação sugerida (ou a que a gestão
 * escreveu), responsável, prazo e status. Os cartões do topo são atalhos
 * pros filtros "pendentes / atrasadas / em andamento / concluídas".
 */
export function EstoquePlanoAcaoPage() {
  useDocumentTitle('Plano de ação');
  const { analisados } = useEstoque();
  const { imprimindo, imprimir } = useImpressao();
  const [filtros, setFiltros] = useState<FiltrosProduto>({ situacao: 'pendentes' });
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [aberto, setAberto] = useState<string | null>(null);

  const ativos = useMemo(() => analisados.filter((p) => p.ativo), [analisados]);
  const contagem = useMemo(() => Object.fromEntries(SITUACOES.map((s) => [s, ativos.filter((p) => pertenceSituacao(p, s)).length])) as Record<SituacaoAcao, number>, [ativos]);
  const filtrados = useMemo(() => filtrarProdutos(analisados, filtros), [analisados, filtros]);

  if (!analisados.length) return <SemDados />;

  return (
    <div className="est-pagina">
      <CabecalhoImpressao titulo="Plano de ação comercial" detalhe={descreverFiltros(filtros)} />

      <div className="est-kpis est-kpis-acao est-nao-imprimir">
        {SITUACOES.map((s) => (
          <Kpi
            key={s}
            titulo={ROTULO_SITUACAO[s]}
            valor={fmtInteiro(contagem[s])}
            destaque={s === 'atrasadas' && contagem[s] > 0}
            aoClicar={() => setFiltros((f) => ({ ...f, situacao: f.situacao === s ? '' : s }))}
          />
        ))}
      </div>

      <div className="est-nao-imprimir">
        <FiltrosProdutos valor={filtros} onChange={setFiltros} campos={['busca', 'laboratorio', 'prioridade', 'status', 'situacao', 'negociar']} />
        <BarraLote selecionados={selecionados} onSelecionados={setSelecionados} filtrados={filtrados} />
      </div>

      <div className="est-barra-topo">
        <p className="est-resumo-filtro">
          <strong>{fmtInteiro(filtrados.length)}</strong> produto(s) no plano{filtros.situacao ? ` · ${ROTULO_SITUACAO[filtros.situacao].toLowerCase()}` : ''}
        </p>
        <button type="button" className="btn-ghost est-nao-imprimir" onClick={imprimir} disabled={!filtrados.length}>
          🖨️ Imprimir
        </button>
      </div>

      <div className="card est-tabela-card">
        <TabelaProdutos
          produtos={filtrados}
          colunas={['prioridade', 'produto', 'acao', 'objetivo', 'responsavel', 'prazo', 'status']}
          onAbrir={(p) => setAberto(p.id)}
          selecionados={selecionados}
          onSelecionados={setSelecionados}
          ordenacaoInicial={{ chave: 'ranking', dir: 'asc' }}
          imprimirTudo={imprimindo}
          chaveReset={JSON.stringify(filtros)}
          vazio="Nenhuma ação nesta situação."
        />
      </div>

      {aberto && <ProdutoDetalheModal id={aberto} abaInicial="plano" onFechar={() => setAberto(null)} />}
    </div>
  );
}
