import { describe, expect, it } from 'vitest';
import { produto } from '../tests/fabricaEstoque';
import { categoriaDoProduto } from './estoqueAcoes';
import {
  CONFIG_PADRAO,
  agruparPor,
  analisar,
  calcularTotais,
  classificarPrioridade,
  diasDesde,
  faixasDeTempo,
  filtrarProdutos,
  ordenarPor,
  ordenarRanking,
  simular,
  valorEmEstoque,
} from './estoqueAnalise';

const HOJE = new Date(2026, 10, 19); // 19/11/2026

describe('classificarPrioridade', () => {
  it.each([
    [25, 'P1'],
    [20, 'P1'],
    [19, 'P2'],
    [10, 'P2'],
    [9, 'P3'],
    [5, 'P3'],
    [4, 'P4'],
    [1, 'P4'],
    [0, 'SEM'],
    [-3, 'SEM'],
    [null, 'SEM'],
  ] as const)('saldo %s → %s com as faixas de fábrica', (saldo, esperado) => {
    expect(classificarPrioridade(saldo, CONFIG_PADRAO.faixas)).toBe(esperado);
  });

  it('respeita faixas editadas', () => {
    const faixas = { p1Min: 50, p2Min: 30, p3Min: 10, p4Min: 2 };
    expect(classificarPrioridade(49, faixas)).toBe('P2');
    expect(classificarPrioridade(1, faixas)).toBe('SEM');
  });
});

describe('diasDesde', () => {
  it('conta dias corridos de calendário', () => {
    expect(diasDesde('2026-11-18', HOJE)).toBe(1);
    expect(diasDesde('2025-11-19', HOJE)).toBe(365);
  });
  it('sem data → null; data futura → 0', () => {
    expect(diasDesde(null, HOJE)).toBeNull();
    expect(diasDesde('2027-01-01', HOJE)).toBe(0);
  });
});

describe('valorEmEstoque', () => {
  it('usa o valor do relatório quando existe', () => {
    expect(valorEmEstoque({ valorTotal: 100, saldo: 2, custoUnitario: 3 })).toBe(100);
  });
  it('calcula saldo × custo quando o relatório não trouxe o total', () => {
    expect(valorEmEstoque({ valorTotal: null, saldo: 4, custoUnitario: 2.5 })).toBe(10);
  });
  it('fica null (não informado) sem custo', () => {
    expect(valorEmEstoque({ valorTotal: null, saldo: 4, custoUnitario: null })).toBeNull();
  });
});

describe('faixasDeTempo', () => {
  it('monta os rótulos a partir de 90 dias, alerta e crítico', () => {
    expect(faixasDeTempo(CONFIG_PADRAO).map((f) => f.rotulo)).toEqual(['Até 90 dias', '91 a 180 dias', '181 a 365 dias', 'Mais de 365 dias']);
  });
});

describe('analisar', () => {
  const lista = [
    produto({ codigoTrier: 'A', produto: 'A', saldo: 40, custoUnitario: 2, dataUltimaEntrada: '2026-10-01' }),
    produto({ codigoTrier: 'B', produto: 'B', saldo: 5, custoUnitario: 100, dataUltimaEntrada: '2024-01-01' }),
    produto({ codigoTrier: 'C', produto: 'C', saldo: 22, custoUnitario: 8, dataUltimaEntrada: '2025-01-01' }),
    produto({ codigoTrier: 'D', produto: 'D', saldo: 3, ativo: false }),
  ];

  it('classifica, calcula dias e valor e ranqueia só os ativos com saldo', () => {
    const r = analisar(lista, CONFIG_PADRAO, HOJE);
    const por = (c: string) => r.find((p) => p.codigoTrier === c)!;

    expect(por('A')).toMatchObject({ prioridade: 'P1', valor: 80, elevado: false });
    expect(por('B')).toMatchObject({ prioridade: 'P3', valor: 500, elevado: false });
    expect(por('B').dias).toBeGreaterThan(CONFIG_PADRAO.diasCritico);
    expect(por('D').ranking).toBeNull();
    expect(r.filter((p) => p.ranking !== null).map((p) => p.ranking).sort()).toEqual([1, 2, 3]);
  });

  it('com peso só na quantidade, o ranking segue a quantidade', () => {
    const r = analisar(lista, { ...CONFIG_PADRAO, pesos: { quantidade: 1, valor: 0, tempo: 0 } }, HOJE);
    const ordem = [...r].filter((p) => p.ranking).sort((a, b) => a.ranking! - b.ranking!).map((p) => p.codigoTrier);
    expect(ordem).toEqual(['A', 'C', 'B']);
  });

  it('com peso só no valor, o ranking segue o capital investido', () => {
    const r = analisar(lista, { ...CONFIG_PADRAO, pesos: { quantidade: 0, valor: 1, tempo: 0 } }, HOJE);
    const ordem = [...r].filter((p) => p.ranking).sort((a, b) => a.ranking! - b.ranking!).map((p) => p.codigoTrier);
    expect(ordem[0]).toBe('B');
  });

  it('marca ação atrasada só se o prazo passou e ela não foi encerrada', () => {
    const r = analisar(
      [
        produto({ codigoTrier: '1', prazo: '2026-11-01', statusAcao: 'EM_ANDAMENTO' }),
        produto({ codigoTrier: '2', prazo: '2026-11-01', statusAcao: 'CONCLUIDO' }),
        produto({ codigoTrier: '3', prazo: '2026-12-01', statusAcao: 'PLANEJADO' }),
      ],
      CONFIG_PADRAO,
      HOJE,
    );
    expect(r.map((p) => p.atrasada)).toEqual([true, false, false]);
  });
});

