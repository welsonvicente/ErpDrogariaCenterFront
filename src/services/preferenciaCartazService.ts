import { api } from './api';

/** Grupos de preferência guardados no servidor — mesmas chaves de `ChavePreferenciaCartaz` no backend. */
export type ChavePreferenciaCartaz = 'story' | 'panfleto' | 'planilha' | 'logo_story';

/**
 * Preferências "padrão" de Cartazes (cores, letras, tamanhos, posições),
 * guardadas por organização no backend — valem em qualquer navegador ou
 * aparelho logado nela. Quem usa é `cartazPersistencia.ts`, que mantém o
 * localStorage como cópia local e sincroniza com isto aqui.
 */
export const preferenciaCartazService = {
  async listar(): Promise<Partial<Record<ChavePreferenciaCartaz, Record<string, unknown>>>> {
    const { data } = await api.get('/cartazes/preferencias');
    return data;
  },

  async salvar(chave: ChavePreferenciaCartaz, valor: Record<string, unknown>): Promise<void> {
    await api.put(`/cartazes/preferencias/${chave}`, { valor });
  },
};
