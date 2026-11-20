import type { Cel, DocumentoRel, SecaoRel } from './relatorio';

const LARGURA = 1600;
const MARGEM = 32;
const PAD = 8;
const FONTE = '"Inter", "Segoe UI", system-ui, -apple-system, Arial, sans-serif';
const LINHA_H = 18;
const VERDE = '#628B00';
const VERDE_ESCURO = '#173C3A';
const CINZA = '#5B6B68';
const BORDA = '#D8E7E2';
const ZEBRA = '#F6FBF0';
/** Teto de pixels reais da imagem em cada eixo — acima disso alguns navegadores devolvem canvas em branco. */
const MAX_PX = 16000;

type Ctx = CanvasRenderingContext2D;

function quebrar(ctx: Ctx, texto: string, largura: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split('\n')) {
    let atual = '';
    for (const palavra of paragrafo.split(/\s+/)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (atual && ctx.measureText(tentativa).width > largura) {
        linhas.push(atual);
        atual = palavra;
      } else {
        atual = tentativa;
      }
    }
    linhas.push(atual);
  }
  return linhas.length ? linhas : [''];
}

function fonte(ctx: Ctx, tamanho: number, peso: 'normal' | 'bold' | 'italic' = 'normal') {
  ctx.font = `${peso === 'italic' ? 'italic ' : peso === 'bold' ? '700 ' : ''}${tamanho}px ${FONTE}`;
}

const cel = (c: Cel) => (typeof c === 'string' ? { t: c, cor: undefined as string | undefined, negrito: false } : { t: c.t, cor: c.cor, negrito: !!c.negrito });

/**
 * Desenha o documento inteiro. Com `ctx` do tamanho certo ele pinta; antes disso
 * roda em modo "medir" (só soma as alturas) pra saber o tamanho da imagem.
 */
