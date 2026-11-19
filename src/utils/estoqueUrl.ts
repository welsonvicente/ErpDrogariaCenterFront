import type { StatusAcao } from '../types/estoque';
import type { CodigoPrioridade, FiltrosProduto, SituacaoAcao } from './estoqueAnalise';

/**
 * Filtros da lista de produtos viram parâmetros da URL: clicar numa barra do
 * dashboard leva à lista já filtrada, e o link da tela filtrada pode ser
 * enviado a outra pessoa. Chaves curtas de propósito.
 */
const CHAVES = {
  busca: 'q',
  laboratorio: 'lab',
  fornecedor: 'forn',
  grupo: 'grupo',
  prioridade: 'prio',
  saldoMin: 'min',
  saldoMax: 'max',
  faixaTempo: 'periodo',
  diasMin: 'dias',
  status: 'status',
  situacao: 'situacao',
  visao: 'visao',
  somenteNegociar: 'negociar',
} as const;

export function filtrosDaUrl(params: URLSearchParams): FiltrosProduto {
  const texto = (k: string) => params.get(k) ?? undefined;
  const numero = (k: string) => {
    const v = params.get(k);
    if (v === null || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const visao = texto(CHAVES.visao);
  return {
    busca: texto(CHAVES.busca),
    laboratorio: texto(CHAVES.laboratorio),
    fornecedor: texto(CHAVES.fornecedor),
    grupo: texto(CHAVES.grupo),
    prioridade: texto(CHAVES.prioridade) as CodigoPrioridade | undefined,
    saldoMin: numero(CHAVES.saldoMin),
    saldoMax: numero(CHAVES.saldoMax),
    faixaTempo: texto(CHAVES.faixaTempo),
    diasMin: numero(CHAVES.diasMin),
    status: texto(CHAVES.status) as StatusAcao | undefined,
    situacao: texto(CHAVES.situacao) as SituacaoAcao | undefined,
    visao: visao === 'fora' || visao === 'todos' ? visao : undefined,
    somenteNegociar: params.get(CHAVES.somenteNegociar) === '1' ? true : undefined,
  };
}

/** Só grava o que difere do padrão — uma URL limpa quando não há filtro. */
export function filtrosParaUrl(f: FiltrosProduto): URLSearchParams {
  const params = new URLSearchParams();
  const pôr = (chave: string, valor: string | number | null | undefined) => {
    if (valor !== undefined && valor !== null && valor !== '') params.set(chave, String(valor));
  };
  pôr(CHAVES.busca, f.busca);
  pôr(CHAVES.laboratorio, f.laboratorio);
  pôr(CHAVES.fornecedor, f.fornecedor);
  pôr(CHAVES.grupo, f.grupo);
  pôr(CHAVES.prioridade, f.prioridade);
  pôr(CHAVES.saldoMin, f.saldoMin);
  pôr(CHAVES.saldoMax, f.saldoMax);
  pôr(CHAVES.faixaTempo, f.faixaTempo);
  pôr(CHAVES.diasMin, f.diasMin);
  pôr(CHAVES.status, f.status);
  pôr(CHAVES.situacao, f.situacao);
  if (f.visao && f.visao !== 'ativos') params.set(CHAVES.visao, f.visao);
  if (f.somenteNegociar) params.set(CHAVES.somenteNegociar, '1');
  return params;
}

/** "?prio=P1&lab=EMS" pronto pra usar num link — string vazia quando não há filtro. */
export function consultaDeFiltros(f: FiltrosProduto): string {
  const texto = filtrosParaUrl(f).toString();
  return texto ? `?${texto}` : '';
}

/** Resumo em texto dos filtros ativos — vai no cabeçalho da impressão pra a folha dizer o que está listando. */
export function descreverFiltros(f: FiltrosProduto): string {
  const partes: string[] = [];
  if (f.busca) partes.push(`busca "${f.busca}"`);
  if (f.laboratorio) partes.push(`laboratório ${f.laboratorio}`);
  if (f.fornecedor) partes.push(`fornecedor ${f.fornecedor}`);
  if (f.grupo) partes.push(`grupo ${f.grupo}`);
  if (f.prioridade) partes.push(`prioridade ${f.prioridade}`);
  if (f.saldoMin !== null && f.saldoMin !== undefined) partes.push(`estoque ≥ ${f.saldoMin}`);
  if (f.saldoMax !== null && f.saldoMax !== undefined) partes.push(`estoque ≤ ${f.saldoMax}`);
  if (f.diasMin !== null && f.diasMin !== undefined) partes.push(`última entrada há mais de ${f.diasMin} dias`);
  if (f.status) partes.push(`status ${f.status}`);
  if (f.situacao) partes.push(`situação ${f.situacao}`);
  if (f.visao === 'fora') partes.push('fora do relatório atual');
  if (f.somenteNegociar) partes.push('marcados para negociar');
  return partes.length ? `Filtros: ${partes.join('; ')}` : 'Sem filtros';
}
