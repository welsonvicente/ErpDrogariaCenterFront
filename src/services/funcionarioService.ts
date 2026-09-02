import { api } from './api';
import type { Funcionario } from '../types';

/** Gestão de funcionários pelo gestor (endpoints /usuarios, restritos a ADMIN/GESTOR). */
export const funcionarioService = {
  async list(incluirInativos = false) {
    const { data } = await api.get<Funcionario[]>('/usuarios', { params: { incluirInativos } });
    return data;
  },

  async create(payload: { nome: string; codigo: string; pin: string; icone: string }) {
    const { data } = await api.post<Funcionario>('/usuarios', payload);
    return data;
  },

  async update(id: string, payload: Partial<{ nome: string; codigo: string; pin: string; icone: string; ativo: boolean }>) {
    const { data } = await api.put<Funcionario>(`/usuarios/${id}`, payload);
    return data;
  },

  async deactivate(id: string) {
    await api.delete(`/usuarios/${id}`);
  },
};
