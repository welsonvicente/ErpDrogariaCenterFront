import type { DocumentoRel } from './relatorio';
import { textoDaCelula } from './relatorio';

const VERDE: [number, number, number] = [98, 139, 0];
const VERDE_ESCURO: [number, number, number] = [23, 60, 58];
const ZEBRA: [number, number, number] = [246, 251, 240];
const MARGEM = 10;

const hex = (cor: string): [number, number, number] => {
  const n = parseInt(cor.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * As fontes padrão do PDF só têm o alfabeto latino (acentos do português ok).
 * Símbolos como "−", "→" ou emoji viram caracteres equivalentes simples, e o que
 * não tiver equivalente sai, em vez de aparecer quebrado.
 */
export function limparParaPdf(texto: string): string {
  return texto
    .replace(/[−–—]/g, '-')
    .replace(/→/g, '->')
    .replace(/✓|✔/g, 'ok')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^ -ÿ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** PDF paisagem (A4): faixa de título, veredito, e cada seção como tabela com cabeçalho verde, zebra e cor por resultado. */
export async function gerarPdf(doc: DocumentoRel): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const larguraPagina = pdf.internal.pageSize.getWidth();
  const alturaPagina = pdf.internal.pageSize.getHeight();
  const util = larguraPagina - 2 * MARGEM;

  // ---- faixa de título ----
  pdf.setFillColor(...VERDE);
  pdf.rect(0, 0, larguraPagina, 4, 'F');
  pdf.setTextColor(...VERDE_ESCURO);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(limparParaPdf(doc.titulo), MARGEM, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9.5);
  pdf.setTextColor(91, 107, 104);
  let y = 21;
  for (const linha of doc.contexto) {
    pdf.text(limparParaPdf(linha), MARGEM, y);
    y += 4.8;
  }
  if (doc.veredito) {
    const texto = limparParaPdf(`Veredito: ${doc.veredito.texto}`);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    const w = pdf.getTextWidth(texto) + 8;
    pdf.setFillColor(...hex(doc.veredito.cor));
    pdf.roundedRect(MARGEM, y - 1, w, 7, 1.5, 1.5, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.text(texto, MARGEM + 4, y + 3.8);
    y += 11;
  }

  // ---- seções ----
  doc.secoes.forEach((secao, indice) => {
    const proximaParte = () => (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
    if (indice > 0) y = (proximaParte() ?? y) + 9;
    if (y > alturaPagina - 40) {
      pdf.addPage();
      y = MARGEM + 4;
    }

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(...VERDE_ESCURO);
    pdf.text(limparParaPdf(secao.titulo), MARGEM, y);
    y += 2;
    if (secao.nota) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8.5);
      pdf.setTextColor(91, 107, 104);
      const linhas = pdf.splitTextToSize(limparParaPdf(secao.nota), util) as string[];
      pdf.text(linhas, MARGEM, y + 3.5);
      y += 3.5 * linhas.length + 1;
    }

    const soma = secao.colunas.reduce((s, c) => s + c.peso, 0);
    const colunas = secao.colunas.map((c) => ({ cellWidth: (c.peso / soma) * util, halign: (c.alinhar === 'dir' ? 'right' : c.alinhar === 'centro' ? 'center' : 'left') as 'left' | 'right' | 'center' }));
    const todasLinhas = [...secao.linhas, ...(secao.total ? [secao.total] : [])];

    autoTable(pdf, {
      startY: y + 2,
      margin: { left: MARGEM, right: MARGEM, top: MARGEM, bottom: 12 },
      head: [secao.colunas.map((c) => limparParaPdf(c.rotulo))],
      body: todasLinhas.map((l) => l.celulas.map((c) => limparParaPdf(textoDaCelula(c)))),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, lineColor: [216, 231, 226], lineWidth: 0.15, textColor: [23, 60, 58], valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: VERDE, textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center', valign: 'middle' },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: Object.fromEntries(colunas.map((c, i) => [i, c])),
      didParseCell: (dados) => {
        if (dados.section !== 'body') return;
        const linha = todasLinhas[dados.row.index];
        const celula = linha?.celulas[dados.column.index];
        if (linha?.negrito || (typeof celula === 'object' && celula.negrito)) dados.cell.styles.fontStyle = 'bold';
        if (typeof celula === 'object' && celula.cor) dados.cell.styles.textColor = hex(celula.cor);
        if (secao.total && dados.row.index === todasLinhas.length - 1) dados.cell.styles.fillColor = [234, 247, 204];
      },
      didDrawCell: (dados) => {
        // Faixa colorida à esquerda da linha (a cor do resultado).
        if (dados.section !== 'body' || dados.column.index !== 0) return;
        const faixa = todasLinhas[dados.row.index]?.faixa;
        if (faixa) {
          pdf.setFillColor(...hex(faixa));
          pdf.rect(dados.cell.x, dados.cell.y, 1.1, dados.cell.height, 'F');
        }
      },
    });
  });

  // ---- rodapé em todas as páginas ----
  const total = pdf.getNumberOfPages();
  const agora = new Date();
  for (let p = 1; p <= total; p++) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(120, 135, 132);
    pdf.text(`PharmaMind - Critica de pedido - gerado em ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`, MARGEM, alturaPagina - 5);
    pdf.text(`Pagina ${p} de ${total}`, larguraPagina - MARGEM, alturaPagina - 5, { align: 'right' });
  }

  return pdf.output('blob');
}
