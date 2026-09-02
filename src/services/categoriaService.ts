import { api } from './api';
import type { Categoria } from '../types';

export const categoriaService = {
  async list(incluirInativas = false) {
    const { data } = await api.get<Categoria[]>('/categorias', { params: { incluirInativas } });
    return data;
  },

  async create(payload: { nome: string; icone: string; ordem?: number }) {
    const { data } = await api.post<Categoria>('/categorias', payload);
    return data;
  },

  async update(id: string, payload: Partial<{ nome: string; icone: string; ordem: number; ativo: boolean }>) {
    const { data } = await api.put<Categoria>(`/categorias/${id}`, payload);
    return data;
  },

  async deactivate(id: string) {
    await api.delete(`/categorias/${id}`);
  },
};
