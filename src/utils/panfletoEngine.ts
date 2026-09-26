/**
 * Motor de pintura do Panfleto (vários produtos por página) — portado 1:1 da
 * lógica que já existia em `public/tools/cartazes.html` (`renderFlyerPage` e
 * vizinhas). Mesma separação de responsabilidade do `cartazEngine.ts`: funções
 * puras que só recebem um `HTMLCanvasElement`/`CanvasRenderingContext2D` e
 * parâmetros, sem tocar no DOM da aplicação.
 */

import { calcularDesconto, desenharImagemContain, desenharRetanguloArredondado, fmtMoney, tamanhoOrigem, type FonteImagem, type ParametrosStory, type TransformImagem } from './cartazEngine';
import type { ConfiguracoesStory } from './cartazPersistencia';

export type AlinhamentoTexto = 'left' | 'center' | 'right';

export const TRANSFORM_PADRAO_PANFLETO: TransformImagem = { scale: 1, panX: 0.5, panY: 0.5 };

interface GuiaFaixa {
  y: number;
  offsetX: number;
  x?: number;
  largura?: number;
}

/**
 * Ajustes do story individual (1080×1920) de UM produto específico —
 * qualquer campo ausente cai no padrão configurado no modo Story
 * (`cartazes_story_settings_v1`). Mesmo formato de `ConfiguracoesStory`,
 * mas todo opcional: aqui é uma exceção pontual por produto, não uma
 * preferência geral.
 */
export interface AjustesStoryProduto {
  corLogo?: string;
  corTextoNome?: string;
  corPreco?: string;
  tamanhoNome?: number;
  tamanhoPreco?: number;
  margemNome?: number;
  margemPreco?: number;
  frasesAtivo?: boolean;
  frases?: string;
  corFundoFrases?: string;
  corTextoFrases?: string;
  tamanhoFrases?: number;
  margemFrases?: number;
  guiaNome?: GuiaFaixa;
  guiaPreco?: GuiaFaixa;
  guiaFrases?: GuiaFaixa;
}

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
  /** Ajustes salvos especificamente pro story deste produto — ver `AjustesStoryProduto`. Ausente = usa só o padrão do Story. */
  ajustesStory?: AjustesStoryProduto;
  /**
   * Id do arquivo no R2 (ver `ArquivoCartazService` no backend) — nulo
   * enquanto o upload dessa foto ainda está em andamento/falhou. Não afeta a
   * pintura (que só usa `imagem`), só a persistência do projeto.
   */
  arquivoId?: string | null;
}

const GUIA_PADRAO_NOME: GuiaFaixa = { y: 130, offsetX: 0 };
const GUIA_PADRAO_PRECO: GuiaFaixa = { y: 320, offsetX: 0 };
const GUIA_PADRAO_FRASES: GuiaFaixa = { y: 560, offsetX: 0 };

/**
 * Monta os parâmetros completos pra pintar o story (1080×1920) de UM
 * produto — usado tanto pelo editor individual quanto por "Baixar todos os
 * stories". `ajustesStory` do produto tem prioridade, senão cai no padrão
 * configurado no Story (`padrao`, de `carregarConfiguracoes()`), senão nas
 * constantes embutidas — mesma cascata em qualquer lugar que gere um story.
 */
