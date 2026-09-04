import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput';
import { useAuth } from '../context/AuthContext';

/**
 * Login rápido do funcionário: código + PIN (pensado para terminal
 * compartilhado no balcão). É a própria tela pública da organização
 * ("/:orgSlug") — sem tela intermediária de escolha de papel, já que o
 * gestor entra pela raiz do sistema ("/").
 */
export function EmployeeCodePage() {
  const { loginFuncionario } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginFuncionario(codigo.trim(), pin.trim());
      navigate(`/${orgSlug}/funcionario/lancar`);
    } catch {
      setError('Código ou PIN inválidos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card gate-box" style={{ padding: 32 }}>
        <p style={{ color: 'var(--ink-soft)', fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>
          Gastos — Drogaria Center
        </p>
        <h2 style={{ color: 'var(--teal-deep)', fontSize: 18, marginBottom: 6 }}>Identifique-se</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 20 }}>
          Digite seu código de funcionário e o PIN.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="codigo">Código</label>
            <input
              id="codigo"
              style={{ textAlign: 'center', fontSize: 18, letterSpacing: 4 }}
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pin">PIN</label>
            <PasswordInput
              id="pin"
              inputMode="numeric"
              style={{ textAlign: 'center', fontSize: 18, letterSpacing: 4 }}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              required
            />
          </div>
          <p className="error-text">{error}</p>
          <button className="btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
            {loading ? 'Verificando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
