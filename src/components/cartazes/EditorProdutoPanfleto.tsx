import { useEffect, useRef, useState, type FormEvent } from 'react';
import { fmtMoney } from '../../utils/cartazEngine';

/** "9,99" / "1.234,50" / "9.99" → "9.99" (formato guardado no produto). Vazio continua vazio. */
export function normalizarPrecoDigitado(texto: string): string {
  const limpo = texto.trim().replace(/[^\d,.]/g, '');
  if (!limpo) return '';
  const comPonto = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  const numero = Number(comPonto);
  return Number.isFinite(numero) ? String(numero) : '';
}

/** "9.99" → "9,99" pra mostrar no campo. */
function paraCampo(valor: string) {
  return valor ? fmtMoney(valor).replace(/\./g, '') : '';
}

export interface EdicaoProdutoPanfleto {
  nome: string;
  de: string;
  por: string;
}

/**
 * Editor rápido de um produto do panfleto — descrição, preço "De" e "Por" —
 * aberto pelo ✏️ da lista ou com duplo clique no card da prévia.
 */
export function EditorProdutoPanfleto({
  inicial,
  onSalvar,
  onCancelar,
}: {
  inicial: EdicaoProdutoPanfleto;
  onSalvar: (edicao: EdicaoProdutoPanfleto) => void;
  onCancelar: () => void;
}) {
  const [nome, setNome] = useState(inicial.nome);
  const [de, setDe] = useState(paraCampo(inicial.de));
  const [por, setPor] = useState(paraCampo(inicial.por));
  const [erro, setErro] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // Aberto pelo duplo clique na prévia, o produto pode estar fora da área visível da lista.
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  function salvar(e: FormEvent) {
    e.preventDefault();
    const nomeLimpo = nome.replace(/\s+/g, ' ').trim();
    const porNormalizado = normalizarPrecoDigitado(por);
    if (!nomeLimpo) return setErro('Digite a descrição do produto.');
    if (!porNormalizado || Number(porNormalizado) <= 0) return setErro('Digite o preço da oferta (Por).');
    onSalvar({ nome: nomeLimpo, de: normalizarPrecoDigitado(de), por: porNormalizado });
  }

  return (
    <form ref={formRef} className="editor-produto-panfleto" onSubmit={salvar} onKeyDown={(e) => e.key === 'Escape' && onCancelar()}>
      <div className="field">
        <label>Descrição</label>
        <input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} autoFocus aria-label="Descrição do produto" />
      </div>
      <div className="field-row">
        <div className="field">
          <label>De (R$)</label>
          <input value={de} onChange={(e) => setDe(e.target.value)} inputMode="decimal" placeholder="opcional" aria-label="Preço De" />
        </div>
        <div className="field">
          <label>Por (R$)</label>
          <input value={por} onChange={(e) => setPor(e.target.value)} inputMode="decimal" aria-label="Preço Por" />
        </div>
      </div>
      {erro && <p className="error-text" role="alert">{erro}</p>}
      <div className="editor-produto-acoes">
        <button type="button" className="btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button type="submit" className="btn-primary">Salvar</button>
      </div>
    </form>
  );
}
