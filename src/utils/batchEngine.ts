/**
 * Motor de importação do modo "Importar planilha" — portado 1:1 da lógica que
 * já existia em `public/tools/cartazes.html` (`parseWorkbookToProducts` e
 * vizinhas). Só a leitura/parsing de dados; pintura do story reaproveita
 * `pintarStory` de `cartazEngine.ts` sem duplicar nada.
 */

import * as XLSX from 'xlsx';
import type { TransformImagem } from './cartazEngine';

export type StatusImagemProduto = 'pending' | 'searching' | 'found' | 'manual' | 'failed';

export interface ProdutoImportado {
  descricao: string;
  normal: number | null;
  promo: number | null;
  ean: string | null;
  imagem: HTMLImageElement | null;
  status: StatusImagemProduto;
  transform: TransformImagem;
}

export const TRANSFORM_PADRAO: TransformImagem = { scale: 1, panX: 0.5, panY: 0.5 };

export function novoProdutoImportado(base: { descricao: string; normal: number | null; promo: number | null; ean: string | null }): ProdutoImportado {
  return { ...base, imagem: null, status: 'pending', transform: TRANSFORM_PADRAO };
}

export function parseCelulaDinheiro(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const n = Number.parseFloat(String(v).replace(/[^\d,.-]/g, '').replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

function normalizarCabecalho(h: unknown): string {
  return String(h ?? '').trim().toLowerCase();
}

function encontrarColuna(headerRow: string[], ...palavrasChave: string[]): number {
  return headerRow.findIndex((h) => palavrasChave.some((k) => h.includes(k)));
}

export function lerArquivoComoWorkbook(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        resolve(XLSX.read(data, { type: 'array', cellDates: true }));
      } catch (erro) {
        reject(erro);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * `null` = planilha sem uma coluna de descrição reconhecível (não dá pra
 * importar nada dali). Array vazio = coluna existe, mas nenhuma linha válida.
 */
export function parseWorkbookParaProdutos(workbook: XLSX.WorkBook): ProdutoImportado[] | null {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
  if (!linhas.length) return [];

  const headerRow = (linhas[0] as unknown[]).map(normalizarCabecalho);
  const colDesc = encontrarColuna(headerRow, 'produto', 'descri');
  const colNormal = encontrarColuna(headerRow, 'preço normal', 'preco normal', 'normal');
  const colPromo = encontrarColuna(headerRow, 'promo');
  const colEan = encontrarColuna(headerRow, 'ean');

  if (colDesc === -1) return null;

  const produtos: ProdutoImportado[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const row = linhas[i] as unknown[] | null;
    if (!row) continue;
    const desc = row[colDesc];
    if (!desc || typeof desc !== 'string' || !desc.trim()) continue;
    if (desc.toLowerCase().includes('total de itens')) continue;

    const normal = colNormal !== -1 ? parseCelulaDinheiro(row[colNormal]) : null;
    const promo = colPromo !== -1 ? parseCelulaDinheiro(row[colPromo]) : null;
    const eanBruto: string | number | null = colEan !== -1 ? (row[colEan] as string | number | null) : null;
    let ean: string | null = null;
    if (typeof eanBruto === 'number') ean = String(Math.round(eanBruto));
    else if (eanBruto) ean = String(eanBruto).trim();

    produtos.push(novoProdutoImportado({ descricao: desc.trim(), normal, promo, ean }));
  }
  return produtos;
}

/** Modo "colar direto do Excel/Sheets" — uma coluna de cada vez, uma linha por produto. */
export function parseColunasColadas(descricaoTexto: string, normalTexto: string, promoTexto: string, eanTexto: string): ProdutoImportado[] {
  const descLinhas = descricaoTexto
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const normalLinhas = normalTexto.split('\n').map((s) => s.trim());
  const promoLinhas = promoTexto.split('\n').map((s) => s.trim());
  const eanLinhas = eanTexto.split('\n').map((s) => s.trim());

  return descLinhas.map((descricao, i) =>
    novoProdutoImportado({
      descricao,
      normal: parseCelulaDinheiro(normalLinhas[i] || null),
      promo: parseCelulaDinheiro(promoLinhas[i] || null),
      ean: (eanLinhas[i] || '').trim() || null,
    }),
  );
}

/**
 * Testa se uma imagem carregada de outra origem pode ser usada num canvas
 * exportável — muitos sites bloqueiam isso via CORS, só descobrimos tentando
 * (canvas "contaminado" lança exceção em toDataURL/toBlob).
 */
export function imagemExportavel(img: HTMLImageElement): boolean {
  try {
    const c = document.createElement('canvas');
    c.width = 2;
    c.height = 2;
    const ctx = c.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 2, 2);
    c.toDataURL();
    return true;
  } catch {
    return false;
  }
}

export function carregarImagemExterna(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}
