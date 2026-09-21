import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { OrganizationRequiredPage } from './OrganizationRequiredPage';

function renderEntrada(caminho: string, entrada: 'funcionario' | 'gerente' | 'ferramenta') {
  return render(
    <MemoryRouter initialEntries={[caminho]}>
      <Routes>
        <Route path="funcionario/*" element={<OrganizationRequiredPage entrada={entrada} />} />
        <Route path="gerente/*" element={<OrganizationRequiredPage entrada={entrada} />} />
        <Route path="drogaria-center/funcionario" element={<p>Login de funcionário</p>} />
        <Route path="drogaria-center/gerente/login" element={<p>Login de gerente</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OrganizationRequiredPage', () => {
  it('inclui a organização no link direto de funcionário', async () => {
    const user = userEvent.setup();
    renderEntrada('/funcionario', 'funcionario');

    await user.type(screen.getByLabelText(/endereço da organização/i), 'Drogária Center');
    await user.click(screen.getByRole('button', { name: /continuar para identificação/i }));

    expect(await screen.findByText('Login de funcionário')).toBeInTheDocument();
  });

  it('encaminha a rota de gerente ao login da organização', async () => {
    const user = userEvent.setup();
    renderEntrada('/gerente/funcionarios', 'gerente');

    await user.type(screen.getByLabelText(/endereço da organização/i), 'drogaria-center');
    await user.click(screen.getByRole('button', { name: /continuar para o login/i }));

    expect(await screen.findByText('Login de gerente')).toBeInTheDocument();
  });
});
