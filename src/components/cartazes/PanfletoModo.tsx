import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import JSZip from 'jszip';
import { AjustarEnquadramentoModal } from '../AjustarEnquadramentoModal';
import { CameraModal, type GuiaCamera } from '../CameraModal';
import { ElementoStoryEditavel } from '../ElementoStoryEditavel';
import { EditarStoryProdutoModal } from './EditarStoryProdutoModal';
import { GaleriaStoriesModal } from './GaleriaStoriesModal';
import { blobDeImagem, carregarImagemDeArquivo, carregarImagemEBlobDeArquivo } from '../../utils/arquivoImagem';
import { ALTURA_STORY, fmtMoney, LARGURA_STORY, montarTextoPromocional, pintarStory, sugerirPosicoesTexto, type TransformImagem } from '../../utils/cartazEngine';
import {
  carregarConfiguracoes,
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
  ESCALA_EXPORTACAO_PANFLETO,
  ITENS_POR_PAGINA_OPCOES,
  montarParametrosStoryProduto,
  PRESETS_TAMANHO_PANFLETO,
  renderizarPaginaPanfleto,
  TRANSFORM_PADRAO_PANFLETO,
  type AjustesStoryProduto,
  type CaixaLogoPanfleto,
  type DimensaoPaginaPanfleto,
  type AlinhamentoTexto,
  type ParametrosPaginaPanfleto,
  type ProdutoPanfleto,
} from '../../utils/panfletoEngine';
import { gerarImagemQr } from '../../utils/qrCode';
import { ProjetosCartazPainel } from './ProjetosCartazPainel';

type DestinoCamera = 'pendente' | number | null;

const TAMANHO_QR_LOGICO = 130;
const EMOJI_PADRAO_STORY = '🤩😱';

/** Produto salvo no `estadoEditor` do projeto — mesmos campos de `ProdutoPanfleto`, sem o `HTMLImageElement` (a foto é só a referência ao R2). */
interface ProdutoPanfletoSalvo {
  arquivoId: string | null;
  nome: string;
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
  const [corDescricao, setCorDescricao] = useState('#173C3A');
  const [corPreco, setCorPreco] = useState('#436000');
  const [corFundoCard, setCorFundoCard] = useState('#FBFDF9');
  const [tamanhoNome, setTamanhoNome] = useState(15);
  const [tamanhoPreco, setTamanhoPreco] = useState(19);
  const [tamanhoBorda, setTamanhoBorda] = useState(40);
  const [tamanhoSelo, setTamanhoSelo] = useState(13);

  const [imagemFundo, setImagemFundo] = useState<HTMLImageElement | null>(null);
  const [manterFaixaBranca, setManterFaixaBranca] = useState(true);
  const [imagemLogo, setImagemLogo] = useState<HTMLImageElement | null>(null);
  const [logoArquivoId, setLogoArquivoId] = useState<string | null>(null);
  const [logoCaixa, setLogoCaixa] = useState<CaixaLogoPanfleto | null>(null);
  const [logoSelecionada, setLogoSelecionada] = useState(false);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [dimensaoPaginaAtual, setDimensaoPaginaAtual] = useState<DimensaoPaginaPanfleto | null>(null);
  const dimensoesPaginasRef = useRef<DimensaoPaginaPanfleto[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);

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

