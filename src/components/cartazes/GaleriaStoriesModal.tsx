export interface ItemGaleriaStory {
  nomeArquivo: string;
  /** Texto amigável (nome do produto) mostrado sob a miniatura — não é o nome técnico do arquivo. */
  rotulo: string;
  dataUrl: string;
}

/**
 * Prévia de TODOS os stories antes de baixar/compartilhar — pedido de quem
 * usa a ferramenta pra revisar o lote inteiro de uma vez (posição, corte da
 * foto, preço certo) em vez de descobrir um problema só depois de já ter
 * mandado pro grupo do WhatsApp. Reaproveita as mesmas imagens já geradas
 * pra baixar; essa tela só mostra, não gera nada de novo.
 */
export function GaleriaStoriesModal({
  itens,
  baixando,
  onBaixar,
  onFechar,
}: {
  itens: ItemGaleriaStory[];
  baixando: boolean;
  onBaixar: () => void;
  onFechar: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,36,34,0.85)', zIndex: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 900, maxHeight: '92vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Prévia de todos os stories ({itens.length})</h3>
          <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={onFechar}>
            Fechar
          </button>
        </div>
        <p className="footnote" style={{ textAlign: 'left', margin: '0 0 14px' }}>
          Confira se está tudo certo antes de baixar/compartilhar. Pra ajustar algum, feche aqui e edite o produto na lista.
        </p>

        <div className="galeria-stories-grid">
          {itens.map((item) => (
            <figure key={item.nomeArquivo} className="galeria-stories-item">
              <img src={item.dataUrl} alt={item.rotulo} />
              <figcaption>{item.rotulo}</figcaption>
            </figure>
          ))}
        </div>

        <div className="cartaz-actions" style={{ marginTop: 16 }}>
          <button type="button" className="btn-primary" onClick={onBaixar} disabled={baixando}>
            {baixando ? 'Preparando...' : `⬇️ Baixar/compartilhar todos (${itens.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
