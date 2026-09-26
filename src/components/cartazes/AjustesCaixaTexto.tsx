import type { RefObject } from 'react';
import { FONTES_CARTAZ } from '../../utils/cartazEngine';
import type { FontePaleta } from '../../utils/paletaCores';
import { SeletorCor } from './SeletorCor';

/**
 * Controles da caixa de texto selecionada na prévia do story (nome, oferta
 * ou frases): tamanho, tipo de letra, cor do fundo (com "sem fundo") e cor
 * da letra. Usado pelo Story produto único e pelo editor do story de cada
 * produto do Panfleto — a mesma arte nos dois.
 */
export function AjustesCaixaTexto({
  tamanho,
  tamanhoMinimo,
  tamanhoMaximo,
  onTamanho,
  fonte,
  onFonte,
  corFundo,
  onCorFundo,
  corTexto,
  onCorTexto,
  canvasArte,
  fontePaleta,
}: {
  tamanho: number;
  tamanhoMinimo: number;
  tamanhoMaximo: number;
  onTamanho: (valor: number) => void;
  fonte: string;
  onFonte: (familia: string) => void;
  corFundo: string;
  onCorFundo: (cor: string) => void;
  corTexto: string;
  onCorTexto: (cor: string) => void;
  canvasArte?: RefObject<HTMLCanvasElement | null>;
  fontePaleta?: FontePaleta | null;
}) {
  return (
    <>
      <div className="field-row">
        <div className="field">
          <label>Tamanho {tamanho}px</label>
          <input type="range" min={tamanhoMinimo} max={tamanhoMaximo} value={tamanho} onChange={(e) => onTamanho(Number(e.target.value))} />
        </div>
        <div className="field">
          <label>Tipo de letra</label>
          <select value={fonte} onChange={(e) => onFonte(e.target.value)} style={{ fontFamily: fonte }}>
            {FONTES_CARTAZ.map((opcao) => (
              <option key={opcao.familia} value={opcao.familia} style={{ fontFamily: opcao.familia }}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field-row">
        <SeletorCor rotulo="Fundo" valor={corFundo} onAlterar={onCorFundo} canvasArte={canvasArte} fontePaleta={fontePaleta} permitirSemFundo />
        <SeletorCor rotulo="Letra" valor={corTexto} onAlterar={onCorTexto} canvasArte={canvasArte} fontePaleta={fontePaleta} />
      </div>
    </>
  );
}
