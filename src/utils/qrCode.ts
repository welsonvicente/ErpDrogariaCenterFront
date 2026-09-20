import QRCode from 'qrcode';

/**
 * Cache de QR codes já gerados — a mesma pessoa costuma ficar ajustando
 * outros controles do panfleto (cor, tamanho) sem mexer no link, então gerar
 * de novo a cada pintura seria trabalho repetido à toa.
 */
const cache = new Map<string, HTMLImageElement>();

/**
 * Gera (ou reaproveita do cache) uma imagem de QR code pra um texto/link.
 * `tamanhoPx` já deve vir na resolução final desejada (ver ESCALA_EXPORTACAO
 * em panfletoEngine.ts) — gerar pequeno e ampliar no draw deixaria borrado.
 */
export async function gerarImagemQr(texto: string, tamanhoPx: number): Promise<HTMLImageElement> {
  const chave = `${texto}::${tamanhoPx}`;
  const emCache = cache.get(chave);
  if (emCache) return emCache;

  const dataUrl = await QRCode.toDataURL(texto, {
    width: tamanhoPx,
    margin: 1,
    errorCorrectionLevel: 'M',
  });
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = dataUrl;
  });
  cache.set(chave, img);
  return img;
}
