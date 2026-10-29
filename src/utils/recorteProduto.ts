/**
 * Recorte do produto (tirar o fundo e a mão) direto no navegador, com o
 * SlimSAM (Segment Anything reduzido, licença Apache-2.0) via transformers.js.
 * Nada sai do aparelho: o modelo (~14MB) é baixado do Hugging Face na
 * primeira vez e fica no cache do navegador.
 *
 * A IA roda num Web Worker (ver `recorte.worker.ts`): a tela não trava
 * enquanto ela pensa. O worker só nasce quando alguém abre o recorte e é
 * encerrado depois de alguns minutos sem uso, devolvendo a memória.
 */
import type { PedidoRecorte, RespostaRecorte } from './recorte.worker';
import type { PontoRecorte } from './recorteMascara';

export type { PontoRecorte } from './recorteMascara';

/** Lado maior da foto usada no recorte — o bastante pro story e leve pra memória do celular. */
export const LADO_MAXIMO_RECORTE = 1600;
/** Sem uso por esse tempo, o worker (e o modelo na memória) é encerrado. */
const ENCERRAR_APOS_MS = 3 * 60 * 1000;

let worker: Worker | null = null;
let timerEncerrar: ReturnType<typeof setTimeout> | null = null;
let proximoId = 1;
const pendentes = new Map<number, { resolver: (r: RespostaRecorte) => void; rejeitar: (e: Error) => void; onProgresso?: (p: number) => void }>();

function obterWorker(): Worker {
  if (timerEncerrar) clearTimeout(timerEncerrar);
  timerEncerrar = setTimeout(encerrarWorkerRecorte, ENCERRAR_APOS_MS);
  if (worker) return worker;
  worker = new Worker(new URL('./recorte.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (e: MessageEvent<RespostaRecorte>) => {
    const r = e.data;
    const pendente = pendentes.get(r.id);
    if (!pendente) return;
    if (r.tipo === 'progresso') return pendente.onProgresso?.(r.percentual);
    pendentes.delete(r.id);
    if (r.tipo === 'erro') pendente.rejeitar(new Error(r.mensagem));
    else pendente.resolver(r);
  };
  worker.onerror = () => {
    pendentes.forEach((p) => p.rejeitar(new Error('worker de recorte falhou')));
    pendentes.clear();
    encerrarWorkerRecorte();
  };
  return worker;
}

/** Encerra a IA e libera a memória (a próxima vez recarrega do cache do navegador, em segundos). */
export function encerrarWorkerRecorte() {
  if (timerEncerrar) clearTimeout(timerEncerrar);
  timerEncerrar = null;
  worker?.terminate();
  worker = null;
  pendentes.forEach((p) => p.rejeitar(new Error('recorte encerrado')));
  pendentes.clear();
}

type SemId<T> = T extends unknown ? Omit<T, 'id'> : never;

function pedir(pedido: SemId<PedidoRecorte>, transferir: Transferable[] = [], onProgresso?: (p: number) => void): Promise<RespostaRecorte> {
  const w = obterWorker();
  const id = proximoId++;
  return new Promise((resolver, rejeitar) => {
    pendentes.set(id, { resolver, rejeitar, onProgresso });
    w.postMessage({ ...pedido, id }, transferir);
  });
}

/** Copia a imagem num canvas de até `LADO_MAXIMO_RECORTE` px — é nesse tamanho que o recorte trabalha e sai. */
export function canvasDeTrabalho(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const escala = Math.min(1, LADO_MAXIMO_RECORTE / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * escala));
  canvas.height = Math.max(1, Math.round(h * escala));
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** Uma foto preparada pro recorte (o worker guarda a parte cara; cada clique só refaz a máscara). */
export class SessaoRecorte {
  readonly largura: number;
  readonly altura: number;

  private constructor(largura: number, altura: number) {
    this.largura = largura;
    this.altura = altura;
  }

  static async criar(canvas: HTMLCanvasElement, onProgresso?: (percentual: number) => void): Promise<SessaoRecorte> {
    const { width, height } = canvas;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
    await pedir({ tipo: 'preparar', largura: width, altura: height, pixels }, [pixels.buffer], onProgresso);
    return new SessaoRecorte(width, height);
  }

  /** As 3 máscaras candidatas (1 = produto), já limpas e da mais provável pra menos. */
  async segmentar(pontos: PontoRecorte[]): Promise<Uint8Array[]> {
    const r = await pedir({ tipo: 'segmentar', pontos });
    if (r.tipo !== 'mascaras') throw new Error('resposta inesperada');
    return r.mascaras;
  }
}

/**
 * Gera o PNG do produto recortado: aplica a máscara (menos o que a borracha apagou),
 * suaviza 1px a borda e corta o vazio em volta (sobra uma margem pequena).
 */
export async function montarProdutoRecortado(origem: HTMLCanvasElement, mascara: Uint8Array, apagado: Uint8Array | null): Promise<{ blob: Blob; imagem: HTMLImageElement } | null> {
  const w = origem.width;
  const h = origem.height;
  const alfa = document.createElement('canvas');
  alfa.width = w;
  alfa.height = h;
  const actx = alfa.getContext('2d')!;
  const dadosAlfa = actx.createImageData(w, h);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let i = 0; i < w * h; i++) {
    if (!mascara[i] || apagado?.[i]) continue;
    dadosAlfa.data[i * 4 + 3] = 255;
    const x = i % w, y = (i / w) | 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (maxX < 0) return null;
  actx.putImageData(dadosAlfa, 0, 0);

  const resultado = document.createElement('canvas');
  resultado.width = w;
  resultado.height = h;
  const rctx = resultado.getContext('2d')!;
  rctx.drawImage(origem, 0, 0);
  rctx.globalCompositeOperation = 'destination-in';
  rctx.filter = 'blur(1px)'; // borda menos serrilhada
  rctx.drawImage(alfa, 0, 0);

  const margem = Math.round(Math.max(maxX - minX, maxY - minY) * 0.03);
  const x0 = Math.max(0, minX - margem), y0 = Math.max(0, minY - margem);
  const x1 = Math.min(w, maxX + 1 + margem), y1 = Math.min(h, maxY + 1 + margem);
  const final = document.createElement('canvas');
  final.width = x1 - x0;
  final.height = y1 - y0;
  final.getContext('2d')!.drawImage(resultado, x0, y0, final.width, final.height, 0, 0, final.width, final.height);

  const blob = await new Promise<Blob>((resolve, reject) => final.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png'));
  const imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
  return { blob, imagem };
}
