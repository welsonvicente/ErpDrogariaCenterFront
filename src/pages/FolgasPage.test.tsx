import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../context/AuthContext';
import { funcionarioService } from '../services/funcionarioService';
import { folgasService } from '../services/folgasService';
import { estadoFolgasVazio } from '../types/folgas';
import { amanhaIso, hojeIso } from '../utils/folgas';
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
    vi.mocked(funcionarioService.list).mockReset();
    vi.mocked(funcionarioService.list).mockResolvedValue([]);
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

  it('pede o PIN de gerente em vez de mostrar a gestão vazia quando o servidor exige (428)', async () => {
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'gerente-2', nome: 'Cláudia', email: null, perfil: 'GERENTE' },
      atualizarUsuarioLocal: vi.fn(),
    } as unknown as ReturnType<typeof useAuth>);
    vi.mocked(folgasService.get).mockRejectedValue({
      response: { status: 428, data: { message: 'Defina um PIN de acesso ao painel antes de continuar.', details: { acao: 'DEFINIR_PIN_GESTOR' } } },
    });

    renderizar();

    expect(await screen.findByText('Defina seu PIN de gerente para abrir Folgas')).toBeInTheDocument();
    expect(screen.getByLabelText('Seu PIN atual')).toBeInTheDocument();
    expect(screen.queryByText('Banco de folgas da equipe')).toBeNull();
  });

  it('mostra no histórico o crédito registrado no mês mesmo com data trabalhada de outro mês', async () => {
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'admin-1', nome: 'Admin', email: null, perfil: 'ADMIN' },
    } as ReturnType<typeof useAuth>);
    const estado = estadoFolgasVazio();
    estado.employees.push({ id: 'emp-w', usuarioId: null, name: 'Willian' });
    estado.credits.push({ id: 'cred-w', employeeId: 'emp-w', workedDate: '2020-01-05', createdAt: new Date().toISOString() });
    vi.mocked(folgasService.get).mockResolvedValue({ estado, versao: 1 });

    renderizar();

    expect(await screen.findByText('05/01/2020')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Remover' })).not.toHaveLength(0);
  });

  it('funcionário pede folga como pendente e só vê Cancelar até a véspera', async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'usuario-1', nome: 'Ana', email: null, perfil: 'FUNCIONARIO' },
    } as ReturnType<typeof useAuth>);
    const estado = estadoFolgasVazio();
    estado.employees.push({ id: 'emp-1', usuarioId: 'usuario-1', name: 'Ana' });
    estado.credits.push(
      { id: 'cred-1', employeeId: 'emp-1', workedDate: '2026-09-06', createdAt: '2026-09-06T12:00:00Z' },
      { id: 'cred-2', employeeId: 'emp-1', workedDate: '2026-09-13', createdAt: '2026-09-13T12:00:00Z' },
      { id: 'cred-3', employeeId: 'emp-1', workedDate: '2026-09-20', createdAt: '2026-09-20T12:00:00Z' },
    );
    estado.daysOff.push(
      { id: 'off-hoje', employeeId: 'emp-1', date: hojeIso(), createdAt: '2026-10-01T12:00:00Z', status: 'aprovada' },
      { id: 'off-amanha', employeeId: 'emp-1', date: amanhaIso(), createdAt: '2026-10-01T12:00:00Z', status: 'pendente' },
    );
    vi.mocked(folgasService.get).mockResolvedValue({ estado, versao: 2 });
    vi.mocked(folgasService.save).mockResolvedValue(3);

    renderizar();

    expect(await screen.findByText('Aguardando aprovação')).toBeInTheDocument();
    // Só a folga de amanhã pode ser cancelada; a de hoje já não.
    expect(screen.getAllByRole('button', { name: 'Cancelar' })).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: /Agendar folga/i }));
    const data = new Date();
    data.setDate(data.getDate() + 5);
    const iso = `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    fireEvent.change(screen.getByRole('dialog', { name: 'Agendar minha folga' }).querySelector('input[type="date"]')!, { target: { value: iso } });
    await user.click(screen.getByRole('button', { name: 'Confirmar folga' }));

    await waitFor(() => {
      expect(folgasService.save).toHaveBeenCalledWith(
        expect.objectContaining({ daysOff: expect.arrayContaining([expect.objectContaining({ date: iso, status: 'pendente' })]) }),
        2,
      );
    });
  });

  it('mostra o aviso de pedidos pendentes e a gerência aceita', async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'gerente-1', nome: 'Carlos', email: null, perfil: 'GERENTE' },
    } as ReturnType<typeof useAuth>);
    const estado = estadoFolgasVazio();
    estado.employees.push({ id: 'emp-1', usuarioId: 'usuario-1', name: 'Ana' });
    estado.credits.push({ id: 'cred-1', employeeId: 'emp-1', workedDate: '2026-09-06', createdAt: '2026-09-06T12:00:00Z' });
    estado.daysOff.push({ id: 'off-1', employeeId: 'emp-1', date: amanhaIso(), createdAt: '2026-10-01T12:00:00Z', status: 'pendente' });
    vi.mocked(folgasService.get).mockResolvedValue({ estado, versao: 5 });
    vi.mocked(folgasService.save).mockResolvedValue(6);

    renderizar();

    expect(await screen.findByText('1 pedido de folga aguardando sua resposta')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Aceitar/ }));

    await waitFor(() => {
      expect(folgasService.save).toHaveBeenCalledWith(
        expect.objectContaining({ daysOff: [expect.objectContaining({ id: 'off-1', status: 'aprovada', decididoPor: 'Carlos (Gerente)' })] }),
        5,
      );
    });
    expect(screen.queryByText('1 pedido de folga aguardando sua resposta')).toBeNull();
  });

  it('vincula em lote nomes legados encontrados no cadastro', async () => {
    const user = userEvent.setup();
    vi.mocked(useAuth).mockReturnValue({
      usuario: { id: 'admin-1', nome: 'Admin', email: 'admin@teste.local', perfil: 'ADMIN' },
    } as ReturnType<typeof useAuth>);
    const estado = estadoFolgasVazio();
    estado.employees.push({ id: 'emp-1', usuarioId: null, name: 'Wesley' });
    vi.mocked(folgasService.get).mockResolvedValue({ estado, versao: 3 });
    vi.mocked(folgasService.save).mockResolvedValue(4);
    vi.mocked(funcionarioService.list).mockResolvedValue([
      { id: 'usuario-wesley', nome: 'Wesley', codigo: '7', icone: '🙂', perfil: 'FUNCIONARIO', ativo: true, criadoEm: '', atualizadoEm: '' },
    ]);

    renderizar();
    await user.click(await screen.findByRole('button', { name: /colaboradores/i }));
    await user.click(await screen.findByRole('button', { name: /vincular nomes encontrados/i }));

    await waitFor(() => {
      expect(folgasService.save).toHaveBeenCalledWith(
        expect.objectContaining({ employees: [expect.objectContaining({ usuarioId: 'usuario-wesley', name: 'Wesley' })] }),
        3,
      );
    });
  });
});
