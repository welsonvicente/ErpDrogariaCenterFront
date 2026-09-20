/**
 * Motor de pintura do Panfleto (vários produtos por página) — portado 1:1 da
 * lógica que já existia em `public/tools/cartazes.html` (`renderFlyerPage` e
 * vizinhas). Mesma separação de responsabilidade do `cartazEngine.ts`: funções
 * puras que só recebem um `HTMLCanvasElement`/`CanvasRenderingContext2D` e
 * parâmetros, sem tocar no DOM da aplicação.
 */

import { calcularDesconto, desenharImagemContain, desenharRetanguloArredondado, fmtMoney, type FonteImagem, type TransformImagem } from './cartazEngine';

export type AlinhamentoTexto = 'left' | 'center' | 'right';

export const TRANSFORM_PADRAO_PANFLETO: TransformImagem = { scale: 1, panX: 0.5, panY: 0.5 };

export interface ProdutoPanfleto {
  imagem: HTMLImageElement;
  nome: string;
  de: string;
  por: string;
  /**
   * Enquadramento (zoom/pan) só usado ao gerar um story individual deste
   * produto (ver "📱 Story individual" na lista) — o card do panfleto em si
   * pinta a foto inteira ("contain"), sem cortar, então o transform não afeta
   * o grid, só a versão 1080×1920 gerada à parte.
   */
  transform: TransformImagem;
}

export interface DimensaoCardPanfleto {
  cardW: number;
  cardH: number;
  photoH: number;
}

/** Presets de tamanho por quantidade de itens por página — mais itens, cards menores. */
export const PRESETS_TAMANHO_PANFLETO: Record<number, DimensaoCardPanfleto> = {
  3: { cardW: 320, photoH: 260, cardH: 430 },
  6: { cardW: 280, photoH: 190, cardH: 350 },
  9: { cardW: 260, photoH: 140, cardH: 300 },
  12: { cardW: 230, photoH: 100, cardH: 260 },
};

export const ITENS_POR_PAGINA_OPCOES = [3, 6, 9, 12] as const;

/**
 * O layout é calculado em coordenadas "lógicas" pequenas (poucas centenas de
 * px) — cada card de produto é pequeno na grade, e desenhar em resolução 1:1
 * daria poucos pixels reais por foto (sairia borrado ao baixar). Essa escala
 * multiplica a resolução real do canvas (largura/altura em pixels) mantendo o
 * tamanho visual igual em tela, então fotos e texto saem nítidos.
 */
export const ESCALA_EXPORTACAO_PANFLETO = 3;

export interface ParametrosPaginaPanfleto {
  mostrarTextosCabecalho: boolean;
  nomeLoja: string;
  nomeLojaAlinhamento: AlinhamentoTexto;
  titulo: string;
  tituloAlinhamento: AlinhamentoTexto;

  mostrarTextosRodape: boolean;
  textoRodape1: string;
  textoRodape1Alinhamento: AlinhamentoTexto;
  textoRodape2: string;
  textoRodape2Alinhamento: AlinhamentoTexto;

  temLink: boolean;
  qrAlinhamento: 'left' | 'right';
  /** Imagem do QR já gerada (ver utils/qrCode.ts) — null enquanto ainda está gerando. */
  imagemQr: HTMLImageElement | null;

  corLogo: string;
  corDescricao: string;
  corPreco: string;
  corFundoCard: string;
  tamanhoNome: number;
  tamanhoPreco: number;
  tamanhoBorda: number;
  tamanhoSelo: number;

  imagemFundo: FonteImagem | null;
  manterFaixaBranca: boolean;
}

function desenharTextoAlinhado(ctx: CanvasRenderingContext2D, texto: string, y: number, align: AlinhamentoTexto, pad: number, larguraTotal: number) {
  if (align === 'center') {
    ctx.textAlign = 'center';
    ctx.fillText(texto, larguraTotal / 2, y);
  } else if (align === 'right') {
    ctx.textAlign = 'right';
    ctx.fillText(texto, larguraTotal - pad, y);
  } else {
    ctx.textAlign = 'left';
    ctx.fillText(texto, pad, y);
  }
}

