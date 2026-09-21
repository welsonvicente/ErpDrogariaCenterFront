/**
 * Motor de pintura do Story de cartazes — portado 1:1 da lógica que já existia
 * em `public/tools/cartazes.html` (função `paintStoryArt` e vizinhas). Fica
 * separado do componente React de propósito: são funções puras que só recebem
 * um `CanvasRenderingContext2D` e parâmetros, sem tocar no DOM — o mesmo motor
 * serve tanto pro preview ao vivo quanto pra gerar um story individual fora de
 * tela (como o HTML original já fazia com `generateIndividualStory`).
 */

export interface TransformImagem {
  scale: number;
  panX: number;
  panY: number;
}

export interface ParametrosStory {
  imagem: HTMLImageElement | null;
  transformImagem?: TransformImagem;
  nome: string;
  de: string;
  por: string;
  emoji: string;
  corLogo: string;
  corTextoNome: string;
  corPreco: string;
  nomeY: number;
  precoY: number;
  nomeOffsetX: number;
  precoOffsetX: number;
  tamanhoNome: number;
  tamanhoPreco: number;
  frases: string;
  frasesY: number;
  frasesOffsetX: number;
  corFundoFrases: string;
  corTextoFrases: string;
  tamanhoFrases: number;
  margemNome: number;
  margemPreco: number;
  margemFrases: number;
  /** Posições/larguras livres usadas pela edição direta no preview. Quando
   * ausentes, preservam a regra antiga de margem + deslocamento. */
  nomeX?: number;
  nomeLargura?: number;
  precoX?: number;
  precoLargura?: number;
  frasesX?: number;
  frasesLargura?: number;
}

export interface CaixaStory {
  x: number;
  y: number;
  largura: number;
  altura: number;
  larguraMinima: number;
  alturaMinima: number;
}

export interface CaixasStory {
  nome: CaixaStory | null;
  preco: CaixaStory | null;
  frases: CaixaStory | null;
}

export const LARGURA_STORY = 1080;
export const ALTURA_STORY = 1920;

