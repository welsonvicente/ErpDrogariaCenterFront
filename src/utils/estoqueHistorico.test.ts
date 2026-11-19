import { describe, expect, it } from 'vitest';
import { valorLegivel } from './estoqueHistorico';

describe('valorLegivel', () => {
  it('mostra status por extenso, datas em DD/MM/AAAA e preço em reais', () => {
    expect(valorLegivel('Status da ação', 'EM_ANDAMENTO')).toBe('Em andamento');
    expect(valorLegivel('Prazo', '2026-11-18')).toBe('18/11/2026');
    expect(valorLegivel('Data de início', '2026-01-05')).toBe('05/01/2026');
    expect(valorLegivel('Preço de venda', '12.9')).toMatch(/12,90/);
    expect(valorLegivel('Quantidade atualizada', '4.5')).toBe('4,5');
  });

  it('valor ausente é "Não informado"; texto livre passa como está', () => {
    expect(valorLegivel('Observações', null)).toBe('Não informado');
    expect(valorLegivel('Observações', '')).toBe('Não informado');
    expect(valorLegivel('Observações', 'Montar kit')).toBe('Montar kit');
  });
});
