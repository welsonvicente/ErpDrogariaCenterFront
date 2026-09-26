import { useRef, useState, type KeyboardEvent, type PointerEvent, type RefObject } from 'react';
import { ALTURA_STORY, LARGURA_STORY, type CaixaStory } from '../utils/cartazEngine';

type Lado = 'move' | 'left' | 'right' | 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface Inicio {
  clientX: number;
  clientY: number;
  caixa: CaixaStory;
  lado: Lado;
  tamanho: number;
}

export interface GuiasAlinhamentoStory {
  vertical?: number;
  horizontal?: number;
}

/** Seleção discreta e edição por gesto do conteúdo já desenhado no canvas. */
export function ElementoStoryEditavel({
  frameRef,
  caixa,
  selecionado,
  descricao,
  tamanho,
  tamanhoMinimo,
  tamanhoMaximo,
  controlaTipografia = true,
  larguraArte = LARGURA_STORY,
  alturaArte = ALTURA_STORY,
  caixasVizinhas = [],
  onSelecionar,
  onAlterar,
  onGuiasAlinhadas,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  caixa: CaixaStory | null;
  selecionado: boolean;
  descricao: string;
  tamanho: number;
  tamanhoMinimo: number;
  tamanhoMaximo: number;
  controlaTipografia?: boolean;
  /** Tamanho lógico da arte onde a caixa vive — padrão é o Story (1080×1920); o Panfleto passa o tamanho da página. */
  larguraArte?: number;
  alturaArte?: number;
  caixasVizinhas?: CaixaStory[];
  onSelecionar: () => void;
  onAlterar: (caixa: CaixaStory, tamanho?: number) => void;
  onGuiasAlinhadas?: (guias: GuiasAlinhamentoStory | null) => void;
}) {
  const inicio = useRef<Inicio | null>(null);
  const [arrastando, setArrastando] = useState(false);

  if (!caixa) return null;
  const caixaAtiva = caixa;

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const borda = 16;
    const xLocal = e.clientX - rect.left;
    const yLocal = e.clientY - rect.top;
    const esquerda = xLocal <= borda;
    const direita = xLocal >= rect.width - borda;
    const cima = yLocal <= borda;
    const baixo = yLocal >= rect.height - borda;
    const lado: Lado = cima && esquerda ? 'top-left'
      : cima && direita ? 'top-right'
      : baixo && esquerda ? 'bottom-left'
      : baixo && direita ? 'bottom-right'
      : esquerda ? 'left'
      : direita ? 'right'
      : cima ? 'top'
      : baixo ? 'bottom'
      : 'move';
    inicio.current = { clientX: e.clientX, clientY: e.clientY, caixa: caixaAtiva, lado, tamanho };
    setArrastando(true);
    onSelecionar();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    const estado = inicio.current;
    const frame = frameRef.current;
    if (!estado || !frame) return;
    const escalaX = frame.clientWidth / larguraArte;
    const escalaY = frame.clientHeight / alturaArte;
    const dx = (e.clientX - estado.clientX) / escalaX;
    const dy = (e.clientY - estado.clientY) / escalaY;
    const minLargura = estado.caixa.larguraMinima;

    if (estado.lado === 'move') {
      let proxima = {
        ...estado.caixa,
        x: Math.max(0, Math.min(larguraArte - estado.caixa.largura, estado.caixa.x + dx)),
        y: Math.max(0, Math.min(alturaArte - estado.caixa.altura, estado.caixa.y + dy)),
      };
      const tolerancia = 28 * (larguraArte / LARGURA_STORY); // 28px no Story, proporcional em artes menores
      const centrosX = [larguraArte / 2, ...caixasVizinhas.map((vizinha) => vizinha.x + vizinha.largura / 2)];
      const centrosY = [alturaArte / 2, ...caixasVizinhas.map((vizinha) => vizinha.y + vizinha.altura / 2)];
      const centroX = proxima.x + proxima.largura / 2;
      const centroY = proxima.y + proxima.altura / 2;
      const encaixeX = centrosX.find((centro) => Math.abs(centro - centroX) <= tolerancia);
      const encaixeY = centrosY.find((centro) => Math.abs(centro - centroY) <= tolerancia);

      if (encaixeX !== undefined) proxima.x = Math.max(0, Math.min(larguraArte - proxima.largura, encaixeX - proxima.largura / 2));
      if (encaixeY !== undefined) proxima.y = Math.max(0, Math.min(alturaArte - proxima.altura, encaixeY - proxima.altura / 2));
      onGuiasAlinhadas?.(encaixeX !== undefined || encaixeY !== undefined ? { vertical: encaixeX, horizontal: encaixeY } : null);
      onAlterar(proxima);
      return;
    }

    const mexeEsquerda = estado.lado === 'left' || estado.lado === 'top-left' || estado.lado === 'bottom-left';
    const mexeDireita = estado.lado === 'right' || estado.lado === 'top-right' || estado.lado === 'bottom-right';
    const mexeCima = estado.lado === 'top' || estado.lado === 'top-left' || estado.lado === 'top-right';
    const mexeBaixo = estado.lado === 'bottom' || estado.lado === 'bottom-left' || estado.lado === 'bottom-right';
    const minAltura = controlaTipografia ? estado.caixa.alturaMinima * (tamanhoMinimo / estado.tamanho) : estado.caixa.alturaMinima;
    let proxima: CaixaStory = { ...estado.caixa };

    if (mexeDireita) proxima.largura = Math.max(minLargura, Math.min(larguraArte - estado.caixa.x, estado.caixa.largura + dx));
    if (mexeEsquerda) {
      const x = Math.max(0, Math.min(estado.caixa.x + estado.caixa.largura - minLargura, estado.caixa.x + dx));
      proxima.x = x;
      proxima.largura = estado.caixa.largura + estado.caixa.x - x;
    }
    if (mexeBaixo) proxima.altura = Math.max(minAltura, Math.min(alturaArte - estado.caixa.y, estado.caixa.altura + dy));
    if (mexeCima) {
      const y = Math.max(0, Math.min(estado.caixa.y + estado.caixa.altura - minAltura, estado.caixa.y + dy));
      proxima.y = y;
      proxima.altura = estado.caixa.altura + estado.caixa.y - y;
    }

    const redimensionouAltura = mexeCima || mexeBaixo;
    const proximoTamanho = redimensionouAltura && controlaTipografia
      ? Math.max(tamanhoMinimo, Math.min(tamanhoMaximo, Math.round(estado.tamanho * (proxima.altura / estado.caixa.altura))))
      : undefined;
    onAlterar(proxima, proximoTamanho);
  }

  function encerrar() {
    inicio.current = null;
    setArrastando(false);
    onGuiasAlinhadas?.(null);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      onSelecionar();
      e.preventDefault();
      return;
    }
    const passo = e.shiftKey ? 20 : 8;
    const movimentos: Record<string, Partial<CaixaStory>> = {
      ArrowLeft: { x: Math.max(0, caixaAtiva.x - passo) },
      ArrowRight: { x: Math.min(larguraArte - caixaAtiva.largura, caixaAtiva.x + passo) },
      ArrowUp: { y: Math.max(0, caixaAtiva.y - passo) },
      ArrowDown: { y: Math.min(alturaArte - caixaAtiva.altura, caixaAtiva.y + passo) },
    };
    if (movimentos[e.key]) {
      onSelecionar();
      onAlterar({ ...caixaAtiva, ...movimentos[e.key] });
      e.preventDefault();
    }
  }

  return (
    <div
      className={`story-elemento-editavel${selecionado ? ' is-selected' : ''}${arrastando ? ' is-dragging' : ''}`}
      style={{
        top: `${(caixaAtiva.y / alturaArte) * 100}%`,
        left: `${(caixaAtiva.x / larguraArte) * 100}%`,
        width: `${(caixaAtiva.largura / larguraArte) * 100}%`,
        height: `${(caixaAtiva.altura / alturaArte) * 100}%`,
      }}
      aria-label={`${descricao}. Arraste pelo centro para mover; arraste pelas bordas para redimensionar.`}
      role="button"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={encerrar}
      onPointerCancel={encerrar}
      onKeyDown={handleKeyDown}
    >
      {selecionado && <>
        <i className="story-handle story-handle--top-left" /><i className="story-handle story-handle--top" /><i className="story-handle story-handle--top-right" />
        <i className="story-handle story-handle--left" /><i className="story-handle story-handle--right" />
        <i className="story-handle story-handle--bottom-left" /><i className="story-handle story-handle--bottom" /><i className="story-handle story-handle--bottom-right" />
      </>}
    </div>
  );
}
