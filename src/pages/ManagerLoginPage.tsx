import { BrandLogo } from '../components/BrandLogo';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/** Login do gestor (e-mail + senha) — protege o dashboard administrativo. */
export function ManagerLoginPage() {
  useDocumentTitle('Acesso do Gestor');
  const { login } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate(`/${orgSlug}/gestor`);
    } catch {
      setError('E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card gate-box" style={{ padding: 32 }}>
        <BrandLogo large />
        <h2 style={{ color: 'var(--teal-deep)', fontSize: 18, marginBottom: 6 }}>Acesso do Gestor</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 20 }}>Entre com seu e-mail e senha.</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Senha</label>
            <PasswordInput
              id="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
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
