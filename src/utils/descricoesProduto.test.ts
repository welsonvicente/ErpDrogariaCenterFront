import { beforeEach, describe, expect, it } from 'vitest';
import { chaveDescricaoProduto, descricaoDoProduto, salvarDescricaoProduto } from './cartazPersistencia';

describe('dicionário de descrições de produto', () => {
  beforeEach(() => localStorage.clear());

  it('usa o EAN como chave quando existe, senão o nome original normalizado', () => {
    expect(chaveDescricaoProduto('Creme X', '789 1234-5')).toBe('ean:78912345');
    expect(chaveDescricaoProduto('  creme   dental  ', null)).toBe(chaveDescricaoProduto('CREME DENTAL', ''));
  });

  it('sem edição devolve o nome original; editado, devolve a descrição salva', () => {
    expect(descricaoDoProduto('CR DENT ORAL-B 70G', '7891')).toBe('CR DENT ORAL-B 70G');
    salvarDescricaoProduto('CR DENT ORAL-B 70G', '7891', 'Creme Dental Oral-B 70g');
    expect(descricaoDoProduto('CR DENT ORAL-B 70G', '7891')).toBe('Creme Dental Oral-B 70g');
  });

  it('mesmo EAN com outro nome na planilha do mês seguinte continua com a descrição editada', () => {
    salvarDescricaoProduto('CR DENT ORAL-B 70G', '7891', 'Creme Dental Oral-B 70g');
    expect(descricaoDoProduto('CREME DENT ORAL B 70 G', '7891')).toBe('Creme Dental Oral-B 70g');
  });

  it('voltar ao nome original ou apagar o texto remove a edição', () => {
    salvarDescricaoProduto('SAB LIQ NATHY', null, 'Sabonete Líquido Nathy');
    salvarDescricaoProduto('SAB LIQ NATHY', null, '   ');
    expect(descricaoDoProduto('SAB LIQ NATHY', null)).toBe('SAB LIQ NATHY');
  });
});
