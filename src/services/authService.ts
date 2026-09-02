import { api } from './api';
import type { UsuarioSessao } from '../types';

interface LoginGestorResponse {
  token: string;
  usuario: UsuarioSessao;
  organizacaoSlug: string;
}

export const authService = {
  /**
   * Login de ADMIN/GESTOR já dentro do contexto de uma organização
   * (rota "/:orgSlug/gestor/login"): busca o e-mail só naquela organização.
   */
  async login(organizacaoSlug: string, email: string, senha: string) {
    const { data } = await api.post<LoginGestorResponse>('/auth/login', { organizacaoSlug, email, senha });
    return data;
  },

  /**
   * Login geral na raiz do sistema ("/"), antes de saber a organização: a
   * API procura o e-mail em todas as organizações e devolve qual é a dela.
   */
  async loginOrganizacao(email: string, senha: string) {
    const { data } = await api.post<LoginGestorResponse>('/auth/login', { email, senha });
    return data;
  },

  /** Login rápido de FUNCIONARIO: código + PIN, escopado pela organização (sempre já conhecida pela URL). */
  async loginFuncionario(organizacaoSlug: string, codigo: string, pin: string) {
    const { data } = await api.post<{ token: string; usuario: UsuarioSessao }>('/auth/funcionario-login', {
      organizacaoSlug,
      codigo,
      pin,
    });
    return data;
  },
};
