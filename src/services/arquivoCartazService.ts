import { api } from './api';

export interface PresignResultado {
  arquivoId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiraEm: string;
}

/**
 * Upload de imagens de Cartazes pro Cloudflare R2 — os bytes nunca passam
 * pelo nosso backend. O fluxo é sempre presign → PUT direto no R2 → confirmar
 * (ver PLANO da migração de Base64/localStorage pra R2).
 */
export const arquivoCartazService = {
  async presign(dados: { projetoId?: string; mimeType: string; tamanhoBytes: number }): Promise<PresignResultado> {
    const { data } = await api.post<PresignResultado>('/cartazes/imagens/presign', dados);
    return data;
  },

  /**
   * PUT direto pro R2 com a URL assinada. Usa `XMLHttpRequest` (não `fetch`)
   * de propósito: é a única API do navegador que expõe progresso real de
   * upload via `xhr.upload.onprogress` — necessário pra mostrar progresso em
   * lotes de várias fotos (Panfleto/Importar planilha).
   */
  uploadParaR2(uploadUrl: string, headers: Record<string, string>, blob: Blob, onProgresso?: (percentual: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl);
      Object.entries(headers).forEach(([nome, valor]) => xhr.setRequestHeader(nome, valor));
      xhr.upload.onprogress = (evento) => {
        if (evento.lengthComputable && onProgresso) onProgresso(Math.round((evento.loaded / evento.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Upload falhou (status ${xhr.status}).`));
      };
      xhr.onerror = () => reject(new Error('Falha de rede durante o upload.'));
      xhr.send(blob);
    });
  },

  /** `projetoId` omitido = confirma sem vincular a nenhum projeto (caso de "produtos recentes"). */
  async confirmar(arquivoId: string, projetoId?: string): Promise<{ id: string; mimeType: string; tamanhoBytes: number; status: string }> {
    const { data } = await api.post(`/cartazes/imagens/${arquivoId}/confirmar`, projetoId ? { projetoId } : {});
    return data;
  },

  async remover(arquivoId: string): Promise<void> {
    await api.delete(`/cartazes/imagens/${arquivoId}`);
  },

  /** URLs de leitura em lote (ex.: miniaturas de "produtos recentes") — ids inexistentes/de outra organização vêm simplesmente ausentes do resultado. */
  async obterUrls(ids: string[]): Promise<{ id: string; url: string }[]> {
    if (ids.length === 0) return [];
    const { data } = await api.post<{ id: string; url: string }[]>('/cartazes/imagens/urls', { ids });
    return data;
  },

  /** Fluxo completo presign → PUT → confirmar, pra quando não precisa de fila/progresso (uma foto só). */
  async enviarImagem(blob: Blob, mimeType: string, projetoId?: string, onProgresso?: (percentual: number) => void): Promise<string> {
    const presign = await arquivoCartazService.presign({ projetoId, mimeType, tamanhoBytes: blob.size });
    await arquivoCartazService.uploadParaR2(presign.uploadUrl, presign.headers, blob, onProgresso);
    await arquivoCartazService.confirmar(presign.arquivoId, projetoId);
    return presign.arquivoId;
  },
};
