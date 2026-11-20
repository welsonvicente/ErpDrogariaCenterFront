import type { ItemPdf } from '../utils/critica/tipos';

/**
 * Monta os "trechos de texto" que o pdf.js entregaria para um PDF de cada
 * sistema, com as MESMAS posições de coluna dos documentos reais (conferidas
 * num arquivo de cada), mas com produtos e preços inventados.
 */

const largura = (texto: string) => texto.length * 5.2;
const brl = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function esquerda(pagina: number, x: number, y: number, s: string): ItemPdf {
  return { pagina, x, y, w: largura(s), s };
}
/** Alinhado à direita: a borda direita (x + w) fica em `direita`. */
function direita(pagina: number, direitaX: number, y: number, s: string): ItemPdf {
  const w = largura(s);
  return { pagina, x: direitaX - w, y, w, s };
}

// ---------------------------------------------------------------- CotaPreço

export interface LinhaCota {
  produto: string;
  qtd: number;
  unitario: number;
  ean?: string;
}

export function pdfCotaPreco(opcoes: { itens: LinhaCota[]; total?: number; quebrarNome?: boolean; distribuidora?: string; numero?: string }): ItemPdf[] {
  const t: ItemPdf[] = [];
  t.push(esquerda(1, 36, 773, 'PEDIDO DE COMPRA'));
  t.push(esquerda(1, 36, 760, `Pedido: ${opcoes.numero ?? 'PED-C000001-D000001'}`));
  t.push(esquerda(1, 184, 760, 'Cotação: COTAÇÃO 01/01/2026'));
  t.push(esquerda(1, 46, 708, 'COMPRADOR'), esquerda(1, 308, 708, 'DISTRIBUIDORA'));
  t.push(esquerda(1, 46, 694, 'Farmácia Teste LTDA'), esquerda(1, 308, 694, opcoes.distribuidora ?? 'Distribuidora Exemplo'));
  t.push(esquerda(1, 46, 681, 'CNPJ: 00.000.000/0001-00'), esquerda(1, 308, 681, 'CNPJ: Não informado'));
  t.push(esquerda(1, 308, 667, 'Representante: Fulano de Tal ·'));
  t.push(esquerda(1, 308, 654, '81999990000'));
  t.push(esquerda(1, 42, 601, 'EAN'), esquerda(1, 129, 601, 'Produto'), esquerda(1, 372, 601, 'Qtd.'), esquerda(1, 417, 601, 'Unitário'), esquerda(1, 488, 601, 'Subtotal'));

  let y = 581;
  let soma = 0;
  opcoes.itens.forEach((item, i) => {
    const subtotal = Math.round(item.qtd * item.unitario * 100) / 100;
    soma += subtotal;
    t.push(esquerda(1, 41, y, item.ean ?? '-'));
    if (opcoes.quebrarNome && i === 0) {
      // Nome comprido que quebra: a primeira linha leva os números, a segunda só o resto do nome.
      const [a, ...b] = item.produto.split(' ');
      t.push(esquerda(1, 128, y, a));
      t.push(esquerda(1, 371, y, String(item.qtd)), esquerda(1, 416, y, `R$ ${brl(item.unitario)}`), esquerda(1, 487, y, `R$ ${brl(subtotal)}`));
      y -= 10;
      t.push(esquerda(1, 128, y, b.join(' ')));
    } else {
      t.push(esquerda(1, 128, y, item.produto));
      t.push(esquerda(1, 371, y, String(item.qtd)), esquerda(1, 416, y, `R$ ${brl(item.unitario)}`), esquerda(1, 487, y, `R$ ${brl(subtotal)}`));
    }
    y -= 19;
  });
  t.push(esquerda(1, 300, y - 20, `TOTAL DO PEDIDO: R$ ${brl(opcoes.total ?? soma)}`));
  t.push(esquerda(2, 379, 787, 'Mínimo informado pela distribuidora: R$ 2,00'));
  t.push(esquerda(2, 36, 761, 'Gerado pelo CotaPreço em 01/01/2026 10:00'));
  return t;
}

/**
 * Um PDF do CotaPreço que junta vários pedidos: cada um começa no seu "PEDIDO DE COMPRA", e o rodapé (mínimo, "gerado em")
 * cai na página seguinte — como no arquivo real.
 */
export function pdfCotaPrecoVarios(pedidos: Array<{ distribuidora: string; numero: string; itens: LinhaCota[]; total?: number }>): ItemPdf[] {
  return pedidos.flatMap((p, k) => pdfCotaPreco(p).map((i) => ({ ...i, pagina: i.pagina + 2 * k })));
}

