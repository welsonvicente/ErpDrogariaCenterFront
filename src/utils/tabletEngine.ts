/**
 * Motor de pintura das Artes do Tablet (tela da loja, paisagem 1920×1080) —
 * mesmos produtos do Panfleto, 4 por arte, cards grandes pra ler de longe.
 * Funções puras, como `panfletoEngine.ts`: só recebem canvas + parâmetros.
 *
 * O canvas já é desenhado na resolução final (1920×1080), sem escala extra:
 * é exatamente o tamanho do PNG que vai pro tablet.
 */

import { calcularDesconto, desenharImagemContain, desenharImagemCover, desenharRetanguloArredondado, fmtMoney, tamanhoOrigem, type FonteImagem } from './cartazEngine';
import { COR_FUNDO_SELO_PADRAO, COR_TEXTO_SELO_PADRAO, type ProdutoPanfleto } from './panfletoEngine';

export const LARGURA_TABLET = 1920;
export const ALTURA_TABLET = 1080;
export const PRODUTOS_POR_ARTE_TABLET = 4;

/** Posição/tamanho de um card ou da logo, em px da arte (1920×1080). */
export interface CaixaTablet {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface ParametrosArteTablet {
  /** Foto de fundo, preenche a arte inteira (corta as sobras). Sem ela, um degradê na cor da marca. */
  imagemFundo: FonteImagem | null;
  imagemLogo: FonteImagem | null;
  logoCaixa: CaixaTablet | null;
  corFundoCard: string;
  corDescricao: string;
  corPreco: string;
  corFundoSelo?: string;
  corTextoSelo?: string;
}

const MARGEM = 60;
const GAP = 40;
const ALTURA_CARD = 790;
/** Cards centralizados na altura da arte — antes começavam em 230 e quase encostavam no rodapé. */
const TOPO_CARDS = (ALTURA_TABLET - ALTURA_CARD) / 2;

/**
 * Cards lado a lado, centralizados — com menos de 4 (última arte), os que
 * existem continuam do mesmo tamanho e ficam no meio, em vez de colados à
 * esquerda com um buraco à direita.
 */
export function posicoesPadraoTablet(quantidade = PRODUTOS_POR_ARTE_TABLET): CaixaTablet[] {
  const largura = (LARGURA_TABLET - MARGEM * 2 - GAP * (PRODUTOS_POR_ARTE_TABLET - 1)) / PRODUTOS_POR_ARTE_TABLET;
  const n = Math.max(1, Math.min(PRODUTOS_POR_ARTE_TABLET, quantidade));
  const inicio = (LARGURA_TABLET - (n * largura + (n - 1) * GAP)) / 2;
  return Array.from({ length: n }, (_, i) => ({ x: inicio + i * (largura + GAP), y: TOPO_CARDS, largura, altura: ALTURA_CARD }));
}

/**
 * Uma fileira alinhada: todos os cards com o centro na mesma altura (meio da
 * arte) e espaços iguais entre eles, centralizada na largura. Cada card
 * mantém o próprio tamanho. Se não couberem lado a lado, encolhem por igual.
 */
export function alinharCaixasTablet(caixas: CaixaTablet[]): CaixaTablet[] {
  if (caixas.length === 0) return caixas;
  const somaLarguras = caixas.reduce((s, c) => s + c.largura, 0);
  const espacoMin = GAP * (caixas.length - 1) + MARGEM * 2;
  const escala = Math.min(1, (LARGURA_TABLET - espacoMin) / somaLarguras, ...caixas.map((c) => (ALTURA_TABLET - MARGEM) / c.altura));
  const ajustadas = caixas.map((c) => ({ ...c, largura: c.largura * escala, altura: c.altura * escala }));
  const total = ajustadas.reduce((s, c) => s + c.largura, 0) + GAP * (ajustadas.length - 1);
  let x = (LARGURA_TABLET - total) / 2;
  return ajustadas.map((c) => {
    const alinhada = { ...c, x, y: (ALTURA_TABLET - c.altura) / 2 };
    x += c.largura + GAP;
    return alinhada;
  });
}

/**
 * Arte com menos produtos que posições (a última): mantém altura e tamanho de
 * cada card, mas redistribui na largura com espaços iguais e centraliza —
 * senão sobrava um buraco do lado direito.
 */
export function centralizarNaLargura(caixas: CaixaTablet[]): CaixaTablet[] {
  if (caixas.length === 0) return caixas;
  const ordenadas = caixas.map((c, i) => ({ c, i })).sort((a, b) => a.c.x - b.c.x);
  const total = caixas.reduce((s, c) => s + c.largura, 0) + GAP * (caixas.length - 1);
  let x = Math.max(0, (LARGURA_TABLET - total) / 2);
  const resultado = [...caixas];
  for (const { c, i } of ordenadas) {
    resultado[i] = { ...c, x };
    x += c.largura + GAP;
  }
  return resultado;
}

/** Logo no canto superior esquerdo, na faixa acima dos cards, respeitando a proporção do PNG. */
export function caixaLogoPadraoTablet(logo: FonteImagem): CaixaTablet {
  const { w, h } = tamanhoOrigem(logo);
  const proporcao = h / w || 1;
  // Cabe na faixa acima dos cards (que começam em TOPO_CARDS = 145): de 28 a 118 px.
  const altura = 90;
  const largura = Math.min(420, altura / proporcao);
  return { x: MARGEM, y: 28, largura, altura: largura * proporcao };
}

/** Quebra as palavras em até `maxLinhas`, com "…" se o texto não couber. */
function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number, maxLinhas: number): string[] {
  const linhas: string[] = [];
  let linha = '';
  for (const palavra of texto.split(/\s+/).filter(Boolean)) {
    const teste = linha ? `${linha} ${palavra}` : palavra;
    if (ctx.measureText(teste).width > larguraMax && linha) {
      linhas.push(linha);
      linha = palavra;
    } else {
      linha = teste;
    }
  }
  if (linha) linhas.push(linha);
  if (linhas.length <= maxLinhas) return linhas;
  const cortadas = linhas.slice(0, maxLinhas);
  let ultima = cortadas[maxLinhas - 1];
  while (ultima.length > 1 && ctx.measureText(`${ultima}…`).width > larguraMax) ultima = ultima.slice(0, -1);
  cortadas[maxLinhas - 1] = `${ultima}…`;
  return cortadas;
}

