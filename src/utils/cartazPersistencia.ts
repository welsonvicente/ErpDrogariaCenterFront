import type { TransformImagem } from './cartazEngine';

/**
 * Persistência local (por navegador/aparelho) do gerador de Story — três
 * coisas guardadas separadamente, portadas de `public/tools/cartazes.html`
 * com o mesmo particionamento que já existia lá:
 *
 *  - **Produtos recentes**: histórico curto pra reaproveitar foto/nome/preço
 *    num clique quando a mesma oferta se repete (comum em promoção semanal).
 *    Reaproveita a MESMA chave de armazenamento que a versão HTML completa
 *    já usa (`/cartazes/completo`) — é o mesmo formato de dado, então um
 *    produto usado numa tela aparece na outra.
 *  - **Configurações**: cores, tamanhos, margens, frases e posição das
 *    faixas — persistem entre sessões pra não ter que reconfigurar tudo toda
 *    vez que a ferramenta é reaberta. Chave própria desta tela (o formato não
 *    é o mesmo da versão HTML, que guarda por id de elemento DOM).
 *  - **Rascunho**: o produto em andamento (imagem, nome, preço) — recuperado
 *    se a aba fechar ou travar no meio de um lançamento. Diferente das
 *    configurações, é específico do produto, não uma preferência permanente.
 */

const CHAVE_PRODUTOS_RECENTES = 'cartazes_recent_products_v1';
const MAXIMO_PRODUTOS_RECENTES = 20;

export interface ProdutoRecente {
  imgSrc: string;
  name: string;
  de: string;
  por: string;
  usedAt: number;
}

export function carregarProdutosRecentes(): ProdutoRecente[] {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_PRODUTOS_RECENTES) || '[]');
  } catch {
    return [];
  }
}

export function salvarProdutoRecente(produto: { imgSrc: string; name: string; de: string; por: string }) {
  if (!produto.imgSrc || !produto.name.trim()) return;
  let lista = carregarProdutosRecentes();
  const chave = produto.name.trim().toLowerCase();
  lista = lista.filter((p) => (p.name || '').trim().toLowerCase() !== chave);
  lista.unshift({ ...produto, usedAt: Date.now() });
  lista = lista.slice(0, MAXIMO_PRODUTOS_RECENTES);
  try {
    localStorage.setItem(CHAVE_PRODUTOS_RECENTES, JSON.stringify(lista));
  } catch {
    // provavelmente sem espaço — tenta uma lista mais curta antes de desistir
    try {
      localStorage.setItem(CHAVE_PRODUTOS_RECENTES, JSON.stringify(lista.slice(0, 8)));
    } catch {
      /* sem espaço nem pra isso — só não guarda dessa vez */
    }
  }
}

// ---------------------------------------------------------------------------

const CHAVE_CONFIGURACOES = 'cartazes_story_settings_v1';

export interface ConfiguracoesStory {
  corLogo: string;
  corTextoNome: string;
  corPreco: string;
  tamanhoNome: number;
  tamanhoPreco: number;
  margemNome: number;
  margemPreco: number;
  frasesAtivo: boolean;
  frases: string;
  corFundoFrases: string;
  corTextoFrases: string;
  tamanhoFrases: number;
  margemFrases: number;
  guiaNome: { y: number; offsetX: number };
  guiaPreco: { y: number; offsetX: number };
  guiaFrases: { y: number; offsetX: number };
}

export function carregarConfiguracoes(): Partial<ConfiguracoesStory> | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CONFIGURACOES) || 'null');
  } catch {
    return null;
  }
}

export function salvarConfiguracoes(config: ConfiguracoesStory) {
  try {
    localStorage.setItem(CHAVE_CONFIGURACOES, JSON.stringify(config));
  } catch {
    /* armazenamento indisponível/cheio — a próxima sessão só volta ao padrão */
  }
}

// ---------------------------------------------------------------------------

const CHAVE_RASCUNHO = 'cartazes_story_draft_v1';

export interface RascunhoStory {
  savedAt: number;
  imgSrc: string | null;
  transform: TransformImagem;
  nome: string;
  de: string;
  por: string;
}

export function carregarRascunho(): RascunhoStory | null {
  try {
    const raw = localStorage.getItem(CHAVE_RASCUNHO);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function salvarRascunho(rascunho: Omit<RascunhoStory, 'savedAt'>) {
  const temAlgo = rascunho.imgSrc || rascunho.nome || rascunho.de || rascunho.por;
  try {
    if (temAlgo) {
      localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ ...rascunho, savedAt: Date.now() }));
    } else {
      localStorage.removeItem(CHAVE_RASCUNHO);
    }
  } catch {
    /* armazenamento indisponível/cheio — sem rascunho desta vez, sem quebrar nada */
  }
}

