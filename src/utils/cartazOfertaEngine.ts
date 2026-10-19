/**
 * Cartaz de oferta pra imprimir (A4) — portado do "Gerador de cartazes de
 * oferta" do projeto Drogaria Center (src/App.jsx: drawPoster, drawOfferPage,
 * offerLayout, postersPdfBlob, offersFromSpreadsheet). Mesmo desenho e mesma
 * matemática; só tipado e com nomes em português.
 *
 * Cada cartaz é desenhado em 1334×2000 sobre o fundo (modelo oficial em
 * /oferta-background.png ou uma imagem da pessoa) e depois encaixado numa
 * folha A4 com 1 a 12 cartazes.
 */
import type * as XLSXTipos from 'xlsx';

export interface OfertaCartaz {
  produto: string;
  precoAntigo: string | number;
  preco: string | number;
}

/** Oferta de um lote: `produtoOriginal` (+ `ean`) é a chave do dicionário de descrições; `produto`, o que sai no cartaz. */
export interface OfertaLote extends OfertaCartaz {
  produtoOriginal: string;
  ean?: string | null;
}

export const CARTAZES_POR_FOLHA_OPCOES = [1, 2, 4, 6, 8, 9, 10, 12] as const;

/** "7,99" / 7.99 / "1.234,50" → { inteiro: '7', centavos: '99' }. */
export function partesPreco(valor: string | number | null | undefined) {
  const bruto = String(valor ?? '').replace(/[^\d,.-]/g, '');
  const normalizado = bruto.includes(',') && bruto.includes('.') ? bruto.replace(/\./g, '').replace(',', '.') : bruto.replace(',', '.');
  const numero = Number(normalizado);
  const [inteiro, centavos] = (Number.isFinite(numero) ? numero : 0).toFixed(2).split('.');
  return { inteiro, centavos };
}

function linhasTitulo(ctx: CanvasRenderingContext2D, titulo: string, larguraMax: number) {
  const palavras = (titulo || 'PRODUTO EM OFERTA').trim().toUpperCase().split(/\s+/);
  return palavras.reduce<string[]>(
    (linhas, palavra) => {
      const atual = linhas[linhas.length - 1] || '';
      const candidata = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(candidata).width <= larguraMax || !atual) linhas[linhas.length - 1] = candidata;
      else linhas.push(palavra);
      return linhas;
    },
    [''],
  );
}

