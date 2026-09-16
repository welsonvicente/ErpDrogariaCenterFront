import type { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { lerSessao } from '../services/api';

/**
 * Bloqueia o acesso às telas de gerente sem um papel que as permita (escopado à
 * organização atual): ADMIN ou GERENTE — não importa por qual porta a pessoa
 * entrou, se pela tela de senha ou pela rápida do balcão (código+PIN).
 *
 * Isto é só a porta da interface — quem autoriza de verdade é o backend, que
 * reconfere a permissão no banco a cada requisição (`requireGerente`). Mexer no
 * localStorage pra forçar a tela a abrir não dá acesso a dado nenhum: as
 * chamadas voltam 403 e a tela fica vazia.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { usuario } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const podeAcessar = usuario?.perfil === 'ADMIN' || usuario?.perfil === 'GERENTE';

  if (!podeAcessar) {
    // Quem chegou aqui a partir do painel de funcionário (um gerente que entra
    // pelo balcão, por código+PIN)
    // volta pra tela dele, não pra um login de gerente que ele não tem como usar
    // — ele não tem e-mail nem senha. Decidir o destino aqui, e não no "Sair" do
    // ManagerLayout, evita uma corrida: limpar a sessão re-renderiza este guard,
    // e o redirect dele venceria qualquer navegação disparada junto.
    const sessaoFuncionario = lerSessao('funcionario');
    const voltaPraFuncionario = sessaoFuncionario?.orgSlug === orgSlug;

    return <Navigate to={voltaPraFuncionario ? `/${orgSlug}/funcionario/lancar` : `/${orgSlug}/gerente/login`} replace />;
  }
  return <>{children}</>;
}
