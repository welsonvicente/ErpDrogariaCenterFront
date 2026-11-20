import { acharCabecalho, agruparLinhas, centavos, itemDoRotulo, numeroBr } from './tabelaPdf';
import type { ItemCota, ItemPdf, LinhaPdf, PedidoCota, PedidoDaDistribuidora } from './tipos';

export class ErroLeituraPdf extends Error {}

const ROTULOS = ['EAN', 'Produto', 'Qtd.', 'Unitário', 'Subtotal'];
/** Folga (pt) pra um item contar como "dentro" da coluna — os números ficam alinhados à esquerda do título. */
const FOLGA = 6;
const SEM_NOME = 'Distribuidora não informada';

function textoDaColuna(linha: LinhaPdf, de: number, ate: number): string {
  return linha.itens
    .filter((i) => i.x >= de - FOLGA && i.x < ate - FOLGA)
    .map((i) => i.s.trim())
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function primeiroApos(linhas: LinhaPdf[], inicio: number, fim: number, filtro: (i: ItemPdf) => boolean): string[] {
  return linhas.slice(inicio, fim).flatMap((l) => l.itens.filter(filtro).map((i) => i.s.trim()));
}

/** Um pedido do PDF (cabeçalho + itens), antes de decidir se o documento é de um pedido só ou de vários. */
type Bloco = Omit<PedidoCota, 'itens' | 'pedidos'> & { itens: Array<Omit<ItemCota, 'id'>> };

/**
 * Lê um pedido: as colunas são achadas pela posição dos títulos (EAN / Produto / Qtd. / Unitário / Subtotal);
 * um nome de produto que quebra em duas linhas é reunido na linha de cima. Devolve null se o trecho não tem a tabela.
 */
function lerBloco(linhas: LinhaPdf[]): Bloco | null {
  const cabecalho = acharCabecalho(linhas, ROTULOS);
  if (!cabecalho) return null;
  const x = {
    ean: itemDoRotulo(cabecalho, 'EAN')!.x,
    produto: itemDoRotulo(cabecalho, 'Produto')!.x,
    qtd: itemDoRotulo(cabecalho, 'Qtd.')!.x,
    unitario: itemDoRotulo(cabecalho, 'Unitário')!.x,
    subtotal: itemDoRotulo(cabecalho, 'Subtotal')!.x,
  };

  const indiceCabecalho = linhas.indexOf(cabecalho);
  const itens: Bloco['itens'] = [];
  let totalDeclarado: number | null = null;

  for (const linha of linhas.slice(indiceCabecalho + 1)) {
    const texto = linha.texto;
    const total = texto.match(/TOTAL DO PEDIDO:?\s*(.+)$/i);
    if (total) {
      totalDeclarado = numeroBr(total[1]);
      continue;
    }

    const ean = textoDaColuna(linha, x.ean, x.produto);
    const produto = textoDaColuna(linha, x.produto, x.qtd);
    const qtd = numeroBr(textoDaColuna(linha, x.qtd, x.unitario));
    const unitario = numeroBr(textoDaColuna(linha, x.unitario, x.subtotal));
    const subtotal = numeroBr(textoDaColuna(linha, x.subtotal, Infinity));

    if (produto && qtd !== null && unitario !== null && subtotal !== null) {
      itens.push({ ean: /^\d{8,14}$/.test(ean) ? ean : null, produto, qtd, unitario, subtotal });
    } else if (produto && !ean && qtd === null && unitario === null && subtotal === null && itens.length) {
      // Continuação de um nome que quebrou de linha.
      const anterior = itens[itens.length - 1];
      anterior.produto = `${anterior.produto} ${produto}`;
    }
  }

  // ---- dados do cabeçalho do documento (acima da tabela) ----
  const acima = linhas.slice(0, indiceCabecalho);
  const todas = linhas.map((l) => l.texto).join('\n');
  const idxComprador = acima.findIndex((l) => l.itens.some((i) => i.s.trim().toUpperCase() === 'COMPRADOR'));
  const itemDistribuidora = acima.flatMap((l) => l.itens).find((i) => i.s.trim().toUpperCase() === 'DISTRIBUIDORA');
  const limiteColunas = itemDistribuidora ? itemDistribuidora.x - 10 : Infinity;
  const blocoEsquerda = idxComprador >= 0 ? primeiroApos(acima, idxComprador + 1, acima.length, (i) => i.x < limiteColunas) : [];
  const blocoDireita = idxComprador >= 0 ? primeiroApos(acima, idxComprador + 1, acima.length, (i) => i.x >= limiteColunas) : [];
  const cnpj = (bloco: string[]) => bloco.find((t) => /^CNPJ:/i.test(t))?.replace(/^CNPJ:\s*/i, '') ?? null;

  const representanteInicio = blocoDireita.findIndex((t) => /^Representante:/i.test(t));
  const representante = representanteInicio >= 0 ? blocoDireita.slice(representanteInicio).join(' ').replace(/^Representante:\s*/i, '').replace(/\s+·\s*/g, ' · ').trim() : null;

  return {
    numero: todas.match(/Pedido:\s*(\S+)/i)?.[1] ?? null,
    cotacao: todas.match(/Cota[cç][aã]o:\s*([^\n]+?)(?:\n|$)/i)?.[1]?.trim() ?? null,
    comprador: blocoEsquerda[0] ?? null,
    compradorCnpj: cnpj(blocoEsquerda),
    distribuidora: blocoDireita[0] ?? null,
    representante,
    totalDeclarado,
    minimoDistribuidora: numeroBr(todas.match(/M[ií]nimo informado pela distribuidora:\s*(R\$\s*[\d.,]+)/i)?.[1]),
    geradoEm: todas.match(/Gerado pelo CotaPre[cç]o em\s*([^\n]+)/i)?.[1]?.trim() ?? null,
    itens,
  };
}

/**
 * Um PDF do CotaPreço pode juntar vários pedidos (um por distribuidora, cada um começando em "PEDIDO DE COMPRA").
 * As linhas depois de cada título — inclusive as da página seguinte, quando o pedido não cabe numa só — são dele.
 */
function separarPedidos(linhas: LinhaPdf[]): LinhaPdf[][] {
  const inicios = linhas.flatMap((l, i) => (/^PEDIDO DE COMPRA$/i.test(l.texto.trim()) ? [i] : []));
  if (inicios.length <= 1) return [linhas];
  return inicios.map((ini, k) => linhas.slice(ini, inicios[k + 1] ?? linhas.length));
}

const LIMITE_TEXTO = 200;
const cortar = (texto: string, max: number) => (texto.length <= max ? texto : `${texto.slice(0, max - 1)}…`);

/**
 * Lê o PDF "Pedido de compra" gerado pelo CotaPreço — de uma distribuidora ou de várias juntas. Com vários,
 * cada item leva a distribuidora e o número do pedido de onde veio, e `pedidos` resume cada um.
 */
export function lerPedidoCotaPreco(itensPdf: ItemPdf[]): PedidoCota {
  const linhas = agruparLinhas(itensPdf);
  const blocos = separarPedidos(linhas).map(lerBloco).filter((b): b is Bloco => b !== null);
  if (!blocos.length) {
    throw new ErroLeituraPdf('Não reconheci este PDF como um pedido do CotaPreço (não achei as colunas EAN, Produto, Qtd., Unitário e Subtotal).');
  }
  if (!blocos.some((b) => b.itens.length)) {
    throw new ErroLeituraPdf('O pedido do CotaPreço foi reconhecido, mas não encontrei nenhum item com quantidade e preço.');
  }

  if (blocos.length === 1) {
    const { itens, ...cabecalho } = blocos[0];
    return { ...cabecalho, itens: itens.map((i, n) => ({ id: n + 1, ...i, subtotal: centavos(i.subtotal) })) };
  }

  // Vários pedidos: itens numerados em sequência no documento todo, cada um com a distribuidora de origem.
  const comItens = blocos.filter((b) => b.itens.length);
  const pedidos: PedidoDaDistribuidora[] = comItens.map((b) => ({
    numero: b.numero,
    distribuidora: b.distribuidora ?? SEM_NOME,
    representante: b.representante,
    totalDeclarado: b.totalDeclarado,
    minimoDistribuidora: b.minimoDistribuidora,
    itens: b.itens.length,
  }));
  const itens: ItemCota[] = comItens.flatMap((b, k) => b.itens.map((i) => ({ ...i, id: 0, subtotal: centavos(i.subtotal), distribuidora: pedidos[k].distribuidora, pedidoNumero: b.numero })));
  itens.forEach((item, n) => (item.id = n + 1));

  const nomes = [...new Set(pedidos.map((p) => p.distribuidora))];
  const primeiro = comItens[0];
  const todosTotais = pedidos.every((p) => p.totalDeclarado !== null);
  return {
    numero: primeiro.numero ? `${primeiro.numero} +${pedidos.length - 1}` : null,
    cotacao: primeiro.cotacao,
    comprador: primeiro.comprador,
    compradorCnpj: primeiro.compradorCnpj,
    distribuidora: cortar(`Várias (${nomes.length}): ${nomes.join(', ')}`, LIMITE_TEXTO),
    representante: null,
    totalDeclarado: todosTotais ? centavos(pedidos.reduce((s, p) => s + (p.totalDeclarado ?? 0), 0)) : null,
    minimoDistribuidora: null,
    geradoEm: comItens[comItens.length - 1].geradoEm,
    itens,
    pedidos,
  };
}