export function montarParametrosStoryProduto(
  produto: ProdutoPanfleto,
  padrao: Partial<ConfiguracoesStory>,
  emoji: string,
): ParametrosStory {
  const a = produto.ajustesStory;
  function r<T>(doProduto: T | undefined, doPadrao: T | undefined, embutido: T): T {
    return doProduto ?? doPadrao ?? embutido;
  }
  const guiaNome = r(a?.guiaNome, padrao.guiaNome, GUIA_PADRAO_NOME);
  const guiaPreco = r(a?.guiaPreco, padrao.guiaPreco, GUIA_PADRAO_PRECO);
  const guiaFrases = r(a?.guiaFrases, padrao.guiaFrases, GUIA_PADRAO_FRASES);
  const frasesAtivo = r(a?.frasesAtivo, padrao.frasesAtivo, true);

  return {
    imagem: produto.imagem,
    transformImagem: produto.transform,
    nome: produto.nome,
    de: produto.de,
    por: produto.por,
    emoji,
    corLogo: r(a?.corLogo, padrao.corLogo, '#436000'),
    corTextoNome: r(a?.corTextoNome, padrao.corTextoNome, '#FFFFFF'),
    corPreco: r(a?.corPreco, padrao.corPreco, '#E30613'),
    nomeY: guiaNome.y,
    precoY: guiaPreco.y,
    nomeOffsetX: guiaNome.offsetX,
    precoOffsetX: guiaPreco.offsetX,
    nomeX: guiaNome.x,
    nomeLargura: guiaNome.largura,
    precoX: guiaPreco.x,
    precoLargura: guiaPreco.largura,
    tamanhoNome: r(a?.tamanhoNome, padrao.tamanhoNome, 40),
    tamanhoPreco: r(a?.tamanhoPreco, padrao.tamanhoPreco, 62),
    frases: frasesAtivo ? r(a?.frases, padrao.frases, '') : '',
    frasesY: guiaFrases.y,
    frasesOffsetX: guiaFrases.offsetX,
    frasesX: guiaFrases.x,
    frasesLargura: guiaFrases.largura,
    corFundoFrases: r(a?.corFundoFrases, padrao.corFundoFrases, '#173C3A'),
    corTextoFrases: r(a?.corTextoFrases, padrao.corTextoFrases, '#FFFFFF'),
    tamanhoFrases: r(a?.tamanhoFrases, padrao.tamanhoFrases, 32),
    margemNome: r(a?.margemNome, padrao.margemNome, 60),
    margemPreco: r(a?.margemPreco, padrao.margemPreco, 60),
    margemFrases: r(a?.margemFrases, padrao.margemFrases, 60),
  };
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
  /** Logomarca/selo (PNG com fundo transparente) — uma só pro panfleto inteiro, desenhada em cada página na posição de `logoCaixa`. */
  imagemLogo: FonteImagem | null;
  logoCaixa: CaixaLogoPanfleto | null;
}

/**
 * Posição/tamanho da logomarca do panfleto, em proporção da página (não em
 * px) — a página muda de tamanho conforme itens por página, borda, link do
 * QR e quantidade de produtos na última página, e a logo tem que continuar
 * no mesmo lugar relativo. `x`, `largura` e `altura` são frações da LARGURA
 * da página (a largura não muda entre páginas, então a logo mantém o mesmo
 * tamanho em todas); `y` é fração da ALTURA (quem está no rodapé continua no
 * rodapé numa página mais curta).
 */
export interface CaixaLogoPanfleto {
  x: number;
  y: number;
  largura: number;
  altura: number;
}

export interface DimensaoPaginaPanfleto {
  largura: number;
  altura: number;
}

/** Converte a caixa relativa da logo pra coordenadas lógicas de uma página de tamanho `pagina`, sempre cabendo inteira dentro dela. */
export function caixaLogoAbsoluta(caixa: CaixaLogoPanfleto, pagina: DimensaoPaginaPanfleto) {
  const largura = Math.min(pagina.largura, caixa.largura * pagina.largura);
  const altura = Math.min(pagina.altura, caixa.altura * pagina.largura);
  return {
    x: Math.max(0, Math.min(pagina.largura - largura, caixa.x * pagina.largura)),
    y: Math.max(0, Math.min(pagina.altura - altura, caixa.y * pagina.altura)),
    largura,
    altura,
  };
}

/** Inverso de `caixaLogoAbsoluta` — usado quando a pessoa arrasta/redimensiona a logo na prévia. */
export function caixaLogoRelativa(caixa: { x: number; y: number; largura: number; altura: number }, pagina: DimensaoPaginaPanfleto): CaixaLogoPanfleto {
  return {
    x: caixa.x / pagina.largura,
    y: caixa.y / pagina.altura,
    largura: caixa.largura / pagina.largura,
    altura: caixa.altura / pagina.largura,
  };
}

/** Posição inicial de uma logo recém-escolhida: canto superior direito, na faixa do cabeçalho, respeitando a proporção do PNG. */
export function caixaLogoPadrao(logo: FonteImagem, pagina: DimensaoPaginaPanfleto, borda: number): CaixaLogoPanfleto {
  const { w, h } = tamanhoOrigem(logo);
  const proporcao = h / w || 1;
  const largura = Math.min(160, 90 / proporcao);
  const altura = largura * proporcao;
  return caixaLogoRelativa({ x: pagina.largura - borda - largura, y: 20, largura, altura }, pagina);
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
): DimensaoPaginaPanfleto {
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
  if (!ctx) return { largura: W, altura: H };
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

  // Logomarca por último — fica por cima de tudo, onde a pessoa posicionou.
  if (p.imagemLogo && p.logoCaixa) {
    const caixa = caixaLogoAbsoluta(p.logoCaixa, { largura: W, altura: H });
    desenharImagemContain(ctx, p.imagemLogo, caixa.x, caixa.y, caixa.largura, caixa.altura);
  }

  return { largura: W, altura: H };
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
