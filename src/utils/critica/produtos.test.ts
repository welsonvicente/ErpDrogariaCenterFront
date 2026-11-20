import { describe, expect, it } from 'vitest';
import { compararProdutos, descrever, normalizarNome } from './produtos';

describe('descrever', () => {
  it('normaliza acento, caixa e vírgula decimal', () => {
    expect(normalizarNome('Ácido  Valpróico 6,25mg')).toBe('ACIDO VALPROICO 6.25MG');
  });

  it('separa as palavras do nome das medidas e da apresentação', () => {
    const d = descrever('CETOCONAZOL 20MG/ML SH 100ML');
    expect(d.palavras).toEqual(['CETOCONAZOL', 'SH']);
    expect(d.atributos).toEqual(['20MG/ML', '100ML']);
  });

  it('reconhece comprimido, cápsula, envelope, percentual e peróxido', () => {
    expect(descrever('X 30CP').atributos).toEqual(['30CP']);
    expect(descrever('X 30CPR').atributos).toEqual(['30CP']); // CPR = CP
    expect(descrever('X 30CAP').atributos).toEqual(['30CAP']); // cápsula não é comprimido
    expect(descrever('REPOFLOR 200MG PED 4ENV 1G').atributos).toEqual(['200MG', '4ENV', '1G']);
    expect(descrever('MULTISORO 0,9% INFAN GTS 30ML').atributos).toEqual(['0.9%', '30ML']);
    expect(descrever('AGUA OXIG 10V FARMAX 100ML').atributos).toEqual(['10V', '100ML']);
    expect(descrever('PREDNISONA 0,40MG').atributos).toEqual(['0.4MG']);
  });

  it('não confunde letra+número do nome com medida (G500)', () => {
    expect(descrever('GUACO G500 BALSAM XPE 150ML').atributos).toEqual(['150ML']);
  });
});

describe('compararProdutos', () => {
  const comparar = (a: string, b: string) => compararProdutos(descrever(a), descrever(b));

  it('nome idêntico (ignorando caixa e acento) é confirmado', () => {
    expect(comparar('BESILAPIN 10MG 30CP', 'besilapin 10mg 30cp')).toMatchObject({ criterio: 'NOME_IGUAL', conflitos: [] });
  });

  it('o mesmo nome cortado pelo limite do Trier é confirmado', () => {
    const r = comparar('MULTISORO 0,9% INFAN GTS 30ML FRASCO PEDIATRICO', 'MULTISORO 0,9% INFAN GTS 30ML');
    expect(r?.criterio).toBe('NOME_CORTADO');
  });

  it('nome curto que é prefixo de outro NÃO é confirmado (10CP não é 100CP)', () => {
    expect(comparar('ACIDO X 500MG 10CP', 'ACIDO X 500MG 100CP')?.criterio).not.toBe('NOME_CORTADO');
    expect(comparar('ACIDO X 500MG 10CP', 'ACIDO X 500MG 100CP')?.criterio).toBe('CANDIDATO');
  });

  it('mesmo nome-base com apresentação diferente é só candidato, e diz o que mudou', () => {
    const r = comparar('REPOFLOR 200MG PED 4ENV 1G', 'REPOFLOR 200MG 4ENV 800MG');
    expect(r?.criterio).toBe('CANDIDATO');
    expect(r?.conflitos).toEqual(['1G × 800MG']);
  });

  it('concentrações diferentes do mesmo remédio são candidatos com conflito, nunca iguais', () => {
    const r = comparar('BESILAPIN 10MG 30CP', 'BESILAPIN 5MG 30CP');
    expect(r?.criterio).toBe('CANDIDATO');
    expect(r?.conflitos).toEqual(['10MG × 5MG']);
  });

  it('comprimido × cápsula é conflito de apresentação', () => {
    expect(comparar('VALPROATO 250MG 30CP', 'VALPROATO 250MG 30CAP')?.conflitos).toEqual(['30CP × 30CAP']);
  });

  it('nomes sem relação não viram candidato', () => {
    expect(comparar('DIVALPROATO SOD 250MG 30CP REV', 'ACIDO VALPROICO 250MG 25CAP')).toBeNull();
    expect(comparar('NEBIVOLOL 5MG 30CP', 'TRAZODONA 50MG 60CP')).toBeNull();
  });
});