function desenharCard(ctx: CanvasRenderingContext2D, produto: ProdutoPanfleto, c: CaixaTablet, p: ParametrosArteTablet) {
  // Tudo proporcional à largura do card — se a pessoa aumentar o card, texto e foto crescem junto.
  const u = c.largura / 420;
  const pad = 24 * u;

  if (p.corFundoCard !== 'transparent') {
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 24 * u;
    ctx.shadowOffsetY = 8 * u;
    ctx.fillStyle = p.corFundoCard;
    desenharRetanguloArredondado(ctx, c.x, c.y, c.largura, c.altura, 28 * u);
    ctx.fill();
    ctx.restore();
  }

  // Foto ocupa a parte de cima; o texto, o que sobra embaixo.
  const alturaTexto = Math.min(c.altura * 0.42, 290 * u);
  const alturaFoto = Math.max(40, c.altura - alturaTexto - pad * 2);
  desenharImagemContain(ctx, produto.imagem, c.x + pad, c.y + pad, c.largura - pad * 2, alturaFoto);

  const larguraTexto = c.largura - pad * 2;
  let cursorY = c.y + pad + alturaFoto + 46 * u;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  const tamanhoNome = Math.round(30 * u);
  ctx.fillStyle = p.corDescricao;
  ctx.font = `700 ${tamanhoNome}px Inter`;
  for (const linha of quebrarLinhas(ctx, produto.nome.toUpperCase(), larguraTexto, 2)) {
    ctx.fillText(linha, c.x + pad, cursorY);
    cursorY += tamanhoNome * 1.22;
  }
  cursorY += 22 * u;

  if (produto.de) {
    const tamanhoDe = Math.round(28 * u);
    ctx.fillStyle = '#9AA79A';
    ctx.font = `500 ${tamanhoDe}px Inter`;
    const textoDe = `De: R$ ${fmtMoney(produto.de)}`;
    ctx.fillText(textoDe, c.x + pad, cursorY);
    ctx.strokeStyle = '#9AA79A';
    ctx.lineWidth = 2.5 * u;
    ctx.beginPath();
    ctx.moveTo(c.x + pad, cursorY - tamanhoDe * 0.32);
    ctx.lineTo(c.x + pad + ctx.measureText(textoDe).width, cursorY - tamanhoDe * 0.32);
    ctx.stroke();
    cursorY += 64 * u;
  } else {
    cursorY += 30 * u;
  }

  const tamanhoPor = Math.round(56 * u);
  ctx.fillStyle = p.corPreco;
  ctx.font = `700 ${tamanhoPor}px Inter`;
  const textoPor = `R$ ${fmtMoney(produto.por)}`;
  // Preço é o que mais importa de longe — encolhe só se não couber na largura do card.
  let tamanhoAjustado = tamanhoPor;
  while (tamanhoAjustado > 20 && ctx.measureText(textoPor).width > larguraTexto) {
    tamanhoAjustado -= 2;
    ctx.font = `700 ${tamanhoAjustado}px Inter`;
  }
  ctx.fillText(textoPor, c.x + pad, cursorY);

  const pct = calcularDesconto(produto.de, produto.por);
  if (pct !== null && pct > 0) {
    const tamanhoSelo = Math.round(30 * u);
    ctx.font = `700 ${tamanhoSelo}px Inter`;
    const textoSelo = `-${pct}%`;
    const larguraSelo = ctx.measureText(textoSelo).width + 30 * u;
    const alturaSelo = tamanhoSelo * 1.7;
    const xSelo = c.x + c.largura - pad - larguraSelo;
    const ySelo = c.y + pad;
    const corFundoSelo = p.corFundoSelo || COR_FUNDO_SELO_PADRAO;
    if (corFundoSelo !== 'transparent') {
      ctx.fillStyle = corFundoSelo;
      desenharRetanguloArredondado(ctx, xSelo, ySelo, larguraSelo, alturaSelo, alturaSelo / 2);
      ctx.fill();
    }
    ctx.fillStyle = p.corTextoSelo || COR_TEXTO_SELO_PADRAO;
    ctx.textBaseline = 'middle';
    ctx.fillText(textoSelo, xSelo + 15 * u, ySelo + alturaSelo / 2);
    ctx.textBaseline = 'alphabetic';
  }
}

