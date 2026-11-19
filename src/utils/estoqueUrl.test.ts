import { describe, expect, it } from 'vitest';
import { produto } from '../tests/fabricaEstoque';
import { CONFIG_PADRAO, analisar } from './estoqueAnalise';
import { produtosParaCsv } from './estoqueExport';
import { consultaDeFiltros, filtrosDaUrl, filtrosParaUrl } from './estoqueUrl';

describe('filtros na URL', () => {
  it('ida e volta preserva os filtros', () => {
    const filtros = { busca: 'creme', laboratorio: 'EMS', prioridade: 'P1' as const, saldoMin: 5, saldoMax: 50, faixaTempo: 'T3', visao: 'fora' as const, somenteNegociar: true };
    const lido = filtrosDaUrl(filtrosParaUrl(filtros));
    expect(lido).toMatchObject(filtros);
  });

  it('sem filtro gera URL vazia; "ativos" é o padrão e não vai pra URL', () => {
    expect(consultaDeFiltros({})).toBe('');
    expect(consultaDeFiltros({ visao: 'ativos' })).toBe('');
    expect(consultaDeFiltros({ prioridade: 'P2', laboratorio: 'Não informado' })).toBe('?lab=N%C3%A3o+informado&prio=P2');
  });

  it('número inválido na URL é ignorado', () => {
    expect(filtrosDaUrl(new URLSearchParams('min=abc&max=')).saldoMin).toBeNull();
    expect(filtrosDaUrl(new URLSearchParams('max=')).saldoMax).toBeNull();
  });
});

describe('produtosParaCsv', () => {
  const [p] = analisar(
    [produto({ codigoTrier: '1', produto: 'Creme; "especial"', saldo: 25.5, custoUnitario: 2, dataUltimaEntrada: '2025-03-05', laboratorio: null })],
    CONFIG_PADRAO,
    new Date(2026, 10, 19),
  );

  it('usa ; como separador, vírgula decimal, BOM e escapa aspas e ponto-e-vírgula', () => {
    const csv = produtosParaCsv([p]);
    expect(csv.startsWith('﻿Ranking;Prioridade;')).toBe(true);
    const linha = csv.split('\r\n')[1];
    expect(linha).toContain('"Creme; ""especial"""');
    expect(linha).toContain(';25,5;2;51;05/03/2025;');
  });

  it('campo ausente sai vazio (não "Não informado" nem zero)', () => {
    const [simples] = analisar([produto({ codigoTrier: '2', produto: 'SIMPLES', laboratorio: null, fornecedor: null })], CONFIG_PADRAO, new Date(2026, 10, 19));
    const colunas = produtosParaCsv([simples]).split('\r\n')[1].split(';');
    expect(colunas[5]).toBe(''); // laboratório
    expect(colunas[7]).toBe(''); // fornecedor
  });

  it('texto que começa como fórmula é neutralizado', () => {
    const [x] = analisar([produto({ produto: '=CMD()' })], CONFIG_PADRAO, new Date());
    expect(produtosParaCsv([x])).toContain("'=CMD()");
  });
});
