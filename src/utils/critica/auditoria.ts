import { compararProdutos, conflitosDeApresentacao, descrever, type CriterioCasamento } from './produtos';
import { centavos } from './tabelaPdf';
import type { ItemCota, ItemTrier, PedidoCota, RelatorioTrier } from './tipos';

// ------------------------------------------------------------------ tipos

export type Resultado = 'OK' | 'ATENCAO' | 'DIVERGENCIA' | 'EXTRA' | 'AUSENTE' | 'NAO_CONFIRMADO';
export type SituacaoQtd = 'CORRETA' | 'MENOR_NO_TRIER' | 'MAIOR_NO_TRIER' | 'NAO_LOCALIZADO';
export type SituacaoPreco = 'CORRETO' | 'MAIOR_NO_TRIER' | 'MENOR_NO_TRIER' | 'NAO_IDENTIFICADO';
export type Veredito = 'APROVADO' | 'APROVADO_COM_RESSALVAS' | 'REPROVADO';

export interface Tolerancias {
  /** Diferença de preço unitário (R$) tratada como arredondamento. */
  arredondamento: number;
  /** Acima do arredondamento, até aqui (R$ e %) é só "atenção"; além disso é divergência. */
  pequenoReais: number;
  pequenoPct: number;
}

export const TOLERANCIAS_PADRAO: Tolerancias = { arredondamento: 0.01, pequenoReais: 0.05, pequenoPct: 2 };

/**
 * Decisão da pessoa sobre um item do pedido, guardada pelo id do primeiro item do grupo:
 * - confirmar: aceita o candidato sugerido como o mesmo produto;
 * - rejeitar: não é o mesmo produto (o item fica ausente e o candidato vira extra);
 * - vincular: aponta à mão qual(is) linha(s) do Trier correspondem.
 */
export type Decisao = { tipo: 'confirmar' } | { tipo: 'rejeitar' } | { tipo: 'vincular'; trierIds: number[] };
export type Decisoes = Record<number, Decisao>;

export interface LinhaAuditoria {
  /** "c3" (parte do pedido) ou "t7" (só no Trier) — estável entre recálculos. */
  chave: string;
  resultado: Resultado;
  situacaoQtd: SituacaoQtd;
  situacaoPreco: SituacaoPreco;
  produto: string;
  cota: ItemCota[];
  trier: ItemTrier[];
  qtdCota: number | null;
  qtdTrier: number | null;
  difQtd: number | null;
  precoCota: number | null;
  precoTrier: number | null;
  difUnitaria: number | null;
  difPct: number | null;
  /** (preço Trier − preço pedido) × quantidade pedida. */
  impactoPreco: number | null;
  /** (qtd Trier − qtd pedida) × preço Trier. Preço + quantidade somam exatamente a diferença do item. */
  impactoQtd: number | null;
  /**
   * O Trier mostra o unitário com 2 casas, mas o valor bruto vem do custo exato: bruto − (qtd × unitário
   * impresso). Sem isto a conta de preço + quantidade não fecha no centavo.
   */
  arredondamentoTrier: number | null;
  valorCota: number | null;
  valorTrier: number | null;
  /** Diferença entre 0 e a tolerância de arredondamento — aceita, mas vale avisar. */
  dentroDaTolerancia: boolean;
  /** Custo líquido unitário no Trier (valor líquido ÷ quantidade), só informativo. */
  liquidoUnitarioTrier: number | null;
  criterio: CriterioCasamento | 'MANUAL' | null;
  /** Candidato sugerido (resultado NAO_CONFIRMADO). */
  candidato: ItemTrier | null;
  conflitosApresentacao: string[];
  repetidoNoPedido: boolean;
  observacoes: string[];
}

