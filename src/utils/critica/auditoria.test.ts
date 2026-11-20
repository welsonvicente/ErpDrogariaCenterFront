import { describe, expect, it } from 'vitest';
import { TOLERANCIAS_PADRAO, auditar, type Decisoes, type LinhaAuditoria } from './auditoria';
import { PEDIDO_EXEMPLO, RELATORIO_EXEMPLO, cota, trier } from '../../tests/fabricaCritica';

const linha = (a: { linhas: LinhaAuditoria[] }, produto: string) => a.linhas.find((l) => l.produto.startsWith(produto))!;

const PEDIDO = PEDIDO_EXEMPLO;
const RELATORIO = RELATORIO_EXEMPLO;

describe('auditar — classificação linha a linha', () => {
  const a = auditar(PEDIDO, RELATORIO);

  it('nenhum produto fica de fora: tudo do pedido e tudo do Trier aparece', () => {
    expect(a.linhas).toHaveLength(11); // 9 do pedido (o candidato do REPOFLOR fica na linha dele) + 2 extras do Trier
    const doPedido = a.linhas.flatMap((l) => l.cota.map((c) => c.id)).sort((x, y) => x - y);
    expect(doPedido).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const doTrier = a.linhas.flatMap((l) => [...l.trier.map((t) => t.id), ...(l.candidato ? [l.candidato.id] : [])]).sort((x, y) => x - y);
    expect(doTrier).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('conta cada resultado', () => {
    expect(a.contagens).toEqual({ OK: 3, ATENCAO: 1, DIVERGENCIA: 2, AUSENTE: 2, EXTRA: 2, NAO_CONFIRMADO: 1 } satisfies typeof a.contagens);
  });

  it('OK: quantidade e preço iguais; diferença de 1 centavo é arredondamento e fica avisada', () => {
    expect(linha(a, 'ACETILCISTEINA')).toMatchObject({ resultado: 'OK', situacaoQtd: 'CORRETA', situacaoPreco: 'CORRETO' });
    const levo = linha(a, 'LEVOCETIRIZINA');
    expect(levo).toMatchObject({ resultado: 'OK', situacaoPreco: 'CORRETO', dentroDaTolerancia: true });
    expect(levo.observacoes.join(' ')).toMatch(/tolerância de arredondamento/);
  });

  it('DIVERGÊNCIA de quantidade: diferença em unidades e impacto', () => {
    const l = linha(a, 'CETOCONAZOL');
    expect(l).toMatchObject({ resultado: 'DIVERGENCIA', situacaoQtd: 'MAIOR_NO_TRIER', difQtd: 2, situacaoPreco: 'CORRETO' });
    expect(l.impactoQtd).toBeCloseTo(2 * 6.99, 2);
  });

  it('DIVERGÊNCIA de preço: diferença unitária, percentual e impacto sobre a quantidade pedida', () => {
    const l = linha(a, 'TRAZODONA');
    expect(l).toMatchObject({ resultado: 'DIVERGENCIA', situacaoQtd: 'CORRETA', situacaoPreco: 'MENOR_NO_TRIER' });
    expect(l.difUnitaria).toBeCloseTo(-0.89, 4);
    expect(l.difPct).toBeCloseTo((-0.89 / 16.88) * 100, 3);
    expect(l.impactoPreco).toBeCloseTo(-0.89 * 6, 2);
  });

  it('ATENÇÃO: pequena diferença de preço (acima do arredondamento, dentro do limite)', () => {
    expect(linha(a, 'BESILAPIN')).toMatchObject({ resultado: 'ATENCAO', situacaoPreco: 'MAIOR_NO_TRIER', situacaoQtd: 'CORRETA' });
  });

  it('NÃO CONFIRMADO: mesmo nome-base, apresentação diferente — não compara nada e mostra o candidato', () => {
    const l = linha(a, 'REPOFLOR');
    expect(l).toMatchObject({ resultado: 'NAO_CONFIRMADO', difQtd: null, difUnitaria: null });
    expect(l.candidato?.produto).toBe('REPOFLOR 200MG 4ENV 800MG');
    expect(l.conflitosApresentacao).toEqual(['1G × 800MG']);
  });

  it('AUSENTE e EXTRA são independentes e não são tratados como erro automático', () => {
    expect(linha(a, 'OMEGA 3')).toMatchObject({ resultado: 'AUSENTE', qtdCota: 3, valorCota: 149.7 });
    expect(linha(a, 'DIVALPROATO')).toMatchObject({ resultado: 'AUSENTE' });
    expect(linha(a, 'ACIDO VALPROICO')).toMatchObject({ resultado: 'EXTRA', qtdTrier: 1 });
    const extra = linha(a, 'ACIDO MEFENAMICO');
    expect(extra).toMatchObject({ resultado: 'EXTRA', qtdTrier: 10 });
    expect(extra.observacoes.join(' ')).toMatch(/outro pedido, bonificação ou lançamento adicional/);
  });

  it('mostra os problemas primeiro (divergências, ausentes, a confirmar, atenção, extras, ok)', () => {
    const ordem = a.linhas.map((l) => l.resultado);
    const primeiroOk = ordem.indexOf('OK');
    expect(ordem.slice(primeiroOk).every((r) => r === 'OK')).toBe(true);
    expect(ordem[0]).toBe('DIVERGENCIA');
  });
});

describe('auditar — conferência financeira', () => {
  const a = auditar(PEDIDO, RELATORIO);
  const f = a.financeiro;

  it('separa preço, quantidade, arredondamento, ausentes, extras e não confirmados', () => {
    expect(f.efeitoPreco).toBeCloseTo(-0.89 * 6 + 0.02 * 2 - 0.01 * 2, 2);
    expect(f.efeitoQuantidade).toBeCloseTo(2 * 6.99, 2);
    expect(f.arredondamentoUnitario).toBeCloseTo(0.02, 2); // BESILAPIN: bruto 3,58 contra 2 × 1,78
    expect(f.ausentesCota).toBeCloseTo(149.7 + 14.99, 2);
    expect(f.extrasTrier).toBeCloseTo(14.99 + 109.2, 2);
    expect(f.naoConfirmadosCota).toBeCloseTo(14.84, 2);
    expect(f.naoConfirmadosTrier).toBeCloseTo(14.84, 2);
  });

  it('as parcelas explicam a diferença total entre os documentos no centavo', () => {
    expect(f.diferencaTotal).toBeCloseTo(f.totalTrierBruto - f.totalCotaItens, 2);
    expect(Math.abs(f.naoExplicada)).toBeLessThanOrEqual(0.011);
  });

  it('mostra à parte o que o Trier descontou ou rateou (bruto − líquido)', () => {
    expect(f.descontosEArredondamentos).toBeCloseTo(-0.06, 2);
  });

  it('a identidade vale também com decisões manuais', () => {
    const decisoes: Decisoes = { 7: { tipo: 'confirmar' }, 8: { tipo: 'vincular', trierIds: [8] } };
    const b = auditar(PEDIDO, RELATORIO, TOLERANCIAS_PADRAO, decisoes);
    expect(Math.abs(b.financeiro.naoExplicada)).toBeLessThanOrEqual(0.011);
  });
});

describe('auditar — decisões da pessoa', () => {
  it('confirmar o candidato compara o item e mantém o alerta de apresentação diferente', () => {
    const b = auditar(PEDIDO, RELATORIO, TOLERANCIAS_PADRAO, { 7: { tipo: 'confirmar' } });
    const l = linha(b, 'REPOFLOR');
    expect(l.resultado).toBe('ATENCAO');
    expect(l.criterio).toBe('MANUAL');
    expect(l.situacaoQtd).toBe('CORRETA');
    expect(l.observacoes.join(' ')).toMatch(/Apresentação diferente/);
    expect(b.contagens.NAO_CONFIRMADO).toBe(0);
  });

  it('rejeitar o candidato: o pedido fica ausente e a linha do Trier vira extra', () => {
    const b = auditar(PEDIDO, RELATORIO, TOLERANCIAS_PADRAO, { 7: { tipo: 'rejeitar' } });
    expect(linha(b, 'REPOFLOR 200MG PED')).toMatchObject({ resultado: 'AUSENTE' });
    expect(linha(b, 'REPOFLOR 200MG 4ENV')).toMatchObject({ resultado: 'EXTRA' });
    expect(b.contagens.NAO_CONFIRMADO).toBe(0);
  });

  it('vincular à mão um ausente a um extra', () => {
    const b = auditar(PEDIDO, RELATORIO, TOLERANCIAS_PADRAO, { 8: { tipo: 'vincular', trierIds: [8] } });
    const l = linha(b, 'DIVALPROATO');
    expect(l.resultado).toBe('ATENCAO');
    expect(l.trier[0].produto).toBe('ACIDO VALPROICO 250MG 25CAP');
    expect(l.conflitosApresentacao).toEqual(['nomes diferentes', '30CP × 25CAP']);
    expect(b.linhas.some((x) => x.produto.startsWith('ACIDO VALPROICO'))).toBe(false); // deixou de ser extra
  });

  it('as linhas do Trier ainda sem par ficam disponíveis pra vincular', () => {
    const a = auditar(PEDIDO, RELATORIO);
    expect(a.trierDisponiveis.map((t) => t.produto).sort()).toEqual(['ACIDO MEFENAMICO 500MG 24CP', 'ACIDO VALPROICO 250MG 25CAP', 'REPOFLOR 200MG 4ENV 800MG']);
  });
});

describe('auditar — repetidos e cortes de nome', () => {
  it('produto pedido em duas linhas é somado; produto lançado duas vezes no Trier também', () => {
    const b = auditar(cota([['PRODUTO A 10MG 30CP', 2, 5], ['PRODUTO A 10MG 30CP', 3, 5]]), trier([['PRODUTO A 10MG 30CP', 4, 5], ['PRODUTO A 10MG 30CP', 1, 5]]));
    expect(b.linhas).toHaveLength(1);
    expect(b.linhas[0]).toMatchObject({ resultado: 'OK', qtdCota: 5, qtdTrier: 5, repetidoNoPedido: true });
    expect(b.linhas[0].observacoes.join(' ')).toMatch(/repetido no pedido/);
    expect(b.linhas[0].observacoes.join(' ')).toMatch(/2 vezes no Trier/);
  });

  it('nome cortado no Trier é confirmado e avisado', () => {
    const b = auditar(cota([['MULTISORO 0,9% INFAN GTS 30ML FRASCO', 1, 2.8]]), trier([['MULTISORO 0,9% INFAN GTS 30ML', 1, 2.8]]));
    expect(b.linhas[0]).toMatchObject({ resultado: 'OK', criterio: 'NOME_CORTADO' });
  });
});

describe('auditar — tolerâncias', () => {
  const um = (precoPedido: number, precoTrier: number, tol = TOLERANCIAS_PADRAO) => auditar(cota([['PRODUTO 10MG 30CP', 10, precoPedido]]), trier([['PRODUTO 10MG 30CP', 10, precoTrier]]), tol).linhas[0].resultado;

  it('até R$ 0,01 é arredondamento; até R$ 0,05 e 2% é atenção; acima é divergência', () => {
    expect(um(10, 10.01)).toBe('OK');
    expect(um(10, 10.02)).toBe('ATENCAO');
    expect(um(10, 10.05)).toBe('ATENCAO');
    expect(um(10, 10.06)).toBe('DIVERGENCIA');
    expect(um(1, 1.04)).toBe('DIVERGENCIA'); // 4 centavos, mas 4% do preço
  });

  it('as tolerâncias são configuráveis', () => {
    expect(um(10, 10.06, { arredondamento: 0.01, pequenoReais: 0.1, pequenoPct: 5 })).toBe('ATENCAO');
    expect(um(10, 10.02, { arredondamento: 0.02, pequenoReais: 0.05, pequenoPct: 2 })).toBe('OK');
  });
});

describe('auditar — veredito e providências', () => {
  it('REPROVADO quando há divergência ou pedido ausente, com providência para cada uma', () => {
    const a = auditar(PEDIDO, RELATORIO);
    expect(a.veredito).toBe('REPROVADO');
    const textos = a.providencias.map((p) => p.texto).join('\n');
    expect(textos).toMatch(/CETOCONAZOL.*pedido 6 un, lançado 8 un/);
    expect(textos).toMatch(/TRAZODONA.*preço/);
    expect(textos).toMatch(/OMEGA 3.*não localizado no Trier/);
    expect(textos).toMatch(/ACIDO MEFENAMICO.*Investigar/);
    expect(a.providencias[0].nivel).toBe('alta');
  });

  it('APROVADO COM RESSALVAS quando só há extras, pequenas diferenças ou itens a confirmar', () => {
    const a = auditar(cota([['PRODUTO A 10MG 30CP', 1, 5], ['PRODUTO B 5MG 20CP', 2, 3]]), trier([['PRODUTO A 10MG 30CP', 1, 5.03], ['PRODUTO B 5MG 20CP', 2, 3], ['PRODUTO C 1MG 10CP', 1, 9]]));
    expect(a.contagens).toMatchObject({ ATENCAO: 1, EXTRA: 1, OK: 1 });
    expect(a.veredito).toBe('APROVADO_COM_RESSALVAS');
  });

  it('APROVADO quando tudo confere', () => {
    const a = auditar(cota([['PRODUTO A 10MG 30CP', 1, 5]]), trier([['PRODUTO A 10MG 30CP', 1, 5]]));
    expect(a.veredito).toBe('APROVADO');
    expect(a.providencias).toEqual([]);
    expect(a.financeiro.diferencaTotal).toBe(0);
  });

  it('total impresso que não bate com a soma dos itens vira aviso do documento (e ressalva)', () => {
    const a = auditar(cota([['PRODUTO A 10MG 30CP', 1, 5]], 99), trier([['PRODUTO A 10MG 30CP', 1, 5]]));
    expect(a.avisosDosDocumentos[0]).toMatch(/total impresso no CotaPreço/);
    expect(a.veredito).toBe('APROVADO_COM_RESSALVAS');
  });
});
