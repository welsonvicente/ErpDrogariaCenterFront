import { describe, expect, it } from 'vitest';
import {
  converterData,
  converterNumero,
  detectarLinhaCabecalho,
  detectarMapeamento,
  extrairLinhas,
  gerarLinhasDemonstracao,
  type Celula,
} from './estoqueImportacao';

const CABECALHO_TRIER: Celula[] = [
  'Código',
  'Produto',
  'Laboratório',
  'Grupo de Produtos',
  'Estoque Mínimo',
  'Quantidade de Demanda',
  'Saldo em Estoque',
  'Custo Unitário',
  'Valor Total em Estoque',
  'Data da Última Compra',
  'Quantidade da Última Compra',
  'Preço da Última Compra',
  'Fornecedor',
  'Código de Barras',
];

describe('detectarMapeamento', () => {
  it('reconhece as colunas do relatório, sem confundir código de barras com código nem estoque mínimo com saldo', () => {
    const m = detectarMapeamento(CABECALHO_TRIER);
    expect(m).toEqual({
      codigoTrier: 0,
      produto: 1,
      laboratorio: 2,
      grupo: 3,
      estoqueMinimo: 4,
      demanda: 5,
      saldo: 6,
      custoUnitario: 7,
      valorTotal: 8,
      dataUltimaEntrada: 9,
      qtdUltimaCompra: 10,
      precoUltimaCompra: 11,
      fornecedor: 12,
      codigoBarras: 13,
    });
  });

  it('tolera variações de nome, acento e pontuação', () => {
    const m = detectarMapeamento(['Cód. Reduzido', 'Descrição', 'EAN', 'Qtd. Estoque', 'Custo', 'Dt. Últ. Compra']);
    expect(m).toMatchObject({ codigoTrier: 0, produto: 1, codigoBarras: 2, saldo: 3, custoUnitario: 4, dataUltimaEntrada: 5 });
  });

  it('o que não existe no arquivo fica null (não informado)', () => {
    const m = detectarMapeamento(['Código', 'Produto', 'Saldo']);
    expect(m.fornecedor).toBeNull();
    expect(m.custoUnitario).toBeNull();
  });
});

describe('detectarLinhaCabecalho', () => {
  it('pula título e filtros acima da tabela', () => {
    const linhas: Celula[][] = [
      ['DROGARIA CENTER - Relatório de Produtos Parados'],
      ['Emitido em 19/11/2026'],
      [],
      CABECALHO_TRIER,
      ['10', 'PRODUTO A', 'EMS'],
    ];
    expect(detectarLinhaCabecalho(linhas)).toBe(3);
  });

  it('devolve -1 quando não acha cabeçalho reconhecível', () => {
    expect(detectarLinhaCabecalho([['a', 'b'], [1, 2]])).toBe(-1);
  });
});

describe('conversões de célula', () => {
  it('números no formato brasileiro, com R$ e milhar', () => {
    expect(converterNumero('1.234,56')).toEqual({ valor: 1234.56, invalido: false });
    expect(converterNumero('R$ 12,50')).toEqual({ valor: 12.5, invalido: false });
    expect(converterNumero(7)).toEqual({ valor: 7, invalido: false });
    expect(converterNumero('')).toEqual({ valor: null, invalido: false });
    expect(converterNumero('abc')).toEqual({ valor: null, invalido: true });
  });

  it('datas: serial do Excel, DD/MM/AAAA, DD/MM/AA e ISO; recusa data impossível', () => {
    expect(converterData(45000)).toEqual({ valor: '2023-03-15', invalido: false });
    expect(converterData('05/03/2025')).toEqual({ valor: '2025-03-05', invalido: false });
    expect(converterData('5/3/25')).toEqual({ valor: '2025-03-05', invalido: false });
    expect(converterData('2025-03-05')).toEqual({ valor: '2025-03-05', invalido: false });
    expect(converterData('31/02/2025')).toEqual({ valor: null, invalido: true });
    expect(converterData('ontem')).toEqual({ valor: null, invalido: true });
    expect(converterData(null)).toEqual({ valor: null, invalido: false });
  });
});