export interface ResumoFinanceiro {
  totalCotaDeclarado: number | null;
  totalCotaItens: number;
  totalTrierBruto: number;
  totalTrierLiquido: number;
  totalTrierLiquidoImpresso: number | null;
  /** Soma dos itens correspondentes: pedido × Trier (bruto). */
  correspondentesCota: number;
  correspondentesTrier: number;
  efeitoPreco: number;
  efeitoQuantidade: number;
  /** Diferença entre o valor bruto do Trier e (qtd × unitário impresso) — o unitário é exibido arredondado. */
  arredondamentoUnitario: number;
  ausentesCota: number;
  extrasTrier: number;
  naoConfirmadosCota: number;
  naoConfirmadosTrier: number;
  /** Bruto − líquido do Trier: descontos, acréscimos de rateio e arredondamentos. */
  descontosEArredondamentos: number;
  /** Trier (bruto) − pedido (itens). */
  diferencaTotal: number;
  /** Diferença que sobra depois de explicar tudo (deve ser 0). */
  naoExplicada: number;
}

export interface Providencia {
  chave: string;
  nivel: 'alta' | 'media' | 'baixa';
  texto: string;
}

export interface Auditoria {
  linhas: LinhaAuditoria[];
  contagens: Record<Resultado, number>;
  financeiro: ResumoFinanceiro;
  veredito: Veredito;
  justificativa: string;
  providencias: Providencia[];
  /** Avisos sobre os próprios documentos (total impresso que não bate com a soma). */
  avisosDosDocumentos: string[];
  /** Linhas do Trier ainda sem par — as que dá pra vincular à mão. */
  trierDisponiveis: ItemTrier[];
}

// ----------------------------------------------------------------- utilitários

const dinheiro = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const com = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + dinheiro(Math.abs(v));
const unidades = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
const pct = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const soma = (valores: number[]) => centavos(valores.reduce((s, v) => s + v, 0));
const EPS = 1e-9;

interface GrupoCota {
  id: number;
  itens: ItemCota[];
}

/** Itens do pedido com a mesma descrição viram um grupo só (o produto foi pedido em duas linhas). */
function agruparCota(itens: ItemCota[]): GrupoCota[] {
  const porNome = new Map<string, GrupoCota>();
  for (const item of itens) {
    const chave = descrever(item.produto).normalizado;
    const grupo = porNome.get(chave);
    if (grupo) grupo.itens.push(item);
    else porNome.set(chave, { id: item.id, itens: [item] });
  }
  return [...porNome.values()];
}

type Par = { trier: ItemTrier[]; criterio: CriterioCasamento | 'MANUAL'; conflitos: string[] };

// -------------------------------------------------------------- casamento

interface Casamento {
  grupos: GrupoCota[];
  pares: Map<number, Par>;
  candidatos: Map<number, { trier: ItemTrier; conflitos: string[] }>;
  usados: Set<number>;
}

