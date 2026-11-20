import { parseValorBr } from '../money';
import type { ItemPdf, LinhaPdf } from './tipos';

/** Itens a menos de ~2,5 pt de altura estão na mesma linha (o pdf.js às vezes varia 1 pt entre colunas). */
const TOLERANCIA_Y = 2.5;

/** Agrupa os trechos de texto em linhas visuais, de cima pra baixo, página por página. */
export function agruparLinhas(itens: ItemPdf[]): LinhaPdf[] {
  const validos = itens.filter((i) => i.s.trim() !== '');
  const porPagina = new Map<number, ItemPdf[]>();
  for (const item of validos) porPagina.set(item.pagina, [...(porPagina.get(item.pagina) ?? []), item]);

  const linhas: LinhaPdf[] = [];
  for (const pagina of [...porPagina.keys()].sort((a, b) => a - b)) {
    const grupos: Array<{ y: number; itens: ItemPdf[] }> = [];
    for (const item of [...(porPagina.get(pagina) ?? [])].sort((a, b) => b.y - a.y)) {
      const grupo = grupos.find((g) => Math.abs(g.y - item.y) <= TOLERANCIA_Y);
      if (grupo) grupo.itens.push(item);
      else grupos.push({ y: item.y, itens: [item] });
    }
    for (const g of grupos) {
      const ordenados = g.itens.sort((a, b) => a.x - b.x);
      linhas.push({ pagina, y: g.y, itens: ordenados, texto: ordenados.map((i) => i.s.trim()).join(' ') });
    }
  }
  return linhas;
}

/** Texto sem acento, minúsculo, sem espaços das pontas — pra comparar cabeçalhos. */
export function normalizarRotulo(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Acha, na linha, o item cujo texto (normalizado) é exatamente o rótulo. */
export function itemDoRotulo(linha: LinhaPdf, rotulo: string): ItemPdf | undefined {
  const alvo = normalizarRotulo(rotulo);
  return linha.itens.find((i) => normalizarRotulo(i.s) === alvo);
}

/** A primeira linha que contém TODOS os rótulos — é o cabeçalho da tabela. */
export function acharCabecalho(linhas: LinhaPdf[], rotulos: string[]): LinhaPdf | undefined {
  return linhas.find((l) => rotulos.every((r) => itemDoRotulo(l, r)));
}

/** Valor do item que vem logo depois do rótulo ("Período:" → "18/11/2026 a 18/11/2026"). */
export function valorApos(linhas: LinhaPdf[], rotulo: string): string | null {
  const alvo = normalizarRotulo(rotulo);
  for (const linha of linhas) {
    const i = linha.itens.findIndex((it) => normalizarRotulo(it.s) === alvo);
    if (i >= 0 && linha.itens[i + 1]) return linha.itens[i + 1].s.trim();
  }
  return null;
}

/** "R$ 1.084,64" / "1.018,12" / "-0,06" → número; texto que não é número → null. */
export function numeroBr(texto: string | undefined | null): number | null {
  if (!texto) return null;
  const limpo = texto.replace(/R\$|\s| /g, '');
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$|^-?\d+(\.\d+)?$/.test(limpo)) return null;
  const n = parseValorBr(limpo);
  return Number.isFinite(n) ? n : null;
}

/** Arredonda a centavos — somas de float (0.1 + 0.2) não podem aparecer como diferença no relatório. */
export function centavos(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}
