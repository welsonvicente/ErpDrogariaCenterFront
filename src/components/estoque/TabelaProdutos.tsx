import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useEstoque } from '../../context/EstoqueContext';
import { mensagemDeErro } from '../../services/estoqueService';
import { STATUS_ACAO_LABEL, STATUS_ACAO_ORDEM, type StatusAcao } from '../../types/estoque';
import { acaoEfetiva } from '../../utils/estoqueAcoes';
import { ordenarPor, type Direcao, type ProdutoAnalisado } from '../../utils/estoqueAnalise';
import { NAO_INFORMADO, fmtData, fmtMesAno, fmtMoeda, fmtQuantidade } from '../../utils/estoqueFormat';
import { SeloPrioridade } from './Elementos';

export type IdColuna =
  | 'ranking'
  | 'pontuacao'
  | 'prioridade'
  | 'codigo'
  | 'barras'
  | 'produto'
  | 'laboratorio'
  | 'grupo'
  | 'fornecedor'
  | 'saldo'
  | 'custo'
  | 'valor'
  | 'ultimaEntrada'
  | 'mesAno'
  | 'dias'
  | 'status'
  | 'acao'
  | 'objetivo'
  | 'responsavel'
  | 'prazo';

interface ContextoCelula {
  mudarStatus: (p: ProdutoAnalisado, status: StatusAcao) => void;
  salvando: string | null;
  diasCritico: number;
  configAcao: (p: ProdutoAnalisado) => ReturnType<typeof acaoEfetiva>;
}

interface DefinicaoColuna {
  titulo: string;
  /** Campo usado pra ordenar ao clicar no título (sem isso a coluna não ordena). */
  chave?: keyof ProdutoAnalisado;
  alinhar?: 'direita';
  celula: (p: ProdutoAnalisado, c: ContextoCelula) => ReactNode;
}

const texto = (v: string | null) => (v ? v : <span className="est-nao-informado">{NAO_INFORMADO}</span>);

const COLUNAS: Record<IdColuna, DefinicaoColuna> = {
  ranking: { titulo: '#', chave: 'ranking', alinhar: 'direita', celula: (p) => p.ranking ?? '—' },
  pontuacao: { titulo: 'Pontuação', chave: 'pontuacao', alinhar: 'direita', celula: (p) => (p.pontuacao === null ? '—' : p.pontuacao.toFixed(0)) },
  prioridade: { titulo: 'Prioridade', chave: 'saldo', celula: (p) => <SeloPrioridade prioridade={p.prioridade} /> },
  codigo: { titulo: 'Código Trier', chave: 'codigoTrier', celula: (p) => <code>{p.codigoTrier}</code> },
  barras: { titulo: 'Cód. barras', chave: 'codigoBarras', celula: (p) => texto(p.codigoBarras) },
  produto: {
    titulo: 'Produto',
    chave: 'produto',
    celula: (p) => (
      <>
        <strong>{p.produto}</strong>
        {!p.ativo && <span className="est-fora-relatorio">fora do relatório</span>}
      </>
    ),
  },
  laboratorio: { titulo: 'Laboratório', chave: 'laboratorio', celula: (p) => texto(p.laboratorio) },
  grupo: { titulo: 'Grupo', chave: 'grupo', celula: (p) => texto(p.grupo) },
  fornecedor: { titulo: 'Fornecedor', chave: 'fornecedor', celula: (p) => texto(p.fornecedor) },
  saldo: { titulo: 'Estoque', chave: 'saldo', alinhar: 'direita', celula: (p) => fmtQuantidade(p.saldo) },
  custo: { titulo: 'Custo unit.', chave: 'custoUnitario', alinhar: 'direita', celula: (p) => (p.custoUnitario === null ? texto(null) : fmtMoeda(p.custoUnitario)) },
  valor: { titulo: 'Valor em estoque', chave: 'valor', alinhar: 'direita', celula: (p) => (p.valor === null ? texto(null) : fmtMoeda(p.valor)) },
  ultimaEntrada: { titulo: 'Última entrada', chave: 'dataUltimaEntrada', celula: (p) => (p.dataUltimaEntrada ? fmtData(p.dataUltimaEntrada) : texto(null)) },
  mesAno: { titulo: 'Mês/ano', chave: 'dataUltimaEntrada', celula: (p) => (p.dataUltimaEntrada ? fmtMesAno(p.dataUltimaEntrada) : texto(null)) },
  dias: {
    titulo: 'Dias desde a entrada',
    chave: 'dias',
    alinhar: 'direita',
    celula: (p, c) => (p.dias === null ? texto(null) : <span className={p.dias > c.diasCritico ? 'est-dias-critico' : undefined}>{p.dias}</span>),
  },
  status: {
    titulo: 'Status da ação',
    chave: 'statusAcao',
    celula: (p, c) => (
      <select
        className={`est-status-select est-status-${p.statusAcao.toLowerCase()}`}
        value={p.statusAcao}
        disabled={c.salvando === p.id}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => c.mudarStatus(p, e.target.value as StatusAcao)}
        aria-label={`Status da ação de ${p.produto}`}
      >
        {STATUS_ACAO_ORDEM.map((s) => (
          <option key={s} value={s}>
            {STATUS_ACAO_LABEL[s]}
          </option>
        ))}
      </select>
    ),
  },
  acao: { titulo: 'Ação recomendada', celula: (p, c) => <span className="est-truncado" title={c.configAcao(p).acaoRecomendada}>{c.configAcao(p).acaoRecomendada}</span> },
  objetivo: { titulo: 'Objetivo', celula: (p, c) => <span className="est-truncado" title={c.configAcao(p).objetivo}>{c.configAcao(p).objetivo}</span> },
  responsavel: { titulo: 'Responsável', chave: 'responsavel', celula: (p) => texto(p.responsavel) },
  prazo: {
    titulo: 'Prazo',
    chave: 'prazo',
    celula: (p) => (p.prazo ? <span className={p.atrasada ? 'est-dias-critico' : undefined}>{fmtData(p.prazo)}{p.atrasada ? ' (atrasada)' : ''}</span> : texto(null)),
  },
};