function casar(cota: ItemCota[], trier: ItemTrier[], decisoes: Decisoes): Casamento {
  const grupos = agruparCota(cota);
  const descGrupo = new Map(grupos.map((g) => [g.id, descrever(g.itens[0].produto)]));
  const descTrier = new Map(trier.map((t) => [t.id, descrever(t.produto)]));
  const pares = new Map<number, Par>();
  const usados = new Set<number>();

  // 1) Idêntico ou o mesmo nome cortado pelo limite do Trier: confirmado sozinho.
  for (const g of grupos) {
    for (const t of trier) {
      if (usados.has(t.id)) continue;
      const r = compararProdutos(descGrupo.get(g.id)!, descTrier.get(t.id)!);
      if (r && r.criterio !== 'CANDIDATO') {
        const par = pares.get(g.id) ?? { trier: [], criterio: r.criterio, conflitos: [] };
        par.trier.push(t);
        pares.set(g.id, par);
        usados.add(t.id);
      }
    }
  }

  // 2) Vínculos feitos à mão (podem tomar uma linha que ainda não tem par confirmado).
  for (const g of grupos) {
    const d = decisoes[g.id];
    if (d?.tipo !== 'vincular' || pares.has(g.id)) continue;
    const escolhidos = trier.filter((t) => d.trierIds.includes(t.id) && !usados.has(t.id));
    if (!escolhidos.length) continue;
    escolhidos.forEach((t) => usados.add(t.id));
    const conflitos = escolhidos.flatMap((t) => {
      const a = descGrupo.get(g.id)!;
      const b = descTrier.get(t.id)!;
      // Nomes sem relação nenhuma também precisam constar: quem vinculou assumiu que são o mesmo produto.
      return [...(compararProdutos(a, b) ? [] : ['nomes diferentes']), ...conflitosDeApresentacao(a, b)];
    });
    pares.set(g.id, { trier: escolhidos, criterio: 'MANUAL', conflitos });
  }

  // 3) Candidatos: parecidos, mas sem certeza — melhor pontuação primeiro, cada linha uma vez só.
  const propostas: Array<{ grupoId: number; trier: ItemTrier; pontuacao: number; conflitos: string[] }> = [];
  for (const g of grupos) {
    if (pares.has(g.id) || decisoes[g.id]?.tipo === 'rejeitar') continue;
    for (const t of trier) {
      if (usados.has(t.id)) continue;
      const r = compararProdutos(descGrupo.get(g.id)!, descTrier.get(t.id)!);
      if (r?.criterio === 'CANDIDATO') propostas.push({ grupoId: g.id, trier: t, pontuacao: r.pontuacao, conflitos: r.conflitos });
    }
  }
  propostas.sort((a, b) => b.pontuacao - a.pontuacao);
  const candidatos = new Map<number, { trier: ItemTrier; conflitos: string[] }>();
  const candidatosUsados = new Set<number>();
  for (const p of propostas) {
    if (candidatos.has(p.grupoId) || candidatosUsados.has(p.trier.id)) continue;
    candidatos.set(p.grupoId, { trier: p.trier, conflitos: p.conflitos });
    candidatosUsados.add(p.trier.id);
  }

  // 4) "Confirmar" transforma o candidato num par (marcado como manual).
  for (const [grupoId, c] of [...candidatos]) {
    if (decisoes[grupoId]?.tipo === 'confirmar') {
      pares.set(grupoId, { trier: [c.trier], criterio: 'MANUAL', conflitos: c.conflitos });
      usados.add(c.trier.id);
      candidatos.delete(grupoId);
    }
  }

  return { grupos, pares, candidatos, usados };
}

// -------------------------------------------------------------- comparação

function linhaVazia(chave: string, produto: string): LinhaAuditoria {
  return {
    chave,
    resultado: 'OK',
    situacaoQtd: 'NAO_LOCALIZADO',
    situacaoPreco: 'NAO_IDENTIFICADO',
    produto,
    cota: [],
    trier: [],
    qtdCota: null,
    qtdTrier: null,
    difQtd: null,
    precoCota: null,
    precoTrier: null,
    difUnitaria: null,
    difPct: null,
    impactoPreco: null,
    impactoQtd: null,
    arredondamentoTrier: null,
    valorCota: null,
    valorTrier: null,
    dentroDaTolerancia: false,
    liquidoUnitarioTrier: null,
    criterio: null,
    candidato: null,
    conflitosApresentacao: [],
    repetidoNoPedido: false,
    observacoes: [],
  };
}

