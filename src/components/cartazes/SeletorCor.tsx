import { useEffect, useRef, useState, type RefObject } from 'react';
import { ehSemFundo, extrairPaleta, lerCorDoCanvas, SEM_FUNDO, type FontePaleta } from '../../utils/paletaCores';

interface EyeDropperNativo {
  open: () => Promise<{ sRGBHex: string }>;
}

/**
 * Seletor de cor de Cartazes — usado em todo lugar que troca cor. Além do
 * espectro normal, tem:
 *  - 🖌️ conta-gotas: toca num ponto da arte (`canvasArte`) e pega aquela cor
 *    exata. Sem `canvasArte`, usa o conta-gotas nativo do navegador quando
 *    existe (Chrome/Edge no computador);
 *  - "Cores da foto": paleta com as cores principais de `fontePaleta` (sem
 *    ela, as da própria arte);
 *  - "Sem fundo" (`permitirSemFundo`): tira o quadrante atrás da letra.
 */
export function SeletorCor({
  rotulo,
  valor,
  onAlterar,
  canvasArte,
  fontePaleta,
  permitirSemFundo = false,
}: {
  rotulo: string;
  valor: string;
  onAlterar: (cor: string) => void;
  canvasArte?: RefObject<HTMLCanvasElement | null>;
  fontePaleta?: FontePaleta | null;
  permitirSemFundo?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [pegando, setPegando] = useState(false);
  const [hexDigitado, setHexDigitado] = useState<string | null>(null);
  const raizRef = useRef<HTMLDivElement>(null);
  const onAlterarRef = useRef(onAlterar);
  useEffect(() => {
    onAlterarRef.current = onAlterar;
  });

  const semFundo = ehSemFundo(valor);
  // O <input type="color"> só aceita #rrggbb — "sem fundo" mostra branco nele, mas o valor real continua `transparent`.
  const corParaInput = /^#[0-9a-f]{6}$/i.test(valor) ? valor : '#ffffff';
  // Pra desmarcar "Sem fundo" voltando à cor que estava antes, não a um branco qualquer.
  const [corAntesDoSemFundo, setCorAntesDoSemFundo] = useState(corParaInput);
  const [paleta, setPaleta] = useState<string[]>([]);
  const contaGotasNativo = typeof window !== 'undefined' && 'EyeDropper' in window;
  const podePegarCor = Boolean(canvasArte) || contaGotasNativo;

  function alternarPainel() {
    // A paleta é calculada ao abrir (não a cada render). Sem `fontePaleta`
    // (ex.: Panfleto, com várias fotos), ela sai da própria arte.
    if (!aberto) setPaleta(extrairPaleta(fontePaleta ?? canvasArte?.current));
    setAberto(!aberto);
  }

  // Fecha ao tocar fora do seletor.
  useEffect(() => {
    if (!aberto) return;
    function aoTocarFora(e: PointerEvent) {
      if (raizRef.current && !raizRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener('pointerdown', aoTocarFora);
    return () => document.removeEventListener('pointerdown', aoTocarFora);
  }, [aberto]);

  // Modo conta-gotas na arte: o PRÓXIMO toque na tela é capturado antes de
  // qualquer outro elemento (inclusive as caixas arrastáveis por cima do
  // canvas) — dentro do canvas pega a cor, fora dele só cancela.
  useEffect(() => {
    if (!pegando) return;
    const canvas = canvasArte?.current ?? null;
    document.body.classList.add('conta-gotas-ativo');

    function engolirClique(e: MouseEvent) {
      e.preventDefault();
      e.stopPropagation();
    }
    function aoTocar(e: PointerEvent) {
      e.preventDefault();
      e.stopPropagation();
      const cor = canvas ? lerCorDoCanvas(canvas, e.clientX, e.clientY) : null;
      if (cor) onAlterarRef.current(cor);
      // O "click" que vem logo depois desse toque também não pode chegar em
      // nada (ex.: um botão embaixo do dedo).
      document.addEventListener('click', engolirClique, { capture: true, once: true });
      setPegando(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === 'Escape') setPegando(false);
    }
    document.addEventListener('pointerdown', aoTocar, true);
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.classList.remove('conta-gotas-ativo');
      document.removeEventListener('pointerdown', aoTocar, true);
      document.removeEventListener('keydown', aoTeclar);
    };
  }, [pegando, canvasArte]);

  async function iniciarContaGotas() {
    setAberto(false);
    if (canvasArte) {
      setPegando(true);
      return;
    }
    try {
      const resultado = await (new (window as unknown as { EyeDropper: new () => EyeDropperNativo }).EyeDropper()).open();
      onAlterar(resultado.sRGBHex.toUpperCase());
    } catch {
      /* a pessoa cancelou (Esc) */
    }
  }

  function aplicarHexDigitado(texto: string) {
    setHexDigitado(texto);
    const limpo = texto.trim().replace(/^#?/, '#');
    if (/^#[0-9a-f]{6}$/i.test(limpo)) onAlterar(limpo.toUpperCase());
  }

  return (
    <div className="field seletor-cor" ref={raizRef}>
      <label>{rotulo}</label>
      <button
        type="button"
        className={`seletor-cor-botao${semFundo ? ' is-sem-fundo' : ''}`}
        aria-expanded={aberto}
        aria-label={`${rotulo}: ${semFundo ? 'sem fundo' : valor}. Toque pra trocar.`}
        onClick={alternarPainel}
      >
        <span className="seletor-cor-amostra" style={semFundo ? undefined : { background: valor }} />
        <span className="seletor-cor-valor">{semFundo ? 'Sem fundo' : valor.toUpperCase()}</span>
      </button>

      {aberto && (
        <div className="seletor-cor-painel" role="dialog" aria-label={`Escolher ${rotulo.toLowerCase()}`}>
          <div className="seletor-cor-linha">
            <input type="color" value={corParaInput} aria-label="Escolher no espectro" onChange={(e) => onAlterar(e.target.value.toUpperCase())} />
            <input
              className="seletor-cor-hex"
              value={hexDigitado ?? (semFundo ? '' : valor.toUpperCase())}
              placeholder="#RRGGBB"
              maxLength={7}
              aria-label="Código da cor"
              onChange={(e) => aplicarHexDigitado(e.target.value)}
              onBlur={() => setHexDigitado(null)}
            />
          </div>

          {podePegarCor && (
            <button type="button" className="btn-ghost seletor-cor-acao" onClick={iniciarContaGotas}>
              🖌️ Pegar cor da arte
            </button>
          )}

          {paleta.length > 0 && (
            <>
              <span className="seletor-cor-titulo">{fontePaleta ? 'Cores da foto' : 'Cores da arte'}</span>
              <div className="seletor-cor-paleta">
                {paleta.map((cor) => (
                  <button
                    key={cor}
                    type="button"
                    className={`seletor-cor-swatch${cor === valor.toUpperCase() ? ' is-ativa' : ''}`}
                    style={{ background: cor }}
                    title={cor}
                    aria-label={`Usar ${cor}`}
                    onClick={() => onAlterar(cor)}
                  />
                ))}
              </div>
            </>
          )}

          {permitirSemFundo && (
            <label className="cartaz-checkbox seletor-cor-sem-fundo">
              <input type="checkbox" checked={semFundo} onChange={(e) => {
                  if (e.target.checked) {
                    setCorAntesDoSemFundo(corParaInput);
                    onAlterar(SEM_FUNDO);
                  } else {
                    onAlterar(corAntesDoSemFundo.toUpperCase());
                  }
                }} />
              Sem fundo (só a letra)
            </label>
          )}
        </div>
      )}

      {pegando && (
        <div className="conta-gotas-aviso" role="status">
          🖌️ Toque na arte pra pegar a cor — Esc cancela
        </div>
      )}
    </div>
  );
}
