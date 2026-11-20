// @vitest-environment node
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { PEDIDO_EXEMPLO, RELATORIO_EXEMPLO } from '../../tests/fabricaCritica';
import { auditar } from './auditoria';
import { gerarExcel } from './exportarExcel';
import { gerarPdf, limparParaPdf } from './exportarPdf';
import { documentoCompleto, documentoDaSecao, nomeDoArquivo, secaoAuditoria, secaoAusentes, secaoExtras, secaoFinanceiro, secaoProvidencias, textoDaCelula } from './relatorio';

const auditoria = auditar(PEDIDO_EXEMPLO, RELATORIO_EXEMPLO);

describe('modelo do relatório', () => {
  it('cada filtro da tabela vira uma seção só com as linhas daquele resultado', () => {
    expect(secaoAuditoria(auditoria, 'TODOS').linhas).toHaveLength(11);
    expect(secaoAuditoria(auditoria, 'DIVERGENCIA').linhas).toHaveLength(2);
    expect(secaoAuditoria(auditoria, 'AUSENTE').linhas.map((l) => textoDaCelula(l.celulas[0]))).toEqual(['DIVALPROATO SOD 250MG 30CP REV', 'OMEGA 3 1000MG 120CAP']);
    expect(secaoAuditoria(auditoria, 'AUSENTE').titulo).toBe('Auditoria — Ausentes no Trier (2)');
  });

  it('a tabela de auditoria segue as colunas pedidas e traz número de verdade nas células numéricas', () => {
    const s = secaoAuditoria(auditoria, 'TODOS');
    expect(s.colunas.map((c) => c.rotulo)).toEqual(['Produto', 'Qtd. CotaPreço', 'Qtd. Trier', 'Dif. Qtd.', 'Preço CotaPreço', 'Preço Trier', 'Dif. unitária', 'Impacto (R$)', 'Resultado', 'Observação', 'Motivo / anotação']);
    const cetoconazol = s.linhas.find((l) => textoDaCelula(l.celulas[0]).startsWith('CETOCONAZOL'))!;
    expect(cetoconazol.celulas[3]).toMatchObject({ t: '+2', n: 2, fmt: 'qtd' });
    expect(cetoconazol.celulas[4]).toMatchObject({ n: 6.99, fmt: 'moeda' });
    expect(cetoconazol.celulas[8]).toMatchObject({ t: 'DIVERGÊNCIA', negrito: true });
  });

  it('financeiro, listas A e B e providências refletem a auditoria', () => {
    const f = secaoFinanceiro(auditoria);
    expect(f.linhas.map((l) => textoDaCelula(l.celulas[0]))).toContain('Parte não explicada');
    const a = secaoAusentes(auditoria);
    expect(a.total && textoDaCelula(a.total.celulas[3])).toMatch(/164,69/);
    expect(secaoExtras(auditoria).linhas).toHaveLength(2);
    expect(secaoProvidencias(auditoria).linhas.length).toBeGreaterThan(3);
  });

  it('o documento completo reúne todas as seções, e o individual leva o veredito e o contexto', () => {
    const completo = documentoCompleto(auditoria, PEDIDO_EXEMPLO, RELATORIO_EXEMPLO);
    expect(completo.secoes.map((s) => s.id)).toEqual(['resumo', 'financeiro', 'auditoria-TODOS', 'ausentes', 'extras', 'providencias']);
    const individual = documentoDaSecao(secaoFinanceiro(auditoria), auditoria, PEDIDO_EXEMPLO, RELATORIO_EXEMPLO);
    expect(individual.veredito?.texto).toMatch(/REPROVADO/);
    expect(individual.contexto[0]).toContain('Distribuidora Exemplo');
  });

  it('a anotação (motivo + observação) de cada linha sai na tabela e nas listas A e B', () => {
    const chaveExtra = auditoria.linhas.find((l) => l.resultado === 'EXTRA')!.chave;
    const chaveAusente = auditoria.linhas.find((l) => l.resultado === 'AUSENTE')!.chave;
    const anotacoes = {
      [chaveExtra]: { motivo: 'URGENCIA', texto: 'Faltou na loja, comprador pediu junto' },
      [chaveAusente]: { motivo: null, texto: 'Chega na próxima entrega' },
    };
    const tabela = secaoAuditoria(auditoria, 'TODOS', anotacoes);
    const textos = tabela.linhas.map((l) => textoDaCelula(l.celulas[10]));
    expect(textos).toContain('Incluído em urgência (falta) — veio junto com este pedido — Faltou na loja, comprador pediu junto');
    expect(textos).toContain('Chega na próxima entrega');
    expect(textos.filter(Boolean)).toHaveLength(2);
    expect(textoDaCelula(secaoExtras(auditoria, anotacoes).linhas[0].celulas[6])).toMatch(/urgência/);
    expect(textoDaCelula(secaoAusentes(auditoria, anotacoes).linhas[0].celulas[5])).toBe('Chega na próxima entrega');
    // sem anotação, a coluna existe e fica vazia
    expect(secaoExtras(auditoria).linhas[0].celulas).toHaveLength(7);
  });

  it('nome de arquivo sem acento nem símbolo', () => {
    expect(nomeDoArquivo({ ...PEDIDO_EXEMPLO, numero: 'PED-C000080/D 762' }, 'Lista A - Ausentes')).toBe('critica-PED-C000080-D-762-Lista-A-Ausentes');
    expect(nomeDoArquivo({ ...PEDIDO_EXEMPLO, numero: null }, 'financeiro')).toBe('critica-pedido-financeiro');
  });
});

