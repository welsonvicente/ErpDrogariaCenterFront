import { Navigate, Outlet, useParams } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';

/**
 * Toda a aplicação vive sob "/:orgSlug/..." — a organização (empresa) é lida
 * direto da URL, sem o usuário precisar digitar nada. Esse layout resolve o
 * slug e disponibiliza a sessão (AuthProvider) escopada a ele para as rotas filhas.
 */
export function OrgLayout() {
  const { orgSlug } = useParams<{ orgSlug: string }>();

  if (!orgSlug) {
    return <Navigate to="/" replace />;
  }

  return (
    <AuthProvider orgSlug={orgSlug}>
      <Outlet />
    </AuthProvider>
  );
}