/** Um cartaz (1334×2000): nome do produto, "DE", "POR" e o preço gigante. */
export function desenharCartazOferta(canvas: HTMLCanvasElement, fundo: HTMLImageElement, oferta: OfertaCartaz) {
  canvas.width = 1334;
  canvas.height = 2000;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const larguraFundo = fundo.naturalWidth || fundo.width || canvas.width;
  const alturaFundo = fundo.naturalHeight || fundo.height || canvas.height;
  const escalaFundo = Math.min(canvas.width / larguraFundo, canvas.height / alturaFundo);
  const lf = larguraFundo * escalaFundo;
  const af = alturaFundo * escalaFundo;
  ctx.drawImage(fundo, (canvas.width - lf) / 2, (canvas.height - af) / 2, lf, af);

  const escala = canvas.width / 1334;
  const x = (v: number) => v * escala;
  const y = (v: number) => v * escala;
  const larguraTitulo = x(1110);
  const topoTitulo = y(390);
  const baseTitulo = y(750);
  let tamanhoFonte = x(106);
  let linhas: string[] = [];
  while (tamanhoFonte >= x(55)) {
    ctx.font = `900 ${tamanhoFonte}px Arial, sans-serif`;
    linhas = linhasTitulo(ctx, oferta.produto, larguraTitulo);
    const alturaBloco = Math.min(linhas.length, 3) * tamanhoFonte * 0.92;
    if (linhas.length <= 3 && alturaBloco <= baseTitulo - topoTitulo) break;
    tamanhoFonte -= x(5);
  }
  const alturaLinha = tamanhoFonte * 0.92;
  const centroTitulo = (topoTitulo + baseTitulo) / 2;
  ctx.fillStyle = '#4a4210';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  linhas.slice(0, 3).forEach((linha, i) => ctx.fillText(linha, canvas.width / 2, centroTitulo + (i - (Math.min(linhas.length, 3) - 1) / 2) * alturaLinha));

  const antigo = partesPreco(oferta.precoAntigo);
  const atual = partesPreco(oferta.preco);
  ctx.fillStyle = '#e6001a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 ${x(66)}px Arial, sans-serif`;
  // Sem preço anterior (planilha sem "Preço Normal"), não imprime "DE: R$0,00".
  if (Number(antigo.inteiro) > 0 || Number(antigo.centavos) > 0) ctx.fillText(`DE: R$${antigo.inteiro},${antigo.centavos}`, x(270), y(850));
  ctx.font = `900 ${x(72)}px Arial Narrow, Arial, sans-serif`;
  ctx.fillText('POR:', x(285), y(1025));
  const tamanhos = atual.inteiro.length === 1 ? { principal: 600, moeda: 152, centavos: 220 } : atual.inteiro.length === 2 ? { principal: 440, moeda: 130, centavos: 176 } : { principal: 330, moeda: 110, centavos: 145 };
  const gap = x(22);
  const larguraMaxPreco = canvas.width * 0.88;
  const medir = (mult = 1) => {
    ctx.font = `900 ${x(tamanhos.moeda * mult)}px Arial Narrow, Arial, sans-serif`;
    const moeda = ctx.measureText('R$').width;
    ctx.font = `900 ${x(tamanhos.principal * mult)}px Arial Narrow, Arial, sans-serif`;
    const inteiro = ctx.measureText(atual.inteiro).width;
    ctx.font = `900 ${x(tamanhos.centavos * mult)}px Arial Narrow, Arial, sans-serif`;
    const centavos = ctx.measureText(`,${atual.centavos}`).width;
    return { moeda, inteiro, centavos, total: moeda + inteiro + centavos + gap * 2 };
  };
  let medidas = medir();
  const reduz = Math.min(1, larguraMaxPreco / medidas.total);
  if (reduz < 1) medidas = medir(reduz);
  const inicio = (canvas.width - medidas.total) / 2;
  ctx.font = `900 ${x(tamanhos.moeda * reduz)}px Arial Narrow, Arial, sans-serif`;
  ctx.fillText('R$', inicio, y(1265));
  ctx.font = `900 ${x(tamanhos.principal * reduz)}px Arial Narrow, Arial, sans-serif`;
  ctx.fillText(atual.inteiro, inicio + medidas.moeda + gap, y(1460));
  ctx.font = `900 ${x(tamanhos.centavos * reduz)}px Arial Narrow, Arial, sans-serif`;
  ctx.fillText(`,${atual.centavos}`, inicio + medidas.moeda + gap + medidas.inteiro + gap, y(1390));
}

export function layoutFolhaOferta(cartazesPorFolha: number) {
  const layouts: Record<number, [number, number, 'retrato' | 'paisagem']> = {
    1: [1, 1, 'retrato'],
    2: [2, 1, 'paisagem'],
    4: [2, 2, 'retrato'],
    6: [3, 2, 'retrato'],
    8: [4, 2, 'paisagem'],
    9: [3, 3, 'retrato'],
    10: [5, 2, 'paisagem'],
    12: [4, 3, 'retrato'],
  };
  const [colunas, linhas, orientacao] = layouts[cartazesPorFolha] || layouts[8];
  return { colunas, linhas, orientacao };
}

/** Uma folha A4 (1800 px de largura) com até `cartazesPorFolha` cartazes. */
export function desenharFolhaOfertas(canvas: HTMLCanvasElement, fundo: HTMLImageElement, ofertas: OfertaCartaz[], cartazesPorFolha: number) {
  const { colunas, linhas, orientacao } = layoutFolhaOferta(cartazesPorFolha);
  const largura = 1800;
  const altura = Math.round(largura * (orientacao === 'paisagem' ? 210 / 297 : 297 / 210));
  const margem = 12;
  const larguraCelula = (largura - margem * 2) / colunas;
  const alturaCelula = (altura - margem * 2) / linhas;
  const gap = Math.max(6, Math.round(Math.min(larguraCelula, alturaCelula) * 0.012));
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, largura, altura);
  ofertas.forEach((oferta, i) => {
    const cartaz = document.createElement('canvas');
    desenharCartazOferta(cartaz, fundo, oferta);
    const col = i % colunas;
    const lin = Math.floor(i / colunas);
    ctx.drawImage(cartaz, margem + col * larguraCelula + gap / 2, margem + lin * alturaCelula + gap / 2, larguraCelula - gap, alturaCelula - gap);
  });
}

export function blobDoCanvas(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Não foi possível gerar o arquivo.'))), tipo, qualidade));
}

function juntarBytes(partes: Uint8Array[]) {
  const total = partes.reduce((soma, p) => soma + p.length, 0);
  const junto = new Uint8Array(total);
  let pos = 0;
  partes.forEach((p) => {
    junto.set(p, pos);
    pos += p.length;
  });
  return junto;
}

