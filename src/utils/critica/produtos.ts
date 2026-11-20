/**
 * Comparação de descrições de produto entre o CotaPreço e o Trier.
 *
 * Nenhum dos dois documentos traz EAN, então o cruzamento é por descrição — e
 * descrição parecida NÃO é produto igual: "REPOFLOR 200MG 1G" e "REPOFLOR 200MG
 * 800MG" são apresentações diferentes. Por isso só se confirma automaticamente o
 * que é idêntico (ou o mesmo nome cortado pelo limite de tamanho do Trier); o
 * resto vira candidato, e quem decide é a pessoa.
 */

export interface DescricaoProduto {
  original: string;
  /** Maiúsculo, sem acento, decimal com ponto, espaços simples. */
  normalizado: string;
  /** Palavras do nome (sem as medidas). */
  palavras: string[];
  /** Medidas e apresentação: "500MG", "30CP", "100ML", "0.4MG/ML"… */
  atributos: string[];
}

const UNIDADES = 'MG\\/ML|MG\\/G|MCG\\/ML|MG\\/DOSE|UI\\/ML|MCG|MG|ML|G|L|UI|CPR|CP|CAPS|CAP|DRG|ENV|AMP|FR|UND|UN|TB|SACHE|SC|%|V';
const RE_ATRIBUTO = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*(${UNIDADES})(?![A-Z])`, 'g');

const SINONIMOS: Record<string, string> = { CPR: 'CP', CAPS: 'CAP', UND: 'UN', SACHE: 'SC' };

/** Tamanho a partir do qual um nome do Trier pode ter sido cortado pelo limite do relatório (~30 letras). */
const TAMANHO_DE_CORTE = 27;

export function normalizarNome(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^A-Z0-9.%/ ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function atributo(numero: string, unidade: string): string {
  const n = String(Number(numero)); // 0.40 → "0.4"
  return `${n}${SINONIMOS[unidade] ?? unidade}`;
}

export function descrever(original: string): DescricaoProduto {
  const normalizado = normalizarNome(original);
  const atributos: string[] = [];
  for (const m of normalizado.matchAll(RE_ATRIBUTO)) atributos.push(atributo(m[1], m[2]));
  const semMedidas = normalizado.replace(RE_ATRIBUTO, ' ');
  const palavras = semMedidas.split(' ').filter((p) => /^[A-Z]{2,}$/.test(p));
  return { original, normalizado, palavras, atributos };
}

export type CriterioCasamento = 'NOME_IGUAL' | 'NOME_CORTADO' | 'CANDIDATO';

export interface ResultadoComparacao {
  criterio: CriterioCasamento;
  /** 0–1: o quanto as duas descrições se parecem (só usado pra ordenar candidatos). */
  pontuacao: number;
  /** Diferenças de medida/apresentação ("1G × 800MG"). Vazio quando as medidas são as mesmas. */
  conflitos: string[];
}

function jaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const uniao = new Set([...A, ...B]).size;
  if (!uniao) return 1;
  return [...A].filter((x) => B.has(x)).length / uniao;
}

/** Diferenças entre as medidas dos dois produtos, em texto legível. */
export function conflitosDeApresentacao(a: DescricaoProduto, b: DescricaoProduto): string[] {
  const soA = a.atributos.filter((x) => !b.atributos.includes(x));
  const soB = b.atributos.filter((x) => !a.atributos.includes(x));
  if (!soA.length && !soB.length) return [];
  return [`${soA.join(' ') || '—'} × ${soB.join(' ') || '—'}`];
}

/** O nome mais curto é o mesmo nome cortado? Compara palavra a palavra; só a última pode estar pela metade. */
function nomeCortado(a: string, b: string): boolean {
  const [curto, longo] = a.length <= b.length ? [a, b] : [b, a];
  if (curto === longo || curto.length < TAMANHO_DE_CORTE - 3) return false;
  const tc = curto.split(' ');
  const tl = longo.split(' ');
  if (tc.length > tl.length) return false;
  for (let i = 0; i < tc.length - 1; i++) if (tc[i] !== tl[i]) return false;
  const ultimo = tc[tc.length - 1];
  return tl[tc.length - 1] === ultimo || (curto.length >= TAMANHO_DE_CORTE && tl[tc.length - 1].startsWith(ultimo));
}

/** null = não têm relação suficiente nem pra serem candidatos. */
export function compararProdutos(a: DescricaoProduto, b: DescricaoProduto): ResultadoComparacao | null {
  if (a.normalizado === b.normalizado) return { criterio: 'NOME_IGUAL', pontuacao: 1, conflitos: [] };
  if (nomeCortado(a.normalizado, b.normalizado)) return { criterio: 'NOME_CORTADO', pontuacao: 0.95, conflitos: [] };

  // Candidato: mesmo nome-base (primeira palavra) — "REPOFLOR", "BESILAPIN"…
  const baseA = a.palavras[0];
  const baseB = b.palavras[0];
  if (!baseA || !baseB) return null;
  const mesmaBase = baseA === baseB || (Math.min(baseA.length, baseB.length) >= 5 && (baseA.startsWith(baseB) || baseB.startsWith(baseA)));
  if (!mesmaBase) return null;

  const pontuacao = 0.5 * jaccard(a.palavras, b.palavras) + 0.5 * jaccard(a.atributos, b.atributos);
  if (pontuacao < 0.4) return null;
  return { criterio: 'CANDIDATO', pontuacao, conflitos: conflitosDeApresentacao(a, b) };
}
