import type { KeyboardEvent } from 'react';

export interface Barra {
  chave: string;
  rotulo: string;
  valor: number;
  /** Texto de apoio (ex.: "12 produtos") exibido no tooltip. */
  detalhe?: string;
  cor?: string;
}

interface PropsBarras {
  barras: Barra[];
  formatar: (valor: number) => string;
  onClique?: (barra: Barra) => void;
  /** 'vertical' = colunas (poucas categorias); 'horizontal' = lista com barras (muitas, rótulos longos). */
  orientacao?: 'vertical' | 'horizontal';
  vazio?: string;
}

function aoTeclar(e: KeyboardEvent, acao: () => void) {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    acao();
  }
}

/** Barras em CSS puro: clicáveis (e acessíveis por teclado) quando há `onClique`, pra abrir os produtos da categoria. */
export function GraficoBarras({ barras, formatar, onClique, orientacao = 'vertical', vazio = 'Sem dados para mostrar.' }: PropsBarras) {
  if (!barras.length) return <p className="est-vazio-grafico">{vazio}</p>;
  const maximo = Math.max(...barras.map((b) => b.valor), 0) || 1;
  const interativo = (b: Barra) =>
    onClique
      ? { role: 'button', tabIndex: 0, onClick: () => onClique(b), onKeyDown: (e: KeyboardEvent) => aoTeclar(e, () => onClique(b)) }
      : {};

  if (orientacao === 'horizontal') {
    return (
      <div className="est-barras-h">
        {barras.map((b) => (
          <div key={b.chave} className={`est-barra-h ${onClique ? 'clicavel' : ''}`} title={b.detalhe ? `${b.rotulo} — ${b.detalhe}` : b.rotulo} {...interativo(b)}>
            <span className="est-barra-h-rotulo">{b.rotulo}</span>
            <span className="est-barra-h-trilho">
              <span className="est-barra-h-preenchimento" style={{ width: `${Math.max(2, (b.valor / maximo) * 100)}%`, background: b.cor }} />
            </span>
            <span className="est-barra-h-valor">{formatar(b.valor)}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="est-barras-v">
      {barras.map((b) => (
        <div key={b.chave} className={`est-barra-v ${onClique ? 'clicavel' : ''}`} title={b.detalhe ? `${b.rotulo} — ${b.detalhe}` : b.rotulo} {...interativo(b)}>
          <span className="est-barra-v-valor">{formatar(b.valor)}</span>
          <span className="est-barra-v-coluna">
            <span className="est-barra-v-preenchimento" style={{ height: `${b.valor > 0 ? Math.max(3, (b.valor / maximo) * 100) : 0}%`, background: b.cor }} />
          </span>
          <span className="est-barra-v-rotulo">{b.rotulo}</span>
        </div>
      ))}
    </div>
  );
}

interface PropsRosca {
  fatias: Barra[];
  formatar: (valor: number) => string;
  /** Texto no centro (ex.: o total). */
  centro?: { titulo: string; valor: string };
  onClique?: (fatia: Barra) => void;
}

const RAIO = 15.9155; // circunferência = 100 → o percentual vira o próprio comprimento do traço

/** Rosca em SVG: cada fatia e cada item da legenda são clicáveis. */
export function GraficoRosca({ fatias, formatar, centro, onClique }: PropsRosca) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);
  if (total <= 0) return <p className="est-vazio-grafico">Sem dados para mostrar.</p>;

  // Onde cada fatia começa (em % do círculo) — calculado antes de desenhar, sem mutar variável durante o render.
  const visiveis = fatias.filter((f) => f.valor > 0);
  const inicios = visiveis.map((_, i) => visiveis.slice(0, i).reduce((soma, f) => soma + (f.valor / total) * 100, 0));
  return (
    <div className="est-rosca">
      <svg viewBox="0 0 42 42" className="est-rosca-svg" role="img" aria-label="Distribuição">
        <circle cx="21" cy="21" r={RAIO} fill="none" stroke="var(--line)" strokeWidth="6" />
        {visiveis.map((f, i) => {
          const pct = (f.valor / total) * 100;
          return (
            <circle
              key={f.chave}
              cx="21"
              cy="21"
              r={RAIO}
              fill="none"
              stroke={f.cor}
              strokeWidth="6"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={25 - inicios[i]}
              className={onClique ? 'clicavel' : undefined}
              onClick={onClique ? () => onClique(f) : undefined}
            >
              <title>{`${f.rotulo}: ${formatar(f.valor)}${f.detalhe ? ` — ${f.detalhe}` : ''}`}</title>
            </circle>
          );
        })}
        {centro && (
          <g textAnchor="middle">
            <text x="21" y="20" className="est-rosca-titulo">
              {centro.titulo}
            </text>
            <text x="21" y="25.5" className="est-rosca-total">
              {centro.valor}
            </text>
          </g>
        )}
      </svg>
      <ul className="est-rosca-legenda">
        {fatias.map((f) => (
          <li key={f.chave}>
            <button type="button" className="est-legenda-item" onClick={onClique ? () => onClique(f) : undefined} disabled={!onClique}>
              <span className="est-legenda-cor" style={{ background: f.cor }} />
              <span className="est-legenda-texto">{f.rotulo}</span>
              <strong>{formatar(f.valor)}</strong>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
