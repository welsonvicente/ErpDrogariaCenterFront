import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AjustarEnquadramentoModal } from '../AjustarEnquadramentoModal';
import { CameraModal } from '../CameraModal';
import { ElementoStoryEditavel, type GuiasAlinhamentoStory } from '../ElementoStoryEditavel';
import { blobDeImagem, carregarImagemEBlobDeArquivo } from '../../utils/arquivoImagem';
import {
  ALTURA_STORY,
  LARGURA_STORY,
  calcularCaixasStory,
  fmtMoney,
  montarTituloCompartilhamento,
  pintarStory,
  sugerirPosicoesTexto,
  type CaixasStory,
  type CaixaStory,
  type TransformImagem,
} from '../../utils/cartazEngine';
import {
  carregarConfiguracoes,
  carregarImagemDeDataUrl,
  carregarProdutosRecentes,
  carregarProjetoAtivo,
  carregarRascunho,
  limparProjetoAtivo,
  limparRascunho,
  salvarConfiguracoes,
  salvarProdutoRecente,
  salvarProjetoAtivo,
  type ProdutoRecente,
} from '../../utils/cartazPersistencia';
import { baixarArquivoDireto, salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';
import { arquivoCartazService } from '../../services/arquivoCartazService';
import { projetoCartazService, type ProjetoCartazCompleto } from '../../services/projetoCartazService';
import { useAvisoSairComPendencia } from '../../hooks/useAvisoSairComPendencia';
import { ProjetosCartazPainel } from './ProjetosCartazPainel';

const EMOJIS_DESTAQUE = ['🤩😱', '🔥🔥', '😍', '🎉', '💚', '⚡'];
const TRANSFORM_PADRAO: TransformImagem = { scale: 1, panX: 0.5, panY: 0.5 };

interface Guia {
  y: number;
  offsetX: number;
  x?: number;
  largura?: number;
}

type ElementoStory = 'nome' | 'preco' | 'frases' | 'imagemExtra';

/** Formato de `estadoEditor` salvo no projeto — nome/preço/enquadramento/fotos do produto em andamento (equivalente ao antigo `RascunhoStory`, agora com referências ao R2 em vez de base64). */
interface EstadoEditorStory {
  nome: string;
  de: string;
  por: string;
  transform: TransformImagem;
  imagemArquivoId: string | null;
  imagemExtraArquivoId: string | null;
  imagemExtraCaixa: CaixaStory | null;
}

/**
 * Gerador de Story (produto único) — reescrita de Cartazes como tela React
 * nativa (ver PLANO-REESCRITA-FERRAMENTAS.md), migrada pra guardar o
 * projeto/rascunho no backend (Postgres + Cloudflare R2) em vez de
 * `localStorage`/Base64 — ver PLANO da migração de armazenamento de imagens.
 *
 * O motor de pintura (utils/cartazEngine.ts) é portado 1:1 do que já existia —
 * mesma matemática de posição, mesmo texto, mesmas cores padrão — só a casca
 * ao redor mudou (imagem vem de uma URL do R2 em vez de um data: URL).
 */
export function StoryModo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);
  const inputImagemExtraRef = useRef<HTMLInputElement>(null);

  // ---- Projeto ativo -------------------------------------------------------
  const [projetoAtivo, setProjetoAtivo] = useState<ProjetoCartazCompleto | null>(null);
  const [carregandoProjeto, setCarregandoProjeto] = useState(true);
  const [mostrarPainelProjetos, setMostrarPainelProjetos] = useState(false);

  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [imagemArquivoId, setImagemArquivoId] = useState<string | null>(null);
  const [enviandoImagem, setEnviandoImagem] = useState(false);
  const [progressoImagem, setProgressoImagem] = useState(0);
  const [erroEnvioImagem, setErroEnvioImagem] = useState(false);
  const ultimaAcaoImagemRef = useRef<(() => unknown) | null>(null);

  const [imagemExtra, setImagemExtra] = useState<HTMLImageElement | null>(null);
  const [imagemExtraArquivoId, setImagemExtraArquivoId] = useState<string | null>(null);
  const [imagemExtraCaixa, setImagemExtraCaixa] = useState<CaixaStory | null>(null);
  const [enviandoImagemExtra, setEnviandoImagemExtra] = useState(false);

  const [transformImagem, setTransformImagem] = useState<TransformImagem>(TRANSFORM_PADRAO);
  const [carregandoImagem, setCarregandoImagem] = useState(false);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [ajusteAberto, setAjusteAberto] = useState(false);

  const [nomeAtivo, setNomeAtivo] = useState(true);
  const [nome, setNome] = useState('');
  const [precoAtivo, setPrecoAtivo] = useState(true);
  const [de, setDe] = useState('');
  const [por, setPor] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS_DESTAQUE[0]);

  const [corLogo, setCorLogo] = useState('#436000');
  const [corTextoNome, setCorTextoNome] = useState('#FFFFFF');
  const [corPreco, setCorPreco] = useState('#E30613');
  const [tamanhoNome, setTamanhoNome] = useState(40);
  const [tamanhoPreco, setTamanhoPreco] = useState(62);
  const [margemNome, setMargemNome] = useState(60);
  const [margemPreco, setMargemPreco] = useState(60);

  const [frasesAtivo, setFrasesAtivo] = useState(true);
  const [frases, setFrases] = useState('');
  const [corFundoFrases, setCorFundoFrases] = useState('#173C3A');
  const [corTextoFrases, setCorTextoFrases] = useState('#FFFFFF');
  const [tamanhoFrases, setTamanhoFrases] = useState(32);
  const [margemFrases, setMargemFrases] = useState(60);

  const [guiaNome, setGuiaNome] = useState<Guia>({ y: 130, offsetX: 0 });
  const [guiaPreco, setGuiaPreco] = useState<Guia>({ y: 320, offsetX: 0 });
  const [guiaFrases, setGuiaFrases] = useState<Guia>({ y: 560, offsetX: 0 });
  const [caixasPreview, setCaixasPreview] = useState<CaixasStory>({ nome: null, preco: null, frases: null, imagemExtra: null });
  const [elementoSelecionado, setElementoSelecionado] = useState<ElementoStory | null>(null);
  const [guiasAlinhamento, setGuiasAlinhamento] = useState<GuiasAlinhamentoStory | null>(null);
  const [mostrarInterfaceInstagram, setMostrarInterfaceInstagram] = useState(true);

  const [produtosRecentes, setProdutosRecentes] = useState<ProdutoRecente[]>([]);
  const [urlsRecentes, setUrlsRecentes] = useState<Record<string, string>>({});

  const [salvando, setSalvando] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  const [toast, setToast] = useState('');

  // Fontes do motor de canvas (Fredoka/Space Grotesk) carregam assíncrono —
  // sem esperar, a primeira pintura sai com a fonte de fallback do navegador.
  const [fontesProntas, setFontesProntas] = useState(false);
  useEffect(() => {
    Promise.all([
      document.fonts.load('700 60px Fredoka'),
      document.fonts.load('600 30px Fredoka'),
      document.fonts.load('700 40px "Space Grotesk"'),
    ])
      .catch(() => undefined)
      .finally(() => setFontesProntas(true));
  }, []);

  // Configurações (preferências permanentes de estilo) continuam em
  // localStorage — são texto puro (cor/tamanho/posição), nunca pesam.
  useEffect(() => {
    const config = carregarConfiguracoes();
    if (!config) return;
    if (config.corLogo) setCorLogo(config.corLogo);
    if (config.corTextoNome) setCorTextoNome(config.corTextoNome);
    if (config.corPreco) setCorPreco(config.corPreco);
    if (config.tamanhoNome) setTamanhoNome(config.tamanhoNome);
    if (config.tamanhoPreco) setTamanhoPreco(config.tamanhoPreco);
    if (config.margemNome !== undefined) setMargemNome(config.margemNome);
    if (config.margemPreco !== undefined) setMargemPreco(config.margemPreco);
    if (config.frasesAtivo !== undefined) setFrasesAtivo(config.frasesAtivo);
    if (config.frases !== undefined) setFrases(config.frases);
    if (config.corFundoFrases) setCorFundoFrases(config.corFundoFrases);
    if (config.corTextoFrases) setCorTextoFrases(config.corTextoFrases);
    if (config.tamanhoFrases) setTamanhoFrases(config.tamanhoFrases);
    if (config.margemFrases !== undefined) setMargemFrases(config.margemFrases);
    if (config.guiaNome) setGuiaNome(config.guiaNome);
    if (config.guiaPreco) setGuiaPreco(config.guiaPreco);
    if (config.guiaFrases) setGuiaFrases(config.guiaFrases);
  }, []);

  useEffect(() => {
    salvarConfiguracoes({
      corLogo,
      corTextoNome,
      corPreco,
      tamanhoNome,
      tamanhoPreco,
      margemNome,
      margemPreco,
      frasesAtivo,
      frases,
      corFundoFrases,
      corTextoFrases,
      tamanhoFrases,
      margemFrases,
      guiaNome,
      guiaPreco,
      guiaFrases,
    });
  }, [corLogo, corTextoNome, corPreco, tamanhoNome, tamanhoPreco, margemNome, margemPreco, frasesAtivo, frases, corFundoFrases, corTextoFrases, tamanhoFrases, margemFrases, guiaNome, guiaPreco, guiaFrases]);

  // ---------------------------------------------------------------------------
  // Projeto: carrega o ativo (ou oferece migrar um rascunho antigo, ou abre o
  // painel de projetos) uma única vez ao montar.

  const [prontoParaPersistir, setProntoParaPersistir] = useState(false);

  async function aplicarProjeto(projeto: ProjetoCartazCompleto) {
    setProntoParaPersistir(false);
    setProjetoAtivo(projeto);
    salvarProjetoAtivo('story', projeto.id);
    setMostrarPainelProjetos(false);

    const estado = (projeto.estadoEditor || {}) as Partial<EstadoEditorStory>;
    setNome(estado.nome || '');
    setDe(estado.de || '');
    setPor(estado.por || '');
    setTransformImagem(estado.transform || TRANSFORM_PADRAO);
    setImagemExtraCaixa(estado.imagemExtraCaixa || null);
    setImagemArquivoId(estado.imagemArquivoId || null);
    setImagemExtraArquivoId(estado.imagemExtraArquivoId || null);

    const mapaArquivos = new Map(projeto.arquivos.map((a) => [a.id, a] as const));

    if (estado.imagemArquivoId && mapaArquivos.has(estado.imagemArquivoId)) {
      try {
        setImagem(await carregarImagemDeDataUrl(mapaArquivos.get(estado.imagemArquivoId)!.url));
      } catch {
        setImagem(null);
      }
    } else {
      setImagem(null);
    }

    if (estado.imagemExtraArquivoId && mapaArquivos.has(estado.imagemExtraArquivoId)) {
      try {
        setImagemExtra(await carregarImagemDeDataUrl(mapaArquivos.get(estado.imagemExtraArquivoId)!.url));
      } catch {
        setImagemExtra(null);
      }
    } else {
      setImagemExtra(null);
    }

    setProntoParaPersistir(true);
  }

  /** Fase 7 da migração: converte um rascunho antigo (localStorage/Base64) num projeto novo, subindo as fotos que ainda estiverem em memória pro R2. */
  async function migrarRascunhoAntigo(rascunho: NonNullable<ReturnType<typeof carregarRascunho>>) {
    const projeto = await projetoCartazService.criar('story', `Story migrado — ${new Date().toLocaleDateString('pt-BR')}`);

    let novoImagemArquivoId: string | null = null;
    if (rascunho.imgSrc) {
      try {
        const img = await carregarImagemDeDataUrl(rascunho.imgSrc);
        const blob = await blobDeImagem(img, 'image/jpeg', 0.9);
        novoImagemArquivoId = await arquivoCartazService.enviarImagem(blob, 'image/jpeg', projeto.id);
      } catch {
        /* foto antiga corrompida/ilegível — segue sem ela, o texto ainda é migrado */
      }
    }

    let novoImagemExtraArquivoId: string | null = null;
    if (rascunho.imagemExtraSrc) {
      try {
        const img = await carregarImagemDeDataUrl(rascunho.imagemExtraSrc);
        const blob = await blobDeImagem(img, 'image/png', 1);
        novoImagemExtraArquivoId = await arquivoCartazService.enviarImagem(blob, 'image/png', projeto.id);
      } catch {
        /* PNG antigo corrompido — segue sem ele */
      }
    }

    const estadoEditor: EstadoEditorStory = {
      nome: rascunho.nome || '',
      de: rascunho.de || '',
      por: rascunho.por || '',
      transform: rascunho.transform || TRANSFORM_PADRAO,
      imagemArquivoId: novoImagemArquivoId,
      imagemExtraArquivoId: novoImagemExtraArquivoId,
      imagemExtraCaixa: rascunho.imagemExtraCaixa || null,
    };
    await projetoCartazService.atualizar(projeto.id, { estadoEditor: estadoEditor as unknown as Record<string, unknown> });
    limparRascunho();

    const completo = await projetoCartazService.obter(projeto.id);
    await aplicarProjeto(completo);
  }

  useEffect(() => {
    async function iniciar() {
      const ponteiro = carregarProjetoAtivo('story');
      if (ponteiro) {
        try {
          const projeto = await projetoCartazService.obter(ponteiro);
          await aplicarProjeto(projeto);
          setCarregandoProjeto(false);
          return;
        } catch {
          limparProjetoAtivo('story');
        }
      }

      const rascunhoAntigo = carregarRascunho();
      const temAlgoAntigo = rascunhoAntigo && (rascunhoAntigo.imgSrc || rascunhoAntigo.imagemExtraSrc || rascunhoAntigo.nome || rascunhoAntigo.de || rascunhoAntigo.por);
      if (rascunhoAntigo && temAlgoAntigo) {
        const migrar = window.confirm(
          'Encontramos um rascunho de Story deste navegador, de antes dos projetos salvos no servidor. Quer transformá-lo num projeto novo (continua disponível em qualquer aparelho a partir de agora)?',
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
          limparRascunho();
        }
      }

      setMostrarPainelProjetos(true);
      setCarregandoProjeto(false);
    }
    iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Espelha o estado do editor numa ref a cada render — usado por
  // `persistirEstadoImediato` pra montar o PATCH com os valores mais atuais
  // mesmo quando chamado de dentro de um callback assíncrono (upload), onde
  // o closure da função poderia estar com um valor antigo (stale).
  const estadoEditorRef = useRef<EstadoEditorStory>({ nome, de, por, transform: transformImagem, imagemArquivoId, imagemExtraArquivoId, imagemExtraCaixa });
  estadoEditorRef.current = { nome, de, por, transform: transformImagem, imagemArquivoId, imagemExtraArquivoId, imagemExtraCaixa };

  const debounceAutosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [salvandoPendente, setSalvandoPendente] = useState(false);

  /**
   * Salva o estado do editor agora, sem esperar o debounce — usada logo após
   * uma foto confirmar o upload (evento crítico: a janela entre confirmar e
   * persistir é onde um fechar de aba muito rápido perderia a referência).
   * `overrides` sobrepõe o valor mais recente conhecido, pra não depender de
   * um re-render ter acontecido antes desta chamada.
   */
  function persistirEstadoImediato(overrides: Partial<EstadoEditorStory> = {}) {
    if (!projetoAtivo) return;
    if (debounceAutosaveRef.current) {
      clearTimeout(debounceAutosaveRef.current);
      debounceAutosaveRef.current = null;
    }
    const estadoEditor: EstadoEditorStory = { ...estadoEditorRef.current, ...overrides };
    setSalvandoPendente(true);
    projetoCartazService
      .atualizar(projetoAtivo.id, { estadoEditor: estadoEditor as unknown as Record<string, unknown> })
      .catch(() => setToast('Não foi possível salvar as últimas alterações — verifique sua conexão.'))
      .finally(() => setSalvandoPendente(false));
  }

  // Autosave do estado do editor (nome/preço/enquadramento/fotos) no projeto —
  // mesmo debounce (700ms) que o antigo rascunho em localStorage usava. Some
  // eventos críticos (foto confirmada) chamam `persistirEstadoImediato`
  // direto, sem esperar esse debounce.
  useEffect(() => {
    if (!prontoParaPersistir || !projetoAtivo) return;
    setSalvandoPendente(true);
    debounceAutosaveRef.current = setTimeout(() => {
      debounceAutosaveRef.current = null;
      const estadoEditor: EstadoEditorStory = { nome, de, por, transform: transformImagem, imagemArquivoId, imagemExtraArquivoId, imagemExtraCaixa };
      projetoCartazService
        .atualizar(projetoAtivo.id, { estadoEditor: estadoEditor as unknown as Record<string, unknown> })
        .catch(() => setToast('Não foi possível salvar as últimas alterações — verifique sua conexão.'))
        .finally(() => setSalvandoPendente(false));
    }, 700);
    return () => {
      if (debounceAutosaveRef.current) clearTimeout(debounceAutosaveRef.current);
    };
  }, [prontoParaPersistir, projetoAtivo, nome, de, por, transformImagem, imagemArquivoId, imagemExtraArquivoId, imagemExtraCaixa]);

  // Bloqueia fechar/recarregar a aba enquanto uma foto está subindo ou o
  // autosave ainda não confirmou — ver useAvisoSairComPendencia.
  useAvisoSairComPendencia(enviandoImagem || enviandoImagemExtra || salvandoPendente);

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

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const parametros = {
      imagem,
      transformImagem,
      nome: nomeAtivo ? nome.trim() : '',
      de: precoAtivo ? de : '',
      por: precoAtivo ? por : '',
      emoji,
      corLogo,
      corTextoNome,
      corPreco,
      nomeY: guiaNome.y,
      precoY: guiaPreco.y,
      nomeOffsetX: guiaNome.offsetX,
      precoOffsetX: guiaPreco.offsetX,
      nomeX: guiaNome.x,
      nomeLargura: guiaNome.largura,
      precoX: guiaPreco.x,
      precoLargura: guiaPreco.largura,
      tamanhoNome,
      tamanhoPreco,
      frases: frasesAtivo ? frases : '',
      frasesY: guiaFrases.y,
      frasesOffsetX: guiaFrases.offsetX,
      frasesX: guiaFrases.x,
      frasesLargura: guiaFrases.largura,
      imagemExtra,
      imagemExtraCaixa,
      corFundoFrases,
      corTextoFrases,
      tamanhoFrases,
      margemNome,
      margemPreco,
      margemFrases,
    };
    pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, parametros);
    const proximasCaixas = calcularCaixasStory(ctx, LARGURA_STORY, parametros);
    setCaixasPreview((atuais) =>
      JSON.stringify(atuais) === JSON.stringify(proximasCaixas) ? atuais : proximasCaixas,
    );
  }, [
    imagem,
    transformImagem,
    fontesProntas,
    nomeAtivo,
    nome,
    precoAtivo,
    de,
    por,
    emoji,
    corLogo,
    corTextoNome,
    corPreco,
    guiaNome,
    guiaPreco,
    tamanhoNome,
    tamanhoPreco,
    frasesAtivo,
    frases,
    guiaFrases,
    corFundoFrases,
    corTextoFrases,
    tamanhoFrases,
    margemNome,
    margemPreco,
    margemFrases,
    imagemExtra,
    imagemExtraCaixa,
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  function atualizarGuia(setGuia: (atualizar: (atual: Guia) => Guia) => void, caixa: CaixaStory) {
    setGuia((atual) => ({ ...atual, x: caixa.x, y: caixa.y, largura: caixa.largura }));
  }

  function resetarElementoSelecionado() {
    if (elementoSelecionado === 'nome') {
      setGuiaNome({ y: 130, offsetX: 0 });
      setTamanhoNome(40);
    }
    if (elementoSelecionado === 'preco') {
      setGuiaPreco({ y: 320, offsetX: 0 });
      setTamanhoPreco(62);
    }
    if (elementoSelecionado === 'frases') {
      setGuiaFrases({ y: 560, offsetX: 0 });
      setTamanhoFrases(32);
    }
    if (elementoSelecionado === 'imagemExtra' && imagemExtra) {
      const largura = 240;
      const altura = Math.max(80, Math.round(largura * ((imagemExtra.naturalHeight || imagemExtra.height) / (imagemExtra.naturalWidth || imagemExtra.width))));
      setImagemExtraCaixa({ x: LARGURA_STORY - largura - 60, y: 1280, largura, altura, larguraMinima: 56, alturaMinima: 56 });
    }
  }

  function handleSugerirPosicao() {
    if (!imagem) {
      setToast('Escolha uma foto antes de pedir a sugestão de posição.');
      return;
    }
    const sugestao = sugerirPosicoesTexto(imagem, transformImagem);
    if (!sugestao) {
      setToast('Não consegui analisar essa foto — ajuste a posição manualmente.');
      return;
    }
    setGuiaNome({ y: sugestao.nomeY, offsetX: 0 });
    setGuiaPreco({ y: sugestao.precoY, offsetX: 0 });
    if (frasesAtivo) setGuiaFrases({ y: sugestao.frasesY, offsetX: 0 });
    setToast('Posição sugerida! Arraste pra ajustar se quiser.');
  }

  /** Envia (presign → PUT → confirmar) o Blob já pronto e atualiza o estado correspondente (imagem principal ou logo/selo). */
  async function enviarFotoProduto(blob: Blob, mimeType: string) {
    if (!projetoAtivo) return;
    ultimaAcaoImagemRef.current = () => enviarFotoProduto(blob, mimeType);
    setEnviandoImagem(true);
    setErroEnvioImagem(false);
    setProgressoImagem(0);
    try {
      const arquivoId = await arquivoCartazService.enviarImagem(blob, mimeType, projetoAtivo.id, setProgressoImagem);
      setImagemArquivoId(arquivoId);
      persistirEstadoImediato({ imagemArquivoId: arquivoId });
    } catch {
      setErroEnvioImagem(true);
      setToast('Não foi possível enviar a foto. Tente de novo.');
    } finally {
      setEnviandoImagem(false);
    }
  }

  /**
   * Copia (server-side, sem passar pelo navegador) a foto de um "produto
   * recente" pra este projeto — nunca reaproveita a mesma referência: ela
   * pode já pertencer a outro projeto, e um arquivo só pertence a um por
   * vez (ver `arquivoCartazService.duplicar`).
   */
  async function duplicarFotoRecente(arquivoOrigemId: string) {
    if (!projetoAtivo) return;
    ultimaAcaoImagemRef.current = () => duplicarFotoRecente(arquivoOrigemId);
    setEnviandoImagem(true);
    setErroEnvioImagem(false);
    try {
      const copia = await arquivoCartazService.duplicar(arquivoOrigemId, projetoAtivo.id);
      setImagemArquivoId(copia.id);
      persistirEstadoImediato({ imagemArquivoId: copia.id });
    } catch {
      setErroEnvioImagem(true);
      setToast('Não foi possível vincular essa foto ao projeto. Tente de novo.');
    } finally {
      setEnviandoImagem(false);
    }
  }

  function handleTentarEnviarImagemDeNovo() {
    ultimaAcaoImagemRef.current?.();
  }

  async function definirImagemNova(imagemNova: HTMLImageElement, blob: Blob, mimeType: string, transform: TransformImagem = TRANSFORM_PADRAO) {
    setImagem(imagemNova);
    setTransformImagem(transform);
    await enviarFotoProduto(blob, mimeType);
  }

  async function handleEscolherArquivo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    setCarregandoImagem(true);
    try {
      const { imagem: imagemCarregada, blob, mimeType } = await carregarImagemEBlobDeArquivo(arquivo);
      await definirImagemNova(imagemCarregada, blob, mimeType);
    } catch {
      setToast('Não foi possível ler essa foto. Tente outra.');
    } finally {
      setCarregandoImagem(false);
    }
  }

  async function handleEscolherImagemExtra(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo || !projetoAtivo) return;
    const { imagem: png, blob, mimeType } = await carregarImagemEBlobDeArquivo(arquivo);
    const largura = Math.min(320, Math.max(120, png.naturalWidth || png.width));
    const altura = Math.max(56, Math.round(largura * ((png.naturalHeight || png.height) / (png.naturalWidth || png.width))));
    setImagemExtra(png);
    setImagemExtraCaixa({ x: LARGURA_STORY - largura - 60, y: 1280, largura, altura, larguraMinima: 56, alturaMinima: 56 });
    setElementoSelecionado('imagemExtra');

    setEnviandoImagemExtra(true);
    try {
      const arquivoId = await arquivoCartazService.enviarImagem(blob, mimeType, projetoAtivo.id);
      setImagemExtraArquivoId(arquivoId);
      persistirEstadoImediato({ imagemExtraArquivoId: arquivoId });
    } catch {
      setToast('Não foi possível enviar essa logomarca/selo. Tente de novo.');
    } finally {
      setEnviandoImagemExtra(false);
    }
  }

  async function handleUsarProdutoRecente(produto: ProdutoRecente) {
    const url = urlsRecentes[produto.arquivoId];
    if (!url || !projetoAtivo) {
      setToast('Essa foto não está mais disponível.');
      return;
    }
    try {
      const img = await carregarImagemDeDataUrl(url);
      setImagem(img);
      setTransformImagem(TRANSFORM_PADRAO);
      setNome(produto.name || '');
      setDe(produto.de || '');
      setPor(produto.por || '');
      // Nunca reaproveita a mesma referência de arquivo — ela pode já
      // pertencer a outro projeto (ver duplicarFotoRecente).
      duplicarFotoRecente(produto.arquivoId);
    } catch {
      setToast('Não consegui recuperar a foto desse produto.');
    }
  }

  function registrarProdutoRecenteAposBaixar() {
    if (imagemArquivoId && nome.trim()) {
      salvarProdutoRecente({ arquivoId: imagemArquivoId, name: nome.trim(), de, por });
      setProdutosRecentes(carregarProdutosRecentes());
    }
  }

  /** Baixa ou compartilha (Web Share, quando o navegador suportar) — no celular, dá pra mandar direto pro WhatsApp. */
  async function handleBaixar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSalvando(true);
    try {
      const tituloCompartilhamento = montarTituloCompartilhamento(nome, de, por);
      await salvarOuCompartilharArquivo(canvas.toDataURL('image/png'), `story-${Date.now()}.png`, 'image/png', tituloCompartilhamento);
      registrarProdutoRecenteAposBaixar();
    } finally {
      setSalvando(false);
    }
  }

  /** Salva direto na pasta de Downloads do computador, sem passar pela folha de compartilhar. */
  async function handleBaixarDireto() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSalvandoDireto(true);
    try {
      await baixarArquivoDireto(canvas.toDataURL('image/png'), `story-${Date.now()}.png`, 'image/png');
      registrarProdutoRecenteAposBaixar();
    } finally {
      setSalvandoDireto(false);
    }
  }

  async function handleCopiarTexto() {
    const nomeFinal = nome.trim() || 'Produto';
    const pct = de && por ? Math.round((1 - Number(por) / Number(de)) * 100) : null;
    let linha = `💊 *${nomeFinal}*\n`;
    if (de) linha += `De: R$${fmtMoney(de)}\n`;
    if (por) linha += `Por: *R$${fmtMoney(por)}*`;
    if (pct && pct > 0) linha += ` (-${pct}%)`;
    const texto = `🔥 *OFERTA DROGARIA CENTER* 🔥\n\n${linha}\n\n📍 Corre que é por tempo limitado!`;

    try {
      await navigator.clipboard.writeText(texto);
      setToast('Texto copiado! Já pode colar no WhatsApp/Instagram.');
    } catch {
      setToast('Não foi possível copiar automaticamente — selecione e copie o texto manualmente.');
    }
  }

  function handleTrocarProjeto() {
    setMostrarPainelProjetos(true);
  }

  if (carregandoProjeto) {
    return <div className="card cartaz-painel">Carregando…</div>;
  }

  return (
    <>
      {mostrarPainelProjetos && (
        <ProjetosCartazPainel tipo="story" onAbrirProjeto={aplicarProjeto} onFechar={projetoAtivo ? () => setMostrarPainelProjetos(false) : undefined} />
      )}

      {projetoAtivo && (
        <div className="cartaz-cols">
          <div className="card cartaz-painel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 className="cartaz-titulo-secao" style={{ margin: 0 }}>
                Dados do produto
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

            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <label
                className="upload-box"
                style={{ display: 'block', cursor: enviandoImagem ? 'wait' : 'pointer', flex: 1, margin: 0 }}
                onClick={() => !enviandoImagem && inputArquivoRef.current?.click()}
              >
                {carregandoImagem
                  ? '⏳ Carregando foto...'
                  : enviandoImagem
                    ? `⬆️ Enviando... ${progressoImagem}%`
                    : imagem
                      ? '📷 Trocar foto'
                      : '📷 Escolher foto'}
              </label>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, whiteSpace: 'nowrap' }} disabled={enviandoImagem} onClick={() => setCameraAberta(true)}>
                📸 Tirar foto
              </button>
              <input
                ref={inputArquivoRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleEscolherArquivo}
              />
            </div>
            {erroEnvioImagem && (
              <p className="footnote" style={{ textAlign: 'left', color: '#c0392b', margin: '0 0 10px' }}>
                A foto não foi enviada.{' '}
                <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, padding: '2px 8px', fontSize: 12 }} onClick={handleTentarEnviarImagemDeNovo}>
                  Tentar de novo
                </button>
              </p>
            )}
            {imagem && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '0 0 14px' }}>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: 'auto', margin: 0, fontSize: 12, padding: '6px 10px' }}
                  onClick={() => setAjusteAberto(true)}
                >
                  🖼️ Ajustar enquadramento da foto
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  style={{ width: 'auto', margin: 0, fontSize: 12, padding: '6px 10px' }}
                  onClick={handleSugerirPosicao}
                  title="Analisa a foto e sugere onde colocar nome/preço sem tapar o produto"
                >
                  🪄 Sugerir posição
                </button>
              </div>
            )}
            <div className="cartaz-imagem-extra">
              <div>
                <strong>Logomarca ou selo</strong>
                <span>PNG com fundo transparente vira um item livre na arte.</span>
              </div>
              <div className="cartaz-imagem-extra-actions">
                <button type="button" className="btn-ghost" disabled={enviandoImagemExtra} onClick={() => inputImagemExtraRef.current?.click()}>
                  {enviandoImagemExtra ? 'Enviando...' : imagemExtra ? 'Trocar PNG' : '+ Adicionar PNG'}
                </button>
                {imagemExtra && (
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => {
                      setImagemExtra(null);
                      setImagemExtraArquivoId(null);
                      setImagemExtraCaixa(null);
                      if (elementoSelecionado === 'imagemExtra') setElementoSelecionado(null);
                    }}
                  >
                    Remover
                  </button>
                )}
              </div>
              <input ref={inputImagemExtraRef} type="file" accept="image/png" style={{ display: 'none' }} onChange={handleEscolherImagemExtra} />
            </div>
            <p className="footnote" style={{ textAlign: 'left', margin: '-4px 0 14px' }}>
              Preencha os dados e ajuste a arte diretamente na prévia.
            </p>

            <label className="cartaz-checkbox">
              <input type="checkbox" checked={nomeAtivo} onChange={(e) => setNomeAtivo(e.target.checked)} /> Usar o nome do
              produto na imagem
            </label>
            <div className="field">
              <input value={nome} onFocus={() => setElementoSelecionado('nome')} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Johnson's Baby Sabonete 180ml" />
            </div>

            <label className="cartaz-checkbox">
              <input type="checkbox" checked={precoAtivo} onChange={(e) => setPrecoAtivo(e.target.checked)} /> Usar o preço
              na imagem
            </label>
            <div className="field-row">
              <div className="field">
                <label>De (R$)</label>
                <input type="number" step="0.01" value={de} onFocus={() => setElementoSelecionado('preco')} onChange={(e) => setDe(e.target.value)} placeholder="15,99" />
              </div>
              <div className="field">
                <label>Por (R$)</label>
                <input type="number" step="0.01" value={por} onFocus={() => setElementoSelecionado('preco')} onChange={(e) => setPor(e.target.value)} placeholder="9,99" />
              </div>
            </div>

            <div className="field">
              <label>Emoji de destaque</label>
              <div className="cartaz-emoji-row">
                {EMOJIS_DESTAQUE.map((em) => (
                  <button
                    key={em}
                    type="button"
                    className={`emoji-btn${em === emoji ? ' selected' : ''}`}
                    onClick={() => setEmoji(em)}
                  >
                    {em}
                  </button>
                ))}
              </div>
            </div>

            <label className="cartaz-checkbox">
              <input type="checkbox" checked={frasesAtivo} onChange={(e) => setFrasesAtivo(e.target.checked)} /> Usar frases
              extras na imagem
            </label>
            <div className="field">
              <label>Frases extras (uma por linha) — ex: Chama! Entrega grátis (81) 99913-7573</label>
              <textarea
                rows={2}
                value={frases}
                onFocus={() => setElementoSelecionado('frases')}
                onChange={(e) => setFrases(e.target.value)}
                placeholder={'Chama! Entrega grátis\n(81) 99913-7573'}
              />
            </div>
            {elementoSelecionado && (
              <section className="cartaz-ajuste-contextual" aria-live="polite">
                <div className="cartaz-ajuste-contextual-head">
                  <div>
                    <span>Ajustando na prévia</span>
                    <strong>{elementoSelecionado === 'nome' ? 'Nome do produto' : elementoSelecionado === 'preco' ? 'Oferta (De / Por)' : elementoSelecionado === 'frases' ? 'Frases extras' : 'Logomarca ou selo'}</strong>
                  </div>
                  <button type="button" className="btn-ghost" onClick={resetarElementoSelecionado}>Redefinir</button>
                </div>
                <p>Arraste o centro para mover. Use as bordas ou os pontos para redimensionar.</p>
                {elementoSelecionado !== 'imagemExtra' && <div className="field-row">
                  <div className="field">
                    <label>Tamanho {elementoSelecionado === 'nome' ? tamanhoNome : elementoSelecionado === 'preco' ? tamanhoPreco : tamanhoFrases}px</label>
                    <input
                      type="range"
                      min={elementoSelecionado === 'nome' ? 24 : elementoSelecionado === 'preco' ? 34 : 18}
                      max={elementoSelecionado === 'nome' ? 70 : elementoSelecionado === 'preco' ? 90 : 50}
                      value={elementoSelecionado === 'nome' ? tamanhoNome : elementoSelecionado === 'preco' ? tamanhoPreco : tamanhoFrases}
                      onChange={(e) => {
                        const valor = Number(e.target.value);
                        if (elementoSelecionado === 'nome') setTamanhoNome(valor);
                        if (elementoSelecionado === 'preco') setTamanhoPreco(valor);
                        if (elementoSelecionado === 'frases') setTamanhoFrases(valor);
                      }}
                    />
                  </div>
                  {elementoSelecionado === 'nome' && <>
                    <div className="field"><label>Fundo</label><input type="color" value={corLogo} onChange={(e) => setCorLogo(e.target.value)} /></div>
                    <div className="field"><label>Texto</label><input type="color" value={corTextoNome} onChange={(e) => setCorTextoNome(e.target.value)} /></div>
                  </>}
                  {elementoSelecionado === 'preco' && <div className="field"><label>Texto</label><input type="color" value={corPreco} onChange={(e) => setCorPreco(e.target.value)} /></div>}
                  {elementoSelecionado === 'frases' && <>
                    <div className="field"><label>Fundo</label><input type="color" value={corFundoFrases} onChange={(e) => setCorFundoFrases(e.target.value)} /></div>
                    <div className="field"><label>Texto</label><input type="color" value={corTextoFrases} onChange={(e) => setCorTextoFrases(e.target.value)} /></div>
                  </>}
                </div>}
              </section>
            )}

            <div className="cartaz-actions">
              <button className="btn-primary" onClick={handleBaixar} disabled={salvando}>
                {salvando ? 'Preparando...' : '⬇️ Baixar ou compartilhar (WhatsApp etc.)'}
              </button>
              <button className="btn-ghost" onClick={handleBaixarDireto} disabled={salvandoDireto}>
                {salvandoDireto ? 'Preparando...' : '💾 Salvar direto no computador'}
              </button>
              <button className="btn-ghost" onClick={handleCopiarTexto}>
                📋 Copiar texto pronto (WhatsApp/Instagram)
              </button>
            </div>
            <p className="footnote">Formato 1080×1920 — pronto pra postar no Instagram/WhatsApp Status.</p>
          </div>

          <div className="cartaz-preview">
            <div className="cartaz-preview-head">
              <div className="cartaz-preview-title-row">
                <strong>Prévia em tempo real</strong>
                <button
                  type="button"
                  className="btn-ghost cartaz-preview-toggle"
                  aria-pressed={mostrarInterfaceInstagram}
                  onClick={() => setMostrarInterfaceInstagram((atual) => !atual)}
                >
                  {mostrarInterfaceInstagram ? 'Ver imagem final' : 'Simular Instagram'}
                </button>
              </div>
              <span>{elementoSelecionado ? 'Item selecionado — arraste para mover ou redimensionar.' : 'Clique em um item da arte para editar.'}</span>
            </div>
            <div className="story-phone">
              <div className="story-phone-speaker" aria-hidden="true" />
              <div className="cartaz-canvas-frame">
                <div className="cartaz-canvas-stage" ref={frameRef} onPointerDownCapture={(e) => {
                  if (e.target === canvasRef.current) {
                    setElementoSelecionado(null);
                    setGuiasAlinhamento(null);
                  }
                }}>
                  <canvas ref={canvasRef} width={LARGURA_STORY} height={ALTURA_STORY} className="cartaz-canvas" />
                  {guiasAlinhamento?.vertical !== undefined && <i className="story-alignment-guide story-alignment-guide--vertical" style={{ left: `${(guiasAlinhamento.vertical / LARGURA_STORY) * 100}%` }} aria-hidden="true" />}
                  {guiasAlinhamento?.horizontal !== undefined && <i className="story-alignment-guide story-alignment-guide--horizontal" style={{ top: `${(guiasAlinhamento.horizontal / ALTURA_STORY) * 100}%` }} aria-hidden="true" />}
                  {mostrarInterfaceInstagram && (
                    <div className="instagram-story-ui" aria-hidden="true">
                      <div className="instagram-safe-content"><span>área segura · 1080 × 1330</span></div>
                      <div className="instagram-safe-zone instagram-safe-zone--top">
                        <div className="instagram-progress"><i /><i /><i /></div>
                        <div className="instagram-profile-row">
                          <span className="instagram-avatar">P</span>
                          <span><b>pharmamind</b> · 1 h</span>
                          <em>•••</em>
                        </div>
                        <small>250 px reservados ao perfil</small>
                      </div>
                      <div className="instagram-safe-zone instagram-safe-zone--bottom">
                        <small>340 px reservados a comentários e ações</small>
                        <div className="instagram-reply">Enviar mensagem...</div>
                      </div>
                    </div>
                  )}
                <ElementoStoryEditavel
                  frameRef={frameRef}
                  caixa={caixasPreview.nome}
                  selecionado={elementoSelecionado === 'nome'}
                  descricao="Nome do produto"
                  tamanho={tamanhoNome}
                  tamanhoMinimo={24}
                  tamanhoMaximo={70}
                  caixasVizinhas={[caixasPreview.preco, caixasPreview.frases, caixasPreview.imagemExtra].filter((caixa): caixa is CaixaStory => caixa !== null)}
                  onSelecionar={() => setElementoSelecionado('nome')}
                  onGuiasAlinhadas={setGuiasAlinhamento}
                  onAlterar={(caixa, tamanho) => {
                    atualizarGuia(setGuiaNome, caixa);
                    if (tamanho !== undefined) setTamanhoNome(tamanho);
                  }}
                />
                <ElementoStoryEditavel
                  frameRef={frameRef}
                  caixa={caixasPreview.preco}
                  selecionado={elementoSelecionado === 'preco'}
                  descricao="Preço da oferta"
                  tamanho={tamanhoPreco}
                  tamanhoMinimo={34}
                  tamanhoMaximo={90}
                  caixasVizinhas={[caixasPreview.nome, caixasPreview.frases, caixasPreview.imagemExtra].filter((caixa): caixa is CaixaStory => caixa !== null)}
                  onSelecionar={() => setElementoSelecionado('preco')}
                  onGuiasAlinhadas={setGuiasAlinhamento}
                  onAlterar={(caixa, tamanho) => {
                    atualizarGuia(setGuiaPreco, caixa);
                    if (tamanho !== undefined) setTamanhoPreco(tamanho);
                  }}
                />
                <ElementoStoryEditavel
                  frameRef={frameRef}
                  caixa={caixasPreview.frases}
                  selecionado={elementoSelecionado === 'frases'}
                  descricao="Frases extras"
                  tamanho={tamanhoFrases}
                  tamanhoMinimo={18}
                  tamanhoMaximo={50}
                  caixasVizinhas={[caixasPreview.nome, caixasPreview.preco, caixasPreview.imagemExtra].filter((caixa): caixa is CaixaStory => caixa !== null)}
                  onSelecionar={() => setElementoSelecionado('frases')}
                  onGuiasAlinhadas={setGuiasAlinhamento}
                  onAlterar={(caixa, tamanho) => {
                    atualizarGuia(setGuiaFrases, caixa);
                    if (tamanho !== undefined) setTamanhoFrases(tamanho);
                  }}
                />
                <ElementoStoryEditavel
                  frameRef={frameRef}
                  caixa={caixasPreview.imagemExtra}
                  selecionado={elementoSelecionado === 'imagemExtra'}
                  descricao="Logomarca ou selo"
                  tamanho={1}
                  tamanhoMinimo={1}
                  tamanhoMaximo={1}
                  controlaTipografia={false}
                  caixasVizinhas={[caixasPreview.nome, caixasPreview.preco, caixasPreview.frases].filter((caixa): caixa is CaixaStory => caixa !== null)}
                  onSelecionar={() => setElementoSelecionado('imagemExtra')}
                  onGuiasAlinhadas={setGuiasAlinhamento}
                  onAlterar={(caixa) => setImagemExtraCaixa(caixa)}
                />
                </div>
              </div>
              <div className="story-phone-home" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}

      <CameraModal
        aberto={cameraAberta}
        onFechar={() => setCameraAberta(false)}
        onCapturar={async (img) => {
          setCameraAberta(false);
          try {
            const blob = await blobDeImagem(img, 'image/jpeg', 0.92);
            await definirImagemNova(img, blob, 'image/jpeg');
          } catch {
            setToast('Não foi possível processar a foto capturada.');
          }
        }}
        guias={[
          { y: guiaNome.y, offsetX: guiaNome.offsetX, margem: margemNome, visivel: nomeAtivo, corClasse: 'faixa-arrasto--nome', rotulo: 'NOME DO PRODUTO' },
          { y: guiaPreco.y, offsetX: guiaPreco.offsetX, margem: margemPreco, visivel: precoAtivo, corClasse: 'faixa-arrasto--preco', rotulo: 'R$ PREÇO' },
          { y: guiaFrases.y, offsetX: guiaFrases.offsetX, margem: margemFrases, visivel: frasesAtivo, corClasse: 'faixa-arrasto--frases', rotulo: 'FRASES' },
        ]}
      />

      {ajusteAberto && (
        <AjustarEnquadramentoModal
          imagem={imagem}
          transformInicial={transformImagem}
          onFechar={() => setAjusteAberto(false)}
          onSalvar={(t) => {
            setTransformImagem(t);
            setAjusteAberto(false);
          }}
        />
      )}
    </>
  );
}
