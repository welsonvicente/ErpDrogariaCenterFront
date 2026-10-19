import { describe, expect, it } from 'vitest';
import type { ProdutoPanfleto } from './panfletoEngine';
import { alinharCaixasTablet, ALTURA_TABLET, centralizarNaLargura, construirArtesTablet, LARGURA_TABLET, posicoesPadraoTablet } from './tabletEngine';

const produto = (nome: string) => ({ nome, de: '10', por: '8' }) as unknown as ProdutoPanfleto;

describe('tabletEngine', () => {
  it('divide os produtos em artes de 4', () => {
    const artes = construirArtesTablet(Array.from({ length: 10 }, (_, i) => produto(`P${i}`)));
    expect(artes.map((a) => a.length)).toEqual([4, 4, 2]);
  });

  it('sem produtos ainda gera uma arte (vazia) pra prévia', () => {
    expect(construirArtesTablet([])).toEqual([[]]);
  });

  it('os 4 cards padrão cabem na largura e não se sobrepõem', () => {
    const caixas = posicoesPadraoTablet(4);
    expect(caixas).toHaveLength(4);
    expect(caixas[0].x).toBeGreaterThanOrEqual(0);
    expect(caixas[3].x + caixas[3].largura).toBeLessThanOrEqual(LARGURA_TABLET);
    for (let i = 1; i < 4; i++) expect(caixas[i].x).toBeGreaterThanOrEqual(caixas[i - 1].x + caixas[i - 1].largura);
  });

  it('cards padrão ficam centralizados na altura da arte', () => {
    const [c] = posicoesPadraoTablet(4);
    expect(Math.abs(c.y - (ALTURA_TABLET - (c.y + c.altura)))).toBeLessThan(1);
  });

  it('"Alinhar produtos" põe todos na mesma altura, com espaços iguais e centralizados', () => {
    const desalinhadas = [
      { x: 155, y: 100, largura: 255, altura: 480 },
      { x: 478, y: 120, largura: 257, altura: 480 },
      { x: 820, y: 90, largura: 255, altura: 480 },
    ];
    const r = alinharCaixasTablet(desalinhadas);
    expect(new Set(r.map((c) => Math.round(c.y))).size).toBe(1);
    expect(Math.round(r[0].y)).toBe(Math.round((ALTURA_TABLET - 480) / 2));
    const espacos = [r[1].x - (r[0].x + r[0].largura), r[2].x - (r[1].x + r[1].largura)];
    expect(Math.abs(espacos[0] - espacos[1])).toBeLessThan(0.001);
    expect(Math.abs(r[0].x - (LARGURA_TABLET - (r[2].x + r[2].largura)))).toBeLessThan(1);
  });

  it('arte com menos produtos centraliza os cards personalizados na largura, mantendo a altura de cada um', () => {
    const r = centralizarNaLargura([{ x: 60, y: 140, largura: 420, altura: 790 }, { x: 520, y: 200, largura: 420, altura: 790 }]);
    expect(r.map((c) => c.y)).toEqual([140, 200]);
    expect(Math.abs(r[0].x - (LARGURA_TABLET - (r[1].x + r[1].largura)))).toBeLessThan(1);
  });

  it('última arte com menos produtos fica centralizada, com cards do mesmo tamanho', () => {
    const [a, b] = posicoesPadraoTablet(2);
    expect(a.largura).toBe(posicoesPadraoTablet(4)[0].largura);
    const esquerda = a.x;
    const direita = LARGURA_TABLET - (b.x + b.largura);
    expect(Math.abs(esquerda - direita)).toBeLessThan(1);
  });
});
