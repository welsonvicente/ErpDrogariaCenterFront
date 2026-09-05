import { BrandLogo } from '../components/BrandLogo';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { PasswordInput } from '../components/PasswordInput';
import { salvarSessao } from '../services/api';
import { registroService } from '../services/registroService';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos (marcas de combinação unicode)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type StatusSlug = 'ocioso' | 'verificando' | 'disponivel' | 'indisponivel';

/** Cadastro público de uma organização (empresa) nova — cria a empresa + o primeiro admin de uma vez. */
export function RegisterOrganizationPage() {
  useDocumentTitle('Criar conta');
  const navigate = useNavigate();

  const [nomeOrganizacao, setNomeOrganizacao] = useState('');
  const [slug, setSlug] = useState('');
  const [slugEditadoManualmente, setSlugEditadoManualmente] = useState(false);
  const [statusSlug, setStatusSlug] = useState<StatusSlug>('ocioso');

  const [nomeAdmin, setNomeAdmin] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sugere o "endereço" (slug) a partir do nome da empresa, até o usuário mexer nele na mão.
  useEffect(() => {
    if (!slugEditadoManualmente) {
      setSlug(slugify(nomeOrganizacao));
    }
  }, [nomeOrganizacao, slugEditadoManualmente]);

  // Checa disponibilidade do slug com debounce, pra não bater na API a cada tecla.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (slug.length < 3) {
      setStatusSlug('ocioso');
      return;
    }

    setStatusSlug('verificando');
    debounceRef.current = setTimeout(async () => {
      const disponivel = await registroService.slugDisponivel(slug);
      setStatusSlug(disponivel ? 'disponivel' : 'indisponivel');
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [slug]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (senha !== confirmarSenha) {
      setError('A confirmação não bate com a senha.');
      return;
    }
    if (statusSlug === 'indisponivel') {
      setError('Esse endereço já está em uso. Escolha outro.');
      return;
    }

    setLoading(true);
    try {
      const { token, usuario, organizacaoSlug } = await registroService.registrarOrganizacao({
        nomeOrganizacao,
        slug,
        nomeAdmin,
        email,
        senha,
      });
      salvarSessao('gestor', { orgSlug: organizacaoSlug, token, usuario });
      navigate(`/${organizacaoSlug}/ferramentas`);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível criar a conta. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <div className="card gate-box" style={{ padding: 32, maxWidth: 420 }}>
        <BrandLogo large />
        <h2 style={{ color: 'var(--teal-deep)', fontSize: 18, marginBottom: 6 }}>Criar conta</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 20 }}>
          Cadastre sua empresa e o primeiro acesso de gestor.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="nomeOrganizacao">Nome da empresa</label>
            <input
              id="nomeOrganizacao"
              required
              value={nomeOrganizacao}
              onChange={(e) => setNomeOrganizacao(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="slug">Endereço do sistema</label>
            <input
              id="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlug(slugify(e.target.value));
                setSlugEditadoManualmente(true);
              }}
            />
            <span style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              vai ficar em <strong>/{slug || 'sua-empresa'}</strong>
              {statusSlug === 'verificando' && ' — verificando...'}
              {statusSlug === 'disponivel' && <span style={{ color: 'var(--ok)' }}> — disponível ✓</span>}
              {statusSlug === 'indisponivel' && <span style={{ color: 'var(--late)' }}> — já está em uso</span>}
            </span>
          </div>

          <div className="field">
            <label htmlFor="nomeAdmin">Seu nome</label>
            <input id="nomeAdmin" required value={nomeAdmin} onChange={(e) => setNomeAdmin(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="senha">Senha</label>
            <PasswordInput id="senha" required minLength={8} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </div>

          <div className="field">
            <label htmlFor="confirmarSenha">Confirmar senha</label>
            <PasswordInput
              id="confirmarSenha"
              required
              minLength={8}
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
            />
          </div>

          <p className="error-text">{error}</p>

          <button className="btn-primary" style={{ width: '100%' }} type="submit" disabled={loading}>
            {loading ? 'Criando...' : 'Criar conta'}
          </button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 16, textAlign: 'center' }}>
          Já tem conta? <Link to="/" style={{ color: 'var(--teal-deep)', fontWeight: 600 }}>Entrar</Link>
        </p>
      </div>
    </div>
  );
}
