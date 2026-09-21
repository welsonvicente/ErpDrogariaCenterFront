import { describe, expect, it } from 'vitest';
import { estadoFolgasVazio } from '../types/folgas';
import { creditoDisponivelMaisAntigo, diasInclusivos, parearCreditos, saldoDe } from './folgas';

function estadoExemplo() {
  const estado = estadoFolgasVazio();
  estado.employees.push({ id: 'emp-1', usuarioId: 'usuario-1', name: 'Ana' });
  estado.credits.push(
    { id: 'cred-2', employeeId: 'emp-1', workedDate: '2026-09-13', createdAt: '2026-09-13T12:00:00Z' },
    { id: 'cred-1', employeeId: 'emp-1', workedDate: '2026-09-06', createdAt: '2026-09-06T12:00:00Z' },
  );
  estado.daysOff.push({ id: 'off-1', employeeId: 'emp-1', date: '2026-09-20', createdAt: '2026-09-14T12:00:00Z' });
  return estado;
}

describe('utilitários de Folgas', () => {
  it('calcula o saldo como créditos menos folgas agendadas', () => {
    expect(saldoDe(estadoExemplo(), 'emp-1')).toBe(1);
  });

  it('pareia a primeira folga com o crédito mais antigo', () => {
    const estado = estadoExemplo();
    expect(parearCreditos(estado).get('cred-1')).toBe('2026-09-20');
    expect(creditoDisponivelMaisAntigo(estado, 'emp-1')?.id).toBe('cred-2');
  });

  it('conta os dias de afastamento incluindo início e fim', () => {
    expect(diasInclusivos('2026-09-01', '2026-09-03')).toBe(3);
  });
});

