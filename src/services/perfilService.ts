import { api } from './api';
import type { UsuarioSessao } from '../types';

/** "Meus dados": o próprio usuário logado editando seu perfil e trocando a senha. */
export const perfilService = {
  async getMe() {
    const { data } = await api.get<UsuarioSessao>('/perfil');
    return data;
  },

  async atualizar(payload: Partial<{ nome: string; email: string }>) {
    const { data } = await api.put<UsuarioSessao>('/perfil', payload);
    return data;
  },

  async alterarSenha(senhaAtual: string, novaSenha: string) {
    await api.put('/perfil/senha', { senhaAtual, novaSenha });
  },
};
