import type { DocumentoRel, Formato } from './relatorio';

export const EXTENSAO: Record<Formato, string> = { png: 'png', pdf: 'pdf', xlsx: 'xlsx' };

export function baixarBlob(blob: Blob, nomeArquivo: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Gera o documento no formato pedido e baixa. As três bibliotecas (exceljs,
 * jspdf e o desenho da imagem) só são carregadas quando a pessoa clica.
 */
export async function baixarDocumento(doc: DocumentoRel, formato: Formato, nomeBase: string) {
  let blob: Blob;
  if (formato === 'xlsx') blob = await (await import('./exportarExcel')).gerarExcel(doc);
  else if (formato === 'pdf') blob = await (await import('./exportarPdf')).gerarPdf(doc);
  else blob = await (await import('./exportarImagem')).gerarPng(doc);
  baixarBlob(blob, `${nomeBase}.${EXTENSAO[formato]}`);
}
