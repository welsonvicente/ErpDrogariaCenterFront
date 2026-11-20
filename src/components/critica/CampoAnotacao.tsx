import { useState } from 'react';
import { MOTIVOS, textoDaAnotacao, type Anotacao } from '../../utils/critica/anotacoes';

interface Props {
  valor?: Anotacao;
  /** Nome do produto, só para os rótulos de acessibilidade. */
  produto: string;
  onChange: (anotacao: Anotacao) => void;
}

/**
 * Motivo (lista) + observação livre de uma linha. Fechado ocupa uma linha só: um
 * botão "Anotar" (sem anotação) ou o texto já anotado (clicável para editar).
 * Na impressão vira só o texto, pra a anotação sair no papel junto com a conferência.
 */
export function CampoAnotacao({ valor, produto, onChange }: Props) {
  const [aberto, setAberto] = useState(false);
  const atual: Anotacao = valor ?? { motivo: null, texto: '' };
  const texto = textoDaAnotacao(valor);

  return (
    <>
      <div className="crit-anotacao crit-nao-imprimir">
        {aberto ? (
          <div
            className="crit-anotacao-editor"
            // Saiu do editor (clicou fora/tab): volta ao estado compacto — vazio vira "Anotar", preenchido vira o texto resumido.
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setAberto(false);
            }}
          >
            <select value={atual.motivo ?? ''} aria-label={`Motivo — ${produto}`} onChange={(e) => {
                const motivo = e.target.value || null;
                onChange({ ...atual, motivo });
                if (!motivo && !atual.texto.trim()) setAberto(false); // nada anotado: volta ao estado compacto
              }}
            >
              <option value="">Motivo…</option>
              {MOTIVOS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.rotulo}
                </option>
              ))}
            </select>
            <div className="crit-anotacao-linha">
              <input autoFocus value={atual.texto} maxLength={500} placeholder="Observação (opcional)" aria-label={`Observação — ${produto}`} onChange={(e) => onChange({ ...atual, texto: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && setAberto(false)} />
              <button type="button" className="crit-anotacao-ok" onClick={() => setAberto(false)} aria-label="Fechar anotação" title="Fechar">
                ✓
              </button>
            </div>
          </div>
        ) : texto ? (
          <button type="button" className="crit-anotacao-resumo" onClick={() => setAberto(true)} title="Editar anotação" aria-label={`Editar anotação — ${produto}`}>
            📝 {texto}
          </button>
        ) : (
          <button type="button" className="crit-anotacao-abrir" onClick={() => setAberto(true)} aria-label={`Anotar motivo — ${produto}`}>
            📝 Anotar
          </button>
        )}
      </div>
      {texto && <p className="crit-so-impressao crit-anotacao-texto">📝 {texto}</p>}
    </>
  );
}
