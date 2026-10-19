import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ElementoStoryEditavel, type GuiasAlinhamentoStory } from '../ElementoStoryEditavel';
import { carregarImagemDeArquivo } from '../../utils/arquivoImagem';
import { carregarFontesCartaz } from '../../utils/cartazEngine';
import { compartilharOuBaixarVarios, salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';
import type { ProdutoPanfleto } from '../../utils/panfletoEngine';
import {
  alinharCaixasTablet,
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
  onAviso: (mensagem: string) => void;
}

/**
 * Artes pro tablet da loja (PNG 1920×1080, 4 produtos por arte) com os
 * mesmos produtos do Panfleto. Fundo trocável e cards/logo arrastáveis com o
 * mouse ou o dedo (ver ElementoStoryEditavel). As posições valem pra todas as
 * artes — muda uma vez, sai igual em todas.
 */
export function ArtesTabletPainel({ produtos, imagemLogo, cores, caixas, onCaixas, logoCaixa, onLogoCaixa, onAviso }: ArtesTabletPainelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inputFundoRef = useRef<HTMLInputElement>(null);
  const [imagemFundo, setImagemFundo] = useState<HTMLImageElement | null>(null);
  const [arteAtual, setArteAtual] = useState(0);
  const [selecao, setSelecao] = useState<Selecao>(null);
  const [baixando, setBaixando] = useState(false);
  const [fontesProntas, setFontesProntas] = useState(false);
  /** Régua: linha que aparece enquanto um produto/logo arrastado fica alinhado com outro ou com o centro da arte. */
  const [guias, setGuias] = useState<GuiasAlinhamentoStory | null>(null);

  const artes = construirArtesTablet(produtos);
  const indice = Math.min(arteAtual, artes.length - 1);
  const produtosDaArte = artes[indice] ?? [];
  const logoEfetiva = imagemLogo ? logoCaixa ?? caixaLogoPadraoTablet(imagemLogo) : null;

  /** Posições usadas numa arte: as personalizadas, ou o padrão centralizado pra quantidade de produtos dela. */
  function caixasDaArte(quantidade: number) {
    if (!caixas) return posicoesPadraoTablet(quantidade);
    // Arte com menos produtos (a última): os que existem ficam centralizados, com espaços iguais.
    return quantidade < caixas.length ? centralizarNaLargura(caixas.slice(0, quantidade)) : caixas;
  }

  function parametros(): ParametrosArteTablet {
    return { imagemFundo, imagemLogo, logoCaixa: logoEfetiva, ...cores };
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
  }, [produtos, indice, caixas, logoCaixa, imagemLogo, imagemFundo, cores.corFundoCard, cores.corDescricao, cores.corPreco, cores.corFundoSelo, cores.corTextoSelo, fontesProntas]);

  /** Mover um card personaliza o layout inteiro: parte das posições atuais (padrão de 4) e troca só a deste card. */
  function moverCard(i: number, caixa: CaixaTablet) {
    const base = caixas ?? posicoesPadraoTablet(4);
    onCaixas(base.map((atual, j) => (j === i ? { x: caixa.x, y: caixa.y, largura: caixa.largura, altura: caixa.altura } : atual)));
  }

  async function handleEscolherFundo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    try {
      setImagemFundo(await carregarImagemDeArquivo(arquivo));
    } catch {
      onAviso('Não foi possível abrir essa imagem de fundo.');
    }
  }

  function gerarPng(produtosDaPagina: ProdutoPanfleto[]): Promise<Blob> {
    const canvas = document.createElement('canvas');
    renderizarArteTablet(canvas, produtosDaPagina, caixasDaArte(produtosDaPagina.length), parametros());
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png'));
  }

  async function handleBaixarTodas() {
    if (produtos.length === 0) return onAviso('Adicione produtos ao panfleto antes de baixar as artes do tablet.');
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
            PNG 1920×1080, 4 produtos por arte — {artes.length} arte(s) com os produtos deste panfleto. Arraste os produtos e a logo
            com o mouse ou o dedo; pelas bordas, muda o tamanho. As posições valem para todas as artes.
          </p>
        </div>
      </div>

      <div className="tablet-painel-acoes">
        <button type="button" className="btn-ghost" onClick={() => inputFundoRef.current?.click()}>🖼️ {imagemFundo ? 'Trocar fundo' : 'Escolher fundo'}</button>
        {imagemFundo && <button type="button" className="btn-ghost" onClick={() => setImagemFundo(null)}>Remover fundo</button>}
        <button type="button" className="btn-ghost" disabled={!caixas} onClick={() => caixas && onCaixas(alinharCaixasTablet(caixas))}>📐 Alinhar produtos</button>
        <button type="button" className="btn-ghost" disabled={!caixas && !logoCaixa} onClick={() => { onCaixas(null); onLogoCaixa(null); setSelecao(null); }}>↺ Posições padrão</button>
        <input ref={inputFundoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEscolherFundo} />
      </div>

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
          <button type="button" className="btn-ghost" disabled={baixando || produtosDaArte.length === 0} onClick={() => void handleBaixarAtual()}>⬇️ Baixar esta arte</button>
          <button type="button" className="btn-primary" disabled={baixando || produtos.length === 0} onClick={() => void handleBaixarTodas()}>
            {baixando ? 'Gerando…' : `⬇️ Baixar todas (${artes.length} PNG)`}
          </button>
        </div>
      </div>
    </div>
  );
}
