import { api } from './api';
import type { Organizacao } from '../types';

export const organizacaoService = {
  async getAtual() {
    const { data } = await api.get<Organizacao>('/organizacao');
    return data;
  },

  async atualizar(nome: string) {
    const { data } = await api.put<Organizacao>('/organizacao', { nome });
    return data;
  },
};
