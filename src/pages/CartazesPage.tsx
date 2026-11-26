import { useEffect, useState } from 'react';
import { CampanhasPainel } from '../components/cartazes/CampanhasPainel';
import { CartazOfertaModo } from '../components/cartazes/CartazOfertaModo';
import { GuiaFundosModal } from '../components/cartazes/GuiaFundosModal';
import { ImportarPlanilhaModo } from '../components/cartazes/ImportarPlanilhaModo';
import { PanfletoModo } from '../components/cartazes/PanfletoModo';
import { StoryModo } from '../components/cartazes/StoryModo';
import { FerramentaShell } from '../components/FerramentaShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { campanhaCartazService, type CampanhaCartaz } from '../services/campanhaCartazService';
import { campanhaSalvaNoAparelho, definirCampanhaAtiva } from '../utils/campanhaAtiva';
import { aplicarAparenciaDaCampanha, sincronizarPreferenciasCartaz } from '../utils/cartazPersistencia';
import type { OfertaLote } from '../utils/cartazOfertaEngine';
import type { ProdutoPanfleto } from '../utils/panfletoEngine';

type Modo = 'story' | 'panfleto' | 'planilha' | 'oferta';

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
  const [ofertasParaCartaz, setOfertasParaCartaz] = useState<OfertaLote[] | null>(null);
  const [mostrarGuiaFundos, setMostrarGuiaFundos] = useState(false);
  // Campanha aberta (ex.: "Black Friday — semana 1"): os modos só montam depois de escolhida e
  // remontam (key) ao trocar — cada campanha tem os seus projetos e a sua folha de Cartaz de oferta.
  const [campanha, setCampanha] = useState<CampanhaCartaz | null>(null);
  const [carregandoCampanha, setCarregandoCampanha] = useState(true);
  const [trocandoCampanha, setTrocandoCampanha] = useState(false);

  // Cores, letras, tamanhos e posições padrão vêm do servidor (por organização), pra valerem em
  // qualquer navegador — os três modos reaplicam quando chegam (ver cartazPersistencia.ts).
  useEffect(() => {
    sincronizarPreferenciasCartaz();
  }, []);

  // Reabre a campanha que estava aberta neste aparelho; sem ela, mostra a escolha.
  useEffect(() => {
    const id = campanhaSalvaNoAparelho();
    if (!id) {
      setCarregandoCampanha(false);
      return;
    }
    campanhaCartazService
      .obter(id)
      .then(abrirCampanha)
      .catch(() => definirCampanhaAtiva(null))
      .finally(() => setCarregandoCampanha(false));
  }, []);

  function abrirCampanha(nova: CampanhaCartaz) {
    definirCampanhaAtiva(nova);
    aplicarAparenciaDaCampanha(nova);
    setProdutosParaPanfleto(null);
    setOfertasParaCartaz(null);
    setCampanha(nova);
    setTrocandoCampanha(false);
  }

  return (
    <FerramentaShell titulo="Cartazes e panfletos">
      <div className="cartazes-page">
        <p className="cartazes-lead">Escolha o formato, personalize a oferta e acompanhe o resultado em tempo real.</p>
        <div className="cartazes-guia-fundos">
          <button type="button" className="btn-ghost" onClick={() => setMostrarGuiaFundos(true)}>
            🎨 Criar fundo com ChatGPT <span>textos prontos e modelos</span>
          </button>
        </div>

        {carregandoCampanha && <div className="card cartaz-painel">Abrindo campanha…</div>}
        {!carregandoCampanha && !campanha && <CampanhasPainel atualId={null} onAbrir={abrirCampanha} />}

        {campanha && (
        <>
        <div className="campanha-barra">
          <span>📣 Campanha</span>
          <strong>{campanha.nome}</strong>
          <button type="button" className="btn-ghost" onClick={() => setTrocandoCampanha(true)}>🔁 Trocar ou criar campanha</button>
        </div>

        <div className="mode-tabs" role="tablist" aria-label="Formato do material">
          <button type="button" id="cartazes-tab-story" role="tab" aria-selected={modo === 'story'} aria-controls="cartazes-panel-story" className={`mode-tab${modo === 'story' ? ' active' : ''}`} onClick={() => setModo('story')}>
            📱 Story <span>produto único</span>
          </button>
          <button type="button" id="cartazes-tab-panfleto" role="tab" aria-selected={modo === 'panfleto'} aria-controls="cartazes-panel-panfleto" className={`mode-tab${modo === 'panfleto' ? ' active' : ''}`} onClick={() => setModo('panfleto')}>
            🗞️ Panfleto <span>vários produtos</span>
          </button>
          <button type="button" id="cartazes-tab-planilha" role="tab" aria-selected={modo === 'planilha'} aria-controls="cartazes-panel-planilha" className={`mode-tab${modo === 'planilha' ? ' active' : ''}`} onClick={() => setModo('planilha')}>
            📊 Importar <span>planilha</span>
          </button>
          <button type="button" id="cartazes-tab-oferta" role="tab" aria-selected={modo === 'oferta'} aria-controls="cartazes-panel-oferta" className={`mode-tab${modo === 'oferta' ? ' active' : ''}`} onClick={() => setModo('oferta')}>
            🏷️ Cartaz de oferta <span>imprimir em A4</span>
          </button>
        </div>

        <div id="cartazes-panel-story" role="tabpanel" aria-labelledby="cartazes-tab-story" className="cartazes-mode" style={{ display: modo === 'story' ? 'block' : 'none' }}>
          <StoryModo key={campanha.id} />
        </div>
        <div id="cartazes-panel-panfleto" role="tabpanel" aria-labelledby="cartazes-tab-panfleto" className="cartazes-mode" style={{ display: modo === 'panfleto' ? 'block' : 'none' }}>
          <PanfletoModo
            key={campanha.id}
            produtosRecebidos={produtosParaPanfleto}
            aoReceberProdutos={() => setProdutosParaPanfleto(null)}
            aoAbrirConfiguracaoPadrao={() => setModo('story')}
          />
        </div>
        <div id="cartazes-panel-planilha" role="tabpanel" aria-labelledby="cartazes-tab-planilha" className="cartazes-mode cartazes-mode--planilha" style={{ display: modo === 'planilha' ? 'flex' : 'none' }}>
          <ImportarPlanilhaModo
            key={campanha.id}
            aoEnviarParaPanfleto={(produtos) => {
              setProdutosParaPanfleto(produtos);
              setModo('panfleto');
            }}
            aoEnviarParaCartazOferta={(ofertas) => {
              setOfertasParaCartaz(ofertas);
              setModo('oferta');
            }}
          />
        </div>
        <div id="cartazes-panel-oferta" role="tabpanel" aria-labelledby="cartazes-tab-oferta" className="cartazes-mode" style={{ display: modo === 'oferta' ? 'block' : 'none' }}>
          <CartazOfertaModo key={campanha.id} campanha={campanha} ofertasRecebidas={ofertasParaCartaz} aoReceberOfertas={() => setOfertasParaCartaz(null)} />
        </div>
        </>
        )}
      </div>
      {/* Abre por cima: os modos continuam montados até escolher, então o autosave do que estava aberto termina. */}
      {trocandoCampanha && campanha && <CampanhasPainel atualId={campanha.id} onAbrir={abrirCampanha} onFechar={() => setTrocandoCampanha(false)} />}
      {mostrarGuiaFundos && <GuiaFundosModal onFechar={() => setMostrarGuiaFundos(false)} />}
    </FerramentaShell>
  );
}
