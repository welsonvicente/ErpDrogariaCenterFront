import { useEffect, useRef, useState } from 'react';
import type { Formato } from '../../utils/critica/relatorio';

const OPCOES: Array<{ formato: Formato; icone: string; rotulo: string }> = [
  { formato: 'png', icone: '🖼️', rotulo: 'Imagem (PNG)' },
  { formato: 'pdf', icone: '📄', rotulo: 'PDF' },
  { formato: 'xlsx', icone: '📊', rotulo: 'Excel' },
];

interface Props {
  aoBaixar: (formato: Formato) => Promise<void>;
  /** Botão só com o ícone (usado ao lado de cada filtro). */
  compacto?: boolean;
  rotulo?: string;
  /** Texto de acessibilidade/tooltip: o que será baixado. */
  oque: string;
}

/** Menu "Baixar": imagem, PDF ou Excel do bloco ao qual ele está ligado. */
export function MenuBaixar({ aoBaixar, compacto, rotulo = 'Baixar', oque }: Props) {
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState<Formato | null>(null);
  const [erro, setErro] = useState('');
  const raiz = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !raiz.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  async function escolher(formato: Formato) {
    setErro('');
    setGerando(formato);
    try {
      await aoBaixar(formato);
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setGerando(null);
    }
  }

  return (
    <span className="crit-menu" ref={raiz}>
      <button
        type="button"
        className={compacto ? 'crit-menu-icone' : 'btn-ghost'}
        onClick={(e) => {
          e.stopPropagation();
          setAberto((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={aberto}
        title={`Baixar: ${oque}`}
        aria-label={`Baixar ${oque}`}
      >
        {compacto ? '⬇' : `⬇️ ${rotulo} ▾`}
      </button>
      {aberto && (
        <div className="crit-menu-lista" role="menu">
          {OPCOES.map((o) => (
            <button key={o.formato} type="button" role="menuitem" onClick={() => void escolher(o.formato)} disabled={gerando !== null}>
              <span>{o.icone}</span> {gerando === o.formato ? 'Gerando…' : o.rotulo}
            </button>
          ))}
          {erro && <p className="error-text">{erro}</p>}
        </div>
      )}
    </span>
  );
}
