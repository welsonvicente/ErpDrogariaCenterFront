import { describe, expect, it } from 'vitest';
import { parseValorBr } from './money';

describe('parseValorBr', () => {
  it('converte um valor simples com vírgula decimal', () => {
    expect(parseValorBr('9,99')).toBe(9.99);
  });

  it('converte um valor com separador de milhar e vírgula decimal (o bug original)', () => {
    expect(parseValorBr('1.234,56')).toBe(1234.56);
  });

  it('converte milhares de milhar (mais de um ponto)', () => {
    expect(parseValorBr('1.234.567,89')).toBe(1234567.89);
  });

  it('trata um único ponto com 1-2 casas como decimal (ex.: alguém digitando em formato EN)', () => {
    expect(parseValorBr('10.50')).toBe(10.5);
    expect(parseValorBr('10.5')).toBe(10.5);
  });

  it('trata um único ponto com exatamente 3 casas como separador de milhar', () => {
    expect(parseValorBr('1.234')).toBe(1234);
  });

  it('converte um valor inteiro sem separador nenhum', () => {
    expect(parseValorBr('1234')).toBe(1234);
  });

  it('devolve NaN pra texto vazio ou só espaços', () => {
    expect(parseValorBr('')).toBeNaN();
    expect(parseValorBr('   ')).toBeNaN();
  });

  it('devolve NaN pra texto que não é número', () => {
    expect(parseValorBr('abc')).toBeNaN();
  });
});
