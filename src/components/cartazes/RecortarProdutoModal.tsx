import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { canvasDeTrabalho, montarProdutoRecortado, SessaoRecorte, type PontoRecorte } from '../../utils/recorteProduto';

type Ferramenta = 'manter' | 'tirar' | 'borracha';

interface Passo {
  pontos: PontoRecorte[];
  apagado: Uint8Array | null;
}

interface RecortarProdutoModalProps {
  imagem: HTMLImageElement;
  /** Nome do produto, só pro título. */
  titulo?: string;
  onSalvar: (recorte: { imagem: HTMLImageElement; blob: Blob }) => void | Promise<void>;
  onFechar: () => void;
  /** Quando há uma fila (vários produtos), mostra "Salvar e próximo" e "Pular". */
  onProximo?: () => void;
  posicaoFila?: string;
}

/**
 * Janela de "Tirar fundo": a IA marca o produto a partir de um clique, a pessoa
 * corrige com cliques de "manter"/"tirar" (ex.: em cima da mão) e, se precisar,
 * passa a borracha. O resultado é um PNG transparente só com o produto.
 */
export function RecortarProdutoModal({ imagem, titulo, onSalvar, onFechar, onProximo, posicaoFila }: RecortarProdutoModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const origemRef = useRef<HTMLCanvasElement | null>(null);
  const sessaoRef = useRef<SessaoRecorte | null>(null);
  const [preparando, setPreparando] = useState(true);
  const [progresso, setProgresso] = useState(0);
  const [erro, setErro] = useState('');
  const [calculando, setCalculando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [ferramenta, setFerramenta] = useState<Ferramenta>('manter');
  const [verResultado, setVerResultado] = useState(false);
  const [tamanhoBorracha, setTamanhoBorracha] = useState(40);
  const [historico, setHistorico] = useState<Passo[]>([]);
  const [candidatas, setCandidatas] = useState<Uint8Array[]>([]);
  const [opcao, setOpcao] = useState(0);
  const apagandoRef = useRef<Uint8Array | null>(null);

  const passo: Passo = historico[historico.length - 1] ?? { pontos: [], apagado: null };
  const mascara = candidatas[opcao] ?? null;

  const segmentar = useCallback(async (pontos: PontoRecorte[]) => {
    const sessao = sessaoRef.current;
    if (!sessao) return;
    if (!pontos.some((p) => p.manter)) {
      setCandidatas([]);
      return;
    }
    setCalculando(true);
    try {
      setCandidatas(await sessao.segmentar(pontos));
      setOpcao(0);
    } catch {
      setErro('A IA não conseguiu recortar agora. Tente outro clique.');
    } finally {
      setCalculando(false);
    }
  }, []);

  // Prepara a foto: baixa a IA (1ª vez), calcula a imagem e já tenta um clique no centro.
  useEffect(() => {
    let cancelado = false;
    const origem = canvasDeTrabalho(imagem);
    origemRef.current = origem;
    setPreparando(true);
    setErro('');
    setHistorico([]);
    setCandidatas([]);
    SessaoRecorte.criar(origem, (p) => !cancelado && setProgresso(p))
      .then(async (sessao) => {
        if (cancelado) return;
        sessaoRef.current = sessao;
        setPreparando(false);
        const inicial: Passo = { pontos: [{ x: Math.round(origem.width / 2), y: Math.round(origem.height / 2), manter: true }], apagado: null };
        setHistorico([inicial]);
        await segmentar(inicial.pontos);
      })
      .catch(() => {
        if (!cancelado) setErro('Não consegui preparar a IA de recorte. Confira a internet (na primeira vez ela é baixada) e tente de novo.');
      });
    return () => {
      cancelado = true;
      sessaoRef.current = null;
    };
  }, [imagem, segmentar]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  // Pinta: na edição, a área que sai fica escurecida e os pontos aparecem; no resultado, só o produto sobre xadrez.
  const pintar = useCallback(() => {
    const canvas = canvasRef.current;
    const origem = origemRef.current;
    if (!canvas || !origem) return;
    const w = origem.width, h = origem.height;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(origem, 0, 0);
    const apagado = apagandoRef.current ?? passo.apagado;
    if (mascara) {
      const dados = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < w * h; i++) {
        const fica = mascara[i] && !apagado?.[i];
        if (fica) continue;
        if (verResultado) dados.data[i * 4 + 3] = 0;
        else {
          dados.data[i * 4] *= 0.3;
          dados.data[i * 4 + 1] *= 0.3;
          dados.data[i * 4 + 2] *= 0.3;
        }
      }
      ctx.putImageData(dados, 0, 0);
    }
    if (!verResultado) {
      const raio = Math.max(8, Math.round(Math.max(w, h) / 90));
      for (const p of passo.pontos) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, raio, 0, Math.PI * 2);
        ctx.fillStyle = p.manter ? '#1e9e6b' : '#e30613';
        ctx.fill();
        ctx.lineWidth = Math.max(2, raio / 4);
        ctx.strokeStyle = '#fff';
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${raio * 1.5}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.manter ? '+' : '−', p.x, p.y + 1);
      }
    }
  }, [mascara, passo, verResultado]);

  useEffect(() => { pintar(); }, [pintar, preparando]);

  function pontoNaImagem(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    return {
      x: Math.min(canvas.width - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * canvas.width))),
      y: Math.min(canvas.height - 1, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * canvas.height))),
      escala: canvas.width / r.width,
    };
  }

  function apagarEm(x: number, y: number, raio: number) {
    const origem = origemRef.current!;
    const w = origem.width, h = origem.height;
    const alvo = apagandoRef.current!;
    for (let yy = Math.max(0, y - raio); yy <= Math.min(h - 1, y + raio); yy++) {
      for (let xx = Math.max(0, x - raio); xx <= Math.min(w - 1, x + raio); xx++) {
        if ((xx - x) ** 2 + (yy - y) ** 2 <= raio * raio) alvo[yy * w + xx] = 1;
      }
    }
  }

  function aoPressionar(e: PointerEvent<HTMLCanvasElement>) {
    if (preparando || calculando || salvando) return;
    const { x, y, escala } = pontoNaImagem(e);
    if (ferramenta === 'borracha') {
      if (!mascara) return;
      const origem = origemRef.current!;
      apagandoRef.current = passo.apagado ? passo.apagado.slice() : new Uint8Array(origem.width * origem.height);
      e.currentTarget.setPointerCapture(e.pointerId);
      apagarEm(x, y, Math.round((tamanhoBorracha / 2) * escala));
      pintar();
      return;
    }
    const pontos = [...passo.pontos, { x, y, manter: ferramenta === 'manter' }];
    setHistorico((h) => [...h, { pontos, apagado: passo.apagado }]);
    void segmentar(pontos);
  }

  function aoMover(e: PointerEvent<HTMLCanvasElement>) {
    if (!apagandoRef.current) return;
    const { x, y, escala } = pontoNaImagem(e);
    apagarEm(x, y, Math.round((tamanhoBorracha / 2) * escala));
    pintar();
  }

  function aoSoltar() {
    const apagado = apagandoRef.current;
    if (!apagado) return;
    apagandoRef.current = null;
    setHistorico((h) => [...h, { pontos: passo.pontos, apagado }]);
  }

  function desfazer() {
    if (historico.length <= 1) return;
    const anterior = historico.slice(0, -1);
    setHistorico(anterior);
    const atual = historico[historico.length - 1];
    const voltou = anterior[anterior.length - 1];
    // Desfazer borracha não precisa da IA; desfazer um clique refaz a máscara.
    if (atual.pontos !== voltou.pontos) void segmentar(voltou.pontos);
  }

  function recomecar() {
    const origem = origemRef.current;
    if (!origem) return;
    const inicial: Passo = { pontos: [{ x: Math.round(origem.width / 2), y: Math.round(origem.height / 2), manter: true }], apagado: null };
    setHistorico([inicial]);
    void segmentar(inicial.pontos);
  }

  async function salvar(irProximo: boolean) {
    const origem = origemRef.current;
    if (!origem || !mascara) return;
    setSalvando(true);
    try {
      const recorte = await montarProdutoRecortado(origem, mascara, passo.apagado);
      if (!recorte) {
        setErro('O recorte ficou vazio — clique em "Manter" em cima do produto.');
        return;
      }
      await onSalvar(recorte);
      if (irProximo && onProximo) onProximo();
      else onFechar();
    } catch {
      setErro('Não consegui salvar o recorte. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  }

  const ocupado = preparando || calculando || salvando;

  return (
    <div className="guia-fundos-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !salvando && onFechar()}>
      <section className="card guia-fundos recorte-modal" role="dialog" aria-modal="true" aria-label="Tirar fundo do produto">
        <div className="guia-fundos-head">
          <h3>✂️ Tirar fundo{titulo ? ` — ${titulo}` : ''}</h3>
          {posicaoFila && <span className="tablet-produtos-conta">{posicaoFila}</span>}
        </div>
        <p className="footnote" style={{ textAlign: 'left', margin: '0 0 10px' }}>
          A IA marca o produto; o que fica <b>escuro sai</b>. Se a mão ou parte do fundo ficar junto, escolha <b>➖ Tirar</b> e clique em cima dela. Faltou um pedaço do produto? <b>➕ Manter</b> e clique nele.
        </p>

        <div className="recorte-ferramentas" role="radiogroup" aria-label="Ferramenta">
          {([['manter', '➕ Manter'], ['tirar', '➖ Tirar'], ['borracha', '🧽 Borracha']] as const).map(([id, rotulo]) => (
            <button key={id} type="button" role="radio" aria-checked={ferramenta === id} className={ferramenta === id ? 'active' : ''} onClick={() => setFerramenta(id)}>{rotulo}</button>
          ))}
          {ferramenta === 'borracha' && (
            <label className="recorte-borracha">
              Tamanho
              <input type="range" min={10} max={120} value={tamanhoBorracha} onChange={(e) => setTamanhoBorracha(Number(e.target.value))} />
            </label>
          )}
        </div>
        <div className="recorte-acoes">
          <button type="button" className="btn-ghost" disabled={ocupado || candidatas.length < 2} onClick={() => setOpcao((o) => (o + 1) % candidatas.length)} title="A IA sugere 3 recortes diferentes para o mesmo clique">🔁 Outra opção ({opcao + 1}/{Math.max(1, candidatas.length)})</button>
          <button type="button" className="btn-ghost" disabled={ocupado || historico.length <= 1} onClick={desfazer}>↶ Desfazer</button>
          <button type="button" className="btn-ghost" disabled={ocupado} onClick={recomecar}>↺ Recomeçar</button>
          <label className="recorte-ver">
            <input type="checkbox" checked={verResultado} onChange={(e) => setVerResultado(e.target.checked)} /> Ver resultado
          </label>
        </div>

        <div className={`recorte-palco${verResultado ? ' resultado' : ''}`}>
          {preparando && !erro && (
            <div className="recorte-aviso">
              Preparando a IA de recorte… {progresso > 0 && progresso < 100 ? `${progresso}%` : ''}
              <small>Na primeira vez ela é baixada (~15MB). Depois fica guardada no navegador.</small>
            </div>
          )}
          <canvas
            ref={canvasRef}
            className={`recorte-canvas ferramenta-${ferramenta}`}
            onPointerDown={aoPressionar}
            onPointerMove={aoMover}
            onPointerUp={aoSoltar}
            onPointerCancel={aoSoltar}
            aria-label="Foto do produto: clique para marcar o que fica ou sai"
          />
          {calculando && <div className="recorte-calculando">Recortando…</div>}
        </div>
        {erro && <p className="error-text">{erro}</p>}

        <div className="recorte-rodape">
          <button type="button" className="btn-ghost" disabled={salvando} onClick={onFechar}>Cancelar</button>
          {onProximo && <button type="button" className="btn-ghost" disabled={salvando} onClick={onProximo}>Pular ▶</button>}
          <button type="button" className="btn-primary" disabled={ocupado || !mascara} onClick={() => void salvar(false)}>{salvando ? 'Salvando…' : '✅ Usar recorte'}</button>
          {onProximo && <button type="button" className="btn-primary" disabled={ocupado || !mascara} onClick={() => void salvar(true)}>✅ Usar e próximo ▶</button>}
        </div>
      </section>
    </div>
  );
}
