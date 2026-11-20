import { textoDaAnotacao, type Anotacoes } from './anotacoes';
import type { Auditoria, LinhaAuditoria, Resultado } from './auditoria';
import type { PedidoCota, RelatorioTrier } from './tipos';

/**
 * Modelo único do relatório da crítica: cada bloco da tela (os filtros da
 * tabela, o financeiro, as listas A e B, as providências) vira uma `SecaoRel`, e
 * é dela que saem a imagem, o PDF e o Excel — assim os três formatos mostram
 * exatamente a mesma coisa.
 */

export type Formato = 'png' | 'pdf' | 'xlsx';
export type FormatoNumero = 'moeda' | 'qtd' | 'pct';

export interface CelulaRel {
  /** Texto exibido (já formatado em pt-BR). */
  t: string;
  /** Valor numérico, quando a célula é número — o Excel grava como número de verdade. */
  n?: number | null;
  fmt?: FormatoNumero;
  /** Cor do texto (#RRGGBB). */
  cor?: string;
  negrito?: boolean;
}
export type Cel = string | CelulaRel;

export interface ColunaRel {
  rotulo: string;
  /** Largura relativa entre as colunas. */
  peso: number;
  alinhar?: 'esq' | 'dir' | 'centro';
}

export interface LinhaRel {
  celulas: Cel[];
  /** Faixa colorida à esquerda da linha (cor do resultado). */
  faixa?: string;
  negrito?: boolean;
}

export interface SecaoRel {
  id: string;
  titulo: string;
  /** Nome curto da aba no Excel / parte do nome do arquivo. */
  nomeCurto: string;
  nota?: string;
  colunas: ColunaRel[];
  linhas: LinhaRel[];
  total?: LinhaRel;
}

export interface DocumentoRel {
  titulo: string;
  /** Linhas de contexto sob o título (pedido, distribuidora, período). */
  contexto: string[];
  /** Veredito destacado (opcional). */
  veredito?: { texto: string; cor: string };
  secoes: SecaoRel[];
}

export const COR_RESULTADO: Record<Resultado, string> = {
  OK: '#1E9E6B',
  ATENCAO: '#B58900',
  DIVERGENCIA: '#E30613',
  EXTRA: '#2B7BE8',
  AUSENTE: '#E8892B',
  NAO_CONFIRMADO: '#7E8F8C',
};

export const ROTULO_RESULTADO_PLANO: Record<Resultado, string> = {
  OK: 'OK',
  ATENCAO: 'ATENÇÃO',
  DIVERGENCIA: 'DIVERGÊNCIA',
  EXTRA: 'EXTRA NO TRIER',
  AUSENTE: 'AUSENTE NO TRIER',
  NAO_CONFIRMADO: 'NÃO CONFIRMADO',
};

const TITULO_FILTRO: Record<Resultado | 'TODOS', string> = {
  TODOS: 'Todos os itens',
  DIVERGENCIA: 'Divergências',
  AUSENTE: 'Ausentes no Trier',
  NAO_CONFIRMADO: 'Não confirmados',
  ATENCAO: 'Atenção',
  EXTRA: 'Extras no Trier',
  OK: 'Itens OK',
};

