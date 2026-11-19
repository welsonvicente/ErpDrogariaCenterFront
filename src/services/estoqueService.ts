import type {
  ConfigEstoque,
  EdicaoProduto,
  HistoricoEstoque,
  ImportacaoEstoque,
  LinhaImportacao,
  PainelEstoque,
  ProdutoEstoque,
} from '../types/estoque';
import { api } from './api';

export interface PayloadImportacao {
  nomeArquivo: string;
  modo: 'ATUALIZAR' | 'SUBSTITUIR';
  /** Linhas de dados lidas no arquivo, contando as descartadas na leitura — só pra o histórico. */
  totalLinhasLidas: number;
  linhas: LinhaImportacao[];
  /** O .xlsx original em base64 — o servidor guarda pra poder baixar de novo de qualquer aparelho. */
  arquivo?: { mime: string; conteudoBase64: string };
}

export type AbaHistorico = 'importacoes' | 'alteracoes' | 'acoes';

export const estoqueService = {
  async carregar() {
    const { data } = await api.get<PainelEstoque>('/estoque');
    return data;
  },

  async importar(payload: PayloadImportacao) {
    const { data } = await api.post<ImportacaoEstoque>('/estoque/importacoes', payload);
    return data;
  },

  async restaurar(importacaoId: string) {
    const { data } = await api.post<ImportacaoEstoque>(`/estoque/importacoes/${importacaoId}/restaurar`);
    return data;
  },

  /** Baixa o .xlsx original de uma importação, com o nome que ele tinha quando foi enviado. */
  async baixarArquivoOriginal(importacaoId: string, nomeArquivo: string) {
    const { data } = await api.get<Blob>(`/estoque/importacoes/${importacaoId}/arquivo`, { responseType: 'blob' });
    const url = window.URL.createObjectURL(data);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },

  async atualizarProduto(id: string, campos: EdicaoProduto) {
    const { data } = await api.patch<ProdutoEstoque>(`/estoque/produtos/${id}`, campos);
    return data;
  },

  async atualizarLote(ids: string[], campos: Pick<EdicaoProduto, 'statusAcao' | 'responsavel' | 'dataInicio' | 'prazo' | 'negociarFornecedor'>) {
    const { data } = await api.patch<ProdutoEstoque[]>('/estoque/produtos/lote', { ids, campos });
    return data;
  },

  async historico(filtro: { aba?: AbaHistorico; codigoTrier?: string; limite?: number } = {}) {
    const { data } = await api.get<HistoricoEstoque[]>('/estoque/historico', { params: filtro });
    return data;
  },

  async salvarConfig(config: ConfigEstoque) {
    const { data } = await api.put<ConfigEstoque>('/estoque/config', config);
    return data;
  },
};

/** Mensagem do servidor (ou a padrão) pra mostrar numa falha de requisição. */
export function mensagemDeErro(erro: unknown, padrao = 'Não foi possível concluir a operação. Tente novamente.'): string {
  const resposta = (erro as { response?: { data?: { message?: string; issues?: Array<{ message: string }> } } })?.response?.data;
  const detalhe = resposta?.issues?.[0]?.message;
  return detalhe ?? resposta?.message ?? padrao;
}
