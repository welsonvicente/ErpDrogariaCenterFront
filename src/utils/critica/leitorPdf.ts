import type { ItemPdf } from './tipos';

const TAMANHO_MAXIMO = 15 * 1024 * 1024;

/**
 * Extrai todos os trechos de texto de um PDF, com a posição de cada um. A
 * biblioteca (pdf.js) e o seu worker só são baixados quando alguém abre a tela
 * de crítica de pedido — não pesam no resto do sistema.
 */
export async function extrairItensDoPdf(arquivo: File): Promise<ItemPdf[]> {
  if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== 'application/pdf') {
    throw new Error('Envie o documento em PDF.');
  }
  if (arquivo.size === 0) throw new Error('O arquivo está vazio.');
  if (arquivo.size > TAMANHO_MAXIMO) throw new Error('O PDF é maior que 15 MB.');

  try {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;

    const documento = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise;
    const itens: ItemPdf[] = [];
    for (let numero = 1; numero <= documento.numPages; numero++) {
      const pagina = await documento.getPage(numero);
      const conteudo = await pagina.getTextContent();
      for (const trecho of conteudo.items) {
        if (!('str' in trecho) || !trecho.str.trim()) continue;
        itens.push({ pagina: numero, x: trecho.transform[4], y: trecho.transform[5], w: trecho.width, s: trecho.str });
      }
    }
    if (!itens.length) throw new Error('sem-texto');
    return itens;
  } catch (erro) {
    if (erro instanceof Error && erro.message === 'sem-texto') {
      throw new Error('Esse PDF não tem texto selecionável (parece uma imagem escaneada). Gere o PDF direto do sistema, sem digitalizar.');
    }
    throw new Error('Não foi possível ler esse PDF. Confirme que ele não está protegido por senha nem corrompido.');
  }
}
