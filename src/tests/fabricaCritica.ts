import type { ItemCota, ItemTrier, PedidoCota, RelatorioTrier } from '../utils/critica/tipos';

/** Pedido do CotaPreço de teste: [produto, qtd, unitário]. */
export function cota(itens: Array<[string, number, number]>, totalDeclarado?: number): PedidoCota {
  const lista: ItemCota[] = itens.map(([produto, qtd, unitario], i) => ({ id: i + 1, ean: null, produto, qtd, unitario, subtotal: Math.round(qtd * unitario * 100) / 100 }));
  const soma = Math.round(lista.reduce((s, i) => s + i.subtotal, 0) * 100) / 100;
  return { numero: 'PED-1', cotacao: 'COTAÇÃO 01/01/2026', comprador: null, compradorCnpj: null, distribuidora: 'Distribuidora Exemplo', representante: null, totalDeclarado: totalDeclarado ?? soma, minimoDistribuidora: null, geradoEm: null, itens: lista };
}

/** Relatório do Trier de teste: [produto, qtd, unitário impresso, bruto (opcional), desconto (opcional)]. */
export function trier(itens: Array<[string, number, number, number?, number?]>, totalLiquido?: number): RelatorioTrier {
  const lista: ItemTrier[] = itens.map(([produto, qtd, unitario, brutoInformado, desconto], i) => {
    const bruto = brutoInformado ?? Math.round(qtd * unitario * 100) / 100;
    const desc = desconto ?? 0;
    return { id: i + 1, codigo: String(1000 + i), produto, laboratorio: null, grupo: null, estoque: null, qtd, unitario, bruto, desconto: desc, liquido: Math.round((bruto - desc) * 100) / 100, venda: null };
  });
  const liq = Math.round(lista.reduce((s, i) => s + i.liquido, 0) * 100) / 100;
  return { filial: 'FARMÁCIA TESTE', periodo: '01/01/2026 a 01/01/2026', fornecedor: 'VÁRIOS', emitidoEm: null, totalLiquido: totalLiquido ?? liq, itens: lista };
}

/** Um pouco de cada situação: OK, arredondamento, quantidade e preço divergentes, atenção, a confirmar, ausentes e extras. */
export const PEDIDO_EXEMPLO = cota([
  ['ACETILCISTEINA XPE PED 100ML', 15, 7.99],
  ['CARVEDILOL 6,25MG 30CP', 6, 2.39],
  ['CETOCONAZOL 20MG/ML SH 100ML', 6, 6.99],
  ['TRAZODONA 50MG 60CP', 6, 16.88],
  ['LEVOCETIRIZINA 5MG 10CP REV', 2, 7.73],
  ['BESILAPIN 5MG 30CP', 2, 1.76],
  ['REPOFLOR 200MG PED 4ENV 1G', 1, 14.84],
  ['DIVALPROATO SOD 250MG 30CP REV', 1, 14.99],
  ['OMEGA 3 1000MG 120CAP', 3, 49.9],
]);

export const RELATORIO_EXEMPLO = trier([
  ['ACETILCISTEINA XPE PED 100ML', 15, 7.99, 119.85, -0.06],
  ['CARVEDILOL 6,25MG 30CP', 6, 2.39],
  ['CETOCONAZOL 20MG/ML SH 100ML', 8, 6.99],
  ['TRAZODONA 50MG 60CP', 6, 15.99],
  ['LEVOCETIRIZINA 5MG 10CP REV', 2, 7.72],
  ['BESILAPIN 5MG 30CP', 2, 1.78, 3.58],
  ['REPOFLOR 200MG 4ENV 800MG', 1, 14.84],
  ['ACIDO VALPROICO 250MG 25CAP', 1, 14.99],
  ['ACIDO MEFENAMICO 500MG 24CP', 10, 10.92],
]);
