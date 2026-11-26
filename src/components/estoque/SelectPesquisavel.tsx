import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';

const semAcento = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

interface Props {
  rotulo: string;
  opcoes: string[];
  /** '' = "Todos". */
  valor: string;
  onChange: (valor: string) => void;
  rotuloTodos?: string;
}

/**
 * Lista com busca (ex.: Fornecedor com centenas de nomes): digita parte do nome e a
 * lista filtra na hora, sem ligar pra maiúscula/acento. Setas + Enter escolhem; Esc fecha.
 */
export function SelectPesquisavel({ rotulo, opcoes, valor, onChange, rotuloTodos = 'Todos' }: Props) {
  const id = useId();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');
  const [destaque, setDestaque] = useState(0);
  const caixaRef = useRef<HTMLDivElement>(null);
  const listaRef = useRef<HTMLUListElement>(null);

  const filtradas = useMemo(() => {
    const termo = semAcento(texto.trim());
    return termo ? opcoes.filter((o) => semAcento(o).includes(termo)) : opcoes;
  }, [opcoes, texto]);
  // Primeira linha é sempre "Todos".
  const linhas = useMemo(() => ['', ...filtradas], [filtradas]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixaRef.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  useEffect(() => {
    listaRef.current?.children[destaque]?.scrollIntoView({ block: 'nearest' });
  }, [destaque]);

  function escolher(v: string) {
    onChange(v);
    setAberto(false);
    setTexto('');
  }

  function aoTeclar(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setAberto(true);
      setDestaque((d) => Math.min(linhas.length - 1, d + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setDestaque((d) => Math.max(0, d - 1));
    } else if (e.key === 'Enter' && aberto) {
      e.preventDefault();
      escolher(linhas[destaque] ?? '');
    } else if (e.key === 'Escape') {
      setAberto(false);
      setTexto('');
    }
  }

  return (
    <div className="field est-select-pesquisavel" ref={caixaRef}>
      <span id={`${id}-rotulo`}>{rotulo}</span>
      <div className="est-sp-caixa">
        <input
          type="text"
          role="combobox"
          aria-labelledby={`${id}-rotulo`}
          aria-expanded={aberto}
          aria-controls={`${id}-lista`}
          aria-autocomplete="list"
          value={aberto ? texto : valor || rotuloTodos}
          placeholder={aberto ? `🔎 Pesquisar ${rotulo.toLowerCase()}…` : undefined}
          onFocus={() => {
            setAberto(true);
            setTexto('');
            setDestaque(0);
          }}
          onChange={(e) => {
            setTexto(e.target.value);
            setAberto(true);
            setDestaque(0);
          }}
          onKeyDown={aoTeclar}
          className={valor ? 'tem-valor' : undefined}
        />
        {valor && !aberto && (
          <button type="button" className="est-sp-limpar" aria-label={`Limpar ${rotulo}`} onClick={() => onChange('')}>
            ×
          </button>
        )}
        {aberto && (
          <ul id={`${id}-lista`} role="listbox" className="est-sp-lista" ref={listaRef}>
            {linhas.map((o, i) => (
              <li
                key={o || '__todos'}
                role="option"
                aria-selected={o === valor}
                className={`${i === destaque ? 'destaque' : ''}${o === valor ? ' escolhido' : ''}${o === '' ? ' todos' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  escolher(o);
                }}
                onMouseEnter={() => setDestaque(i)}
              >
                {o || rotuloTodos}
              </li>
            ))}
            {filtradas.length === 0 && <li className="vazio">Nenhum resultado para “{texto}”</li>}
          </ul>
        )}
      </div>
    </div>
  );
}
