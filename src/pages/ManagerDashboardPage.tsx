import { useEffect, useMemo, useState } from 'react';
import { EditDespesaModal } from '../components/EditDespesaModal';
import { ManagerLayout } from '../components/ManagerLayout';
import { categoriaService } from '../services/categoriaService';
import { despesaService } from '../services/despesaService';
import { funcionarioService } from '../services/funcionarioService';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FORMA_PAGAMENTO_LABEL, type Categoria, type Despesa, type Funcionario, type ListaDespesasResultado, type ResumoDespesas } from '../types';

function currentMonthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { dataInicio: iso(start), dataFim: iso(end) };
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Dashboard principal: filtros de período/funcionário/categoria + estatísticas + tabela de lançamentos. */
export function ManagerDashboardPage() {
  useDocumentTitle('Painel do Gestor');
  const defaultRange = useMemo(currentMonthRange, []);

  const [dataInicio, setDataInicio] = useState(defaultRange.dataInicio);
  const [dataFim, setDataFim] = useState(defaultRange.dataFim);
  const [usuarioId, setUsuarioId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');

  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [result, setResult] = useState<ListaDespesasResultado | null>(null);
  const [summary, setSummary] = useState<ResumoDespesas | null>(null);
  const [loading, setLoading] = useState(false);
  const [exportando, setExportando] = useState<'excel' | 'pdf' | null>(null);
  const [despesaEmEdicao, setDespesaEmEdicao] = useState<Despesa | null>(null);

  const filtros = useMemo(
    () => ({
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      usuarioId: usuarioId || undefined,
      categoriaId: categoriaId || undefined,
    }),
    [dataInicio, dataFim, usuarioId, categoriaId],
  );

  useEffect(() => {
    funcionarioService.list(true).then(setFuncionarios);
    categoriaService.list(true).then(setCategorias);
  }, []);

  function recarregar() {
    setLoading(true);
    Promise.all([despesaService.list(filtros), despesaService.summary(filtros)])
      .then(([list, sum]) => {
        setResult(list);
        setSummary(sum);
      })
      .finally(() => setLoading(false));
  }

  useEffect(recarregar, [filtros]);

  async function handleExportar(formato: 'excel' | 'pdf') {
    setExportando(formato);
    try {
      if (formato === 'excel') {
        await despesaService.exportarExcel(filtros);
      } else {
        await despesaService.exportarPdf(filtros);
      }
    } finally {
      setExportando(null);
    }
  }

  async function handleExcluir(despesa: Despesa) {
    const confirmado = window.confirm(
      `Excluir o gasto de ${fmtMoney(Number(despesa.valor))} (${despesa.categoria.nome})? Essa ação não pode ser desfeita.`,
    );
    if (!confirmado) return;

    await despesaService.remove(despesa.id);
    recarregar();
  }

  return (
    <ManagerLayout>
      <div className="filters-row">
        <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        <span>até</span>
        <input type="date" value={dataFim} onChange={(e) => setDataFim(e.target.value)} />
        <select value={usuarioId} onChange={(e) => setUsuarioId(e.target.value)}>
          <option value="">Todos os funcionários</option>
          {funcionarios.map((f) => (
            <option key={f.id} value={f.id}>
              {f.icone} {f.nome}
            </option>
          ))}
        </select>
        <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
          <option value="">Todas as categorias</option>
          {categorias.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.icone} {cat.nome}
            </option>
          ))}
        </select>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn-ghost" onClick={() => handleExportar('excel')} disabled={exportando !== null}>
            {exportando === 'excel' ? 'Gerando...' : '📊 Excel'}
          </button>
          <button className="btn-ghost" onClick={() => handleExportar('pdf')} disabled={exportando !== null}>
            {exportando === 'pdf' ? 'Gerando...' : '📄 PDF'}
          </button>
        </div>
      </div>

      <div className="stats">
        <div className="card stat">
          <div className="num">{fmtMoney(summary?.valorTotal ?? 0)}</div>
          <div className="label">Total no período</div>
        </div>
        <div className="card stat">
          <div className="num">{result?.total ?? 0}</div>
          <div className="label">Lançamentos</div>
        </div>
        <div className="card stat">
          <div className="num">{summary?.porCategoria.length ?? 0}</div>
          <div className="label">Categorias com gasto</div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
        {loading ? (
          <p>Carregando...</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Funcionário</th>
                <th>Categoria</th>
                <th>Forma de pagamento</th>
                <th>Descrição</th>
                <th>Valor</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {result?.items.map((despesa) => (
                <tr key={despesa.id}>
                  <td>{new Date(despesa.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                  <td>
                    {despesa.usuario.icone} {despesa.usuario.nome}
                  </td>
                  <td>
                    {despesa.categoria.icone} {despesa.categoria.nome}
                  </td>
                  <td>{FORMA_PAGAMENTO_LABEL[despesa.formaPagamento]}</td>
                  <td>{despesa.descricao ?? '—'}</td>
                  <td>{fmtMoney(Number(despesa.valor))}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-ghost" style={{ padding: '4px 10px' }} onClick={() => setDespesaEmEdicao(despesa)}>
                      Editar
                    </button>{' '}
                    <button
                      className="btn-ghost"
                      style={{ padding: '4px 10px', color: 'var(--late)' }}
                      onClick={() => handleExcluir(despesa)}
                    >
                      Excluir
                    </button>
                  </td>
                </tr>
              ))}
              {result && result.items.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {despesaEmEdicao && (
        <EditDespesaModal
          despesa={despesaEmEdicao}
          categorias={categorias}
          onClose={() => setDespesaEmEdicao(null)}
          onSaved={() => {
            setDespesaEmEdicao(null);
            recarregar();
          }}
        />
      )}
    </ManagerLayout>
  );
}
