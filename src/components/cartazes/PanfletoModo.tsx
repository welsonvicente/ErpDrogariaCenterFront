import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import JSZip from 'jszip';
import { AjustarEnquadramentoModal } from '../AjustarEnquadramentoModal';
import { CameraModal, type GuiaCamera } from '../CameraModal';
import { ElementoStoryEditavel, type GuiasAlinhamentoStory } from '../ElementoStoryEditavel';
import { EditarStoryProdutoModal } from './EditarStoryProdutoModal';
import { GaleriaStoriesModal } from './GaleriaStoriesModal';
import { blobDeImagem, carregarImagemDeArquivo, carregarImagemEBlobDeArquivo } from '../../utils/arquivoImagem';
import { ALTURA_STORY, carregarFontesCartaz, fmtMoney, LARGURA_STORY, montarTextoPromocional, pintarStory, sugerirPosicoesTexto, type TransformImagem } from '../../utils/cartazEngine';
import {
  carregarConfiguracoes,
  EVENTO_PREFERENCIAS_SINCRONIZADAS,
  carregarConfiguracoesPanfleto,
  carregarImagemDeDataUrl,
  carregarProdutosRecentes,
  carregarProjetoAtivo,
  carregarRascunhoPanfleto,
  criarImagemAvisoSemFoto,
  limparProjetoAtivo,
  limparRascunhoPanfleto,
  montarGuiasCameraDoStory,
  salvarConfiguracoesPanfleto,
  salvarProdutoRecente,
  salvarProjetoAtivo,
  chaveDescricaoProduto,
  descricaoDoProduto,
  salvarDescricaoProduto,
  type ProdutoRecente,
} from '../../utils/cartazPersistencia';
import { baixarArquivoDireto, compartilharOuBaixarVarios, salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';
import { arquivoCartazService } from '../../services/arquivoCartazService';
import { mensagemFalhaAoSalvar, projetoCartazService, type ProjetoCartazCompleto } from '../../services/projetoCartazService';
import { useAvisoSairComPendencia } from '../../hooks/useAvisoSairComPendencia';
import { useLogoPadraoStory } from '../../hooks/useLogoPadraoStory';
import {
  caixaLogoAbsoluta,
  caixaLogoPadrao,
  caixaLogoRelativa,
  construirPaginasPanfleto,
  escalarGrupoCards,
  moverGrupoCards,
  gradePadraoPanfleto,
  COR_FUNDO_SELO_PADRAO,
  COR_TEXTO_SELO_PADRAO,
  COR_RODAPE1_PADRAO,
  COR_RODAPE2_PADRAO,
  ESCALA_EXPORTACAO_PANFLETO,
  ITENS_POR_PAGINA_OPCOES,
  montarParametrosStoryProduto,
  PRESETS_TAMANHO_PANFLETO,
  renderizarPaginaPanfleto,
  TRANSFORM_PADRAO_PANFLETO,
  type AjustesStoryProduto,
  type CaixaCardPanfleto,
  type CaixaLogoPanfleto,
  type DimensaoPaginaPanfleto,
  type AlinhamentoTexto,
  type ParametrosPaginaPanfleto,
  type ProdutoPanfleto,
} from '../../utils/panfletoEngine';
import { gerarImagemQr } from '../../utils/qrCode';
import type { CaixaTablet } from '../../utils/tabletEngine';
import { ArtesTabletPainel } from './ArtesTabletPainel';
import { carregarFundoDoServidor, enviarFundoParaServidor, type FundoNoServidor } from '../../utils/fundoNoServidor';
import { EditorProdutoPanfleto, type EdicaoProdutoPanfleto } from './EditorProdutoPanfleto';
import { ProjetosCartazPainel } from './ProjetosCartazPainel';
import { SeletorCor } from './SeletorCor';

/** Aplica `transformar` só nos cards de `indices` (como um grupo) e devolve o layout completo. */
function aplicarNosSelecionados(layout: CaixaCardPanfleto[], indices: number[], transformar: (grupo: CaixaCardPanfleto[]) => CaixaCardPanfleto[]) {
  const validos = indices.filter((i) => layout[i]);
  if (validos.length === 0) return layout;
  const transformados = transformar(validos.map((i) => layout[i]));
  const resultado = [...layout];
  validos.forEach((i, k) => {
    resultado[i] = transformados[k];
  });
  return resultado;
}

type DestinoCamera = 'pendente' | number | null;

const TAMANHO_QR_LOGICO = 130;

/** Campos de estilo do story individual — ver `handleAplicarEstiloPadraoEmTodos`. */
const CAMPOS_ESTILO_STORY = [
  'corLogo',
  'corTextoNome',
  'corPreco',
  'corFundoPreco',
  'corFundoFrases',
  'corTextoFrases',
  'tamanhoNome',
  'tamanhoPreco',
  'tamanhoFrases',
  'fonteNome',
  'fontePreco',
  'fonteFrases',
] as const satisfies readonly (keyof AjustesStoryProduto)[];

function temEstiloProprio(produto: ProdutoPanfleto) {
  return CAMPOS_ESTILO_STORY.some((campo) => produto.ajustesStory?.[campo] !== undefined);
}
const EMOJI_PADRAO_STORY = '🤩😱';

/** Produto salvo no `estadoEditor` do projeto — mesmos campos de `ProdutoPanfleto`, sem o `HTMLImageElement` (a foto é só a referência ao R2). */
interface ProdutoPanfletoSalvo {
  arquivoId: string | null;
  nome: string;
  nomeOriginal?: string;
  ean?: string | null;
  de: string;
  por: string;
  transform: TransformImagem;
  ajustesStory?: AjustesStoryProduto;
}

interface EstadoEditorPanfleto {
  produtos: ProdutoPanfletoSalvo[];
  /** Logomarca do panfleto inteiro (uma só, posicionável) — ausente em projetos salvos antes dela existir. */
  logoArquivoId?: string | null;
  logoCaixa?: CaixaLogoPanfleto | null;
}

interface StatusUploadProduto {
  enviando: boolean;
  erro: boolean;
}

/**
 * Gerador de Panfleto (vários produtos por página) — Fase 2 da reescrita de
 * Cartazes como tela React nativa (ver PLANO-REESCRITA-FERRAMENTAS.md),
 * migrada pra guardar o projeto no backend (Postgres + Cloudflare R2) em vez
 * de `localStorage`/Base64 — ver PLANO da migração de armazenamento de
 * imagens. Cada foto é enviada assim que escolhida/capturada (mesmo padrão
 * do Story); "Adicionar ao panfleto" só exige que esse envio já tenha
 * terminado.
 *
 * Cada página é pintada fora de tela pelo motor puro em utils/panfletoEngine.ts
 * (mesma matemática de layout do `public/tools/cartazes.html`), e a página
 * atual é copiada pro canvas visível — assim dá pra exportar todas as páginas
 * de uma vez (.zip) sem precisar navegar por elas.
 */
interface PanfletoModoProps {
  /** Produtos enviados pelo modo Importar planilha ("Usar no panfleto") — null quando não há nada pendente. */
  produtosRecebidos?: ProdutoPanfleto[] | null;
  /** Avisa que `produtosRecebidos` já foi incorporado, pra não importar de novo a cada render. */
  aoReceberProdutos?: () => void;
  /** Leva pro modo Story, onde fica o padrão (tamanho/posição/cor) usado por qualquer produto sem ajuste próprio. */
  aoAbrirConfiguracaoPadrao?: () => void;
}

export function PanfletoModo({ produtosRecebidos, aoReceberProdutos, aoAbrirConfiguracaoPadrao }: PanfletoModoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paginasCanvasRef = useRef<HTMLCanvasElement[]>([]);
  const inputPendenteRef = useRef<HTMLInputElement>(null);
  const inputTrocaRef = useRef<HTMLInputElement>(null);
  const inputFundoRef = useRef<HTMLInputElement>(null);
  const inputLogoRef = useRef<HTMLInputElement>(null);
  const trocaAlvoIdx = useRef<number | null>(null);

  // ---- Projeto ativo -------------------------------------------------------
  const [projetoAtivo, setProjetoAtivo] = useState<ProjetoCartazCompleto | null>(null);
  const [carregandoProjeto, setCarregandoProjeto] = useState(true);
  const [mostrarPainelProjetos, setMostrarPainelProjetos] = useState(false);
  const [prontoParaPersistir, setProntoParaPersistir] = useState(false);

  const [produtos, setProdutos] = useState<ProdutoPanfleto[]>([]);
  const [statusUploadProdutos, setStatusUploadProdutos] = useState<Record<number, StatusUploadProduto>>({});
  const ultimosUploadsProdutoRef = useRef<Map<number, { blob: Blob; mimeType: string }>>(new Map());

  const [imagemPendente, setImagemPendente] = useState<HTMLImageElement | null>(null);
  const [imagemPendenteArquivoId, setImagemPendenteArquivoId] = useState<string | null>(null);
  const [enviandoPendente, setEnviandoPendente] = useState(false);
  const [erroPendente, setErroPendente] = useState(false);
  const ultimaAcaoPendenteRef = useRef<(() => unknown) | null>(null);

  const [carregandoImagem, setCarregandoImagem] = useState(false);
  const [nomeProduto, setNomeProduto] = useState('');
  const [deProduto, setDeProduto] = useState('');
  const [porProduto, setPorProduto] = useState('');
  const [cameraDestino, setCameraDestino] = useState<DestinoCamera>(null);

  const [produtosRecentes, setProdutosRecentes] = useState<ProdutoRecente[]>([]);
  const [urlsRecentes, setUrlsRecentes] = useState<Record<string, string>>({});

  const [mostrarTextosCabecalho, setMostrarTextosCabecalho] = useState(true);
  const [nomeLoja, setNomeLoja] = useState('Drogaria Center');
  const [nomeLojaAlinhamento, setNomeLojaAlinhamento] = useState<AlinhamentoTexto>('left');
  const [titulo, setTitulo] = useState('Ofertas da Semana');
  const [tituloAlinhamento, setTituloAlinhamento] = useState<AlinhamentoTexto>('left');

  const [mostrarTextosRodape, setMostrarTextosRodape] = useState(true);
  const [textoRodape1, setTextoRodape1] = useState('Feito com carinho pela Drogaria Center');
  const [textoRodape1Alinhamento, setTextoRodape1Alinhamento] = useState<AlinhamentoTexto>('left');
  const [textoRodape2, setTextoRodape2] = useState('Aponte a câmera do celular para o QR Code');
  const [textoRodape2Alinhamento, setTextoRodape2Alinhamento] = useState<AlinhamentoTexto>('left');
  const [qrAlinhamento, setQrAlinhamento] = useState<'left' | 'right'>('left');
  const [link, setLink] = useState('');

  const [itensPorPagina, setItensPorPagina] = useState(9);
  const [corLogo, setCorLogo] = useState('#436000');
  /** Cor própria de cada texto do cabeçalho/rodapé — null = a padrão (cabeçalho segue a cor da logo). */
  const [corNomeLoja, setCorNomeLoja] = useState<string | null>(null);
  const [corTitulo, setCorTitulo] = useState<string | null>(null);
  const [corRodape1, setCorRodape1] = useState<string | null>(null);
  const [corRodape2, setCorRodape2] = useState<string | null>(null);
  const [corDescricao, setCorDescricao] = useState('#173C3A');
  const [corPreco, setCorPreco] = useState('#436000');
  const [corFundoCard, setCorFundoCard] = useState('#FBFDF9');
  const [tamanhoNome, setTamanhoNome] = useState(15);
  const [tamanhoPreco, setTamanhoPreco] = useState(19);
  const [tamanhoBorda, setTamanhoBorda] = useState(40);
  const [tamanhoSelo, setTamanhoSelo] = useState(13);
  const [corFundoSelo, setCorFundoSelo] = useState(COR_FUNDO_SELO_PADRAO);
  const [corTextoSelo, setCorTextoSelo] = useState(COR_TEXTO_SELO_PADRAO);

  const [imagemFundo, setImagemFundo] = useState<HTMLImageElement | null>(null);
  const [manterFaixaBranca, setManterFaixaBranca] = useState(true);
  const [imagemLogo, setImagemLogo] = useState<HTMLImageElement | null>(null);
  const [logoArquivoId, setLogoArquivoId] = useState<string | null>(null);
  const [logoCaixa, setLogoCaixa] = useState<CaixaLogoPanfleto | null>(null);
  const [logoSelecionada, setLogoSelecionada] = useState(false);
  /** Cards arrastados/redimensionados (valem pra todas as páginas) — null = grade padrão. */
  const [cardsCaixas, setCardsCaixas] = useState<(CaixaCardPanfleto | null)[] | null>(null);
  /** Cards selecionados (índices na página) — arrastar um deles move todos; setas e −/+ agem neles. */
  const [selecionados, setSelecionados] = useState<number[]>([]);
  /** Modo toque: cada toque marca/desmarca um produto (no mouse, Ctrl/Shift + clique ou caixa de seleção). */
  const [selecionarVarios, setSelecionarVarios] = useState(false);
  /** Se o card apertado já estava selecionado — decide, ao soltar sem arrastar, se o clique desmarca. */
  const jaEstavaSelecionadoRef = useRef(false);

  // ---- Desfazer/refazer (Ctrl+Z / Ctrl+Y) das posições dos produtos e da logo ----
  type FotoLayout = { cardsCaixas: (CaixaCardPanfleto | null)[] | null; cardsCaixasPagina: Record<string, (CaixaCardPanfleto | null)[]>; logoCaixa: CaixaLogoPanfleto | null };
  const historicoRef = useRef<{ desfazer: FotoLayout[]; refazer: FotoLayout[] }>({ desfazer: [], refazer: [] });
  const [tamanhoHistorico, setTamanhoHistorico] = useState({ desfazer: 0, refazer: 0 });
  /** Um arraste inteiro vira UM passo: a foto é tirada só na primeira mudança depois de apertar. */
  const gestoNovoRef = useRef(false);
  const layoutAtualRef = useRef<FotoLayout>({ cardsCaixas: null, cardsCaixasPagina: {}, logoCaixa: null });
  /** Caixa de seleção desenhada com o mouse na prévia (px da página). */
  const [caixaSelecao, setCaixaSelecao] = useState<{ x0: number; y0: number; x1: number; y1: number; aditivo: boolean } | null>(null);
  /** Ajuste próprio de uma página (índice → posições), que vale por cima do ajuste de todas as páginas. */
  const [cardsCaixasPagina, setCardsCaixasPagina] = useState<Record<string, (CaixaCardPanfleto | null)[]>>({});
  /** Onde valem o arraste e os botões de mover/escalar: o panfleto inteiro ou só a página aberta. */
  const [escopoCards, setEscopoCards] = useState<'todas' | 'pagina'>('todas');
  /** Passo das setas de "Mover todos", em px da página (lógicos). */
  const [passoMover, setPassoMover] = useState(10);
  /** Produto aberto no editor de descrição/preço (✏️ na lista ou duplo clique no card da prévia). */
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  /** Régua: linha que aparece enquanto um card/logo arrastado fica alinhado com outro ou com o centro da página. */
  const [guiasAlinhamento, setGuiasAlinhamento] = useState<GuiasAlinhamentoStory | null>(null);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [dimensaoPaginaAtual, setDimensaoPaginaAtual] = useState<DimensaoPaginaPanfleto | null>(null);
  const dimensoesPaginasRef = useRef<DimensaoPaginaPanfleto[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);

  const [tabletCaixas, setTabletCaixas] = useState<CaixaTablet[] | null>(null);
  const [tabletLogoCaixa, setTabletLogoCaixa] = useState<CaixaTablet | null>(null);
  const [tabletMostrarLogo, setTabletMostrarLogo] = useState(true);
  const [tabletFundo, setTabletFundo] = useState<{ nome: string; arquivoId: string } | null>(null);
  /** Referência do fundo do panfleto no R2 (salva nas preferências) — a imagem em si fica em `imagemFundo`. */
  const [panfletoFundo, setPanfletoFundo] = useState<FundoNoServidor | null>(null);
  const [enviandoFundo, setEnviandoFundo] = useState(false);
  const fundoMostradoRef = useRef<string | null | undefined>(undefined);

  const [imagemQr, setImagemQr] = useState<HTMLImageElement | null>(null);
  const [paginaAtual, setPaginaAtual] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [salvando, setSalvando] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  const [baixandoStories, setBaixandoStories] = useState(false);
  const [itensGaleriaStories, setItensGaleriaStories] = useState<{ conteudo: string; nomeArquivo: string; mime: string; rotulo: string }[] | null>(null);
  const [toast, setToast] = useState('');

  // PNG + posição definidos no Story produto único — padrão da logo nos stories de cada produto.
  const logoPadraoStory = useLogoPadraoStory();

  const [ajusteIdx, setAjusteIdx] = useState<number | null>(null);
  const [editarStoryIdx, setEditarStoryIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  /**
   * Garante que a foto de um produto é um arquivo DESTE projeto — só esses
   * voltam quando o projeto é reaberto (`GET /projetos/:id` lista os arquivos
   * pelo projeto). Tenta copiar direto no R2 (`duplicar`); se não der, reenvia
   * a foto que já está em memória como um arquivo novo. `null` = nenhum dos
   * dois funcionou.
   *
   * Antes, uma falha no `duplicar` era engolida e o produto ficava com o
   * `arquivoId` da Planilha: tudo parecia certo na tela, mas no F5 (ou em
   * outro computador) o Panfleto não achava a foto entre os arquivos dele e
   * todas as fotos vindas da Planilha "sumiam".
   */
  async function tornarFotoDoProjeto(produto: ProdutoPanfleto, projetoId: string): Promise<string | null> {
    if (produto.arquivoId) {
      try {
        return (await arquivoCartazService.duplicar(produto.arquivoId, projetoId)).id;
      } catch {
        /* cai no reenvio abaixo */
      }
    }
    try {
      const blob = await blobDeImagem(produto.imagem, 'image/jpeg', 0.9);
      return await arquivoCartazService.enviarImagem(blob, 'image/jpeg', projetoId);
    } catch {
      return null;
    }
  }

  // Recebe produtos enviados pelo modo Importar planilha ("Usar no panfleto")
  // — a foto SEMPRE vira um arquivo novo do Panfleto (ver `tornarFotoDoProjeto`):
  // o arquivo original pertence à Planilha, e um arquivo só pertence a um
  // projeto por vez.
  useEffect(() => {
    if (!produtosRecebidos || produtosRecebidos.length === 0 || !projetoAtivo) return;
    const projetoId = projetoAtivo.id;
    async function incorporar() {
      const prontos = await Promise.all(
        produtosRecebidos!.map(async (produto) => ({ ...produto, arquivoId: await tornarFotoDoProjeto(produto, projetoId) })),
      );
      const inicio = produtosRef.current.length;
      const finalProdutos = [...produtosRef.current, ...prontos];
      setProdutos(finalProdutos);
      persistirProdutos(finalProdutos);

      // O que não deu pra salvar fica marcado com "Tentar de novo" no próprio
      // produto (mesmo fluxo de trocar foto), em vez de sumir no próximo F5.
      const falhas = prontos.map((p, i) => (p.arquivoId ? null : inicio + i)).filter((idx): idx is number => idx !== null);
      if (falhas.length > 0) {
        await Promise.all(
          falhas.map(async (idx) => {
            try {
              ultimosUploadsProdutoRef.current.set(idx, { blob: await blobDeImagem(finalProdutos[idx].imagem, 'image/jpeg', 0.9), mimeType: 'image/jpeg' });
            } catch {
              /* sem blob não há retry automático — ainda dá pra trocar a foto manualmente */
            }
          }),
        );
        setStatusUploadProdutos((atual) => ({ ...atual, ...Object.fromEntries(falhas.map((idx) => [idx, { enviando: false, erro: true }])) }));
        setToast(`${falhas.length} foto(s) não foram salvas no panfleto. Toque em "Tentar de novo" no produto.`);
      }
      aoReceberProdutos?.();
    }
    incorporar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosRecebidos, projetoAtivo?.id]);

  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return;
      // Os modos de Cartazes ficam montados ao mesmo tempo (só escondidos) — age só se o Panfleto estiver na tela.
      if (!stageRef.current || stageRef.current.offsetParent === null) return;
      const tecla = e.key.toLowerCase();
      if (tecla === 'z' && !e.shiftKey) {
        e.preventDefault();
        desfazer();
      } else if (tecla === 'y' || (tecla === 'z' && e.shiftKey)) {
        e.preventDefault();
        refazer();
      }
    }
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
    // desfazer/refazer só leem refs — não precisam ser recriados
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clique fora do panfleto (e da barra "Ajustar produtos") ou Esc tira a seleção dos produtos e da logo.
  useEffect(() => {
    function aoApertarFora(e: PointerEvent) {
      const alvo = e.target as Node | null;
      if (!alvo || stageRef.current?.contains(alvo)) return;
      if ((alvo as Element).closest?.('.panfleto-ajustes')) return;
      setSelecionados((atual) => (atual.length ? [] : atual));
      setLogoSelecionada(false);
    }
    function aoTeclarEsc(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      setSelecionados((atual) => (atual.length ? [] : atual));
      setLogoSelecionada(false);
    }
    document.addEventListener('pointerdown', aoApertarFora);
    document.addEventListener('keydown', aoTeclarEsc);
    return () => {
      document.removeEventListener('pointerdown', aoApertarFora);
      document.removeEventListener('keydown', aoTeclarEsc);
    };
  }, []);

  // Gera o QR (async) quando o link muda — cacheado por texto em utils/qrCode.ts.
  useEffect(() => {
    const linkTrim = link.trim();
    if (!linkTrim) {
      setImagemQr(null);
      return;
    }
    let cancelado = false;
    gerarImagemQr(linkTrim, TAMANHO_QR_LOGICO * ESCALA_EXPORTACAO_PANFLETO)
      .then((img) => {
        if (!cancelado) setImagemQr(img);
      })
      .catch(() => {
        if (!cancelado) setImagemQr(null);
      });
    return () => {
      cancelado = true;
    };
  }, [link]);

  // Configurações (preferências permanentes) continuam em localStorage — só
  // textos/cores/tamanhos, nunca imagem.
  // Reaplica quando as preferências chegam do servidor (ver `sincronizarPreferenciasCartaz`) — valem em qualquer navegador/aparelho.
  useEffect(() => {
    function aplicarConfiguracoes() {
      const config = carregarConfiguracoesPanfleto();
      if (!config) return;
      if (config.nomeLoja !== undefined) setNomeLoja(config.nomeLoja);
      if (config.nomeLojaAlinhamento) setNomeLojaAlinhamento(config.nomeLojaAlinhamento);
      if (config.titulo !== undefined) setTitulo(config.titulo);
      if (config.tituloAlinhamento) setTituloAlinhamento(config.tituloAlinhamento);
      if (config.mostrarTextosCabecalho !== undefined) setMostrarTextosCabecalho(config.mostrarTextosCabecalho);
      if (config.mostrarTextosRodape !== undefined) setMostrarTextosRodape(config.mostrarTextosRodape);
      if (config.textoRodape1 !== undefined) setTextoRodape1(config.textoRodape1);
      if (config.textoRodape1Alinhamento) setTextoRodape1Alinhamento(config.textoRodape1Alinhamento);
      if (config.textoRodape2 !== undefined) setTextoRodape2(config.textoRodape2);
      if (config.textoRodape2Alinhamento) setTextoRodape2Alinhamento(config.textoRodape2Alinhamento);
      if (config.qrAlinhamento) setQrAlinhamento(config.qrAlinhamento);
      if (config.link !== undefined) setLink(config.link);
      if (config.itensPorPagina) setItensPorPagina(config.itensPorPagina);
      if (config.corLogo) setCorLogo(config.corLogo);
      if (config.corNomeLoja !== undefined) setCorNomeLoja(config.corNomeLoja);
      if (config.corTitulo !== undefined) setCorTitulo(config.corTitulo);
      if (config.corRodape1 !== undefined) setCorRodape1(config.corRodape1);
      if (config.corRodape2 !== undefined) setCorRodape2(config.corRodape2);
      if (config.corDescricao) setCorDescricao(config.corDescricao);
      if (config.corPreco) setCorPreco(config.corPreco);
      if (config.corFundoCard) setCorFundoCard(config.corFundoCard);
      if (config.tamanhoNome) setTamanhoNome(config.tamanhoNome);
      if (config.tamanhoPreco) setTamanhoPreco(config.tamanhoPreco);
      if (config.tamanhoBorda) setTamanhoBorda(config.tamanhoBorda);
      if (config.tamanhoSelo) setTamanhoSelo(config.tamanhoSelo);
      if (config.corFundoSelo) setCorFundoSelo(config.corFundoSelo);
      if (config.corTextoSelo) setCorTextoSelo(config.corTextoSelo);
      if (config.manterFaixaBranca !== undefined) setManterFaixaBranca(config.manterFaixaBranca);
      if (config.tabletCaixas !== undefined) setTabletCaixas(config.tabletCaixas);
      if (config.cardsCaixas !== undefined) setCardsCaixas(config.cardsCaixas);
      if (config.cardsCaixasPagina !== undefined) setCardsCaixasPagina(config.cardsCaixasPagina ?? {});
      if (config.tabletLogoCaixa !== undefined) setTabletLogoCaixa(config.tabletLogoCaixa);
      if (config.tabletMostrarLogo !== undefined) setTabletMostrarLogo(config.tabletMostrarLogo);
      if (config.tabletFundo !== undefined) setTabletFundo(config.tabletFundo);
      if (config.panfletoFundo !== undefined) setPanfletoFundo(config.panfletoFundo);
    }
    aplicarConfiguracoes();
    window.addEventListener(EVENTO_PREFERENCIAS_SINCRONIZADAS, aplicarConfiguracoes);
    // Descrições editadas em outro computador chegam com a sincronização — reaplica nos produtos abertos.
    const reaplicarDescricoes = () =>
      setProdutos((atual) => atual.map((p) => (p.nomeOriginal ? { ...p, nome: descricaoDoProduto(p.nomeOriginal, p.ean) } : p)));
    window.addEventListener(EVENTO_PREFERENCIAS_SINCRONIZADAS, reaplicarDescricoes);
    return () => {
      window.removeEventListener(EVENTO_PREFERENCIAS_SINCRONIZADAS, aplicarConfiguracoes);
      window.removeEventListener(EVENTO_PREFERENCIAS_SINCRONIZADAS, reaplicarDescricoes);
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      salvarConfiguracoesPanfleto({
        nomeLoja,
        nomeLojaAlinhamento,
        titulo,
        tituloAlinhamento,
        mostrarTextosCabecalho,
        mostrarTextosRodape,
        textoRodape1,
        textoRodape1Alinhamento,
        textoRodape2,
        textoRodape2Alinhamento,
        qrAlinhamento,
        link,
        itensPorPagina,
        corLogo,
        corNomeLoja,
        corTitulo,
        corRodape1,
        corRodape2,
        corDescricao,
        corPreco,
        corFundoCard,
        tamanhoNome,
        tamanhoPreco,
        tamanhoBorda,
        tamanhoSelo,
        corFundoSelo,
        corTextoSelo,
        manterFaixaBranca,
        tabletCaixas,
        tabletLogoCaixa,
        tabletMostrarLogo,
        tabletFundo,
        panfletoFundo,
        cardsCaixas,
        cardsCaixasPagina,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [
    nomeLoja, nomeLojaAlinhamento, titulo, tituloAlinhamento, mostrarTextosCabecalho, mostrarTextosRodape,
    textoRodape1, textoRodape1Alinhamento, textoRodape2, textoRodape2Alinhamento, qrAlinhamento, link,
    itensPorPagina, corLogo, corNomeLoja, corTitulo, corRodape1, corRodape2, corDescricao, corPreco, corFundoCard, tamanhoNome, tamanhoPreco, tamanhoBorda,
    tamanhoSelo, corFundoSelo, corTextoSelo, manterFaixaBranca, tabletCaixas, tabletLogoCaixa, tabletMostrarLogo, tabletFundo, panfletoFundo, cardsCaixas, cardsCaixasPagina,
  ]);

  // ---------------------------------------------------------------------------
  // Projeto: carrega o ativo, oferece migrar um rascunho antigo, ou abre o
  // painel de projetos — mesmo padrão do StoryModo.

  async function aplicarProjeto(projeto: ProjetoCartazCompleto) {
    setProntoParaPersistir(false);
    setProjetoAtivo(projeto);
    salvarProjetoAtivo('panfleto', projeto.id);
    setMostrarPainelProjetos(false);

    const estado = (projeto.estadoEditor || {}) as Partial<EstadoEditorPanfleto>;
    const mapaArquivos = new Map(projeto.arquivos.map((a) => [a.id, a] as const));
    const salvos = estado.produtos || [];

    // Recuperação: produto que aponta pra um arquivo que NÃO é deste projeto
    // (foto vinda da Planilha num momento em que a cópia falhava — ver
    // `tornarFotoDoProjeto`). O arquivo original ainda existe no projeto de
    // origem, então busca a URL dele direto e, mais abaixo, traz uma cópia
    // pra este projeto, pra não depender mais do outro.
    const idsDeFora = salvos.map((p) => p.arquivoId).filter((id): id is string => Boolean(id) && !mapaArquivos.has(id as string));
    const urlsDeFora = new Map<string, string>();
    if (idsDeFora.length > 0) {
      try {
        (await arquivoCartazService.obterUrls(idsDeFora)).forEach((r) => urlsDeFora.set(r.id, r.url));
      } catch {
        /* sem as URLs, esses produtos caem no aviso "sem foto" abaixo */
      }
    }

    const restaurados: ProdutoPanfleto[] = [];
    const paraAdotar: ProdutoPanfleto[] = [];
    let semFotoCount = 0;
    for (const p of salvos) {
      const url = p.arquivoId ? mapaArquivos.get(p.arquivoId)?.url ?? urlsDeFora.get(p.arquivoId) : undefined;
      let imagem: HTMLImageElement | null = null;
      if (url) {
        try {
          // eslint-disable-next-line no-await-in-loop
          imagem = await carregarImagemDeDataUrl(url);
        } catch {
          /* foto corrompida/inacessível — mostra aviso no lugar */
        }
      }
      if (!imagem) {
        semFotoCount++;
        // eslint-disable-next-line no-await-in-loop
        imagem = await criarImagemAvisoSemFoto();
      }
      const restaurado = { imagem, nome: p.nomeOriginal ? descricaoDoProduto(p.nomeOriginal, p.ean) : p.nome, nomeOriginal: p.nomeOriginal, ean: p.ean, de: p.de, por: p.por, transform: p.transform || TRANSFORM_PADRAO_PANFLETO, ajustesStory: p.ajustesStory, arquivoId: p.arquivoId };
      restaurados.push(restaurado);
      if (p.arquivoId && urlsDeFora.has(p.arquivoId) && url && imagem) paraAdotar.push(restaurado);
    }
    setProdutos(restaurados);

    let logo: HTMLImageElement | null = null;
    const arquivoLogo = estado.logoArquivoId ? mapaArquivos.get(estado.logoArquivoId) : undefined;
    if (arquivoLogo) {
      try {
        logo = await carregarImagemDeDataUrl(arquivoLogo.url);
      } catch {
        /* logo inacessível — o panfleto segue sem ela, dá pra escolher de novo */
      }
    }
    setImagemLogo(logo);
    setLogoArquivoId(logo ? estado.logoArquivoId ?? null : null);
    setLogoCaixa(logo ? estado.logoCaixa ?? null : null);
    setLogoSelecionada(false);

    if (semFotoCount > 0) {
      setToast(`${semFotoCount} produto(s) recuperado(s) sem a foto — toque em "🔄" pra escolher de novo.`);
    }
    setProntoParaPersistir(true);

    // Traz pra este projeto as fotos recuperadas de outro (ver `idsDeFora`).
    // Troca pelo `arquivoId` antigo (não pelo índice), porque a pessoa pode
    // já estar mexendo na lista; o autosave grava a troca. Se falhar, o
    // produto segue com a referência antiga, que continua sendo recuperada
    // por este mesmo caminho na próxima abertura.
    if (paraAdotar.length > 0) {
      const adotados = await Promise.all(
        paraAdotar.map(async (produto) => ({ antigo: produto.arquivoId as string, novo: await tornarFotoDoProjeto(produto, projeto.id) })),
      );
      const trocas = new Map(adotados.filter((a) => a.novo).map((a) => [a.antigo, a.novo as string]));
      if (trocas.size > 0) {
        setProdutos((atual) => atual.map((p) => (p.arquivoId && trocas.has(p.arquivoId) ? { ...p, arquivoId: trocas.get(p.arquivoId) } : p)));
        setToast(`${trocas.size} foto(s) que tinham sumido foram recuperadas e salvas neste panfleto.`);
      }
    }
  }

  async function migrarRascunhoAntigo(rascunho: NonNullable<ReturnType<typeof carregarRascunhoPanfleto>>) {
    const projeto = await projetoCartazService.criar('panfleto', `Panfleto migrado — ${new Date().toLocaleDateString('pt-BR')}`);

    const produtosMigrados: ProdutoPanfletoSalvo[] = [];
    for (const p of rascunho.produtos) {
      let arquivoId: string | null = null;
      if (p.imgSrc) {
        try {
          // eslint-disable-next-line no-await-in-loop
          const img = await carregarImagemDeDataUrl(p.imgSrc);
          // eslint-disable-next-line no-await-in-loop
          const blob = await blobDeImagem(img, 'image/jpeg', 0.9);
          // eslint-disable-next-line no-await-in-loop
          arquivoId = await arquivoCartazService.enviarImagem(blob, 'image/jpeg', projeto.id);
        } catch {
          /* foto antiga corrompida — segue sem ela */
        }
      }
      produtosMigrados.push({ arquivoId, nome: p.nome, de: p.de, por: p.por, transform: p.transform || TRANSFORM_PADRAO_PANFLETO, ajustesStory: p.ajustesStory });
    }

    const estadoEditor: EstadoEditorPanfleto = { produtos: produtosMigrados };
    await projetoCartazService.atualizar(projeto.id, { estadoEditor: estadoEditor as unknown as Record<string, unknown> });
    limparRascunhoPanfleto();

    const completo = await projetoCartazService.obter(projeto.id);
    await aplicarProjeto(completo);
  }

  useEffect(() => {
    async function iniciar() {
      const ponteiro = carregarProjetoAtivo('panfleto');
      if (ponteiro) {
        try {
          const projeto = await projetoCartazService.obter(ponteiro);
          await aplicarProjeto(projeto);
          setCarregandoProjeto(false);
          return;
        } catch {
          limparProjetoAtivo('panfleto');
        }
      }

      const rascunhoAntigo = carregarRascunhoPanfleto();
      if (rascunhoAntigo && rascunhoAntigo.produtos.length > 0) {
        const migrar = window.confirm(
          `Encontramos um rascunho de Panfleto deste navegador com ${rascunhoAntigo.produtos.length} produto(s), de antes dos projetos salvos no servidor. Quer transformá-lo num projeto novo?`,
        );
        if (migrar) {
          try {
            await migrarRascunhoAntigo(rascunhoAntigo);
            setCarregandoProjeto(false);
            return;
          } catch {
            setToast('Não foi possível migrar o rascunho antigo agora. Ele continua salvo neste navegador — tente de novo mais tarde.');
          }
        } else {
          limparRascunhoPanfleto();
        }
      }

      setMostrarPainelProjetos(true);
      setCarregandoProjeto(false);
    }
    iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Espelha `produtos` numa ref — usada por `persistirProdutos` quando
  // chamada logo após uma troca de foto confirmar, sem depender de fechar
  // sobre um valor desatualizado (stale closure) do callback assíncrono.
  const produtosRef = useRef<ProdutoPanfleto[]>(produtos);
  produtosRef.current = produtos;

  const debounceAutosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [salvandoPendente, setSalvandoPendente] = useState(false);

  // Mesmo motivo de `produtosRef`: a logo pode confirmar o upload dentro de
  // um callback assíncrono, e `montarEstadoEditor` precisa do valor atual.
  const logoRef = useRef({ logoArquivoId, logoCaixa });
  logoRef.current = { logoArquivoId, logoCaixa };

  function montarEstadoEditor(produtosParaSalvar: ProdutoPanfleto[], logo: Partial<typeof logoRef.current> = {}): EstadoEditorPanfleto {
    const { logoArquivoId: arquivoDaLogo, logoCaixa: caixaDaLogo } = { ...logoRef.current, ...logo };
    return {
      produtos: produtosParaSalvar.map((p) => ({ arquivoId: p.arquivoId ?? null, nome: p.nome, nomeOriginal: p.nomeOriginal, ean: p.ean, de: p.de, por: p.por, transform: p.transform, ajustesStory: p.ajustesStory })),
      logoArquivoId: arquivoDaLogo,
      logoCaixa: caixaDaLogo,
    };
  }

  /**
   * Salva a lista de produtos agora, sem esperar o debounce — usada logo
   * após trocar a foto de um produto já adicionado confirmar o upload (a
   * janela entre confirmar e persistir é onde fechar a aba rápido demais
   * perderia a referência).
   */
  function persistirProdutos(produtosParaSalvar: ProdutoPanfleto[], logo: Partial<typeof logoRef.current> = {}) {
    if (!projetoAtivo) return;
    if (debounceAutosaveRef.current) {
      clearTimeout(debounceAutosaveRef.current);
      debounceAutosaveRef.current = null;
    }
    setSalvandoPendente(true);
    projetoCartazService
      .salvarEstadoEditor(projetoAtivo.id, montarEstadoEditor(produtosParaSalvar, logo) as unknown as Record<string, unknown>)
      .catch((erro) => setToast(mensagemFalhaAoSalvar(erro)))
      .finally(() => setSalvandoPendente(false));
  }

  // Autosave do estado do editor (produtos + posição da logo) no projeto.
  useEffect(() => {
    if (!prontoParaPersistir || !projetoAtivo) return;
    setSalvandoPendente(true);
    debounceAutosaveRef.current = setTimeout(() => {
      debounceAutosaveRef.current = null;
      projetoCartazService
        .salvarEstadoEditor(projetoAtivo.id, montarEstadoEditor(produtos) as unknown as Record<string, unknown>)
        .catch((erro) => setToast(mensagemFalhaAoSalvar(erro)))
        .finally(() => setSalvandoPendente(false));
    }, 700);
    return () => {
      if (debounceAutosaveRef.current) clearTimeout(debounceAutosaveRef.current);
    };
  }, [prontoParaPersistir, projetoAtivo, produtos, logoArquivoId, logoCaixa]);

  // Bloqueia fechar/recarregar a aba enquanto alguma foto está subindo ou o
  // autosave ainda não confirmou.
  useAvisoSairComPendencia(enviandoPendente || enviandoLogo || Object.values(statusUploadProdutos).some((s) => s.enviando) || salvandoPendente);

  useEffect(() => {
    setProdutosRecentes(carregarProdutosRecentes());
  }, [projetoAtivo?.id]);

  useEffect(() => {
    const ids = produtosRecentes.map((p) => p.arquivoId);
    if (ids.length === 0) return;
    arquivoCartazService
      .obterUrls(ids)
      .then((resultado) => setUrlsRecentes(Object.fromEntries(resultado.map((r) => [r.id, r.url]))))
      .catch(() => undefined);
  }, [produtosRecentes]);

  function desenharPaginaVisivel(indice: number) {
    const visivel = canvasRef.current;
    const atual = paginasCanvasRef.current[indice];
    if (!visivel || !atual) return;
    visivel.width = atual.width;
    visivel.height = atual.height;
    visivel.getContext('2d')?.drawImage(atual, 0, 0);
    setDimensaoPaginaAtual(dimensoesPaginasRef.current[indice] ?? null);
  }

  useEffect(() => {
    const sizing = PRESETS_TAMANHO_PANFLETO[itensPorPagina] || PRESETS_TAMANHO_PANFLETO[9];
    const paginas = construirPaginasPanfleto(produtos, itensPorPagina);
    const parametros: ParametrosPaginaPanfleto = {
      mostrarTextosCabecalho,
      nomeLoja,
      nomeLojaAlinhamento,
      titulo,
      tituloAlinhamento,
      mostrarTextosRodape,
      textoRodape1,
      textoRodape1Alinhamento,
      textoRodape2,
      textoRodape2Alinhamento,
      temLink: link.trim().length > 0,
      qrAlinhamento,
      imagemQr,
      corLogo,
      corNomeLoja,
      corTitulo,
      corRodape1,
      corRodape2,
      corDescricao,
      corPreco,
      corFundoCard,
      tamanhoNome,
      tamanhoPreco,
      tamanhoBorda,
      tamanhoSelo,
      corFundoSelo,
      corTextoSelo,
      imagemFundo,
      manterFaixaBranca,
      imagemLogo,
      logoCaixa,
      cardsCaixas,
    };

    const dimensoes: DimensaoPaginaPanfleto[] = [];
    paginasCanvasRef.current = paginas.map((produtosDaPagina, i) => {
      const canvas = document.createElement('canvas');
      // Página com ajuste próprio usa o dela; as outras, o ajuste de todas as páginas.
      const parametrosDaPagina = { ...parametros, cardsCaixas: cardsCaixasPagina[i] ?? cardsCaixas };
      dimensoes.push(renderizarPaginaPanfleto(canvas, produtosDaPagina, sizing, i + 1, paginas.length, parametrosDaPagina, itensPorPagina));
      return canvas;
    });
    dimensoesPaginasRef.current = dimensoes;
    setTotalPaginas(paginas.length);

    const indiceValido = Math.min(paginaAtual, paginas.length - 1);
    if (indiceValido !== paginaAtual) {
      setPaginaAtual(Math.max(0, indiceValido));
    } else {
      desenharPaginaVisivel(indiceValido);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    produtos, itensPorPagina, mostrarTextosCabecalho, nomeLoja, nomeLojaAlinhamento, titulo, tituloAlinhamento,
    mostrarTextosRodape, textoRodape1, textoRodape1Alinhamento, textoRodape2, textoRodape2Alinhamento,
    qrAlinhamento, link, imagemQr, corLogo, corNomeLoja, corTitulo, corRodape1, corRodape2, corDescricao, corPreco, corFundoCard, tamanhoNome, tamanhoPreco,
    tamanhoBorda, tamanhoSelo, corFundoSelo, corTextoSelo, imagemFundo, manterFaixaBranca, imagemLogo, logoCaixa, cardsCaixas, cardsCaixasPagina,
  ]);

  useEffect(() => {
    desenharPaginaVisivel(paginaAtual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaAtual]);

  /** Envia (presign → PUT → confirmar) a foto ainda não vinculada a nenhum produto adicionado — usada pelo formulário "Adicionar produto". */
  async function enviarFotoPendente(blob: Blob, mimeType: string) {
    if (!projetoAtivo) return;
    ultimaAcaoPendenteRef.current = () => enviarFotoPendente(blob, mimeType);
    setEnviandoPendente(true);
    setErroPendente(false);
    try {
      const arquivoId = await arquivoCartazService.enviarImagem(blob, mimeType, projetoAtivo.id);
      setImagemPendenteArquivoId(arquivoId);
    } catch {
      setErroPendente(true);
      setToast('Não foi possível enviar essa foto. Tente de novo.');
    } finally {
      setEnviandoPendente(false);
    }
  }

  /**
   * Copia (server-side) a foto de um "produto recente" pro slot pendente
   * deste projeto — nunca reaproveita a mesma referência: ela pode já
   * pertencer a outro projeto (ver `arquivoCartazService.duplicar`).
   */
  async function duplicarFotoRecentePendente(arquivoOrigemId: string) {
    if (!projetoAtivo) return;
    ultimaAcaoPendenteRef.current = () => duplicarFotoRecentePendente(arquivoOrigemId);
    setEnviandoPendente(true);
    setErroPendente(false);
    try {
      const copia = await arquivoCartazService.duplicar(arquivoOrigemId, projetoAtivo.id);
      setImagemPendenteArquivoId(copia.id);
    } catch {
      setErroPendente(true);
      setToast('Não foi possível vincular essa foto ao projeto. Tente de novo.');
    } finally {
      setEnviandoPendente(false);
    }
  }

  /** Envia a foto de um produto JÁ adicionado (trocar foto) e atualiza o `arquivoId` dele quando terminar. */
  async function enviarFotoDeProdutoExistente(idx: number, blob: Blob, mimeType: string) {
    if (!projetoAtivo) return;
    ultimosUploadsProdutoRef.current.set(idx, { blob, mimeType });
    setStatusUploadProdutos((atual) => ({ ...atual, [idx]: { enviando: true, erro: false } }));
    try {
      const arquivoId = await arquivoCartazService.enviarImagem(blob, mimeType, projetoAtivo.id);
      const atualizados = produtosRef.current.map((p, i) => (i === idx ? { ...p, arquivoId } : p));
      setProdutos(atualizados);
      persistirProdutos(atualizados);
      setStatusUploadProdutos((atual) => ({ ...atual, [idx]: { enviando: false, erro: false } }));
    } catch {
      setStatusUploadProdutos((atual) => ({ ...atual, [idx]: { enviando: false, erro: true } }));
      setToast('Não foi possível enviar essa foto. Toque em "Tentar de novo".');
    }
  }

  function handleTentarNovamentePendente() {
    ultimaAcaoPendenteRef.current?.();
  }

  function handleTentarNovamenteProduto(idx: number) {
    const ultimo = ultimosUploadsProdutoRef.current.get(idx);
    if (ultimo) enviarFotoDeProdutoExistente(idx, ultimo.blob, ultimo.mimeType);
  }

  async function handleEscolherArquivoPendente(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    setCarregandoImagem(true);
    try {
      const { imagem, blob, mimeType } = await carregarImagemEBlobDeArquivo(arquivo);
      setImagemPendente(imagem);
      setImagemPendenteArquivoId(null);
      await enviarFotoPendente(blob, mimeType);
    } catch {
      setToast('Não foi possível ler essa foto. Tente outra.');
    } finally {
      setCarregandoImagem(false);
    }
  }

  async function handleTrocarFotoProduto(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    const idx = trocaAlvoIdx.current;
    trocaAlvoIdx.current = null;
    if (!arquivo || idx === null) return;
    try {
      const { imagem, blob, mimeType } = await carregarImagemEBlobDeArquivo(arquivo);
      setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, imagem, transform: TRANSFORM_PADRAO_PANFLETO, arquivoId: null } : p)));
      await enviarFotoDeProdutoExistente(idx, blob, mimeType);
    } catch {
      setToast('Não foi possível ler essa foto. Tente outra.');
    }
  }

  /** Fundo do panfleto — nunca persistido (mesmo comportamento de antes), continua usando o carregador simples em memória. */
  // Fundo salvo no servidor: baixa quando muda (ao abrir, ou trocado em outro aparelho).
  useEffect(() => {
    const id = panfletoFundo?.arquivoId ?? null;
    // Só pula o download se ESTA imagem já está na tela (acabou de ser escolhida aqui). A marca é feita
    // depois de baixar — marcar antes fazia um download cancelado (efeito rodando 2x ao abrir a tela)
    // impedir o próximo, e o fundo salvo não aparecia.
    if (id && fundoMostradoRef.current === id) return;
    if (!id) {
      fundoMostradoRef.current = null;
      setImagemFundo(null);
      return;
    }
    let cancelado = false;
    carregarFundoDoServidor(id)
      .then((img) => {
        if (cancelado) return;
        fundoMostradoRef.current = id;
        setImagemFundo(img);
      })
      .catch(() => {
        if (!cancelado) setToast('Não foi possível baixar a imagem de fundo salva do panfleto.');
      });
    return () => {
      cancelado = true;
    };
    // Depende só do ID: a sincronização das preferências reaplica o mesmo fundo como objeto novo, e
    // depender do objeto cancelava o download em andamento sem começar outro (o fundo não aparecia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panfletoFundo?.arquivoId]);

  /** Mostra na hora e envia pro servidor — o fundo passa a valer em todos os aparelhos da conta. */
  async function handleEscolherImagemFundo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    setEnviandoFundo(true);
    try {
      const img = await carregarImagemDeArquivo(arquivo);
      setImagemFundo(img);
      // Panfleto sai até ~3300 px de largura (ver PRESETS × ESCALA_EXPORTACAO_PANFLETO).
      const arquivoId = await enviarFundoParaServidor(img, 3300);
      fundoMostradoRef.current = arquivoId; // já está na tela
      setPanfletoFundo({ nome: arquivo.name, arquivoId });
    } catch {
      setToast('Não foi possível salvar a imagem de fundo no servidor. Confira a conexão e tente de novo.');
    } finally {
      setEnviandoFundo(false);
    }
  }

  /**
   * Logomarca do panfleto — uma só pra ele todo, posicionável na prévia
   * (mesma edição por arrasto do Story). Sobe pro R2 e fica salva no
   * projeto junto com a posição, igual ao PNG extra do Story.
   */
  async function handleEscolherImagemLogo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo || !projetoAtivo) return;
    let carregada: Awaited<ReturnType<typeof carregarImagemEBlobDeArquivo>>;
    try {
      carregada = await carregarImagemEBlobDeArquivo(arquivo);
    } catch {
      setToast('Não foi possível ler esse PNG. Tente outro.');
      return;
    }
    const { imagem: png, blob, mimeType } = carregada;
    const pagina = dimensoesPaginasRef.current[paginaAtual] ?? dimensoesPaginasRef.current[0];
    // Trocar o PNG mantém a posição escolhida; só a primeira logo ganha a posição padrão.
    const caixa = logoCaixa ?? (pagina ? caixaLogoPadrao(png, pagina, tamanhoBorda) : null);
    setImagemLogo(png);
    setLogoCaixa(caixa);
    setLogoSelecionada(true);

    setEnviandoLogo(true);
    try {
      const arquivoId = await arquivoCartazService.enviarImagem(blob, mimeType, projetoAtivo.id);
      setLogoArquivoId(arquivoId);
      persistirProdutos(produtosRef.current, { logoArquivoId: arquivoId, logoCaixa: caixa });
    } catch {
      setToast('Não foi possível enviar essa logomarca. Tente de novo.');
    } finally {
      setEnviandoLogo(false);
    }
  }

  function handleRemoverLogo() {
    setImagemLogo(null);
    setLogoArquivoId(null);
    setLogoCaixa(null);
    setLogoSelecionada(false);
  }

  async function handleUsarProdutoRecente(produto: ProdutoRecente) {
    const url = urlsRecentes[produto.arquivoId];
    if (!url || !projetoAtivo) {
      setToast('Essa foto não está mais disponível.');
      return;
    }
    try {
      const img = await carregarImagemDeDataUrl(url);
      setImagemPendente(img);
      setImagemPendenteArquivoId(null);
      setNomeProduto(produto.name || '');
      setDeProduto(produto.de || '');
      setPorProduto(produto.por || '');
      // Nunca reaproveita a mesma referência de arquivo — ela pode já
      // pertencer a outro projeto (ver duplicarFotoRecentePendente).
      duplicarFotoRecentePendente(produto.arquivoId);
    } catch {
      setToast('Não consegui recuperar a foto desse produto.');
    }
  }

  /**
   * Grava a descrição no dicionário da farmácia e atualiza todo produto do
   * panfleto com a mesma chave. Produto de projeto antigo (sem `nomeOriginal`)
   * passa a usar o nome de antes da edição como original.
   */
  function handleEditarDescricao(idx: number, novo: string) {
    const alvo = produtos[idx];
    if (!alvo) return;
    const original = alvo.nomeOriginal ?? alvo.nome;
    salvarDescricaoProduto(original, alvo.ean, novo);
    const chave = chaveDescricaoProduto(original, alvo.ean);
    setProdutos((atual) => atual.map((p, i) => {
      const orig = i === idx ? original : p.nomeOriginal;
      if (!orig || chaveDescricaoProduto(orig, p.ean) !== chave) return p;
      return { ...p, nomeOriginal: orig, nome: descricaoDoProduto(orig, p.ean) };
    }));
    setToast('Descrição salva — vale no panfleto, no tablet e no importar.');
  }

  /**
   * Mover/redimensionar um card personaliza a posição DAQUELE índice em todas
   * as páginas; os outros continuam onde estavam (grade padrão, na primeira vez).
   */
  layoutAtualRef.current = { cardsCaixas, cardsCaixasPagina, logoCaixa };

  function atualizarContagemHistorico() {
    setTamanhoHistorico({ desfazer: historicoRef.current.desfazer.length, refazer: historicoRef.current.refazer.length });
  }

  /** Guarda como estava ANTES de uma mudança (até 50 passos); uma mudança nova apaga o "refazer". */
  function guardarParaDesfazer() {
    const h = historicoRef.current;
    h.desfazer.push(layoutAtualRef.current);
    if (h.desfazer.length > 50) h.desfazer.shift();
    h.refazer = [];
    atualizarContagemHistorico();
  }

  function aplicarFoto(foto: FotoLayout) {
    setCardsCaixas(foto.cardsCaixas);
    setCardsCaixasPagina(foto.cardsCaixasPagina);
    setLogoCaixa(foto.logoCaixa);
  }

  function desfazer() {
    const h = historicoRef.current;
    const anterior = h.desfazer.pop();
    if (!anterior) return;
    h.refazer.push(layoutAtualRef.current);
    aplicarFoto(anterior);
    atualizarContagemHistorico();
  }

  function refazer() {
    const h = historicoRef.current;
    const proximo = h.refazer.pop();
    if (!proximo) return;
    h.desfazer.push(layoutAtualRef.current);
    aplicarFoto(proximo);
    atualizarContagemHistorico();
  }

  /** Primeira mudança de um arraste: guarda o "antes" uma vez só. */
  function guardarSeGestoNovo() {
    if (!gestoNovoRef.current) return;
    gestoNovoRef.current = false;
    guardarParaDesfazer();
  }

  /** Posições completas (todos os índices da página) que o escopo escolhido está usando agora. */
  function layoutDoEscopo(): CaixaCardPanfleto[] {
    const sizing = PRESETS_TAMANHO_PANFLETO[itensPorPagina] || PRESETS_TAMANHO_PANFLETO[9];
    const grade = gradePadraoPanfleto(itensPorPagina, sizing, tamanhoBorda, link.trim().length > 0);
    const daPagina = escopoCards === 'pagina' ? cardsCaixasPagina[paginaAtual] : undefined;
    return grade.map((padrao, j) => daPagina?.[j] ?? cardsCaixas?.[j] ?? padrao);
  }

  function gravarLayoutDoEscopo(layout: CaixaCardPanfleto[]) {
    if (escopoCards === 'pagina') setCardsCaixasPagina((atual) => ({ ...atual, [paginaAtual]: layout }));
    else setCardsCaixas(layout);
  }

  function handleMoverCard(indice: number, caixa: { x: number; y: number; largura: number; altura: number }, pagina: DimensaoPaginaPanfleto) {
    const nova: CaixaCardPanfleto = { x: caixa.x / pagina.largura, y: caixa.y / pagina.altura, largura: caixa.largura / pagina.largura, altura: caixa.altura / pagina.altura };
    guardarSeGestoNovo();
    const layout = layoutDoEscopo();
    if (selecionados.length > 1 && selecionados.includes(indice) && layout[indice]) {
      const atual = layout[indice];
      // Mesma largura = arrastou pelo meio (move os selecionados); mudou = puxou a borda (escala os selecionados juntos).
      const redimensionou = Math.abs(nova.largura - atual.largura) > 1e-6 || Math.abs(nova.altura - atual.altura) > 1e-6;
      gravarLayoutDoEscopo(
        aplicarNosSelecionados(layout, selecionados, (grupo) =>
          redimensionou ? escalarGrupoCards(grupo, nova.largura / atual.largura) : moverGrupoCards(grupo, nova.x - atual.x, nova.y - atual.y),
        ),
      );
      return;
    }
    gravarLayoutDoEscopo(layout.map((atual, j) => (j === indice ? nova : atual)));
  }

  /** Move todos os produtos juntos (setas) — `dx`/`dy` em px da página. */
  /** Índices em que as setas e o −/+ agem: os selecionados, ou todos quando nada está selecionado. */
  function indicesAlvo(layout: CaixaCardPanfleto[]) {
    return selecionados.length > 0 ? selecionados.filter((i) => i < layout.length) : layout.map((_, i) => i);
  }

  function handleMoverTodos(dx: number, dy: number) {
    if (!dimensaoPaginaAtual) return;
    guardarParaDesfazer();
    const layout = layoutDoEscopo();
    gravarLayoutDoEscopo(aplicarNosSelecionados(layout, indicesAlvo(layout), (grupo) => moverGrupoCards(grupo, dx / dimensaoPaginaAtual.largura, dy / dimensaoPaginaAtual.altura)));
  }

  function handleEscalarTodos(fator: number) {
    guardarParaDesfazer();
    const layout = layoutDoEscopo();
    gravarLayoutDoEscopo(aplicarNosSelecionados(layout, indicesAlvo(layout), (grupo) => escalarGrupoCards(grupo, fator)));
  }

  /** Clique num card: com Ctrl/Shift ou no modo "Selecionar vários" marca/desmarca; sem isso, seleciona só ele (ou mantém o grupo, pra arrastar). */
  function handleSelecionarCard(i: number, aditivo: boolean) {
    setLogoSelecionada(false);
    // Ao APERTAR nunca desmarca — senão apertar um selecionado pra arrastar o grupo tirava ele do grupo
    // e só ele se mexia. Desmarcar fica pro clique sem arrastar (handleCliqueCard).
    jaEstavaSelecionadoRef.current = selecionados.includes(i);
    gestoNovoRef.current = true;
    setSelecionados((atual) => {
      if (atual.includes(i)) return atual;
      return aditivo || selecionarVarios ? [...atual, i] : [i];
    });
  }

  /** Apertou e soltou sem arrastar: no modo de vários, desmarca quem já estava marcado; sem ele, fica só este selecionado. */
  function handleCliqueCard(i: number, aditivo: boolean) {
    if (aditivo || selecionarVarios) {
      if (jaEstavaSelecionadoRef.current) setSelecionados((atual) => atual.filter((j) => j !== i));
      return;
    }
    setSelecionados([i]);
  }

  /** Converte a posição do mouse na prévia pra px da página. */
  function pontoNaPagina(clientX: number, clientY: number) {
    const stage = stageRef.current;
    if (!stage || !dimensaoPaginaAtual) return null;
    const r = stage.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * dimensaoPaginaAtual.largura, y: ((clientY - r.top) / r.height) * dimensaoPaginaAtual.altura };
  }

  /** Solta a caixa de seleção: seleciona os produtos que ela toca (com Ctrl/Shift, soma aos já selecionados). */
  function finalizarCaixaSelecao() {
    const c = caixaSelecao;
    setCaixaSelecao(null);
    if (!c || !dimensaoPaginaAtual?.cards) return;
    const esq = Math.min(c.x0, c.x1);
    const dir = Math.max(c.x0, c.x1);
    const topo = Math.min(c.y0, c.y1);
    const base = Math.max(c.y0, c.y1);
    if (dir - esq < 4 && base - topo < 4) return; // foi só um clique no vazio
    const tocados = dimensaoPaginaAtual.cards
      .map((card, i) => ({ card, i }))
      .filter(({ card }) => card.x < dir && card.x + card.largura > esq && card.y < base && card.y + card.altura > topo)
      .map(({ i }) => i);
    setSelecionados((atual) => (c.aditivo ? Array.from(new Set([...atual, ...tocados])) : tocados));
  }

  /** "Todas as páginas" volta tudo pra grade (inclusive ajustes de página); "Só esta página" tira só o ajuste dela. */
  function handleVoltarParaGrade() {
    guardarParaDesfazer();
    if (escopoCards === 'pagina') {
      setCardsCaixasPagina((atual) => {
        const resto = { ...atual };
        delete resto[paginaAtual];
        return resto;
      });
    } else {
      setCardsCaixas(null);
      setCardsCaixasPagina({});
    }
    setSelecionados([]);
  }

  /** Descrição vai pro dicionário da farmácia (vale no tablet e no importar); preços, só neste produto. */
  function handleSalvarEdicaoProduto(idx: number, edicao: EdicaoProdutoPanfleto) {
    const alvo = produtos[idx];
    if (!alvo) return;
    if (edicao.nome !== alvo.nome) handleEditarDescricao(idx, edicao.nome);
    setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, de: edicao.de, por: edicao.por } : p)));
    setEditandoIdx(null);
    if (edicao.nome === alvo.nome) setToast('Produto atualizado.');
  }

  function handleAdicionarProduto() {
    const nomeTrim = nomeProduto.trim();
    if (!imagemPendente) {
      setToast('Escolha a foto do produto antes de adicionar.');
      return;
    }
    if (enviandoPendente) {
      setToast('Aguarde a foto terminar de enviar antes de adicionar.');
      return;
    }
    if (!imagemPendenteArquivoId) {
      setToast('O envio dessa foto falhou — tente de novo antes de adicionar.');
      return;
    }
    if (!nomeTrim) {
      setToast('Digite o nome do produto.');
      return;
    }
    if (!porProduto) {
      setToast('Digite o preço "Por".');
      return;
    }

    setProdutos((atual) => [...atual, { imagem: imagemPendente, nome: descricaoDoProduto(nomeTrim), nomeOriginal: nomeTrim, de: deProduto, por: porProduto, transform: TRANSFORM_PADRAO_PANFLETO, arquivoId: imagemPendenteArquivoId }]);
    salvarProdutoRecente({ arquivoId: imagemPendenteArquivoId, name: nomeTrim, de: deProduto, por: porProduto });
    setProdutosRecentes(carregarProdutosRecentes());

    setImagemPendente(null);
    setImagemPendenteArquivoId(null);
    setNomeProduto('');
    setDeProduto('');
    setPorProduto('');
  }

  function handleRemoverProduto(idx: number) {
    setProdutos((atual) => atual.filter((_, i) => i !== idx));
    // Os índices andam com a remoção — um editor aberto apontaria pro produto errado.
    setEditandoIdx(null);
  }

  function handleRemoverTodos() {
    if (produtos.length === 0) return;
    if (!window.confirm(`Remover todos os ${produtos.length} produtos do panfleto?`)) return;
    setProdutos([]);
  }

  /** Gera o conteúdo pra baixar — uma página vira PNG direto, mais de uma vira um .zip com todas. */
  async function gerarConteudoPanfleto(): Promise<{ conteudo: string | Blob; nomeArquivo: string; mime: string } | null> {
    const paginas = paginasCanvasRef.current;
    if (paginas.length <= 1) {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return { conteudo: canvas.toDataURL('image/png'), nomeArquivo: `panfleto-${Date.now()}.png`, mime: 'image/png' };
    }

    const zip = new JSZip();
    for (let i = 0; i < paginas.length; i++) {
      const blob = await new Promise<Blob>((resolve, reject) => {
        paginas[i].toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png');
      });
      zip.file(`panfleto-parte-${i + 1}.png`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return { conteudo: zipBlob, nomeArquivo: `panfletos-${Date.now()}.zip`, mime: 'application/zip' };
  }

  async function handleBaixarPanfleto() {
    setSalvando(true);
    try {
      const resultado = await gerarConteudoPanfleto();
      if (!resultado) return;
      const tituloCompartilhamento = titulo.trim() || nomeLoja.trim() || 'Panfleto de ofertas';
      await salvarOuCompartilharArquivo(resultado.conteudo, resultado.nomeArquivo, resultado.mime, tituloCompartilhamento);
    } catch {
      setToast('Não foi possível gerar os panfletos. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  async function handleBaixarPanfletoDireto() {
    setSalvandoDireto(true);
    try {
      const resultado = await gerarConteudoPanfleto();
      if (!resultado) return;
      await baixarArquivoDireto(resultado.conteudo, resultado.nomeArquivo, resultado.mime);
    } catch {
      setToast('Não foi possível gerar os panfletos. Tente novamente.');
    } finally {
      setSalvandoDireto(false);
    }
  }

  async function handleCopiarTexto() {
    if (produtos.length === 0) {
      setToast('Adicione produtos ao panfleto antes de gerar o texto.');
      return;
    }
    let texto = `🔥 *${(titulo || 'Ofertas').toUpperCase()} — DROGARIA CENTER* 🔥\n\n`;
    produtos.forEach((p) => {
      texto += `${montarTextoPromocional(p.nome, p.de, p.por)}\n\n`;
    });
    texto += '📍 Venha conferir na loja ou chama no WhatsApp!';

    try {
      await navigator.clipboard.writeText(texto);
      setToast('Texto copiado! Já pode colar no WhatsApp/Instagram.');
    } catch {
      setToast('Não foi possível copiar automaticamente — selecione e copie o texto manualmente.');
    }
  }

  function handleSalvarAjuste(transform: TransformImagem) {
    if (ajusteIdx !== null) {
      setProdutos((atual) => atual.map((p, i) => (i === ajusteIdx ? { ...p, transform } : p)));
    }
    setAjusteIdx(null);
  }

  function handleSalvarAjustesStory(idx: number, ajustesStory: AjustesStoryProduto, campos: { nome: string; de: string; por: string }) {
    setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, ...campos, ajustesStory } : p)));
  }

  /**
   * Tira de todos os produtos os ajustes próprios de cor, letra e tamanho do
   * story — eles voltam a seguir o padrão do Story. Posições (inclusive as
   * do "Analisar e ajustar posição") ficam como estão. Conserta produtos que
   * "congelaram" o estilo por terem sido salvos/baixados pelo 📱 antes de o
   * editor gravar só o que foi mudado.
   */
  function handleAplicarEstiloPadraoEmTodos() {
    let afetados = 0;
    const atualizados = produtos.map((produto) => {
      if (!produto.ajustesStory || !temEstiloProprio(produto)) return produto;
      afetados++;
      const restante = { ...produto.ajustesStory };
      CAMPOS_ESTILO_STORY.forEach((campo) => delete restante[campo]);
      return { ...produto, ajustesStory: Object.keys(restante).length > 0 ? restante : undefined };
    });
    setProdutos(atualizados);
    setToast(`Cores, letras e tamanhos do Story aplicados em ${afetados} produto(s).`);
  }

  function handleSugerirPosicaoTodos() {
    if (produtos.length === 0) {
      setToast('Adicione produtos ao panfleto antes de analisar as fotos.');
      return;
    }
    let ajustados = 0;
    const atualizados = produtos.map((produto) => {
      const sugestao = sugerirPosicoesTexto(produto.imagem, produto.transform);
      if (!sugestao) return produto;
      ajustados++;
      return {
        ...produto,
        ajustesStory: {
          ...produto.ajustesStory,
          guiaNome: { y: sugestao.nomeY, offsetX: 0 },
          guiaPreco: { y: sugestao.precoY, offsetX: 0 },
          guiaFrases: { y: sugestao.frasesY, offsetX: 0 },
        },
      };
    });
    setProdutos(atualizados);
    setToast(
      ajustados > 0
        ? `Posição ajustada em ${ajustados} de ${produtos.length} produto(s). Ainda dá pra arrastar individualmente em "📱".`
        : 'Não consegui analisar as fotos — ajuste a posição manualmente em cada produto.',
    );
  }

  async function handleGerarGaleriaStories() {
    if (produtos.length === 0) {
      setToast('Adicione produtos ao panfleto antes de gerar os stories.');
      return;
    }
    const configPadrao = carregarConfiguracoes() || {};
    const parametrosPorProduto = produtos.map((produto) => montarParametrosStoryProduto(produto, configPadrao, EMOJI_PADRAO_STORY, logoPadraoStory));
    // O canvas não espera fonte carregar — sem isso, uma fonte escolhida no Story sairia na reserva do sistema.
    await carregarFontesCartaz(parametrosPorProduto.flatMap((p) => [p.fonteNome, p.fontePreco, p.fonteFrases]));
    const itens = produtos.map((produto, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = LARGURA_STORY;
      canvas.height = ALTURA_STORY;
      const ctx = canvas.getContext('2d')!;
      pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, parametrosPorProduto[i]);
      const nomeSeguro = produto.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || `produto-${i + 1}`;
      return { conteudo: canvas.toDataURL('image/png'), nomeArquivo: `story-${String(i + 1).padStart(2, '0')}-${nomeSeguro}.png`, mime: 'image/png', rotulo: produto.nome };
    });
    setItensGaleriaStories(itens);
  }

  async function handleBaixarTodosStories() {
    if (!itensGaleriaStories) return;
    setBaixandoStories(true);
    try {
      const tituloCompartilhamento = `${itensGaleriaStories.length} ${itensGaleriaStories.length === 1 ? 'story' : 'stories'} — ${titulo.trim() || nomeLoja.trim() || 'ofertas'}`;
      await compartilharOuBaixarVarios(itensGaleriaStories, `stories-${Date.now()}.zip`, tituloCompartilhamento);
      setItensGaleriaStories(null);
    } catch {
      setToast('Não foi possível gerar os stories. Tente novamente.');
    } finally {
      setBaixandoStories(false);
    }
  }

  function handleTrocarProjeto() {
    setMostrarPainelProjetos(true);
  }

  function OpcoesAlinhamento({ value, onChange }: { value: AlinhamentoTexto; onChange: (v: AlinhamentoTexto) => void }) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value as AlinhamentoTexto)}>
        <option value="left">Esquerda</option>
        <option value="center">Centro</option>
        <option value="right">Direita</option>
      </select>
    );
  }

  if (carregandoProjeto) {
    return <div className="card cartaz-painel">Carregando…</div>;
  }

  return (
    <>
      {mostrarPainelProjetos && (
        <ProjetosCartazPainel tipo="panfleto" onAbrirProjeto={aplicarProjeto} onFechar={projetoAtivo ? () => setMostrarPainelProjetos(false) : undefined} />
      )}

      {projetoAtivo && (
        <div className="cartaz-cols">
          <div className="card cartaz-painel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 className="cartaz-titulo-secao" style={{ margin: 0 }}>
                Adicionar produto ao panfleto
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {salvandoPendente && <span className="footnote" style={{ margin: 0 }}>Salvando…</span>}
                <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, fontSize: 12 }} onClick={handleTrocarProjeto}>
                  📁 {projetoAtivo.nome}
                </button>
              </div>
            </div>

            {produtosRecentes.length > 0 && (
              <div className="field" style={{ marginBottom: 10 }}>
                <label>Últimos produtos usados</label>
                <div className="cartaz-recentes">
                  {produtosRecentes.map((p) => (
                    <button
                      type="button"
                      key={`${p.name}-${p.usedAt}`}
                      className="cartaz-recente-item"
                      title={`Usar "${p.name}" de novo`}
                      onClick={() => handleUsarProdutoRecente(p)}
                    >
                      {urlsRecentes[p.arquivoId] ? <img src={urlsRecentes[p.arquivoId]} alt="" /> : <span aria-hidden="true">💊</span>}
                      <span className="cartaz-recente-nome">{p.name}</span>
                      <span className="cartaz-recente-preco">R${fmtMoney(p.por)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <label
                className="upload-box"
                style={{ display: 'block', cursor: enviandoPendente ? 'wait' : 'pointer', flex: 1, margin: 0 }}
                onClick={() => !enviandoPendente && inputPendenteRef.current?.click()}
              >
                {carregandoImagem
                  ? '⏳ Carregando foto...'
                  : enviandoPendente
                    ? '⬆️ Enviando...'
                    : imagemPendente
                      ? '📷 Trocar foto'
                      : '📷 Escolher foto'}
              </label>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, whiteSpace: 'nowrap' }} disabled={enviandoPendente} onClick={() => setCameraDestino('pendente')}>
                📸 Tirar foto
              </button>
              <input ref={inputPendenteRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEscolherArquivoPendente} />
            </div>
            {imagemPendente && (
              <div style={{ marginBottom: 10 }}>
                <img src={imagemPendente.src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
              </div>
            )}
            {erroPendente && (
              <p className="footnote" style={{ textAlign: 'left', color: '#c0392b', margin: '0 0 10px' }}>
                A foto não foi enviada.{' '}
                <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, padding: '2px 8px', fontSize: 12 }} onClick={handleTentarNovamentePendente}>
                  Tentar de novo
                </button>
              </p>
            )}

            <div className="field">
              <label>Nome do produto</label>
              <input value={nomeProduto} onChange={(e) => setNomeProduto(e.target.value)} placeholder="Ex: SIMETICONA 125MG 30CAP" />
            </div>
            <div className="field-row">
              <div className="field">
                <label>De (R$)</label>
                <input type="number" step="0.01" value={deProduto} onChange={(e) => setDeProduto(e.target.value)} placeholder="20,99" />
              </div>
              <div className="field">
                <label>Por (R$)</label>
                <input type="number" step="0.01" value={porProduto} onChange={(e) => setPorProduto(e.target.value)} placeholder="9,99" />
              </div>
            </div>
            <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={handleAdicionarProduto}>
              + Adicionar ao panfleto
            </button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20 }}>
              <h3 className="cartaz-titulo-secao" style={{ margin: 0 }}>
                Produtos no panfleto
              </h3>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, fontSize: 12, padding: '6px 10px' }} onClick={handleRemoverTodos}>
                🗑️ Remover todos
              </button>
            </div>
            {aoAbrirConfiguracaoPadrao && (
              <button
                type="button"
                className="btn-ghost"
                style={{ width: '100%', fontSize: 12, margin: '8px 0 0' }}
                onClick={aoAbrirConfiguracaoPadrao}
              >
                🖋️ Editar tamanho/posição padrão dos stories (vale pra todo produto sem ajuste próprio)
              </button>
            )}
            {produtos.some(temEstiloProprio) && (
              <button
                type="button"
                className="btn-ghost"
                style={{ width: '100%', fontSize: 12, margin: '8px 0 0' }}
                onClick={handleAplicarEstiloPadraoEmTodos}
                title="Alguns produtos têm cor, letra ou tamanho próprios no story e não seguem o padrão do Story"
              >
                🎨 Aplicar cores, letras e tamanhos do Story em todos ({produtos.filter(temEstiloProprio).length} com estilo próprio)
              </button>
            )}
            {produtos.length > 0 && (
              <button
                type="button"
                className="btn-ghost"
                style={{ width: '100%', fontSize: 12, margin: '8px 0 0' }}
                onClick={handleSugerirPosicaoTodos}
                title="Analisa a foto de cada produto e ajusta nome/preço pra evitar tapar o produto"
              >
                🪄 Analisar e ajustar posição de todas as fotos
              </button>
            )}
            {produtos.length > 0 && (
              <button
                type="button"
                className="btn-primary"
                style={{ width: '100%', fontSize: 12, margin: '8px 0 0' }}
                onClick={handleGerarGaleriaStories}
              >
                👁️ Ver todos os stories antes de baixar ({produtos.length})
              </button>
            )}
            <div className="product-list">
              {produtos.length === 0 && <div className="empty-note">Nenhum produto adicionado ainda.</div>}
              {produtos.map((p, idx) => (
                <div className="product-row" key={`${p.nome}-${idx}`}>
                  <img src={p.imagem.src} alt="" />
                  <div className="pinfo">
                    {editandoIdx === idx ? (
                      <EditorProdutoPanfleto
                        inicial={{ nome: p.nome, de: p.de, por: p.por }}
                        onSalvar={(edicao) => handleSalvarEdicaoProduto(idx, edicao)}
                        onCancelar={() => setEditandoIdx(null)}
                      />
                    ) : (
                      <>
                        <div className="pname">{p.nome}</div>
                        <div className="pprice">
                          {p.de ? `De R${fmtMoney(p.de)} · ` : ''}Por R${fmtMoney(p.por)}
                        </div>
                      </>
                    )}
                    {statusUploadProdutos[idx]?.enviando && <span className="bstatus searching">Enviando foto...</span>}
                    {statusUploadProdutos[idx]?.erro && (
                      <span className="bstatus failed">
                        Falha no envio —{' '}
                        <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, padding: '1px 6px', fontSize: 11 }} onClick={() => handleTentarNovamenteProduto(idx)}>
                          Tentar de novo
                        </button>
                      </span>
                    )}
                  </div>
                  <div className="product-row-acoes">
                    <button type="button" className="product-row-acao" title="Editar descrição e preço" aria-label={`Editar descrição e preço de ${p.nome}`} onClick={() => setEditandoIdx(editandoIdx === idx ? null : idx)}>
                      ✏️
                    </button>
                    <button
                      type="button"
                      className="product-row-acao"
                      title="Trocar foto (galeria)"
                      onClick={() => {
                        trocaAlvoIdx.current = idx;
                        inputTrocaRef.current?.click();
                      }}
                    >
                      🔄
                    </button>
                    <button type="button" className="product-row-acao" title="Trocar foto (câmera)" onClick={() => setCameraDestino(idx)}>
                      📸
                    </button>
                    <button type="button" className="product-row-acao" title="Ajustar enquadramento da foto (usado ao gerar story individual)" onClick={() => setAjusteIdx(idx)}>
                      🖼️
                    </button>
                    <button type="button" className="product-row-acao" title="Editar e baixar o story individual deste produto" onClick={() => setEditarStoryIdx(idx)}>
                      📱
                    </button>
                    <button type="button" title="Remover" onClick={() => handleRemoverProduto(idx)}>
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <input ref={inputTrocaRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleTrocarFotoProduto} />

            <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '16px 0' }} />

            <h3 className="cartaz-titulo-secao">Textos do cabeçalho</h3>
            <label className="cartaz-checkbox">
              <input type="checkbox" checked={mostrarTextosCabecalho} onChange={(e) => setMostrarTextosCabecalho(e.target.checked)} /> Mostrar
              textos do cabeçalho
            </label>
            <p style={{ fontSize: 12, color: 'var(--ink-soft)', margin: '-4px 0 10px' }}>
              É o texto do topo de cada página (ex.: “Drogaria Center — Ofertas — parte 1/5”). Desmarque para tirar de todas as páginas.
            </p>
            <div className="field-row">
              <div className="field" style={{ flex: 2 }}>
                <label>Nome da loja</label>
                <input value={nomeLoja} onChange={(e) => setNomeLoja(e.target.value)} />
              </div>
              <div className="field">
                <label>Posição</label>
                <OpcoesAlinhamento value={nomeLojaAlinhamento} onChange={setNomeLojaAlinhamento} />
              </div>
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 2 }}>
                <label>Título/chamada</label>
                <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
              </div>
              <div className="field">
                <label>Posição</label>
                <OpcoesAlinhamento value={tituloAlinhamento} onChange={setTituloAlinhamento} />
              </div>
            </div>
            <div className="field-row">
              <SeletorCor rotulo="Cor do nome da loja" valor={corNomeLoja ?? corLogo} onAlterar={setCorNomeLoja} canvasArte={canvasRef} />
              <SeletorCor rotulo="Cor do título/chamada" valor={corTitulo ?? corLogo} onAlterar={setCorTitulo} canvasArte={canvasRef} />
            </div>

            <h3 className="cartaz-titulo-secao" style={{ marginTop: 18 }}>
              Textos do rodapé
            </h3>
            <label className="cartaz-checkbox">
              <input type="checkbox" checked={mostrarTextosRodape} onChange={(e) => setMostrarTextosRodape(e.target.checked)} /> Mostrar
              textos do rodapé
            </label>
            <div className="field-row">
              <div className="field" style={{ flex: 2 }}>
                <label>Frase principal do rodapé</label>
                <input value={textoRodape1} onChange={(e) => setTextoRodape1(e.target.value)} />
              </div>
              <div className="field">
                <label>Posição</label>
                <OpcoesAlinhamento value={textoRodape1Alinhamento} onChange={setTextoRodape1Alinhamento} />
              </div>
            </div>
            <div className="field-row">
              <div className="field" style={{ flex: 2 }}>
                <label>Frase secundária do rodapé</label>
                <input value={textoRodape2} onChange={(e) => setTextoRodape2(e.target.value)} />
              </div>
              <div className="field">
                <label>Posição</label>
                <OpcoesAlinhamento value={textoRodape2Alinhamento} onChange={setTextoRodape2Alinhamento} />
              </div>
            </div>
            <div className="field-row">
              <SeletorCor rotulo="Cor da frase principal" valor={corRodape1 ?? COR_RODAPE1_PADRAO} onAlterar={setCorRodape1} canvasArte={canvasRef} />
              <SeletorCor rotulo="Cor da frase secundária" valor={corRodape2 ?? COR_RODAPE2_PADRAO} onAlterar={setCorRodape2} canvasArte={canvasRef} />
            </div>
            <div className="field">
              <label>Posição do QR Code</label>
              <select value={qrAlinhamento} onChange={(e) => setQrAlinhamento(e.target.value as 'left' | 'right')}>
                <option value="left">Esquerda</option>
                <option value="right">Direita</option>
              </select>
            </div>
            <p className="footnote" style={{ textAlign: 'left', margin: '-6px 0 14px' }}>
              Dica: se o texto e o QR Code ficarem se sobrepondo, escolha posições opostas (ex: QR à esquerda, texto
              centralizado ou à direita).
            </p>

            <div className="field">
              <label>Itens por panfleto</label>
              <select
                value={itensPorPagina}
                onChange={(e) => {
                  setItensPorPagina(Number(e.target.value));
                  // Outra quantidade por página muda a grade inteira — as posições arrastadas não servem mais.
                  setCardsCaixas(null);
                  setCardsCaixasPagina({});
                  setSelecionados([]);
                }}
              >
                {ITENS_POR_PAGINA_OPCOES.map((n) => (
                  <option key={n} value={n}>
                    {n === 3 ? '3 (fotos grandes)' : n === 9 ? '9 (padrão)' : n === 12 ? '12 (fotos menores)' : n}
                  </option>
                ))}
              </select>
            </div>
            <p className="footnote" style={{ textAlign: 'left', margin: '-6px 0 12px' }}>
              Se tiver mais produtos do que cabe, o restante vira automaticamente outros panfletos (baixados juntos num
              .zip).
            </p>

            <div className="field-row">
              <SeletorCor rotulo="Cor da logo" valor={corLogo} onAlterar={setCorLogo} canvasArte={canvasRef} />
              <SeletorCor rotulo="Cor da descrição" valor={corDescricao} onAlterar={setCorDescricao} canvasArte={canvasRef} />
              <SeletorCor rotulo="Cor do preço" valor={corPreco} onAlterar={setCorPreco} canvasArte={canvasRef} />
            </div>
            <SeletorCor
              rotulo="Cor de fundo dos quadrantes dos produtos"
              valor={corFundoCard}
              onAlterar={setCorFundoCard}
              canvasArte={canvasRef}
             
              permitirSemFundo
            />
            <div className="field-row">
              <div className="field">
                <label>Tamanho da descrição {tamanhoNome}px</label>
                <input type="range" min={10} max={24} value={tamanhoNome} onChange={(e) => setTamanhoNome(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Tamanho do preço {tamanhoPreco}px</label>
                <input type="range" min={13} max={30} value={tamanhoPreco} onChange={(e) => setTamanhoPreco(Number(e.target.value))} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Tamanho da borda externa {tamanhoBorda}px</label>
                <input type="range" min={12} max={90} value={tamanhoBorda} onChange={(e) => setTamanhoBorda(Number(e.target.value))} />
              </div>
              <div className="field">
                <label>Tamanho da letra do selo de desconto {tamanhoSelo}px</label>
                <input type="range" min={9} max={22} value={tamanhoSelo} onChange={(e) => setTamanhoSelo(Number(e.target.value))} />
              </div>
            </div>
            <div className="field-row">
              <SeletorCor rotulo="Fundo do selo de desconto" valor={corFundoSelo} onAlterar={setCorFundoSelo} canvasArte={canvasRef} permitirSemFundo />
              <SeletorCor rotulo="Letra do selo de desconto" valor={corTextoSelo} onAlterar={setCorTextoSelo} canvasArte={canvasRef} />
            </div>

            <div className="field">
              <label>Imagem de fundo do panfleto (opcional)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label
                  className="upload-box"
                  style={{ display: 'block', cursor: 'pointer', flex: 1, margin: 0, fontSize: 12, padding: 14 }}
                  onClick={() => !enviandoFundo && inputFundoRef.current?.click()}
                >
                  {enviandoFundo ? 'Enviando imagem de fundo…' : imagemFundo ? '🖼️ Trocar imagem de fundo' : '🖼️ Escolher imagem de fundo'}
                </label>
                <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} disabled={enviandoFundo || !imagemFundo} onClick={() => setPanfletoFundo(null)}>
                  Remover
                </button>
              </div>
              <input ref={inputFundoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEscolherImagemFundo} />
              <label className="cartaz-checkbox" style={{ marginTop: 10 }}>
                <input type="checkbox" checked={manterFaixaBranca} onChange={(e) => setManterFaixaBranca(e.target.checked)} /> Manter faixa
                branca atrás do cabeçalho e do rodapé (ajuda a ler o texto sobre a imagem de fundo)
              </label>
            </div>

            <div className="cartaz-imagem-extra">
              <div>
                <strong>Logomarca ou selo</strong>
                <span>PNG com fundo transparente, uma vez só no panfleto. Clique nela na prévia pra arrastar e redimensionar.</span>
              </div>
              <div className="cartaz-imagem-extra-actions">
                <button type="button" className="btn-ghost" disabled={enviandoLogo} onClick={() => inputLogoRef.current?.click()}>
                  {enviandoLogo ? 'Enviando...' : imagemLogo ? 'Trocar PNG' : '+ Adicionar PNG'}
                </button>
                {imagemLogo && (
                  <button type="button" className="btn-ghost" onClick={handleRemoverLogo}>
                    Remover
                  </button>
                )}
              </div>
              <input ref={inputLogoRef} type="file" accept="image/png" style={{ display: 'none' }} onChange={handleEscolherImagemLogo} />
            </div>

            <div className="field">
              <label>Link do Pix / WhatsApp para o QR Code (opcional)</label>
              <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Ex: https://wa.me/5511999999999" />
            </div>

            <div className="cartaz-actions">
              <button type="button" className="btn-ghost" onClick={handleBaixarPanfleto} disabled={salvando}>
                {salvando ? 'Gerando…' : '⬇️ Baixar ou compartilhar (WhatsApp etc.)'}
              </button>
              <button type="button" className="btn-primary" onClick={handleBaixarPanfletoDireto} disabled={salvandoDireto}>
                {salvandoDireto ? 'Gerando…' : '💾 Salvar direto no computador'}
              </button>
            </div>
            <p className="footnote" style={{ textAlign: 'left', margin: '4px 0 0' }}>
              "Salvar direto no computador" vai sem passar pela folha de compartilhar — cai certinho na pasta de
              Downloads.
            </p>
            <div className="cartaz-actions cartaz-actions--single">
              <button type="button" className="btn-ghost" onClick={handleCopiarTexto}>
                📋 Copiar texto pronto (WhatsApp/Instagram)
              </button>
            </div>
            <p className="footnote">Sem limite de gerações. Adicione quantos produtos quiser — o layout se ajusta sozinho.</p>
          </div>

          <div className="cartaz-preview">
            <div className="cartaz-preview-head">
              <strong>Prévia em tempo real</strong>
              <span>
                {logoSelecionada
                  ? 'Logomarca selecionada — arraste pra mover; pelas bordas, muda o tamanho.'
                  : selecionados.length > 1
                    ? `${selecionados.length} produtos selecionados — arraste qualquer um pra mover todos juntos.`
                    : 'Arraste um produto pra mover. Pra vários: faça uma caixa no espaço vazio ou Ctrl + clique. Ctrl + Z desfaz.'}
              </span>
            </div>
            <div className="panfleto-ajustes" aria-label="Ajustar produtos">
              <div className="panfleto-ajustes-linha">
                <div className="panfleto-mover-escopo" role="radiogroup" aria-label="Onde aplicar">
                  <button type="button" role="radio" aria-checked={escopoCards === 'todas'} className={escopoCards === 'todas' ? 'active' : ''} onClick={() => setEscopoCards('todas')}>
                    Todas as páginas
                  </button>
                  <button type="button" role="radio" aria-checked={escopoCards === 'pagina'} className={escopoCards === 'pagina' ? 'active' : ''} onClick={() => setEscopoCards('pagina')}>
                    Só esta página ({paginaAtual + 1})
                  </button>
                </div>
                <div className="panfleto-ajustes-grupo">
                  <button type="button" className="panfleto-icone" disabled={tamanhoHistorico.desfazer === 0} title="Desfazer (Ctrl+Z)" aria-label="Desfazer" onClick={desfazer}>↶</button>
                  <button type="button" className="panfleto-icone" disabled={tamanhoHistorico.refazer === 0} title="Refazer (Ctrl+Y)" aria-label="Refazer" onClick={refazer}>↷</button>
                  {(cardsCaixas || Object.keys(cardsCaixasPagina).length > 0) && (
                    <button type="button" className="panfleto-chip" onClick={handleVoltarParaGrade}>
                      ↺ {escopoCards === 'pagina' ? 'Tirar ajuste da página' : 'Voltar pra grade'}
                    </button>
                  )}
                </div>
              </div>
              <div className="panfleto-ajustes-linha">
                <div className="panfleto-ajustes-grupo">
                  <span className="panfleto-rotulo">Selecionar</span>
                  <button
                    type="button"
                    className={`panfleto-chip${selecionarVarios ? ' active' : ''}`}
                    aria-pressed={selecionarVarios}
                    title="Ligado: cada toque/clique marca ou desmarca um produto (bom pro celular)"
                    onClick={() => setSelecionarVarios((v) => !v)}
                  >
                    ☑ Vários
                  </button>
                  <button type="button" className="panfleto-chip" onClick={() => setSelecionados((dimensaoPaginaAtual?.cards ?? []).map((_, i) => i))}>
                    Todos
                  </button>
                  {selecionados.length > 0 && (
                    <button type="button" className="panfleto-chip" onClick={() => setSelecionados([])}>
                      Limpar ({selecionados.length})
                    </button>
                  )}
                </div>
                <div className="panfleto-ajustes-grupo">
                  <span className="panfleto-rotulo">{selecionados.length > 0 ? `Mover (${selecionados.length})` : 'Mover todos'}</span>
                  <button type="button" className="panfleto-icone" title="Pra cima" aria-label="Mover pra cima" onClick={() => handleMoverTodos(0, -passoMover)}>↑</button>
                  <button type="button" className="panfleto-icone" title="Pra baixo" aria-label="Mover pra baixo" onClick={() => handleMoverTodos(0, passoMover)}>↓</button>
                  <button type="button" className="panfleto-icone" title="Pra esquerda" aria-label="Mover pra esquerda" onClick={() => handleMoverTodos(-passoMover, 0)}>←</button>
                  <button type="button" className="panfleto-icone" title="Pra direita" aria-label="Mover pra direita" onClick={() => handleMoverTodos(passoMover, 0)}>→</button>
                  <select className="panfleto-passo" value={passoMover} onChange={(e) => setPassoMover(Number(e.target.value))} aria-label="Tamanho do passo">
                    <option value={2}>fino</option>
                    <option value={10}>médio</option>
                    <option value={30}>grande</option>
                  </select>
                </div>
                <div className="panfleto-ajustes-grupo">
                  <span className="panfleto-rotulo">Tamanho</span>
                  <button type="button" className="panfleto-icone" title="Diminuir" aria-label="Diminuir produtos" onClick={() => handleEscalarTodos(0.95)}>−</button>
                  <button type="button" className="panfleto-icone" title="Aumentar" aria-label="Aumentar produtos" onClick={() => handleEscalarTodos(1.05)}>+</button>
                </div>
              </div>
              {cardsCaixasPagina[paginaAtual] && (
                <small className="panfleto-mover-aviso">
                  {escopoCards === 'todas'
                    ? `A página ${paginaAtual + 1} tem ajuste próprio — mudanças em "Todas as páginas" não alteram ela.`
                    : `Ajustando só a página ${paginaAtual + 1}.`}
                </small>
              )}
            </div>
            <div className="cartaz-canvas-frame cartaz-canvas-frame--panfleto">
              <div
                className="panfleto-canvas-stage"
                ref={stageRef}
                style={
                  dimensaoPaginaAtual
                    ? ({
                        aspectRatio: `${dimensaoPaginaAtual.largura} / ${dimensaoPaginaAtual.altura}`,
                        '--proporcao-pagina': dimensaoPaginaAtual.largura / dimensaoPaginaAtual.altura,
                      } as CSSProperties)
                    : undefined
                }
                onPointerDownCapture={(e) => {
                  if (e.target === canvasRef.current) {
                    setLogoSelecionada(false);
                    if (!(e.ctrlKey || e.metaKey || e.shiftKey)) setSelecionados([]);
                  }
                }}
              >
                <canvas
                  ref={canvasRef}
                  className="cartaz-canvas cartaz-canvas--panfleto"
                  onPointerDown={(e) => {
                    // Caixa de seleção só no mouse — no toque, arrastar no vazio continua rolando a tela.
                    if (e.pointerType !== 'mouse' || e.button !== 0) return;
                    const p = pontoNaPagina(e.clientX, e.clientY);
                    if (!p) return;
                    setCaixaSelecao({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, aditivo: e.ctrlKey || e.metaKey || e.shiftKey });
                    try {
                      e.currentTarget.setPointerCapture(e.pointerId);
                    } catch {
                      /* sem captura, a caixa ainda funciona enquanto o mouse estiver sobre a prévia */
                    }
                  }}
                  onPointerMove={(e) => {
                    if (!caixaSelecao) return;
                    const p = pontoNaPagina(e.clientX, e.clientY);
                    if (p) setCaixaSelecao({ ...caixaSelecao, x1: p.x, y1: p.y });
                  }}
                  onPointerUp={finalizarCaixaSelecao}
                  onPointerCancel={() => setCaixaSelecao(null)}
                />
                {caixaSelecao && dimensaoPaginaAtual && (
                  <i
                    className="panfleto-caixa-selecao"
                    aria-hidden="true"
                    style={{
                      left: `${(Math.min(caixaSelecao.x0, caixaSelecao.x1) / dimensaoPaginaAtual.largura) * 100}%`,
                      top: `${(Math.min(caixaSelecao.y0, caixaSelecao.y1) / dimensaoPaginaAtual.altura) * 100}%`,
                      width: `${(Math.abs(caixaSelecao.x1 - caixaSelecao.x0) / dimensaoPaginaAtual.largura) * 100}%`,
                      height: `${(Math.abs(caixaSelecao.y1 - caixaSelecao.y0) / dimensaoPaginaAtual.altura) * 100}%`,
                    }}
                  />
                )}
                {dimensaoPaginaAtual && guiasAlinhamento?.vertical !== undefined && <i className="story-alignment-guide story-alignment-guide--vertical" style={{ left: `${(guiasAlinhamento.vertical / dimensaoPaginaAtual.largura) * 100}%` }} aria-hidden="true" />}
                {dimensaoPaginaAtual && guiasAlinhamento?.horizontal !== undefined && <i className="story-alignment-guide story-alignment-guide--horizontal" style={{ top: `${(guiasAlinhamento.horizontal / dimensaoPaginaAtual.altura) * 100}%` }} aria-hidden="true" />}
                {dimensaoPaginaAtual?.cards?.map((card, i) => (
                  <ElementoStoryEditavel
                    key={`card-${i}`}
                    frameRef={stageRef}
                    caixa={{ ...card, larguraMinima: 60, alturaMinima: 60 }}
                    caixasVizinhas={selecionados.length > 1 && selecionados.includes(i) ? [] : dimensaoPaginaAtual.cards!.filter((_, j) => j !== i).map((c) => ({ ...c, larguraMinima: 60, alturaMinima: 60 }))}
                    selecionado={selecionados.includes(i)}
                    descricao={`Produto ${i + 1} do panfleto`}
                    tamanho={1}
                    tamanhoMinimo={1}
                    tamanhoMaximo={1}
                    controlaTipografia={false}
                    larguraArte={dimensaoPaginaAtual.largura}
                    alturaArte={dimensaoPaginaAtual.altura}
                    onSelecionar={(opcoes) => handleSelecionarCard(i, !!opcoes?.aditivo)}
                    onClique={(opcoes) => handleCliqueCard(i, opcoes.aditivo)}
                    onAlterar={(nova) => handleMoverCard(i, nova, dimensaoPaginaAtual)}
                    onDuploClique={() => setEditandoIdx(paginaAtual * itensPorPagina + i)}
                    onGuiasAlinhadas={setGuiasAlinhamento}
                  />
                ))}
                {imagemLogo && logoCaixa && dimensaoPaginaAtual && (
                  <ElementoStoryEditavel
                    frameRef={stageRef}
                    caixa={{ ...caixaLogoAbsoluta(logoCaixa, dimensaoPaginaAtual), larguraMinima: 24, alturaMinima: 24 }}
                    selecionado={logoSelecionada}
                    descricao="Logomarca do panfleto"
                    tamanho={1}
                    tamanhoMinimo={1}
                    tamanhoMaximo={1}
                    controlaTipografia={false}
                    larguraArte={dimensaoPaginaAtual.largura}
                    alturaArte={dimensaoPaginaAtual.altura}
                    caixasVizinhas={(dimensaoPaginaAtual.cards ?? []).map((c) => ({ ...c, larguraMinima: 60, alturaMinima: 60 }))}
                    onGuiasAlinhadas={setGuiasAlinhamento}
                    onSelecionar={() => { setLogoSelecionada(true); setSelecionados([]); gestoNovoRef.current = true; }}
                    onAlterar={(caixa) => {
                      guardarSeGestoNovo();
                      setLogoCaixa(caixaLogoRelativa(caixa, dimensaoPaginaAtual));
                    }}
                  />
                )}
              </div>
            </div>
            {totalPaginas > 1 && (
              <div className="panfleto-paginacao">
                <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} disabled={paginaAtual === 0} onClick={() => setPaginaAtual((p) => Math.max(0, p - 1))}>
                  ◀
                </button>
                <span>
                  Página {paginaAtual + 1}/{totalPaginas}
                </span>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: 'auto', margin: 0 }}
                  disabled={paginaAtual >= totalPaginas - 1}
                  onClick={() => setPaginaAtual((p) => Math.min(totalPaginas - 1, p + 1))}
                >
                  ▶
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {projetoAtivo && (
        <ArtesTabletPainel
          produtos={produtos}
          imagemLogo={imagemLogo}
          cores={{ corFundoCard, corDescricao, corPreco, corFundoSelo, corTextoSelo }}
          caixas={tabletCaixas}
          onCaixas={setTabletCaixas}
          logoCaixa={tabletLogoCaixa}
          onLogoCaixa={setTabletLogoCaixa}
          mostrarLogo={tabletMostrarLogo}
          onMostrarLogo={setTabletMostrarLogo}
          fundoSalvo={tabletFundo}
          onFundoSalvo={setTabletFundo}
          onAviso={setToast}
        />
      )}

      {toast && <div className="toast">{toast}</div>}

      <CameraModal
        aberto={cameraDestino !== null}
        onFechar={() => setCameraDestino(null)}
        onCapturar={async (img) => {
          const destino = cameraDestino;
          setCameraDestino(null);
          try {
            const blob = await blobDeImagem(img, 'image/jpeg', 0.92);
            if (destino === 'pendente') {
              setImagemPendente(img);
              setImagemPendenteArquivoId(null);
              await enviarFotoPendente(blob, 'image/jpeg');
            } else if (typeof destino === 'number') {
              const idx = destino;
              setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, imagem: img, transform: TRANSFORM_PADRAO_PANFLETO, arquivoId: null } : p)));
              await enviarFotoDeProdutoExistente(idx, blob, 'image/jpeg');
            }
          } catch {
            setToast('Não foi possível processar a foto capturada.');
          }
        }}
        guias={montarGuiasCameraDoStory() as GuiaCamera[]}
      />

      {ajusteIdx !== null && produtos[ajusteIdx] && (
        <AjustarEnquadramentoModal
          imagem={produtos[ajusteIdx].imagem}
          transformInicial={produtos[ajusteIdx].transform}
          onFechar={() => setAjusteIdx(null)}
          onSalvar={handleSalvarAjuste}
        />
      )}

      {editarStoryIdx !== null && produtos[editarStoryIdx] && (
        <EditarStoryProdutoModal
          key={editarStoryIdx}
          produto={produtos[editarStoryIdx]}
          logoPadrao={logoPadraoStory}
          onFechar={() => setEditarStoryIdx(null)}
          onSalvar={(ajustesStory, campos) => handleSalvarAjustesStory(editarStoryIdx, ajustesStory, campos)}
        />
      )}

      {itensGaleriaStories && (
        <GaleriaStoriesModal
          itens={itensGaleriaStories.map((item) => ({ nomeArquivo: item.nomeArquivo, rotulo: item.rotulo, dataUrl: item.conteudo }))}
          baixando={baixandoStories}
          onBaixar={handleBaixarTodosStories}
          onFechar={() => setItensGaleriaStories(null)}
        />
      )}
    </>
  );
}
