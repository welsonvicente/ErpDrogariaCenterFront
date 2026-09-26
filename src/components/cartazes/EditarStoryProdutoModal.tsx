import { useEffect, useRef, useState } from 'react';
import { ElementoStoryEditavel, type GuiasAlinhamentoStory } from '../ElementoStoryEditavel';
import {
  ALTURA_STORY,
  LARGURA_STORY,
  calcularCaixasStory,
  montarTituloCompartilhamento,
  pintarStory,
  sugerirPosicoesTexto,
  type CaixasStory,
  type CaixaStory,
  type ParametrosStory,
} from '../../utils/cartazEngine';
import { carregarConfiguracoes, type ConfiguracoesStory } from '../../utils/cartazPersistencia';
import { baixarArquivoDireto, salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';
import type { AjustesStoryProduto, ProdutoPanfleto } from '../../utils/panfletoEngine';
import type { LogoStoryCarregada } from '../../hooks/useLogoPadraoStory';

const EMOJI_PADRAO = '🤩😱';

type ElementoStory = 'nome' | 'preco' | 'frases' | 'imagemExtra';

interface Guia {
  y: number;
  offsetX: number;
  x?: number;
  largura?: number;
}

const GUIA_PADRAO_NOME: Guia = { y: 130, offsetX: 0 };
const GUIA_PADRAO_PRECO: Guia = { y: 320, offsetX: 0 };
const GUIA_PADRAO_FRASES: Guia = { y: 560, offsetX: 0 };

/** `campo` já resolvido (ajuste do produto, senão o padrão do Story, senão a constante embutida). */
function resolver<T>(doProduto: T | undefined, doPadrao: T | undefined, embutido: T): T {
  return doProduto ?? doPadrao ?? embutido;
}

/**
 * Editor do story individual (1080×1920) de UM produto do Panfleto — mesmo
 * motor de canvas e mesma edição por arrasto do modo Story (ver StoryModo),
 * só que aqui os ajustes (posição, tamanho, texto) ficam salvos NO PRODUTO
 * (`produto.ajustesStory`) em vez de na preferência geral — cada produto pode
 * ter seu próprio layout sem afetar os outros nem o padrão usado quando não
 * há ajuste nenhum.
 */
export function EditarStoryProdutoModal({
  produto,
  logoPadrao = null,
  onFechar,
  onSalvar,
}: {
  produto: ProdutoPanfleto;
  /** Logomarca definida no Story produto único — entra na mesma posição, e aqui dá pra mudar só pra este produto. */
  logoPadrao?: LogoStoryCarregada | null;
  onFechar: () => void;
  onSalvar: (ajustes: AjustesStoryProduto, campos: { nome: string; de: string; por: string }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  const [configPadrao] = useState<Partial<ConfiguracoesStory>>(() => carregarConfiguracoes() || {});
  const ajustes = produto.ajustesStory;

  const [nome, setNome] = useState(produto.nome);
  const [de, setDe] = useState(produto.de);
  const [por, setPor] = useState(produto.por);

  const [corLogo, setCorLogo] = useState(() => resolver(ajustes?.corLogo, configPadrao.corLogo, '#436000'));
  const [corTextoNome, setCorTextoNome] = useState(() => resolver(ajustes?.corTextoNome, configPadrao.corTextoNome, '#FFFFFF'));
  const [corPreco, setCorPreco] = useState(() => resolver(ajustes?.corPreco, configPadrao.corPreco, '#E30613'));
  const [tamanhoNome, setTamanhoNome] = useState(() => resolver(ajustes?.tamanhoNome, configPadrao.tamanhoNome, 40));
  const [tamanhoPreco, setTamanhoPreco] = useState(() => resolver(ajustes?.tamanhoPreco, configPadrao.tamanhoPreco, 62));
  const [margemNome] = useState(() => resolver(ajustes?.margemNome, configPadrao.margemNome, 60));
  const [margemPreco] = useState(() => resolver(ajustes?.margemPreco, configPadrao.margemPreco, 60));

  const [frasesAtivo, setFrasesAtivo] = useState(() => resolver(ajustes?.frasesAtivo, configPadrao.frasesAtivo, true));
  const [frases, setFrases] = useState(() => resolver(ajustes?.frases, configPadrao.frases, ''));
  const [corFundoFrases, setCorFundoFrases] = useState(() => resolver(ajustes?.corFundoFrases, configPadrao.corFundoFrases, '#173C3A'));
  const [corTextoFrases, setCorTextoFrases] = useState(() => resolver(ajustes?.corTextoFrases, configPadrao.corTextoFrases, '#FFFFFF'));
  const [tamanhoFrases, setTamanhoFrases] = useState(() => resolver(ajustes?.tamanhoFrases, configPadrao.tamanhoFrases, 32));
  const [margemFrases] = useState(() => resolver(ajustes?.margemFrases, configPadrao.margemFrases, 60));

  const [guiaNome, setGuiaNome] = useState<Guia>(() => resolver(ajustes?.guiaNome, configPadrao.guiaNome, GUIA_PADRAO_NOME));
  const [guiaPreco, setGuiaPreco] = useState<Guia>(() => resolver(ajustes?.guiaPreco, configPadrao.guiaPreco, GUIA_PADRAO_PRECO));
  const [guiaFrases, setGuiaFrases] = useState<Guia>(() => resolver(ajustes?.guiaFrases, configPadrao.guiaFrases, GUIA_PADRAO_FRASES));

  // `undefined` = segue a posição do Story; só vira ajuste do produto depois que a pessoa arrasta a logo aqui.
  const [imagemExtraCaixaProduto, setImagemExtraCaixaProduto] = useState<CaixaStory | undefined>(ajustes?.imagemExtraCaixa);
  const imagemExtraCaixa = logoPadrao ? imagemExtraCaixaProduto ?? logoPadrao.caixa : null;

  const [caixasPreview, setCaixasPreview] = useState<CaixasStory>({ nome: null, preco: null, frases: null, imagemExtra: null });
  const [elementoSelecionado, setElementoSelecionado] = useState<ElementoStory | null>(null);
  const [guiasAlinhamento, setGuiasAlinhamento] = useState<GuiasAlinhamentoStory | null>(null);
  const [mostrarInterfaceInstagram, setMostrarInterfaceInstagram] = useState(true);

  const [salvando, setSalvando] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);

  const [fontesProntas, setFontesProntas] = useState(false);
  useEffect(() => {
    Promise.all([
      document.fonts.load('700 60px Fredoka'),
      document.fonts.load('600 30px Fredoka'),
      document.fonts.load('700 40px "Space Grotesk"'),
    ])
      .catch(() => undefined)
      .finally(() => setFontesProntas(true));
  }, []);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const parametros: ParametrosStory = {
      imagem: produto.imagem,
      transformImagem: produto.transform,
      nome: nome.trim(),
      de,
      por,
      emoji: EMOJI_PADRAO,
      corLogo,
      corTextoNome,
      corPreco,
      nomeY: guiaNome.y,
      precoY: guiaPreco.y,
      nomeOffsetX: guiaNome.offsetX,
      precoOffsetX: guiaPreco.offsetX,
      nomeX: guiaNome.x,
      nomeLargura: guiaNome.largura,
      precoX: guiaPreco.x,
      precoLargura: guiaPreco.largura,
      tamanhoNome,
      tamanhoPreco,
      frases: frasesAtivo ? frases : '',
      frasesY: guiaFrases.y,
      frasesOffsetX: guiaFrases.offsetX,
      frasesX: guiaFrases.x,
      frasesLargura: guiaFrases.largura,
      corFundoFrases,
      corTextoFrases,
      tamanhoFrases,
      margemNome,
      margemPreco,
      margemFrases,
      imagemExtra: logoPadrao?.imagem ?? null,
      imagemExtraCaixa,
    };
    pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, parametros);
    const proximasCaixas = calcularCaixasStory(ctx, LARGURA_STORY, parametros);
    setCaixasPreview((atuais) => (JSON.stringify(atuais) === JSON.stringify(proximasCaixas) ? atuais : proximasCaixas));
  }, [
    produto,
    fontesProntas,
    nome,
    de,
    por,
    corLogo,
    corTextoNome,
    corPreco,
    guiaNome,
    guiaPreco,
    tamanhoNome,
    tamanhoPreco,
    frasesAtivo,
    frases,
    guiaFrases,
    corFundoFrases,
    corTextoFrases,
    tamanhoFrases,
    margemNome,
    margemPreco,
    margemFrases,
    logoPadrao,
    imagemExtraCaixa,
  ]);

  function atualizarGuia(setGuia: (atualizar: (atual: Guia) => Guia) => void, caixa: CaixaStory) {
    setGuia((atual) => ({ ...atual, x: caixa.x, y: caixa.y, largura: caixa.largura }));
  }

  function resetarElementoSelecionado() {
    if (elementoSelecionado === 'nome') {
      setGuiaNome(GUIA_PADRAO_NOME);
      setTamanhoNome(40);
    }
    if (elementoSelecionado === 'preco') {
      setGuiaPreco(GUIA_PADRAO_PRECO);
      setTamanhoPreco(62);
    }
    if (elementoSelecionado === 'frases') {
      setGuiaFrases(GUIA_PADRAO_FRASES);
      setTamanhoFrases(32);
    }
    if (elementoSelecionado === 'imagemExtra') setImagemExtraCaixaProduto(undefined);
  }

  /** Mesma ideia do modo Story: analisa a foto (localmente) e sugere posições que evitam a parte mais "cheia" — ver `sugerirPosicoesTexto`. */
  function handleSugerirPosicao() {
    const sugestao = sugerirPosicoesTexto(produto.imagem, produto.transform);
    if (!sugestao) return;
    setGuiaNome({ y: sugestao.nomeY, offsetX: 0 });
    setGuiaPreco({ y: sugestao.precoY, offsetX: 0 });
    if (frasesAtivo) setGuiaFrases({ y: sugestao.frasesY, offsetX: 0 });
  }

  function montarAjustes(): AjustesStoryProduto {
    return {
      corLogo,
      corTextoNome,
      corPreco,
      tamanhoNome,
      tamanhoPreco,
      margemNome,
      margemPreco,
      frasesAtivo,
      frases,
      corFundoFrases,
      corTextoFrases,
      tamanhoFrases,
      margemFrases,
      guiaNome,
      guiaPreco,
      guiaFrases,
      ...(imagemExtraCaixaProduto ? { imagemExtraCaixa: imagemExtraCaixaProduto } : {}),
    };
  }

  function handleSalvar() {
    onSalvar(montarAjustes(), { nome: nome.trim(), de, por });
  }

  async function handleBaixar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSalvando(true);
    try {
      handleSalvar();
      const tituloCompartilhamento = montarTituloCompartilhamento(nome, de, por);
      await salvarOuCompartilharArquivo(canvas.toDataURL('image/png'), `story-${Date.now()}.png`, 'image/png', tituloCompartilhamento);
    } finally {
      setSalvando(false);
    }
  }

  async function handleBaixarDireto() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSalvandoDireto(true);
    try {
      handleSalvar();
      await baixarArquivoDireto(canvas.toDataURL('image/png'), `story-${Date.now()}.png`, 'image/png');
    } finally {
      setSalvandoDireto(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(10,36,34,0.85)', zIndex: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 960, maxHeight: '94vh', overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Editar story — {produto.nome}</h3>
          <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={onFechar}>
            Fechar
          </button>
        </div>
        <p className="footnote" style={{ textAlign: 'left', margin: '0 0 14px' }}>
          Esses ajustes valem só pra este produto. Pra mudar o padrão usado em todos, feche aqui e use "Editar tamanho/posição padrão" na lista do panfleto.
        </p>
        <button
          type="button"
          className="btn-ghost"
          style={{ width: 'auto', margin: '0 0 14px', fontSize: 12, padding: '6px 10px' }}
          onClick={handleSugerirPosicao}
          title="Analisa a foto e sugere onde colocar nome/preço sem tapar o produto"
        >
          🪄 Sugerir posição
        </button>

        <div className="cartaz-cols">
          <div>
            <div className="field">
              <label>Nome do produto</label>
              <input value={nome} onFocus={() => setElementoSelecionado('nome')} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="field-row">
              <div className="field">
                <label>De (R$)</label>
                <input type="number" step="0.01" value={de} onFocus={() => setElementoSelecionado('preco')} onChange={(e) => setDe(e.target.value)} />
              </div>
              <div className="field">
                <label>Por (R$)</label>
                <input type="number" step="0.01" value={por} onFocus={() => setElementoSelecionado('preco')} onChange={(e) => setPor(e.target.value)} />
              </div>
            </div>
            <label className="cartaz-checkbox">
              <input type="checkbox" checked={frasesAtivo} onChange={(e) => setFrasesAtivo(e.target.checked)} /> Usar frases extras
            </label>
            <div className="field">
              <textarea rows={2} value={frases} onFocus={() => setElementoSelecionado('frases')} onChange={(e) => setFrases(e.target.value)} placeholder={'Chama! Entrega grátis\n(81) 99913-7573'} />
            </div>

            {elementoSelecionado === 'imagemExtra' && (
              <section className="cartaz-ajuste-contextual" aria-live="polite">
                <div className="cartaz-ajuste-contextual-head">
                  <div>
                    <span>Ajustando na prévia</span>
                    <strong>Logomarca ou selo</strong>
                  </div>
                  <button type="button" className="btn-ghost" onClick={resetarElementoSelecionado}>Voltar pra posição do Story</button>
                </div>
                <p>
                  Arraste o centro para mover. Use as bordas ou os pontos para redimensionar.{' '}
                  {imagemExtraCaixaProduto ? 'Posição própria deste produto.' : 'Usando a mesma posição definida no Story produto único.'}
                </p>
              </section>
            )}

            {elementoSelecionado && elementoSelecionado !== 'imagemExtra' && (
              <section className="cartaz-ajuste-contextual" aria-live="polite">
                <div className="cartaz-ajuste-contextual-head">
                  <div>
                    <span>Ajustando na prévia</span>
                    <strong>{elementoSelecionado === 'nome' ? 'Nome do produto' : elementoSelecionado === 'preco' ? 'Oferta (De / Por)' : 'Frases extras'}</strong>
                  </div>
                  <button type="button" className="btn-ghost" onClick={resetarElementoSelecionado}>Redefinir pro padrão</button>
                </div>
                <p>Arraste o centro para mover. Use as bordas ou os pontos para redimensionar.</p>
                <div className="field-row">
                  <div className="field">
                    <label>Tamanho {elementoSelecionado === 'nome' ? tamanhoNome : elementoSelecionado === 'preco' ? tamanhoPreco : tamanhoFrases}px</label>
                    <input
                      type="range"
                      min={elementoSelecionado === 'nome' ? 24 : elementoSelecionado === 'preco' ? 34 : 18}
                      max={elementoSelecionado === 'nome' ? 70 : elementoSelecionado === 'preco' ? 90 : 50}
                      value={elementoSelecionado === 'nome' ? tamanhoNome : elementoSelecionado === 'preco' ? tamanhoPreco : tamanhoFrases}
                      onChange={(e) => {
                        const valor = Number(e.target.value);
                        if (elementoSelecionado === 'nome') setTamanhoNome(valor);
                        if (elementoSelecionado === 'preco') setTamanhoPreco(valor);
                        if (elementoSelecionado === 'frases') setTamanhoFrases(valor);
                      }}
                    />
                  </div>
                  {elementoSelecionado === 'nome' && <>
                    <div className="field"><label>Fundo</label><input type="color" value={corLogo} onChange={(e) => setCorLogo(e.target.value)} /></div>
                    <div className="field"><label>Texto</label><input type="color" value={corTextoNome} onChange={(e) => setCorTextoNome(e.target.value)} /></div>
                  </>}
                  {elementoSelecionado === 'preco' && <div className="field"><label>Texto</label><input type="color" value={corPreco} onChange={(e) => setCorPreco(e.target.value)} /></div>}
                  {elementoSelecionado === 'frases' && <>
                    <div className="field"><label>Fundo</label><input type="color" value={corFundoFrases} onChange={(e) => setCorFundoFrases(e.target.value)} /></div>
                    <div className="field"><label>Texto</label><input type="color" value={corTextoFrases} onChange={(e) => setCorTextoFrases(e.target.value)} /></div>
                  </>}
                </div>
              </section>
            )}

            <div className="cartaz-actions" style={{ marginTop: 14 }}>
              <button type="button" className="btn-primary" onClick={handleBaixar} disabled={salvando}>
                {salvando ? 'Preparando...' : '⬇️ Salvar ajustes e baixar/compartilhar'}
              </button>
              <button type="button" className="btn-ghost" onClick={handleBaixarDireto} disabled={salvandoDireto}>
                {salvandoDireto ? 'Preparando...' : '💾 Salvar ajustes e baixar no computador'}
              </button>
              <button type="button" className="btn-ghost" onClick={handleSalvar}>
                ✅ Só salvar os ajustes (sem baixar)
              </button>
            </div>
          </div>

          <div className="cartaz-preview">
            <div className="cartaz-preview-head">
              <div className="cartaz-preview-title-row">
                <strong>Prévia em tempo real</strong>
                <button
                  type="button"
                  className="btn-ghost cartaz-preview-toggle"
                  aria-pressed={mostrarInterfaceInstagram}
                  onClick={() => setMostrarInterfaceInstagram((atual) => !atual)}
                >
                  {mostrarInterfaceInstagram ? 'Ver imagem final' : 'Simular Instagram'}
                </button>
              </div>
              <span>{elementoSelecionado ? 'Item selecionado — arraste para mover ou redimensionar.' : 'Toque em um item da arte para editar.'}</span>
            </div>
            <div className="story-phone">
              <div className="story-phone-speaker" aria-hidden="true" />
              <div className="cartaz-canvas-frame">
                <div className="cartaz-canvas-stage" ref={frameRef} onPointerDownCapture={(e) => {
                  if (e.target === canvasRef.current) {
                    setElementoSelecionado(null);
                    setGuiasAlinhamento(null);
                  }
                }}>
                  <canvas ref={canvasRef} width={LARGURA_STORY} height={ALTURA_STORY} className="cartaz-canvas" />
                  {guiasAlinhamento?.vertical !== undefined && <i className="story-alignment-guide story-alignment-guide--vertical" style={{ left: `${(guiasAlinhamento.vertical / LARGURA_STORY) * 100}%` }} aria-hidden="true" />}
                  {guiasAlinhamento?.horizontal !== undefined && <i className="story-alignment-guide story-alignment-guide--horizontal" style={{ top: `${(guiasAlinhamento.horizontal / ALTURA_STORY) * 100}%` }} aria-hidden="true" />}
                  {mostrarInterfaceInstagram && (
                    <div className="instagram-story-ui" aria-hidden="true">
                      <div className="instagram-safe-content"><span>área segura · 1080 × 1330</span></div>
                      <div className="instagram-safe-zone instagram-safe-zone--top">
                        <div className="instagram-progress"><i /><i /><i /></div>
                        <div className="instagram-profile-row">
                          <span className="instagram-avatar">P</span>
                          <span><b>pharmamind</b> · 1 h</span>
                          <em>•••</em>
                        </div>
                        <small>250 px reservados ao perfil</small>
                      </div>
                      <div className="instagram-safe-zone instagram-safe-zone--bottom">
                        <small>340 px reservados a comentários e ações</small>
                        <div className="instagram-reply">Enviar mensagem...</div>
                      </div>
                    </div>
                  )}
                  <ElementoStoryEditavel
                    frameRef={frameRef}
                    caixa={caixasPreview.nome}
                    selecionado={elementoSelecionado === 'nome'}
                    descricao="Nome do produto"
                    tamanho={tamanhoNome}
                    tamanhoMinimo={24}
                    tamanhoMaximo={70}
                    caixasVizinhas={[caixasPreview.preco, caixasPreview.frases].filter((c): c is CaixaStory => c !== null)}
                    onSelecionar={() => setElementoSelecionado('nome')}
                    onGuiasAlinhadas={setGuiasAlinhamento}
                    onAlterar={(caixa, tamanho) => {
                      atualizarGuia(setGuiaNome, caixa);
                      if (tamanho !== undefined) setTamanhoNome(tamanho);
                    }}
                  />
                  <ElementoStoryEditavel
                    frameRef={frameRef}
                    caixa={caixasPreview.preco}
                    selecionado={elementoSelecionado === 'preco'}
                    descricao="Preço da oferta"
                    tamanho={tamanhoPreco}
                    tamanhoMinimo={34}
                    tamanhoMaximo={90}
                    caixasVizinhas={[caixasPreview.nome, caixasPreview.frases].filter((c): c is CaixaStory => c !== null)}
                    onSelecionar={() => setElementoSelecionado('preco')}
                    onGuiasAlinhadas={setGuiasAlinhamento}
                    onAlterar={(caixa, tamanho) => {
                      atualizarGuia(setGuiaPreco, caixa);
                      if (tamanho !== undefined) setTamanhoPreco(tamanho);
                    }}
                  />
                  <ElementoStoryEditavel
                    frameRef={frameRef}
                    caixa={caixasPreview.frases}
                    selecionado={elementoSelecionado === 'frases'}
                    descricao="Frases extras"
                    tamanho={tamanhoFrases}
                    tamanhoMinimo={18}
                    tamanhoMaximo={50}
                    caixasVizinhas={[caixasPreview.nome, caixasPreview.preco].filter((c): c is CaixaStory => c !== null)}
                    onSelecionar={() => setElementoSelecionado('frases')}
                    onGuiasAlinhadas={setGuiasAlinhamento}
                    onAlterar={(caixa, tamanho) => {
                      atualizarGuia(setGuiaFrases, caixa);
                      if (tamanho !== undefined) setTamanhoFrases(tamanho);
                    }}
                  />
                  <ElementoStoryEditavel
                    frameRef={frameRef}
                    caixa={caixasPreview.imagemExtra}
                    selecionado={elementoSelecionado === 'imagemExtra'}
                    descricao="Logomarca ou selo"
                    tamanho={1}
                    tamanhoMinimo={1}
                    tamanhoMaximo={1}
                    controlaTipografia={false}
                    caixasVizinhas={[caixasPreview.nome, caixasPreview.preco, caixasPreview.frases].filter((c): c is CaixaStory => c !== null)}
                    onSelecionar={() => setElementoSelecionado('imagemExtra')}
                    onGuiasAlinhadas={setGuiasAlinhamento}
                    onAlterar={(caixa) => setImagemExtraCaixaProduto(caixa)}
                  />
                </div>
              </div>
              <div className="story-phone-home" aria-hidden="true" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