describe('nomes dos grupos', () => {
  it('troca o código do Trier pelo nome dado pela gestão, mantendo o código original', () => {
    const [p, q] = analisar(
      [produto({ codigoTrier: '1', grupo: '30' }), produto({ codigoTrier: '2', grupo: '99' })],
      { ...CONFIG_PADRAO, nomesGrupos: { '30': 'Suplementos' } },
      HOJE,
    );
    expect(p).toMatchObject({ grupo: 'Suplementos (30)', grupoCodigo: '30' });
    // sem nome cadastrado, continua o próprio código
    expect(q).toMatchObject({ grupo: '99', grupoCodigo: '99' });
  });

  it('a sugestão de ação usa o nome (um código sozinho não diz que o grupo é de vitaminas)', () => {
    const [p] = analisar([produto({ produto: 'ITEM X', grupo: '30' })], { ...CONFIG_PADRAO, nomesGrupos: { '30': 'Vitaminas e suplementos' } }, HOJE);
    expect(categoriaDoProduto(p)).toBe('VITAMINA_SUPLEMENTO');
  });
});

describe('filtrarProdutos', () => {
  const lista = analisar(
    [
      produto({ codigoTrier: '10', produto: 'Pomada Cicatrização', laboratorio: 'EMS', saldo: 30, codigoBarras: '789' }),
      produto({ codigoTrier: '20', produto: 'Shampoo', laboratorio: null, saldo: 3, statusAcao: 'CONCLUIDO' }),
      produto({ codigoTrier: '30', produto: 'Antigo', ativo: false }),
    ],
    CONFIG_PADRAO,
    HOJE,
  );

  it('busca sem acento e sem diferenciar maiúsculas, por nome, código Trier ou código de barras', () => {
    expect(filtrarProdutos(lista, { busca: 'cicatricacao' })).toHaveLength(0);
    expect(filtrarProdutos(lista, { busca: 'cicatrizacao' })).toHaveLength(1);
    expect(filtrarProdutos(lista, { busca: '20' }).map((p) => p.codigoTrier)).toEqual(['20']);
    expect(filtrarProdutos(lista, { busca: '789' })).toHaveLength(1);
  });

  it('por padrão só mostra o que está no relatório atual', () => {
    expect(filtrarProdutos(lista, {})).toHaveLength(2);
    expect(filtrarProdutos(lista, { visao: 'fora' }).map((p) => p.codigoTrier)).toEqual(['30']);
    expect(filtrarProdutos(lista, { visao: 'todos' })).toHaveLength(3);
  });

  it('combina filtros e trata laboratório vazio como "Não informado"', () => {
    expect(filtrarProdutos(lista, { laboratorio: 'Não informado' }).map((p) => p.codigoTrier)).toEqual(['20']);
    expect(filtrarProdutos(lista, { prioridade: 'P1', laboratorio: 'EMS' })).toHaveLength(1);
    expect(filtrarProdutos(lista, { prioridade: 'P1', laboratorio: 'Não informado' })).toHaveLength(0);
    expect(filtrarProdutos(lista, { saldoMin: 5, saldoMax: 40 }).map((p) => p.codigoTrier)).toEqual(['10']);
    expect(filtrarProdutos(lista, { situacao: 'concluidas' }).map((p) => p.codigoTrier)).toEqual(['20']);
  });
});

