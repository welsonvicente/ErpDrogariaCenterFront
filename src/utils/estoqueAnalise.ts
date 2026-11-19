import type { ConfigEstoque, ProdutoEstoque, StatusAcao } from '../types/estoque';
import { NAO_INFORMADO, hojeIso } from './estoqueFormat';

/** Valores de fábrica — os mesmos do backend (`CONFIG_ESTOQUE_PADRAO`). Usados antes de a configuração carregar. */
export const CONFIG_PADRAO: ConfigEstoque = {
  faixas: { p1Min: 20, p2Min: 10, p3Min: 5, p4Min: 1 },
  diasAlerta: 180,
  diasCritico: 365,
  estoqueElevadoMin: 50,
  margemMinimaPct: 20,
  pesos: { quantidade: 50, valor: 30, tempo: 20 },
  nomesGrupos: {},
};

// ------------------------------------------------------------------ prioridade

export type CodigoPrioridade = 'P1' | 'P2' | 'P3' | 'P4' | 'SEM';

export const CODIGOS_PRIORIDADE: CodigoPrioridade[] = ['P1', 'P2', 'P3', 'P4', 'SEM'];

export const NOME_PRIORIDADE: Record<CodigoPrioridade, string> = {
  P1: 'Imediata',
  P2: 'Alta',
  P3: 'Média',
  P4: 'Rotina',
  SEM: 'Sem prioridade',
};

/** Saldo → faixa. Abaixo do mínimo de P4 (ou sem saldo) fica fora da priorização. */
export function classificarPrioridade(saldo: number | null, faixas: ConfigEstoque['faixas']): CodigoPrioridade {
  if (saldo === null || !Number.isFinite(saldo)) return 'SEM';
  if (saldo >= faixas.p1Min) return 'P1';
  if (saldo >= faixas.p2Min) return 'P2';
  if (saldo >= faixas.p3Min) return 'P3';
  if (saldo >= faixas.p4Min) return 'P4';
  return 'SEM';
}

/** Texto da regra de cada faixa, pra legendas ("20 ou mais", "10 a 19"...). */
export function descricaoFaixa(codigo: CodigoPrioridade, faixas: ConfigEstoque['faixas']): string {
  switch (codigo) {
    case 'P1':
      return `${faixas.p1Min} ou mais unid.`;
    case 'P2':
      return `${faixas.p2Min} a ${faixas.p1Min - 1} unid.`;
    case 'P3':
      return `${faixas.p3Min} a ${faixas.p2Min - 1} unid.`;
    case 'P4':
      return `${faixas.p4Min} a ${faixas.p3Min - 1} unid.`;
    default:
      return `menos de ${faixas.p4Min} unid.`;
  }
}

// ----------------------------------------------------------------------- datas

/**
 * Dias corridos entre a data da última entrada e hoje. Trabalha com o calendário
 * (UTC das duas pontas), não com horas, então o fuso e o horário de verão não
 * deslocam o resultado. Data futura (erro de digitação no Trier) vira 0.
 */
export function diasDesde(iso: string | null, hoje: Date): number | null {
  if (!iso) return null;
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  const dias = Math.floor((Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()) - Date.UTC(a, m - 1, d)) / 86_400_000);
  return Math.max(0, dias);
}

export interface FaixaTempo {
  chave: string;
  rotulo: string;
}

/** Períodos "desde a última entrada" — as bordas vêm da configuração (alerta/crítico) mais um corte fixo em 90 dias. */
export function faixasDeTempo(config: ConfigEstoque): Array<FaixaTempo & { max: number }> {
  const bordas = [...new Set([90, config.diasAlerta, config.diasCritico])].sort((a, b) => a - b);
  const faixas = bordas.map((max, i) => ({
    chave: `T${i}`,
    max,
    rotulo: i === 0 ? `Até ${max} dias` : `${bordas[i - 1] + 1} a ${max} dias`,
  }));
  faixas.push({ chave: `T${bordas.length}`, max: Infinity, rotulo: `Mais de ${bordas[bordas.length - 1]} dias` });
  return faixas;
}

export const CHAVE_SEM_DATA = 'SD';

