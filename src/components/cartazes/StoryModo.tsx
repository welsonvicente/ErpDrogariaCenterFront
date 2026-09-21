import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AjustarEnquadramentoModal } from '../AjustarEnquadramentoModal';
import { CameraModal } from '../CameraModal';
import { ElementoStoryEditavel } from '../ElementoStoryEditavel';
import { carregarImagemDeArquivo } from '../../utils/arquivoImagem';
import {
  ALTURA_STORY,
  LARGURA_STORY,
  calcularCaixasStory,
  fmtMoney,
  montarTituloCompartilhamento,
  pintarStory,
  type CaixasStory,
  type CaixaStory,
  type TransformImagem,
} from '../../utils/cartazEngine';
import {
  carregarConfiguracoes,
  carregarImagemDeDataUrl,
  carregarProdutosRecentes,
  carregarRascunho,
  limparRascunho,
  salvarConfiguracoes,
  salvarProdutoRecente,
  salvarRascunho,
  type ProdutoRecente,
} from '../../utils/cartazPersistencia';
import { baixarArquivoDireto, salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';

const EMOJIS_DESTAQUE = ['🤩😱', '🔥🔥', '😍', '🎉', '💚', '⚡'];
const TRANSFORM_PADRAO: TransformImagem = { scale: 1, panX: 0.5, panY: 0.5 };

interface Guia {
  y: number;
  offsetX: number;
  x?: number;
  largura?: number;
}

/**
 * Gerador de Story (produto único) — reescrita de Cartazes como tela React
 * nativa (ver PLANO-REESCRITA-FERRAMENTAS.md).
 *
 * O motor de pintura (utils/cartazEngine.ts) é portado 1:1 do que já existia —
 * mesma matemática de posição, mesmo texto, mesmas cores padrão — só a casca
 * ao redor é nova.
 */
export function StoryModo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [transformImagem, setTransformImagem] = useState<TransformImagem>(TRANSFORM_PADRAO);
  const [carregandoImagem, setCarregandoImagem] = useState(false);
  const [cameraAberta, setCameraAberta] = useState(false);
  const [ajusteAberto, setAjusteAberto] = useState(false);

  const [nomeAtivo, setNomeAtivo] = useState(true);
  const [nome, setNome] = useState('');
  const [precoAtivo, setPrecoAtivo] = useState(true);
  const [de, setDe] = useState('');
  const [por, setPor] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS_DESTAQUE[0]);

  const [corLogo, setCorLogo] = useState('#436000');
  const [corTextoNome, setCorTextoNome] = useState('#FFFFFF');
  const [corPreco, setCorPreco] = useState('#E30613');
  const [tamanhoNome, setTamanhoNome] = useState(40);
  const [tamanhoPreco, setTamanhoPreco] = useState(62);
  const [margemNome, setMargemNome] = useState(60);
  const [margemPreco, setMargemPreco] = useState(60);

  const [frasesAtivo, setFrasesAtivo] = useState(true);
  const [frases, setFrases] = useState('');
  const [corFundoFrases, setCorFundoFrases] = useState('#173C3A');
  const [corTextoFrases, setCorTextoFrases] = useState('#FFFFFF');
  const [tamanhoFrases, setTamanhoFrases] = useState(32);
  const [margemFrases, setMargemFrases] = useState(60);

  const [guiaNome, setGuiaNome] = useState<Guia>({ y: 130, offsetX: 0 });
  const [guiaPreco, setGuiaPreco] = useState<Guia>({ y: 320, offsetX: 0 });
  const [guiaFrases, setGuiaFrases] = useState<Guia>({ y: 560, offsetX: 0 });
  const [caixasPreview, setCaixasPreview] = useState<CaixasStory>({ nome: null, preco: null, frases: null });
  const [elementoSelecionado, setElementoSelecionado] = useState<'nome' | 'preco' | 'frases' | null>(null);
  const [mostrarInterfaceInstagram, setMostrarInterfaceInstagram] = useState(true);

  const [produtosRecentes, setProdutosRecentes] = useState<ProdutoRecente[]>([]);

  const [salvando, setSalvando] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  const [toast, setToast] = useState('');

  // Fontes do motor de canvas (Fredoka/Space Grotesk) carregam assíncrono —
  // sem esperar, a primeira pintura sai com a fonte de fallback do navegador.
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

  // Carrega configurações (preferências permanentes) e oferece restaurar o
  // rascunho (produto específico em andamento) — só uma vez, ao montar. Feito
  // num único efeito porque a pergunta de restaurar rascunho é bloqueante
  // (confirm) e não deve competir com o efeito de salvar, que roda a cada
  // mudança de campo.
  const [prontoParaPersistir, setProntoParaPersistir] = useState(false);
  useEffect(() => {
    const config = carregarConfiguracoes();
    if (config) {
      if (config.corLogo) setCorLogo(config.corLogo);
      if (config.corTextoNome) setCorTextoNome(config.corTextoNome);
      if (config.corPreco) setCorPreco(config.corPreco);
      if (config.tamanhoNome) setTamanhoNome(config.tamanhoNome);
      if (config.tamanhoPreco) setTamanhoPreco(config.tamanhoPreco);
      if (config.margemNome !== undefined) setMargemNome(config.margemNome);
      if (config.margemPreco !== undefined) setMargemPreco(config.margemPreco);
      if (config.frasesAtivo !== undefined) setFrasesAtivo(config.frasesAtivo);
      if (config.frases !== undefined) setFrases(config.frases);
      if (config.corFundoFrases) setCorFundoFrases(config.corFundoFrases);
      if (config.corTextoFrases) setCorTextoFrases(config.corTextoFrases);
      if (config.tamanhoFrases) setTamanhoFrases(config.tamanhoFrases);
      if (config.margemFrases !== undefined) setMargemFrases(config.margemFrases);
      if (config.guiaNome) setGuiaNome(config.guiaNome);
      if (config.guiaPreco) setGuiaPreco(config.guiaPreco);
      if (config.guiaFrases) setGuiaFrases(config.guiaFrases);
    }

    setProdutosRecentes(carregarProdutosRecentes());

    async function restaurarRascunhoSeConfirmado() {
      const rascunho = carregarRascunho();
      const temAlgo = rascunho && (rascunho.imgSrc || rascunho.nome || rascunho.de || rascunho.por);
      if (!rascunho || !temAlgo) return;

      const quando = rascunho.savedAt ? new Date(rascunho.savedAt).toLocaleString('pt-BR') : '';
      const mensagem = `Encontramos um rascunho não finalizado${quando ? ` (salvo em ${quando})` : ''}. Deseja continuar de onde parou?`;
      if (!window.confirm(mensagem)) {
        limparRascunho();
        return;
      }

      if (rascunho.imgSrc) {
        try {
          setImagem(await carregarImagemDeDataUrl(rascunho.imgSrc));
          setTransformImagem(rascunho.transform || TRANSFORM_PADRAO);
        } catch {
          /* foto do rascunho corrompida — segue sem ela */
        }
      }
      setNome(rascunho.nome || '');
      setDe(rascunho.de || '');
      setPor(rascunho.por || '');
    }
    restaurarRascunhoSeConfirmado().finally(() => setProntoParaPersistir(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salva as configurações (preferências permanentes) — não inclui o produto
  // atual (nome/de/por/imagem), que é responsabilidade só do rascunho.
  useEffect(() => {
    if (!prontoParaPersistir) return;
    const timer = setTimeout(() => {
      salvarConfiguracoes({
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
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [
    prontoParaPersistir,
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
  ]);

  // Salva o rascunho do produto em andamento — recuperável se a aba fechar ou
  // travar no meio de um lançamento.
  useEffect(() => {
    if (!prontoParaPersistir) return;
    const timer = setTimeout(() => {
      salvarRascunho({ imgSrc: imagem?.src ?? null, transform: transformImagem, nome, de, por });
    }, 700);
    return () => clearTimeout(timer);
  }, [prontoParaPersistir, imagem, transformImagem, nome, de, por]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const parametros = {
      imagem,
      transformImagem,
      nome: nomeAtivo ? nome.trim() : '',
      de: precoAtivo ? de : '',
      por: precoAtivo ? por : '',
      emoji,
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
    };
    pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, parametros);
    const proximasCaixas = calcularCaixasStory(ctx, LARGURA_STORY, parametros);
    setCaixasPreview((atuais) =>
      JSON.stringify(atuais) === JSON.stringify(proximasCaixas) ? atuais : proximasCaixas,
    );
  }, [
    imagem,
    transformImagem,
    fontesProntas,
    nomeAtivo,
    nome,
    precoAtivo,
    de,
    por,
    emoji,
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
  ]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  function definirImagem(img: HTMLImageElement, transform: TransformImagem = TRANSFORM_PADRAO) {
    setImagem(img);
    setTransformImagem(transform);
  }

  function atualizarGuia(setGuia: (atualizar: (atual: Guia) => Guia) => void, caixa: CaixaStory) {
    setGuia((atual) => ({ ...atual, x: caixa.x, y: caixa.y, largura: caixa.largura }));
  }

  function resetarElementoSelecionado() {
    if (elementoSelecionado === 'nome') {
      setGuiaNome({ y: 130, offsetX: 0 });
      setTamanhoNome(40);
    }
    if (elementoSelecionado === 'preco') {
      setGuiaPreco({ y: 320, offsetX: 0 });
      setTamanhoPreco(62);
    }
    if (elementoSelecionado === 'frases') {
      setGuiaFrases({ y: 560, offsetX: 0 });
      setTamanhoFrases(32);
    }
  }

  async function handleEscolherArquivo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (!arquivo) return;
    setCarregandoImagem(true);
    try {
      definirImagem(await carregarImagemDeArquivo(arquivo));
    } finally {
      setCarregandoImagem(false);
    }
  }

  function handleUsarProdutoRecente(produto: ProdutoRecente) {
    carregarImagemDeDataUrl(produto.imgSrc)
      .then((img) => {
        definirImagem(img);
        setNome(produto.name || '');
        setDe(produto.de || '');
        setPor(produto.por || '');
      })
      .catch(() => setToast('Não consegui recuperar a foto desse produto.'));
  }

  function registrarProdutoRecenteAposBaixar() {
    if (imagem && nome.trim()) {
      salvarProdutoRecente({ imgSrc: imagem.src, name: nome.trim(), de, por });
      setProdutosRecentes(carregarProdutosRecentes());
    }
  }

  /** Baixa ou compartilha (Web Share, quando o navegador suportar) — no celular, dá pra mandar direto pro WhatsApp. */
  async function handleBaixar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSalvando(true);
    try {
      const tituloCompartilhamento = montarTituloCompartilhamento(nome, de, por);
      await salvarOuCompartilharArquivo(canvas.toDataURL('image/png'), `story-${Date.now()}.png`, 'image/png', tituloCompartilhamento);
      registrarProdutoRecenteAposBaixar();
    } finally {
      setSalvando(false);
    }
  }

  /** Salva direto na pasta de Downloads do computador, sem passar pela folha de compartilhar. */
  async function handleBaixarDireto() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSalvandoDireto(true);
    try {
      await baixarArquivoDireto(canvas.toDataURL('image/png'), `story-${Date.now()}.png`, 'image/png');
      registrarProdutoRecenteAposBaixar();
    } finally {
      setSalvandoDireto(false);
    }
  }

  async function handleCopiarTexto() {
    const nomeFinal = nome.trim() || 'Produto';
    const pct = de && por ? Math.round((1 - Number(por) / Number(de)) * 100) : null;
    let linha = `💊 *${nomeFinal}*\n`;
    if (de) linha += `De: R$${fmtMoney(de)}\n`;
    if (por) linha += `Por: *R$${fmtMoney(por)}*`;
    if (pct && pct > 0) linha += ` (-${pct}%)`;
    const texto = `🔥 *OFERTA DROGARIA CENTER* 🔥\n\n${linha}\n\n📍 Corre que é por tempo limitado!`;

    try {
      await navigator.clipboard.writeText(texto);
      setToast('Texto copiado! Já pode colar no WhatsApp/Instagram.');
    } catch {
      setToast('Não foi possível copiar automaticamente — selecione e copie o texto manualmente.');
    }
  }

  return (
    <>
      <div className="cartaz-cols">
        <div className="card cartaz-painel">
          <h3 className="cartaz-titulo-secao">Dados do produto</h3>

          {produtosRecentes.length > 0 && (
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Últimos produtos usados</label>
              <div className="cartaz-recentes">
                {produtosRecentes.map((p) => (
                  <button
                    type="button"
                    key={`${p.name}-${p.usedAt}`}
                    className="cartaz-recente-item"
                    title={`Usar "${p.name}" de novo`}
                    onClick={() => handleUsarProdutoRecente(p)}
                  >
                    <img src={p.imgSrc} alt="" />
                    <span className="cartaz-recente-nome">{p.name}</span>
                    <span className="cartaz-recente-preco">R${fmtMoney(p.por)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <label
              className="upload-box"
              style={{ display: 'block', cursor: 'pointer', flex: 1, margin: 0 }}
              onClick={() => inputArquivoRef.current?.click()}
            >
              {carregandoImagem ? '⏳ Carregando foto...' : imagem ? '📷 Trocar foto' : '📷 Escolher foto'}
            </label>
            <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, whiteSpace: 'nowrap' }} onClick={() => setCameraAberta(true)}>
              📸 Tirar foto
            </button>
            <input
              ref={inputArquivoRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleEscolherArquivo}
            />
          </div>
          {imagem && (
            <button
              type="button"
              className="btn-ghost"
              style={{ width: 'auto', margin: '0 0 14px', fontSize: 12, padding: '6px 10px' }}
              onClick={() => setAjusteAberto(true)}
            >
              🖼️ Ajustar enquadramento da foto
            </button>
          )}
          <p className="footnote" style={{ textAlign: 'left', margin: '-4px 0 14px' }}>
            Preencha os dados e ajuste a arte diretamente na prévia.
          </p>

          <label className="cartaz-checkbox">
            <input type="checkbox" checked={nomeAtivo} onChange={(e) => setNomeAtivo(e.target.checked)} /> Usar o nome do
            produto na imagem
          </label>
          <div className="field">
            <input value={nome} onFocus={() => setElementoSelecionado('nome')} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Johnson's Baby Sabonete 180ml" />
          </div>

          <label className="cartaz-checkbox">
            <input type="checkbox" checked={precoAtivo} onChange={(e) => setPrecoAtivo(e.target.checked)} /> Usar o preço
            na imagem
          </label>
          <div className="field-row">
            <div className="field">
              <label>De (R$)</label>
              <input type="number" step="0.01" value={de} onFocus={() => setElementoSelecionado('preco')} onChange={(e) => setDe(e.target.value)} placeholder="15,99" />
            </div>
            <div className="field">
              <label>Por (R$)</label>
              <input type="number" step="0.01" value={por} onFocus={() => setElementoSelecionado('preco')} onChange={(e) => setPor(e.target.value)} placeholder="9,99" />
            </div>
          </div>

          <div className="field">
            <label>Emoji de destaque</label>
            <div className="cartaz-emoji-row">
              {EMOJIS_DESTAQUE.map((em) => (
                <button
                  key={em}
                  type="button"
                  className={`emoji-btn${em === emoji ? ' selected' : ''}`}
                  onClick={() => setEmoji(em)}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          <label className="cartaz-checkbox">
            <input type="checkbox" checked={frasesAtivo} onChange={(e) => setFrasesAtivo(e.target.checked)} /> Usar frases
            extras na imagem
          </label>
          <div className="field">
            <label>Frases extras (uma por linha) — ex: Chama! Entrega grátis (81) 99913-7573</label>
            <textarea
              rows={2}
              value={frases}
              onFocus={() => setElementoSelecionado('frases')}
              onChange={(e) => setFrases(e.target.value)}
              placeholder={'Chama! Entrega grátis\n(81) 99913-7573'}
            />
          </div>
          {elementoSelecionado && (
            <section className="cartaz-ajuste-contextual" aria-live="polite">
              <div className="cartaz-ajuste-contextual-head">
                <div>
                  <span>Ajustando na prévia</span>
                  <strong>{elementoSelecionado === 'nome' ? 'Nome do produto' : elementoSelecionado === 'preco' ? 'Oferta (De / Por)' : 'Frases extras'}</strong>
                </div>
                <button type="button" className="btn-ghost" onClick={resetarElementoSelecionado}>Redefinir</button>
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

          <div className="cartaz-actions">
            <button className="btn-primary" onClick={handleBaixar} disabled={salvando}>
              {salvando ? 'Preparando...' : '⬇️ Baixar ou compartilhar (WhatsApp etc.)'}
            </button>
            <button className="btn-ghost" onClick={handleBaixarDireto} disabled={salvandoDireto}>
              {salvandoDireto ? 'Preparando...' : '💾 Salvar direto no computador'}
            </button>
            <button className="btn-ghost" onClick={handleCopiarTexto}>
              📋 Copiar texto pronto (WhatsApp/Instagram)
            </button>
          </div>
          <p className="footnote">Formato 1080×1920 — pronto pra postar no Instagram/WhatsApp Status.</p>
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
            <span>{elementoSelecionado ? 'Item selecionado — arraste para mover ou redimensionar.' : 'Clique em um item da arte para editar.'}</span>
          </div>
          <div className="story-phone">
            <div className="story-phone-speaker" aria-hidden="true" />
            <div className="cartaz-canvas-frame">
              <div className="cartaz-canvas-stage" ref={frameRef} onPointerDownCapture={(e) => {
                if (e.target === canvasRef.current) setElementoSelecionado(null);
              }}>
                <canvas ref={canvasRef} width={LARGURA_STORY} height={ALTURA_STORY} className="cartaz-canvas" />
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
                onSelecionar={() => setElementoSelecionado('nome')}
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
                onSelecionar={() => setElementoSelecionado('preco')}
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
                onSelecionar={() => setElementoSelecionado('frases')}
                onAlterar={(caixa, tamanho) => {
                  atualizarGuia(setGuiaFrases, caixa);
                  if (tamanho !== undefined) setTamanhoFrases(tamanho);
                }}
              />
              </div>
            </div>
            <div className="story-phone-home" aria-hidden="true" />
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <CameraModal
        aberto={cameraAberta}
        onFechar={() => setCameraAberta(false)}
        onCapturar={(img) => {
          definirImagem(img);
          setCameraAberta(false);
        }}
        guias={[
          { y: guiaNome.y, offsetX: guiaNome.offsetX, margem: margemNome, visivel: nomeAtivo, corClasse: 'faixa-arrasto--nome', rotulo: 'NOME DO PRODUTO' },
          { y: guiaPreco.y, offsetX: guiaPreco.offsetX, margem: margemPreco, visivel: precoAtivo, corClasse: 'faixa-arrasto--preco', rotulo: 'R$ PREÇO' },
          { y: guiaFrases.y, offsetX: guiaFrases.offsetX, margem: margemFrases, visivel: frasesAtivo, corClasse: 'faixa-arrasto--frases', rotulo: 'FRASES' },
        ]}
      />

      {ajusteAberto && (
        <AjustarEnquadramentoModal
          imagem={imagem}
          transformInicial={transformImagem}
          onFechar={() => setAjusteAberto(false)}
          onSalvar={(t) => {
            setTransformImagem(t);
            setAjusteAberto(false);
          }}
        />
      )}
    </>
  );
}
