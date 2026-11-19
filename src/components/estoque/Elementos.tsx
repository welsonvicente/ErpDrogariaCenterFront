import { useEffect, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { STATUS_ACAO_LABEL, type StatusAcao } from '../../types/estoque';
import { NOME_PRIORIDADE, type CodigoPrioridade } from '../../utils/estoqueAnalise';

/** Cores das faixas de prioridade — vermelho da marca pro mais urgente, esmaecendo até o cinza. */
export const COR_PRIORIDADE: Record<CodigoPrioridade, string> = {
  P1: '#e30613',
  P2: '#e8892b',
  P3: '#628b00',
  P4: '#7e9a97',
  SEM: '#c3cfcc',
};

export function SeloPrioridade({ prioridade }: { prioridade: CodigoPrioridade }) {
  return (
    <span className={`est-selo est-selo-${prioridade.toLowerCase()}`} title={NOME_PRIORIDADE[prioridade]}>
      {prioridade === 'SEM' ? '—' : prioridade}
      <small>{NOME_PRIORIDADE[prioridade]}</small>
    </span>
  );
}

export function SeloStatus({ status, atrasada }: { status: StatusAcao; atrasada?: boolean }) {
  return (
    <span className={`est-status est-status-${status.toLowerCase()}`}>
      {STATUS_ACAO_LABEL[status]}
      {atrasada && <em className="est-atrasada"> · atrasada</em>}
    </span>
  );
}

export function Kpi({ titulo, valor, apoio, destaque, aoClicar }: { titulo: string; valor: string; apoio?: string; destaque?: boolean; aoClicar?: () => void }) {
  const conteudo = (
    <>
      <span className="est-kpi-titulo">{titulo}</span>
      <strong className="est-kpi-valor">{valor}</strong>
      {apoio && <span className="est-kpi-apoio">{apoio}</span>}
    </>
  );
  return aoClicar ? (
    <button type="button" className={`card est-kpi clicavel ${destaque ? 'est-kpi-destaque' : ''}`} onClick={aoClicar}>
      {conteudo}
    </button>
  ) : (
    <div className={`card est-kpi ${destaque ? 'est-kpi-destaque' : ''}`}>{conteudo}</div>
  );
}

export function Painel({ titulo, acoes, children, className }: { titulo?: string; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card est-painel ${className ?? ''}`}>
      {(titulo || acoes) && (
        <header className="est-painel-topo">
          {titulo && <h2>{titulo}</h2>}
          {acoes && <div className="est-painel-acoes">{acoes}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/** Estado "ainda não há relatório importado" — leva direto à tela de importação. */
export function SemDados() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  return (
    <div className="card est-sem-dados">
      <div className="est-sem-dados-icone">📦</div>
      <h2>Ainda não há produtos analisados</h2>
      <p>Importe o relatório de produtos parados do Trier para ver o capital parado, as prioridades e os planos de ação.</p>
      <Link className="btn-primary est-link-botao" to={`/${orgSlug}/gerente/estoque/importar`}>
        Importar relatório
      </Link>
    </div>
  );
}

/** Janela modal simples: fecha no Esc e ao clicar fora. */
export function Modal({ titulo, onFechar, children, larga }: { titulo: ReactNode; onFechar: () => void; children: ReactNode; larga?: boolean }) {
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => e.key === 'Escape' && onFechar();
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  return (
    <div className="est-modal-fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className={`card est-modal ${larga ? 'est-modal-larga' : ''}`} role="dialog" aria-modal="true">
        <header className="est-modal-topo">
          <h2>{titulo}</h2>
          <button type="button" className="btn-ghost" onClick={onFechar} aria-label="Fechar">
            ✕
          </button>
        </header>
        <div className="est-modal-corpo">{children}</div>
      </div>
    </div>
  );
}

/** Cabeçalho que só aparece na impressão: o que está sendo impresso, quando e com quais filtros. */
export function CabecalhoImpressao({ titulo, detalhe }: { titulo: string; detalhe?: string }) {
  return (
    <div className="est-cabecalho-impressao">
      <strong>Center | Inteligência de Estoque — Drogaria Center</strong>
      <span>{titulo}</span>
      <small>
        Impresso em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        {detalhe ? ` · ${detalhe}` : ''}
      </small>
    </div>
  );
}

/**
 * Imprime depois de o React ter desenhado o modo "imprimir tudo": a tabela
 * paginada só tem as linhas da página atual, então primeiro liberamos todas e
 * só então chamamos o diálogo de impressão do navegador.
 */
export function useImpressao(): { imprimindo: boolean; imprimir: () => void } {
  const [imprimindo, setImprimindo] = useState(false);
  useEffect(() => {
    if (!imprimindo) return;
    const antesDeFechar = () => setImprimindo(false);
    window.addEventListener('afterprint', antesDeFechar);
    const t = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('afterprint', antesDeFechar);
    };
  }, [imprimindo, setImprimindo]);
  return { imprimindo, imprimir: () => setImprimindo(true) };
}