function linhaCorrespondente(grupo: GrupoCota, par: Par, tol: Tolerancias): LinhaAuditoria {
  const linha = linhaVazia(`c${grupo.id}`, grupo.itens[0].produto);
  const qtdCota = grupo.itens.reduce((s, i) => s + i.qtd, 0);
  const valorCota = soma(grupo.itens.map((i) => i.subtotal));
  const qtdTrier = par.trier.reduce((s, t) => s + t.qtd, 0);
  const valorTrier = soma(par.trier.map((t) => t.bruto));
  const precoCota = qtdCota ? valorCota / qtdCota : 0;
  // Preço do Trier = o Vlr.Unit. impresso (média ponderada quando o produto aparece em mais de uma linha).
  const precoTrier = qtdTrier ? par.trier.reduce((s, t) => s + t.unitario * t.qtd, 0) / qtdTrier : 0;
  const difUnitaria = Math.round((precoTrier - precoCota) * 10000) / 10000;
  const difPct = precoCota ? (difUnitaria / precoCota) * 100 : null;

  Object.assign(linha, {
    cota: grupo.itens,
    trier: par.trier,
    qtdCota,
    qtdTrier,
    difQtd: qtdTrier - qtdCota,
    precoCota,
    precoTrier,
    difUnitaria,
    difPct,
    impactoPreco: (precoTrier - precoCota) * qtdCota,
    impactoQtd: (qtdTrier - qtdCota) * precoTrier,
    arredondamentoTrier: valorTrier - precoTrier * qtdTrier,
    valorCota,
    valorTrier,
    liquidoUnitarioTrier: qtdTrier ? soma(par.trier.map((t) => t.liquido)) / qtdTrier : null,
    criterio: par.criterio,
    conflitosApresentacao: par.conflitos,
    repetidoNoPedido: grupo.itens.length > 1,
  } satisfies Partial<LinhaAuditoria>);

  const dif = linha.difUnitaria ?? 0;
  const absDif = Math.abs(dif);
  linha.situacaoQtd = linha.difQtd === 0 ? 'CORRETA' : (linha.difQtd ?? 0) < 0 ? 'MENOR_NO_TRIER' : 'MAIOR_NO_TRIER';
  linha.dentroDaTolerancia = absDif > EPS && absDif <= tol.arredondamento + EPS;
  linha.situacaoPreco = absDif <= tol.arredondamento + EPS ? 'CORRETO' : dif > 0 ? 'MAIOR_NO_TRIER' : 'MENOR_NO_TRIER';

  const precoPequeno = absDif > tol.arredondamento + EPS && absDif <= tol.pequenoReais + EPS && Math.abs(difPct ?? 0) <= tol.pequenoPct + EPS;
  const precoGrande = absDif > tol.arredondamento + EPS && !precoPequeno;
  const qtdErrada = linha.situacaoQtd !== 'CORRETA';

  linha.resultado = qtdErrada || precoGrande ? 'DIVERGENCIA' : precoPequeno ? 'ATENCAO' : 'OK';

  const obs = linha.observacoes;
  if (grupo.itens.length > 1) obs.push(`Produto repetido no pedido (linhas ${grupo.itens.map((i) => i.id).join(', ')}): somados para comparar.`);
  if (par.trier.length > 1) obs.push(`Aparece ${par.trier.length} vezes no Trier (códigos ${par.trier.map((t) => t.codigo).join(', ')}): somados para comparar.`);
  if (par.criterio === 'NOME_CORTADO') obs.push('Nome do Trier cortado pelo limite de tamanho do relatório.');
  if (par.criterio === 'MANUAL') obs.push('Correspondência confirmada por você.');
  if (par.conflitos.length) {
    obs.push(`Apresentação diferente entre os documentos: ${par.conflitos.join('; ')}.`);
    if (linha.resultado === 'OK') linha.resultado = 'ATENCAO';
  }
  if (qtdErrada) obs.push(`Quantidade ${linha.situacaoQtd === 'MENOR_NO_TRIER' ? 'menor' : 'maior'} no Trier: ${unidades(linha.difQtd ?? 0)} un.`);
  if (linha.situacaoPreco !== 'CORRETO') {
    obs.push(`Preço ${dif > 0 ? 'maior' : 'menor'} no Trier: ${com(dif)} por unidade (${pct(difPct ?? 0)}); impacto ${com(linha.impactoPreco ?? 0)} sobre a quantidade pedida.`);
  } else if (linha.dentroDaTolerancia) {
    obs.push(`Diferença de ${com(dif)} por unidade, dentro da tolerância de arredondamento (R$ ${tol.arredondamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}).`);
  }
  if (linha.liquidoUnitarioTrier !== null && Math.abs(linha.liquidoUnitarioTrier - precoTrier) > 0.005) {
    obs.push(`Custo líquido no Trier: ${dinheiro(linha.liquidoUnitarioTrier)} por unidade (após rateio/descontos).`);
  }
  return linha;
}

function linhaAusente(grupo: GrupoCota): LinhaAuditoria {
  const linha = linhaVazia(`c${grupo.id}`, grupo.itens[0].produto);
  const qtd = grupo.itens.reduce((s, i) => s + i.qtd, 0);
  const valor = soma(grupo.itens.map((i) => i.subtotal));
  Object.assign(linha, {
    resultado: 'AUSENTE' as Resultado,
    cota: grupo.itens,
    qtdCota: qtd,
    precoCota: qtd ? valor / qtd : null,
    valorCota: valor,
    repetidoNoPedido: grupo.itens.length > 1,
    observacoes: ['Pedido no CotaPreço, mas não localizado no relatório do Trier.'],
  } satisfies Partial<LinhaAuditoria>);
  return linha;
}

