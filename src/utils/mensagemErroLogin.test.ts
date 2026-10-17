import { describe, expect, it } from 'vitest';
import { mensagemErroLogin } from './mensagemErroLogin';

const INVALIDO = 'Código ou PIN inválidos.';

describe('mensagemErroLogin', () => {
  it('credencial errada continua dizendo que é inválida', () => {
    expect(mensagemErroLogin({ response: { status: 401 } }, INVALIDO)).toBe(INVALIDO);
  });

  it('bloqueio por excesso de tentativas mostra a mensagem do servidor, não "PIN inválido"', () => {
    const erro = { response: { status: 429, data: { message: 'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar de novo.' } } };
    expect(mensagemErroLogin(erro, INVALIDO)).toMatch(/Muitas tentativas/);
  });

  it('servidor fora do ar não vira "PIN inválido"', () => {
    expect(mensagemErroLogin(new Error('Network Error'), INVALIDO)).toMatch(/Sem conexão/);
    expect(mensagemErroLogin({ response: { status: 502 } }, INVALIDO)).toMatch(/servidor/);
  });
});
