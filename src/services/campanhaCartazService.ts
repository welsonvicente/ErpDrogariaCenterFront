import { api } from './api';

/** O que cada campanha guarda à parte (fundos, cores, posições, logo) — antes eram preferências da organização. */
export type ChaveAparenciaCampanha = 'story' | 'panfleto' | 'planilha' | 'logo_story';

export interface CampanhaCartazResumo {
  id: string;
  nome: string;
  criadoEm: string;
  atualizadoEm: string;
  ultimaAtividade: string;
  criadoPor: { id: string; nome: string } | null;
  projetos: { story: number; panfleto: number; planilha: number };
}

export interface CampanhaCartaz {
  id: string;
  nome: string;
  /** Folha do Cartaz de oferta desta campanha (formato de `FolhaCartazOferta`); `{}` = ainda não mexida. */
  folhaOferta: Record<string, unknown>;
  /** Fundos, cores, posições e logomarca padrão desta campanha, por chave (ver `CHAVES_DA_CAMPANHA`). */
  aparencia: Partial<Record<ChaveAparenciaCampanha, Record<string, unknown>>>;
  criadoEm: string;
  atualizadoEm: string;
}

/**
 * Campanhas de Cartazes (ex.: "Black Friday — semana 1"): agrupam os projetos
 * de Story/Panfleto/Importar e a folha do Cartaz de oferta. Várias podem estar
 * em andamento ao mesmo tempo — trocar de campanha não mexe nas outras.
 */
export const campanhaCartazService = {
  async listar(): Promise<CampanhaCartazResumo[]> {
    const { data } = await api.get<CampanhaCartazResumo[]>('/cartazes/campanhas');
    return data;
  },

  /** `aparencia`: ponto de partida da campanha nova (cópia da aberta, sem os fundos). */
  async criar(nome: string, aparencia: CampanhaCartaz['aparencia'] = {}): Promise<CampanhaCartaz> {
    const { data } = await api.post<CampanhaCartaz>('/cartazes/campanhas', { nome, aparencia });
    return data;
  },

  async obter(id: string): Promise<CampanhaCartaz> {
    const { data } = await api.get<CampanhaCartaz>(`/cartazes/campanhas/${id}`);
    return data;
  },

  async renomear(id: string, nome: string): Promise<CampanhaCartaz> {
    const { data } = await api.patch<CampanhaCartaz>(`/cartazes/campanhas/${id}`, { nome });
    return data;
  },

  /** Só a chave que mudou — o servidor junta com as outras. */
  async salvarAparencia(id: string, aparencia: CampanhaCartaz['aparencia']): Promise<void> {
    await api.patch(`/cartazes/campanhas/${id}`, { aparencia });
  },

  async salvarFolhaOferta(id: string, folhaOferta: Record<string, unknown>): Promise<void> {
    await api.patch(`/cartazes/campanhas/${id}`, { folhaOferta });
  },

  async remover(id: string): Promise<void> {
    await api.delete(`/cartazes/campanhas/${id}`);
  },
};
