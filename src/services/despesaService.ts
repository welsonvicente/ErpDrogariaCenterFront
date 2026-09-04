import { api } from './api';
import type { Despesa, FormaPagamento, ListaDespesasResultado, ResumoDespesas } from '../types';

export interface FiltrosDespesa {
  dataInicio?: string;
  dataFim?: string;
  usuarioId?: string;
  categoriaId?: string;
  page?: number;
  pageSize?: number;
}

interface CriarDespesaPayload {
  data: string;
  valor: number;
  formaPagamento: FormaPagamento;
  descricao?: string;
  categoriaId: string;
}

/** Baixa um blob retornado pela API como arquivo, disparando o download do navegador. */
function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export const despesaService = {
  async list(filtros: FiltrosDespesa = {}) {
    const { data } = await api.get<ListaDespesasResultado>('/despesas', { params: filtros });
    return data;
  },

  /** "Meus lançamentos": despesas do próprio funcionário logado. */
  async listMinhas(filtros: FiltrosDespesa = {}) {
    const { data } = await api.get<ListaDespesasResultado>('/despesas/minhas', { params: filtros });
    return data;
  },

  async summary(filtros: Omit<FiltrosDespesa, 'page' | 'pageSize'> = {}) {
    const { data } = await api.get<ResumoDespesas>('/despesas/resumo', { params: filtros });
    return data;
  },

  /** usuarioId não é enviado: a API sempre usa quem está autenticado no token. */
  async create(payload: CriarDespesaPayload) {
    const { data } = await api.post<Despesa>('/despesas', payload);
    return data;
  },

  async update(id: string, payload: Partial<CriarDespesaPayload>) {
    const { data } = await api.put<Despesa>(`/despesas/${id}`, payload);
    return data;
  },

  async remove(id: string) {
    await api.delete(`/despesas/${id}`);
  },

  async exportarExcel(filtros: Omit<FiltrosDespesa, 'page' | 'pageSize'> = {}) {
    const { data } = await api.get('/despesas/exportar/excel', { params: filtros, responseType: 'blob' });
    baixarBlob(data as Blob, 'despesas.xlsx');
  },

  async exportarPdf(filtros: Omit<FiltrosDespesa, 'page' | 'pageSize'> = {}) {
    const { data } = await api.get('/despesas/exportar/pdf', { params: filtros, responseType: 'blob' });
    baixarBlob(data as Blob, 'despesas.pdf');
  },
};
