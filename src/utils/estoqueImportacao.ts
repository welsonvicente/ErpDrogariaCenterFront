import * as XLSX from 'xlsx';
import type { LinhaImportacao } from '../types/estoque';
import { parseValorBr } from './money';

export type CampoImportacao =
  | 'codigoTrier'
  | 'codigoBarras'
  | 'produto'
  | 'laboratorio'
  | 'grupo'
  | 'fornecedor'
  | 'estoqueMinimo'
  | 'demanda'
  | 'saldo'
  | 'custoUnitario'
  | 'valorTotal'
  | 'dataUltimaEntrada'
  | 'qtdUltimaCompra'
  | 'precoUltimaCompra';

export interface DefinicaoCampo {
  campo: CampoImportacao;
  rotulo: string;
  tipo: 'texto' | 'numero' | 'data';
  /** Sem estes dois a importação não tem como identificar nem mostrar o produto. */
  obrigatorio?: boolean;
}

export const CAMPOS_IMPORTACAO: DefinicaoCampo[] = [
  { campo: 'codigoTrier', rotulo: 'Código (reduzido Trier)', tipo: 'texto', obrigatorio: true },
  { campo: 'produto', rotulo: 'Produto', tipo: 'texto', obrigatorio: true },
  { campo: 'codigoBarras', rotulo: 'Código de barras', tipo: 'texto' },
  { campo: 'laboratorio', rotulo: 'Laboratório', tipo: 'texto' },
  { campo: 'grupo', rotulo: 'Grupo de produtos', tipo: 'texto' },
  { campo: 'fornecedor', rotulo: 'Fornecedor', tipo: 'texto' },
  { campo: 'estoqueMinimo', rotulo: 'Estoque mínimo', tipo: 'numero' },
  { campo: 'demanda', rotulo: 'Quantidade de demanda', tipo: 'numero' },
  { campo: 'saldo', rotulo: 'Saldo em estoque', tipo: 'numero' },
  { campo: 'custoUnitario', rotulo: 'Custo unitário', tipo: 'numero' },
  { campo: 'valorTotal', rotulo: 'Valor total em estoque', tipo: 'numero' },
  { campo: 'dataUltimaEntrada', rotulo: 'Data da última compra/entrada', tipo: 'data' },
  { campo: 'qtdUltimaCompra', rotulo: 'Quantidade da última compra', tipo: 'numero' },
  { campo: 'precoUltimaCompra', rotulo: 'Preço da última compra', tipo: 'numero' },
];

export type Celula = string | number | boolean | Date | null | undefined;
export type Mapeamento = Record<CampoImportacao, number | null>;

export function mapeamentoVazio(): Mapeamento {
  return Object.fromEntries(CAMPOS_IMPORTACAO.map((c) => [c.campo, null])) as Mapeamento;
}

