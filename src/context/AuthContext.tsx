import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { areaDaRota, lerSessao, removerSessao, salvarSessao, type AreaSessao } from '../services/api';
import { authService } from '../services/authService';
import type { UsuarioSessao } from '../types';

interface AuthContextValue {
  orgSlug: string;
  usuario: UsuarioSessao | null;
  isAuthenticated: boolean;
  login: (email: string, senha: string) => Promise<void>;
  loginFuncionario: (codigo: string, pin: string) => Promise<void>;
  logout: () => void;
  atualizarUsuarioLocal: (dados: Partial<UsuarioSessao>) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function usuarioDaSessaoSalva(orgSlug: string, area: AreaSessao): UsuarioSessao | null {
  const sessao = lerSessao(area);
  return sessao && sessao.orgSlug === orgSlug ? (sessao.usuario as UsuarioSessao) : null;
}

/**
 * Provedor de sessão escopado a uma organização (o slug vem da URL, ver
 * OrgLayout.tsx) e à área atual — gestor ou funcionário, derivada do
 * caminho (ver `areaDaRota` em services/api.ts). Gestor e funcionário usam
 * chaves de sessão separadas: assim, entrar como funcionário numa aba (ou
 * navegar pra tela de funcionário) nunca reaproveita nem sobrescreve a
 * sessão de quem está logado como gestor, e vice-versa.
 */
export function AuthProvider({ orgSlug, children }: { orgSlug: string; children: ReactNode }) {
  const location = useLocation();
  const area = areaDaRota(location.pathname);

  // Inicializador "preguiçoso": lê a sessão salva já na primeira renderização.
  // Se isso ficasse só no useEffect (que roda depois do primeiro render), o
  // ProtectedRoute veria `usuario === null` por um instante e redirecionaria
  // para o login mesmo com uma sessão válida salva (bug de "flash" de logout).
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(() => usuarioDaSessaoSalva(orgSlug, area));

  useEffect(() => {
    setUsuario(usuarioDaSessaoSalva(orgSlug, area));
  }, [orgSlug, area]);

  async function login(email: string, senha: string) {
    const { token, usuario: usuarioLogado } = await authService.login(orgSlug, email, senha);
    salvarSessao('gestor', { orgSlug, token, usuario: usuarioLogado });
    setUsuario(usuarioLogado);
  }

  async function loginFuncionario(codigo: string, pin: string) {
    const { token, usuario: usuarioLogado } = await authService.loginFuncionario(orgSlug, codigo, pin);
    salvarSessao('funcionario', { orgSlug, token, usuario: usuarioLogado });
    setUsuario(usuarioLogado);
  }

  function logout() {
    removerSessao(area);
    setUsuario(null);
  }

  /**
   * Atualiza nome/e-mail exibidos (ex.: header) depois de uma edição de
   * perfil, sem precisar deslogar/logar de novo — o token continua valendo,
   * só os dados exibidos localmente mudam.
   */
  function atualizarUsuarioLocal(dados: Partial<UsuarioSessao>) {
    const sessao = lerSessao(area);
    if (!sessao || sessao.orgSlug !== orgSlug) return;

    const usuarioAtualizado = { ...sessao.usuario, ...dados } as UsuarioSessao;
    salvarSessao(area, { ...sessao, usuario: usuarioAtualizado });
    setUsuario(usuarioAtualizado);
  }

  return (
    <AuthContext.Provider
      value={{ orgSlug, usuario, isAuthenticated: !!usuario, login, loginFuncionario, logout, atualizarUsuarioLocal }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa ser usado dentro de <AuthProvider>.');
  return ctx;
}