/** PDF A4 (uma folha por canvas, JPEG embutido) montado à mão — sem biblioteca de PDF. */
export async function pdfDasFolhas(canvases: HTMLCanvasElement[]): Promise<Blob> {
  const cod = (t: string) => new TextEncoder().encode(t);
  const imagens = await Promise.all(canvases.map(async (canvas) => ({ canvas, jpeg: new Uint8Array(await (await blobDoCanvas(canvas, 'image/jpeg', 0.96)).arrayBuffer()) })));
  let proximo = 3;
  const paginas = imagens.map((img) => ({ ...img, pagina: proximo++, conteudo: proximo++, imagem: proximo++ }));
  const objetos: { id: number; valor: Uint8Array }[] = [
    { id: 1, valor: cod('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n') },
    { id: 2, valor: cod(`2 0 obj\n<< /Type /Pages /Kids [${paginas.map((p) => `${p.pagina} 0 R`).join(' ')}] /Count ${paginas.length} >>\nendobj\n`) },
  ];
  paginas.forEach((p) => {
    const retrato = p.canvas.height >= p.canvas.width;
    const lp = retrato ? 595.28 : 841.89;
    const ap = retrato ? 841.89 : 595.28;
    const margem = 28.35;
    const esc = Math.min((lp - margem * 2) / p.canvas.width, (ap - margem * 2) / p.canvas.height);
    const li = p.canvas.width * esc;
    const ai = p.canvas.height * esc;
    const conteudo = cod(`q\n${li.toFixed(3)} 0 0 ${ai.toFixed(3)} ${((lp - li) / 2).toFixed(3)} ${((ap - ai) / 2).toFixed(3)} cm\n/Poster${p.imagem} Do\nQ\n`);
    objetos.push(
      { id: p.pagina, valor: cod(`${p.pagina} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${lp} ${ap}] /CropBox [0 0 ${lp} ${ap}] /Resources << /XObject << /Poster${p.imagem} ${p.imagem} 0 R >> >> /Contents ${p.conteudo} 0 R >>\nendobj\n`) },
      { id: p.conteudo, valor: juntarBytes([cod(`${p.conteudo} 0 obj\n<< /Length ${conteudo.length} >>\nstream\n`), conteudo, cod('endstream\nendobj\n')]) },
      { id: p.imagem, valor: juntarBytes([cod(`${p.imagem} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.canvas.width} /Height ${p.canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`), p.jpeg, cod('\nendstream\nendobj\n')]) },
    );
  });
  objetos.sort((a, b) => a.id - b.id);
  const cabecalho = cod('%PDF-1.4\n');
  const offsets: number[] = [];
  let pos = cabecalho.length;
  objetos.forEach((o) => {
    offsets.push(pos);
    pos += o.valor.length;
  });
  const xref = cod(`xref\n0 ${proximo}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${proximo} /Root 1 0 R >>\nstartxref\n${pos}\n%%EOF`);
  return new Blob([cabecalho, ...objetos.map((o) => o.valor), xref] as BlobPart[], { type: 'application/pdf' });
}

function normalizarTexto(v: unknown) {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** Lê as colunas Produto, Vlr.Promoção e Preço Normal (em qualquer aba) — mesmo critério do gerador original. */
export function ofertasDaPlanilha(XLSX: typeof XLSXTipos, workbook: XLSXTipos.WorkBook): OfertaCartaz[] {
  for (const nomeAba of workbook.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[nomeAba], { header: 1, defval: '' });
    const iCabecalho = linhas.findIndex((l) => l.some((c) => normalizarTexto(c).includes('produto')) && l.some((c) => normalizarTexto(c).includes('promocao')));
    if (iCabecalho < 0) continue;
    const cab = linhas[iCabecalho].map(normalizarTexto);
    const colProduto = cab.findIndex((c) => c.includes('produto'));
    const colPromo = cab.findIndex((c) => c.includes('promocao'));
    const colNormal = cab.findIndex((c) => c.includes('preco normal') || c.includes('valor normal'));
    if (colProduto < 0 || colPromo < 0 || colNormal < 0) continue;
    const ofertas = linhas
      .slice(iCabecalho + 1)
      .map((l) => ({ produto: String(l[colProduto] ?? '').trim(), preco: l[colPromo] as string | number, precoAntigo: l[colNormal] as string | number }))
      .filter((o) => o.produto && o.preco !== '');
    if (ofertas.length) return ofertas;
  }
  throw new Error('Não encontrei as colunas Produto, Vlr.Promoção e Preço Normal na planilha.');
}