function quebrarLinhasPanfleto(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, larguraMax: number, alturaLinha: number, maxLinhas: number) {
  const palavras = texto.split(' ');
  let linha = '';
  const linhas: string[] = [];
  palavras.forEach((palavra) => {
    const teste = `${linha}${palavra} `;
    if (ctx.measureText(teste).width > larguraMax && linha !== '') {
      linhas.push(linha.trim());
      linha = `${palavra} `;
    } else {
      linha = teste;
    }
  });
  linhas.push(linha.trim());
  linhas.slice(0, maxLinhas).forEach((l, i) => ctx.fillText(l, x, y + i * alturaLinha));
}

/** Desenha uma página do panfleto (um chunk de produtos) no canvas dado. */
export function renderizarPaginaPanfleto(
  canvas: HTMLCanvasElement,
  produtosDaPagina: ProdutoPanfleto[],
  sizing: DimensaoCardPanfleto,
  paginaNum: number,
  totalPaginas: number,
  p: ParametrosPaginaPanfleto,
) {
  const cols = 3;
  const { cardW, cardH, photoH } = sizing;
  const gap = 24;
  const pad = p.tamanhoBorda;
  const headerH = 130;
  // O rodapé só precisa da altura toda (pra caber o QR de 130px) quando há um
  // link configurado — sem isso, reservar o espaço deixa um vão vazio grande
  // entre os produtos e o texto do rodapé.
  const footerH = p.temLink ? 190 : 100;
  const rows = Math.max(1, Math.ceil(produtosDaPagina.length / cols));
  const W = pad * 2 + cols * cardW + (cols - 1) * gap;
  const H = headerH + rows * cardH + (rows - 1) * gap + footerH + pad;

  canvas.width = W * ESCALA_EXPORTACAO_PANFLETO;
  canvas.height = H * ESCALA_EXPORTACAO_PANFLETO;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(ESCALA_EXPORTACAO_PANFLETO, ESCALA_EXPORTACAO_PANFLETO);

  const deFontSize = Math.max(10, p.tamanhoPreco - 5);

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);

  // Com imagem de fundo e a opção desmarcada, some com as faixas brancas E as linhas divisórias.
  const manterFaixaBranca = p.imagemFundo ? p.manterFaixaBranca : true;

  if (p.imagemFundo) {
    ctx.globalAlpha = 1;
    desenharImagemContain(ctx, p.imagemFundo, 0, 0, W, H);
    if (manterFaixaBranca) {
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillRect(0, 0, W, headerH);
      ctx.fillRect(0, H - footerH, W, footerH);
    }
  }

  // cabeçalho
  if (p.mostrarTextosCabecalho) {
    const nomeLoja = p.nomeLoja.trim() || 'Drogaria Center';
    ctx.fillStyle = p.corLogo;
    ctx.font = '700 34px "Space Grotesk"';
    ctx.textBaseline = 'alphabetic';
    desenharTextoAlinhado(ctx, nomeLoja, 56, p.nomeLojaAlinhamento, pad, W);

    const titulo = p.titulo || 'Ofertas';
    ctx.fillStyle = p.corLogo;
    ctx.font = '600 22px Inter';
    let textoTitulo = titulo;
    if (totalPaginas > 1) textoTitulo += ` — parte ${paginaNum}/${totalPaginas}`;
    desenharTextoAlinhado(ctx, textoTitulo, 88, p.tituloAlinhamento, pad, W);
  }

  if (manterFaixaBranca) {
    ctx.strokeStyle = '#D8E7E2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad, headerH - 20);
    ctx.lineTo(W - pad, headerH - 20);
    ctx.stroke();
  }

  // grade de produtos — quando a última fileira não fecha as 3 colunas,
  // centraliza os cards dela em vez de deixá-los colados à esquerda.
  produtosDaPagina.forEach((produto, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const itensNaLinha = row === rows - 1 ? produtosDaPagina.length - row * cols : cols;
    const deslocamentoX = ((cols - itensNaLinha) * (cardW + gap)) / 2;
    const x = pad + deslocamentoX + col * (cardW + gap);
    const y = headerH + row * (cardH + gap);

    ctx.fillStyle = p.corFundoCard;
    ctx.strokeStyle = '#E4E9E0';
    ctx.lineWidth = 1;
    desenharRetanguloArredondado(ctx, x, y, cardW, cardH, 14);
    ctx.fill();
    ctx.stroke();

    const photoPad = 14;
    desenharImagemContain(ctx, produto.imagem, x + photoPad, y + photoPad, cardW - photoPad * 2, photoH);

    let cursorY = y + photoPad + photoH + 24;

    ctx.fillStyle = p.corDescricao;
    ctx.font = `700 ${p.tamanhoNome}px Inter`;
    ctx.textAlign = 'left';
    const alturaLinhaNome = Math.round(p.tamanhoNome * 1.25);
    quebrarLinhasPanfleto(ctx, produto.nome.toUpperCase(), x + photoPad, cursorY, cardW - photoPad * 2, alturaLinhaNome, 2);
    cursorY += alturaLinhaNome * 2 + 12;

    if (produto.de) {
      ctx.fillStyle = '#9AA79A';
      ctx.font = `400 ${deFontSize}px Inter`;
      const textoDe = `De: R$${fmtMoney(produto.de)}`;
      ctx.fillText(textoDe, x + photoPad, cursorY);
      const larguraTexto = ctx.measureText(textoDe).width;
      ctx.strokeStyle = '#9AA79A';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(x + photoPad, cursorY - 5);
      ctx.lineTo(x + photoPad + larguraTexto, cursorY - 5);
      ctx.stroke();
      cursorY += Math.round(p.tamanhoPreco * 1.25);
    }
    ctx.fillStyle = p.corPreco;
    ctx.font = `700 ${p.tamanhoPreco}px Inter`;
    ctx.fillText(`Por: R$${fmtMoney(produto.por)}`, x + photoPad, cursorY);

    const pct = calcularDesconto(produto.de, produto.por);
    if (pct !== null && pct > 0) {
      const textoSelo = `-${pct}%`;
      ctx.font = `700 ${p.tamanhoSelo}px Inter`;
      const larguraSelo = ctx.measureText(textoSelo).width + 18;
      const alturaSelo = Math.round(p.tamanhoSelo * 1.85);
      ctx.fillStyle = '#FCEFD8';
      desenharRetanguloArredondado(ctx, x + photoPad, cursorY + 12, larguraSelo, alturaSelo, alturaSelo / 2);
      ctx.fill();
      ctx.fillStyle = '#C98A1D';
      ctx.textBaseline = 'middle';
      ctx.fillText(textoSelo, x + photoPad + 9, cursorY + 12 + alturaSelo / 2);
      ctx.textBaseline = 'alphabetic';
    }
  });

  if (produtosDaPagina.length === 0) {
    ctx.fillStyle = '#9AA79A';
    ctx.font = '500 18px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Adicione produtos pra ver o panfleto aqui', W / 2, headerH + 100);
  }

  // rodapé
  const footerY = H - footerH;
  if (manterFaixaBranca) {
    ctx.strokeStyle = '#D8E7E2';
    ctx.beginPath();
    ctx.moveTo(pad, footerY);
    ctx.lineTo(W - pad, footerY);
    ctx.stroke();
  }

  if (p.temLink && p.imagemQr) {
    const qrX = p.qrAlinhamento === 'right' ? W - pad - 130 : pad;
    ctx.drawImage(p.imagemQr, qrX, footerY + 30, 130, 130);
  }

  if (p.mostrarTextosRodape) {
    ctx.fillStyle = '#173C3A';
    ctx.font = '600 16px Inter';
    if (p.textoRodape1) desenharTextoAlinhado(ctx, p.textoRodape1, footerY + 55, p.textoRodape1Alinhamento, pad, W);

    ctx.fillStyle = '#628B00';
    ctx.font = '400 13px Inter';
    if (p.textoRodape2) desenharTextoAlinhado(ctx, p.textoRodape2, footerY + 78, p.textoRodape2Alinhamento, pad, W);
  }
}

/** Quebra a lista de produtos em páginas de `itensPorPagina` cada. */
export function construirPaginasPanfleto(produtos: ProdutoPanfleto[], itensPorPagina: number): ProdutoPanfleto[][] {
  const total = Math.max(1, Math.ceil(produtos.length / itensPorPagina));
  const paginas: ProdutoPanfleto[][] = [];
  for (let i = 0; i < total; i++) {
    paginas.push(produtos.slice(i * itensPorPagina, (i + 1) * itensPorPagina));
  }
  return paginas;
}
