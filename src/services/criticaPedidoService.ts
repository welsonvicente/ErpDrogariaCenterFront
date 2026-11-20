import type { Anotacoes } from '../utils/critica/anotacoes';
import type { Decisao, Tolerancias, Veredito } from '../utils/critica/auditoria';
import type { PedidoCota, RelatorioTrier } from '../utils/critica/tipos';
import { baixarBlob } from '../utils/critica/baixar';
import { api } from './api';

export interface ResumoCritica {
  veredito: Veredito;
  totalPedido: number | null;
  totalTrier: number | null;
  diferenca: number | null;
  contagens: Record<string, number>;
}

export interface CriticaSalva extends ResumoCritica {
  id: string;
  titulo: string;
  distribuidora: string | null;
  numeroPedido: string | null;
  periodoTrier: string | null;
  pdfCotaNome: string | null;
  pdfTrierNome: string | null;
  temPdfCota: boolean;
  temPdfTrier: boolean;
  usuarioNome: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface CriticaSalvaCompleta extends CriticaSalva {
  pedido: PedidoCota;
  relatorio: RelatorioTrier;
  /** Chave = id do primeiro item do pedido no grupo (texto, porque veio de JSON). */
  decisoes: Record<string, Decisao>;
  anotacoes: Anotacoes;
  tolerancias: Tolerancias;
}

export interface PdfParaGuardar {
  nome: string;
  conteudoBase64: string;
}

export interface PayloadCriarCritica {
  titulo: string;
  pedido: PedidoCota;
  relatorio: RelatorioTrier;
  decisoes: Record<number, Decisao>;
  anotacoes: Anotacoes;
  tolerancias: Tolerancias;
  resumo: ResumoCritica;
  pdfCota?: PdfParaGuardar;
  pdfTrier?: PdfParaGuardar;
}

export const criticaPedidoService = {
  async listar() {
    const { data } = await api.get<CriticaSalva[]>('/criticas-pedido');
    return data;
  },

  async obter(id: string) {
    const { data } = await api.get<CriticaSalvaCompleta>(`/criticas-pedido/${id}`);
    return data;
  },

  async criar(payload: PayloadCriarCritica) {
    const { data } = await api.post<CriticaSalvaCompleta>('/criticas-pedido', payload);
    return data;
  },

  /**
   * Decidir de novo muda decisões, tolerâncias, resumo e nome. Os documentos só vão se foram trocados:
   * `pedido`/`relatorio` substituem os dados lidos e o PDF guardado acompanha (sem PDF novo, o antigo é apagado).
   */
  async atualizar(id: string, payload: Pick<PayloadCriarCritica, 'titulo' | 'decisoes' | 'anotacoes' | 'tolerancias' | 'resumo'> & Partial<Pick<PayloadCriarCritica, 'pedido' | 'relatorio' | 'pdfCota' | 'pdfTrier'>>) {
    const { data } = await api.put<CriticaSalvaCompleta>(`/criticas-pedido/${id}`, payload);
    return data;
  },

  async remover(id: string) {
    await api.delete(`/criticas-pedido/${id}`);
  },

  async buscarPdf(id: string, qual: 'cota' | 'trier') {
    const { data } = await api.get<Blob>(`/criticas-pedido/${id}/pdf/${qual}`, { responseType: 'blob' });
    return data;
  },

  async baixarPdf(id: string, qual: 'cota' | 'trier', nome: string) {
    baixarBlob(await this.buscarPdf(id, qual), nome);
  },
};

/** Mensagem do servidor (ou a padrão) pra mostrar numa falha de requisição. */
export function mensagemDeErroCritica(erro: unknown): string {
  const resposta = (erro as { response?: { data?: { message?: string; issues?: Array<{ message: string }> } } })?.response?.data;
  return resposta?.issues?.[0]?.message ?? resposta?.message ?? 'Não foi possível concluir a operação. Tente de novo.';
}