function desenhar(ctx: Ctx, doc: DocumentoRel, pintar: boolean): number {
  const util = LARGURA - 2 * MARGEM;
  let y = 0;

  if (pintar) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, LARGURA, 20000);
    ctx.fillStyle = VERDE;
    ctx.fillRect(0, 0, LARGURA, 8);
  }
  y = 44;
  fonte(ctx, 28, 'bold');
  if (pintar) {
    ctx.fillStyle = VERDE_ESCURO;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(doc.titulo, MARGEM, y);
  }
  y += 10;
  fonte(ctx, 14);
  for (const linha of doc.contexto) {
    y += 22;
    if (pintar) {
      ctx.fillStyle = CINZA;
      ctx.fillText(linha, MARGEM, y);
    }
  }
  if (doc.veredito) {
    y += 14;
    fonte(ctx, 15, 'bold');
    const texto = `Veredito: ${doc.veredito.texto}`;
    const w = ctx.measureText(texto).width + 28;
    if (pintar) {
      ctx.fillStyle = doc.veredito.cor;
      ctx.beginPath();
      ctx.roundRect(MARGEM, y, w, 32, 8);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(texto, MARGEM + 14, y + 22);
    }
    y += 32;
  }
  y += 22;

  for (const secao of doc.secoes) y = desenharSecao(ctx, secao, y, util, pintar) + 26;
  fonte(ctx, 11);
  y += 4;
  if (pintar) {
    ctx.fillStyle = CINZA;
    const agora = new Date();
    ctx.fillText(`PharmaMind · Crítica de pedido · gerado em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, MARGEM, y);
  }
  return y + 22;
}

function desenharSecao(ctx: Ctx, secao: SecaoRel, yInicial: number, util: number, pintar: boolean): number {
  let y = yInicial;
  fonte(ctx, 19, 'bold');
  y += 20;
  if (pintar) {
    ctx.fillStyle = VERDE_ESCURO;
    ctx.fillText(secao.titulo, MARGEM, y);
  }
  if (secao.nota) {
    fonte(ctx, 12, 'italic');
    for (const l of quebrar(ctx, secao.nota, util)) {
      y += 17;
      if (pintar) {
        ctx.fillStyle = CINZA;
        ctx.fillText(l, MARGEM, y);
      }
    }
  }
  y += 12;

  const soma = secao.colunas.reduce((s, c) => s + c.peso, 0);
  const larguras = secao.colunas.map((c) => (c.peso / soma) * util);
  const xs = larguras.map((_, i) => MARGEM + larguras.slice(0, i).reduce((s, w) => s + w, 0));

  // cabeçalho
  fonte(ctx, 12.5, 'bold');
  const linhasCab = secao.colunas.map((c, i) => quebrar(ctx, c.rotulo, larguras[i] - 2 * PAD));
  const alturaCab = Math.max(...linhasCab.map((l) => l.length)) * LINHA_H + 14;
  if (pintar) {
    ctx.fillStyle = VERDE;
    ctx.fillRect(MARGEM, y, util, alturaCab);
    ctx.fillStyle = '#FFFFFF';
    secao.colunas.forEach((c, i) => {
      linhasCab[i].forEach((l, k) => {
        ctx.textAlign = c.alinhar === 'dir' ? 'right' : 'center';
        ctx.fillText(l, c.alinhar === 'dir' ? xs[i] + larguras[i] - PAD : xs[i] + larguras[i] / 2, y + 7 + LINHA_H * (k + 1) - 5);
      });
    });
    ctx.textAlign = 'left';
  }
  y += alturaCab;

  const todas = [...secao.linhas, ...(secao.total ? [secao.total] : [])];
  todas.forEach((linha, idx) => {
    const ehTotal = !!secao.total && idx === todas.length - 1;
    const conteudo = linha.celulas.map(cel);
    const quebradas = conteudo.map((c, i) => {
      fonte(ctx, 12.5, c.negrito || linha.negrito || ehTotal ? 'bold' : 'normal');
      return quebrar(ctx, c.t, larguras[i] - 2 * PAD);
    });
    const altura = Math.max(...quebradas.map((l) => l.length)) * LINHA_H + 12;
    if (pintar) {
      ctx.fillStyle = ehTotal ? '#EAF7CC' : idx % 2 === 1 ? ZEBRA : '#FFFFFF';
      ctx.fillRect(MARGEM, y, util, altura);
      ctx.strokeStyle = BORDA;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(MARGEM, y + altura);
      ctx.lineTo(MARGEM + util, y + altura);
      ctx.stroke();
      if (linha.faixa) {
        ctx.fillStyle = linha.faixa;
        ctx.fillRect(MARGEM, y, 5, altura);
      }
      conteudo.forEach((c, i) => {
        fonte(ctx, 12.5, c.negrito || linha.negrito || ehTotal ? 'bold' : 'normal');
        ctx.fillStyle = c.cor ?? VERDE_ESCURO;
        const direita = secao.colunas[i].alinhar === 'dir';
        ctx.textAlign = direita ? 'right' : 'left';
        quebradas[i].forEach((l, k) => ctx.fillText(l, direita ? xs[i] + larguras[i] - PAD : xs[i] + PAD + (i === 0 ? 4 : 0), y + 6 + LINHA_H * (k + 1) - 5));
        ctx.textAlign = 'left';
      });
    }
    y += altura;
  });
  return y;
}

/** Imagem PNG nítida (2x) do documento, pronta pra mandar no WhatsApp. */
export async function gerarPng(doc: DocumentoRel): Promise<Blob> {
  const medidor = document.createElement('canvas').getContext('2d');
  if (!medidor) throw new Error('Seu navegador não conseguiu gerar a imagem.');
  const altura = Math.ceil(desenhar(medidor, doc, false));

  const escala = Math.min(2, MAX_PX / altura, MAX_PX / LARGURA);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(LARGURA * escala);
  canvas.height = Math.round(altura * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Seu navegador não conseguiu gerar a imagem.');
  ctx.scale(escala, escala);
  ctx.textBaseline = 'alphabetic';
  desenhar(ctx, doc, true);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar a imagem.'))), 'image/png'));
}
