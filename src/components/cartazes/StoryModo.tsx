import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { AjustarEnquadramentoModal } from '../AjustarEnquadramentoModal';
import { CameraModal } from '../CameraModal';
import { FaixaArrastavel } from '../FaixaArrastavel';
import { carregarImagemDeArquivo } from '../../utils/arquivoImagem';
import {
  ALTURA_STORY,
  LARGURA_STORY,
  fmtMoney,
  montarTituloCompartilhamento,
  pintarStory,
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
import { salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';

const EMOJIS_DESTAQUE = ['🤩😱', '🔥🔥', '😍', '🎉', '💚', '⚡'];
const TRANSFORM_PADRAO: TransformImagem = { scale: 1, panX: 0.5, panY: 0.5 };

interface Guia {
  y: number;
  offsetX: number;
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

  const [produtosRecentes, setProdutosRecentes] = useState<ProdutoRecente[]>([]);

  const [salvando, setSalvando] = useState(false);
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
    pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, {
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
      tamanhoNome,
      tamanhoPreco,
      frases: frasesAtivo ? frases : '',
      frasesY: guiaFrases.y,
      frasesOffsetX: guiaFrases.offsetX,
      corFundoFrases,
      corTextoFrases,
      tamanhoFrases,
      margemNome,
      margemPreco,
      margemFrases,
    });
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

  async function handleBaixar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSalvando(true);
    try {
      const tituloCompartilhamento = montarTituloCompartilhamento(nome, de, por);
      await salvarOuCompartilharArquivo(canvas.toDataURL('image/png'), `story-${Date.now()}.png`, 'image/png', tituloCompartilhamento);
      if (imagem && nome.trim()) {
        salvarProdutoRecente({ imgSrc: imagem.src, name: nome.trim(), de, por });
        setProdutosRecentes(carregarProdutosRecentes());
      }
    } finally {
      setSalvando(false);
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
            Arraste as faixas verde, rosa e escura no preview ao lado (pra qualquer direção) pra escolher onde cada
            informação vai ficar na foto.
          </p>

          <label className="cartaz-checkbox">
            <input type="checkbox" checked={nomeAtivo} onChange={(e) => setNomeAtivo(e.target.checked)} /> Usar o nome do
            produto na imagem
          </label>
          <div className="field">
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex: Johnson's Baby Sabonete 180ml" />
          </div>

          <label className="cartaz-checkbox">
            <input type="checkbox" checked={precoAtivo} onChange={(e) => setPrecoAtivo(e.target.checked)} /> Usar o preço
            na imagem
          </label>
          <div className="field-row">
            <div className="field">
              <label>De (R$)</label>
              <input type="number" step="0.01" value={de} onChange={(e) => setDe(e.target.value)} placeholder="15,99" />
            </div>
            <div className="field">
              <label>Por (R$)</label>
              <input type="number" step="0.01" value={por} onChange={(e) => setPor(e.target.value)} placeholder="9,99" />
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

          <div className="field-row">
            <div className="field">
              <label>Cor do logo/nome</label>
              <input type="color" value={corLogo} onChange={(e) => setCorLogo(e.target.value)} />
            </div>
            <div className="field">
              <label>Cor do texto do nome</label>
              <input type="color" value={corTextoNome} onChange={(e) => setCorTextoNome(e.target.value)} />
            </div>
            <div className="field">
              <label>Cor do preço</label>
              <input type="color" value={corPreco} onChange={(e) => setCorPreco(e.target.value)} />
            </div>
          </div>

          <div className="field-row">
            <div className="field">
              <label>Tamanho do nome {tamanhoNome}px</label>
              <input type="range" min={24} max={70} value={tamanhoNome} onChange={(e) => setTamanhoNome(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Tamanho do preço {tamanhoPreco}px</label>
              <input type="range" min={34} max={90} value={tamanhoPreco} onChange={(e) => setTamanhoPreco(Number(e.target.value))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Margem lateral do nome {margemNome}px</label>
              <input type="range" min={0} max={180} value={margemNome} onChange={(e) => setMargemNome(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Margem lateral do preço {margemPreco}px</label>
              <input type="range" min={0} max={180} value={margemPreco} onChange={(e) => setMargemPreco(Number(e.target.value))} />
            </div>
          </div>
          <p className="footnote" style={{ textAlign: 'left', margin: '-6px 0 12px' }}>
            Margem menor = a faixa fica mais colada nas bordas. O tamanho da letra continua controlado só pelos
            controles de "Tamanho" acima — um não mexe no outro.
          </p>

          <label className="cartaz-checkbox">
            <input type="checkbox" checked={frasesAtivo} onChange={(e) => setFrasesAtivo(e.target.checked)} /> Usar frases
            extras na imagem
          </label>
          <div className="field">
            <label>Frases extras (uma por linha) — ex: Chama! Entrega grátis (81) 99913-7573</label>
            <textarea
              rows={2}
              value={frases}
              onChange={(e) => setFrases(e.target.value)}
              placeholder={'Chama! Entrega grátis\n(81) 99913-7573'}
            />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Cor de fundo das frases</label>
              <input type="color" value={corFundoFrases} onChange={(e) => setCorFundoFrases(e.target.value)} />
            </div>
            <div className="field">
              <label>Cor do texto das frases</label>
              <input type="color" value={corTextoFrases} onChange={(e) => setCorTextoFrases(e.target.value)} />
            </div>
            <div className="field">
              <label>Tamanho {tamanhoFrases}px</label>
              <input type="range" min={18} max={50} value={tamanhoFrases} onChange={(e) => setTamanhoFrases(Number(e.target.value))} />
            </div>
          </div>
          <div className="field">
            <label>Margem lateral das frases {margemFrases}px</label>
            <input type="range" min={0} max={180} value={margemFrases} onChange={(e) => setMargemFrases(Number(e.target.value))} />
          </div>

          <button className="btn-primary" onClick={handleBaixar} disabled={salvando} style={{ width: '100%' }}>
            {salvando ? 'Preparando...' : '⬇️ Baixar imagem do story'}
          </button>
          <button className="btn-ghost" onClick={handleCopiarTexto} style={{ width: '100%', marginTop: 8 }}>
            📋 Copiar texto pronto (WhatsApp/Instagram)
          </button>
          <p className="footnote">Formato 1080×1920 — pronto pra postar no Instagram/WhatsApp Status.</p>
        </div>

        <div className="cartaz-preview">
          <div className="cartaz-canvas-frame" ref={frameRef}>
            <canvas ref={canvasRef} width={LARGURA_STORY} height={ALTURA_STORY} className="cartaz-canvas" />
            <FaixaArrastavel
              frameRef={frameRef}
              y={guiaNome.y}
              offsetX={guiaNome.offsetX}
              margem={margemNome}
              visivel={nomeAtivo}
              corClasse="faixa-arrasto--nome"
              rotulo="NOME"
              onMover={(offsetX, y) => setGuiaNome({ offsetX, y })}
            />
            <FaixaArrastavel
              frameRef={frameRef}
              y={guiaPreco.y}
              offsetX={guiaPreco.offsetX}
              margem={margemPreco}
              visivel={precoAtivo}
              corClasse="faixa-arrasto--preco"
              rotulo="PREÇO"
              onMover={(offsetX, y) => setGuiaPreco({ offsetX, y })}
            />
            <FaixaArrastavel
              frameRef={frameRef}
              y={guiaFrases.y}
              offsetX={guiaFrases.offsetX}
              margem={margemFrases}
              visivel={frasesAtivo}
              corClasse="faixa-arrasto--frases"
              rotulo="FRASES"
              onMover={(offsetX, y) => setGuiaFrases({ offsetX, y })}
            />
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