  // Recebe produtos enviados pelo modo Importar planilha ("Usar no panfleto")
  // — SEMPRE duplica a foto pro projeto do Panfleto (mesmo quando já tem
  // `arquivoId`): esse arquivo pertence ao projeto de origem (a Planilha),
  // e um arquivo só pertence a um projeto por vez, então reaproveitar a
  // mesma referência faria a Planilha perder a foto assim que o Panfleto a
  // vinculasse a si (ver `arquivoCartazService.duplicar`).
  useEffect(() => {
    if (!produtosRecebidos || produtosRecebidos.length === 0 || !projetoAtivo) return;
    const projetoId = projetoAtivo.id;
    async function incorporar() {
      const prontos = await Promise.all(
        produtosRecebidos!.map(async (produto) => {
          try {
            if (produto.arquivoId) {
              const copia = await arquivoCartazService.duplicar(produto.arquivoId, projetoId);
              return { ...produto, arquivoId: copia.id };
            }
            const blob = await blobDeImagem(produto.imagem, 'image/jpeg', 0.9);
            const arquivoId = await arquivoCartazService.enviarImagem(blob, 'image/jpeg', projetoId);
            return { ...produto, arquivoId };
          } catch {
            return produto;
          }
        }),
      );
      setProdutos((atual) => {
        const finalProdutos = [...atual, ...prontos];
        persistirProdutos(finalProdutos);
        return finalProdutos;
      });
      aoReceberProdutos?.();
    }
    incorporar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosRecebidos, projetoAtivo?.id]);

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
  useEffect(() => {
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
    if (config.corDescricao) setCorDescricao(config.corDescricao);
    if (config.corPreco) setCorPreco(config.corPreco);
    if (config.corFundoCard) setCorFundoCard(config.corFundoCard);
    if (config.tamanhoNome) setTamanhoNome(config.tamanhoNome);
    if (config.tamanhoPreco) setTamanhoPreco(config.tamanhoPreco);
    if (config.tamanhoBorda) setTamanhoBorda(config.tamanhoBorda);
    if (config.tamanhoSelo) setTamanhoSelo(config.tamanhoSelo);
    if (config.manterFaixaBranca !== undefined) setManterFaixaBranca(config.manterFaixaBranca);
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
        corDescricao,
        corPreco,
        corFundoCard,
        tamanhoNome,
        tamanhoPreco,
        tamanhoBorda,
        tamanhoSelo,
        manterFaixaBranca,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [
    nomeLoja, nomeLojaAlinhamento, titulo, tituloAlinhamento, mostrarTextosCabecalho, mostrarTextosRodape,
    textoRodape1, textoRodape1Alinhamento, textoRodape2, textoRodape2Alinhamento, qrAlinhamento, link,
    itensPorPagina, corLogo, corDescricao, corPreco, corFundoCard, tamanhoNome, tamanhoPreco, tamanhoBorda,
    tamanhoSelo, manterFaixaBranca,
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

    const restaurados: ProdutoPanfleto[] = [];
    let semFotoCount = 0;
    for (const p of salvos) {
      const arquivo = p.arquivoId ? mapaArquivos.get(p.arquivoId) : undefined;
      let imagem: HTMLImageElement | null = null;
      if (arquivo) {
        try {
          // eslint-disable-next-line no-await-in-loop
          imagem = await carregarImagemDeDataUrl(arquivo.url);
        } catch {
          /* foto corrompida/inacessível — mostra aviso no lugar */
        }
      }
      if (!imagem) {
        semFotoCount++;
        // eslint-disable-next-line no-await-in-loop
        imagem = await criarImagemAvisoSemFoto();
      }
      restaurados.push({ imagem, nome: p.nome, de: p.de, por: p.por, transform: p.transform || TRANSFORM_PADRAO_PANFLETO, ajustesStory: p.ajustesStory, arquivoId: p.arquivoId });
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
      produtos: produtosParaSalvar.map((p) => ({ arquivoId: p.arquivoId ?? null, nome: p.nome, de: p.de, por: p.por, transform: p.transform, ajustesStory: p.ajustesStory })),
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
      corDescricao,
      corPreco,
      corFundoCard,
      tamanhoNome,
      tamanhoPreco,
      tamanhoBorda,
      tamanhoSelo,
      imagemFundo,
      manterFaixaBranca,
      imagemLogo,
      logoCaixa,
    };

    const dimensoes: DimensaoPaginaPanfleto[] = [];
    paginasCanvasRef.current = paginas.map((produtosDaPagina, i) => {
      const canvas = document.createElement('canvas');
      dimensoes.push(renderizarPaginaPanfleto(canvas, produtosDaPagina, sizing, i + 1, paginas.length, parametros));
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
    qrAlinhamento, link, imagemQr, corLogo, corDescricao, corPreco, corFundoCard, tamanhoNome, tamanhoPreco,
    tamanhoBorda, tamanhoSelo, imagemFundo, manterFaixaBranca, imagemLogo, logoCaixa,
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
  async function handleEscolherImagemFundo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    setImagemFundo(await carregarImagemDeArquivo(arquivo));
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

    setProdutos((atual) => [...atual, { imagem: imagemPendente, nome: nomeTrim, de: deProduto, por: porProduto, transform: TRANSFORM_PADRAO_PANFLETO, arquivoId: imagemPendenteArquivoId }]);
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

  function handleGerarGaleriaStories() {
    if (produtos.length === 0) {
      setToast('Adicione produtos ao panfleto antes de gerar os stories.');
      return;
    }
    const configPadrao = carregarConfiguracoes() || {};
    const itens = produtos.map((produto, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = LARGURA_STORY;
      canvas.height = ALTURA_STORY;
      const ctx = canvas.getContext('2d')!;
      pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, montarParametrosStoryProduto(produto, configPadrao, EMOJI_PADRAO_STORY, logoPadraoStory));
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
                    <div className="pname">{p.nome}</div>
                    <div className="pprice">
                      {p.de ? `De R$${p.de} · ` : ''}Por R${p.por}
                    </div>
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
              <select value={itensPorPagina} onChange={(e) => setItensPorPagina(Number(e.target.value))}>
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
              <div className="field">
                <label>Cor da logo</label>
                <input type="color" value={corLogo} onChange={(e) => setCorLogo(e.target.value)} />
              </div>
              <div className="field">
                <label>Cor da descrição</label>
                <input type="color" value={corDescricao} onChange={(e) => setCorDescricao(e.target.value)} />
              </div>
              <div className="field">
                <label>Cor do preço</label>
                <input type="color" value={corPreco} onChange={(e) => setCorPreco(e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Cor de fundo dos quadrantes dos produtos</label>
              <input type="color" value={corFundoCard} onChange={(e) => setCorFundoCard(e.target.value)} />
            </div>
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

            <div className="field">
              <label>Imagem de fundo do panfleto (opcional)</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <label
                  className="upload-box"
                  style={{ display: 'block', cursor: 'pointer', flex: 1, margin: 0, fontSize: 12, padding: 14 }}
                  onClick={() => inputFundoRef.current?.click()}
                >
                  {imagemFundo ? '🖼️ Trocar imagem de fundo' : '🖼️ Escolher imagem de fundo'}
                </label>
                <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={() => setImagemFundo(null)}>
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
              <span>{logoSelecionada ? 'Logomarca selecionada — arraste pra mover ou pelas bordas pra redimensionar.' : 'O panfleto se atualiza conforme você edita.'}</span>
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
                  if (e.target === canvasRef.current) setLogoSelecionada(false);
                }}
              >
                <canvas ref={canvasRef} className="cartaz-canvas cartaz-canvas--panfleto" />
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
                    onSelecionar={() => setLogoSelecionada(true)}
                    onAlterar={(caixa) => setLogoCaixa(caixaLogoRelativa(caixa, dimensaoPaginaAtual))}
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
