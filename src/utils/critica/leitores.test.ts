import { describe, expect, it } from 'vitest';
import { pdfCotaPreco, pdfCotaPrecoVarios, pdfTrier } from '../../tests/fabricaPdf';
import { ErroLeituraPdf, lerPedidoCotaPreco } from './parserCotaPreco';
import { lerRelatorioTrier } from './parserTrier';
import { agruparLinhas, numeroBr } from './tabelaPdf';

describe('numeroBr', () => {
  it.each([
    ['R$ 1.084,64', 1084.64],
    ['1.018,12', 1018.12],
    ['-0,06', -0.06],
    ['7,99', 7.99],
    ['15', 15],
  ])('%s → %s', (texto, esperado) => {
    expect(numeroBr(texto)).toBe(esperado);
  });
  it('texto que não é número vira null', () => {
    expect(numeroBr('GEOLAB')).toBeNull();
    expect(numeroBr('')).toBeNull();
    expect(numeroBr(undefined)).toBeNull();
  });
});

describe('agruparLinhas', () => {
  it('junta itens com alturas quase iguais e ordena de cima pra baixo, da esquerda pra direita', () => {
    const linhas = agruparLinhas([
      { pagina: 1, x: 100, y: 500.4, w: 10, s: 'B' },
      { pagina: 1, x: 10, y: 501.2, w: 10, s: 'A' },
      { pagina: 1, x: 10, y: 400, w: 10, s: 'C' },
      { pagina: 1, x: 10, y: 300, w: 10, s: '   ' },
    ]);
    expect(linhas.map((l) => l.texto)).toEqual(['A B', 'C']);
  });
});

describe('lerPedidoCotaPreco', () => {
  const itens = [
    { produto: 'ACETILCISTEINA XPE PED 100ML', qtd: 15, unitario: 7.99 },
    { produto: 'CARVEDILOL 6,25MG 30CP', qtd: 6, unitario: 2.39 },
    { produto: 'OMEGA 3 1000MG 120CAP', qtd: 3, unitario: 49.9 },
  ];

  it('lê os itens, o total e os dados do cabeçalho', () => {
    const pedido = lerPedidoCotaPreco(pdfCotaPreco({ itens }));
    expect(pedido.itens).toEqual([
      { id: 1, ean: null, produto: 'ACETILCISTEINA XPE PED 100ML', qtd: 15, unitario: 7.99, subtotal: 119.85 },
      { id: 2, ean: null, produto: 'CARVEDILOL 6,25MG 30CP', qtd: 6, unitario: 2.39, subtotal: 14.34 },
      { id: 3, ean: null, produto: 'OMEGA 3 1000MG 120CAP', qtd: 3, unitario: 49.9, subtotal: 149.7 },
    ]);
    expect(pedido).toMatchObject({
      numero: 'PED-C000001-D000001',
      cotacao: 'COTAÇÃO 01/01/2026',
      comprador: 'Farmácia Teste LTDA',
      compradorCnpj: '00.000.000/0001-00',
      distribuidora: 'Distribuidora Exemplo',
      representante: 'Fulano de Tal · 81999990000',
      totalDeclarado: 283.89,
      minimoDistribuidora: 2,
      geradoEm: '01/01/2026 10:00',
    });
  });

  it('guarda o EAN quando existe e trata "-" como sem EAN', () => {
    const pedido = lerPedidoCotaPreco(pdfCotaPreco({ itens: [{ ...itens[0], ean: '7891234567895' }, itens[1]] }));
    expect(pedido.itens.map((i) => i.ean)).toEqual(['7891234567895', null]);
  });

  it('junta o nome que quebrou em duas linhas', () => {
    const pedido = lerPedidoCotaPreco(pdfCotaPreco({ itens: [{ produto: 'PRODUTO COM NOME BEM COMPRIDO 500MG 30CP', qtd: 2, unitario: 3 }, itens[1]], quebrarNome: true }));
    expect(pedido.itens).toHaveLength(2);
    expect(pedido.itens[0].produto).toBe('PRODUTO COM NOME BEM COMPRIDO 500MG 30CP');
  });

  it('o total impresso é lido à parte da soma (pode não bater)', () => {
    const pedido = lerPedidoCotaPreco(pdfCotaPreco({ itens, total: 300 }));
    expect(pedido.totalDeclarado).toBe(300);
  });

  it('recusa um PDF que não é do CotaPreço', () => {
    expect(() => lerPedidoCotaPreco(pdfTrier({ itens: [{ codigo: '1', produto: 'X', qtd: 1, unitario: 1 }] }))).toThrow(ErroLeituraPdf);
  });
});