const LIMITE_IMPRESSAO = 3000;

/**
 * Arranjo das colunas (ordem e escondidas) de cada tabela, guardado neste navegador.
 * A chave é o conjunto padrão de colunas da tela — cada tela (Produtos, Ranking…) tem o seu.
 */
interface ArranjoColunas {
  ordem: IdColuna[];
  ocultas: IdColuna[];
}

function chaveArranjo(padrao: IdColuna[]) {
  return `est_colunas_v1_${padrao.join(',')}`;
}

function lerArranjo(padrao: IdColuna[]): ArranjoColunas {
  try {
    const salvo = JSON.parse(localStorage.getItem(chaveArranjo(padrao)) || 'null') as ArranjoColunas | null;
    if (!salvo) return { ordem: padrao, ocultas: [] };
    // Só colunas que esta tela tem; coluna nova (que não existia quando salvou) entra no fim.
    const ordem = salvo.ordem.filter((id) => padrao.includes(id));
    return { ordem: [...ordem, ...padrao.filter((id) => !ordem.includes(id))], ocultas: salvo.ocultas.filter((id) => padrao.includes(id)) };
  } catch {
    return { ordem: padrao, ocultas: [] };
  }
}

interface Props {
  produtos: ProdutoAnalisado[];
  colunas: IdColuna[];
  onAbrir: (p: ProdutoAnalisado) => void;
  /** Quando informados, a tabela mostra a coluna de seleção. */
  selecionados?: Set<string>;
  onSelecionados?: (ids: Set<string>) => void;
  ordenacaoInicial?: { chave: keyof ProdutoAnalisado; dir: Direcao };
  /** false = a ordem vem de fora (ex.: ranking por critério) e os títulos não ordenam. */
  ordenavel?: boolean;
  /** Impressão: mostra todas as linhas em vez da página atual. */
  imprimirTudo?: boolean;
  vazio?: ReactNode;
  /** Muda quando os filtros/ordem de fora mudam: a tabela volta pra primeira página. (Editar um produto NÃO deve mudar isto.) */
  chaveReset?: string;
}