/** Pinta uma arte (até 4 produtos) no canvas, em 1920×1080. `caixas[i]` é a posição do produto `i`. */
export function renderizarArteTablet(canvas: HTMLCanvasElement, produtos: ProdutoPanfleto[], caixas: CaixaTablet[], p: ParametrosArteTablet) {
  canvas.width = LARGURA_TABLET;
  canvas.height = ALTURA_TABLET;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (p.imagemFundo) {
    desenharImagemCover(ctx, p.imagemFundo, 0, 0, LARGURA_TABLET, ALTURA_TABLET);
  } else {
    const gradiente = ctx.createLinearGradient(0, 0, LARGURA_TABLET, ALTURA_TABLET);
    gradiente.addColorStop(0, '#628B00');
    gradiente.addColorStop(1, '#173C3A');
    ctx.fillStyle = gradiente;
    ctx.fillRect(0, 0, LARGURA_TABLET, ALTURA_TABLET);
  }

  produtos.forEach((produto, i) => {
    if (caixas[i]) desenharCard(ctx, produto, caixas[i], p);
  });

  if (produtos.length === 0) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '600 48px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Adicione produtos ao panfleto pra montar as artes do tablet', LARGURA_TABLET / 2, ALTURA_TABLET / 2);
  }

  if (p.imagemLogo && p.logoCaixa) {
    const l = p.logoCaixa;
    desenharImagemContain(ctx, p.imagemLogo, l.x, l.y, l.largura, l.altura);
  }
}

/** Quebra os produtos em artes de 4. */
export function construirArtesTablet(produtos: ProdutoPanfleto[]): ProdutoPanfleto[][] {
  const total = Math.max(1, Math.ceil(produtos.length / PRODUTOS_POR_ARTE_TABLET));
  return Array.from({ length: total }, (_, i) => produtos.slice(i * PRODUTOS_POR_ARTE_TABLET, (i + 1) * PRODUTOS_POR_ARTE_TABLET));
}
