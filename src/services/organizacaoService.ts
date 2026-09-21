import { api } from './api';
import type { Organizacao } from '../types';

export const organizacaoService = {
  /** Confere se o slug da URL aponta para uma organização ativa, antes de abrir a porta de acesso. */
  async estaDisponivel(slug: string) {
    try {
      await api.get(`/organizacao/${encodeURIComponent(slug)}/entrada`);
      return true;
    } catch (erro: any) {
      if (erro?.response?.status === 404) return false;
      throw erro;
    }
  },

  async getAtual() {
    const { data } = await api.get<Organizacao>('/organizacao');
    return data;
  },

  async atualizar(nome: string) {
    const { data } = await api.put<Organizacao>('/organizacao', { nome });
    return data;
  },
};