function chaveFaixaTempo(dias: number | null, faixas: Array<FaixaTempo & { max: number }>): string {
  if (dias === null) return CHAVE_SEM_DATA;
  return (faixas.find((f) => dias <= f.max) ?? faixas[faixas.length - 1]).chave;
}

// -------------------------------------------------------------------- análise

/**
 * Nome de exibição do grupo: "Suplementos (30)" quando a gestão nomeou o código, senão o
 * próprio valor do relatório. Tudo que agrupa/filtra por grupo usa esse texto.
 */
export function nomeDoGrupo(grupo: string | null, nomes: Record<string, string>): string | null {
  if (!grupo) return null;
  const nome = nomes[grupo];
  return nome ? `${nome} (${grupo})` : grupo;
}

export interface ProdutoAnalisado extends ProdutoEstoque {
  /** Valor original da coluna Grupo do relatório (no Trier, um código). `grupo` passa a ser o nome de exibição. */
  grupoCodigo: string | null;
  prioridade: CodigoPrioridade;
  /** Dias desde a última entrada (não é "dias sem vender" — o relatório não diz isso). */
  dias: number | null;
  /** Capital em estoque: o valor do relatório, ou saldo × custo quando o relatório não trouxe o total. */
  valor: number | null;
  faixaTempo: string;
  elevado: boolean;
  atrasada: boolean;
  /** 0–100, composição ponderada de quantidade, valor e tempo. */
  pontuacao: number | null;
  /** Posição no ranking composto entre os produtos ativos com saldo (1 = maior prioridade). */
  ranking: number | null;
}

export function valorEmEstoque(p: Pick<ProdutoEstoque, 'valorTotal' | 'saldo' | 'custoUnitario'>): number | null {
  if (p.valorTotal !== null) return p.valorTotal;
  if (p.saldo !== null && p.custoUnitario !== null) return p.saldo * p.custoUnitario;
  return null;
}

const STATUS_ENCERRADOS: StatusAcao[] = ['CONCLUIDO', 'NAO_APLICAVEL'];

export function estaAtrasada(p: Pick<ProdutoEstoque, 'prazo' | 'statusAcao'>, hoje: Date): boolean {
  return !!p.prazo && p.prazo < hojeIso(hoje) && !STATUS_ENCERRADOS.includes(p.statusAcao);
}

function limiteInferior(ordenado: number[], v: number): number {
  let lo = 0;
  let hi = ordenado.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (ordenado[meio] < v) lo = meio + 1;
    else hi = meio;
  }
  return lo;
}

function limiteSuperior(ordenado: number[], v: number): number {
  let lo = 0;
  let hi = ordenado.length;
  while (lo < hi) {
    const meio = (lo + hi) >> 1;
    if (ordenado[meio] <= v) lo = meio + 1;
    else hi = meio;
  }
  return lo;
}

/**
 * Posição relativa (0–1) de cada valor dentro do conjunto, com empates no meio
 * da faixa. Usa percentil em vez de "valor ÷ máximo" porque um único produto
 * muito caro esmagaria todos os outros contra zero. Valor ausente fica em 0 —
 * não sabemos, então não pontua.
 */
function percentis(valores: Array<number | null>): number[] {
  const presentes = valores.filter((v): v is number => v !== null).sort((a, b) => a - b);
  const n = presentes.length;
  return valores.map((v) => {
    if (v === null || n === 0) return 0;
    if (n === 1) return 1;
    const abaixo = limiteInferior(presentes, v);
    const iguais = limiteSuperior(presentes, v) - abaixo;
    return (abaixo + (iguais - 1) / 2) / (n - 1);
  });
}

