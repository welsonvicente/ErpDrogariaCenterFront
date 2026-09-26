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

/**
 * Igual a `carregarImagemDeArquivo`, mas devolve também o `Blob` final (já
 * reduzido), pronto pra subir pro R2 — usada em todo lugar onde a foto
 * precisa ser persistida no projeto (produto do Story/Panfleto/Importar
 * planilha), diferente de imagens só de sessão (fundo/logo do Panfleto, que
 * nunca são salvas em lugar nenhum e continuam usando `carregarImagemDeArquivo`).
 *
 * Usa `URL.createObjectURL` em vez de `FileReader`/dataURL pra nunca precisar
 * de uma string base64 nem de leitura em memória do arquivo inteiro.
 */
export function carregarImagemEBlobDeArquivo(file: File): Promise<{ imagem: HTMLImageElement; blob: Blob; mimeType: string }> {
  // PNG preserva transparência (logos/selos) — qualquer outro formato (JPEG,
  // foto de câmera, etc.) vira JPEG, bem mais leve pra fotos de produto.
  const manterPng = file.type === 'image/png';
  return new Promise((resolve, reject) => {
    const urlOriginal = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(urlOriginal);
      try {
        resolve(await reduzirEGerarBlob(img, manterPng));
      } catch (erro) {
        reject(erro);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(urlOriginal);
      reject(new Error('Não foi possível ler essa imagem.'));
    };
    img.src = urlOriginal;
  });
}

function reduzirEGerarBlob(img: HTMLImageElement, manterPng: boolean): Promise<{ imagem: HTMLImageElement; blob: Blob; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const escala = Math.max(w, h) > DIMENSAO_MAXIMA ? DIMENSAO_MAXIMA / Math.max(w, h) : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * escala));
    canvas.height = Math.max(1, Math.round(h * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas indisponível.'));
      return;
    }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const mimeType = manterPng ? 'image/png' : 'image/jpeg';
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Não foi possível gerar a imagem.'));
          return;
        }
        const final = new Image();
        final.onload = () => resolve({ imagem: final, blob, mimeType });
        final.onerror = reject;
        final.src = URL.createObjectURL(blob);
      },
      mimeType,
      manterPng ? undefined : 0.85,
    );
  });
}

/** Deriva um `Blob` de uma imagem já carregada (ex.: foto da câmera, já no tamanho final) — sem reprocessar/reduzir de novo. */
export function blobDeImagem(img: HTMLImageElement, mimeType = 'image/jpeg', qualidade = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Canvas indisponível.'));
      return;
    }
    ctx.drawImage(img, 0, 0);
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.'))), mimeType, qualidade);
  });
}
