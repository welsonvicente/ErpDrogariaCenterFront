import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput';
import { SESSION_KEY } from '../services/api';
import { authService } from '../services/authService';

/**
 * Login inicial do sistema (rota "/"), fora do contexto de qualquer
 * organização — é aqui que o gestor "descobre" a empresa dele: a API
 * procura o e-mail em todas as organizações. Ao logar, a sessão é salva
 * diretamente (mesmo formato que AuthContext usa) e o usuário é levado
 * para "/:orgSlug/ferramentas".
 */
export function OrganizationLoginPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, usuario, organizacaoSlug } = await authService.loginOrganizacao(email, senha);
      localStorage.setItem(SESSION_KEY, JSON.stringify({ orgSlug: organizacaoSlug, token, usuario }));
      navigate(`/${organizacaoSlug}/ferramentas`);
    } catch {
      setError('E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card gate-box" style={{ padding: 32 }}>
        <h2 style={{ color: 'var(--teal-deep)', fontSize: 18, marginBottom: 6 }}>Drogaria Center — ERP</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 20 }}>Entre com seu e-mail e senha.</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <PasswordInput id="senha" required value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>
          <p className="error-text">{error}</p>
          <button className="btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
