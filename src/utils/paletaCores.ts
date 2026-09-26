/**
 * Cores pro seletor de Cartazes (ver components/cartazes/SeletorCor.tsx):
 * a paleta das cores principais de uma foto e o "conta-gotas" que lê a cor
 * de um ponto da arte. Tudo local no navegador, nada sai pra rede.
 */

export type FontePaleta = HTMLImageElement | HTMLCanvasElement;

function paraHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function distancia(a: [number, number, number], b: [number, number, number]) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * Cores mais presentes na imagem, já sem tons quase iguais repetidos.
 * Reduz a imagem pra 64px e agrupa por faixas de cor (4 bits por canal) —
 * rápido o bastante pra rodar a cada vez que o seletor abre. `[]` se a
 * imagem ainda não carregou ou não puder ser lida (canvas "contaminado"
 * por imagem de outra origem sem CORS).
 */
export function extrairPaleta(fonte: FontePaleta | null | undefined, quantidade = 8): string[] {
  if (!fonte) return [];
  const larguraOrigem = fonte instanceof HTMLImageElement ? fonte.naturalWidth || fonte.width : fonte.width;
  const alturaOrigem = fonte instanceof HTMLImageElement ? fonte.naturalHeight || fonte.height : fonte.height;
  if (!larguraOrigem || !alturaOrigem) return [];

  const lado = 64;
  const escala = Math.min(1, lado / Math.max(larguraOrigem, alturaOrigem));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(larguraOrigem * escala));
  canvas.height = Math.max(1, Math.round(alturaOrigem * escala));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  let dados: Uint8ClampedArray;
  try {
    ctx.drawImage(fonte, 0, 0, canvas.width, canvas.height);
    dados = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return [];
  }

  const grupos = new Map<number, { soma: [number, number, number]; total: number }>();
  for (let i = 0; i < dados.length; i += 4) {
    if (dados[i + 3] < 128) continue; // ignora transparente
    const r = dados[i];
    const g = dados[i + 1];
    const b = dados[i + 2];
    const chave = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const grupo = grupos.get(chave) ?? { soma: [0, 0, 0], total: 0 };
    grupo.soma[0] += r;
    grupo.soma[1] += g;
    grupo.soma[2] += b;
    grupo.total += 1;
    grupos.set(chave, grupo);
  }

  const ordenados = Array.from(grupos.values())
    .sort((a, b) => b.total - a.total)
    .map((grupo) => grupo.soma.map((v) => v / grupo.total) as [number, number, number]);

  const escolhidas: [number, number, number][] = [];
  for (const cor of ordenados) {
    if (escolhidas.every((outra) => distancia(outra, cor) > 48)) escolhidas.push(cor);
    if (escolhidas.length >= quantidade) break;
  }
  return escolhidas.map(([r, g, b]) => paraHex(r, g, b));
}

/**
 * Cor do pixel sob o ponto clicado (coordenadas da tela), ou `null` se o
 * clique foi fora do canvas / ele não pode ser lido. Converte pra
 * resolução real do canvas — a prévia costuma estar reduzida via CSS.
 */
export function lerCorDoCanvas(canvas: HTMLCanvasElement, clientX: number, clientY: number): string | null {
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom || !rect.width || !rect.height) return null;
  const x = Math.min(canvas.width - 1, Math.floor(((clientX - rect.left) / rect.width) * canvas.width));
  const y = Math.min(canvas.height - 1, Math.floor(((clientY - rect.top) / rect.height) * canvas.height));
  try {
    const [r, g, b] = canvas.getContext('2d')!.getImageData(x, y, 1, 1).data;
    return paraHex(r, g, b);
  } catch {
    return null;
  }
}

/** Valor de cor de fundo pra "Sem fundo" — o motor de pintura pula o quadrante e deixa só a letra. */
export const SEM_FUNDO = 'transparent';

export function ehSemFundo(cor: string | null | undefined) {
  return cor === SEM_FUNDO;
}