export function TabelaProdutos({ produtos, colunas, onAbrir, selecionados, onSelecionados, ordenacaoInicial, ordenavel = true, imprimirTudo, vazio, chaveReset = '' }: Props) {
  const { config, atualizarProduto, avisar } = useEstoque();
  const [ordenacao, setOrdenacao] = useState(ordenacaoInicial ?? null);
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(50);
  const [salvando, setSalvando] = useState<string | null>(null);

  // Colunas arrastáveis e escondíveis (o padrão da tela continua sendo `colunas`; o "↺ Padrão" volta a ele).
  const [arranjo, setArranjo] = useState<ArranjoColunas>(() => lerArranjo(colunas));
  const [arrastando, setArrastando] = useState<IdColuna | null>(null);
  const [alvoArraste, setAlvoArraste] = useState<IdColuna | null>(null);
  const [menuColunas, setMenuColunas] = useState(false);
  const visiveisColunas = arranjo.ordem.filter((id) => !arranjo.ocultas.includes(id));

  function guardarArranjo(novo: ArranjoColunas) {
    setArranjo(novo);
    try {
      localStorage.setItem(chaveArranjo(colunas), JSON.stringify(novo));
    } catch {
      /* sem localStorage: vale só até sair da tela */
    }
  }
  function esconder(id: IdColuna) {
    if (visiveisColunas.length <= 1) return avisar('Deixe pelo menos uma coluna na tabela.');
    guardarArranjo({ ...arranjo, ocultas: [...arranjo.ocultas, id] });
  }
  function alternarColuna(id: IdColuna) {
    if (arranjo.ocultas.includes(id)) guardarArranjo({ ...arranjo, ocultas: arranjo.ocultas.filter((o) => o !== id) });
    else esconder(id);
  }
  function soltarEm(alvo: IdColuna) {
    if (!arrastando || arrastando === alvo) return;
    const ordem = arranjo.ordem.filter((id) => id !== arrastando);
    ordem.splice(ordem.indexOf(alvo), 0, arrastando);
    guardarArranjo({ ...arranjo, ordem });
  }
  const arranjoPadrao = arranjo.ocultas.length === 0 && arranjo.ordem.join() === colunas.join();

  // Barra de rolagem lateral presa no rodapé da tela: a tabela é larga e a barra dela só aparecia
  // no fim da lista. As duas ficam sincronizadas (mexer numa move a outra).
  const rolagemRef = useRef<HTMLDivElement>(null);
  const barraRef = useRef<HTMLDivElement>(null);
  const [larguraConteudo, setLarguraConteudo] = useState(0);
  const [precisaBarra, setPrecisaBarra] = useState(false);
  useEffect(() => {
    const caixa = rolagemRef.current;
    if (!caixa) return;
    const medir = () => {
      setLarguraConteudo(caixa.scrollWidth);
      setPrecisaBarra(caixa.scrollWidth > caixa.clientWidth + 1);
    };
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(caixa);
    if (caixa.firstElementChild) observador.observe(caixa.firstElementChild);
    return () => observador.disconnect();
  });
  const sincronizando = useRef(false);
  function sincronizar(origem: HTMLDivElement | null, destino: HTMLDivElement | null) {
    if (!origem || !destino || sincronizando.current) return;
    sincronizando.current = true;
    destino.scrollLeft = origem.scrollLeft;
    requestAnimationFrame(() => {
      sincronizando.current = false;
    });
  }

  // Filtro novo → primeira página. Feito durante o render (padrão "estado derivado") e não num efeito, pra não custar um render extra.
  const [chaveAnterior, setChaveAnterior] = useState(chaveReset);
  if (chaveAnterior !== chaveReset) {
    setChaveAnterior(chaveReset);
    setPagina(0);
  }

  const ordenados = useMemo(() => (ordenavel && ordenacao ? ordenarPor(produtos, ordenacao.chave, ordenacao.dir) : produtos), [produtos, ordenacao, ordenavel]);
  const totalPaginas = Math.max(1, Math.ceil(ordenados.length / porPagina));

  // A lista pode encolher (edição que tira o produto do filtro): nunca ficar numa página que deixou de existir.
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = imprimirTudo ? ordenados.slice(0, LIMITE_IMPRESSAO) : ordenados.slice(paginaAtual * porPagina, (paginaAtual + 1) * porPagina);

  const contexto: ContextoCelula = {
    salvando,
    diasCritico: config.diasCritico,
    configAcao: (p) => acaoEfetiva(p, config),
    async mudarStatus(p, status) {
      setSalvando(p.id);
      try {
        await atualizarProduto(p.id, { statusAcao: status });
      } catch (e) {
        avisar(mensagemDeErro(e));
      } finally {
        setSalvando(null);
      }
    },
  };

  function ordenarPorColuna(def: DefinicaoColuna) {
    if (!ordenavel || !def.chave) return;
    const chave = def.chave;
    setPagina(0);
    setOrdenacao((atual) => (atual && atual.chave === chave ? { chave, dir: atual.dir === 'asc' ? 'desc' : 'asc' } : { chave, dir: 'asc' }));
  }

  const paginaInteiraSelecionada = !!selecionados && visiveis.length > 0 && visiveis.every((p) => selecionados.has(p.id));
  function alternarPagina() {
    if (!selecionados || !onSelecionados) return;
    const novo = new Set(selecionados);
    for (const p of visiveis) {
      if (paginaInteiraSelecionada) novo.delete(p.id);
      else novo.add(p.id);
    }
    onSelecionados(novo);
  }
  function alternarUm(id: string) {
    if (!selecionados || !onSelecionados) return;
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    onSelecionados(novo);
  }

  if (!produtos.length) return <div className="est-tabela-vazio">{vazio ?? 'Nenhum produto encontrado com os filtros atuais.'}</div>;

  return (
    <>
      <div className="est-colunas-barra">
        <span className="est-dica">Arraste o título de uma coluna para mudar de lugar · × no título esconde.</span>
        <div className="est-colunas-menu">
          <button type="button" className="btn-ghost" aria-expanded={menuColunas} onClick={() => setMenuColunas((v) => !v)}>
            ⚙️ Colunas{arranjo.ocultas.length > 0 ? ` (${arranjo.ocultas.length} escondida${arranjo.ocultas.length > 1 ? 's' : ''})` : ''}
          </button>
          {menuColunas && (
            <div className="est-colunas-painel" role="dialog" aria-label="Colunas da tabela">
              {arranjo.ordem.map((id) => (
                <label key={id}>
                  <input type="checkbox" checked={!arranjo.ocultas.includes(id)} onChange={() => alternarColuna(id)} /> {COLUNAS[id].titulo}
                </label>
              ))}
              <div className="est-colunas-painel-acoes">
                <button type="button" className="btn-ghost" disabled={arranjoPadrao} onClick={() => guardarArranjo({ ordem: colunas, ocultas: [] })}>↺ Padrão</button>
                <button type="button" className="btn-ghost" onClick={() => setMenuColunas(false)}>Fechar</button>
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="est-tabela-rolagem" ref={rolagemRef} onScroll={() => sincronizar(rolagemRef.current, barraRef.current)}>
        <table className="data-table est-tabela">
          <thead>
            <tr>
              {selecionados && (
                <th className="est-col-check">
                  <input type="checkbox" checked={paginaInteiraSelecionada} onChange={alternarPagina} aria-label="Selecionar todos desta página" />
                </th>
              )}
              {visiveisColunas.map((id) => {
                const def = COLUNAS[id];
                const ativa = ordenacao?.chave === def.chave;
                return (
                  <th
                    key={id}
                    draggable
                    className={`est-th-movel ${def.alinhar === 'direita' ? 'est-direita' : ''} ${ordenavel && def.chave ? 'est-ordenavel' : ''}${arrastando === id ? ' arrastando' : ''}${alvoArraste === id && arrastando !== id ? ' alvo' : ''}`}
                    onClick={() => ordenarPorColuna(def)}
                    onDragStart={(e: DragEvent) => {
                      setArrastando(id);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setAlvoArraste(id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      soltarEm(id);
                    }}
                    onDragEnd={() => {
                      setArrastando(null);
                      setAlvoArraste(null);
                    }}
                    title="Arraste para mudar a coluna de lugar"
                    aria-sort={ativa ? (ordenacao?.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {def.titulo}
                    {ordenavel && def.chave && ativa && <span className="est-seta-ordem">{ordenacao?.dir === 'asc' ? ' ▲' : ' ▼'}</span>}
                    <button
                      type="button"
                      className="est-th-esconder"
                      aria-label={`Esconder a coluna ${def.titulo}`}
                      title="Esconder esta coluna (volta pelo ⚙️ Colunas)"
                      onClick={(e) => {
                        e.stopPropagation();
                        esconder(id);
                      }}
                    >
                      ×
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((p) => (
              <tr key={p.id} className={`est-linha ${!p.ativo ? 'est-linha-fora' : ''}`} onClick={() => onAbrir(p)}>
                {selecionados && (
                  <td className="est-col-check" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selecionados.has(p.id)} onChange={() => alternarUm(p.id)} aria-label={`Selecionar ${p.produto}`} />
                  </td>
                )}
                {visiveisColunas.map((id) => (
                  <td key={id} className={COLUNAS[id].alinhar === 'direita' ? 'est-direita' : undefined}>
                    {COLUNAS[id].celula(p, contexto)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {precisaBarra && (
        <div className="est-barra-rolagem" ref={barraRef} onScroll={() => sincronizar(barraRef.current, rolagemRef.current)} aria-hidden="true">
          <div style={{ width: larguraConteudo }} />
        </div>
      )}

      {imprimirTudo && ordenados.length > LIMITE_IMPRESSAO && <p className="est-dica">Impressão limitada aos primeiros {LIMITE_IMPRESSAO} produtos — use os filtros para reduzir a lista.</p>}

      <div className="est-paginacao">
        <span>
          {ordenados.length === 0 ? 0 : paginaAtual * porPagina + 1}–{Math.min(ordenados.length, (paginaAtual + 1) * porPagina)} de {ordenados.length}
        </span>
        <div className="est-paginacao-controles">
          <label>
            Por página{' '}
            <select
              value={porPagina}
              onChange={(e) => {
                setPorPagina(Number(e.target.value));
                setPagina(0);
              }}
            >
              {[25, 50, 100, 200].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-ghost" onClick={() => setPagina(Math.max(0, paginaAtual - 1))} disabled={paginaAtual === 0}>
            ‹ Anterior
          </button>
          <span>
            Página {paginaAtual + 1} de {totalPaginas}
          </span>
          <button type="button" className="btn-ghost" onClick={() => setPagina(Math.min(totalPaginas - 1, paginaAtual + 1))} disabled={paginaAtual >= totalPaginas - 1}>
            Próxima ›
          </button>
        </div>
      </div>
    </>
  );
}
