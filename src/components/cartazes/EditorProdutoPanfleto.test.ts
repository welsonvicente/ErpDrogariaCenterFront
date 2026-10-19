import { describe, expect, it } from 'vitest';
import { normalizarPrecoDigitado } from './EditorProdutoPanfleto';

describe('normalizarPrecoDigitado', () => {
  it.each([
    ['9,99', '9.99'],
    ['9.99', '9.99'],
    ['R$ 1.234,50', '1234.5'],
    ['12', '12'],
    ['', ''],
    ['  ', ''],
  ])('%s → %s', (digitado, esperado) => {
    expect(normalizarPrecoDigitado(digitado)).toBe(esperado);
  });
});
