import { api } from './api';

export type TipoProjetoCartaz = 'story' | 'panfleto' | 'planilha';

export interface ProjetoCartazResumo {
  id: string;
  tipo: TipoProjetoCartaz;
  nome: string;
  criadoPorId: string | null;
  criadoPor: { id: string; nome: string } | null;
  criadoEm: string;
  atualizadoEm: string;
}

export interface ArquivoCartazComUrl {
  id: string;
  mimeType: string;
  tamanhoBytes: number;
  url: string;
}

/** Resposta de criar/atualizar — sem `arquivos` (só `GET /projetos/:id` monta URLs de leitura, ver `obter`). */
export interface ProjetoCartazSalvo extends ProjetoCartazResumo {
  estadoEditor: Record<string, unknown>;
}

export interface ProjetoCartazCompleto extends ProjetoCartazSalvo {
  arquivos: ArquivoCartazComUrl[];
}

/**
 * Projetos de Cartazes (Story/Panfleto/Importar planilha) — substituem o
 * antigo "rascunho implícito" que só existia em `localStorage`. Guardados
 * por organização no backend (ver `cartaz.routes.ts`), acessíveis de
 * qualquer aparelho logado nela.
 */
export const projetoCartazService = {
  async criar(tipo: TipoProjetoCartaz, nome: string): Promise<ProjetoCartazSalvo> {
    const { data } = await api.post<ProjetoCartazSalvo>('/cartazes/projetos', { tipo, nome });
    return data;
  },

  async listar(tipo: TipoProjetoCartaz): Promise<ProjetoCartazResumo[]> {
    const { data } = await api.get<ProjetoCartazResumo[]>('/cartazes/projetos', { params: { tipo } });
    return data;
  },

  async obter(id: string): Promise<ProjetoCartazCompleto> {
    const { data } = await api.get<ProjetoCartazCompleto>(`/cartazes/projetos/${id}`);
    return data;
  },

  async atualizar(id: string, dados: { nome?: string; estadoEditor?: Record<string, unknown> }): Promise<ProjetoCartazSalvo> {
    const { data } = await api.patch<ProjetoCartazSalvo>(`/cartazes/projetos/${id}`, dados);
    return data;
  },

  /**
   * Autosave do `estadoEditor` — tenta de novo uma vez (após 1,5s) quando a
   * falha é de rede ou do servidor (5xx), que costumam ser passageiras.
   * Erros 4xx (projeto apagado, sessão vencida, dado recusado) não adianta
   * repetir: sobem direto pra `mensagemFalhaAoSalvar` explicar o motivo.
   */
  async salvarEstadoEditor(id: string, estadoEditor: Record<string, unknown>): Promise<ProjetoCartazSalvo> {
    try {
      return await projetoCartazService.atualizar(id, { estadoEditor });
    } catch (erro) {
      const status = (erro as { response?: { status?: number } })?.response?.status;
      if (status !== undefined && status < 500) throw erro;
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return projetoCartazService.atualizar(id, { estadoEditor });
    }
  },

  async remover(id: string): Promise<void> {
    await api.delete(`/cartazes/projetos/${id}`);
  },
};

/**
 * Mensagem do toast quando o autosave falha — diz o motivo real em vez de
 * sempre culpar a conexão (antes um 404/401/422 aparecia como "verifique sua
 * conexão", o que escondia a causa).
 */
export function mensagemFalhaAoSalvar(erro: unknown): string {
  const resposta = (erro as { response?: { status?: number; data?: { message?: string } } })?.response;
  if (!resposta) return 'Não foi possível salvar as últimas alterações — sem resposta do servidor. Verifique sua conexão.';
  if (resposta.status === 401) return 'Sua sessão expirou — entre de novo pra continuar salvando.';
  if (resposta.status === 404) return 'Este projeto não existe mais (foi apagado?) — abra ou crie outro em "Projetos".';
  const detalhe = resposta.data?.message ? `: ${resposta.data.message}` : '';
  return `Não foi possível salvar as últimas alterações (erro ${resposta.status}${detalhe}).`;
}
