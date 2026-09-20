import { BrandLogo } from '../components/BrandLogo';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput';
import { lerSessao, salvarSessao, tokenExpirado } from '../services/api';
import { authService } from '../services/authService';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

/**
 * Login inicial do sistema (rota "/"), fora do contexto de qualquer
 * organização — é aqui que o gerente "descobre" a empresa dele: a API
 * procura o e-mail em todas as organizações. Ao logar, a sessão é salva
 * diretamente (mesmo formato que AuthContext usa) e o usuário é levado
 * para "/:orgSlug/gerente".
 */
export function OrganizationLoginPage() {
  useDocumentTitle('Entrar');
  const navigate = useNavigate();

  // Se já existe uma sessão de GERENTE salva neste navegador, com token ainda
  // não vencido, pula a tela de login: abrir a raiz do sistema sempre pedia
  // login de novo, mesmo já logado. Calculado uma vez, de forma preguiçosa —
  // não é um efeito porque não depende de nada assíncrono, só do localStorage.
  //
  // Sessão de FUNCIONARIO fica de fora de propósito: esse login é rápido, feito
  // num terminal compartilhado de balcão, e deve continuar pedindo código+PIN
  // toda vez que alguém abrir a tela dele (ver EmployeeCodePage) — a raiz nunca
  // foi a porta de entrada do funcionário, então não é ela quem decide isso.
  const [destinoJaLogado] = useState(() => {
    const sessao = lerSessao('gerente');
    if (!sessao?.token || tokenExpirado(sessao.token)) return null;
    return `/${sessao.orgSlug}/gerente`;
  });

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
      salvarSessao('gerente', { orgSlug: organizacaoSlug, token, usuario });
      navigate(`/${organizacaoSlug}/gerente`);
    } catch {
      setError('E-mail ou senha inválidos.');
    } finally {
      setLoading(false);
    }
  }

  if (destinoJaLogado) {
    return <Navigate to={destinoJaLogado} replace />;
  }

  return (
    <div className="page">
      <div className="card gate-box" style={{ padding: 32 }}>
        <BrandLogo large />
        <h2 style={{ color: 'var(--teal-deep)', fontSize: 18, marginBottom: 6 }}>Bem-vindo</h2>
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

        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 16, textAlign: 'center' }}>
          Sua empresa ainda não tem conta?{' '}
          <Link to="/cadastro" style={{ color: 'var(--teal-deep)', fontWeight: 600 }}>
            Criar conta
          </Link>
        </p>
      </div>
    </div>
  );
}
