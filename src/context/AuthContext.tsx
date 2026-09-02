import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { SESSION_KEY, lerSessao } from '../services/api';
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

/**
 * Provedor de sessão escopado a uma organização (o slug vem da URL, ver
 * OrgLayout.tsx). A sessão salva localmente carrega o slug junto — se o
 * usuário navegar para a URL de outra organização, a sessão antiga não é
 * reaproveitada (evita misturar dados de empresas diferentes no mesmo navegador).
 */
function usuarioDaSessaoSalva(orgSlug: string): UsuarioSessao | null {
  const sessao = lerSessao();
  return sessao && sessao.orgSlug === orgSlug ? (sessao.usuario as UsuarioSessao) : null;
}

export function AuthProvider({ orgSlug, children }: { orgSlug: string; children: ReactNode }) {
  // Inicializador "preguiçoso": lê a sessão salva já na primeira renderização.
  // Se isso ficasse só no useEffect (que roda depois do primeiro render), o
  // ProtectedRoute veria `usuario === null` por um instante e redirecionaria
  // para o login mesmo com uma sessão válida salva (bug de "flash" de logout).
  const [usuario, setUsuario] = useState<UsuarioSessao | null>(() => usuarioDaSessaoSalva(orgSlug));

  useEffect(() => {
    setUsuario(usuarioDaSessaoSalva(orgSlug));
  }, [orgSlug]);

  async function login(email: string, senha: string) {
    const { token, usuario: usuarioLogado } = await authService.login(orgSlug, email, senha);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ orgSlug, token, usuario: usuarioLogado }));
    setUsuario(usuarioLogado);
  }

  async function loginFuncionario(codigo: string, pin: string) {
    const { token, usuario: usuarioLogado } = await authService.loginFuncionario(orgSlug, codigo, pin);
    localStorage.setItem(SESSION_KEY, JSON.stringify({ orgSlug, token, usuario: usuarioLogado }));
    setUsuario(usuarioLogado);
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    setUsuario(null);
  }

  /**
   * Atualiza nome/e-mail exibidos (ex.: header) depois de uma edição de
   * perfil, sem precisar deslogar/logar de novo — o token continua valendo,
   * só os dados exibidos localmente mudam.
   */
  function atualizarUsuarioLocal(dados: Partial<UsuarioSessao>) {
    const sessao = lerSessao();
    if (!sessao || sessao.orgSlug !== orgSlug) return;

    const usuarioAtualizado = { ...sessao.usuario, ...dados } as UsuarioSessao;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ ...sessao, usuario: usuarioAtualizado }));
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
