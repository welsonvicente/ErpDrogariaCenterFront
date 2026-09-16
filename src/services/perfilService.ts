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

  /**
   * O próprio funcionário define o PIN que libera o Painel do Gerente. Exige o
   * PIN atual — é o que prova que é ele, e não quem pegou o terminal aberto.
   */
  async definirPinGestor(pinAtual: string, novoPin: string) {
    await api.put('/perfil/pin-gerente', { pinAtual, novoPin });
  },
};
