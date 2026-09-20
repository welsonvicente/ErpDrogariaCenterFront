/**
 * Carrega um <input type="file"> como HTMLImageElement, já reduzindo o
 * tamanho se for maior do que qualquer formato que exportamos aqui.
 *
 * Fotos de câmera de celular costumam vir bem maiores do que o maior formato
 * exportado (1080×1920, o story) — sem reduzir, cada uma ocupa vários MB como
 * dataURL, o que pesa desnecessariamente na memória da aba.
 */
const DIMENSAO_MAXIMA = 1600;

export function carregarImagemDeArquivo(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = async () => {
        try {
          resolve(await reduzirImagemSeNecessario(img));
        } catch {
          resolve(img);
        }
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function reduzirImagemSeNecessario(img: HTMLImageElement): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (Math.max(w, h) <= DIMENSAO_MAXIMA) {
      resolve(img);
      return;
    }
    const escala = DIMENSAO_MAXIMA / Math.max(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * escala);
    canvas.height = Math.round(h * escala);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      resolve(img);
      return;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const menor = new Image();
    menor.onload = () => resolve(menor);
    menor.onerror = () => resolve(img);
    menor.src = canvas.toDataURL('image/jpeg', 0.85);
  });
}
