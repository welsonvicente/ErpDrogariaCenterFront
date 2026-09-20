import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BrandLogo } from './BrandLogo';
import { ManagerLayout } from './ManagerLayout';
import { useAuth } from '../context/AuthContext';

/**
 * Moldura comum das ferramentas usadas tanto por ADMIN/GERENTE quanto por
 * FUNCIONARIO (Cartazes, Folgas) — nenhuma delas nunca mais fica "solta", sem
 * menu nem cabeçalho do sistema, como acontecia antes (o que fazia sentido
 * abrir em outra aba: uma tela sem moldura nenhuma só cabia como página à parte).
 *
 * ADMIN/GERENTE veem o conteúdo dentro do mesmo painel de menu lateral do
 * resto do sistema; qualquer outra pessoa (FUNCIONARIO, ou alguém que abriu o
 * link direto sem sessão nenhuma) vê o cabeçalho simples com "voltar" que já é
 * o padrão das telas dele.
 */
export function FerramentaShell({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { usuario } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  if (usuario?.perfil === 'ADMIN' || usuario?.perfil === 'GERENTE') {
    return <ManagerLayout>{children}</ManagerLayout>;
  }

  return (
    <div className="page">
      <div className="brand-header">
        <BrandLogo />
      </div>
      <div className="page-header">
        <div>
          <button
            className="back-link"
            style={{ border: 'none', background: 'none', color: 'var(--ink-soft)', fontSize: 12.5, fontWeight: 600, padding: 0, marginBottom: 4, cursor: 'pointer' }}
            onClick={() => navigate(usuario ? `/${orgSlug}/funcionario/lancar` : `/${orgSlug}`)}
          >
            ← Voltar
          </button>
          <h1>{titulo}</h1>
        </div>
      </div>
      {children}
    </div>
  );
}
