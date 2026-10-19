import { arquivoCartazService } from '../services/arquivoCartazService';
import { carregarImagemDeDataUrl } from './cartazPersistencia';

/** Referência de um fundo guardado no R2 — o que vai nas preferências/estado salvo. */
export interface FundoNoServidor {
  nome: string;
  arquivoId: string;
}

/**
 * Reduz o fundo escolhido (até `larguraMaxima`) e envia pro R2 — fica
 * acessível em qualquer aparelho da organização. JPEG porque fundo de arte
 * não precisa de transparência e fica bem menor que PNG.
 */
export async function enviarFundoParaServidor(img: HTMLImageElement, larguraMaxima: number): Promise<string> {
  const largura = img.naturalWidth || larguraMaxima;
  const altura = img.naturalHeight || larguraMaxima;
  const escala = Math.min(1, larguraMaxima / largura);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas indisponível');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/jpeg', 0.9));
  return arquivoCartazService.enviarImagem(blob, 'image/jpeg');
}

/** Baixa o fundo salvo (URL nova a cada vez — as do R2 expiram). */
export async function carregarFundoDoServidor(arquivoId: string): Promise<HTMLImageElement> {
  const [url] = await arquivoCartazService.obterUrls([arquivoId]);
  if (!url) throw new Error('fundo não encontrado');
  return carregarImagemDeDataUrl(url.url);
}

/** dataURL (rascunho antigo, do navegador) → imagem, pra migrar pro servidor. */
export function imagemDeDataUrlLocal(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
