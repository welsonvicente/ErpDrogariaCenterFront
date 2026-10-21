import { describe, expect, it } from 'vitest';
import { normalizarPrecoDigitado, precoParaExibir } from './EditorProdutoPanfleto';

describe('precoParaExibir', () => {
  it.each([
    [54.99, 'R$ 54,99'],
    ['54,99', 'R$ 54,99'],
    ['9.99', 'R$ 9,99'],
    ['', ''],
    [null, ''],
  ])('%s → "%s"', (valor, esperado) => {
    // toLocaleString usa espaço comum ou não separável conforme o ambiente — compara sem distinguir.
    expect(precoParaExibir(valor).replace(/\s/g, ' ')).toBe(esperado);
  });
});

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
