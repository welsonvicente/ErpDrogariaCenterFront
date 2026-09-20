import { useState } from 'react';
import { ImportarPlanilhaModo } from '../components/cartazes/ImportarPlanilhaModo';
import { PanfletoModo } from '../components/cartazes/PanfletoModo';
import { StoryModo } from '../components/cartazes/StoryModo';
import { FerramentaShell } from '../components/FerramentaShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { ProdutoPanfleto } from '../utils/panfletoEngine';

type Modo = 'story' | 'panfleto' | 'planilha';

/**
 * Casca da tela de Cartazes — alterna entre os três modos, todos já
 * reescritos como React nativo (ver PLANO-REESCRITA-FERRAMENTAS.md).
 *
 * Os três modos ficam sempre montados (só a visibilidade alterna) — trocar de
 * aba não pode perder produtos/texto já preenchidos num modo enquanto se
 * olha outro, mesmo padrão que a ferramenta original usava (`display: none`
 * em vez de desmontar).
 *
 * O modo Importar planilha se comunica com o Panfleto pelo botão "Usar no
 * panfleto": os produtos com foto viram `produtosParaPanfleto` aqui na casca,
 * o Panfleto os incorpora e avisa de volta (`aoReceberProdutos`) pra essa fila
 * não ficar sendo reenviada a cada render.
 */
export function CartazesPage() {
  useDocumentTitle('Cartazes e panfletos');
  const [modo, setModo] = useState<Modo>('story');
  const [produtosParaPanfleto, setProdutosParaPanfleto] = useState<ProdutoPanfleto[] | null>(null);

  return (
    <FerramentaShell titulo="Cartazes e panfletos">
      <div className="mode-tabs">
        <button type="button" className={`mode-tab${modo === 'story' ? ' active' : ''}`} onClick={() => setModo('story')}>
          📱 Story (produto único)
        </button>
        <button type="button" className={`mode-tab${modo === 'panfleto' ? ' active' : ''}`} onClick={() => setModo('panfleto')}>
          🗞️ Panfleto (vários)
        </button>
        <button type="button" className={`mode-tab${modo === 'planilha' ? ' active' : ''}`} onClick={() => setModo('planilha')}>
          📊 Importar planilha
        </button>
      </div>

      <div style={{ display: modo === 'story' ? 'block' : 'none' }}>
        <StoryModo />
      </div>
      <div style={{ display: modo === 'panfleto' ? 'block' : 'none' }}>
        <PanfletoModo produtosRecebidos={produtosParaPanfleto} aoReceberProdutos={() => setProdutosParaPanfleto(null)} />
      </div>
      <div style={{ display: modo === 'planilha' ? 'block' : 'none' }}>
        <ImportarPlanilhaModo
          aoEnviarParaPanfleto={(produtos) => {
            setProdutosParaPanfleto(produtos);
            setModo('panfleto');
          }}
        />
      </div>
    </FerramentaShell>
  );
}
