export type StatusAcao = 'NAO_INICIADO' | 'PLANEJADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | 'NAO_APLICAVEL';

export const STATUS_ACAO_ORDEM: StatusAcao[] = ['NAO_INICIADO', 'PLANEJADO', 'EM_ANDAMENTO', 'CONCLUIDO', 'NAO_APLICAVEL'];

export const STATUS_ACAO_LABEL: Record<StatusAcao, string> = {
  NAO_INICIADO: 'Não iniciado',
  PLANEJADO: 'Planejado',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDO: 'Concluído',
  NAO_APLICAVEL: 'Não aplicável',
};

/** Produto do relatório do Trier + o que a gestão acrescentou (espelha o model do backend). `null` = não informado. */
export interface ProdutoEstoque {
  id: string;
  codigoTrier: string;
  codigoBarras: string | null;
  produto: string;
  laboratorio: string | null;
  grupo: string | null;
  fornecedor: string | null;
  estoqueMinimo: number | null;
  demanda: number | null;
  saldo: number | null;
  custoUnitario: number | null;
  valorTotal: number | null;
  /** AAAA-MM-DD */
  dataUltimaEntrada: string | null;
  qtdUltimaCompra: number | null;
  precoUltimaCompra: number | null;
  /** false = não veio na importação mais recente. */
  ativo: boolean;
  precoVenda: number | null;
  acaoRecomendada: string | null;
  objetivo: string | null;
  comoExecutar: string | null;
  statusAcao: StatusAcao;
  responsavel: string | null;
  dataInicio: string | null;
  prazo: string | null;
  observacoes: string | null;
  resultado: string | null;
  quantidadeAtualizada: number | null;
  negociarFornecedor: boolean;
  acaoAtualizadaEm: string | null;
  atualizadoEm: string;
}

export interface ConfigEstoque {
  faixas: { p1Min: number; p2Min: number; p3Min: number; p4Min: number };
  diasAlerta: number;
  diasCritico: number;
  estoqueElevadoMin: number;
  margemMinimaPct: number;
  pesos: { quantidade: number; valor: number; tempo: number };
  /** O Trier exporta o grupo só como código; aqui a gestão dá nome a cada código. */
  nomesGrupos: Record<string, string>;
}

export type ModoImportacao = 'ATUALIZAR' | 'SUBSTITUIR' | 'RESTAURACAO';

export interface ResumoImportacao {
  novos: number;
  atualizados: number;
  saiuDoRelatorio: number;
  ignoradas: number;
  removidos: number;
}

export interface ImportacaoEstoque {
  id: string;
  nomeArquivo: string;
  modo: ModoImportacao;
  totalLinhas: number;
  totalProdutos: number;
  resumo: ResumoImportacao;
  restauradaDeId: string | null;
  usuarioNome: string | null;
  /** Tamanho em bytes do .xlsx original guardado no servidor; null = importação sem arquivo guardado. */
  arquivoTamanho: number | null;
  criadoEm: string;
}

export type TipoHistorico = 'IMPORTACAO' | 'RESTAURACAO' | 'EDICAO' | 'ACAO' | 'CONFIG';

export interface HistoricoEstoque {
  id: string;
  tipo: TipoHistorico;
  codigoTrier: string | null;
  produtoNome: string | null;
  campo: string | null;
  valorAnterior: string | null;
  valorNovo: string | null;
  descricao: string | null;
  usuarioNome: string | null;
  criadoEm: string;
}

/** Uma linha normalizada do relatório, no formato que a API de importação recebe. */
export interface LinhaImportacao {
  codigoTrier: string;
  codigoBarras: string | null;
  produto: string;
  laboratorio: string | null;
  grupo: string | null;
  fornecedor: string | null;
  estoqueMinimo: number | null;
  demanda: number | null;
  saldo: number | null;
  custoUnitario: number | null;
  valorTotal: number | null;
  dataUltimaEntrada: string | null;
  qtdUltimaCompra: number | null;
  precoUltimaCompra: number | null;
}

export interface PainelEstoque {
  produtos: ProdutoEstoque[];
  config: ConfigEstoque;
  importacoes: ImportacaoEstoque[];
}

/** Campos que a gestão edita à mão (o que o PATCH aceita). */
export type EdicaoProduto = Partial<
  Pick<
    ProdutoEstoque,
    | 'precoVenda'
    | 'acaoRecomendada'
    | 'objetivo'
    | 'comoExecutar'
    | 'statusAcao'
    | 'responsavel'
    | 'dataInicio'
    | 'prazo'
    | 'observacoes'
    | 'resultado'
    | 'quantidadeAtualizada'
    | 'negociarFornecedor'
  >
>;
