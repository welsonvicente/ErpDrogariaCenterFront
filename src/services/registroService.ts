import { api } from './api';
import type { UsuarioSessao } from '../types';

interface RegistroResponse {
  token: string;
  usuario: UsuarioSessao;
  organizacaoSlug: string;
}

export const registroService = {
  async slugDisponivel(slug: string) {
    try {
      const { data } = await api.get<{ disponivel: boolean }>('/registro/slug-disponivel', { params: { slug } });
      return data.disponivel;
    } catch {
      return false;
    }
  },

  async registrarOrganizacao(payload: {
    nomeOrganizacao: string;
    slug: string;
    nomeAdmin: string;
    email: string;
    senha: string;
  }) {
    const { data } = await api.post<RegistroResponse>('/registro', payload);
    return data;
  },
};
