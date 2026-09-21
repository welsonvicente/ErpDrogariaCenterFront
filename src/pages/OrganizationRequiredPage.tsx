import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type EntradaSemOrganizacao = 'funcionario' | 'gerente' | 'ferramenta';

function normalizarSlug(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const CONTEUDO: Record<EntradaSemOrganizacao, { titulo: string; descricao: string; acao: string }> = {
  funcionario: {
    titulo: 'Acesso de funcionário',
    descricao: 'Para abrir esta tela, informe primeiro a organização onde você trabalha.',
    acao: 'Continuar para identificação',
  },
  gerente: {
    titulo: 'Acesso do gerente',
    descricao: 'Para abrir o painel, informe primeiro a organização que você administra.',
    acao: 'Continuar para o login',
  },
  ferramenta: {
    titulo: 'Escolha a organização',
    descricao: 'Esta ferramenta usa os dados da sua organização. Informe qual delas você quer acessar.',
    acao: 'Continuar',
  },
};

/**
 * Porta de entrada para URLs que exigem organização, mas foram abertas sem o
 * slug (por exemplo, "/funcionario"). Evita que a primeira palavra da rota
 * seja confundida com o slug da empresa.
 */
export function OrganizationRequiredPage({ entrada }: { entrada: EntradaSemOrganizacao }) {
  useDocumentTitle('Escolher organização');
  const navigate = useNavigate();
  const location = useLocation();
  const [organizacao, setOrganizacao] = useState('');
  const [erro, setErro] = useState('');
  const conteudo = CONTEUDO[entrada];

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const slug = normalizarSlug(organizacao);

    if (!slug) {
      setErro('Informe o endereço da organização para continuar.');
      return;
    }

    // Para gerente, a próxima tela obrigatoriamente é o login. Nas demais
    // entradas preservamos a rota solicitada (e sua query) após adicionar o slug.
    const destino = entrada === 'gerente'
      ? `/${slug}/gerente/login`
      : `/${slug}${location.pathname}${location.search}`;
    navigate(destino, { replace: true });
  }

  return (
    <div className="page">
      <div className="card gate-box" style={{ padding: 32 }}>
        <BrandLogo large />
        <h2 style={{ color: 'var(--teal-deep)', fontSize: 18, marginBottom: 6 }}>{conteudo.titulo}</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 20 }}>{conteudo.descricao}</p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="organizacao">Endereço da organização</label>
            <input
              id="organizacao"
              value={organizacao}
              onChange={(event) => {
                setOrganizacao(event.target.value);
                setErro('');
              }}
              placeholder="Ex.: drogariacenter"
              autoComplete="organization"
              autoFocus
              required
            />
            <small style={{ color: 'var(--ink-soft)' }}>É o nome que aparece no link da sua empresa.</small>
          </div>
          <p className="error-text">{erro}</p>
          <button className="btn-primary" style={{ width: '100%' }} type="submit">
            {conteudo.acao}
          </button>
        </form>

        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 16, textAlign: 'center' }}>
          É gerente e não sabe o endereço? <Link to="/" style={{ color: 'var(--teal-deep)', fontWeight: 600 }}>Entre com e-mail e senha</Link>
        </p>
      </div>
    </div>
  );
}