describe('extrairLinhas', () => {
  const mapa = detectarMapeamento(CABECALHO_TRIER);
  const dados = (...linhas: Celula[][]) => [CABECALHO_TRIER, ...linhas];
  const linhaOk = (codigo: string, produto: string, extra: Partial<Record<number, Celula>> = {}): Celula[] => {
    const l: Celula[] = [codigo, produto, 'EMS', 'PERFUMARIA', 5, 2, 25, '4,50', null, '10/03/2025', 30, 4, 'DISTRIB', '7891234567890'];
    Object.entries(extra).forEach(([i, v]) => (l[Number(i)] = v));
    return l;
  };

  it('converte e normaliza as linhas válidas', () => {
    const r = extrairLinhas(dados(linhaOk('100', 'PRODUTO A')), 0, mapa);
    expect(r.linhas).toEqual([
      {
        codigoTrier: '100',
        codigoBarras: '7891234567890',
        produto: 'PRODUTO A',
        laboratorio: 'EMS',
        grupo: 'PERFUMARIA',
        fornecedor: 'DISTRIB',
        estoqueMinimo: 5,
        demanda: 2,
        saldo: 25,
        custoUnitario: 4.5,
        valorTotal: null,
        dataUltimaEntrada: '2025-03-10',
        qtdUltimaCompra: 30,
        precoUltimaCompra: 4,
      },
    ]);
    expect(r).toMatchObject({ totalLidas: 1, vazias: 0, ignoradas: 0 });
  });

  it('conta linhas vazias, ignora sem código/produto e linha de total, e relata cada problema', () => {
    const r = extrairLinhas(
      dados(linhaOk('1', 'A'), [], [null, null], linhaOk('', 'SEM CÓDIGO'), linhaOk('3', ''), [null, 'TOTAL GERAL', null, null, null, null, 99], linhaOk('4', 'D')),
      0,
      mapa,
    );
    expect(r.linhas.map((l) => l.codigoTrier)).toEqual(['1', '4']);
    expect(r.vazias).toBe(2);
    expect(r.ignoradas).toBe(3);
    expect(r.problemas.filter((p) => p.nivel === 'erro')).toHaveLength(2);
    expect(r.problemas.find((p) => p.nivel === 'info')?.mensagem).toMatch(/total/i);
    // número da linha é o da planilha (cabeçalho = linha 1)
    expect(r.problemas.find((p) => p.mensagem.includes('Sem Código'))?.linha).toBe(5);
  });

  it('código repetido: mantém a última ocorrência e avisa', () => {
    const r = extrairLinhas(dados(linhaOk('7', 'ANTIGO', { 6: 1 }), linhaOk('7', 'NOVO', { 6: 99 })), 0, mapa);
    expect(r.linhas).toHaveLength(1);
    expect(r.linhas[0]).toMatchObject({ produto: 'NOVO', saldo: 99 });
    expect(r.ignoradas).toBe(1);
    expect(r.problemas[0]).toMatchObject({ nivel: 'aviso', linha: 2 });
  });

  it('valor ilegível vira "não informado" com aviso, e não derruba a linha', () => {
    const r = extrairLinhas(dados(linhaOk('9', 'X', { 7: 'abc', 9: '99/99/2025', 6: -3 })), 0, mapa);
    expect(r.linhas[0]).toMatchObject({ custoUnitario: null, dataUltimaEntrada: null, saldo: -3 });
    expect(r.problemas.map((p) => p.nivel)).toEqual(['aviso', 'aviso', 'aviso']);
  });

  it('código numérico do Excel vira texto sem perder dígitos', () => {
    const r = extrairLinhas(dados(linhaOk('', 'N', { 0: 12345, 13: 7891234567890 })), 0, mapa);
    expect(r.linhas[0].codigoTrier).toBe('12345');
    expect(r.linhas[0].codigoBarras).toBe('7891234567890');
  });
});

