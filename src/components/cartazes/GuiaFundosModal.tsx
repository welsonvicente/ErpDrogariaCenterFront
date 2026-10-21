import { useState } from 'react';
import { GUIAS_FUNDO, PASSOS_AJUSTE_FUNDO } from '../../utils/guiaFundos';

/**
 * "Criar fundo com ChatGPT": textos prontos (com Copiar) e o modelo em branco
 * de cada formato pra baixar — fica dentro do sistema pra não se perder e
 * valer em qualquer aparelho.
 */
export function GuiaFundosModal({ onFechar }: { onFechar: () => void }) {
  const [selecionado, setSelecionado] = useState(GUIAS_FUNDO.find((g) => g.id === 'panfleto-9')?.id ?? GUIAS_FUNDO[0].id);
  const [copiado, setCopiado] = useState('');
  const guia = GUIAS_FUNDO.find((g) => g.id === selecionado) ?? GUIAS_FUNDO[0];

  async function copiar() {
    try {
      await navigator.clipboard.writeText(guia.texto);
      setCopiado(guia.id);
      setTimeout(() => setCopiado(''), 2500);
    } catch {
      setCopiado('erro');
    }
  }

  return (
    <div className="guia-fundos-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <section className="card guia-fundos" role="dialog" aria-modal="true" aria-label="Criar fundo com ChatGPT">
        <div className="guia-fundos-head">
          <h3>🎨 Criar fundo com ChatGPT</h3>
          <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>
        </div>
        <p className="footnote" style={{ textAlign: 'left', margin: '0 0 12px' }}>
          Escolha o formato, copie o texto, cole no ChatGPT e anexe o modelo. O modelo mostra onde cada produto vai ficar, pro fundo não sair desproporcional.
        </p>

        <div className="guia-fundos-formatos" role="tablist" aria-label="Formato">
          {GUIAS_FUNDO.map((g) => (
            <button key={g.id} type="button" role="tab" aria-selected={g.id === guia.id} className={g.id === guia.id ? 'active' : ''} onClick={() => setSelecionado(g.id)}>
              {g.titulo}
            </button>
          ))}
        </div>

        <div className="guia-fundos-modelos">
          {guia.modelos.map((m) => (
            <a key={m.arquivo} className="btn-ghost" href={m.arquivo} download>
              ⬇️ Baixar modelo — {m.rotulo} ({m.tamanho})
            </a>
          ))}
        </div>
        <p className="footnote" style={{ textAlign: 'left', margin: '4px 0 10px' }}>Onde usar o fundo pronto: <b>{guia.ondeUsar}</b></p>

        <div className="guia-fundos-texto-head">
          <strong>Texto para o ChatGPT</strong>
          <button type="button" className="btn-primary" onClick={() => void copiar()}>
            {copiado === guia.id ? '✓ Copiado!' : '📋 Copiar texto'}
          </button>
        </div>
        {copiado === 'erro' && <p className="error-text">Não consegui copiar automaticamente — selecione o texto abaixo e copie.</p>}
        <pre className="guia-fundos-texto">{guia.texto}</pre>

        <details className="guia-fundos-passos">
          <summary>Depois que o ChatGPT gerar: como ajustar o tamanho</summary>
          <ol>{PASSOS_AJUSTE_FUNDO.map((p) => <li key={p}>{p}</li>)}</ol>
        </details>
      </section>
    </div>
  );
}
