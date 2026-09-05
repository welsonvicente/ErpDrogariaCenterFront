import { BrandLogo } from './BrandLogo';
import type { ReactNode } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Casca comum das telas de gestor: cabeçalho + abas de navegação. */
export function ManagerLayout({ children }: { children: ReactNode }) {
  const { usuario, logout } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
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
          <h1>Painel do Gestor — Gastos</h1>
          <p>{usuario?.nome}</p>
        </div>
        <button className="btn-ghost" onClick={handleLogout}>
          Sair
        </button>
      </div>

      <div className="nav-tabs">
        <NavLink to={`/${orgSlug}/gestor`} end className={({ isActive }) => (isActive ? 'active' : '')}>
          Dashboard
        </NavLink>
        <NavLink to={`/${orgSlug}/gestor/funcionarios`} className={({ isActive }) => (isActive ? 'active' : '')}>
          Funcionários
        </NavLink>
        <NavLink to={`/${orgSlug}/gestor/categorias`} className={({ isActive }) => (isActive ? 'active' : '')}>
          Categorias
        </NavLink>
      </div>

      {children}
    </div>
  );
}
