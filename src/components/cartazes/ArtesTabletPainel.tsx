import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { EscolherProdutosTabletModal } from './EscolherProdutosTabletModal';
import { ElementoStoryEditavel, type GuiasAlinhamentoStory } from '../ElementoStoryEditavel';
import { carregarImagemDeArquivo } from '../../utils/arquivoImagem';
import { carregarFundoDoServidor, enviarFundoParaServidor, type FundoNoServidor } from '../../utils/fundoNoServidor';
import { carregarFontesCartaz } from '../../utils/cartazEngine';
import { baixarArquivoDireto, baixarVariosDireto, compartilharOuBaixarVarios, salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';
import type { ProdutoPanfleto } from '../../utils/panfletoEngine';
import {
  alinharCaixasTablet,
  PRODUTOS_POR_ARTE_TABLET,
  ALTURA_TABLET,
  caixaLogoPadraoTablet,
  centralizarNaLargura,
  construirArtesTablet,
  LARGURA_TABLET,
  posicoesPadraoTablet,
  renderizarArteTablet,
  type CaixaTablet,
  type ParametrosArteTablet,
} from '../../utils/tabletEngine';

type Selecao = number | 'logo' | null;

interface ArtesTabletPainelProps {
  produtos: ProdutoPanfleto[];
  imagemLogo: HTMLImageElement | null;
  cores: Pick<ParametrosArteTablet, 'corFundoCard' | 'corDescricao' | 'corPreco' | 'corFundoSelo' | 'corTextoSelo'>;
  /** Posições personalizadas dos 4 cards (valem pra todas as artes) — null = layout padrão centralizado. */
  caixas: CaixaTablet[] | null;
  onCaixas: (caixas: CaixaTablet[] | null) => void;
  logoCaixa: CaixaTablet | null;
  onLogoCaixa: (caixa: CaixaTablet | null) => void;
  /** A logo é a mesma do panfleto; aqui só dá pra esconder/mostrar nas artes do tablet. */
  mostrarLogo: boolean;
  onMostrarLogo: (mostrar: boolean) => void;
  /** Fundo salvo no servidor (referência no R2) — null = degradê padrão. */
  fundoSalvo: FundoNoServidor | null;
  onFundoSalvo: (fundo: FundoNoServidor | null) => void;
  /** Tira (fora = true) ou devolve produtos às artes do tablet, pelos índices na lista do panfleto. */
  onDefinirForaDoTablet: (indices: number[], fora: boolean) => void;
  onAviso: (mensagem: string) => void;
}

/**
 * Artes pro tablet da loja (PNG 1920×1080, 4 produtos por arte) com os
 * mesmos produtos do Panfleto. Fundo trocável e cards/logo arrastáveis com o
 * mouse ou o dedo (ver ElementoStoryEditavel). As posições valem pra todas as
 * artes — muda uma vez, sai igual em todas.
 */
export function ArtesTabletPainel({ produtos, imagemLogo, cores, caixas, onCaixas, logoCaixa, onLogoCaixa, mostrarLogo, onMostrarLogo, fundoSalvo, onFundoSalvo, onDefinirForaDoTablet, onAviso }: ArtesTabletPainelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inputFundoRef = useRef<HTMLInputElement>(null);
  const [imagemFundo, setImagemFundo] = useState<HTMLImageElement | null>(null);
  const [enviandoFundo, setEnviandoFundo] = useState(false);
  const fundoMostradoRef = useRef<string | null | undefined>(undefined);

  // Fundo salvo no servidor: baixa quando muda (ao abrir, ou trocado em outro aparelho).
  useEffect(() => {
    const id = fundoSalvo?.arquivoId ?? null;
    // Só pula o download se ESTA imagem já está na tela (acabou de ser escolhida aqui). A marca é feita
    // depois de baixar — marcar antes fazia um download cancelado (efeito rodando 2x ao abrir a tela)
    // impedir o próximo, e o fundo salvo não aparecia.
    if (id && fundoMostradoRef.current === id) return;
    if (!id) {
      fundoMostradoRef.current = null;
      return setImagemFundo(null);
    }
    let cancelado = false;
    carregarFundoDoServidor(id)
      .then((img) => {
        if (cancelado) return;
        fundoMostradoRef.current = id;
        setImagemFundo(img);
      })
      .catch(() => { if (!cancelado) onAviso('Não foi possível baixar o fundo salvo das artes do tablet.'); });
    return () => { cancelado = true; };
    // Depende só do ID: a sincronização das preferências reaplica o mesmo fundo como objeto novo, e
    // depender do objeto cancelava o download em andamento sem começar outro (o fundo não aparecia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundoSalvo?.arquivoId]);
  const [arteAtual, setArteAtual] = useState(0);
  const [selecao, setSelecao] = useState<Selecao>(null);
  const [escolhendoProdutos, setEscolhendoProdutos] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [fontesProntas, setFontesProntas] = useState(false);
  /** Régua: linha que aparece enquanto um produto/logo arrastado fica alinhado com outro ou com o centro da arte. */
  const [guias, setGuias] = useState<GuiasAlinhamentoStory | null>(null);

  // O tablet não aguenta passar todas as artes: só os produtos marcados entram (todos, por padrão).
  const indicesNoTablet = produtos.flatMap((p, i) => (p.foraDoTablet ? [] : [i]));
  const artes = construirArtesTablet(indicesNoTablet.map((i) => produtos[i]));
  const indice = Math.min(arteAtual, Math.max(0, artes.length - 1));
  const produtosDaArte = artes[indice] ?? [];
  /** Índice no panfleto do produto que está no card `i` da arte aberta. */
  const indiceNoPanfleto = (i: number) => indicesNoTablet[indice * PRODUTOS_POR_ARTE_TABLET + i];

  function tirarDoTablet(i: number) {
    const idx = indiceNoPanfleto(i);
    if (idx === undefined) return;
    onDefinirForaDoTablet([idx], true);
    setSelecao(null);
    onAviso(`"${produtos[idx].nome}" saiu do tablet. Para colocar de novo, marque-o em "Escolher produtos do tablet".`);
  }
  const logoVisivel = mostrarLogo ? imagemLogo : null;
  const logoEfetiva = logoVisivel ? logoCaixa ?? caixaLogoPadraoTablet(logoVisivel) : null;

  /** Posições usadas numa arte: as personalizadas, ou o padrão centralizado pra quantidade de produtos dela. */
  function caixasDaArte(quantidade: number) {
    if (!caixas) return posicoesPadraoTablet(quantidade);
    // Arte com menos produtos (a última): os que existem ficam centralizados, com espaços iguais.
    return quantidade < caixas.length ? centralizarNaLargura(caixas.slice(0, quantidade)) : caixas;
  }

  function parametros(): ParametrosArteTablet {
    return { imagemFundo, imagemLogo: logoVisivel, logoCaixa: logoEfetiva, ...cores };
  }

  useEffect(() => {
    carregarFontesCartaz(['Inter']).finally(() => setFontesProntas(true));
  }, []);

  useEffect(() => {
    if (arteAtual > artes.length - 1) setArteAtual(Math.max(0, artes.length - 1));
  }, [artes.length, arteAtual]);

  useEffect(() => {
    if (canvasRef.current) renderizarArteTablet(canvasRef.current, produtosDaArte, caixasDaArte(produtosDaArte.length), parametros());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtos, indice, caixas, logoCaixa, imagemLogo, mostrarLogo, imagemFundo, cores.corFundoCard, cores.corDescricao, cores.corPreco, cores.corFundoSelo, cores.corTextoSelo, fontesProntas]);

  /** Mover um card personaliza o layout inteiro: parte das posições atuais (padrão de 4) e troca só a deste card. */
  function moverCard(i: number, caixa: CaixaTablet) {
    const base = caixas ?? posicoesPadraoTablet(4);
    onCaixas(base.map((atual, j) => (j === i ? { x: caixa.x, y: caixa.y, largura: caixa.largura, altura: caixa.altura } : atual)));
  }

  // Delete/Backspace com algo selecionado na arte: tira o produto (ou a logo) do tablet. Escuta na página
  // inteira porque, depois de clicar na arte, o foco nem sempre fica no card.
  const teclaApagarRef = useRef<(e: KeyboardEvent) => void>(() => {});
  teclaApagarRef.current = (e: KeyboardEvent) => {
    if (selecao === null || (e.key !== 'Delete' && e.key !== 'Backspace')) return;
    const alvo = e.target as HTMLElement | null;
    if (alvo && (alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName))) return;
    e.preventDefault();
    if (selecao === 'logo') {
      onMostrarLogo(false);
      setSelecao(null);
    } else tirarDoTablet(selecao);
  };
  useEffect(() => {
    if (selecao === null) return;
    const ouvir = (e: KeyboardEvent) => teclaApagarRef.current(e);
    window.addEventListener('keydown', ouvir);
    return () => window.removeEventListener('keydown', ouvir);
  }, [selecao]);

  async function handleEscolherFundo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setEnviandoFundo(true);
    try {
      // Mostra na hora e envia pro servidor — o fundo passa a valer em todos os aparelhos da conta.
      const img = await carregarImagemDeArquivo(arquivo);
      setImagemFundo(img);
      const arquivoId = await enviarFundoParaServidor(img, LARGURA_TABLET);
      fundoMostradoRef.current = arquivoId; // já está na tela
      onFundoSalvo({ nome: arquivo.name, arquivoId });
    } catch {
      onAviso('Não foi possível salvar esse fundo no servidor. Confira a conexão e tente de novo.');
    } finally {
      setEnviandoFundo(false);
    }
  }

  function gerarPng(produtosDaPagina: ProdutoPanfleto[]): Promise<Blob> {
    const canvas = document.createElement('canvas');
    renderizarArteTablet(canvas, produtosDaPagina, caixasDaArte(produtosDaPagina.length), parametros());
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png'));
  }

  async function handleBaixarTodas() {
    if (produtos.length === 0) return onAviso('Adicione produtos ao panfleto antes de baixar as artes do tablet.');
    if (artes.length === 0) return onAviso('Nenhum produto marcado para o tablet. Clique em "Escolher produtos do tablet".');
    setBaixando(true);
    try {
      const itens = await Promise.all(
        artes.map(async (pagina, i) => ({ conteudo: await gerarPng(pagina), nomeArquivo: `tablet-${String(i + 1).padStart(2, '0')}.png`, mime: 'image/png' })),
      );
      if (itens.length === 1) await salvarOuCompartilharArquivo(itens[0].conteudo, itens[0].nomeArquivo, 'image/png', 'Arte do tablet');
      else await compartilharOuBaixarVarios(itens, `artes-tablet-${Date.now()}.zip`, 'Artes do tablet');
    } catch {
      onAviso('Não foi possível gerar as artes do tablet. Tente novamente.');
    } finally {
      setBaixando(false);
    }
  }

  /** Salva direto na pasta Downloads do computador (sem a janela de compartilhar): a arte aberta ou todas, em PNGs separados. */
  async function handleSalvarNoComputador(todas: boolean) {
    if (artes.length === 0) return onAviso('Nenhum produto marcado para o tablet. Clique em "Escolher produtos do tablet".');
    setBaixando(true);
    try {
      const paginas = todas ? artes.map((pagina, i) => ({ pagina, i })) : [{ pagina: produtosDaArte, i: indice }];
      const itens = await Promise.all(paginas.map(async ({ pagina, i }) => ({ conteudo: await gerarPng(pagina), nomeArquivo: `tablet-${String(i + 1).padStart(2, '0')}.png`, mime: 'image/png' })));
      if (itens.length === 1) await baixarArquivoDireto(itens[0].conteudo, itens[0].nomeArquivo, 'image/png');
      else await baixarVariosDireto(itens);
      onAviso(itens.length === 1 ? 'Arte salva na pasta Downloads.' : `${itens.length} artes salvas na pasta Downloads.`);
    } catch {
      onAviso('Não foi possível salvar as artes do tablet. Tente novamente.');
    } finally {
      setBaixando(false);
    }
  }

  async function handleBaixarAtual() {
    if (produtosDaArte.length === 0) return onAviso('Adicione produtos ao panfleto antes de baixar as artes do tablet.');
    setBaixando(true);
    try {
      await salvarOuCompartilharArquivo(await gerarPng(produtosDaArte), `tablet-${String(indice + 1).padStart(2, '0')}.png`, 'image/png', 'Arte do tablet');
    } catch {
      onAviso('Não foi possível gerar a arte do tablet. Tente novamente.');
    } finally {
      setBaixando(false);
    }
  }

  const caixasVisiveis = caixasDaArte(produtosDaArte.length).slice(0, produtosDaArte.length);
  const comoCaixaEditavel = (c: CaixaTablet, minimo: number) => ({ ...c, larguraMinima: minimo, alturaMinima: minimo });

  return (
    <div className="card cartaz-painel tablet-painel">
      <div className="tablet-painel-head">
        <div>
          <h3 className="cartaz-titulo-secao" style={{ margin: 0 }}>🖥️ Artes para o tablet da loja</h3>
          <p className="footnote" style={{ textAlign: 'left', margin: '4px 0 0' }}>
            PNG 1920×1080, 4 produtos por arte — {artes.length} arte(s) com os {indicesNoTablet.length} produto(s) marcados para o tablet. Arraste os produtos e a logo
            com o mouse ou o dedo; pelas bordas, muda o tamanho. As posições valem para todas as artes.
          </p>
        </div>
      </div>

      <div className="tablet-painel-acoes">
        <button type="button" className="btn-ghost" disabled={enviandoFundo} onClick={() => inputFundoRef.current?.click()}>🖼️ {enviandoFundo ? 'Enviando fundo…' : imagemFundo ? 'Trocar fundo' : 'Escolher fundo'}</button>
        {imagemFundo && <button type="button" className="btn-ghost" disabled={enviandoFundo} onClick={() => onFundoSalvo(null)}>Remover fundo</button>}
        <button type="button" className="btn-ghost" disabled={!caixas} onClick={() => caixas && onCaixas(alinharCaixasTablet(caixas))}>📐 Alinhar produtos</button>
        <button type="button" className="btn-ghost" disabled={!caixas && !logoCaixa} onClick={() => { onCaixas(null); onLogoCaixa(null); setSelecao(null); }}>↺ Posições padrão</button>
        {imagemLogo && (mostrarLogo ? (
          <button type="button" className="btn-ghost" onClick={() => { onMostrarLogo(false); setSelecao(null); }}>🗑️ Remover logo do tablet</button>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => onMostrarLogo(true)}>➕ Mostrar logo do panfleto</button>
        ))}
        <input ref={inputFundoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEscolherFundo} />
      </div>

      <div className="tablet-produtos">
        <div>
          <b>Produtos no tablet</b>{' '}
          <span className="tablet-produtos-conta">{indicesNoTablet.length} de {produtos.length} · {artes.length} arte(s)</span>
          <p className="footnote" style={{ textAlign: 'left', margin: '4px 0 0' }}>
            O tablet passa só as artes dos produtos marcados. Quem fica de fora continua no panfleto.
          </p>
        </div>
        <button type="button" className="btn-primary" disabled={produtos.length === 0} onClick={() => { setSelecao(null); setEscolhendoProdutos(true); }}>
          🖥️ Escolher produtos do tablet
        </button>
      </div>
      {escolhendoProdutos && (
        <EscolherProdutosTabletModal
          produtos={produtos}
          quantidadeArtes={artes.length}
          onDefinirForaDoTablet={onDefinirForaDoTablet}
          onFechar={() => setEscolhendoProdutos(false)}
        />
      )}

      {typeof selecao === 'number' && produtosDaArte[selecao] && (
        <div className="tablet-selecao-acoes">
          <span className="footnote" style={{ margin: 0, textAlign: 'left' }}><b>{produtosDaArte[selecao].nome}</b> — arraste para mover, ou tire só do tablet (tecla Delete).</span>
          <button type="button" className="btn-ghost" onClick={() => tirarDoTablet(selecao)}>🗑️ Tirar do tablet</button>
        </div>
      )}
      {produtos.length > 0 && artes.length === 0 && (
        <p className="footnote tablet-vazio">Nenhum produto marcado para o tablet. Clique em "Escolher produtos do tablet" e marque os que quer destacar.</p>
      )}
      {selecao === 'logo' && (
        <p className="footnote" style={{ textAlign: 'left', margin: '0 0 8px' }}>
          Essa é a <b>logomarca do panfleto</b> (em "Logomarca ou selo"). Arraste pra mover; pra tirar só do tablet, use "Remover logo do tablet" ou a tecla Delete.
        </p>
      )}
      <div className="tablet-stage-frame">
        <div
          className="tablet-stage"
          ref={stageRef}
          onPointerDownCapture={(e) => { if (e.target === canvasRef.current) setSelecao(null); }}
        >
          <canvas ref={canvasRef} className="tablet-canvas" />
          {guias?.vertical !== undefined && <i className="story-alignment-guide story-alignment-guide--vertical" style={{ left: `${(guias.vertical / LARGURA_TABLET) * 100}%` }} aria-hidden="true" />}
          {guias?.horizontal !== undefined && <i className="story-alignment-guide story-alignment-guide--horizontal" style={{ top: `${(guias.horizontal / ALTURA_TABLET) * 100}%` }} aria-hidden="true" />}
          {caixasVisiveis.map((caixa, i) => (
            <ElementoStoryEditavel
              key={i}
              frameRef={stageRef}
              caixa={comoCaixaEditavel(caixa, 160)}
              selecionado={selecao === i}
              descricao={`Produto ${i + 1}: ${produtosDaArte[i]?.nome ?? ''}`}
              tamanho={1}
              tamanhoMinimo={1}
              tamanhoMaximo={1}
              controlaTipografia={false}
              larguraArte={LARGURA_TABLET}
              alturaArte={ALTURA_TABLET}
              caixasVizinhas={caixasVisiveis.filter((_, j) => j !== i).map((c) => comoCaixaEditavel(c, 160))}
              onGuiasAlinhadas={setGuias}
              onSelecionar={() => setSelecao(i)}
              onAlterar={(nova) => moverCard(i, nova)}
            />
          ))}
          {logoEfetiva && (
            <ElementoStoryEditavel
              frameRef={stageRef}
              caixa={comoCaixaEditavel(logoEfetiva, 40)}
              selecionado={selecao === 'logo'}
              descricao="Logomarca"
              tamanho={1}
              tamanhoMinimo={1}
              tamanhoMaximo={1}
              controlaTipografia={false}
              larguraArte={LARGURA_TABLET}
              alturaArte={ALTURA_TABLET}
              caixasVizinhas={caixasVisiveis.map((c) => comoCaixaEditavel(c, 160))}
              onGuiasAlinhadas={setGuias}
              onSelecionar={() => setSelecao('logo')}
              onAlterar={(nova) => onLogoCaixa({ x: nova.x, y: nova.y, largura: nova.largura, altura: nova.altura })}
            />
          )}
        </div>
      </div>

      <div className="tablet-painel-rodape">
        {artes.length > 1 && (
          <div className="panfleto-paginacao">
            <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} disabled={indice === 0} onClick={() => setArteAtual(indice - 1)}>◀</button>
            <span>Arte {indice + 1}/{artes.length}</span>
            <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} disabled={indice >= artes.length - 1} onClick={() => setArteAtual(indice + 1)}>▶</button>
          </div>
        )}
        <div className="tablet-painel-downloads">
          <button type="button" className="btn-ghost" disabled={baixando || produtosDaArte.length === 0} onClick={() => void handleSalvarNoComputador(false)}>💾 Salvar esta no computador</button>
          <button type="button" className="btn-ghost" disabled={baixando || artes.length === 0} onClick={() => void handleSalvarNoComputador(true)}>💾 Salvar todas no computador ({artes.length})</button>
          <button type="button" className="btn-ghost" disabled={baixando || produtosDaArte.length === 0} onClick={() => void handleBaixarAtual()}>⬇️ Baixar esta arte</button>
          <button type="button" className="btn-primary" disabled={baixando || artes.length === 0} onClick={() => void handleBaixarTodas()}>
            {baixando ? 'Gerando…' : `⬇️ Baixar todas (${artes.length} PNG)`}
          </button>
        </div>
      </div>
    </div>
  );
}
