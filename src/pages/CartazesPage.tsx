import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FaixaArrastavel } from '../components/FaixaArrastavel';
import { FerramentaShell } from '../components/FerramentaShell';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { carregarImagemDeArquivo } from '../utils/arquivoImagem';
import {
  ALTURA_STORY,
  LARGURA_STORY,
  fmtMoney,
  montarTituloCompartilhamento,
  pintarStory,
} from '../utils/cartazEngine';
import { salvarOuCompartilharArquivo } from '../utils/compartilharArquivo';

const EMOJIS_DESTAQUE = ['🤩😱', '🔥🔥', '😍', '🎉', '💚', '⚡'];

interface Guia {
  y: number;
  offsetX: number;
}

/**
 * Gerador de Story (produto único) — Fase 1 da reescrita de Cartazes como tela
 * React nativa (ver PLANO-REESCRITA-FERRAMENTAS.md). Os modos Panfleto e
 * Importar planilha ainda não foram portados; o link no rodapé leva pra versão
 * completa (a ferramenta HTML original, embutida na mesma moldura).
 *
 * O motor de pintura (utils/cartazEngine.ts) é portado 1:1 do que já existia —
 * mesma matemática de posição, mesmo texto, mesmas cores padrão — só a casca
 * ao redor é nova.
 */
export function CartazesPage() {
  useDocumentTitle('Cartazes e panfletos');
  const { orgSlug } = useParams<{ orgSlug: string }>();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const inputArquivoRef = useRef<HTMLInputElement>(null);

  const [imagem, setImagem] = useState<HTMLImageElement | null>(null);
  const [carregandoImagem, setCarregandoImagem] = useState(false);

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

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, {
      imagem,
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

  async function handleEscolherArquivo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = ''; // permite escolher o mesmo arquivo de novo depois
    if (!arquivo) return;
    setCarregandoImagem(true);
    try {
      setImagem(await carregarImagemDeArquivo(arquivo));
    } finally {
      setCarregandoImagem(false);
    }
  }

  async function handleBaixar() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSalvando(true);
    try {
      const tituloCompartilhamento = montarTituloCompartilhamento(nome, de, por);
      await salvarOuCompartilharArquivo(canvas.toDataURL('image/png'), `story-${Date.now()}.png`, 'image/png', tituloCompartilhamento);
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
    <FerramentaShell titulo="Cartazes e panfletos">
      <div className="cartaz-cols">
        <div className="card cartaz-painel">
          <h3 className="cartaz-titulo-secao">Dados do produto</h3>

          <div className="field" style={{ marginBottom: 10 }}>
            <label
              className="upload-box"
              style={{ display: 'block', cursor: 'pointer' }}
              onClick={() => inputArquivoRef.current?.click()}
            >
              {carregandoImagem ? '⏳ Carregando foto...' : imagem ? '📷 Trocar foto' : '📷 Escolher foto'}
            </label>
            <input
              ref={inputArquivoRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleEscolherArquivo}
            />
          </div>
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

      <p className="footnote" style={{ marginTop: 20 }}>
        Precisa montar um panfleto com vários produtos ou importar uma planilha?{' '}
        <Link to={`/${orgSlug}/cartazes/completo`}>Abrir a ferramenta completa</Link> (ainda não migrada pra esta tela
        nova).
      </p>

      {toast && <div className="toast">{toast}</div>}
    </FerramentaShell>
  );
}