/** Cabeçalho comparável: sem acento, minúsculo, pontuação vira espaço. */
export function normalizarCabecalho(texto: Celula): string {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Como cada campo costuma aparecer no cabeçalho de um relatório do Trier. A
 * ordem importa: campos mais específicos primeiro ("preço da última compra"
 * antes de "custo", "código de barras" antes de "código"), porque cada coluna
 * só pode ser de um campo.
 */
const PADROES: Array<[CampoImportacao, RegExp]> = [
  ['codigoBarras', /barra|\bean\b|gtin|cod ?bar/],
  ['dataUltimaEntrada', /(data|dt)\b.*(ult|ultim).*(compra|entrada)|(ult|ultim)\w* (compra|entrada)$|dt ?ult/],
  ['qtdUltimaCompra', /(qtd|qtde|quant|quantidade).*(ult|ultim).*(compra|entrada)|(ult|ultim).*(qtd|qtde|quant)/],
  ['precoUltimaCompra', /(preco|valor|vl|custo|pcusto).*(ult|ultim).*(compra|entrada)|(ult|ultim).*(preco|vl|valor|custo)/],
  ['grupo', /grupo|categoria|classe|familia|departamento|secao/],
  ['laboratorio', /laboratorio|\blab\b|fabricante|industria|marca/],
  ['fornecedor', /fornecedor|distribuidor/],
  ['estoqueMinimo', /(estoque|est|qtd|qtde)\b.*\bmin|\bmin(imo)?\b/],
  ['demanda', /demanda|\bdem\b|giro|media (de )?venda/],
  ['valorTotal', /^total$|valor total|vl total|total em estoque|valor em estoque|custo total|total custo|valor estoque|total estoque/],
  ['custoUnitario', /custo|pcusto|preco de custo|vl custo|valor custo/],
  ['saldo', /saldo|estoque atual|qtd estoque|qtde estoque|quantidade em estoque|quantidade estoque|^estoque$|^quantidade$|^qtd$|^qtde$/],
  ['codigoTrier', /^(cod|codigo|cd)( (reduzido|red|trier|produto|interno|item|prod))?$|reduzido|^cod red|^codigo$/],
  ['produto', /^(produto|descricao|descricao do produto|nome|nome do produto|item|descr)$|^descricao|^produto/],
];

/**
 * O relatório do Trier agrupa as colunas da última compra sob um título só
 * ("|---- Dados Última Compra ----|"), com as quatro colunas seguintes sem
 * título próprio na linha do cabeçalho (os rótulos "Data / Qtd. Últ. Ent. /
 * Valor Unit. / Fornecedor" ficam numa linha no fim da planilha). A ordem fixa
 * do relatório é a mesma da lista abaixo.
 */
const COLUNAS_DO_GRUPO_ULTIMA_COMPRA: CampoImportacao[] = ['dataUltimaEntrada', 'qtdUltimaCompra', 'precoUltimaCompra', 'fornecedor'];
const RE_TITULO_ULTIMA_COMPRA = /dados.*(ult|ultim).*(compra|entrada)/;

/** Para cada campo, o índice da coluna do cabeçalho que parece ser ele (ou null). Cada coluna é usada uma vez só. */
export function detectarMapeamento(cabecalhos: Celula[]): Mapeamento {
  const mapa = mapeamentoVazio();
  const normalizados = cabecalhos.map(normalizarCabecalho);
  const usadas = new Set<number>();

  for (const [campo, regex] of PADROES) {
    const indice = normalizados.findIndex((h, i) => h !== '' && !usadas.has(i) && regex.test(h));
    if (indice >= 0) {
      mapa[campo] = indice;
      usadas.add(indice);
    }
  }

  const inicioGrupo = normalizados.findIndex((h) => RE_TITULO_ULTIMA_COMPRA.test(h));
  if (inicioGrupo >= 0) {
    COLUNAS_DO_GRUPO_ULTIMA_COMPRA.forEach((campo, i) => {
      const coluna = inicioGrupo + i;
      // Só preenche coluna realmente sem título (as com título já passaram pela regra normal) e campo ainda livre.
      const semTitulo = i === 0 || (normalizados[coluna] === '' && !usadas.has(coluna));
      if (semTitulo && (mapa[campo] === null || (i === 0 && mapa[campo] === coluna))) {
        mapa[campo] = coluna;
        usadas.add(coluna);
      }
    });
  }
  return mapa;
}

function contarMapeados(m: Mapeamento): number {
  return Object.values(m).filter((v) => v !== null).length;
}

/**
 * Relatórios exportados costumam ter título, filtros e data acima da tabela.
 * Procura, nas primeiras linhas, aquela que parece o cabeçalho: a que reconhece
 * mais colunas (e tem pelo menos produto). Devolve -1 se nenhuma serve.
 */
export function detectarLinhaCabecalho(linhas: Celula[][], limite = 40): number {
  let melhor = -1;
  let melhorContagem = 1; // exige pelo menos 2 colunas reconhecidas
  linhas.slice(0, limite).forEach((linha, i) => {
    const mapa = detectarMapeamento(linha);
    if (mapa.produto === null) return;
    const contagem = contarMapeados(mapa);
    if (contagem > melhorContagem) {
      melhor = i;
      melhorContagem = contagem;
    }
  });
  return melhor;
}

// ------------------------------------------------------------ conversão de células

function celulaVazia(c: Celula): boolean {
  return c === null || c === undefined || (typeof c === 'string' && c.trim() === '');
}

export function converterTexto(c: Celula): string | null {
  if (celulaVazia(c)) return null;
  if (c instanceof Date) return null;
  return String(c).replace(/\s+/g, ' ').trim() || null;
}

/** `invalido` = tinha algo escrito, mas não deu pra ler como número. */
export function converterNumero(c: Celula): { valor: number | null; invalido: boolean } {
  if (celulaVazia(c)) return { valor: null, invalido: false };
  if (typeof c === 'number') return Number.isFinite(c) ? { valor: c, invalido: false } : { valor: null, invalido: true };
  const limpo = String(c).replace(/R\$|\s| /g, '');
  const n = parseValorBr(limpo);
  return Number.isFinite(n) ? { valor: n, invalido: false } : { valor: null, invalido: true };
}

function dataValida(a: number, m: number, d: number): string | null {
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null;
  return `${String(a).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Aceita número serial do Excel, DD/MM/AAAA (ou DD/MM/AA), AAAA-MM-DD e Date. */
export function converterData(c: Celula): { valor: string | null; invalido: boolean } {
  if (celulaVazia(c)) return { valor: null, invalido: false };

  if (c instanceof Date) {
    const iso = dataValida(c.getFullYear(), c.getMonth() + 1, c.getDate());
    return { valor: iso, invalido: iso === null };
  }

  if (typeof c === 'number') {
    // Serial do Excel (dias desde 30/12/1899). Faixa sensata: 1954 a 2119.
    if (c >= 20000 && c <= 80000) {
      const data = new Date(Date.UTC(1899, 11, 30) + Math.floor(c) * 86_400_000);
      return { valor: dataValida(data.getUTCFullYear(), data.getUTCMonth() + 1, data.getUTCDate()), invalido: false };
    }
    return { valor: null, invalido: true };
  }

  const texto = String(c).trim();
  const br = texto.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})(?:\D.*)?$/);
  if (br) {
    const ano = br[3].length === 2 ? 2000 + Number(br[3]) : Number(br[3]);
    const iso = dataValida(ano, Number(br[2]), Number(br[1]));
    return { valor: iso, invalido: iso === null };
  }
  const isoMatch = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const iso = dataValida(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return { valor: iso, invalido: iso === null };
  }
  return { valor: null, invalido: true };
}

// ------------------------------------------------------------------- extração

export interface ProblemaImportacao {
  /** Número da linha na planilha (como o Excel mostra). */
  linha: number;
  nivel: 'erro' | 'aviso' | 'info';
  mensagem: string;
}

/** O que a própria planilha diz que é o total — serve pra conferir se a soma das linhas importadas bate. */
export interface TotalDoRelatorio {
  saldo: number | null;
  valorTotal: number | null;
}

export interface ResultadoLeitura {
  linhas: LinhaImportacao[];
  /** Linha "Total Geral" do relatório, quando existe. */
  totalDoRelatorio: TotalDoRelatorio | null;
  /** Linhas com algum conteúdo depois do cabeçalho. */
  totalLidas: number;
  vazias: number;
  /** Linhas que não entraram (sem código/produto, totais, repetidas). */
  ignoradas: number;
  problemas: ProblemaImportacao[];
}

const RE_LINHA_DE_TOTAL = /^(sub ?)?(total|totais)( geral)?\b/i;

export function extrairLinhas(linhas: Celula[][], indiceCabecalho: number, mapa: Mapeamento): ResultadoLeitura {
  const resultado: ResultadoLeitura = { linhas: [], totalDoRelatorio: null, totalLidas: 0, vazias: 0, ignoradas: 0, problemas: [] };
  const porCodigo = new Map<string, { posicao: number; linha: number }>();
  const rotulo = (campo: CampoImportacao) => CAMPOS_IMPORTACAO.find((c) => c.campo === campo)!.rotulo;
  const celula = (linha: Celula[], campo: CampoImportacao): Celula => (mapa[campo] === null ? null : linha[mapa[campo] as number]);

  for (let i = indiceCabecalho + 1; i < linhas.length; i++) {
    const bruta = linhas[i] ?? [];
    const numeroLinha = i + 1;

    if (bruta.every(celulaVazia)) {
      resultado.vazias += 1;
      continue;
    }
    resultado.totalLidas += 1;

    const codigoTrier = converterTexto(celula(bruta, 'codigoTrier'));
    const produto = converterTexto(celula(bruta, 'produto'));

    // "Total Geral:" pode vir na coluna do código (relatório do Trier) ou na do produto.
    const ehTotal = (!!codigoTrier && RE_LINHA_DE_TOTAL.test(codigoTrier)) || (!codigoTrier && !!produto && RE_LINHA_DE_TOTAL.test(produto));
    if (ehTotal) {
      resultado.ignoradas += 1;
      resultado.totalDoRelatorio = { saldo: converterNumero(celula(bruta, 'saldo')).valor, valorTotal: converterNumero(celula(bruta, 'valorTotal')).valor };
      resultado.problemas.push({ linha: numeroLinha, nivel: 'info', mensagem: 'Linha de total do relatório (usada só para conferência).' });
      continue;
    }
    // Linha só de texto, sem código nem produto, e sem nenhum número: rótulos de coluna / rodapé, não um produto com defeito.
    if (!codigoTrier && !produto && !bruta.some((c) => typeof c === 'number')) {
      resultado.ignoradas += 1;
      resultado.problemas.push({ linha: numeroLinha, nivel: 'info', mensagem: 'Linha de títulos ou rodapé ignorada.' });
      continue;
    }
    if (!codigoTrier) {
      resultado.ignoradas += 1;
      resultado.problemas.push({ linha: numeroLinha, nivel: 'erro', mensagem: `Sem ${rotulo('codigoTrier')} — linha ignorada.` });
      continue;
    }
    if (!produto) {
      resultado.ignoradas += 1;
      resultado.problemas.push({ linha: numeroLinha, nivel: 'erro', mensagem: `Código ${codigoTrier} sem nome do produto — linha ignorada.` });
      continue;
    }

    const lerNumero = (campo: CampoImportacao): number | null => {
      const { valor, invalido } = converterNumero(celula(bruta, campo));
      if (invalido) resultado.problemas.push({ linha: numeroLinha, nivel: 'aviso', mensagem: `${rotulo(campo)} ilegível em ${codigoTrier} — tratado como não informado.` });
      return valor;
    };
    const data = converterData(celula(bruta, 'dataUltimaEntrada'));
    if (data.invalido) {
      resultado.problemas.push({ linha: numeroLinha, nivel: 'aviso', mensagem: `${rotulo('dataUltimaEntrada')} ilegível em ${codigoTrier} — tratada como não informada.` });
    }

    const saldo = lerNumero('saldo');
    const custoUnitario = lerNumero('custoUnitario');
    if (saldo !== null && saldo < 0) resultado.problemas.push({ linha: numeroLinha, nivel: 'aviso', mensagem: `Saldo negativo em ${codigoTrier}.` });
    if (custoUnitario !== null && custoUnitario < 0) resultado.problemas.push({ linha: numeroLinha, nivel: 'aviso', mensagem: `Custo negativo em ${codigoTrier}.` });

    const nova: LinhaImportacao = {
      codigoTrier,
      codigoBarras: converterTexto(celula(bruta, 'codigoBarras')),
      produto,
      laboratorio: converterTexto(celula(bruta, 'laboratorio')),
      grupo: converterTexto(celula(bruta, 'grupo')),
      fornecedor: converterTexto(celula(bruta, 'fornecedor')),
      estoqueMinimo: lerNumero('estoqueMinimo'),
      demanda: lerNumero('demanda'),
      saldo,
      custoUnitario,
      valorTotal: lerNumero('valorTotal'),
      dataUltimaEntrada: data.valor,
      qtdUltimaCompra: lerNumero('qtdUltimaCompra'),
      precoUltimaCompra: lerNumero('precoUltimaCompra'),
    };

    const anterior = porCodigo.get(codigoTrier);
    if (anterior) {
      // A última ocorrência vence (é o que o servidor também faz) — a anterior sai da lista.
      resultado.linhas[anterior.posicao] = nova;
      resultado.ignoradas += 1;
      resultado.problemas.push({ linha: anterior.linha, nivel: 'aviso', mensagem: `Código ${codigoTrier} repetido — mantida a ocorrência da linha ${numeroLinha}.` });
      porCodigo.set(codigoTrier, { posicao: anterior.posicao, linha: numeroLinha });
    } else {
      porCodigo.set(codigoTrier, { posicao: resultado.linhas.length, linha: numeroLinha });
      resultado.linhas.push(nova);
    }
  }

  return resultado;
}

// ------------------------------------------------------------------ arquivo

export interface AbaPlanilha {
  nome: string;
  linhas: Celula[][];
}

const TAMANHO_MAXIMO_ARQUIVO = 25 * 1024 * 1024;

/** Lê um .xls/.xlsx inteiro no navegador. Lança `Error` com mensagem em português pra tela mostrar. */
export async function lerPlanilha(arquivo: File): Promise<AbaPlanilha[]> {
  if (!/\.xlsx?$/i.test(arquivo.name)) {
    throw new Error('Formato não suportado. Envie o relatório do Trier em Excel (.xlsx ou .xls).');
  }
  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    throw new Error('O arquivo é maior que 25 MB. Exporte o relatório do Trier sem imagens e tente de novo.');
  }
  if (arquivo.size === 0) {
    throw new Error('O arquivo está vazio.');
  }

  try {
    const workbook = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
    const abas = workbook.SheetNames.map((nome) => ({
      nome,
      linhas: XLSX.utils.sheet_to_json<Celula[]>(workbook.Sheets[nome], { header: 1, raw: true, defval: null, blankrows: true }),
    })).filter((aba) => aba.linhas.some((l) => l.some((c) => !celulaVazia(c))));
    if (!abas.length) throw new Error('vazio');
    return abas;
  } catch (erro) {
    if (erro instanceof Error && erro.message === 'vazio') throw new Error('Não encontrei nenhum dado nesse arquivo.');
    throw new Error('Não foi possível ler esse arquivo. Confirme que é uma planilha Excel (.xlsx ou .xls) válida e não está protegida por senha.');
  }
}

/** Limite do arquivo original que o servidor aceita guardar (o resto da importação funciona igual sem ele). */
export const LIMITE_ARQUIVO_GUARDADO_BYTES = 5 * 1024 * 1024;

/** Conteúdo do arquivo em base64 puro (sem o prefixo "data:..."), pra ir no corpo JSON da importação. */
export function arquivoParaBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result).split(',')[1] ?? '');
    leitor.onerror = () => reject(leitor.error);
    leitor.readAsDataURL(arquivo);
  });
}

// -------------------------------------------------------------- demonstração

export const NOME_ARQUIVO_DEMONSTRACAO = 'DEMONSTRAÇÃO (dados fictícios)';

/** Pseudo-aleatório determinístico: a demonstração sai igual a cada clique (e os testes são estáveis). */
function gerador(semente: number) {
  let s = semente;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/**
 * Dados de exemplo para conhecer o sistema — todos com "[DEMO]" no nome e
 * fornecedores/laboratórios fictícios, pra nunca serem confundidos com o
 * relatório real. Algumas linhas saem de propósito sem custo, fornecedor ou
 * data, pra mostrar como "não informado" aparece.
 */
export function gerarLinhasDemonstracao(hoje: Date = new Date()): LinhaImportacao[] {
  const aleatorio = gerador(20260101);
  const itens: Array<{ nome: string; grupo: string; lab: string; custo: number }> = [
    { nome: 'SHAMPOO ANTICASPA 400ML', grupo: 'PERFUMARIA', lab: 'LAB DEMO BELEZA', custo: 14.9 },
    { nome: 'CONDICIONADOR HIDRATANTE 300ML', grupo: 'PERFUMARIA', lab: 'LAB DEMO BELEZA', custo: 11.2 },
    { nome: 'CREME HIDRATANTE CORPORAL 200G', grupo: 'DERMOCOSMETICOS', lab: 'LAB DEMO PELE', custo: 18.5 },
    { nome: 'PROTETOR SOLAR FPS 50 120ML', grupo: 'DERMOCOSMETICOS', lab: 'LAB DEMO PELE', custo: 32.4 },
    { nome: 'DESODORANTE ROLL-ON 50ML', grupo: 'PERFUMARIA', lab: 'LAB DEMO BELEZA', custo: 6.8 },
    { nome: 'SABONETE LIQUIDO INFANTIL 250ML', grupo: 'INFANTIL', lab: 'LAB DEMO KIDS', custo: 9.7 },
    { nome: 'FRALDA DESCARTAVEL M 40UN', grupo: 'INFANTIL', lab: 'LAB DEMO KIDS', custo: 39.9 },
    { nome: 'LENCO UMEDECIDO BEBE 100UN', grupo: 'INFANTIL', lab: 'LAB DEMO KIDS', custo: 8.4 },
    { nome: 'VITAMINA C 1G 30 COMPRIMIDOS', grupo: 'VITAMINAS E SUPLEMENTOS', lab: 'LAB DEMO VITA', custo: 21.3 },
    { nome: 'OMEGA 3 1000MG 60 CAPSULAS', grupo: 'VITAMINAS E SUPLEMENTOS', lab: 'LAB DEMO VITA', custo: 44.0 },
    { nome: 'COLAGENO HIDROLISADO 300G', grupo: 'VITAMINAS E SUPLEMENTOS', lab: 'LAB DEMO VITA', custo: 38.6 },
    { nome: 'ANALGESICO 500MG 20 COMPRIMIDOS', grupo: 'MEDICAMENTOS GENERICOS', lab: 'LAB DEMO FARMA', custo: 3.1 },
    { nome: 'ANTIALERGICO 10MG 12 COMPRIMIDOS', grupo: 'MEDICAMENTOS SIMILARES', lab: 'LAB DEMO FARMA', custo: 7.9 },
    { nome: 'XAROPE EXPECTORANTE 120ML', grupo: 'MEDICAMENTOS ISENTOS DE PRESCRICAO', lab: 'LAB DEMO FARMA', custo: 12.6 },
    { nome: 'ANTIBIOTICO 500MG 21 COMPRIMIDOS', grupo: 'MEDICAMENTOS ETICOS', lab: 'LAB DEMO FARMA', custo: 24.8 },
    { nome: 'ANTIACIDO MASTIGAVEL 24 COMPRIMIDOS', grupo: 'MEDICAMENTOS ISENTOS DE PRESCRICAO', lab: 'LAB DEMO FARMA', custo: 5.4 },
    { nome: 'ESCOVA DENTAL MACIA', grupo: 'HIGIENE BUCAL', lab: 'LAB DEMO ORAL', custo: 4.2 },
    { nome: 'ENXAGUANTE BUCAL 500ML', grupo: 'HIGIENE BUCAL', lab: 'LAB DEMO ORAL', custo: 10.9 },
    { nome: 'TERMOMETRO DIGITAL', grupo: 'CONVENIENCIA', lab: 'LAB DEMO ACESSORIOS', custo: 15.5 },
    { nome: 'ABSORVENTE NOTURNO 8UN', grupo: 'PERFUMARIA', lab: 'LAB DEMO BELEZA', custo: 5.9 },
  ];
  const fornecedores = ['DISTRIBUIDORA DEMO ALFA', 'DISTRIBUIDORA DEMO BETA', 'DISTRIBUIDORA DEMO GAMA'];

  const linhas: LinhaImportacao[] = [];
  const nVariacoes = 4;
  itens.forEach((item, idx) => {
    for (let v = 0; v < nVariacoes; v++) {
      const sequencia = idx * nVariacoes + v + 1;
      const saldo = Math.max(1, Math.round(1 + aleatorio() ** 2 * 70));
      const custo = Math.round(item.custo * (0.85 + aleatorio() * 0.4) * 100) / 100;
      const diasAtras = Math.round(30 + aleatorio() * 600);
      const entrada = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - diasAtras);
      const iso = `${entrada.getFullYear()}-${String(entrada.getMonth() + 1).padStart(2, '0')}-${String(entrada.getDate()).padStart(2, '0')}`;
      const qtdCompra = Math.round(saldo * (1 + aleatorio() * 2));

      linhas.push({
        codigoTrier: String(900000 + sequencia),
        codigoBarras: sequencia % 5 === 0 ? null : `78999${String(100000 + sequencia * 37).slice(-6)}0`,
        produto: `[DEMO] ${item.nome}${v ? ` - VARIACAO ${v + 1}` : ''}`,
        laboratorio: item.lab,
        grupo: item.grupo,
        fornecedor: sequencia % 11 === 0 ? null : fornecedores[sequencia % fornecedores.length],
        estoqueMinimo: Math.max(1, Math.round(saldo / 6)),
        demanda: Math.round(aleatorio() * 4 * 10) / 10,
        saldo,
        custoUnitario: sequencia % 13 === 0 ? null : custo,
        valorTotal: null,
        dataUltimaEntrada: sequencia % 17 === 0 ? null : iso,
        qtdUltimaCompra: qtdCompra,
        precoUltimaCompra: custo,
      });
    }
  });
  return linhas;
}