function linhaNaoConfirmada(grupo: GrupoCota, candidato: { trier: ItemTrier; conflitos: string[] }): LinhaAuditoria {
  const linha = linhaAusente(grupo);
  linha.resultado = 'NAO_CONFIRMADO';
  linha.candidato = candidato.trier;
  linha.conflitosApresentacao = candidato.conflitos;
  linha.criterio = 'CANDIDATO';
  linha.observacoes = [
    `Possível correspondência no Trier: «${candidato.trier.produto}» (código ${candidato.trier.codigo}, ${candidato.trier.qtd} un a ${dinheiro(candidato.trier.unitario)}).`,
    candidato.conflitos.length ? `Apresentação diferente: ${candidato.conflitos.join('; ')}.` : 'As medidas coincidem, mas o nome não é idêntico.',
    'Não foi comparado: confirme se é o mesmo produto.',
  ];
  return linha;
}

function linhaExtra(t: ItemTrier): LinhaAuditoria {
  const linha = linhaVazia(`t${t.id}`, t.produto);
  Object.assign(linha, {
    resultado: 'EXTRA' as Resultado,
    trier: [t],
    qtdTrier: t.qtd,
    precoTrier: t.unitario,
    valorTrier: t.bruto,
    liquidoUnitarioTrier: t.qtd ? t.liquido / t.qtd : null,
    observacoes: ['Lançado no Trier, mas não está no pedido do CotaPreço. Pode ser outro pedido, bonificação ou lançamento adicional — investigar.'],
  } satisfies Partial<LinhaAuditoria>);
  return linha;
}

// --------------------------------------------------------------- auditoria

export function auditar(pedido: PedidoCota, relatorio: RelatorioTrier, tolerancias: Tolerancias = TOLERANCIAS_PADRAO, decisoes: Decisoes = {}): Auditoria {
  const { grupos, pares, candidatos, usados } = casar(pedido.itens, relatorio.itens, decisoes);
  const trierComCandidato = new Set([...candidatos.values()].map((c) => c.trier.id));

  const linhas: LinhaAuditoria[] = grupos.map((g) => {
    const par = pares.get(g.id);
    if (par) return linhaCorrespondente(g, par, tolerancias);
    const candidato = candidatos.get(g.id);
    return candidato ? linhaNaoConfirmada(g, candidato) : linhaAusente(g);
  });
  // Linhas do Trier que sobraram. As que são candidatas de algum item do pedido já aparecem na linha dele.
  for (const t of relatorio.itens) {
    if (!usados.has(t.id) && !trierComCandidato.has(t.id)) linhas.push(linhaExtra(t));
  }

  const ordem: Record<Resultado, number> = { DIVERGENCIA: 0, AUSENTE: 1, NAO_CONFIRMADO: 2, ATENCAO: 3, EXTRA: 4, OK: 5 };
  // Estável: dentro de cada resultado, a ordem do pedido (e depois do Trier) é preservada.
  const ordenadas = linhas.map((l, i) => ({ l, i })).sort((a, b) => ordem[a.l.resultado] - ordem[b.l.resultado] || a.i - b.i).map((x) => x.l);

  const contagens: Record<Resultado, number> = { OK: 0, ATENCAO: 0, DIVERGENCIA: 0, EXTRA: 0, AUSENTE: 0, NAO_CONFIRMADO: 0 };
  for (const l of ordenadas) contagens[l.resultado] += 1;

  const financeiro = resumoFinanceiro(pedido, relatorio, ordenadas);
  const avisosDosDocumentos: string[] = [];
  if (financeiro.totalCotaDeclarado !== null && Math.abs(financeiro.totalCotaDeclarado - financeiro.totalCotaItens) > 0.009) {
    avisosDosDocumentos.push(`O total impresso no CotaPreço (${dinheiro(financeiro.totalCotaDeclarado)}) não bate com a soma dos itens (${dinheiro(financeiro.totalCotaItens)}).`);
  }
  if (financeiro.totalTrierLiquidoImpresso !== null && Math.abs(financeiro.totalTrierLiquidoImpresso - financeiro.totalTrierLiquido) > 0.009) {
    avisosDosDocumentos.push(`O total líquido impresso no Trier (${dinheiro(financeiro.totalTrierLiquidoImpresso)}) não bate com a soma dos itens lidos (${dinheiro(financeiro.totalTrierLiquido)}).`);
  }

  const { veredito, justificativa } = decidirVeredito(contagens, avisosDosDocumentos);
  return {
    linhas: ordenadas,
    contagens,
    financeiro,
    veredito,
    justificativa,
    providencias: providencias(ordenadas, avisosDosDocumentos),
    avisosDosDocumentos,
    trierDisponiveis: relatorio.itens.filter((t) => !usados.has(t.id)),
  };
}

