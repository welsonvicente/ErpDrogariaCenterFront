import { api } from './api';
import type { Colega, Funcionario, PerfilUsuario } from '../types';

/** Gestão de funcionários pelo gerente (endpoints /usuarios, restritos a ADMIN/GERENTE). */
export const funcionarioService = {
  async list(incluirInativos = false) {
    const { data } = await api.get<Funcionario[]>('/usuarios', { params: { incluirInativos } });
    return data;
  },

  /** Lista enxuta (id/nome/ícone) aberta a qualquer autenticado — funcionário escolhendo um colega num seletor. */
  async listColegas() {
    const { data } = await api.get<Colega[]>('/usuarios/colegas');
    return data;
  },

  async create(payload: { nome: string; codigo: string; pin: string; icone: string }) {
    const { data } = await api.post<Funcionario>('/usuarios', payload);
    return data;
  },

  async update(
    id: string,
    payload: Partial<{ nome: string; codigo: string; pin: string; icone: string; ativo: boolean; perfil: PerfilUsuario }>,
  ) {
    const { data } = await api.put<Funcionario>(`/usuarios/${id}`, payload);
    return data;
  },

  async deactivate(id: string) {
    await api.delete(`/usuarios/${id}`);
  },

  async activate(id: string) {
    const { data } = await api.patch<Funcionario>(`/usuarios/${id}/ativar`);
    return data;
  },

  async remove(id: string) {
    await api.delete(`/usuarios/${id}/permanente`);
  },
};
