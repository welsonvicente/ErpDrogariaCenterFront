import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmployeeExpensePage } from './EmployeeExpensePage';
import { categoriaService } from '../services/categoriaService';
import { despesaService } from '../services/despesaService';
import { funcionarioService } from '../services/funcionarioService';
import type { Categoria, Colega } from '../types';

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    usuario: { id: 'func-1', nome: 'Welson', icone: '😀', perfil: 'FUNCIONARIO' },
    logout: vi.fn(),
  }),
}));

vi.mock('../services/categoriaService');
vi.mock('../services/despesaService');
vi.mock('../services/funcionarioService');

const CATEGORIA_NORMAL: Categoria = {
  id: 'cat-normal',
  nome: 'Combustível',
  icone: '⛽',
  ordem: 0,
  ativo: true,
  exigeBeneficiario: false,
};

const CATEGORIA_DIARIA: Categoria = {
  id: 'cat-diaria',
  nome: 'Diária de domingo ou feriado',
  icone: '📅',
  ordem: 1,
  ativo: true,
  exigeBeneficiario: true,
};

const COLEGAS: Colega[] = [{ id: 'colega-1', nome: 'Kátia', icone: '💊' }];

function renderPagina() {
  return render(
    <MemoryRouter initialEntries={['/drogariacenter/funcionario/lancar']}>
      <Routes>
        <Route path=":orgSlug/funcionario/lancar" element={<EmployeeExpensePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('EmployeeExpensePage — seletor de beneficiário', () => {
  beforeEach(() => {
    vi.mocked(categoriaService.list).mockResolvedValue([CATEGORIA_NORMAL, CATEGORIA_DIARIA]);
    vi.mocked(funcionarioService.listColegas).mockResolvedValue(COLEGAS);
    vi.mocked(despesaService.create).mockResolvedValue({} as any);
  });

  it('não mostra o seletor de colaborador pra uma categoria comum', async () => {
    const user = userEvent.setup();
    renderPagina();

    const botaoCategoria = await screen.findByText('Combustível');
    await user.click(botaoCategoria);

    expect(screen.queryByLabelText(/colaborador que vai receber/i)).not.toBeInTheDocument();
  });

  it('mostra o seletor de colaborador pra uma categoria com exigeBeneficiario', async () => {
    const user = userEvent.setup();
    renderPagina();

    const botaoCategoria = await screen.findByText('Diária de domingo ou feriado');
    await user.click(botaoCategoria);

    expect(await screen.findByLabelText(/colaborador que vai receber/i)).toBeInTheDocument();
  });

  it('não envia (o campo é obrigatório) se não escolher o colaborador numa categoria que exige', async () => {
    const user = userEvent.setup();
    renderPagina();

    await user.click(await screen.findByText('Diária de domingo ou feriado'));
    await user.type(screen.getByLabelText('Valor (R$)'), '50,00');
    // Não seleciona o colaborador de propósito — o próprio <select required>
    // já barra o envio no navegador antes de qualquer validação em JS.
    await user.click(screen.getByRole('button', { name: /lançar gasto/i }));

    expect(despesaService.create).not.toHaveBeenCalled();
  });

  it('envia o beneficiarioId escolhido quando a categoria exige', async () => {
    const user = userEvent.setup();
    renderPagina();

    await user.click(await screen.findByText('Diária de domingo ou feriado'));
    await user.type(screen.getByLabelText('Valor (R$)'), '50,00');
    await user.selectOptions(await screen.findByLabelText(/colaborador que vai receber/i), 'colega-1');
    await user.click(screen.getByRole('button', { name: /lançar gasto/i }));

    await waitFor(() => {
      expect(despesaService.create).toHaveBeenCalledWith(
        expect.objectContaining({ categoriaId: 'cat-diaria', beneficiarioId: 'colega-1', valor: 50 }),
      );
    });
  });
});
