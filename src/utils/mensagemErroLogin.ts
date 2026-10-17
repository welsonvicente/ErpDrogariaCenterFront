/**
 * Mensagem para uma falha de login. Antes toda falha virava "credencial
 * inválida" — inclusive o bloqueio por excesso de tentativas (429) e o
 * servidor fora do ar, o que fez a loja inteira achar que tinha errado o PIN
 * quando na verdade estava bloqueada (17/10/2026).
 */
export function mensagemErroLogin(erro: unknown, credencialInvalida: string) {
  const resposta = (erro as { response?: { status?: number; data?: { message?: string } } }).response;
  if (!resposta) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  if (resposta.status === 429) {
    return resposta.data?.message || 'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.';
  }
  if (resposta.status === 401 || resposta.status === 400 || resposta.status === 404) return credencialInvalida;
  return 'O servidor não conseguiu fazer o login agora. Tente de novo em instantes.';
}
