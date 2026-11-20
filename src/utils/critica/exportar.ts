import type { Resultado } from './auditoria';

/** Rótulos e emojis dos resultados, como aparecem na tela. (Os arquivos baixados usam o modelo de relatorio.ts, sem emoji.) */
export const ROTULO_RESULTADO: Record<Resultado, string> = {
  OK: 'OK',
  ATENCAO: 'ATENÇÃO',
  DIVERGENCIA: 'DIVERGÊNCIA',
  EXTRA: 'EXTRA NO TRIER',
  AUSENTE: 'AUSENTE NO TRIER',
  NAO_CONFIRMADO: 'NÃO CONFIRMADO',
};

export const EMOJI_RESULTADO: Record<Resultado, string> = {
  OK: '🟢',
  ATENCAO: '🟡',
  DIVERGENCIA: '🔴',
  EXTRA: '🔵',
  AUSENTE: '🟠',
  NAO_CONFIRMADO: '⚪',
};
