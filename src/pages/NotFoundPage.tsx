import { Link } from 'react-router-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export function NotFoundPage({ organizacaoInvalida = false }: { organizacaoInvalida?: boolean }) {
  useDocumentTitle('Página não encontrada');

  return (
    <div className="page">
      <div className="card gate-box" style={{ padding: 32 }}>
        <BrandLogo large />
        <h2 style={{ color: 'var(--teal-deep)', fontSize: 18, marginBottom: 6 }}>Página não encontrada</h2>
        <p style={{ color: 'var(--ink-soft)', fontSize: 13, marginBottom: 20 }}>
          {organizacaoInvalida
            ? 'A organização informada não existe ou não está disponível.'
            : 'Este endereço não corresponde a uma página disponível no PharmaMind.'}
        </p>
        <Link className="btn-primary" style={{ display: 'block', textAlign: 'center' }} to="/">
          Ir para a entrada
        </Link>
      </div>
    </div>
  );
}
