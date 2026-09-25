import type { StatusImagemProduto } from './batchEngine';
import type { TransformImagem } from './cartazEngine';
import type { AjustesStoryProduto } from './panfletoEngine';

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
  guiaNome: { y: number; offsetX: number; x?: number; largura?: number };
  guiaPreco: { y: number; offsetX: number; x?: number; largura?: number };
  guiaFrases: { y: number; offsetX: number; x?: number; largura?: number };
}

export function carregarConfiguracoes(): Partial<ConfiguracoesStory> | null {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CONFIGURACOES) || 'null');
  } catch {
    return null;
  }
}

/**
 * Monta as faixas-guia (nome/preço/frases) pra sobrepor no vídeo da câmera,
 * usadas fora do modo Story (Panfleto, Importar planilha) — que não têm o
 * estado ao vivo das faixas, só o que já foi persistido da última vez que a
 * pessoa mexeu no Story. `nome`/`preço` não têm uma flag "ativo" persistida
 * (só `frasesAtivo` é salvo) — ficam sempre visíveis, no padrão do Story.
 */
export function montarGuiasCameraDoStory() {
  const config = carregarConfiguracoes() || {};
  return [
    {
      y: config.guiaNome?.y ?? 130,
      offsetX: config.guiaNome?.offsetX ?? 0,
      margem: config.margemNome ?? 60,
      visivel: true,
      corClasse: 'faixa-arrasto--nome',
      rotulo: 'NOME DO PRODUTO',
    },
    {
      y: config.guiaPreco?.y ?? 320,
      offsetX: config.guiaPreco?.offsetX ?? 0,
      margem: config.margemPreco ?? 60,
      visivel: true,
      corClasse: 'faixa-arrasto--preco',
      rotulo: 'R$ PREÇO',
    },
    {
      y: config.guiaFrases?.y ?? 560,
      offsetX: config.guiaFrases?.offsetX ?? 0,
      margem: config.margemFrases ?? 60,
      visivel: Boolean(config.frasesAtivo),
      corClasse: 'faixa-arrasto--frases',
      rotulo: 'FRASES',
    },
  ];
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
  imagemExtraSrc?: string | null;
  imagemExtraCaixa?: { x: number; y: number; largura: number; altura: number; larguraMinima: number; alturaMinima: number } | null;
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
  ajustesStory?: AjustesStoryProduto;
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

export type ResultadoSalvarRascunho = 'completo' | 'sem-fotos' | 'falhou';

/**
 * Salva o rascunho (produtos em andamento) — se o navegador não tiver espaço
 * pras fotos (localStorage costuma ter só uns 5-10MB por site, e fotos de
 * câmera em quantidade estouram isso fácil), tenta de novo SEM as fotos em
 * vez de desistir: perder a posição/nome/preço de tudo é bem pior do que só
 * precisar tirar as fotos de novo. Devolve o que realmente conseguiu salvar,
 * pra quem chamou avisar a pessoa em vez de deixá-la achando que está tudo
 * protegido quando não está.
 */
export function salvarRascunhoPanfleto(produtos: ProdutoPanfletoRascunho[]): ResultadoSalvarRascunho {
  if (!produtos.length) {
    try {
      localStorage.removeItem(CHAVE_RASCUNHO_PANFLETO);
    } catch {
      /* nada a limpar */
    }
    return 'completo';
  }
  try {
    localStorage.setItem(CHAVE_RASCUNHO_PANFLETO, JSON.stringify({ produtos, savedAt: Date.now() }));
    return 'completo';
  } catch {
    try {
      const semFotos = produtos.map((p) => ({ ...p, imgSrc: '' }));
      localStorage.setItem(CHAVE_RASCUNHO_PANFLETO, JSON.stringify({ produtos: semFotos, savedAt: Date.now() }));
      return 'sem-fotos';
    } catch {
      return 'falhou';
    }
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
// Importar planilha — as 3 cores dos stories gerados em lote são "preferência
// permanente" (mesmo padrão da versão HTML). Os produtos importados (com
// fotos manuais/tiradas na hora, já que a planilha em si não traz foto) têm
// rascunho igual ao do Panfleto — perder um lote de fotos tiradas uma a uma
// no celular é tão ruim quanto perder o painel do Panfleto.

const CHAVE_RASCUNHO_LOTE = 'cartazes_batch_draft_v1';

export interface ProdutoLoteRascunho {
  descricao: string;
  normal: number | null;
  promo: number | null;
  ean: string | null;
  imgSrc: string;
  status: StatusImagemProduto;
  transform: TransformImagem;
}

export interface RascunhoLote {
  savedAt: number;
  produtos: ProdutoLoteRascunho[];
}

export function carregarRascunhoLote(): RascunhoLote | null {
  try {
    const raw = localStorage.getItem(CHAVE_RASCUNHO_LOTE);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Mesma estratégia de `salvarRascunhoPanfleto`: sem espaço pras fotos, tenta salvar só o texto em vez de perder tudo. */
export function salvarRascunhoLote(produtos: ProdutoLoteRascunho[]): ResultadoSalvarRascunho {
  if (!produtos.length) {
    try {
      localStorage.removeItem(CHAVE_RASCUNHO_LOTE);
    } catch {
      /* nada a limpar */
    }
    return 'completo';
  }
  try {
    localStorage.setItem(CHAVE_RASCUNHO_LOTE, JSON.stringify({ produtos, savedAt: Date.now() }));
    return 'completo';
  } catch {
    try {
      const semFotos = produtos.map((p) => ({ ...p, imgSrc: '' }));
      localStorage.setItem(CHAVE_RASCUNHO_LOTE, JSON.stringify({ produtos: semFotos, savedAt: Date.now() }));
      return 'sem-fotos';
    } catch {
      return 'falhou';
    }
  }
}

export function limparRascunhoLote() {
  try {
    localStorage.removeItem(CHAVE_RASCUNHO_LOTE);
  } catch {
    /* nada a limpar */
  }
}

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

/**
 * Imagem "aviso" usada quando o rascunho não conseguiu guardar a foto de um
 * produto (ver `ResultadoSalvarRascunho`) — assim o produto (nome/preço)
 * ainda aparece pra pessoa recuperar depois de um recarregamento, só falta
 * tirar a foto de novo, em vez de o produto inteiro sumir sem explicação.
 */
export function criarImagemAvisoSemFoto(): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 400;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('canvas indisponível'));
      return;
    }
    ctx.fillStyle = '#EAF7CC';
    ctx.fillRect(0, 0, 400, 400);
    ctx.fillStyle = '#436000';
    ctx.textAlign = 'center';
    ctx.font = '46px sans-serif';
    ctx.fillText('📷', 200, 190);
    ctx.font = '600 20px Inter, sans-serif';
    ctx.fillText('Foto não salva', 200, 235);
    ctx.font = '400 15px Inter, sans-serif';
    ctx.fillStyle = '#4B6A67';
    ctx.fillText('Toque em "Trocar foto"', 200, 262);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = canvas.toDataURL('image/png');
  });
}

export function carregarImagemDeDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
