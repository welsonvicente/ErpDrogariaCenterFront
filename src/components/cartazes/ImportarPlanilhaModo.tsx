import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AjustarEnquadramentoModal } from '../AjustarEnquadramentoModal';
import { CameraModal, type GuiaCamera } from '../CameraModal';
import { GaleriaStoriesModal } from './GaleriaStoriesModal';
import { blobDeImagem, carregarImagemEBlobDeArquivo } from '../../utils/arquivoImagem';
import {
  ALTURA_STORY,
  LARGURA_STORY,
  fmtMoney,
  montarTextoPromocional,
  pintarStory,
} from '../../utils/cartazEngine';
import {
  carregarImagemExterna,
  imagemExportavel,
  lerArquivoComoWorkbook,
  parseColunasColadas,
  parseWorkbookParaProdutos,
  TRANSFORM_PADRAO,
  type ProdutoImportado,
} from '../../utils/batchEngine';
import {
  carregarConfiguracoesLote,
  carregarImagemDeDataUrl,
  carregarProjetoAtivo,
  carregarRascunhoLote,
  limparProjetoAtivo,
  limparRascunhoLote,
  montarGuiasCameraDoStory,
  salvarConfiguracoesLote,
  salvarProjetoAtivo,
} from '../../utils/cartazPersistencia';
import { compartilharOuBaixarVarios } from '../../utils/compartilharArquivo';
import { arquivoCartazService } from '../../services/arquivoCartazService';
import { cartazService, type ArquivoImportadoMeta } from '../../services/cartazService';
import { projetoCartazService, type ProjetoCartazCompleto } from '../../services/projetoCartazService';
import { useFilaUploadImagens } from '../../hooks/useFilaUploadImagens';
import type { ProdutoPanfleto } from '../../utils/panfletoEngine';
import { ProjetosCartazPainel } from './ProjetosCartazPainel';

function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ROTULO_STATUS: Record<ProdutoImportado['status'], string> = {
  pending: 'Sem imagem',
  searching: 'Buscando…',
  found: 'Imagem encontrada',
  manual: 'Foto manual',
  failed: 'Busca falhou',
};

/** Produto salvo no `estadoEditor` do projeto — mesmos campos de `ProdutoImportado`, sem o `HTMLImageElement`. */
interface ProdutoLoteSalvo {
  descricao: string;
  normal: number | null;
  promo: number | null;
  ean: string | null;
  arquivoId: string | null;
  status: ProdutoImportado['status'];
  transform: ProdutoImportado['transform'];
}

interface EstadoEditorLote {
  produtos: ProdutoLoteSalvo[];
}

interface ImportarPlanilhaModoProps {
  /** Envia os produtos com foto pro modo Panfleto e troca de aba. */
  aoEnviarParaPanfleto: (produtos: ProdutoPanfleto[]) => void;
}

/**
 * Importar planilha (.xls/.xlsx ou colar colunas do Excel/Sheets) — Fase 3 da
 * reescrita de Cartazes como tela React nativa (ver PLANO-REESCRITA-FERRAMENTAS.md),
 * migrada pra guardar o projeto (produtos + referências de foto) no backend
 * (Postgres + Cloudflare R2) em vez de `localStorage`/Base64 — ver PLANO da
 * migração de armazenamento de imagens. Esse era o modo onde o limite de
 * poucas fotos de câmera (localStorage) mais doía, por importar várias de
 * uma vez.
 *
 * A planilha ORIGINAL (o arquivo .xlsx em si) continua guardada como antes
 * (Postgres, via `cartazService`/`arquivos_importados`) — só as FOTOS de cada
 * produto migraram pro R2.
 *
 * Upload de fotos passa pela fila (`useFilaUploadImagens`, concorrência
 * limitada + progresso + retry por item) — tanto fotos manuais/câmera quanto
 * as encontradas por "buscar automaticamente", que ainda roda uma busca por
 * vez (não sobrecarrega a busca por IA) mas deixa os UPLOADS das fotos já
 * encontradas correrem em paralelo.
 */
