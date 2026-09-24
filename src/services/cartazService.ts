import { api } from './api';

export interface ArquivoImportadoMeta {
  id: string;
  nomeOriginal: string;
  mimeType: string;
  tamanhoBytes: number;
  criadoEm: string;
}

/**
 * Busca automática de imagem de produto (por nome + EAN opcional) — usada no
 * modo Importar planilha. Passa pelo backend (nunca direto pra IA de terceiro
 * do navegador): a chave fica só no servidor, e a rota exige login.
 */
export const cartazService = {
  async buscarImagem(descricao: string, ean?: string) {
    const { data } = await api.post<{ imageUrl: string | null }>('/cartazes/buscar-imagem', {
      descricao,
      ean: ean || undefined,
    });
    return data.imageUrl;
  },

  /**
   * Guarda o arquivo original (ex.: a planilha importada) no banco, por
   * organização — não é upload multipart (esse backend não tem), o arquivo
   * vai em base64 dentro do JSON. Assim ele fica acessível de qualquer
   * aparelho logado na mesma organização, não só do navegador que enviou.
   */
  async enviarArquivo(arquivo: File): Promise<ArquivoImportadoMeta> {
    const conteudoBase64 = await arquivoParaBase64(arquivo);
    const { data } = await api.post<ArquivoImportadoMeta>('/cartazes/arquivos', {
      nomeArquivo: arquivo.name,
      mimeType: arquivo.type || 'application/octet-stream',
      conteudoBase64,
    });
    return data;
  },

  async listarArquivos(): Promise<ArquivoImportadoMeta[]> {
    const { data } = await api.get<ArquivoImportadoMeta[]>('/cartazes/arquivos');
    return data;
  },

  /** Baixa um arquivo salvo e devolve como `File`, pronto pra reaproveitar no mesmo parser usado ao escolher um arquivo local. */
  async baixarArquivo(id: string): Promise<File> {
    const { data } = await api.get<{ nomeOriginal: string; mimeType: string; conteudoBase64: string }>(`/cartazes/arquivos/${id}`);
    const bytes = Uint8Array.from(atob(data.conteudoBase64), (c) => c.charCodeAt(0));
    return new File([bytes], data.nomeOriginal, { type: data.mimeType });
  },

  async removerArquivo(id: string): Promise<void> {
    await api.delete(`/cartazes/arquivos/${id}`);
  },
};

function arquivoParaBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // reader.result é "data:<mime>;base64,<dados>" — só a parte depois da vírgula interessa.
      const resultado = reader.result as string;
      resolve(resultado.slice(resultado.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(arquivo);
  });
}