export function analisar(produtos: ProdutoEstoque[], config: ConfigEstoque, hoje: Date = new Date()): ProdutoAnalisado[] {
  const faixas = faixasDeTempo(config);

  const base = produtos.map((p): ProdutoAnalisado => {
    const dias = diasDesde(p.dataUltimaEntrada, hoje);
    return {
      ...p,
      grupoCodigo: p.grupo,
      grupo: nomeDoGrupo(p.grupo, config.nomesGrupos ?? {}),
      prioridade: classificarPrioridade(p.saldo, config.faixas),
      dias,
      valor: valorEmEstoque(p),
      faixaTempo: chaveFaixaTempo(dias, faixas),
      elevado: p.saldo !== null && p.saldo >= config.estoqueElevadoMin,
      atrasada: estaAtrasada(p, hoje),
      pontuacao: null,
      ranking: null,
    };
  });

  // O ranking só existe entre os produtos que ainda estão no relatório e têm saldo.
  const ranqueaveis = base.filter((p) => p.ativo && p.saldo !== null && p.saldo > 0);
  const pq = percentis(ranqueaveis.map((p) => p.saldo));
  const pv = percentis(ranqueaveis.map((p) => p.valor));
  const pt = percentis(ranqueaveis.map((p) => p.dias));
  const { quantidade: wq, valor: wv, tempo: wt } = config.pesos;
  const somaPesos = wq + wv + wt || 1;

  ranqueaveis.forEach((p, i) => {
    p.pontuacao = ((wq * pq[i] + wv * pv[i] + wt * pt[i]) / somaPesos) * 100;
  });
  [...ranqueaveis]
    .sort((a, b) => (b.pontuacao ?? 0) - (a.pontuacao ?? 0) || (b.valor ?? 0) - (a.valor ?? 0) || (b.saldo ?? 0) - (a.saldo ?? 0) || a.produto.localeCompare(b.produto, 'pt-BR'))
    .forEach((p, i) => {
      p.ranking = i + 1;
    });

  return base;
}

// ----------------------------------------------------------------- ordenação

export type CriterioRanking = 'pontuacao' | 'saldo' | 'valor' | 'dias';

export const ROTULO_CRITERIO_RANKING: Record<CriterioRanking, string> = {
  pontuacao: 'Pontuação combinada',
  saldo: 'Maior quantidade em estoque',
  valor: 'Maior valor investido',
  dias: 'Mais tempo desde a última entrada',
};

/** Reordena a lista pelo critério escolhido (decrescente), desempatando por valor, quantidade e nome. */
export function ordenarRanking(lista: ProdutoAnalisado[], criterio: CriterioRanking): ProdutoAnalisado[] {
  const num = (v: number | null) => v ?? -1;
  return [...lista].sort(
    (a, b) =>
      num(b[criterio]) - num(a[criterio]) ||
      num(b.valor) - num(a.valor) ||
      num(b.saldo) - num(a.saldo) ||
      a.produto.localeCompare(b.produto, 'pt-BR'),
  );
}

export type Direcao = 'asc' | 'desc';

/** Ordenação genérica de coluna: vazio ("não informado") sempre no fim, nas duas direções. */
export function ordenarPor<T extends object>(lista: T[], chave: keyof T, direcao: Direcao): T[] {
  const sinal = direcao === 'asc' ? 1 : -1;
  return [...lista].sort((a, b) => {
    const va = a[chave] as unknown;
    const vb = b[chave] as unknown;
    const vazioA = va === null || va === undefined || va === '';
    const vazioB = vb === null || vb === undefined || vb === '';
    if (vazioA || vazioB) return vazioA === vazioB ? 0 : vazioA ? 1 : -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sinal;
    if (typeof va === 'boolean' && typeof vb === 'boolean') return (Number(va) - Number(vb)) * sinal;
    return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sinal;
  });
}

// -------------------------------------------------------------------- filtros

export function normalizar(texto: string | null | undefined): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export type SituacaoAcao = 'pendentes' | 'atrasadas' | 'andamento' | 'concluidas';

export interface FiltrosProduto {
  busca?: string;
  laboratorio?: string;
  fornecedor?: string;
  grupo?: string;
  prioridade?: CodigoPrioridade | '';
  saldoMin?: number | null;
  saldoMax?: number | null;
  faixaTempo?: string;
  /** Só produtos com mais de N dias desde a última entrada (quem não tem data fica de fora). */
  diasMin?: number | null;
  status?: StatusAcao | '';
  situacao?: SituacaoAcao | '';
  /** 'ativos' = só o que está no relatório atual (padrão); 'fora' = o que saiu dele; 'todos'. */
  visao?: 'ativos' | 'fora' | 'todos';
  somenteNegociar?: boolean;
}