/** Layout do relatório de produtos parados exportado pelo Trier (estrutura conferida num arquivo real). */
describe('relatório real do Trier', () => {
  const cabecalho: Celula[] = ['Código', '  Descrição Produto', 'Laboratório', 'Grupo', 'Estoq. Mín.', 'Qtd. Dem.', 'Saldo Estoq.', 'Custo Unit.', 'Total', '|--------------Dados Última Compra --------------|', null, null, null];
  const planilha: Celula[][] = [
    cabecalho,
    ['Total Geral:', null, null, null, null, null, 1523, 14180.01, 25181.85, null, null, null, null],
    [56949, '  100% WHEY DOUB BAU PO 900G', ' SUPLEY LABORATORIO', 30, 0, 0, 1, 123.66, 123.66, 46332, 1, 123.66, ' NAZARIA DIST '],
    [56242, '  DEMAQ BIORE THE CLEAN 190ML', ' KAO CONSUMER ', 2, 0, 0, 3, 94.02, 282.06, 46191, 3, 86.15, ' MEDEXPRESS '],
    [null, null, null, null, null, null, null, null, null, ' Data', 'Qtd. Últ. Ent.', 'Valor Unit.', ' Fornecedor'],
  ];

  it('reconhece o cabeçalho, inclusive Total, Qtd. Dem. e as colunas sob "Dados Última Compra"', () => {
    expect(detectarLinhaCabecalho(planilha)).toBe(0);
    expect(detectarMapeamento(cabecalho)).toEqual({
      codigoTrier: 0,
      produto: 1,
      codigoBarras: null,
      laboratorio: 2,
      grupo: 3,
      estoqueMinimo: 4,
      demanda: 5,
      saldo: 6,
      custoUnitario: 7,
      valorTotal: 8,
      dataUltimaEntrada: 9,
      qtdUltimaCompra: 10,
      precoUltimaCompra: 11,
      fornecedor: 12,
    });
  });

  it('lê os produtos, limpa os espaços, usa o Total Geral só para conferência e não acusa erro no rodapé de títulos', () => {
    const r = extrairLinhas(planilha, 0, detectarMapeamento(cabecalho));
    expect(r.linhas).toHaveLength(2);
    expect(r.linhas[0]).toEqual({
      codigoTrier: '56949',
      codigoBarras: null,
      produto: '100% WHEY DOUB BAU PO 900G',
      laboratorio: 'SUPLEY LABORATORIO',
      grupo: '30',
      fornecedor: 'NAZARIA DIST',
      estoqueMinimo: 0,
      demanda: 0,
      saldo: 1,
      custoUnitario: 123.66,
      valorTotal: 123.66,
      dataUltimaEntrada: '2026-11-06',
      qtdUltimaCompra: 1,
      precoUltimaCompra: 123.66,
    });
    expect(r.totalDoRelatorio).toEqual({ saldo: 1523, valorTotal: 25181.85 });
    expect(r.problemas.filter((p) => p.nivel === 'erro')).toHaveLength(0);
    expect(r.ignoradas).toBe(2);
  });
});

describe('gerarLinhasDemonstracao', () => {
  const linhas = gerarLinhasDemonstracao(new Date(2026, 10, 19));

  it('é determinística e identificada como demonstração', () => {
    expect(gerarLinhasDemonstracao(new Date(2026, 10, 19))).toEqual(linhas);
    expect(linhas.length).toBeGreaterThanOrEqual(60);
    expect(linhas.every((l) => l.produto.startsWith('[DEMO]'))).toBe(true);
  });

  it('tem códigos únicos e algumas linhas sem custo/fornecedor/data (pra exercitar "não informado")', () => {
    expect(new Set(linhas.map((l) => l.codigoTrier)).size).toBe(linhas.length);
    expect(linhas.some((l) => l.custoUnitario === null)).toBe(true);
    expect(linhas.some((l) => l.fornecedor === null)).toBe(true);
    expect(linhas.some((l) => l.dataUltimaEntrada === null)).toBe(true);
  });
});
