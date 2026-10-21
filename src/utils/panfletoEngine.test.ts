import { describe, expect, it } from 'vitest';
import { escalarGrupoCards, gradePadraoPanfleto, moverGrupoCards, PRESETS_TAMANHO_PANFLETO } from './panfletoEngine';

const grade = () => gradePadraoPanfleto(9, PRESETS_TAMANHO_PANFLETO[9], 40, false);
const perto = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-9);

describe('mover/escalar todos os cards do panfleto', () => {
  it('move o grupo inteiro junto, sem mudar o espaçamento', () => {
    const antes = grade();
    const depois = moverGrupoCards(antes, 0, 0.03);
    depois.forEach((c, i) => {
      perto(c.y, antes[i].y + 0.03);
      perto(c.x, antes[i].x);
    });
    perto(depois[1].x - depois[0].x, antes[1].x - antes[0].x);
  });

  it('o grupo para na borda da página — nenhum card sai', () => {
    const depois = moverGrupoCards(grade(), 0, 5);
    const base = Math.max(...depois.map((c) => c.y + c.altura));
    perto(base, 1);
    const subiu = moverGrupoCards(grade(), -5, -5);
    perto(Math.min(...subiu.map((c) => c.x)), 0);
    perto(Math.min(...subiu.map((c) => c.y)), 0);
  });

  it('diminuir todos: cards e espaçamentos encolhem juntos, a partir do centro do grupo', () => {
    const antes = grade();
    const depois = escalarGrupoCards(antes, 0.9);
    perto(depois[0].largura, antes[0].largura * 0.9);
    perto(depois[1].x - depois[0].x, (antes[1].x - antes[0].x) * 0.9);
    const centro = (cs: typeof antes) => (Math.min(...cs.map((c) => c.x)) + Math.max(...cs.map((c) => c.x + c.largura))) / 2;
    perto(centro(depois), centro(antes));
  });

  it('aumentar todos nunca deixa o grupo maior que a página nem fora dela', () => {
    const depois = escalarGrupoCards(grade(), 3);
    expect(Math.min(...depois.map((c) => c.x))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...depois.map((c) => c.x + c.largura))).toBeLessThanOrEqual(1 + 1e-9);
    expect(Math.min(...depois.map((c) => c.y))).toBeGreaterThanOrEqual(-1e-9);
    expect(Math.max(...depois.map((c) => c.y + c.altura))).toBeLessThanOrEqual(1 + 1e-9);
  });
});