export function fmtMoney(v: string | number): string {
  const n = Number(v);
  if (Number.isNaN(n)) return '0,00';
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Título mostrado na folha de compartilhar (ex.: no iPhone) — nome + preço De/Por, quando disponíveis. */
export function montarTituloCompartilhamento(nome: string, de: string, por: string): string {
  const partes = [(nome || '').trim() || 'Produto'];
  const deNum = Number(de);
  const porNum = Number(por);
  const temDe = de !== undefined && de !== null && de !== '' && !Number.isNaN(deNum) && deNum > 0;
  const temPor = por !== undefined && por !== null && por !== '' && !Number.isNaN(porNum) && porNum > 0;
  if (temDe && temPor) partes.push(`De R$ ${fmtMoney(deNum)} por R$ ${fmtMoney(porNum)}`);
  else if (temPor) partes.push(`R$ ${fmtMoney(porNum)}`);
  return partes.join(' — ');
}

export function calcularDesconto(de: string | number, por: string | number): number | null {
  const d = Number(de);
  const p = Number(por);
  if (!d || !p || d <= 0) return null;
  return Math.round((1 - p / d) * 100);
}

/** Texto pronto pra colar no WhatsApp/Instagram — um produto por bloco. */
export function montarTextoPromocional(descricao: string, de: string, por: string): string {
  const pct = calcularDesconto(de, por);
  let linha = `💊 *${descricao}*\n`;
  if (de) linha += `De: R$${fmtMoney(de)}\n`;
  if (por) linha += `Por: *R$${fmtMoney(por)}*`;
  if (pct && pct > 0) linha += ` (-${pct}%)`;
  return linha;
}

/**
 * Fonte de pixels aceita pra desenhar no canvas — imagem estática (o caso
 * normal) ou vídeo (só usado no instante da captura pela câmera, pra tirar uma
 * foto do frame atual sem esperar convertê-lo pra Image antes).
 */
export type FonteImagem = HTMLImageElement | HTMLVideoElement;

function tamanhoOrigem(img: FonteImagem) {
  if (img instanceof HTMLVideoElement) {
    return { w: img.videoWidth, h: img.videoHeight };
  }
  return { w: img.naturalWidth || img.width, h: img.naturalHeight || img.height };
}

/** transform (opcional) = {scale, panX, panY} — permite reenquadrar/dar zoom na foto sem reenviar/recortar. */
export function desenharImagemCover(
  ctx: CanvasRenderingContext2D,
  img: FonteImagem,
  x: number,
  y: number,
  w: number,
  h: number,
  transform?: TransformImagem,
) {
  const { w: iw, h: ih } = tamanhoOrigem(img);
  const imgRatio = iw / ih;
  const boxRatio = w / h;
  let baseSw: number;
  let baseSh: number;
  if (imgRatio > boxRatio) {
    baseSh = ih;
    baseSw = baseSh * boxRatio;
  } else {
    baseSw = iw;
    baseSh = baseSw / boxRatio;
  }
  const scale = Math.max(1, transform?.scale || 1);
  const panX = transform?.panX ?? 0.5;
  const panY = transform?.panY ?? 0.5;
  const sw = baseSw / scale;
  const sh = baseSh / scale;
  const maxSx = iw - sw;
  const maxSy = ih - sh;
  const sx = Math.max(0, Math.min(maxSx, maxSx * panX));
  const sy = Math.max(0, Math.min(maxSy, maxSy * panY));
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Encaixa a imagem inteira dentro da caixa sem cortar nada (usado nos cards do panfleto — cover cortaria a foto do produto). */
export function desenharImagemContain(ctx: CanvasRenderingContext2D, img: FonteImagem, x: number, y: number, w: number, h: number) {
  const { w: iw, h: ih } = tamanhoOrigem(img);
  const imgRatio = iw / ih;
  const boxRatio = w / h;
  let dw: number;
  let dh: number;
  if (imgRatio > boxRatio) {
    dw = w;
    dh = w / imgRatio;
  } else {
    dh = h;
    dw = h * imgRatio;
  }
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

export function desenharRetanguloArredondado(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Posição X da faixa (nome/preço/frases), já dentro dos limites do canvas —
 * `offsetX` é o quanto a pessoa arrastou a faixa lateralmente a partir do
 * centro, e o clamp evita que ela saia da largura visível.
 */
export function posicaoXFaixa(margem: number, offsetX: number, larguraCanvas = LARGURA_STORY): number {
  const larguraFaixa = larguraCanvas - margem * 2;
  let x = (larguraCanvas - larguraFaixa) / 2 + offsetX;
  x = Math.max(0, Math.min(larguraCanvas - larguraFaixa, x));
  return x;
}

function quebrarLinhas(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number): string[] {
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
  if (linha.trim()) linhas.push(linha.trim());
  return linhas.slice(0, 3);
}

function caixaLivre(larguraCanvas: number, margem: number, offsetX: number, xLivre?: number, larguraLivre?: number, larguraMinima = 1) {
  const largura = Math.max(larguraMinima, Math.min(larguraCanvas, larguraLivre ?? larguraCanvas - margem * 2));
  const xPadrao = posicaoXFaixa(margem, offsetX, larguraCanvas);
  const x = Math.max(0, Math.min(larguraCanvas - largura, xLivre ?? xPadrao));
  return { x, largura };
}

/**
 * Mede as caixas realmente desenhadas no story. O preview usa essa mesma
 * geometria para a seleção direta, portanto a área clicável acompanha o
 * conteúdo final — não uma faixa genérica maior que o item.
 */
export function calcularCaixasStory(ctx: CanvasRenderingContext2D, largura: number, p: ParametrosStory): CaixasStory {
  let nome: CaixaStory | null = null;
  let preco: CaixaStory | null = null;
  let frases: CaixaStory | null = null;

  ctx.save();
  if (p.nome) {
    ctx.font = `600 ${p.tamanhoNome}px Fredoka`;
    const maiorPalavra = Math.max(...p.nome.toUpperCase().split(/\s+/).map((palavra) => ctx.measureText(palavra).width));
    const larguraMinima = Math.min(largura, maiorPalavra + 60);
    const caixa = caixaLivre(largura, p.margemNome, p.nomeOffsetX, p.nomeX, p.nomeLargura, larguraMinima);
    const linhas = quebrarLinhas(ctx, p.nome.toUpperCase(), caixa.largura - 60);
    const alturaLinha = Math.round(p.tamanhoNome * 1.3);
    const padVertical = Math.round(p.tamanhoNome * 0.6);
    nome = {
      ...caixa,
      y: p.nomeY,
      altura: linhas.length * alturaLinha + padVertical * 2,
      larguraMinima,
      alturaMinima: alturaLinha + padVertical * 2,
    };
  }

  if (p.de || p.por) {
    const textoDe = p.de ? `De: R$${fmtMoney(p.de)}` : '';
    const textoPor = p.por ? `Por: R$${fmtMoney(p.por)} ${p.emoji || ''}` : '';
    ctx.font = `700 ${Math.max(24, p.tamanhoPreco - 8)}px Fredoka`;
    const larguraDe = textoDe ? ctx.measureText(textoDe).width : 0;
    ctx.font = `700 ${p.tamanhoPreco}px Fredoka`;
    const larguraPor = textoPor ? ctx.measureText(textoPor).width : 0;
    const larguraMinima = Math.min(largura, Math.max(larguraDe, larguraPor) + 72);
    const caixa = caixaLivre(largura, p.margemPreco, p.precoOffsetX, p.precoX, p.precoLargura, larguraMinima);
    const alturaLinha = Math.round(p.tamanhoPreco * 1.48);
    const padVertical = Math.round(p.tamanhoPreco * 0.55);
    preco = {
      ...caixa,
      y: p.precoY,
      altura: (p.de && p.por ? alturaLinha * 2 : alturaLinha) + padVertical * 2,
      larguraMinima,
      alturaMinima: (p.de && p.por ? alturaLinha * 2 : alturaLinha) + padVertical * 2,
    };
  }

  const linhasFrases = p.frases
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  if (linhasFrases.length) {
    const tamanho = p.tamanhoFrases || 32;
    const alturaLinha = Math.round(tamanho * 1.375);
    const padVertical = Math.round(tamanho * 0.625);
    ctx.font = `600 ${tamanho}px Inter`;
    const larguraMinima = Math.min(largura, Math.max(...linhasFrases.map((linha) => ctx.measureText(linha).width)) + 60);
    const caixa = caixaLivre(largura, p.margemFrases, p.frasesOffsetX, p.frasesX, p.frasesLargura, larguraMinima);
    frases = {
      ...caixa,
      y: p.frasesY,
      altura: linhasFrases.length * alturaLinha + padVertical * 2,
      larguraMinima,
      alturaMinima: linhasFrases.length * alturaLinha + padVertical * 2,
    };
  }
  ctx.restore();

  return { nome, preco, frases };
}

/** Pinta o story inteiro (1080×1920) no contexto dado — usada tanto pro preview ao vivo quanto pra exportar fora de tela. */
export function pintarStory(ctx: CanvasRenderingContext2D, largura: number, altura: number, p: ParametrosStory) {
  ctx.clearRect(0, 0, largura, altura);

  if (p.imagem) {
    desenharImagemCover(ctx, p.imagem, 0, 0, largura, altura, p.transformImagem);
  } else {
    ctx.fillStyle = '#DDEBD8';
    ctx.fillRect(0, 0, largura, altura);
    ctx.fillStyle = '#7A8F72';
    ctx.font = '500 34px Inter';
    ctx.textAlign = 'center';
    ctx.fillText('Escolha a foto do produto', largura / 2, altura / 2);
  }

  const caixas = calcularCaixasStory(ctx, largura, p);

  // Faixa com o nome do produto.
  if (p.nome) {
    ctx.save();
    const caixa = caixas.nome!;
    const larguraFaixa = caixa.largura;
    const xFaixa = caixa.x;
    ctx.font = `600 ${p.tamanhoNome}px Fredoka`;
    const linhas = quebrarLinhas(ctx, p.nome.toUpperCase(), larguraFaixa - 60);
    const alturaLinha = Math.round(p.tamanhoNome * 1.3);
    const padVertical = Math.round(p.tamanhoNome * 0.6);
    const alturaFaixa = caixa.altura;

    ctx.fillStyle = p.corLogo;
    desenharRetanguloArredondado(ctx, xFaixa, p.nomeY, larguraFaixa, alturaFaixa, 28);
    ctx.fill();

    ctx.fillStyle = p.corTextoNome;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    linhas.forEach((linha, i) => {
      ctx.fillText(linha, xFaixa + larguraFaixa / 2, p.nomeY + padVertical + alturaLinha / 2 + i * alturaLinha);
    });
    ctx.restore();
  }

  // Faixa de preço.
  if (p.de || p.por) {
    ctx.save();
    const caixa = caixas.preco!;
    const larguraFaixa = caixa.largura;
    const xFaixa = caixa.x;
    const tamanhoDe = Math.max(24, p.tamanhoPreco - 8);
    const textoDe = p.de ? `De: R$${fmtMoney(p.de)}` : '';
    const textoPor = p.por ? `Por: R$${fmtMoney(p.por)} ${p.emoji || ''}` : '';
    const alturaLinha = Math.round(p.tamanhoPreco * 1.48);
    const padVertical = Math.round(p.tamanhoPreco * 0.55);
    const alturaFaixa = caixa.altura;
    const yFaixa = p.precoY;

    ctx.fillStyle = '#FBD6E4';
    desenharRetanguloArredondado(ctx, xFaixa, yFaixa, larguraFaixa, alturaFaixa, 34);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let y = yFaixa + padVertical + alturaLinha / 2;

    if (textoDe) {
      ctx.font = `700 ${tamanhoDe}px Fredoka`;
      ctx.fillStyle = p.corPreco;
      const larguraDe = ctx.measureText(textoDe).width;
      ctx.fillText(textoDe, xFaixa + larguraFaixa / 2, y);
      ctx.strokeStyle = p.corPreco;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(xFaixa + larguraFaixa / 2 - larguraDe / 2 - 4, y);
      ctx.lineTo(xFaixa + larguraFaixa / 2 + larguraDe / 2 + 4, y);
      ctx.stroke();
      y += alturaLinha;
    }
    if (textoPor) {
      ctx.font = `700 ${p.tamanhoPreco}px Fredoka`;
      ctx.fillStyle = p.corPreco;
      ctx.fillText(textoPor, xFaixa + larguraFaixa / 2, y);
    }
    ctx.restore();
  }

  // Faixa de frases extras.
  if (p.frases) {
    const linhas = p.frases
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (linhas.length) {
      ctx.save();
      const caixa = caixas.frases!;
      const larguraFaixa = caixa.largura;
      const xFaixa = caixa.x;
      const tamanho = p.tamanhoFrases || 32;
      ctx.font = `600 ${tamanho}px Inter`;
      const alturaLinha = Math.round(tamanho * 1.375);
      const padVertical = Math.round(tamanho * 0.625);
      const alturaFaixa = caixa.altura;

      ctx.fillStyle = p.corFundoFrases || 'rgba(23,60,58,0.82)';
      desenharRetanguloArredondado(ctx, xFaixa, p.frasesY, larguraFaixa, alturaFaixa, 24);
      ctx.fill();

      ctx.fillStyle = p.corTextoFrases || '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      linhas.forEach((linha, i) => {
        ctx.fillText(linha, xFaixa + larguraFaixa / 2, p.frasesY + padVertical + alturaLinha / 2 + i * alturaLinha);
      });
      ctx.restore();
    }
  }
}
