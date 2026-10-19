import { useState, type FormEvent } from 'react';

/**
 * Nome do produto com um ✏️ pra editar a descrição na própria linha. Quem usa
 * grava no dicionário da farmácia (ver `salvarDescricaoProduto`), então a
 * descrição editada vale no Panfleto, no Tablet e no Importar planilha.
 */
export function NomeProdutoEditavel({ nome, className, onSalvar }: { nome: string; className: string; onSalvar: (novo: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(nome);

  function abrir() {
    setTexto(nome);
    setEditando(true);
  }

  function salvar(e: FormEvent) {
    e.preventDefault();
    const limpo = texto.replace(/\s+/g, ' ').trim();
    if (limpo && limpo !== nome) onSalvar(limpo);
    setEditando(false);
  }

  if (!editando) {
    return (
      <div className={`${className} nome-produto-editavel`}>
        <span>{nome}</span>
        <button type="button" className="nome-produto-editar" title="Editar descrição (vale no panfleto, no tablet e no importar)" aria-label={`Editar descrição de ${nome}`} onClick={abrir}>
          ✏️
        </button>
      </div>
    );
  }

  return (
    <form className="nome-produto-form" onSubmit={salvar}>
      <input
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setEditando(false)}
        aria-label="Descrição do produto"
        maxLength={120}
        autoFocus
      />
      <button type="submit" className="btn-primary">Salvar</button>
      <button type="button" className="btn-ghost" onClick={() => setEditando(false)}>Cancelar</button>
    </form>
  );
}
