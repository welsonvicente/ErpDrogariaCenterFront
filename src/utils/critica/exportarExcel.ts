import type { Alignment, Workbook, Worksheet } from 'exceljs';
import type { Cel, ColunaRel, DocumentoRel, SecaoRel } from './relatorio';
import { textoDaCelula } from './relatorio';

const VERDE = 'FF628B00';
const VERDE_ESCURO = 'FF173C3A';
const CINZA = 'FF5B6B68';
const LINHA = 'FFD8E7E2';
const ZEBRA = 'FFF6FBF0';

const argb = (hex: string) => `FF${hex.replace('#', '').toUpperCase()}`;
const FORMATO_MOEDA = '"R$" #,##0.00;[Red]-"R$" #,##0.00';

/** Largura total (em "caracteres" do Excel) que as colunas dividem entre si por peso. */
const LARGURA_TOTAL = 150;

function nomeDaAba(nome: string, usados: Set<string>): string {
  const base = nome.replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Aba';
  let candidato = base;
  for (let i = 2; usados.has(candidato.toLowerCase()); i++) candidato = `${base.slice(0, 28)} ${i}`;
  usados.add(candidato.toLowerCase());
  return candidato;
}

function larguras(colunas: ColunaRel[]): number[] {
  const soma = colunas.reduce((s, c) => s + c.peso, 0);
  return colunas.map((c) => Math.min(70, Math.max(11, Math.round((c.peso / soma) * LARGURA_TOTAL))));
}

function alinhamento(coluna: ColunaRel, numerica: boolean): Partial<Alignment> {
  return { vertical: 'top', wrapText: true, horizontal: coluna.alinhar === 'dir' || numerica ? 'right' : coluna.alinhar === 'centro' ? 'center' : 'left' };
}

function escreverAba(wb: Workbook, secao: SecaoRel, doc: DocumentoRel, usados: Set<string>) {
  const ws: Worksheet = wb.addWorksheet(nomeDaAba(secao.nomeCurto, usados), {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9, margins: { left: 0.3, right: 0.3, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: '&L&8PharmaMind · Crítica de pedido&R&8Página &P de &N' },
  });
  const n = secao.colunas.length;
  const larg = larguras(secao.colunas);
  ws.columns = larg.map((width) => ({ width }));

  const mesclar = (linha: number) => n > 1 && ws.mergeCells(linha, 1, linha, n);

  // ---- cabeçalho do documento ----
  let r = 1;
  ws.getCell(r, 1).value = doc.titulo;
  ws.getCell(r, 1).font = { name: 'Calibri', size: 18, bold: true, color: { argb: VERDE_ESCURO } };
  mesclar(r);
  ws.getRow(r).height = 28;
  for (const linha of doc.contexto) {
    r += 1;
    ws.getCell(r, 1).value = linha;
    ws.getCell(r, 1).font = { size: 10.5, color: { argb: CINZA } };
    mesclar(r);
  }
  if (doc.veredito) {
    r += 1;
    const c = ws.getCell(r, 1);
    c.value = `Veredito: ${doc.veredito.texto}`;
    c.font = { size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(doc.veredito.cor) } };
    c.alignment = { vertical: 'middle', indent: 1 };
    mesclar(r);
    ws.getRow(r).height = 22;
  }

  // ---- título e nota da seção ----
  r += 2;
  ws.getCell(r, 1).value = secao.titulo;
  ws.getCell(r, 1).font = { size: 13, bold: true, color: { argb: VERDE_ESCURO } };
  mesclar(r);
  if (secao.nota) {
    r += 1;
    ws.getCell(r, 1).value = secao.nota;
    ws.getCell(r, 1).font = { size: 10, italic: true, color: { argb: CINZA } };
    ws.getCell(r, 1).alignment = { wrapText: true, vertical: 'top' };
    mesclar(r);
    ws.getRow(r).height = Math.max(16, Math.ceil(secao.nota.length / (LARGURA_TOTAL * 0.95)) * 15);
  }

  // ---- tabela ----
  r += 2;
  const cabecalho = r;
  const linhaCab = ws.getRow(cabecalho);
  linhaCab.values = secao.colunas.map((c) => c.rotulo);
  linhaCab.height = 32;
  linhaCab.eachCell((c, i) => {
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10.5 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: VERDE } };
    c.alignment = { vertical: 'middle', horizontal: secao.colunas[i - 1].alinhar === 'dir' ? 'right' : 'center', wrapText: true };
    c.border = { bottom: { style: 'medium', color: { argb: VERDE_ESCURO } } };
  });

  const escreverLinha = (celulas: Cel[], opcoes: { faixa?: string; negrito?: boolean; zebra?: boolean; total?: boolean }) => {
    r += 1;
    const linha = ws.getRow(r);
    let maiorTexto = 1;
    celulas.forEach((cel, i) => {
      const coluna = secao.colunas[i];
      const c = linha.getCell(i + 1);
      const objeto = typeof cel === 'string' ? null : cel;
      const numerico = objeto?.n !== undefined && objeto?.n !== null;
      c.value = numerico ? (objeto!.n as number) : textoDaCelula(cel);
      if (numerico && objeto?.fmt === 'moeda') c.numFmt = FORMATO_MOEDA;
      else if (numerico && objeto?.fmt === 'qtd') c.numFmt = Number.isInteger(objeto.n) ? '#,##0' : '#,##0.000';
      c.font = { size: 10, bold: opcoes.negrito || objeto?.negrito || false, color: objeto?.cor ? { argb: argb(objeto.cor) } : undefined };
      c.alignment = alinhamento(coluna, numerico);
      c.border = { top: { style: 'thin', color: { argb: opcoes.total ? VERDE_ESCURO : LINHA } }, bottom: { style: 'thin', color: { argb: LINHA } }, ...(i === 0 && opcoes.faixa ? { left: { style: 'thick' as const, color: { argb: argb(opcoes.faixa) } } } : {}) };
      if (opcoes.zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
      if (opcoes.total) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7CC' } };
      // O Excel não ajusta a altura de célula com texto quebrado sozinho ao abrir: estima pelas linhas.
      const texto = textoDaCelula(cel);
      maiorTexto = Math.max(maiorTexto, Math.ceil(texto.length / Math.max(6, larg[i] * 1.05)));
    });
    linha.height = Math.max(18, maiorTexto * 14 + 4);
  };

  secao.linhas.forEach((l, i) => escreverLinha(l.celulas, { faixa: l.faixa, negrito: l.negrito, zebra: i % 2 === 1 }));
  const ultimaDeDados = r;
  if (secao.total) escreverLinha(secao.total.celulas, { negrito: true, total: true });

  if (secao.linhas.length > 1) ws.autoFilter = { from: { row: cabecalho, column: 1 }, to: { row: ultimaDeDados, column: n } };
  ws.views = [{ state: 'frozen', ySplit: cabecalho, showGridLines: false }];
  ws.pageSetup.printTitlesRow = `${cabecalho}:${cabecalho}`;
}

/** Excel formatado: uma aba por seção, cabeçalho verde fixo, moeda/quantidade como número, cor por resultado e filtros. */
export async function gerarExcel(doc: DocumentoRel): Promise<Blob> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PharmaMind';
  wb.created = new Date();
  const usados = new Set<string>();
  for (const secao of doc.secoes) escreverAba(wb, secao, doc, usados);
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