export function limparRascunho() {
  try {
    localStorage.removeItem(CHAVE_RASCUNHO);
  } catch {
    /* nada a limpar */
  }
}

// ---------------------------------------------------------------------------
// Panfleto (vários produtos por página) — mesma separação settings/rascunho
// do Story acima, em chaves próprias.

const CHAVE_CONFIGURACOES_PANFLETO = 'cartazes_flyer_settings_v1';

export interface ConfiguracoesPanfleto {
  nomeLoja: string;
  nomeLojaAlinhamento: 'left' | 'center' | 'right';
  titulo: string;
  tituloAlinhamento: 'left' | 'center' | 'right';
  mostrarTextosCabecalho: boolean;
  mostrarTextosRodape: boolean;
  textoRodape1: string;
  textoRodape1Alinhamento: 'left' | 'center' | 'right';
  textoRodape2: string;
  textoRodape2Alinhamento: 'left' | 'center' | 'right';
  qrAlinhamento: 'left' | 'right';
  link: string;
  itensPorPagina: number;
  corLogo: string;
  corDescricao: string;
  corPreco: string;
  corFundoCard: string;
  tamanhoNome: number;
  tamanhoPreco: number;
  tamanhoBorda: number;
  tamanhoSelo: number;
  manterFaixaBranca: boolean;
}

export function carregarConfiguracoesPanfleto(): Partial<ConfiguracoesPanfleto> | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CONFIGURACOES_PANFLETO) || 'null');
  } catch {
    return null;
  }
}

export function salvarConfiguracoesPanfleto(config: ConfiguracoesPanfleto) {
  try {
    localStorage.setItem(CHAVE_CONFIGURACOES_PANFLETO, JSON.stringify(config));
  } catch {
    /* armazenamento indisponível/cheio — a próxima sessão só volta ao padrão */
  }
}

const CHAVE_RASCUNHO_PANFLETO = 'cartazes_flyer_draft_v1';

export interface ProdutoPanfletoRascunho {
  imgSrc: string;
  nome: string;
  de: string;
  por: string;
  transform: TransformImagem;
}

export interface RascunhoPanfleto {
  savedAt: number;
  produtos: ProdutoPanfletoRascunho[];
}

export function carregarRascunhoPanfleto(): RascunhoPanfleto | null {
  try {
    const raw = localStorage.getItem(CHAVE_RASCUNHO_PANFLETO);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function salvarRascunhoPanfleto(produtos: ProdutoPanfletoRascunho[]) {
  try {
    if (produtos.length) {
      localStorage.setItem(CHAVE_RASCUNHO_PANFLETO, JSON.stringify({ produtos, savedAt: Date.now() }));
    } else {
      localStorage.removeItem(CHAVE_RASCUNHO_PANFLETO);
    }
  } catch {
    /* armazenamento indisponível/cheio (comum com várias fotos) — sem rascunho desta vez, sem quebrar nada */
  }
}

export function limparRascunhoPanfleto() {
  try {
    localStorage.removeItem(CHAVE_RASCUNHO_PANFLETO);
  } catch {
    /* nada a limpar */
  }
}

// ---------------------------------------------------------------------------
// Importar planilha — só as 3 cores dos stories gerados em lote são
// "preferência permanente" (mesmo padrão da versão HTML). A lista de produtos
// importados não é persistida entre sessões: pode vir de uma planilha grande,
// e reimportar é mais simples do que arriscar lotar o localStorage.

const CHAVE_CONFIGURACOES_LOTE = 'cartazes_batch_settings_v1';

export interface ConfiguracoesLote {
  corLogo: string;
  corTextoNome: string;
  corPreco: string;
}

export function carregarConfiguracoesLote(): Partial<ConfiguracoesLote> | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CONFIGURACOES_LOTE) || 'null');
  } catch {
    return null;
  }
}

export function salvarConfiguracoesLote(config: ConfiguracoesLote) {
  try {
    localStorage.setItem(CHAVE_CONFIGURACOES_LOTE, JSON.stringify(config));
  } catch {
    /* armazenamento indisponível/cheio — a próxima sessão só volta ao padrão */
  }
}

export function carregarImagemDeDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
