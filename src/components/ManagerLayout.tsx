import { BrandLogo } from './BrandLogo';
import type { ReactNode } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { lerSessao } from '../services/api';

/** Casca comum das telas de gerente: cabeçalho + abas de navegação. */
export function ManagerLayout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  // Quem entrou aqui a partir do painel de funcionário (gerente que entra por código+PIN)
  // continua logado como funcionário ao sair: "Sair" fecha só o painel do gerente
  // e devolve a pessoa pra tela dela, em vez de deslogar tudo e cair na raiz.
  const veioDoFuncionario = lerSessao('gerente')?.origemFuncionario === true;

  function handleLogout() {
    logout();
    // Quem veio do painel de funcionário não navega daqui: limpar a sessão já
    // faz o ProtectedRoute devolver a pessoa pra tela dela (é ele quem escolhe o
    // destino, pra não competir com uma navegação disparada aqui).
    if (!veioDoFuncionario) navigate('/');
  }

  return (
    <div className="page">
      <div className="brand-header"><BrandLogo /></div>
      <div className="page-header">
        <div>
          <button
            className="back-link"
            style={{ border: 'none', background: 'none', color: 'var(--ink-soft)', fontSize: 12.5, fontWeight: 600, padding: 0, marginBottom: 4, cursor: 'pointer' }}
            onClick={() => navigate(`/${orgSlug}/ferramentas`)}
          >
            ← Ferramentas
          </button>
          <h1>Painel do Gerente — Gastos</h1>
          <p>{usuario?.nome}</p>
        </div>
        <button className="btn-ghost" onClick={handleLogout}>
          Sair
        </button>
      </div>

      <div className="nav-tabs">
        <NavLink to={`/${orgSlug}/gerente`} end className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to={`/${orgSlug}/gerente/funcionarios`} className={({ isActive }) => (isActive ? 'active' : '')}>
          Funcionários
        </NavLink>
        <NavLink to={`/${orgSlug}/gerente/categorias`} className={({ isActive }) => (isActive ? 'active' : '')}>
          Categorias
        </NavLink>
        <NavLink to={`/${orgSlug}/gerente/auditoria`} className={({ isActive }) => (isActive ? 'active' : '')}>
          Auditoria
        </NavLink>
      </div>

      {children}
    </div>
  );
}
