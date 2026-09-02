import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Hub de ferramentas do gestor — tela que abre depois do login geral.
 * Cada card é um módulo do ERP; hoje só existe "Gastos", mas essa tela é o
 * lugar natural para os próximos módulos aparecerem.
 */
export function ToolsHubPage() {
  const { usuario, logout } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/');
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Ferramentas</h1>
          <p>{usuario?.nome}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => navigate(`/${orgSlug}/configuracoes`)}>
            ⚙️ Configurações
          </button>
          <button className="btn-ghost" onClick={handleLogout}>
            Sair
          </button>
        </div>
      </div>

      <div className="role-cards">
        <div className="card role-card" onClick={() => navigate(`/${orgSlug}/gestor`)}>
          <div className="icon">💰</div>
          <div className="title">Gastos</div>
          <div className="sub">Dashboard e lançamentos de despesas</div>
        </div>
      </div>
    </div>
  );
}
