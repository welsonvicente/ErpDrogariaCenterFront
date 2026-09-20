import { useRef, type PointerEvent, type RefObject } from 'react';
import { ALTURA_STORY, LARGURA_STORY, posicaoXFaixa } from '../utils/cartazEngine';

/**
 * Faixa (nome/preço/frases) sobreposta ao preview do story, arrastável em
 * qualquer direção — a pessoa escolhe onde cada informação fica sobre a foto.
 * Portada da versão original em `public/tools/cartazes.html`
 * (`makeGuideDraggable`): mede a posição em pixels no espaço fixo do canvas
 * (1080×1920) e converte pra porcentagem da moldura visível, que pode estar
 * em qualquer tamanho na tela (responsiva).
 */
export function FaixaArrastavel({
  frameRef,
  y,
  offsetX,
  margem,
  visivel,
  corClasse,
  rotulo,
  onMover,
}: {
  frameRef: RefObject<HTMLDivElement | null>;
  y: number;
  offsetX: number;
  margem: number;
  visivel: boolean;
  corClasse: string;
  rotulo: string;
  onMover: (offsetX: number, y: number) => void;
}) {
  const arrastando = useRef(false);
  const inicio = useRef({ clientX: 0, clientY: 0, offsetX: 0, y: 0 });

  if (!visivel) return null;

  const x = posicaoXFaixa(margem, offsetX);
  const largura = LARGURA_STORY - margem * 2;

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    arrastando.current = true;
    inicio.current = { clientX: e.clientX, clientY: e.clientY, offsetX, y };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!arrastando.current || !frameRef.current) return;
    const escalaY = frameRef.current.clientHeight / ALTURA_STORY;
    const escalaX = frameRef.current.clientWidth / LARGURA_STORY;
    const deltaY = (e.clientY - inicio.current.clientY) / escalaY;
    const deltaX = (e.clientX - inicio.current.clientX) / escalaX;
    const novoY = Math.max(0, Math.min(ALTURA_STORY - 140, inicio.current.y + deltaY));
    const novoOffsetX = inicio.current.offsetX + deltaX; // o clamp horizontal já acontece em posicaoXFaixa
    onMover(novoOffsetX, novoY);
  }

  function handlePointerUp() {
    arrastando.current = false;
  }

  return (
    <div
      className={`faixa-arrasto ${corClasse}`}
      style={{
        top: `${(y / ALTURA_STORY) * 100}%`,
        left: `${(x / LARGURA_STORY) * 100}%`,
        width: `${(largura / LARGURA_STORY) * 100}%`,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      ↕ {rotulo} <span className="faixa-arrasto-dica">arraste</span>
    </div>
  );
}
