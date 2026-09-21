import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../context/AuthContext';
import { folgasService } from '../services/folgasService';
import { estadoFolgasVazio } from '../types/folgas';
import { FolgasPage } from './FolgasPage';

vi.mock('../context/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('../services/folgasService', () => ({
  folgasService: { get: vi.fn(), save: vi.fn() },
}));
vi.mock('../services/funcionarioService', () => ({
  funcionarioService: { list: vi.fn().mockResolvedValue([]) },
}));

function renderizar() {
  return render(
    <MemoryRouter initialEntries={['/farmacia/folgas']}>
      <Routes><Route path="/:orgSlug/folgas" element={<FolgasPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('FolgasPage', () => {
  beforeEach(() => {
    vi.mocked(folgasService.get).mockReset();
  });

  it('renderiza a gestão como tela React nativa, sem iframe', async () => {
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'admin-1', nome: 'Gestora', email: 'gestora@teste.local', perfil: 'ADMIN' },
    } as ReturnType<typeof useAuth>);
    vi.mocked(folgasService.get).mockResolvedValue({ estado: estadoFolgasVazio(), versao: 0 });

    const { container } = renderizar();

    expect(await screen.findByText('Banco de folgas da equipe')).toBeInTheDocument();
    expect(screen.getAllByText('Créditos concedidos')).not.toHaveLength(0);
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('mostra saldo e ações próprias para funcionário vinculado', async () => {
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'usuario-1', nome: 'Ana', email: null, perfil: 'FUNCIONARIO' },
    } as ReturnType<typeof useAuth>);
    const estado = estadoFolgasVazio();
    estado.employees.push({ id: 'emp-1', usuarioId: 'usuario-1', name: 'Ana' });
    estado.credits.push({ id: 'cred-1', employeeId: 'emp-1', workedDate: '2026-09-06', createdAt: '2026-09-06T12:00:00Z' });
    vi.mocked(folgasService.get).mockResolvedValue({ estado, versao: 1 });

    renderizar();

    expect(await screen.findByText('Seu banco de folgas')).toBeInTheDocument();
    expect(screen.getByText('folga(s) disponível(is)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Agendar folga/i })).toBeEnabled();
  });
});
