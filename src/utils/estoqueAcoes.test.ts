import { describe, expect, it } from 'vitest';
import { CONFIG_PADRAO, analisar } from './estoqueAnalise';
import { produto } from '../tests/fabricaEstoque';
import { acaoEfetiva, candidatoNegociacao, categoriaDoProduto, sugerirAcao } from './estoqueAcoes';

const HOJE = new Date(2026, 10, 19);
const analisado = (extra: Parameters<typeof produto>[0]) => analisar([produto(extra)], CONFIG_PADRAO, HOJE)[0];

describe('categoriaDoProduto', () => {
  it.each([
    [{ produto: 'ANTIBIOTICO 500MG', grupo: 'MEDICAMENTOS ETICOS' }, 'MEDICAMENTO_CONTROLADO'],
    [{ produto: 'DIPIRONA 500MG', grupo: 'MEDICAMENTOS GENERICOS' }, 'MEDICAMENTO'],
    // medicamento infantil continua medicamento: nunca recebe sugestão de promoção
    [{ produto: 'XAROPE INFANTIL', grupo: 'MEDICAMENTOS SIMILARES' }, 'MEDICAMENTO'],
    [{ produto: 'SHAMPOO INFANTIL', grupo: 'PERFUMARIA' }, 'INFANTIL'],
    [{ produto: 'FRALDA M', grupo: null }, 'INFANTIL'],
    [{ produto: 'OMEGA 3 60 CAPSULAS', grupo: 'VITAMINAS E SUPLEMENTOS' }, 'VITAMINA_SUPLEMENTO'],
    [{ produto: 'PROTETOR SOLAR FPS 50', grupo: 'DERMOCOSMETICOS' }, 'PERFUMARIA_COSMETICO'],
    [{ produto: 'TERMOMETRO DIGITAL', grupo: 'CONVENIENCIA' }, 'OUTROS'],
  ] as const)('%j → %s', (p, esperado) => {
    expect(categoriaDoProduto({ laboratorio: null, ...p })).toBe(esperado);
  });
});

describe('sugerirAcao', () => {
  it('perfumaria: destaque e kit, mencionando a margem mínima configurada', () => {
    const s = sugerirAcao(analisado({ produto: 'CREME HIDRATANTE', grupo: 'PERFUMARIA', saldo: 30, custoUnitario: 10, laboratorio: 'LAB X' }), CONFIG_PADRAO);
    expect(s.categoria).toBe('PERFUMARIA_COSMETICO');
    expect(s.acaoRecomendada).toMatch(/destaque na gôndola/i);
    expect(s.comoExecutar).toMatch(/kit/i);
    expect(s.comoExecutar).toContain('20%');
    expect(s.objetivo).toContain('R$');
  });

  it('medicamento nunca sugere promoção, divulgação ou desconto', () => {
    for (const grupo of ['MEDICAMENTOS GENERICOS', 'MEDICAMENTOS ETICOS']) {
      const s = sugerirAcao(analisado({ produto: 'ANTIBIOTICO XYZ', grupo, saldo: 40, fornecedor: 'DISTRIB' }), CONFIG_PADRAO);
      const texto = `${s.acaoRecomendada} ${s.objetivo} ${s.comoExecutar}`.toLowerCase();
      expect(texto).toMatch(/validade/);
      expect(texto).toMatch(/devolu/);
      expect(texto).not.toMatch(/gôndola|kit|campanha|desconto|instagram|whatsapp/);
    }
  });

  it('descreve o tempo desde a última entrada sem afirmar que ficou sem vender', () => {
    const s = sugerirAcao(analisado({ produto: 'X', saldo: 30, dataUltimaEntrada: '2024-01-01' }), CONFIG_PADRAO);
    expect(s.objetivo).toMatch(/última entrada foi há mais de 365 dias/);
    expect(s.objetivo).not.toMatch(/sem vend/i);
  });

  it('não inventa dado: sem custo e sem data, não cita valor nem prazo falso', () => {
    const s = sugerirAcao(analisado({ produto: 'X', saldo: 30, custoUnitario: null, dataUltimaEntrada: null }), CONFIG_PADRAO);
    expect(s.objetivo).not.toContain('R$');
    expect(s.objetivo).toMatch(/não foi informada/);
  });

  it('prioridade de rotina (poucas unidades) recomenda acompanhar, não campanha', () => {
    const s = sugerirAcao(analisado({ produto: 'SHAMPOO', grupo: 'PERFUMARIA', saldo: 2 }), CONFIG_PADRAO);
    expect(s.acaoRecomendada).toMatch(/rotina/i);
  });
});

describe('acaoEfetiva', () => {
  it('o texto salvo pela gestão vence a sugestão, campo a campo', () => {
    const p = analisado({ produto: 'SHAMPOO', grupo: 'PERFUMARIA', saldo: 30, acaoRecomendada: 'Minha ação' });
    const e = acaoEfetiva(p, CONFIG_PADRAO);
    expect(e.acaoRecomendada).toBe('Minha ação');
    expect(e.objetivo).toBe(sugerirAcao(p, CONFIG_PADRAO).objetivo);
    expect(e.personalizada).toBe(true);
  });

  it('sem nada salvo usa a sugestão', () => {
    expect(acaoEfetiva(analisado({ saldo: 30 }), CONFIG_PADRAO).personalizada).toBe(false);
  });
});

describe('candidatoNegociacao', () => {
  it('estoque alto + muito tempo desde a última entrada', () => {
    expect(candidatoNegociacao(analisado({ saldo: 30, dataUltimaEntrada: '2025-01-01' }), CONFIG_PADRAO)).toBe(true);
    expect(candidatoNegociacao(analisado({ saldo: 30, dataUltimaEntrada: '2026-11-01' }), CONFIG_PADRAO)).toBe(false);
    expect(candidatoNegociacao(analisado({ saldo: 3, dataUltimaEntrada: '2025-01-01' }), CONFIG_PADRAO)).toBe(false);
  });
});
