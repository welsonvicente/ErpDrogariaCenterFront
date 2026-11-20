import { ErroLeituraPdf } from './parserCotaPreco';
import { acharCabecalho, agruparLinhas, centavos, itemDoRotulo, numeroBr, valorApos } from './tabelaPdf';
import type { ItemPdf, ItemTrier, LinhaPdf, RelatorioTrier } from './tipos';

/** Cabeçalhos do relatório "COMPRAS POR PREÇO DE VENDA" do Trier, na ordem em que aparecem. */
const ROTULOS = {
  codigo: 'Cód.',
  produto: 'Produto',
  laboratorio: 'Laboratório',
  grupo: 'Grupo',
  estoque: 'Estoq.',
  qtd: 'Qtd.Compra',
  unitario: 'Vlr.Unit.',
  bruto: 'Vlr.Bruto',
  desconto: 'Vlr.Desc',
  liquido: 'Vlr.Líq.',
  venda: 'Vlr.Venda',
  compXVenda: 'Comp. X Venda',
} as const;

type ColunaNumerica = 'grupo' | 'estoque' | 'qtd' | 'unitario' | 'bruto' | 'desconto' | 'liquido' | 'venda' | 'compXVenda';
const NUMERICAS: ColunaNumerica[] = ['grupo', 'estoque', 'qtd', 'unitario', 'bruto', 'desconto', 'liquido', 'venda', 'compXVenda'];

/** Os números são alinhados à direita: a borda direita deles cai (±) na borda direita do título. */
const DISTANCIA_MAXIMA = 14;

interface Colunas {
  produtoX: number;
  laboratorioX: number;
  grupoX: number;
  direita: Record<ColunaNumerica, number>;
}

function colunasDoCabecalho(cabecalho: LinhaPdf): Colunas {
  const item = (rotulo: string) => itemDoRotulo(cabecalho, rotulo)!;
  const direita = Object.fromEntries(NUMERICAS.map((c) => [c, item(ROTULOS[c]).x + item(ROTULOS[c]).w])) as Record<ColunaNumerica, number>;
  return { produtoX: item(ROTULOS.produto).x, laboratorioX: item(ROTULOS.laboratorio).x, grupoX: item(ROTULOS.grupo).x, direita };
}

/** Coluna numérica cuja borda direita está mais perto da do item (ou null se nenhuma estiver perto). */
function colunaNumerica(item: ItemPdf, colunas: Colunas): ColunaNumerica | null {
  const borda = item.x + item.w;
  let melhor: ColunaNumerica | null = null;
  let menor = DISTANCIA_MAXIMA;
  for (const c of NUMERICAS) {
    const d = Math.abs(colunas.direita[c] - borda);
    if (d < menor) {
      menor = d;
      melhor = c;
    }
  }
  return melhor;
}

function texto(itens: ItemPdf[]): string {
  return itens
    .map((i) => i.s.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Números de uma linha de dados, por coluna. */
function numerosDaLinha(linha: LinhaPdf, colunas: Colunas): Partial<Record<ColunaNumerica, number>> {
  const valores: Partial<Record<ColunaNumerica, number>> = {};
  for (const item of linha.itens) {
    if (item.x < colunas.grupoX - 2) continue; // código, produto e laboratório não são numéricos
    const coluna = colunaNumerica(item, colunas);
    const n = numeroBr(item.s);
    if (coluna && n !== null) valores[coluna] = n;
  }
  return valores;
}

/**
 * Lê o PDF do relatório "Compras por preço de venda" do Trier. Produto e
 * laboratório são colunas de texto à esquerda (separadas pela posição do
 * título); as numéricas são achadas pela borda direita do título. Linhas de
 * grupo (": NÃO DEFINIDO") e de total ("Total :") não têm código e são ignoradas.
 */
export function lerRelatorioTrier(itensPdf: ItemPdf[]): RelatorioTrier {
  const linhas = agruparLinhas(itensPdf);
  const rotulos = Object.values(ROTULOS);
  const primeiro = acharCabecalho(linhas, rotulos);
  if (!primeiro) {
    throw new ErroLeituraPdf('Não reconheci este PDF como o relatório "Compras por preço de venda" do Trier (não achei as colunas Cód., Produto, Qtd.Compra, Vlr.Unit., Vlr.Bruto, Vlr.Líq.).');
  }

  const itens: ItemTrier[] = [];
  let totalLiquido: number | null = null;
  let colunas = colunasDoCabecalho(primeiro);

  for (const linha of linhas) {
    // O cabeçalho se repete a cada página: as posições valem só até o próximo.
    if (acharCabecalho([linha], rotulos)) {
      colunas = colunasDoCabecalho(linha);
      continue;
    }

    if (/^Total Geral/i.test(linha.texto)) {
      totalLiquido = numerosDaLinha(linha, colunas).liquido ?? totalLiquido;
      continue;
    }

    const codigoItem = linha.itens[0];
    if (!codigoItem || !/^\d+$/.test(codigoItem.s.trim()) || codigoItem.x + codigoItem.w > colunas.produtoX - 2) continue;

    const num = numerosDaLinha(linha, colunas);
    if (num.qtd === undefined || num.unitario === undefined) continue;

    const produto = texto(linha.itens.filter((i) => i.x >= colunas.produtoX - 3 && i.x < colunas.laboratorioX - 3));
    const laboratorio = texto(linha.itens.filter((i) => i.x >= colunas.laboratorioX - 3 && i.x < colunas.grupoX - 2));
    if (!produto) continue;

    itens.push({
      id: itens.length + 1,
      codigo: codigoItem.s.trim(),
      produto,
      laboratorio: laboratorio || null,
      grupo: num.grupo !== undefined ? String(num.grupo) : null,
      estoque: num.estoque ?? null,
      qtd: num.qtd,
      unitario: num.unitario,
      bruto: centavos(num.bruto ?? num.qtd * num.unitario),
      desconto: num.desconto ?? 0,
      liquido: centavos(num.liquido ?? num.bruto ?? num.qtd * num.unitario),
      venda: num.venda ?? null,
    });
  }

  if (!itens.length) throw new ErroLeituraPdf('O relatório do Trier foi reconhecido, mas não encontrei nenhum produto com quantidade e valor.');

  const cabecalhoDoc = linhas.filter((l) => l.pagina === primeiro.pagina && l.y > primeiro.y);
  const data = valorApos(cabecalhoDoc, 'Data:');
  const hora = cabecalhoDoc.flatMap((l) => l.itens).find((i) => /^Hora:/i.test(i.s))?.s.replace(/^Hora:\s*/i, '');

  return {
    filial: valorApos(cabecalhoDoc, 'Filial:'),
    periodo: valorApos(cabecalhoDoc, 'Período:'),
    fornecedor: valorApos(cabecalhoDoc, 'Fornecedor:'),
    emitidoEm: [data, hora].filter(Boolean).join(' ') || null,
    totalLiquido,
    itens,
  };
}
