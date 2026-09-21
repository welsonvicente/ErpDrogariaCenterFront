import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    vi.mocked(folgasService.save).mockReset();
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

  it('permite que um gerente entre na própria escala de folgas', async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'gerente-1', nome: 'Carlos', email: 'carlos@teste.local', perfil: 'GERENTE' },
    } as ReturnType<typeof useAuth>);
    vi.mocked(folgasService.get).mockResolvedValue({ estado: estadoFolgasVazio(), versao: 0 });
    vi.mocked(folgasService.save).mockResolvedValue(1);

    renderizar();
    await user.click(await screen.findByRole('button', { name: /entrar na escala/i }));

    await waitFor(() => {
      expect(folgasService.save).toHaveBeenCalledWith(
        expect.objectContaining({
          employees: [expect.objectContaining({ usuarioId: 'gerente-1', name: 'Carlos' })],
        }),
        0,
      );
    });
  });

  it('reconhece o gerente que já está em um registro legado da escala', async () => {
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'gerente-2', nome: 'Cláudia', email: 'claudia@teste.local', perfil: 'GERENTE' },
    } as ReturnType<typeof useAuth>);
    const estado = estadoFolgasVazio();
    estado.employees.push({ id: 'emp-legado', usuarioId: null, name: 'Claudia' });
    estado.credits.push({ id: 'cred-legado', employeeId: 'emp-legado', workedDate: '2026-09-06', createdAt: '2026-09-06T12:00:00Z' });
    vi.mocked(folgasService.get).mockResolvedValue({ estado, versao: 1 });

    renderizar();

    expect(await screen.findByText('Você participa da escala')).toBeInTheDocument();
    expect(screen.getByText('1 folga(s) disponível(is).')).toBeInTheDocument();
  });
});
