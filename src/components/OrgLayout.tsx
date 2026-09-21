import { useEffect, useState } from 'react';
import { Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { NotFoundPage } from '../pages/NotFoundPage';
import { organizacaoService } from '../services/organizacaoService';

/**
 * Toda a aplicação vive sob "/:orgSlug/..." — a organização (empresa) é lida
 * direto da URL, sem o usuário precisar digitar nada. Esse layout resolve o
 * slug e disponibiliza a sessão (AuthProvider) escopada a ele para as rotas filhas.
 */
export function OrgLayout() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [estado, setEstado] = useState<'verificando' | 'valida' | 'invalida' | 'erro'>('verificando');

  useEffect(() => {
    if (!orgSlug) return;

    let ativo = true;
    setEstado('verificando');
    organizacaoService
      .estaDisponivel(orgSlug)
      .then((disponivel) => {
        if (ativo) setEstado(disponivel ? 'valida' : 'invalida');
      })
      .catch(() => {
        if (ativo) setEstado('erro');
      });

    return () => {
      ativo = false;
    };
  }, [orgSlug]);

  if (!orgSlug) {
    return <Navigate to="/" replace />;
  }

  if (estado === 'verificando') {
    return <div className="page"><p style={{ color: 'var(--ink-soft)' }}>Verificando organização...</p></div>;
  }

  if (estado === 'invalida') {
    return <NotFoundPage organizacaoInvalida />;
  }

  if (estado === 'erro') {
    return <NotFoundPage />;
  }

  return (
    <AuthProvider orgSlug={orgSlug}>
      <Outlet />
    </AuthProvider>
  );
}