describe('Excel', () => {
  it('gera uma aba por seção, com cabeçalho, números reais, formatos e cor por resultado', async () => {
    const blob = await gerarExcel(documentoCompleto(auditoria, PEDIDO_EXEMPLO, RELATORIO_EXEMPLO));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());

    expect(wb.worksheets.map((w) => w.name)).toEqual(['Resumo', 'Financeiro', 'Auditoria', 'Lista A - Ausentes', 'Lista B - Extras', 'Providências']);

    const ws = wb.getWorksheet('Auditoria')!;
    expect(ws.getCell('A1').value).toBe('Crítica de pedido');
    expect(String(ws.getCell('A4').value)).toMatch(/REPROVADO/);
    expect(ws.views[0]).toMatchObject({ state: 'frozen' });
    expect(ws.autoFilter).toBeTruthy();

    // acha a linha de cabeçalho e confere a primeira de dados (é uma divergência, no topo)
    let cabecalho = 0;
    ws.eachRow((row, i) => {
      if (!cabecalho && row.getCell(1).value === 'Produto') cabecalho = i;
    });
    expect(cabecalho).toBeGreaterThan(0);
    const head = ws.getRow(cabecalho);
    expect(head.getCell(1).fill).toMatchObject({ fgColor: { argb: 'FF628B00' } });
    expect(head.getCell(1).font).toMatchObject({ bold: true });

    const linha = ws.getRow(cabecalho + 1);
    expect(linha.getCell(9).value).toBe('DIVERGÊNCIA');
    expect(linha.getCell(9).font).toMatchObject({ bold: true, color: { argb: 'FFE30613' } });
    expect(typeof linha.getCell(5).value).toBe('number'); // preço é número, não texto
    expect(linha.getCell(5).numFmt).toContain('R$');
    expect(linha.getCell(1).border?.left).toMatchObject({ style: 'thick', color: { argb: 'FFE30613' } });
  });

  it('o arquivo individual de uma seção tem só aquela aba', async () => {
    const blob = await gerarExcel(documentoDaSecao(secaoFinanceiro(auditoria), auditoria, PEDIDO_EXEMPLO, RELATORIO_EXEMPLO));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Financeiro']);
  });
});

describe('PDF', () => {
  it('gera um PDF paisagem válido com todas as seções', async () => {
    const blob = await gerarPdf(documentoCompleto(auditoria, PEDIDO_EXEMPLO, RELATORIO_EXEMPLO));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toMatch(/^%PDF-1\./);
    expect(blob.size).toBeGreaterThan(4000);
  });

  it('limparParaPdf troca símbolos fora do alfabeto latino e tira emoji', () => {
    expect(limparParaPdf('Diferença −R$ 4,42 → ✓ 🟢 OK')).toBe('Diferença -R$ 4,42 -> ok OK');
    expect(limparParaPdf('«REPOFLOR» 1G × 800MG · ação')).toBe('«REPOFLOR» 1G × 800MG · ação');
  });
});