describe('calcularTotais e agruparPor', () => {
  const lista = analisar(
    [
      produto({ codigoTrier: '1', saldo: 25, custoUnitario: 4, laboratorio: 'EMS', dataUltimaEntrada: '2025-01-01' }),
      produto({ codigoTrier: '2', saldo: 60, custoUnitario: 1, laboratorio: 'EMS', dataUltimaEntrada: '2026-10-01' }),
      produto({ codigoTrier: '3', saldo: 2, custoUnitario: null, laboratorio: null }),
    ],
    CONFIG_PADRAO,
    HOJE,
  );

  it('soma unidades e capital, e conta o que ficou sem custo', () => {
    const t = calcularTotais(lista, CONFIG_PADRAO);
    expect(t).toMatchObject({ produtos: 3, unidades: 87, valor: 160, semValor: 1, imediatos: 2, elevados: 1, acimaAlerta: 1, acimaCritico: 1 });
    expect(t.valorImediatos).toBe(160);
  });

  it('agrupa por laboratório, ordenado por capital, com "Não informado" para quem não tem', () => {
    const grupos = agruparPor(lista, (p) => p.laboratorio);
    expect(grupos.map((g) => [g.chave, g.produtos, g.valor])).toEqual([
      ['EMS', 2, 160],
      ['Não informado', 1, 0],
    ]);
  });
});

describe('ordenação', () => {
  it('ordenarPor deixa o vazio sempre no fim, nas duas direções', () => {
    const dados = [{ v: 3 }, { v: null }, { v: 1 }];
    expect(ordenarPor(dados, 'v', 'asc').map((d) => d.v)).toEqual([1, 3, null]);
    expect(ordenarPor(dados, 'v', 'desc').map((d) => d.v)).toEqual([3, 1, null]);
  });

  it('ordenarRanking muda a ordem conforme o critério', () => {
    const lista = analisar(
      [
        produto({ codigoTrier: 'a', produto: 'a', saldo: 90, custoUnitario: 1, dataUltimaEntrada: '2026-11-01' }),
        produto({ codigoTrier: 'b', produto: 'b', saldo: 10, custoUnitario: 50, dataUltimaEntrada: '2025-01-01' }),
      ],
      CONFIG_PADRAO,
      HOJE,
    );
    expect(ordenarRanking(lista, 'saldo')[0].codigoTrier).toBe('a');
    expect(ordenarRanking(lista, 'valor')[0].codigoTrier).toBe('b');
    expect(ordenarRanking(lista, 'dias')[0].codigoTrier).toBe('b');
  });
});

describe('simular', () => {
  it('calcula margens, lucro, receita e desconto', () => {
    const r = simular({ custo: 6, precoAtual: 10, novoPreco: 8, quantidade: 10 }, 20);
    expect(r.margemAtual).toBeCloseTo(40);
    expect(r.margemNova).toBeCloseTo(25);
    expect(r.lucroUnitarioNovo).toBe(2);
    expect(r.receita).toBe(80);
    expect(r.resultadoBruto).toBe(20);
    expect(r.descontoPct).toBeCloseTo(20);
    expect(r.abaixoDoCusto).toBe(false);
    expect(r.abaixoDaMargemMinima).toBe(false);
  });

  it('alerta quando o novo preço fica abaixo do custo ou da margem mínima', () => {
    expect(simular({ custo: 6, precoAtual: 10, novoPreco: 5, quantidade: 1 }, 20)).toMatchObject({ abaixoDoCusto: true, abaixoDaMargemMinima: true });
    expect(simular({ custo: 6, precoAtual: 10, novoPreco: 7, quantidade: 1 }, 20)).toMatchObject({ abaixoDoCusto: false, abaixoDaMargemMinima: true });
  });

  it('não inventa número quando falta dado', () => {
    const r = simular({ custo: null, precoAtual: null, novoPreco: 8, quantidade: null }, 20);
    expect(r.margemNova).toBeNull();
    expect(r.receita).toBeNull();
    expect(r.resultadoBruto).toBeNull();
    expect(r.abaixoDoCusto).toBe(false);
  });
});