function resumoFinanceiro(pedido: PedidoCota, relatorio: RelatorioTrier, linhas: LinhaAuditoria[]): ResumoFinanceiro {
  const dosResultados = (r: Resultado[], campo: 'valorCota' | 'valorTrier') => soma(linhas.filter((l) => r.includes(l.resultado)).map((l) => l[campo] ?? 0));
  const correspondentes: Resultado[] = ['OK', 'ATENCAO', 'DIVERGENCIA'];

  const totalCotaItens = soma(pedido.itens.map((i) => i.subtotal));
  const totalTrierBruto = soma(relatorio.itens.map((i) => i.bruto));
  const totalTrierLiquido = soma(relatorio.itens.map((i) => i.liquido));

  const correspondentesCota = dosResultados(correspondentes, 'valorCota');
  const correspondentesTrier = dosResultados(correspondentes, 'valorTrier');
  const efeitoPreco = soma(linhas.filter((l) => correspondentes.includes(l.resultado)).map((l) => l.impactoPreco ?? 0));
  const efeitoQuantidade = soma(linhas.filter((l) => correspondentes.includes(l.resultado)).map((l) => l.impactoQtd ?? 0));
  const arredondamentoUnitario = soma(linhas.filter((l) => correspondentes.includes(l.resultado)).map((l) => l.arredondamentoTrier ?? 0));
  const ausentesCota = dosResultados(['AUSENTE'], 'valorCota');
  const extrasTrier = dosResultados(['EXTRA'], 'valorTrier');
  // Um candidato não confirmado tem valor dos dois lados, e nenhum entra no "correspondente".
  const naoConfirmadosCota = dosResultados(['NAO_CONFIRMADO'], 'valorCota');
  const naoConfirmadosTrier = soma(linhas.filter((l) => l.resultado === 'NAO_CONFIRMADO' && l.candidato).map((l) => l.candidato!.bruto));

  const diferencaTotal = centavos(totalTrierBruto - totalCotaItens);
  const explicada = centavos(efeitoPreco + efeitoQuantidade + arredondamentoUnitario + extrasTrier - ausentesCota + naoConfirmadosTrier - naoConfirmadosCota);

  return {
    totalCotaDeclarado: pedido.totalDeclarado,
    totalCotaItens,
    totalTrierBruto,
    totalTrierLiquido,
    totalTrierLiquidoImpresso: relatorio.totalLiquido,
    correspondentesCota,
    correspondentesTrier,
    efeitoPreco,
    efeitoQuantidade,
    arredondamentoUnitario,
    ausentesCota,
    extrasTrier,
    naoConfirmadosCota,
    naoConfirmadosTrier,
    descontosEArredondamentos: centavos(totalTrierBruto - totalTrierLiquido),
    diferencaTotal,
    naoExplicada: centavos(diferencaTotal - explicada),
  };
}

