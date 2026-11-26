import { useState, type FormEvent } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router-dom';
import { ManagerLayout } from '../../components/ManagerLayout';
import { EstoqueProvider, useEstoque } from '../../context/EstoqueContext';
import { useResponsaveis } from '../../hooks/useResponsaveis';
import { PeriodoDesconsiderado } from '../../components/estoque/PeriodoDesconsiderado';
import '../../estoque.css';

/**
 * Casca do módulo "Inteligência de Estoque". Os dados são carregados uma vez
 * aqui e ficam em memória enquanto a pessoa navega entre as telas do módulo
 * (o Provider mora acima do <Outlet />, então trocar de tela não recarrega nada).
 */
export function EstoqueLayout() {
  return (
    <ManagerLayout>
      <EstoqueProvider>
        <Conteudo />
      </EstoqueProvider>
    </ManagerLayout>
  );
}

/** Busca global: de qualquer tela do módulo, vai direto à lista de produtos filtrada pelo que foi digitado. */
function BuscaGlobal() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const [texto, setTexto] = useState('');

  function buscar(evento: FormEvent) {
    evento.preventDefault();
    const termo = texto.trim();
    navigate(`/${orgSlug}/gerente/estoque/produtos${termo ? `?q=${encodeURIComponent(termo)}` : ''}`);
  }

  return (
    <form className="est-busca-global est-nao-imprimir" onSubmit={buscar} role="search">
      <input type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="🔎 Buscar produto por nome, código Trier ou código de barras…" aria-label="Busca global de produtos" />
      <button type="submit" className="btn-ghost">
        Buscar
      </button>
    </form>
  );
}

function Conteudo() {
  const { carregando, erro, recarregar } = useEstoque();
  const responsaveis = useResponsaveis();

  if (carregando) return <p className="est-carregando">Carregando dados de estoque…</p>;
  if (erro) {
    return (
      <div className="card est-erro">
        <p className="error-text">{erro}</p>
        <button type="button" className="btn-primary" onClick={() => void recarregar()}>
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Lista única de sugestões de "responsável" usada por todos os campos do módulo (list="est-responsaveis"). */}
      <datalist id="est-responsaveis">
        {responsaveis.map((nome) => (
          <option key={nome} value={nome} />
        ))}
      </datalist>
      <BuscaGlobal />
      <PeriodoDesconsiderado />
      <Outlet />
    </>
  );
}
