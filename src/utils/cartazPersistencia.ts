import { arquivoCartazService } from '../services/arquivoCartazService';
import type { StatusImagemProduto } from './batchEngine';
import type { TransformImagem } from './cartazEngine';
import type { AjustesStoryProduto } from './panfletoEngine';

/**
 * Persistência local (por navegador/aparelho) do gerador de Cartazes —
 * depois da migração de armazenamento de imagens pra Cloudflare R2 (ver
 * PLANO da migração), só sobra aqui:
 *
 *  - **Produtos recentes**: histórico curto pra reaproveitar foto/nome/preço
 *    num clique quando a mesma oferta se repete (comum em promoção semanal).
 *    Guarda `arquivoId` (referência ao R2), não mais `imgSrc` em base64 —
 *    ATENÇÃO: isso quebrou a compatibilidade de formato com a mesma chave
 *    que a versão HTML completa (`public/tools/cartazes.html`, rota
 *    `/cartazes/completo`) ainda usa; como aquela versão já é só
 *    referência/backup (ver PLANO-REESCRITA-FERRAMENTAS.md), não foi
 *    migrada nesta rodada — os dois não vão mais compartilhar essa lista.
 *  - **Configurações**: cores, tamanhos, margens, frases e posição das
 *    faixas — persistem entre sessões pra não ter que reconfigurar tudo toda
 *    vez que a ferramenta é reaberta. Nunca guardam imagem.
 *  - **Projeto ativo**: só um ponteiro (id) por modo — o rascunho de verdade
 *    (produto(s) em andamento, incluindo fotos) mora no backend a partir de
 *    agora (ver `services/projetoCartazService.ts`), não aqui.
 *  - **Rascunho antigo** (`carregarRascunho*`/`limparRascunho*` abaixo):
 *    funções que só restam pra Fase 7 da migração — detectar um rascunho
 *    salvo antes dessa mudança e oferecer transformá-lo num projeto. Nada no
 *    app escreve mais nessas chaves.
 */

const CHAVE_PRODUTOS_RECENTES = 'cartazes_recent_products_v1';
const MAXIMO_PRODUTOS_RECENTES = 20;

/**
 * `arquivoId` (não mais `imgSrc` em base64) — a foto já está no R2, subida
 * como parte do produto que gerou esse "recente" (ver `ArquivoCartazService`
 * no backend: um arquivo `confirmado` sem `projetoId` fica vivo até essa
 * lista descartar a entrada, nunca é tocado pelo job de limpeza). Pra exibir
 * a miniatura, quem lê essa lista busca URLs frescas em lote com
 * `arquivoCartazService.obterUrls` — a URL assinada de leitura expira em
 * minutos, então nunca é guardada aqui.
 */