describe('lerPedidoCotaPreco — PDF com pedidos de várias distribuidoras', () => {
  const pdf = () =>
    pdfCotaPrecoVarios([
      { distribuidora: 'Dismepe', numero: 'PED-C000080-D000780', itens: [{ produto: 'DIAZEPAM NQ 5MG 30CP', qtd: 1, unitario: 3.08 }, { produto: 'GEROVITAL 60CAP MOLE', qtd: 2, unitario: 59.86 }] },
      { distribuidora: 'G1 distribuidora', numero: 'PED-C000080-D000762', itens: [{ produto: 'CARVEDILOL 6,25MG 30CP', qtd: 6, unitario: 2.39 }] },
      { distribuidora: 'plena', numero: 'PED-C000080-D000782', itens: [{ produto: 'DEXAMETASONA 4MG 10CP', qtd: 15, unitario: 2.53 }], total: 40 },
    ]);

  it('separa os pedidos e marca cada item com a distribuidora e o número de onde veio', () => {
    const pedido = lerPedidoCotaPreco(pdf());
    expect(pedido.itens.map((i) => [i.id, i.produto, i.distribuidora, i.pedidoNumero])).toEqual([
      [1, 'DIAZEPAM NQ 5MG 30CP', 'Dismepe', 'PED-C000080-D000780'],
      [2, 'GEROVITAL 60CAP MOLE', 'Dismepe', 'PED-C000080-D000780'],
      [3, 'CARVEDILOL 6,25MG 30CP', 'G1 distribuidora', 'PED-C000080-D000762'],
      [4, 'DEXAMETASONA 4MG 10CP', 'plena', 'PED-C000080-D000782'],
    ]);
  });

  it('resume cada pedido (itens, total impresso) e o documento vira "Várias (n)"', () => {
    const pedido = lerPedidoCotaPreco(pdf());
    expect(pedido.pedidos).toHaveLength(3);
    expect(pedido.pedidos![0]).toMatchObject({ numero: 'PED-C000080-D000780', distribuidora: 'Dismepe', itens: 2, totalDeclarado: 122.8, minimoDistribuidora: 2 });
    expect(pedido.pedidos![2]).toMatchObject({ distribuidora: 'plena', totalDeclarado: 40 });
    expect(pedido.distribuidora).toBe('Várias (3): Dismepe, G1 distribuidora, plena');
    expect(pedido.numero).toBe('PED-C000080-D000780 +2');
    expect(pedido.totalDeclarado).toBe(177.14);
  });

  it('PDF de um pedido só continua sem marcar distribuidora nos itens', () => {
    const pedido = lerPedidoCotaPreco(pdfCotaPreco({ itens: [{ produto: 'X 10MG', qtd: 1, unitario: 2 }], distribuidora: 'Única' }));
    expect(pedido.pedidos).toBeUndefined();
    expect(pedido.distribuidora).toBe('Única');
    expect(pedido.itens[0].distribuidora).toBeUndefined();
  });
});

describe('lerRelatorioTrier', () => {
  const itens = [
    { codigo: '38639', produto: 'ACETILCISTEINA XPE PED 100ML', laboratorio: 'GEOLAB', grupo: 8, estoque: 15, qtd: 15, unitario: 7.99, desconto: -0.06, venda: 375 },
    { codigo: '54935', produto: 'QUETIAPINA 100MG 30CP REV', grupo: 8, estoque: 3, qtd: 3, unitario: 19.28 },
    { codigo: '34381', produto: 'AGUA OXIG 10V FARMAX 100ML', laboratorio: 'FARMAX DIV.', grupo: 23, estoque: 13, qtd: 12, unitario: 2.39, desconto: 0.03 },
  ];

  it('lê código, produto, laboratório, quantidades e valores', () => {
    const relatorio = lerRelatorioTrier(pdfTrier({ itens }));
    expect(relatorio.itens).toHaveLength(3);
    expect(relatorio.itens[0]).toEqual({
      id: 1,
      codigo: '38639',
      produto: 'ACETILCISTEINA XPE PED 100ML',
      laboratorio: 'GEOLAB',
      grupo: '8',
      estoque: 15,
      qtd: 15,
      unitario: 7.99,
      bruto: 119.85,
      desconto: -0.06,
      liquido: 119.91,
      venda: 375,
    });
    expect(relatorio.itens[2]).toMatchObject({ produto: 'AGUA OXIG 10V FARMAX 100ML', laboratorio: 'FARMAX DIV.', grupo: '23', estoque: 13, qtd: 12 });
  });

  it('laboratório vazio vira null e não vaza para o produto', () => {
    const quetiapina = lerRelatorioTrier(pdfTrier({ itens })).itens[1];
    expect(quetiapina.produto).toBe('QUETIAPINA 100MG 30CP REV');
    expect(quetiapina.laboratorio).toBeNull();
  });

  it('ignora linha de grupo e de total, usa o "Total Geral" e lê o cabeçalho do relatório', () => {
    const relatorio = lerRelatorioTrier(pdfTrier({ itens }));
    expect(relatorio.itens.map((i) => i.codigo)).toEqual(['38639', '54935', '34381']);
    expect(relatorio.totalLiquido).toBeCloseTo(119.91 + 57.84 + 28.65, 2);
    expect(relatorio).toMatchObject({ filial: 'FARMÁCIA TESTE', fornecedor: 'VÁRIOS', periodo: '01/01/2026 a 01/01/2026', emitidoEm: '02/01/2026 Hora:10:00:00'.replace('Hora:', '') });
  });

  it('lê relatório com várias páginas (o cabeçalho se repete em cada uma)', () => {
    const muitos = Array.from({ length: 6 }, (_, i) => ({ codigo: String(100 + i), produto: `PRODUTO ${i} 10MG 30CP`, qtd: i + 1, unitario: 2 }));
    const relatorio = lerRelatorioTrier(pdfTrier({ itens: muitos, paginas: 3 }));
    expect(relatorio.itens.map((i) => i.codigo)).toEqual(['100', '101', '102', '103', '104', '105']);
  });

  it('recusa um PDF que não é o relatório do Trier', () => {
    expect(() => lerRelatorioTrier(pdfCotaPreco({ itens: [{ produto: 'X', qtd: 1, unitario: 1 }] }))).toThrow(ErroLeituraPdf);
  });
});