// -------------------------------------------------------------------- Trier

export interface LinhaTrier {
  codigo: string;
  produto: string;
  laboratorio?: string;
  grupo?: number;
  estoque?: number;
  qtd: number;
  unitario: number;
  /** Padrão: qtd × unitário. */
  bruto?: number;
  desconto?: number;
  venda?: number;
}

/** Posição e largura reais (em pontos) de cada título do cabeçalho do relatório do Trier. */
const CABECALHO_TRIER: Array<[string, number, number]> = [
  ['Cód.', 31, 17],
  ['Produto', 58, 31],
  ['Laboratório', 205, 46],
  ['Grupo', 263, 24],
  ['Estoq.', 293, 24],
  ['Qtd.Compra', 324, 47],
  ['Vlr.Unit.', 380, 33],
  ['Vlr.Bruto', 421, 36],
  ['Vlr.Desc', 470, 32],
  ['Vlr.Líq.', 524, 28],
  ['Vlr.Venda', 570, 38],
  ['Comp. X Venda', 616, 59],
];

function cabecalhoTrier(pagina: number, y: number): ItemPdf[] {
  return CABECALHO_TRIER.map(([s, x, w]) => ({ pagina, x, y, w, s }));
}

export function pdfTrier(opcoes: { itens: LinhaTrier[]; paginas?: number }): ItemPdf[] {
  const t: ItemPdf[] = [];
  t.push(esquerda(1, 21, 806, 'FARMACIA - FARMÁCIA TESTE'));
  t.push(esquerda(1, 86, 782, 'Filial:'), esquerda(1, 107, 782, 'FARMÁCIA TESTE'));
  t.push(esquerda(1, 63, 770, 'Fornecedor:'), esquerda(1, 107, 770, 'VÁRIOS'));
  t.push(esquerda(1, 432, 758, 'Período:'), esquerda(1, 463, 758, '01/01/2026 a 01/01/2026'));
  t.push(esquerda(1, 536, 710, 'Data:'), esquerda(1, 556, 710, '02/01/2026'));
  t.push(esquerda(1, 536, 698, 'Hora:10:00:00'));
  t.push(esquerda(1, 286, 686, 'COMPRAS POR PREÇO DE VENDA'));

  const porPagina = Math.ceil(opcoes.itens.length / (opcoes.paginas ?? 1));
  let pagina = 1;
  let y = 674;
  t.push(...cabecalhoTrier(pagina, y));
  y -= 12;
  t.push(esquerda(pagina, 20, y, ':'), esquerda(pagina, 90, y, 'NÃO DEFINIDO'));
  y -= 12;

  let totalLiq = 0;
  opcoes.itens.forEach((it, i) => {
    if (i > 0 && i % porPagina === 0) {
      pagina += 1;
      y = 800;
      t.push(...cabecalhoTrier(pagina, y)); // o cabeçalho se repete em cada página
      y -= 12;
    }
    const bruto = it.bruto ?? Math.round(it.qtd * it.unitario * 100) / 100;
    const desc = it.desconto ?? 0;
    const liq = Math.round((bruto - desc) * 100) / 100;
    totalLiq += liq;
    t.push(direita(pagina, 48, y, it.codigo), esquerda(pagina, 58, y, it.produto));
    if (it.laboratorio) t.push(esquerda(pagina, 206, y, it.laboratorio));
    if (it.grupo !== undefined) t.push(direita(pagina, 287, y, String(it.grupo)));
    t.push(direita(pagina, 317, y, String(it.estoque ?? it.qtd)), direita(pagina, 371, y, String(it.qtd)), direita(pagina, 413, y, brl(it.unitario)));
    t.push(direita(pagina, 461, y, brl(bruto)), direita(pagina, 506, y, brl(desc)), direita(pagina, 556, y, brl(liq)));
    t.push(direita(pagina, 612, y, brl(it.venda ?? it.unitario * 2.5)), direita(pagina, 679, y, brl((it.venda ?? it.unitario * 2.5) - bruto)));
    y -= 12;
  });
  t.push(esquerda(pagina, 26, y, 'Total :'), direita(pagina, 556, y, brl(totalLiq)));
  y -= 12;
  t.push(esquerda(pagina, 26, y, 'Total Geral:'), direita(pagina, 556, y, brl(totalLiq)));
  return t;
}