export function ImportarPlanilhaModo({ aoEnviarParaPanfleto }: ImportarPlanilhaModoProps) {
  const inputPlanilhaRef = useRef<HTMLInputElement>(null);
  const inputManualRef = useRef<HTMLInputElement>(null);
  const trocaAlvoIdx = useRef<number | null>(null);

  // ---- Projeto ativo -------------------------------------------------------
  const [projetoAtivo, setProjetoAtivo] = useState<ProjetoCartazCompleto | null>(null);
  const [carregandoProjeto, setCarregandoProjeto] = useState(true);
  const [mostrarPainelProjetos, setMostrarPainelProjetos] = useState(false);
  const [prontoParaPersistir, setProntoParaPersistir] = useState(false);

  const fila = useFilaUploadImagens(projetoAtivo?.id ?? null);
  const idxParaIdLocalRef = useRef<Map<number, string>>(new Map());

  const [produtos, setProdutos] = useState<ProdutoImportado[]>([]);
  const [statusImportacao, setStatusImportacao] = useState(
    'A planilha precisa ter colunas com o nome do produto, preço normal, valor da promoção e EAN (código de barras).',
  );

  const [descColada, setDescColada] = useState('');
  const [normalColada, setNormalColada] = useState('');
  const [promoColada, setPromoColada] = useState('');
  const [eanColada, setEanColada] = useState('');

  const [corLogo, setCorLogo] = useState('#436000');
  const [corTextoNome, setCorTextoNome] = useState('#FFFFFF');
  const [corPreco, setCorPreco] = useState('#E30613');

  const [cameraDestino, setCameraDestino] = useState<number | null>(null);
  const [ajusteIdx, setAjusteIdx] = useState<number | null>(null);
  const [buscandoTodas, setBuscandoTodas] = useState(false);
  const [gerandoZip, setGerandoZip] = useState(false);
  const [itensGaleriaStories, setItensGaleriaStories] = useState<{ conteudo: string; nomeArquivo: string; mime: string; rotulo: string }[] | null>(null);
  const [toast, setToast] = useState('');

  const [arquivosSalvos, setArquivosSalvos] = useState<ArquivoImportadoMeta[]>([]);
  const [carregandoArquivosSalvos, setCarregandoArquivosSalvos] = useState(true);
  const [usandoArquivoSalvoId, setUsandoArquivoSalvoId] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function recarregarArquivosSalvos() {
    try {
      setArquivosSalvos(await cartazService.listarArquivos());
    } catch {
      /* lista fica vazia — não é crítico, a pessoa ainda pode importar um arquivo novo */
    } finally {
      setCarregandoArquivosSalvos(false);
    }
  }

  // Arquivos já enviados por qualquer aparelho da organização (a planilha
  // original, sem relação com o R2) — independente de projeto ativo.
  useEffect(() => {
    recarregarArquivosSalvos();
  }, []);

  useEffect(() => {
    const config = carregarConfiguracoesLote();
    if (!config) return;
    if (config.corLogo) setCorLogo(config.corLogo);
    if (config.corTextoNome) setCorTextoNome(config.corTextoNome);
    if (config.corPreco) setCorPreco(config.corPreco);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      salvarConfiguracoesLote({ corLogo, corTextoNome, corPreco });
    }, 400);
    return () => clearTimeout(timer);
  }, [corLogo, corTextoNome, corPreco]);

  function atualizarProduto(idx: number, patch: Partial<ProdutoImportado>) {
    setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  /** Enfileira o upload da foto de um produto (busca automática, manual ou câmera) — concorrência limitada, progresso e retry por item (ver `useFilaUploadImagens`). */
  function enviarFotoDoProduto(idx: number, blob: Blob, mimeType: string) {
    const [idLocal] = fila.adicionar([{ blob, mimeType, onSucesso: (arquivoId) => atualizarProduto(idx, { arquivoId }) }]);
    idxParaIdLocalRef.current.set(idx, idLocal);
  }

  function statusUploadDoProduto(idx: number) {
    const idLocal = idxParaIdLocalRef.current.get(idx);
    if (!idLocal) return null;
    return fila.itens.find((item) => item.idLocal === idLocal) || null;
  }

  // ---------------------------------------------------------------------------
  // Projeto: carrega o ativo, oferece migrar um rascunho antigo, ou abre o
  // painel de projetos — mesmo padrão do StoryModo/PanfletoModo.

  async function aplicarProjeto(projeto: ProjetoCartazCompleto) {
    setProntoParaPersistir(false);
    setProjetoAtivo(projeto);
    salvarProjetoAtivo('planilha', projeto.id);
    setMostrarPainelProjetos(false);
    idxParaIdLocalRef.current.clear();
    fila.limpar();

    const estado = (projeto.estadoEditor || {}) as Partial<EstadoEditorLote>;
    const mapaArquivos = new Map(projeto.arquivos.map((a) => [a.id, a] as const));
    const salvos = estado.produtos || [];

    const restaurados: ProdutoImportado[] = [];
    for (const p of salvos) {
      const arquivo = p.arquivoId ? mapaArquivos.get(p.arquivoId) : undefined;
      let imagem: HTMLImageElement | null = null;
      if (arquivo) {
        try {
          // eslint-disable-next-line no-await-in-loop
          imagem = await carregarImagemDeDataUrl(arquivo.url);
        } catch {
          /* foto corrompida/inacessível — produto continua, só sem imagem */
        }
      }
      restaurados.push({
        descricao: p.descricao,
        normal: p.normal,
        promo: p.promo,
        ean: p.ean,
        imagem,
        status: imagem ? p.status : 'pending',
        transform: p.transform || TRANSFORM_PADRAO,
        arquivoId: imagem ? p.arquivoId : null,
      });
    }
    setProdutos(restaurados);
    setProntoParaPersistir(true);
  }

  async function migrarRascunhoAntigo(rascunho: NonNullable<ReturnType<typeof carregarRascunhoLote>>) {
    const projeto = await projetoCartazService.criar('planilha', `Lote migrado — ${new Date().toLocaleDateString('pt-BR')}`);

    const produtosMigrados: ProdutoLoteSalvo[] = [];
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
      produtosMigrados.push({ descricao: p.descricao, normal: p.normal, promo: p.promo, ean: p.ean, arquivoId, status: p.status, transform: p.transform });
    }

    const estadoEditor: EstadoEditorLote = { produtos: produtosMigrados };
    await projetoCartazService.atualizar(projeto.id, { estadoEditor: estadoEditor as unknown as Record<string, unknown> });
    limparRascunhoLote();

    const completo = await projetoCartazService.obter(projeto.id);
    await aplicarProjeto(completo);
  }

  useEffect(() => {
    async function iniciar() {
      const ponteiro = carregarProjetoAtivo('planilha');
      if (ponteiro) {
        try {
          const projeto = await projetoCartazService.obter(ponteiro);
          await aplicarProjeto(projeto);
          setCarregandoProjeto(false);
          return;
        } catch {
          limparProjetoAtivo('planilha');
        }
      }

      const rascunhoAntigo = carregarRascunhoLote();
      if (rascunhoAntigo && rascunhoAntigo.produtos.length > 0) {
        const migrar = window.confirm(
          `Encontramos um rascunho de Importar planilha deste navegador com ${rascunhoAntigo.produtos.length} produto(s), de antes dos projetos salvos no servidor. Quer transformá-lo num projeto novo?`,
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
          limparRascunhoLote();
        }
      }

      setMostrarPainelProjetos(true);
      setCarregandoProjeto(false);
    }
    iniciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave do estado do editor (produtos) no projeto.
  useEffect(() => {
    if (!prontoParaPersistir || !projetoAtivo) return;
    const timer = setTimeout(() => {
      const estadoEditor: EstadoEditorLote = {
        produtos: produtos.map((p) => ({ descricao: p.descricao, normal: p.normal, promo: p.promo, ean: p.ean, arquivoId: p.arquivoId, status: p.status, transform: p.transform })),
      };
      projetoCartazService.atualizar(projetoAtivo.id, { estadoEditor: estadoEditor as unknown as Record<string, unknown> }).catch(() => {
        setToast('Não foi possível salvar as últimas alterações — verifique sua conexão.');
      });
    }, 700);
    return () => clearTimeout(timer);
  }, [prontoParaPersistir, projetoAtivo, produtos]);

  function handleTrocarProjeto() {
    setMostrarPainelProjetos(true);
  }

  async function handleEscolherPlanilha(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    setStatusImportacao('Lendo planilha…');
    try {
      const workbook = await lerArquivoComoWorkbook(arquivo);
      const importados = parseWorkbookParaProdutos(workbook);
      if (importados === null) {
        setStatusImportacao('Não consegui identificar as colunas dessa planilha. Confirme que ela tem uma coluna com o nome do produto.');
        return;
      }
      if (importados.length === 0) {
        setStatusImportacao('Nenhum produto encontrado nessa planilha.');
        return;
      }
      setProdutos(importados);
      setStatusImportacao(`${importados.length} produto(s) importado(s) com sucesso.`);
      enviarArquivoParaServidor(arquivo);
    } catch {
      setStatusImportacao('Não foi possível ler esse arquivo. Confirme que é um .xls ou .xlsx válido.');
    }
  }

  /** Guarda a planilha ORIGINAL no servidor (Postgres, sem relação com R2) — inalterado, best-effort. */
  async function enviarArquivoParaServidor(arquivo: File) {
    try {
      await cartazService.enviarArquivo(arquivo);
      recarregarArquivosSalvos();
    } catch {
      setToast('Os produtos foram importados, mas não consegui guardar o arquivo original no servidor.');
    }
  }

  async function handleUsarArquivoSalvo(meta: ArquivoImportadoMeta) {
    setUsandoArquivoSalvoId(meta.id);
    setStatusImportacao(`Baixando "${meta.nomeOriginal}"…`);
    try {
      const arquivo = await cartazService.baixarArquivo(meta.id);
      const workbook = await lerArquivoComoWorkbook(arquivo);
      const importados = parseWorkbookParaProdutos(workbook);
      if (importados === null || importados.length === 0) {
        setStatusImportacao('Não consegui reconhecer os produtos nesse arquivo salvo.');
        return;
      }
      setProdutos(importados);
      setStatusImportacao(`${importados.length} produto(s) importado(s) de "${meta.nomeOriginal}".`);
    } catch {
      setStatusImportacao('Não foi possível baixar esse arquivo. Tente novamente.');
    } finally {
      setUsandoArquivoSalvoId(null);
    }
  }

  async function handleRemoverArquivoSalvo(meta: ArquivoImportadoMeta) {
    if (!window.confirm(`Remover "${meta.nomeOriginal}" do servidor? Isso não afeta os produtos já importados na tela.`)) return;
    try {
      await cartazService.removerArquivo(meta.id);
      setArquivosSalvos((atual) => atual.filter((a) => a.id !== meta.id));
    } catch {
      setToast('Não foi possível remover esse arquivo. Tente novamente.');
    }
  }

  function handleAdicionarColados() {
    const novos = parseColunasColadas(descColada, normalColada, promoColada, eanColada);
    if (novos.length === 0) {
      setToast('Cole ao menos a descrição dos produtos (uma por linha).');
      return;
    }
    setProdutos((atual) => [...atual, ...novos]);
    setDescColada('');
    setNormalColada('');
    setPromoColada('');
    setEanColada('');
    setStatusImportacao(`${novos.length} produto(s) adicionado(s) por colagem.`);
  }

  async function buscarImagemProduto(idx: number) {
    const produto = produtos[idx];
    if (!produto) return;
    atualizarProduto(idx, { status: 'searching' });
    try {
      const imageUrl = await cartazService.buscarImagem(produto.descricao, produto.ean || undefined);
      if (!imageUrl) {
        atualizarProduto(idx, { status: 'failed' });
        return;
      }
      const img = await carregarImagemExterna(imageUrl);
      if (imagemExportavel(img)) {
        atualizarProduto(idx, { imagem: img, status: 'found' });
        try {
          const blob = await blobDeImagem(img, 'image/jpeg', 0.9);
          enviarFotoDoProduto(idx, blob, 'image/jpeg');
        } catch {
          /* não deu pra converter essa foto pra upload — a arte ainda funciona nesta sessão, só não persiste */
        }
      } else {
        atualizarProduto(idx, { status: 'failed' });
      }
    } catch {
      atualizarProduto(idx, { status: 'failed' });
    }
  }

  /** Busca uma imagem por vez (não sobrecarrega a IA), mas os UPLOADS de cada foto encontrada correm em paralelo (fila com concorrência limitada). */
  async function handleBuscarTodas() {
    setBuscandoTodas(true);
    try {
      for (let i = 0; i < produtos.length; i++) {
        if (produtos[i].imagem) continue;
        // eslint-disable-next-line no-await-in-loop
        await buscarImagemProduto(i);
      }
    } finally {
      setBuscandoTodas(false);
    }
  }

  async function handleTrocarFotoManual(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    const idx = trocaAlvoIdx.current;
    trocaAlvoIdx.current = null;
    if (!arquivo || idx === null) return;
    try {
      const { imagem, blob, mimeType } = await carregarImagemEBlobDeArquivo(arquivo);
      atualizarProduto(idx, { imagem, status: 'manual', transform: TRANSFORM_PADRAO, arquivoId: null });
      enviarFotoDoProduto(idx, blob, mimeType);
    } catch {
      setToast('Não foi possível ler essa foto. Tente outra.');
    }
  }

  function handleRemoverProduto(idx: number) {
    setProdutos((atual) => atual.filter((_, i) => i !== idx));
  }

  function handleRemoverTodos() {
    if (produtos.length === 0) return;
    if (!window.confirm(`Remover todos os ${produtos.length} produtos importados?`)) return;
    setProdutos([]);
  }

  async function copiarTexto(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setToast('Texto copiado! Já pode colar no WhatsApp/Instagram.');
    } catch {
      setToast('Não foi possível copiar automaticamente — selecione e copie o texto manualmente.');
    }
  }

  function handleCopiarTextoItem(idx: number) {
    const p = produtos[idx];
    if (!p) return;
    copiarTexto(`🔥 *OFERTA* 🔥\n\n${montarTextoPromocional(p.descricao, String(p.normal ?? ''), String(p.promo ?? ''))}\n\n📍 Corre que é por tempo limitado!`);
  }

  function handleCopiarTextoTodos() {
    if (produtos.length === 0) {
      setToast('Importe produtos antes de gerar o texto.');
      return;
    }
    let texto = '🔥 *OFERTAS DA SEMANA — DROGARIA CENTER* 🔥\n\n';
    produtos.forEach((p) => {
      texto += `${montarTextoPromocional(p.descricao, String(p.normal ?? ''), String(p.promo ?? ''))}\n\n`;
    });
    texto += '📍 Válido enquanto durar o estoque!';
    copiarTexto(texto);
  }

  function handleUsarNoPanfleto() {
    const comImagem = produtos.filter((p) => p.imagem);
    if (comImagem.length === 0) {
      setToast('Nenhum produto tem imagem ainda. Busque ou envie fotos antes de usar no panfleto.');
      return;
    }
    aoEnviarParaPanfleto(
      comImagem.map((p) => ({
        imagem: p.imagem as HTMLImageElement,
        nome: p.descricao,
        de: p.normal !== null ? String(p.normal) : '',
        por: p.promo !== null ? String(p.promo) : '',
        transform: p.transform,
        arquivoId: p.arquivoId,
      })),
    );
    setToast(`${comImagem.length} produto(s) enviados pro panfleto!`);
  }

  /** Gera o story de cada produto com foto e abre a prévia em galeria antes de baixar/compartilhar — ver GaleriaStoriesModal. */
  function handleGerarGaleriaStories() {
    const comImagem = produtos.filter((p) => p.imagem);
    if (comImagem.length === 0) {
      setToast('Nenhum produto tem imagem ainda. Busque ou envie fotos antes de gerar os stories.');
      return;
    }
    const itens = comImagem.map((p, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = LARGURA_STORY;
      canvas.height = ALTURA_STORY;
      const ctx = canvas.getContext('2d')!;
      pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, {
        imagem: p.imagem,
        transformImagem: p.transform,
        nome: p.descricao,
        de: p.normal !== null ? String(p.normal) : '',
        por: p.promo !== null ? String(p.promo) : '',
        emoji: '🤩😱',
        corLogo,
        corTextoNome,
        corPreco,
        nomeY: 130,
        precoY: 320,
        nomeOffsetX: 0,
        precoOffsetX: 0,
        tamanhoNome: 40,
        tamanhoPreco: 62,
        frases: '',
        frasesY: 560,
        frasesOffsetX: 0,
        corFundoFrases: '#173C3A',
        corTextoFrases: '#FFFFFF',
        tamanhoFrases: 32,
        margemNome: 60,
        margemPreco: 60,
        margemFrases: 60,
      });
      const nomeSeguro = p.descricao.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || `produto-${i + 1}`;
      return { conteudo: canvas.toDataURL('image/png'), nomeArquivo: `story-${String(i + 1).padStart(2, '0')}-${nomeSeguro}.png`, mime: 'image/png', rotulo: p.descricao };
    });
    setItensGaleriaStories(itens);
  }

  async function handleBaixarZipStories() {
    if (!itensGaleriaStories) return;
    setGerandoZip(true);
    try {
      const tituloCompartilhamento = `${itensGaleriaStories.length} ${itensGaleriaStories.length === 1 ? 'story' : 'stories'} de ofertas`;
      await compartilharOuBaixarVarios(itensGaleriaStories, `stories-${Date.now()}.zip`, tituloCompartilhamento);
      setItensGaleriaStories(null);
    } catch {
      setToast('Não foi possível gerar o pacote de stories. Tente novamente.');
    } finally {
      setGerandoZip(false);
    }
  }

  const produtoAjuste = ajusteIdx !== null ? produtos[ajusteIdx] : null;

  if (carregandoProjeto) {
    return <div className="card cartaz-painel">Carregando…</div>;
  }

  return (
    <>
      {mostrarPainelProjetos && (
        <ProjetosCartazPainel tipo="planilha" onAbrirProjeto={aplicarProjeto} onFechar={projetoAtivo ? () => setMostrarPainelProjetos(false) : undefined} />
      )}

      {projetoAtivo && (
        <>
          <div className="card cartaz-painel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <h3 className="cartaz-titulo-secao" style={{ margin: 0 }}>
                Importar planilha (.xls ou .xlsx)
              </h3>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, fontSize: 12 }} onClick={handleTrocarProjeto}>
                📁 {projetoAtivo.nome}
              </button>
            </div>
            <label className="upload-box cartaz-upload-planilha" onClick={() => inputPlanilhaRef.current?.click()}>
              📊 Clique para escolher o arquivo da planilha
            </label>
            <input ref={inputPlanilhaRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={handleEscolherPlanilha} />
            <p className="footnote" style={{ textAlign: 'left' }}>
              {statusImportacao}
            </p>

            {!carregandoArquivosSalvos && arquivosSalvos.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <label>Arquivos já enviados (de qualquer computador ou celular)</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {arquivosSalvos.map((a) => (
                    <div key={a.id} className="batch-row" style={{ padding: '8px 10px' }}>
                      <div className="thumb">📄</div>
                      <div className="binfo">
                        <div className="bname">{a.nomeOriginal}</div>
                        <div className="bprice">
                          {formatarTamanho(a.tamanhoBytes)} · {new Date(a.criadoEm).toLocaleString('pt-BR')}
                        </div>
                      </div>
                      <div className="bactions">
                        <button type="button" onClick={() => handleUsarArquivoSalvo(a)} disabled={usandoArquivoSalvoId !== null}>
                          {usandoArquivoSalvoId === a.id ? 'Abrindo…' : '📥 Usar este arquivo'}
                        </button>
                        <button type="button" className="del" onClick={() => handleRemoverArquivoSalvo(a)}>
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '18px 0' }} />

            <h3 className="cartaz-titulo-secao">Ou cole direto do Excel/Sheets (uma coluna por vez)</h3>
            <p className="footnote" style={{ textAlign: 'left', marginBottom: 10 }}>
              Copia uma coluna inteira da planilha (Ctrl+C) e cola no campo correspondente abaixo — um valor por linha. A
              ordem das linhas é o que liga um campo ao outro (linha 1 de "Descrição" = linha 1 de "Preço Normal" etc).
            </p>
            <div className="field">
              <label>Descrição do produto (uma por linha)</label>
              <textarea
                rows={4}
                value={descColada}
                onChange={(e) => setDescColada(e.target.value)}
                placeholder={'ABERALGINA 500MG/ML GTS 10ML\nAPEVITIN BC LIQ 240ML\n...'}
              />
            </div>
            <div className="paste-grid">
              <div className="field">
                <label>Preço Normal</label>
                <textarea rows={4} value={normalColada} onChange={(e) => setNormalColada(e.target.value)} placeholder={'4,00\n17,00\n...'} />
              </div>
              <div className="field">
                <label>Valor Promoção</label>
                <textarea rows={4} value={promoColada} onChange={(e) => setPromoColada(e.target.value)} placeholder={'1,99\n9,99\n...'} />
              </div>
              <div className="field">
                <label>EAN</label>
                <textarea rows={4} value={eanColada} onChange={(e) => setEanColada(e.target.value)} placeholder={'7894164000050\n...'} />
              </div>
            </div>
            <button type="button" className="btn-primary cartaz-import-action" onClick={handleAdicionarColados}>
              + Adicionar produtos colados
            </button>
          </div>

          {produtos.length > 0 && (
            <div className="card cartaz-painel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <h3 className="cartaz-titulo-secao" style={{ margin: 0 }}>
                  Produtos importados ({produtos.length})
                </h3>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={handleBuscarTodas} disabled={buscandoTodas}>
                    {buscandoTodas ? 'Buscando…' : '🔍 Buscar todas as imagens'}
                  </button>
                  <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={handleUsarNoPanfleto}>
                    🗞️ Usar no panfleto
                  </button>
                  <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={handleCopiarTextoTodos}>
                    📋 Copiar texto pronto
                  </button>
                  <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={handleGerarGaleriaStories}>
                    👁️ Ver todos os stories antes de baixar
                  </button>
                  <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={handleRemoverTodos}>
                    🗑️ Remover todos
                  </button>
                </div>
              </div>
              <p className="footnote" style={{ textAlign: 'left', marginBottom: 12 }}>
                A busca automática de imagem nem sempre funciona (muitos sites bloqueiam uso externo da foto) — quando
                falhar, use "Trocar" pra enviar a foto manualmente.
              </p>
              <div className="field-row">
                <div className="field">
                  <label>Cor do logo/nome (stories gerados)</label>
                  <input type="color" value={corLogo} onChange={(e) => setCorLogo(e.target.value)} />
                </div>
                <div className="field">
                  <label>Cor do texto do nome</label>
                  <input type="color" value={corTextoNome} onChange={(e) => setCorTextoNome(e.target.value)} />
                </div>
                <div className="field">
                  <label>Cor do preço</label>
                  <input type="color" value={corPreco} onChange={(e) => setCorPreco(e.target.value)} />
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {produtos.map((p, idx) => {
                  const statusUpload = statusUploadDoProduto(idx);
                  return (
                    <div className="batch-row" key={`${p.descricao}-${idx}`}>
                      <div className="thumb">{p.imagem ? <img src={p.imagem.src} alt="" /> : '💊'}</div>
                      <div className="binfo">
                        <div className="bname">{p.descricao}</div>
                        <div className="bprice">
                          {p.normal ? `De R$${fmtMoney(p.normal)} · ` : ''}
                          {p.promo ? `Por R$${fmtMoney(p.promo)}` : 'sem preço promo'}
                          {p.ean ? ` · EAN ${p.ean}` : ''}
                        </div>
                        <span className={`bstatus ${p.status}`}>{ROTULO_STATUS[p.status]}</span>
                        {statusUpload?.estado === 'enviando' && <span className="bstatus searching"> · Enviando foto {statusUpload.progresso}%</span>}
                        {statusUpload?.estado === 'erro' && (
                          <span className="bstatus failed">
                            {' '}
                            · Envio falhou —{' '}
                            <button
                              type="button"
                              className="btn-ghost"
                              style={{ width: 'auto', margin: 0, padding: '1px 6px', fontSize: 11 }}
                              onClick={() => fila.tentarNovamente(idxParaIdLocalRef.current.get(idx)!)}
                            >
                              Tentar de novo
                            </button>
                          </span>
                        )}
                      </div>
                      <div className="bactions">
                        <button type="button" onClick={() => buscarImagemProduto(idx)}>
                          🔍 Buscar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            trocaAlvoIdx.current = idx;
                            inputManualRef.current?.click();
                          }}
                        >
                          📤 Trocar
                        </button>
                        <button type="button" onClick={() => setCameraDestino(idx)}>
                          📸 Foto
                        </button>
                        {p.imagem && (
                          <button type="button" onClick={() => setAjusteIdx(idx)}>
                            🖼️ Ajustar
                          </button>
                        )}
                        <button type="button" onClick={() => handleCopiarTextoItem(idx)}>
                          📋 Copiar texto
                        </button>
                        <button type="button" className="del" onClick={() => handleRemoverProduto(idx)}>
                          Remover
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      <input ref={inputManualRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleTrocarFotoManual} />

      {toast && <div className="toast">{toast}</div>}

      <CameraModal
        aberto={cameraDestino !== null}
        onFechar={() => setCameraDestino(null)}
        onCapturar={async (img) => {
          const idx = cameraDestino;
          setCameraDestino(null);
          if (idx === null) return;
          atualizarProduto(idx, { imagem: img, status: 'manual', transform: TRANSFORM_PADRAO, arquivoId: null });
          try {
            const blob = await blobDeImagem(img, 'image/jpeg', 0.92);
            enviarFotoDoProduto(idx, blob, 'image/jpeg');
          } catch {
            setToast('Não foi possível processar a foto capturada.');
          }
        }}
        guias={montarGuiasCameraDoStory() as GuiaCamera[]}
      />

      {produtoAjuste?.imagem && (
        <AjustarEnquadramentoModal
          imagem={produtoAjuste.imagem}
          transformInicial={produtoAjuste.transform}
          onFechar={() => setAjusteIdx(null)}
          onSalvar={(t) => {
            if (ajusteIdx !== null) atualizarProduto(ajusteIdx, { transform: t });
            setAjusteIdx(null);
          }}
        />
      )}

      {itensGaleriaStories && (
        <GaleriaStoriesModal
          itens={itensGaleriaStories.map((item) => ({ nomeArquivo: item.nomeArquivo, rotulo: item.rotulo, dataUrl: item.conteudo }))}
          baixando={gerandoZip}
          onBaixar={handleBaixarZipStories}
          onFechar={() => setItensGaleriaStories(null)}
        />
      )}
    </>
  );
}
