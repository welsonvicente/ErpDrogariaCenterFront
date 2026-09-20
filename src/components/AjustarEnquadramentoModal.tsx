import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ALTURA_STORY, LARGURA_STORY, desenharImagemCover, type TransformImagem } from '../utils/cartazEngine';

const TRANSFORM_PADRAO: TransformImagem = { scale: 1, panX: 0.5, panY: 0.5 };
const LARGURA_PREVIEW = 300;
const ALTURA_PREVIEW = Math.round((LARGURA_PREVIEW / LARGURA_STORY) * ALTURA_STORY);

/**
 * Reenquadra/dá zoom na foto sem precisar reenviar — portado de
 * `openAdjustModal`/`drawAdjustPreview` em `public/tools/cartazes.html`.
 * Arrasta a FOTO dentro do quadro (metáfora tipo Instagram): arrastar pra
 * direita move a foto pra direita, o que corresponde a "olhar" mais pra
 * esquerda dela — por isso o sinal do eixo é invertido no cálculo do pan.
 */
export function AjustarEnquadramentoModal({
  imagem,
  transformInicial,
  onFechar,
  onSalvar,
}: {
  imagem: HTMLImageElement | null;
  transformInicial: TransformImagem;
  onFechar: () => void;
  onSalvar: (t: TransformImagem) => void;
}) {
  const [transform, setTransform] = useState<TransformImagem>(transformInicial);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const inicio = useRef({ clientX: 0, clientY: 0, panX: 0.5, panY: 0.5 });

  // Reabrir o modal (imagem trocou, ou reaberto pra ajustar de novo) começa do
  // transform que já estava salvo, não de um zerado.
  useEffect(() => {
    setTransform(transformInicial);
  }, [transformInicial, imagem]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx || !imagem) return;
    ctx.clearRect(0, 0, LARGURA_PREVIEW, ALTURA_PREVIEW);
    desenharImagemCover(ctx, imagem, 0, 0, LARGURA_PREVIEW, ALTURA_PREVIEW, transform);
  }, [imagem, transform]);

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    arrastando.current = true;
    inicio.current = { clientX: e.clientX, clientY: e.clientY, panX: transform.panX, panY: transform.panY };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!arrastando.current || !frameRef.current) return;
    const dx = (e.clientX - inicio.current.clientX) / frameRef.current.clientWidth;
    const dy = (e.clientY - inicio.current.clientY) / frameRef.current.clientHeight;
    setTransform((t) => ({
      ...t,
      panX: Math.max(0, Math.min(1, inicio.current.panX - dx)),
      panY: Math.max(0, Math.min(1, inicio.current.panY - dy)),
    }));
  }

  function handlePointerUp() {
    arrastando.current = false;
  }

  if (!imagem) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(23,60,58,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
      onClick={onFechar}
    >
      <div className="card" style={{ padding: 24, width: 340 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>🖼️ Ajustar enquadramento</h3>
        <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 0 }}>Arraste a foto pra reposicionar. Use o zoom pra aproximar.</p>

        <div
          ref={frameRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={{ width: LARGURA_PREVIEW, height: ALTURA_PREVIEW, margin: '0 auto', borderRadius: 12, overflow: 'hidden', cursor: 'grab', touchAction: 'none' }}
        >
          <canvas ref={canvasRef} width={LARGURA_PREVIEW} height={ALTURA_PREVIEW} style={{ display: 'block' }} />
        </div>

        <div className="field" style={{ marginTop: 16 }}>
          <label>Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.05}
            value={transform.scale}
            onChange={(e) => setTransform((t) => ({ ...t, scale: Number(e.target.value) }))}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" className="btn-ghost" onClick={() => setTransform(TRANSFORM_PADRAO)}>
            Redefinir
          </button>
          <button type="button" className="btn-ghost" onClick={onFechar} style={{ flex: 1 }}>
            Cancelar
          </button>
          <button type="button" className="btn-primary" style={{ flex: 1 }} onClick={() => onSalvar(transform)}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
