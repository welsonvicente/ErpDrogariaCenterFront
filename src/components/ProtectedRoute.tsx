import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Bloqueia o acesso a telas de gestor sem sessão válida de ADMIN/GESTOR
 * (escopada à organização atual). Um funcionário autenticado (perfil
 * FUNCIONARIO) também é barrado aqui — a API rejeitaria as chamadas mesmo
 * assim, mas é melhor nem deixar a tela abrir.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const podeAcessar = usuario?.perfil === 'ADMIN' || usuario?.perfil === 'GESTOR';

  if (!podeAcessar) {
    return <Navigate to={`/${orgSlug}/gestor/login`} replace />;
  }
  return <>{children}</>;
}