const moeda = (v: number | null): Cel => (v === null ? '—' : { t: v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), n: Math.round(v * 100) / 100, fmt: 'moeda' });
const moedaSinal = (v: number | null): Cel => {
  if (v === null) return '—';
  const abs = Math.abs(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  return { t: `${v > 0 ? '+' : v < 0 ? '-' : ''}${abs}`, n: Math.round(v * 100) / 100, fmt: 'moeda' };
};
const quantidade = (v: number | null): Cel => (v === null ? '—' : { t: v.toLocaleString('pt-BR', { maximumFractionDigits: 3 }), n: v, fmt: 'qtd' });
const quantidadeSinal = (v: number | null): Cel => (v === null ? '—' : { t: `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}`, n: v, fmt: 'qtd' });

// ------------------------------------------------------------------ seções

function linhaDaAuditoria(l: LinhaAuditoria, anotacoes: Anotacoes): LinhaRel {
  const impacto = l.resultado === 'OK' || l.resultado === 'ATENCAO' || l.resultado === 'DIVERGENCIA' ? (l.impactoPreco ?? 0) + (l.impactoQtd ?? 0) : null;
  const dif = l.difUnitaria === null ? '—' : moedaSinal(l.difUnitaria);
  return {
    faixa: COR_RESULTADO[l.resultado],
    celulas: [
      { t: l.produto, negrito: true },
      quantidade(l.qtdCota),
      quantidade(l.qtdTrier),
      quantidadeSinal(l.difQtd),
      moeda(l.precoCota),
      moeda(l.precoTrier),
      dif,
      moedaSinal(impacto),
      { t: ROTULO_RESULTADO_PLANO[l.resultado], cor: COR_RESULTADO[l.resultado], negrito: true },
      l.observacoes.join(' '),
      textoDaAnotacao(anotacoes[l.chave]),
    ],
  };
}

const COLUNAS_AUDITORIA: ColunaRel[] = [
  { rotulo: 'Produto', peso: 4 },
  { rotulo: 'Qtd. CotaPreço', peso: 1, alinhar: 'dir' },
  { rotulo: 'Qtd. Trier', peso: 1, alinhar: 'dir' },
  { rotulo: 'Dif. Qtd.', peso: 1, alinhar: 'dir' },
  { rotulo: 'Preço CotaPreço', peso: 1.3, alinhar: 'dir' },
  { rotulo: 'Preço Trier', peso: 1.3, alinhar: 'dir' },
  { rotulo: 'Dif. unitária', peso: 1.3, alinhar: 'dir' },
  { rotulo: 'Impacto (R$)', peso: 1.3, alinhar: 'dir' },
  { rotulo: 'Resultado', peso: 1.8 },
  { rotulo: 'Observação', peso: 4.5 },
  { rotulo: 'Motivo / anotação', peso: 4 },
];

export function secaoAuditoria(a: Auditoria, filtro: Resultado | 'TODOS', anotacoes: Anotacoes = {}): SecaoRel {
  const linhas = filtro === 'TODOS' ? a.linhas : a.linhas.filter((l) => l.resultado === filtro);
  return {
    id: `auditoria-${filtro}`,
    titulo: `Auditoria — ${TITULO_FILTRO[filtro]} (${linhas.length})`,
    nomeCurto: filtro === 'TODOS' ? 'Auditoria' : TITULO_FILTRO[filtro],
    colunas: COLUNAS_AUDITORIA,
    linhas: linhas.map((l) => linhaDaAuditoria(l, anotacoes)),
  };
}

export function secaoFinanceiro(a: Auditoria): SecaoRel {
  const f = a.financeiro;
  const par = (rotulo: string, valor: Cel, negrito = false): LinhaRel => ({ celulas: [rotulo, valor], negrito });
  return {
    id: 'financeiro',
    titulo: 'Conferência financeira',
    nomeCurto: 'Financeiro',
    nota: 'Os totais globais só são comparáveis depois de separar o que é produto diferente — por isso as parcelas.',
    colunas: [
      { rotulo: 'Item', peso: 6 },
      { rotulo: 'Valor', peso: 2.5, alinhar: 'dir' },
    ],
    linhas: [
      par('Pedido no CotaPreço (impresso)', moeda(f.totalCotaDeclarado)),
      par('Pedido no CotaPreço (soma dos itens)', moeda(f.totalCotaItens)),
      par('Registrado no Trier (bruto)', moeda(f.totalTrierBruto)),
      par('Registrado no Trier (líquido)', moeda(f.totalTrierLiquido)),
      par('Diferença (Trier bruto − pedido)', moedaSinal(f.diferencaTotal), true),
      par('Produtos correspondentes — no pedido', moeda(f.correspondentesCota)),
      par('Produtos correspondentes — no Trier', moeda(f.correspondentesTrier)),
      par('Diferença de preço', moedaSinal(f.efeitoPreco)),
      par('Diferença de quantidade', moedaSinal(f.efeitoQuantidade)),
      par('Arredondamento do unitário no Trier', moedaSinal(f.arredondamentoUnitario)),
      par('Produtos extras no Trier', moedaSinal(f.extrasTrier)),
      par('Produtos ausentes no Trier (pedidos)', moedaSinal(-f.ausentesCota)),
      par('Não confirmados (Trier − pedido)', moedaSinal(f.naoConfirmadosTrier - f.naoConfirmadosCota)),
      par('Parte não explicada', Math.abs(f.naoExplicada) <= 0.011 ? 'nenhuma' : moedaSinal(f.naoExplicada), true),
      par('Descontos/rateio do Trier (bruto − líquido)', moedaSinal(f.descontosEArredondamentos)),
    ],
  };
}

export function secaoAusentes(a: Auditoria, anotacoes: Anotacoes = {}): SecaoRel {
  const ausentes = a.linhas.filter((l) => l.resultado === 'AUSENTE');
  return {
    id: 'ausentes',
    titulo: `A) No CotaPreço, mas não aparecem no Trier (${ausentes.length})`,
    nomeCurto: 'Lista A - Ausentes',
    colunas: [
      { rotulo: 'Produto', peso: 5 },
      { rotulo: 'Qtd. pedida', peso: 1.2, alinhar: 'dir' },
      { rotulo: 'Preço unitário', peso: 1.4, alinhar: 'dir' },
      { rotulo: 'Valor total', peso: 1.4, alinhar: 'dir' },
      { rotulo: 'Situação', peso: 3 },
      { rotulo: 'Motivo / anotação', peso: 4 },
    ],
    linhas: ausentes.map((l) => ({
      faixa: COR_RESULTADO.AUSENTE,
      celulas: [{ t: l.produto, negrito: true }, quantidade(l.qtdCota), moeda(l.precoCota), moeda(l.valorCota), 'Ausente — conferir nota, entrega e lançamento', textoDaAnotacao(anotacoes[l.chave])],
    })),
    total: ausentes.length ? { negrito: true, celulas: ['Total', '', '', moeda(a.financeiro.ausentesCota), '', ''] } : undefined,
  };
}

export function secaoExtras(a: Auditoria, anotacoes: Anotacoes = {}): SecaoRel {
  const extras = a.linhas.filter((l) => l.resultado === 'EXTRA');
  return {
    id: 'extras',
    titulo: `B) No Trier, mas não estão no CotaPreço (${extras.length})`,
    nomeCurto: 'Lista B - Extras',
    colunas: [
      { rotulo: 'Produto', peso: 5 },
      { rotulo: 'Código Trier', peso: 1.2 },
      { rotulo: 'Qtd. registrada', peso: 1.2, alinhar: 'dir' },
      { rotulo: 'Custo unitário', peso: 1.4, alinhar: 'dir' },
      { rotulo: 'Valor total', peso: 1.4, alinhar: 'dir' },
      { rotulo: 'Situação', peso: 3 },
      { rotulo: 'Motivo / anotação', peso: 4 },
    ],
    linhas: extras.map((l) => ({
      faixa: COR_RESULTADO.EXTRA,
      celulas: [{ t: l.produto, negrito: true }, l.trier[0]?.codigo ?? '', quantidade(l.qtdTrier), moeda(l.precoTrier), moeda(l.valorTrier), 'Investigar: outro pedido, bonificação ou lançamento adicional', textoDaAnotacao(anotacoes[l.chave])],
    })),
    total: extras.length ? { negrito: true, celulas: ['Total', '', '', '', moeda(a.financeiro.extrasTrier), '', ''] } : undefined,
  };
}

export function secaoProvidencias(a: Auditoria): SecaoRel {
  const cor = { alta: COR_RESULTADO.DIVERGENCIA, media: COR_RESULTADO.AUSENTE, baixa: COR_RESULTADO.ATENCAO } as const;
  const rotulo = { alta: 'Alta', media: 'Média', baixa: 'Baixa' } as const;
  return {
    id: 'providencias',
    titulo: `Providências (${a.providencias.length})`,
    nomeCurto: 'Providências',
    colunas: [
      { rotulo: 'Prioridade', peso: 1.2 },
      { rotulo: 'Providência', peso: 10 },
    ],
    linhas: a.providencias.map((p) => ({ faixa: cor[p.nivel], celulas: [{ t: rotulo[p.nivel], cor: cor[p.nivel], negrito: true }, p.texto] })),
  };
}

const VEREDITO_TEXTO = { APROVADO: 'APROVADO', APROVADO_COM_RESSALVAS: 'APROVADO COM RESSALVAS', REPROVADO: 'REPROVADO / COM DIVERGÊNCIAS' } as const;
const VEREDITO_COR = { APROVADO: COR_RESULTADO.OK, APROVADO_COM_RESSALVAS: COR_RESULTADO.ATENCAO, REPROVADO: COR_RESULTADO.DIVERGENCIA } as const;

function contexto(pedido: PedidoCota, relatorio: RelatorioTrier): string[] {
  return [
    [pedido.distribuidora, pedido.numero && `Pedido ${pedido.numero}`, pedido.cotacao].filter(Boolean).join(' · ') || 'Pedido do CotaPreço',
    [relatorio.filial, relatorio.periodo && `Trier: ${relatorio.periodo}`, relatorio.fornecedor && `Fornecedor: ${relatorio.fornecedor}`].filter(Boolean).join(' · ') || 'Relatório do Trier',
  ];
}

/** Embrulha um bloco só (o que a pessoa baixou) num documento com o contexto da crítica e o veredito. */
export function documentoDaSecao(secao: SecaoRel, a: Auditoria, pedido: PedidoCota, relatorio: RelatorioTrier): DocumentoRel {
  return { titulo: 'Crítica de pedido', contexto: contexto(pedido, relatorio), veredito: { texto: VEREDITO_TEXTO[a.veredito], cor: VEREDITO_COR[a.veredito] }, secoes: [secao] };
}

function secaoResumo(a: Auditoria): SecaoRel {
  const nomes: Array<[Resultado, string]> = [
    ['DIVERGENCIA', 'Divergências'],
    ['AUSENTE', 'Ausentes no Trier'],
    ['NAO_CONFIRMADO', 'Não confirmados'],
    ['ATENCAO', 'Atenção'],
    ['EXTRA', 'Extras no Trier'],
    ['OK', 'OK'],
  ];
  return {
    id: 'resumo',
    titulo: 'Resumo da auditoria',
    nomeCurto: 'Resumo',
    nota: a.justificativa,
    colunas: [
      { rotulo: 'Situação', peso: 6 },
      { rotulo: 'Itens', peso: 2, alinhar: 'dir' },
    ],
    linhas: nomes.map(([r, rotulo]) => ({ faixa: COR_RESULTADO[r], celulas: [{ t: rotulo, cor: COR_RESULTADO[r], negrito: true }, { t: String(a.contagens[r]), n: a.contagens[r] }] })),
    total: { negrito: true, celulas: ['Total de itens auditados', { t: String(a.linhas.length), n: a.linhas.length }] },
  };
}

/** O relatório inteiro: resumo, financeiro, tabela completa, listas A e B e providências. */
export function documentoCompleto(a: Auditoria, pedido: PedidoCota, relatorio: RelatorioTrier, anotacoes: Anotacoes = {}): DocumentoRel {
  return {
    titulo: 'Crítica de pedido',
    contexto: contexto(pedido, relatorio),
    veredito: { texto: VEREDITO_TEXTO[a.veredito], cor: VEREDITO_COR[a.veredito] },
    secoes: [secaoResumo(a), secaoFinanceiro(a), secaoAuditoria(a, 'TODOS', anotacoes), secaoAusentes(a, anotacoes), secaoExtras(a, anotacoes), secaoProvidencias(a)],
  };
}

export function textoDaCelula(c: Cel): string {
  return typeof c === 'string' ? c : c.t;
}

/** Nome de arquivo seguro: "critica-PED-C000080-D000762-financeiro". */
export function nomeDoArquivo(pedido: PedidoCota, secao: string): string {
  const limpo = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  return ['critica', pedido.numero ? limpo(pedido.numero) : 'pedido', limpo(secao)].filter(Boolean).join('-');
}
