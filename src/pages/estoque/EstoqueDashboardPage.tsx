import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CabecalhoImpressao, COR_PRIORIDADE, Kpi, Painel, SemDados, useImpressao } from '../../components/estoque/Elementos';
import { GraficoBarras, GraficoRosca, type Barra } from '../../components/estoque/Graficos';
import { ProdutoDetalheModal } from '../../components/estoque/ProdutoDetalheModal';
import { TabelaProdutos } from '../../components/estoque/TabelaProdutos';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import {
  CODIGOS_PRIORIDADE,
  NOME_PRIORIDADE,
  agruparPor,
  calcularTotais,
  contarPor,
  descricaoFaixa,
  faixasDeTempo,
  ordenarRanking,
  CHAVE_SEM_DATA,
  type FiltrosProduto,
} from '../../utils/estoqueAnalise';
import { NOME_ARQUIVO_DEMONSTRACAO } from '../../utils/estoqueImportacao';
import { fmtDataHora, fmtInteiro, fmtMoeda, fmtQuantidade } from '../../utils/estoqueFormat';
import { consultaDeFiltros } from '../../utils/estoqueUrl';

type Metrica = 'unidades' | 'valor';

/** Dashboard: o que está parado, quanto dinheiro isso representa e por onde começar. Clicar num gráfico abre a lista filtrada. */
export function EstoqueDashboardPage() {
  useDocumentTitle('Inteligência de Estoque');
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { analisados, config, ultimaImportacao } = useEstoque();
  const { imprimindo, imprimir } = useImpressao();
  const [metrica, setMetrica] = useState<Metrica>('unidades');
  const [aberto, setAberto] = useState<string | null>(null);

  const ativos = useMemo(() => analisados.filter((p) => p.ativo), [analisados]);
  const totais = useMemo(() => calcularTotais(ativos, config), [ativos, config]);
  const base = `/${orgSlug}/gerente/estoque`;
  const irParaProdutos = (f: FiltrosProduto) => navigate(`${base}/produtos${consultaDeFiltros(f)}`);

  const porPrioridade = useMemo(() => contarPor(ativos, (p) => p.prioridade), [ativos]);
  const faixas = useMemo(() => faixasDeTempo(config), [config]);
  const porTempo = useMemo(() => contarPor(ativos, (p) => p.faixaTempo), [ativos]);
  const laboratorios = useMemo(() => agruparPor(ativos, (p) => p.laboratorio), [ativos]);
  const grupos = useMemo(() => agruparPor(ativos, (p) => p.grupo), [ativos]);
  const atencao = useMemo(() => ordenarRanking(ativos.filter((p) => p.prioridade === 'P1'), 'pontuacao').slice(0, 10), [ativos]);

  if (!analisados.length) return <SemDados />;

  const barrasPrioridade: Barra[] = CODIGOS_PRIORIDADE.filter((c) => c !== 'SEM' || porPrioridade.has('SEM')).map((c) => ({
    chave: c,
    rotulo: c === 'SEM' ? 'Sem prioridade' : `${c} · ${NOME_PRIORIDADE[c]}`,
    valor: porPrioridade.get(c)?.produtos ?? 0,
    cor: COR_PRIORIDADE[c],
    detalhe: descricaoFaixa(c, config.faixas),
  }));
  const fatiasCapital: Barra[] = CODIGOS_PRIORIDADE.filter((c) => (porPrioridade.get(c)?.valor ?? 0) > 0).map((c) => ({
    chave: c,
    rotulo: c === 'SEM' ? 'Sem prioridade' : `${c} · ${NOME_PRIORIDADE[c]}`,
    valor: porPrioridade.get(c)?.valor ?? 0,
    cor: COR_PRIORIDADE[c],
    detalhe: `${porPrioridade.get(c)?.produtos ?? 0} produtos`,
  }));
  const barrasTempo: Barra[] = [...faixas.map((f) => ({ chave: f.chave, rotulo: f.rotulo })), { chave: CHAVE_SEM_DATA, rotulo: 'Sem data informada' }]
    .map((f, i, todas) => ({
      chave: f.chave,
      rotulo: f.rotulo,
      valor: porTempo.get(f.chave)?.produtos ?? 0,
      cor: `color-mix(in srgb, var(--late) ${Math.round((i / Math.max(1, todas.length - 2)) * 70 + 20)}%, #c3cfcc)`,
      detalhe: fmtMoeda(porTempo.get(f.chave)?.valor ?? 0),
    }))
    .filter((b) => b.valor > 0 || b.chave !== CHAVE_SEM_DATA);

  const topo = (lista: typeof laboratorios): Barra[] =>
    [...lista]
      .sort((a, b) => b[metrica] - a[metrica])
      .slice(0, 10)
      .map((g) => ({ chave: g.chave, rotulo: g.chave, valor: g[metrica], detalhe: `${g.produtos} produtos · ${fmtQuantidade(g.unidades)} unid. · ${fmtMoeda(g.valor)}` }));
  const formatarMetrica = metrica === 'valor' ? fmtMoeda : fmtQuantidade;
  const alternador = (
    <div className="est-alternador" role="group" aria-label="Métrica">
      <button type="button" className={metrica === 'unidades' ? 'ativo' : ''} onClick={() => setMetrica('unidades')}>
        Unidades
      </button>
      <button type="button" className={metrica === 'valor' ? 'ativo' : ''} onClick={() => setMetrica('valor')}>
        Capital
      </button>
    </div>
  );

  const ehDemonstracao = ultimaImportacao?.nomeArquivo.startsWith(NOME_ARQUIVO_DEMONSTRACAO);

  return (
    <div className="est-pagina">
      <CabecalhoImpressao titulo="Dashboard de estoque parado" />

      {ehDemonstracao && (
        <div className="est-alerta est-alerta-aviso est-nao-imprimir" role="status">
          🧪 Os dados abaixo são de <strong>demonstração</strong> (fictícios). Para usar o relatório real, importe o arquivo do Trier no modo <strong>“Substituir tudo”</strong>.{' '}
          <Link to={`${base}/importar`}>Ir para a importação</Link>
        </div>
      )}

      <div className="est-barra-topo est-nao-imprimir">
        <p className="est-dica">
          {ultimaImportacao ? (
            <>
              Dados de <strong>{ultimaImportacao.nomeArquivo}</strong> · importados em {fmtDataHora(ultimaImportacao.criadoEm)}
              {ultimaImportacao.usuarioNome ? ` por ${ultimaImportacao.usuarioNome}` : ''}
            </>
          ) : (
            'Sem importação registrada.'
          )}
        </p>
        <button type="button" className="btn-ghost" onClick={imprimir}>
          🖨️ Imprimir
        </button>
      </div>

      <div className="est-kpis">
        <Kpi titulo="Produtos analisados" valor={fmtInteiro(totais.produtos)} aoClicar={() => irParaProdutos({})} />
        <Kpi titulo="Unidades em estoque" valor={fmtQuantidade(totais.unidades)} />
        <Kpi
          titulo="Capital investido (custo)"
          valor={fmtMoeda(totais.valor)}
          apoio={totais.semValor ? `${fmtInteiro(totais.semValor)} produto(s) sem custo informado ficaram fora da soma` : undefined}
          destaque
        />
        <Kpi
          titulo={`Última entrada há mais de ${config.diasAlerta} dias`}
          valor={fmtInteiro(totais.acimaAlerta)}
          apoio="Tempo desde a última entrada, não de vendas"
          aoClicar={() => irParaProdutos({ diasMin: config.diasAlerta })}
        />
        <Kpi titulo={`Última entrada há mais de ${config.diasCritico} dias`} valor={fmtInteiro(totais.acimaCritico)} aoClicar={() => irParaProdutos({ diasMin: config.diasCritico })} />
        <Kpi titulo="Prioridade imediata (P1)" valor={fmtInteiro(totais.imediatos)} apoio={descricaoFaixa('P1', config.faixas)} aoClicar={() => irParaProdutos({ prioridade: 'P1' })} destaque />
        <Kpi titulo="Estoque elevado" valor={fmtInteiro(totais.elevados)} apoio={`${fmtQuantidade(config.estoqueElevadoMin)} unidades ou mais`} aoClicar={() => irParaProdutos({ saldoMin: config.estoqueElevadoMin })} />
        <Kpi titulo="Capital nos de maior prioridade" valor={fmtMoeda(totais.valorImediatos)} apoio="Soma dos produtos P1" destaque aoClicar={() => irParaProdutos({ prioridade: 'P1' })} />
      </div>

      <div className="est-graficos">
        <Painel titulo="Produtos por faixa de prioridade">
          <GraficoBarras barras={barrasPrioridade} formatar={fmtInteiro} onClique={(b) => irParaProdutos({ prioridade: b.chave as FiltrosProduto['prioridade'] })} />
        </Painel>
        <Painel titulo="Capital investido por faixa de prioridade">
          <GraficoRosca
            fatias={fatiasCapital}
            formatar={fmtMoeda}
            centro={{ titulo: 'Total', valor: fmtMoeda(fatiasCapital.reduce((s, f) => s + f.valor, 0)) }}
            onClique={(f) => irParaProdutos({ prioridade: f.chave as FiltrosProduto['prioridade'] })}
          />
        </Painel>
        <Painel titulo="Produtos por período desde a última entrada">
          <GraficoBarras barras={barrasTempo} formatar={fmtInteiro} onClique={(b) => irParaProdutos({ faixaTempo: b.chave })} />
        </Painel>
        <Painel titulo="Estoque por laboratório (10 maiores)" acoes={alternador}>
          <GraficoBarras orientacao="horizontal" barras={topo(laboratorios)} formatar={formatarMetrica} onClique={(b) => irParaProdutos({ laboratorio: b.chave })} />
        </Painel>
        <Painel titulo="Estoque por grupo de produtos (10 maiores)" acoes={alternador} className="est-painel-largo">
          <GraficoBarras orientacao="horizontal" barras={topo(grupos)} formatar={formatarMetrica} onClique={(b) => irParaProdutos({ grupo: b.chave })} />
        </Painel>
      </div>

      <Painel
        titulo="Exigem atenção imediata"
        acoes={
          <Link className="btn-ghost est-link-botao est-nao-imprimir" to={`${base}/produtos${consultaDeFiltros({ prioridade: 'P1' })}`}>
            Ver todos os P1
          </Link>
        }
      >
        <TabelaProdutos
          produtos={atencao}
          colunas={['ranking', 'prioridade', 'produto', 'laboratorio', 'saldo', 'valor', 'dias', 'status']}
          onAbrir={(p) => setAberto(p.id)}
          ordenavel={false}
          imprimirTudo={imprimindo}
          vazio="Nenhum produto na faixa de prioridade imediata."
        />
      </Painel>

      {aberto && <ProdutoDetalheModal id={aberto} onFechar={() => setAberto(null)} />}
    </div>
  );
}
