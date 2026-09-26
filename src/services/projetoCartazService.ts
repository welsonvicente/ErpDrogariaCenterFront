import { api } from './api';

export type TipoProjetoCartaz = 'story' | 'panfleto' | 'planilha';

export interface ProjetoCartazResumo {
  id: string;
  tipo: TipoProjetoCartaz;
  nome: string;
  criadoPorId: string | null;
  criadoPor: { id: string; nome: string } | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ArquivoCartazComUrl {
  id: string;
  mimeType: string;
  tamanhoBytes: number;
  url: string;
}

/** Resposta de criar/atualizar — sem `arquivos` (só `GET /projetos/:id` monta URLs de leitura, ver `obter`). */
export interface ProjetoCartazSalvo extends ProjetoCartazResumo {
  estadoEditor: Record<string, unknown>;
}

export interface ProjetoCartazCompleto extends ProjetoCartazSalvo {
  arquivos: ArquivoCartazComUrl[];
}

/**
 * Projetos de Cartazes (Story/Panfleto/Importar planilha) — substituem o
 * antigo "rascunho implícito" que só existia em `localStorage`. Guardados
 * por organização no backend (ver `cartaz.routes.ts`), acessíveis de
 * qualquer aparelho logado nela.
 */
export const projetoCartazService = {
  async criar(tipo: TipoProjetoCartaz, nome: string): Promise<ProjetoCartazSalvo> {
    const { data } = await api.post<ProjetoCartazSalvo>('/cartazes/projetos', { tipo, nome });
    return data;
  },

  async listar(tipo: TipoProjetoCartaz): Promise<ProjetoCartazResumo[]> {
    const { data } = await api.get<ProjetoCartazResumo[]>('/cartazes/projetos', { params: { tipo } });
    return data;
  },

  async obter(id: string): Promise<ProjetoCartazCompleto> {
    const { data } = await api.get<ProjetoCartazCompleto>(`/cartazes/projetos/${id}`);
    return data;
  },

  async atualizar(id: string, dados: { nome?: string; estadoEditor?: Record<string, unknown> }): Promise<ProjetoCartazSalvo> {
    const { data } = await api.patch<ProjetoCartazSalvo>(`/cartazes/projetos/${id}`, dados);
    return data;
  },

  async remover(id: string): Promise<void> {
    await api.delete(`/cartazes/projetos/${id}`);
  },
};