function decidirVeredito(c: Record<Resultado, number>, avisos: string[]): { veredito: Veredito; justificativa: string } {
  const graves = c.DIVERGENCIA + c.AUSENTE;
  const ressalvas = c.ATENCAO + c.EXTRA + c.NAO_CONFIRMADO + avisos.length;
  if (graves > 0) {
    const partes = [c.DIVERGENCIA && `${c.DIVERGENCIA} com divergência de quantidade ou preço`, c.AUSENTE && `${c.AUSENTE} pedido(s) não localizado(s) no Trier`].filter(Boolean);
    return { veredito: 'REPROVADO', justificativa: `Há ${partes.join(' e ')}. Corrija antes de aprovar.` };
  }
  if (ressalvas > 0) {
    const partes = [
      c.ATENCAO && `${c.ATENCAO} com pequena diferença de preço ou apresentação`,
      c.NAO_CONFIRMADO && `${c.NAO_CONFIRMADO} correspondência(s) a confirmar`,
      c.EXTRA && `${c.EXTRA} produto(s) no Trier fora do pedido`,
      avisos.length && `${avisos.length} aviso(s) sobre os totais dos documentos`,
    ].filter(Boolean);
    return { veredito: 'APROVADO_COM_RESSALVAS', justificativa: `Produtos, preços e quantidades conciliam, com pendências: ${partes.join('; ')}.` };
  }
  return { veredito: 'APROVADO', justificativa: 'Todos os produtos, preços e quantidades do pedido conferem com o Trier.' };
}

function providencias(linhas: LinhaAuditoria[], avisos: string[]): Providencia[] {
  const lista: Providencia[] = [];
  for (const l of linhas) {
    const nome = `«${l.produto}»`;
    if (l.resultado === 'DIVERGENCIA') {
      if (l.situacaoQtd !== 'CORRETA') {
        lista.push({
          chave: l.chave,
          nivel: 'alta',
          texto: `${nome}: pedido ${l.qtdCota} un, lançado ${l.qtdTrier} un (${unidades(l.difQtd ?? 0)}). Conferir a nota fiscal e o que foi entregue; corrigir o lançamento no Trier ou pedir ajuste à distribuidora.`,
        });
      }
      if (l.situacaoPreco !== 'CORRETO') {
        lista.push({
          chave: l.chave,
          nivel: 'alta',
          texto: `${nome}: preço no CotaPreço ${dinheiro(l.precoCota ?? 0)}, no Trier ${dinheiro(l.precoTrier ?? 0)} (${com(l.difUnitaria ?? 0)}; impacto ${com(l.impactoPreco ?? 0)}). Conferir com a nota e a distribuidora e corrigir o custo, se for o caso.`,
        });
      }
    } else if (l.resultado === 'ATENCAO') {
      lista.push({
        chave: l.chave,
        nivel: 'baixa',
        texto: l.conflitosApresentacao.length
          ? `${nome}: apresentação diferente entre os documentos (${l.conflitosApresentacao.join('; ')}). Confirmar se o item lançado é o que foi pedido.`
          : `${nome}: pequena diferença de preço (${com(l.difUnitaria ?? 0)} por unidade; impacto ${com(l.impactoPreco ?? 0)}). Verificar se é arredondamento ou rateio.`,
      });
    } else if (l.resultado === 'AUSENTE') {
      lista.push({
        chave: l.chave,
        nivel: 'alta',
        texto: `${nome}: pedido (${l.qtdCota} un, ${dinheiro(l.valorCota ?? 0)}) e não localizado no Trier. Ver se chegou na nota, se falta entregar ou se foi lançado com outro nome; lançar ou cobrar a distribuidora.`,
      });
    } else if (l.resultado === 'EXTRA') {
      lista.push({
        chave: l.chave,
        nivel: 'media',
        texto: `${nome}: lançado no Trier (${l.qtdTrier} un, ${dinheiro(l.valorTrier ?? 0)}) sem estar no pedido. Investigar: outro pedido, bonificação ou lançamento adicional.`,
      });
    } else if (l.resultado === 'NAO_CONFIRMADO') {
      lista.push({
        chave: l.chave,
        nivel: 'media',
        texto: `${nome}: confirmar se é o mesmo produto que «${l.candidato?.produto}» do Trier${l.conflitosApresentacao.length ? ` (apresentação: ${l.conflitosApresentacao.join('; ')})` : ''}. Depois da decisão o item é comparado.`,
      });
    }
  }
  for (const aviso of avisos) lista.push({ chave: 'doc', nivel: 'media', texto: aviso });
  const peso = { alta: 0, media: 1, baixa: 2 } as const;
  return lista.map((p, i) => ({ p, i })).sort((a, b) => peso[a.p.nivel] - peso[b.p.nivel] || a.i - b.i).map((x) => x.p);
}
