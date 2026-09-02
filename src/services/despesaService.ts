import { api } from './api';
import type { Despesa, ListaDespesasResultado, ResumoDespesas } from '../types';

export interface FiltrosDespesa {
  dataInicio?: string;
  dataFim?: string;
  usuarioId?: string;
  categoriaId?: string;
  page?: number;
  pageSize?: number;
}

export const despesaService = {
  async list(filtros: FiltrosDespesa = {}) {
    const { data } = await api.get<ListaDespesasResultado>('/despesas', { params: filtros });
    return data;
  },

  async summary(filtros: Omit<FiltrosDespesa, 'page' | 'pageSize'> = {}) {
    const { data } = await api.get<ResumoDespesas>('/despesas/resumo', { params: filtros });
    return data;
  },

  /** usuarioId não é enviado: a API sempre usa quem está autenticado no token. */
  async create(payload: { data: string; valor: number; descricao?: string; categoriaId: string }) {
    const { data } = await api.post<Despesa>('/despesas', payload);
    return data;
  },

  async remove(id: string) {
    await api.delete(`/despesas/${id}`);
  },
};
