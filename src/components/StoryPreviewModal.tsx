/**
 * Preview em tela cheia de um story gerado à parte (ex: "story individual" a
 * partir de um produto do panfleto) — portado de `storyPreviewOverlay` em
 * `public/tools/cartazes.html`. Mais confiável que baixar "escondido" em
 * celulares: mostra o resultado antes, com um botão grande de
 * baixar/compartilhar (a pessoa pode também tocar e segurar a imagem pra
 * salvar direto, funciona em qualquer navegador).
 */
export function StoryPreviewModal({
  dataUrl,
  baixando,
  onBaixar,
  onFechar,
}: {
  dataUrl: string;
  baixando: boolean;
  onBaixar: () => void;
  onFechar: () => void;
}) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(10,36,34,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 210, padding: 20 }}
      onClick={onFechar}
    >
      <div
        className="card"
        style={{ padding: 20, maxWidth: 360, width: '100%', textAlign: 'center', maxHeight: '92vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: 12 }}>Story pronto!</h3>
        <img src={dataUrl} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 14, display: 'block' }} />
        <p style={{ fontSize: 12, color: 'var(--ink-soft)', marginBottom: 14 }}>
          📱 No celular: toque em "Baixar/Compartilhar imagem" (abre as opções de salvar) ou toque e segure a imagem
          acima. 💻 No computador: baixa direto.
        </p>
        <button type="button" className="btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={onBaixar} disabled={baixando}>
          {baixando ? 'Preparando...' : '⬇️ Baixar/Compartilhar imagem'}
        </button>
        <button type="button" className="btn-ghost" style={{ width: '100%' }} onClick={onFechar}>
          Fechar
        </button>
      </div>
    </div>
  );
}