export interface ProdutoRecente {
  arquivoId: string;
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

/**
 * Quando um produto repetido substitui outro (mesmo nome) ou a lista passa
 * do limite de 20, a foto correspondente é apagada do R2 em segundo plano —
 * sem isso, acumulariam pra sempre (ver comentário em `ProdutoRecente`).
 */
export function salvarProdutoRecente(produto: { arquivoId: string; name: string; de: string; por: string }) {
  if (!produto.arquivoId || !produto.name.trim()) return;
  const atual = carregarProdutosRecentes();
  const chave = produto.name.trim().toLowerCase();
  const substituido = atual.find((p) => (p.name || '').trim().toLowerCase() === chave) || null;
  const semODuplicado = atual.filter((p) => (p.name || '').trim().toLowerCase() !== chave);
  const comNovo = [{ ...produto, usedAt: Date.now() }, ...semODuplicado];
  const mantidos = comNovo.slice(0, MAXIMO_PRODUTOS_RECENTES);
  const descartados = comNovo.slice(MAXIMO_PRODUTOS_RECENTES);

  try {
    localStorage.setItem(CHAVE_PRODUTOS_RECENTES, JSON.stringify(mantidos));
  } catch {
    // provavelmente sem espaço — tenta uma lista mais curta antes de desistir
    try {
      localStorage.setItem(CHAVE_PRODUTOS_RECENTES, JSON.stringify(mantidos.slice(0, 8)));
    } catch {
      /* sem espaço nem pra isso — só não guarda dessa vez */
    }
  }

  [substituido, ...descartados]
    .filter((p): p is ProdutoRecente => p !== null && p.arquivoId !== produto.arquivoId)
    .forEach((p) => {
      arquivoCartazService.remover(p.arquivoId).catch(() => {
        /* best-effort — se falhar, o arquivo fica órfão no R2 até uma limpeza futura; não é crítico */
      });
    });
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

/**
 * Continua existindo só pra Fase 7 da migração (detectar e oferecer migrar
 * um rascunho antigo pra um projeto, ver `StoryModo.tsx`) — nada mais volta a
 * ESCREVER nessa chave desde a migração pra projetos no backend/R2.
 */
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

/**
 * Continua existindo só pra Fase 7 da migração (detectar e oferecer migrar
 * um rascunho antigo pra um projeto, ver `PanfletoModo.tsx`) — nada mais
 * volta a ESCREVER nessa chave desde a migração pra projetos no backend/R2.
 */
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

/**
 * Continua existindo só pra Fase 7 da migração (detectar e oferecer migrar
 * um rascunho antigo pra um projeto, ver `ImportarPlanilhaModo.tsx`) — nada
 * mais volta a ESCREVER nessa chave desde a migração pra projetos no
 * backend/R2.
 */
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
 * Imagem "aviso" usada quando um produto do Panfleto é restaurado do projeto
 * sem conseguir carregar a foto (arquivo apagado/inacessível no R2) — assim
 * o produto (nome/preço) ainda aparece pra pessoa recuperar, só falta tirar
 * a foto de novo, em vez de o produto inteiro sumir sem explicação.
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

/**
 * Carrega uma imagem a partir de qualquer URL — `data:` (compatibilidade com
 * rascunhos antigos) ou uma URL assinada do R2 (fluxo atual). `crossOrigin`
 * é necessário pras imagens do R2: sem ele, o canvas fica "contaminado" e
 * `toDataURL`/`toBlob` (baixar/gerar story) lançam exceção — inofensivo pra
 * `data:` URLs, que não passam por CORS.
 */
export function carregarImagemDeDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ---------------------------------------------------------------------------
// Projeto ativo — ponteiro leve (só o id, texto puro) por modo. É o único
// dado de "onde eu estava" que continua no localStorage depois da migração
// pra R2: o estado completo do projeto, incluindo as fotos, mora no backend
// (ver `services/projetoCartazService.ts`). Isso só diz qual projeto
// retomar automaticamente ao abrir a tela de novo.

export type TipoProjetoCartazPersistencia = 'story' | 'panfleto' | 'planilha';

const CHAVE_PROJETO_ATIVO: Record<TipoProjetoCartazPersistencia, string> = {
  story: 'cartazes_projeto_ativo_story_v1',
  panfleto: 'cartazes_projeto_ativo_panfleto_v1',
  planilha: 'cartazes_projeto_ativo_planilha_v1',
};

export function carregarProjetoAtivo(tipo: TipoProjetoCartazPersistencia): string | null {
  try {
    return localStorage.getItem(CHAVE_PROJETO_ATIVO[tipo]);
  } catch {
    return null;
  }
}

export function salvarProjetoAtivo(tipo: TipoProjetoCartazPersistencia, projetoId: string) {
  try {
    localStorage.setItem(CHAVE_PROJETO_ATIVO[tipo], projetoId);
  } catch {
    /* sem espaço/indisponível — só não retoma automaticamente na próxima vez, nada quebra */
  }
}

export function limparProjetoAtivo(tipo: TipoProjetoCartazPersistencia) {
  try {
    localStorage.removeItem(CHAVE_PROJETO_ATIVO[tipo]);
  } catch {
    /* nada a limpar */
  }
}
