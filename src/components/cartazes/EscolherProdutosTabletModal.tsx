import { useEffect, useState } from 'react';
import type { ProdutoPanfleto } from '../../utils/panfletoEngine';

interface EscolherProdutosTabletModalProps {
  produtos: ProdutoPanfleto[];
  quantidadeArtes: number;
  onDefinirForaDoTablet: (indices: number[], fora: boolean) => void;
  onFechar: () => void;
}

type Filtro = 'todos' | 'dentro' | 'fora';

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Janela pra escolher quais produtos do panfleto vão pras artes do tablet — com muitos
 * produtos a lista não cabe no painel. Cada clique já vale (e é salvo no projeto).
 */
export function EscolherProdutosTabletModal({ produtos, quantidadeArtes, onDefinirForaDoTablet, onFechar }: EscolherProdutosTabletModalProps) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  const marcados = produtos.filter((p) => !p.foraDoTablet).length;
  const termo = semAcento(busca.trim());
  const visiveis = produtos
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => (filtro === 'dentro' ? !p.foraDoTablet : filtro === 'fora' ? !!p.foraDoTablet : true))
    .filter(({ p }) => !termo || semAcento(`${p.nome} ${p.ean ?? ''}`).includes(termo));
  const filtrando = termo !== '' || filtro !== 'todos';
  const indicesVisiveis = visiveis.map(({ i }) => i);

  return (
    <div className="guia-fundos-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <section className="card guia-fundos tablet-escolha" role="dialog" aria-modal="true" aria-label="Escolher produtos do tablet">
        <div className="guia-fundos-head">
          <h3>🖥️ Produtos no tablet</h3>
          <button type="button" className="btn-primary" onClick={onFechar}>Concluir</button>
        </div>
        <p className="footnote" style={{ textAlign: 'left', margin: '0 0 12px' }}>
          Clique nos produtos para colocar ou tirar do tablet. Quem fica de fora continua no panfleto.{' '}
          <span className="tablet-produtos-conta">{marcados} de {produtos.length} no tablet · {quantidadeArtes} arte(s)</span>
        </p>

        <div className="tablet-escolha-barra">
          <input type="search" placeholder="Buscar produto ou EAN" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar produto" />
          <div className="guia-fundos-formatos" role="tablist" aria-label="Mostrar" style={{ margin: 0 }}>
            {([['todos', 'Todos'], ['dentro', 'No tablet'], ['fora', 'Fora do tablet']] as const).map(([id, rotulo]) => (
              <button key={id} type="button" role="tab" aria-selected={filtro === id} className={filtro === id ? 'active' : ''} onClick={() => setFiltro(id)}>{rotulo}</button>
            ))}
          </div>
        </div>
        <div className="tablet-produtos-acoes">
          <button type="button" className="btn-ghost" disabled={visiveis.every(({ p }) => !p.foraDoTablet)} onClick={() => onDefinirForaDoTablet(indicesVisiveis, false)}>
            ✅ {filtrando ? `Selecionar os ${visiveis.length} mostrados` : 'Selecionar todos'}
          </button>
          <button type="button" className="btn-ghost" disabled={visiveis.every(({ p }) => p.foraDoTablet)} onClick={() => onDefinirForaDoTablet(indicesVisiveis, true)}>
            {filtrando ? `Desmarcar os ${visiveis.length} mostrados` : 'Desmarcar todos'}
          </button>
        </div>

        {visiveis.length === 0 ? (
          <p className="footnote" style={{ textAlign: 'left' }}>Nenhum produto encontrado.</p>
        ) : (
          <ul className="tablet-escolha-grade">
            {visiveis.map(({ p, i }) => (
              <li key={i}>
                <button type="button" className={`tablet-escolha-item${p.foraDoTablet ? ' fora' : ''}`} aria-pressed={!p.foraDoTablet} onClick={() => onDefinirForaDoTablet([i], !p.foraDoTablet)} title={p.nome}>
                  <span className="tablet-escolha-marca" aria-hidden="true">{p.foraDoTablet ? '' : '✓'}</span>
                  <img src={p.imagem.src} alt="" />
                  <span className="tablet-escolha-nome">{p.nome}</span>
                  <span className="tablet-produtos-preco">R$ {p.por}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
