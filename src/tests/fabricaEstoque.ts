import type { ProdutoEstoque } from '../types/estoque';

/** Produto de teste com tudo "não informado" — cada teste sobrescreve só o que importa. */
export function produto(extra: Partial<ProdutoEstoque> = {}): ProdutoEstoque {
  return {
    id: extra.codigoTrier ?? 'id',
    codigoTrier: '1',
    codigoBarras: null,
    produto: 'PRODUTO',
    laboratorio: null,
    grupo: null,
    fornecedor: null,
    estoqueMinimo: null,
    demanda: null,
    saldo: 10,
    custoUnitario: null,
    valorTotal: null,
    dataUltimaEntrada: null,
    qtdUltimaCompra: null,
    precoUltimaCompra: null,
    ativo: true,
    precoVenda: null,
    acaoRecomendada: null,
    objetivo: null,
    comoExecutar: null,
    statusAcao: 'NAO_INICIADO',
    responsavel: null,
    dataInicio: null,
    prazo: null,
    observacoes: null,
    resultado: null,
    quantidadeAtualizada: null,
    negociarFornecedor: false,
    acaoAtualizadaEm: null,
    atualizadoEm: '2026-11-01T10:00:00.000Z',
    ...extra,
  };
}
