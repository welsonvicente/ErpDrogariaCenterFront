import { useEffect, useRef, useState } from 'react';
import { ALTURA_STORY, LARGURA_STORY, desenharImagemCover, posicaoXFaixa } from '../utils/cartazEngine';

/** Uma faixa-guia (nome/preço/frases) a mostrar sobreposta ao vídeo, só pra ajudar a enquadrar a foto. */
export interface GuiaCamera {
  y: number;
  offsetX: number;
  margem: number;
  visivel: boolean;
  corClasse: string;
  rotulo: string;
}

/**
 * Captura de foto pela câmera do dispositivo — portado de
 * `public/tools/cartazes.html` (`openCamera`/`cameraCaptureBtn`). Pede a maior
 * resolução que a câmera aguentar (o "ideal" é só uma preferência, nunca falha
 * por causa disso) e espera o primeiro frame de verdade antes de liberar o
 * botão de captura: no iPhone, capturar antes disso é o que fazia a foto sair
 * toda preta (o autoplay às vezes não "pega" sozinho).
 *
 * `guias` (opcional) sobrepõe faixas não-interativas mostrando onde nome/preço/
 * frases vão ficar quando a foto virar um story — mesma posição configurada no
 * modo Story (ver `syncGuideVisuals` na versão HTML original), só que aqui não
 * dá pra arrastar (arrastar é coisa do preview, não da câmera).
 */
export function CameraModal({
  aberto,
  onFechar,
  onCapturar,
  guias,
}: {
  aberto: boolean;
  onFechar: () => void;
  onCapturar: (img: HTMLImageElement) => void;
  guias?: GuiaCamera[];
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!aberto) return;
    setErro('');
    setPronto(false);
    let cancelado = false;

    async function iniciar() {
      if (!window.isSecureContext) {
        setErro('⚠ A câmera só funciona com o app aberto por HTTPS (ou localhost) — abrir o arquivo direto não é suficiente.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setErro('⚠ Este navegador não suporta acesso à câmera. Tente um navegador atualizado (Chrome ou Safari).');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 3840 }, height: { ideal: 2160 } },
          audio: false,
        });
        if (cancelado) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await new Promise<void>((resolve) => {
          if (video.readyState >= 2) {
            resolve();
            return;
          }
          video.onloadeddata = () => resolve();
          video.play().catch(() => undefined);
        });
        if (!cancelado) setPronto(true);
      } catch {
        if (!cancelado) setErro('⚠ Não foi possível acessar a câmera (permissão negada ou nenhuma câmera encontrada).');
      }
    }
    iniciar();

    return () => {
      cancelado = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [aberto]);

  async function handleCapturar() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = LARGURA_STORY;
    canvas.height = ALTURA_STORY;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    desenharImagemCover(ctx, video, 0, 0, LARGURA_STORY, ALTURA_STORY);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.src = dataUrl;
    });
    onCapturar(img);
  }

  if (!aberto) return null;

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,36,34,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}
    >
      {erro ? (
        <div className="card" style={{ padding: 24, maxWidth: 340, textAlign: 'center' }}>
          <p style={{ color: '#fff', background: 'transparent' }}>{erro}</p>
          <button className="btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={onFechar}>
            Fechar
          </button>
        </div>
      ) : (
        <>
          <div style={{ position: 'relative', width: '100%', maxWidth: 380, aspectRatio: '1080 / 1920', background: '#000', borderRadius: 16, overflow: 'hidden' }}>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            {guias
              ?.filter((g) => g.visivel)
              .map((g) => {
                const x = posicaoXFaixa(g.margem, g.offsetX);
                const largura = LARGURA_STORY - g.margem * 2;
                return (
                  <div
                    key={g.corClasse}
                    className={`faixa-arrasto faixa-arrasto--camera ${g.corClasse}`}
                    style={{
                      top: `${(g.y / ALTURA_STORY) * 100}%`,
                      left: `${(x / LARGURA_STORY) * 100}%`,
                      width: `${(largura / LARGURA_STORY) * 100}%`,
                    }}
                  >
                    {g.rotulo}
                  </div>
                );
              })}
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
            <button className="btn-ghost" onClick={onFechar}>
              Cancelar
            </button>
            <button className="btn-primary" disabled={!pronto} onClick={handleCapturar}>
              {pronto ? '📸 Capturar' : 'Preparando câmera...'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
