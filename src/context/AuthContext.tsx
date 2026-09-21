import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { areaDaRota, lerSessao, removerSessao, salvarSessao, type AreaSessao } from '../services/api';
import { authService } from '../services/authService';
import { perfilService } from '../services/perfilService';
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
 * OrgLayout.tsx) e à área atual — gerente ou funcionário, derivada do
 * caminho (ver `areaDaRota` em services/api.ts). Gerente e funcionário usam
 * chaves de sessão separadas: assim, entrar como funcionário numa aba (ou
 * navegar pra tela de funcionário) nunca reaproveita nem sobrescreve a
 * sessão de quem está logado como gerente, e vice-versa.
 */
export function AuthProvider({ orgSlug, children }: { orgSlug: string; children: ReactNode }) {
  const location = useLocation();
  const area = areaDaRota(location.pathname);

  // Inicializador "preguiçoso": lê a sessão salva já na primeira renderização.
  // Se isso ficasse só no useEffect (que roda depois do primeiro render), o
  // ProtectedRoute veria `usuario === null` por um instante e redirecionaria
  // para o login mesmo com uma sessão válida salva (bug de "flash" de logout).
  //
  // A área atual entra no estado pelo mesmo motivo: quando a navegação troca de
  // área (gerente → funcionário, ex.: ao fechar o Painel do Gerente), recalcular
  // só no useEffect deixaria um render intermediário com o usuário da área
  // ANTERIOR — e quem lê isso redireciona antes da correção chegar. Recalcular
  // durante o render é o padrão do React pra estado derivado: ele descarta o
  // render em andamento e refaz com o valor certo, sem nunca exibir o errado.
  const [estado, setEstado] = useState<{ area: AreaSessao; usuario: UsuarioSessao | null }>(() => ({
    area,
    usuario: usuarioDaSessaoSalva(orgSlug, area),
  }));

  if (estado.area !== area) {
    setEstado({ area, usuario: usuarioDaSessaoSalva(orgSlug, area) });
  }

  const usuario = estado.usuario;
  const setUsuario = (novo: UsuarioSessao | null) => setEstado({ area, usuario: novo });

  useEffect(() => {
    setEstado({ area, usuario: usuarioDaSessaoSalva(orgSlug, area) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgSlug]);

  // Papel e nome podem ter mudado desde o login (por exemplo, alguém promovido
  // a gerente). A sessão local serve para evitar a tela piscando, mas não pode
  // congelar a interface numa permissão antiga até o próximo login.
  useEffect(() => {
    const sessao = lerSessao(area);
    if (!sessao || sessao.orgSlug !== orgSlug) return;

    let ativo = true;
    perfilService.getMe()
      .then((usuarioAtual) => {
        if (!ativo) return;
        salvarSessao(area, { ...sessao, usuario: usuarioAtual });
        setEstado({ area, usuario: usuarioAtual });
      })
      .catch(() => {
        // Se a rede cair, a sessão local ainda mantém a experiência disponível.
        // A API continua sendo a autoridade de segurança em toda requisição.
      });

    return () => {
      ativo = false;
    };
  }, [area, orgSlug]);

  async function login(email: string, senha: string) {
    const { token, usuario: usuarioLogado } = await authService.login(orgSlug, email, senha);
    salvarSessao('gerente', { orgSlug, token, usuario: usuarioLogado });
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