/** Valor que representa "sem laboratório/fornecedor/grupo" nos filtros e agrupamentos. */
export const SEM_INFORMACAO = NAO_INFORMADO;

function rotuloOuNulo(valor: string | null): string {
  return valor ?? SEM_INFORMACAO;
}

export function pertenceSituacao(p: ProdutoAnalisado, situacao: SituacaoAcao): boolean {
  switch (situacao) {
    case 'pendentes':
      return p.statusAcao === 'NAO_INICIADO' || p.statusAcao === 'PLANEJADO';
    case 'andamento':
      return p.statusAcao === 'EM_ANDAMENTO';
    case 'concluidas':
      return p.statusAcao === 'CONCLUIDO';
    case 'atrasadas':
      return p.atrasada;
  }
}

export function filtrarProdutos(lista: ProdutoAnalisado[], f: FiltrosProduto): ProdutoAnalisado[] {
  const busca = normalizar(f.busca);
  const visao = f.visao ?? 'ativos';

  return lista.filter((p) => {
    if (visao === 'ativos' && !p.ativo) return false;
    if (visao === 'fora' && p.ativo) return false;
    if (busca) {
      const alvo = normalizar(`${p.produto} ${p.codigoTrier} ${p.codigoBarras ?? ''} ${p.laboratorio ?? ''} ${p.fornecedor ?? ''}`);
      if (!busca.split(/\s+/).every((termo) => alvo.includes(termo))) return false;
    }
    if (f.laboratorio && rotuloOuNulo(p.laboratorio) !== f.laboratorio) return false;
    if (f.fornecedor && rotuloOuNulo(p.fornecedor) !== f.fornecedor) return false;
    if (f.grupo && rotuloOuNulo(p.grupo) !== f.grupo) return false;
    if (f.prioridade && p.prioridade !== f.prioridade) return false;
    if (f.saldoMin !== null && f.saldoMin !== undefined && (p.saldo ?? -Infinity) < f.saldoMin) return false;
    if (f.saldoMax !== null && f.saldoMax !== undefined && (p.saldo ?? Infinity) > f.saldoMax) return false;
    if (f.faixaTempo && p.faixaTempo !== f.faixaTempo) return false;
    if (f.diasMin !== null && f.diasMin !== undefined && (p.dias === null || p.dias <= f.diasMin)) return false;
    if (f.status && p.statusAcao !== f.status) return false;
    if (f.situacao && !pertenceSituacao(p, f.situacao)) return false;
    if (f.somenteNegociar && !p.negociarFornecedor) return false;
    return true;
  });
}

// ------------------------------------------------------------------ agregações

export interface Totais {
  produtos: number;
  unidades: number;
  /** Capital investido (só dos produtos com valor conhecido). */
  valor: number;
  /** Quantos produtos ficaram de fora da soma de valor por não terem custo/valor no relatório. */
  semValor: number;
  acimaAlerta: number;
  acimaCritico: number;
  imediatos: number;
  elevados: number;
  valorImediatos: number;
}

export function calcularTotais(lista: ProdutoAnalisado[], config: ConfigEstoque): Totais {
  const t: Totais = { produtos: lista.length, unidades: 0, valor: 0, semValor: 0, acimaAlerta: 0, acimaCritico: 0, imediatos: 0, elevados: 0, valorImediatos: 0 };
  for (const p of lista) {
    t.unidades += p.saldo ?? 0;
    if (p.valor === null) t.semValor += 1;
    else t.valor += p.valor;
    if (p.dias !== null && p.dias > config.diasAlerta) t.acimaAlerta += 1;
    if (p.dias !== null && p.dias > config.diasCritico) t.acimaCritico += 1;
    if (p.prioridade === 'P1') {
      t.imediatos += 1;
      t.valorImediatos += p.valor ?? 0;
    }
    if (p.elevado) t.elevados += 1;
  }
  return t;
}

