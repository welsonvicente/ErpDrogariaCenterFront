import { useState } from 'react';
import { useEstoque } from '../../context/EstoqueContext';
import { mensagemDeErro } from '../../services/estoqueService';

const dataBr = (iso: string) => iso.split('-').reverse().join('/');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * "Desconsiderar entradas de … até …": produtos cuja última entrada caiu no período
 * (ex.: outubro e novembro) ficam fora de todo o módulo. Fica na configuração do estoque
 * (no servidor), então vale pra toda a equipe até alguém mudar.
 */
export function PeriodoDesconsiderado() {
  const { config, salvarConfig, desconsiderados, hoje, avisar } = useEstoque();
  const periodo = config.desconsiderarEntradas ?? null;
  const ativo = Boolean(periodo && (periodo.de || periodo.ate));
  const [editando, setEditando] = useState(false);
  const [de, setDe] = useState(periodo?.de ?? '');
  const [ate, setAte] = useState(periodo?.ate ?? '');
  const [salvando, setSalvando] = useState(false);

  function abrir() {
    setDe(periodo?.de ?? '');
    setAte(periodo?.ate ?? '');
    setEditando(true);
  }

  /** Atalho: os últimos N meses (o mês atual e os anteriores), até hoje. */
  function ultimosMeses(n: number) {
    setDe(iso(new Date(hoje.getFullYear(), hoje.getMonth() - (n - 1), 1)));
    setAte('');
  }

  async function salvar(novo: { de: string | null; ate: string | null } | null) {
    if (novo?.de && novo.ate && novo.de > novo.ate) return avisar('A data inicial não pode ser depois da final.');
    setSalvando(true);
    try {
      await salvarConfig({ ...config, desconsiderarEntradas: novo && (novo.de || novo.ate) ? novo : null });
      setEditando(false);
      avisar(novo && (novo.de || novo.ate) ? 'Período desconsiderado salvo — as telas já foram recalculadas.' : 'Voltou a considerar todos os produtos.');
    } catch (e) {
      avisar(mensagemDeErro(e, 'Não foi possível salvar o período.'));
    } finally {
      setSalvando(false);
    }
  }

  const descricao = periodo
    ? periodo.de && periodo.ate
      ? `de ${dataBr(periodo.de)} a ${dataBr(periodo.ate)}`
      : periodo.de
        ? `a partir de ${dataBr(periodo.de)}`
        : `até ${dataBr(periodo.ate!)}`
    : '';

  if (!editando) {
    return (
      <div className={`est-periodo${ativo ? ' ativo' : ''}`}>
        {ativo ? (
          <span>
            📅 Desconsiderando <b>{desconsiderados.length} produto(s)</b> com última entrada <b>{descricao}</b> — não aparecem em nenhuma tela nem nos totais.
          </span>
        ) : (
          <span>📅 Considerando todos os produtos do relatório.</span>
        )}
        <div className="est-periodo-acoes">
          <button type="button" className="btn-ghost" onClick={abrir}>{ativo ? 'Alterar período' : 'Desconsiderar entradas por período'}</button>
          {ativo && <button type="button" className="btn-ghost" disabled={salvando} onClick={() => void salvar(null)}>Considerar todos</button>}
        </div>
      </div>
    );
  }

  return (
    <form className="est-periodo editando" onSubmit={(e) => { e.preventDefault(); void salvar({ de: de || null, ate: ate || null }); }}>
      <span><b>Desconsiderar produtos com última entrada</b></span>
      <label>
        de <input type="date" value={de} max={ate || undefined} onChange={(e) => setDe(e.target.value)} />
      </label>
      <label>
        até <input type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} /> <small>(vazio = até hoje)</small>
      </label>
      <div className="est-periodo-atalhos">
        <button type="button" className="btn-ghost" onClick={() => ultimosMeses(1)}>Este mês</button>
        <button type="button" className="btn-ghost" onClick={() => ultimosMeses(2)}>Últimos 2 meses</button>
        <button type="button" className="btn-ghost" onClick={() => ultimosMeses(3)}>Últimos 3 meses</button>
      </div>
      <div className="est-periodo-acoes">
        <button type="submit" className="btn-primary" disabled={salvando || (!de && !ate)}>{salvando ? 'Salvando…' : 'Aplicar'}</button>
        <button type="button" className="btn-ghost" disabled={salvando} onClick={() => setEditando(false)}>Cancelar</button>
      </div>
    </form>
  );
}
