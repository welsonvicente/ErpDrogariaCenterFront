import { useEffect, useState } from 'react';
import { ManagerLayout } from '../components/ManagerLayout';
import { auditoriaService } from '../services/auditoriaService';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { ACAO_AUDITORIA_LABEL, type RegistroAuditoria } from '../types';

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

/** Trilha de ações sensíveis (editar/excluir lançamento, conceder/revogar atalho pro painel do gestor). */
export function ManagerAuditoriaPage() {
  useDocumentTitle('Auditoria');
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    auditoriaService.list().then((r) => {
      setRegistros(r);
      setLoading(false);
    });
  }, []);

  return (
    <ManagerLayout>
      <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Quem fez</th>
                <th>Ação</th>
                <th>Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => (
                <tr key={r.id}>
                  <td>{fmtDataHora(r.criadoEm)}</td>
                  <td>{r.usuarioNome}</td>
                  <td>{ACAO_AUDITORIA_LABEL[r.acao] ?? r.acao}</td>
                  <td>{r.detalhes ?? '—'}</td>
                </tr>
              ))}
              {registros.length === 0 && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
                    Nenhuma ação registrada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 14, marginBottom: 0 }}>
          Mostra as últimas 200 ações sensíveis (editar/excluir lançamento, conceder/revogar o atalho pro painel do gestor).
        </p>
      </div>
    </ManagerLayout>
  );
}
