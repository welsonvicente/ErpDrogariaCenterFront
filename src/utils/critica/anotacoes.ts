/**
 * Motivo + observação que a pessoa anota por linha da conferência (ex.: "item
 * incluído em urgência, veio junto com este pedido"). Não muda o veredito: é
 * registro para quem for ler a crítica depois. A chave é a `chave` estável da
 * linha da auditoria ("c3" = parte do pedido, "t7" = só no Trier).
 */
export interface Anotacao {
  /** Id de um dos `MOTIVOS` (ou null quando só há observação livre). */
  motivo: string | null;
  texto: string;
}
export type Anotacoes = Record<string, Anotacao>;

export const MOTIVOS: Array<{ id: string; rotulo: string }> = [
  { id: 'URGENCIA', rotulo: 'Incluído em urgência (falta) — veio junto com este pedido' },
  { id: 'OUTRO_PEDIDO', rotulo: 'Veio de outro pedido / outra entrega' },
  { id: 'BONIFICACAO', rotulo: 'Bonificação' },
  { id: 'PRECO_NEGOCIADO', rotulo: 'Preço negociado com o representante' },
  { id: 'QTD_AJUSTADA', rotulo: 'Quantidade ajustada pelo comprador' },
  { id: 'CORTE', rotulo: 'Faltou na distribuidora (corte)' },
  { id: 'ENTREGA_PARCIAL', rotulo: 'Entrega parcial — chega depois' },
  { id: 'SUBSTITUIDO', rotulo: 'Produto equivalente / substituído' },
  { id: 'ERRO_LANCAMENTO', rotulo: 'Erro de lançamento no Trier — corrigir' },
  { id: 'OUTRO', rotulo: 'Outro (descrever na observação)' },
];

const ROTULO_DO_MOTIVO = new Map(MOTIVOS.map((m) => [m.id, m.rotulo]));

export function rotuloDoMotivo(id: string | null): string {
  return (id && ROTULO_DO_MOTIVO.get(id)) || '';
}

/** "Motivo — observação" em uma linha (para a impressão e para os arquivos baixados). */
export function textoDaAnotacao(a: Anotacao | undefined): string {
  if (!a) return '';
  return [rotuloDoMotivo(a.motivo), a.texto.trim()].filter(Boolean).join(' — ');
}

/** Anotação sem motivo e sem texto não precisa ser guardada. */
export const anotacaoVazia = (a: Anotacao) => !a.motivo && !a.texto.trim();
