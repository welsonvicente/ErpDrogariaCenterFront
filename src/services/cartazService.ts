import { api } from './api';

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
};
