import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PanfletoModo } from '../components/cartazes/PanfletoModo';
import { StoryModo } from '../components/cartazes/StoryModo';
import { FerramentaShell } from '../components/FerramentaShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

type Modo = 'story' | 'panfleto';

/**
 * Casca da tela de Cartazes — alterna entre os modos já reescritos como React
 * nativo (ver PLANO-REESCRITA-FERRAMENTAS.md). O modo "Importar planilha"
 * ainda não foi portado; o link no rodapé leva pra versão completa (a
 * ferramenta HTML original, embutida na mesma moldura).
 *
 * Os dois modos ficam sempre montados (só a visibilidade alterna) — trocar de
 * aba não pode perder produtos/texto já preenchidos do outro modo, mesmo
 * modo que a ferramenta original usava (`display: none` em vez de
 * desmontar).
 */
export function CartazesPage() {
  useDocumentTitle('Cartazes e panfletos');
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [modo, setModo] = useState<Modo>('story');

  return (
    <FerramentaShell titulo="Cartazes e panfletos">
      <div className="mode-tabs">
        <button type="button" className={`mode-tab${modo === 'story' ? ' active' : ''}`} onClick={() => setModo('story')}>
          📱 Story (produto único)
        </button>
        <button type="button" className={`mode-tab${modo === 'panfleto' ? ' active' : ''}`} onClick={() => setModo('panfleto')}>
          🗞️ Panfleto (vários)
        </button>
      </div>

      <div style={{ display: modo === 'story' ? 'block' : 'none' }}>
        <StoryModo />
      </div>
      <div style={{ display: modo === 'panfleto' ? 'block' : 'none' }}>
        <PanfletoModo />
      </div>

      <p className="footnote" style={{ marginTop: 20 }}>
        Precisa importar uma planilha de produtos?{' '}
        <Link to={`/${orgSlug}/cartazes/completo`}>Abrir a ferramenta completa</Link> (esse modo ainda não foi migrado
        pra esta tela nova).
      </p>
    </FerramentaShell>
  );
}