export interface ResumoAgrupado {
  chave: string;
  produtos: number;
  unidades: number;
  valor: number;
  semValor: number;
  imediatos: number;
  negociaveis: number;
}

/** Agrupa por laboratório/fornecedor/grupo (ou qualquer chave). Quem não tem a informação vai pro grupo "Não informado". */
export function agruparPor(lista: ProdutoAnalisado[], seletor: (p: ProdutoAnalisado) => string | null): ResumoAgrupado[] {
  const mapa = new Map<string, ResumoAgrupado>();
  for (const p of lista) {
    const chave = seletor(p) ?? SEM_INFORMACAO;
    let g = mapa.get(chave);
    if (!g) {
      g = { chave, produtos: 0, unidades: 0, valor: 0, semValor: 0, imediatos: 0, negociaveis: 0 };
      mapa.set(chave, g);
    }
    g.produtos += 1;
    g.unidades += p.saldo ?? 0;
    if (p.valor === null) g.semValor += 1;
    else g.valor += p.valor;
    if (p.prioridade === 'P1') g.imediatos += 1;
    if (p.negociarFornecedor) g.negociaveis += 1;
  }
  return [...mapa.values()].sort((a, b) => b.valor - a.valor || b.unidades - a.unidades || a.chave.localeCompare(b.chave, 'pt-BR'));
}

export function contarPor<K extends string>(lista: ProdutoAnalisado[], seletor: (p: ProdutoAnalisado) => K): Map<K, { produtos: number; valor: number }> {
  const mapa = new Map<K, { produtos: number; valor: number }>();
  for (const p of lista) {
    const k = seletor(p);
    const atual = mapa.get(k) ?? { produtos: 0, valor: 0 };
    atual.produtos += 1;
    atual.valor += p.valor ?? 0;
    mapa.set(k, atual);
  }
  return mapa;
}

/** Valores distintos (ordenados) de um campo, pros seletores de filtro. */
export function valoresDistintos(lista: ProdutoAnalisado[], seletor: (p: ProdutoAnalisado) => string | null): string[] {
  const set = new Set<string>();
  for (const p of lista) set.add(seletor(p) ?? SEM_INFORMACAO);
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

// ------------------------------------------------------------------ simulador

export interface EntradaSimulacao {
  custo: number | null;
  precoAtual: number | null;
  novoPreco: number | null;
  quantidade: number | null;
}

export interface ResultadoSimulacao {
  margemAtual: number | null;
  margemNova: number | null;
  lucroUnitarioAtual: number | null;
  lucroUnitarioNovo: number | null;
  receita: number | null;
  resultadoBruto: number | null;
  descontoPct: number | null;
  abaixoDoCusto: boolean;
  abaixoDaMargemMinima: boolean;
}

/** Margem bruta sobre o preço de venda: (preço − custo) ÷ preço. */
export function margemBruta(preco: number | null, custo: number | null): number | null {
  if (preco === null || custo === null || preco <= 0) return null;
  return ((preco - custo) / preco) * 100;
}

export function simular(e: EntradaSimulacao, margemMinimaPct: number): ResultadoSimulacao {
  const { custo, precoAtual, novoPreco, quantidade } = e;
  const lucroUnitarioNovo = novoPreco !== null && custo !== null ? novoPreco - custo : null;
  const margemNova = margemBruta(novoPreco, custo);
  return {
    margemAtual: margemBruta(precoAtual, custo),
    margemNova,
    lucroUnitarioAtual: precoAtual !== null && custo !== null ? precoAtual - custo : null,
    lucroUnitarioNovo,
    receita: novoPreco !== null && quantidade !== null ? novoPreco * quantidade : null,
    resultadoBruto: lucroUnitarioNovo !== null && quantidade !== null ? lucroUnitarioNovo * quantidade : null,
    descontoPct: precoAtual !== null && novoPreco !== null && precoAtual > 0 ? ((precoAtual - novoPreco) / precoAtual) * 100 : null,
    abaixoDoCusto: novoPreco !== null && custo !== null && novoPreco < custo,
    abaixoDaMargemMinima: margemNova !== null && margemNova < margemMinimaPct,
  };
}
