import { useEffect, useMemo, useState } from 'react';
import { ManagerLayout } from '../components/ManagerLayout';
import { categoriaService } from '../services/categoriaService';
import { despesaService } from '../services/despesaService';
import { funcionarioService } from '../services/funcionarioService';
import type { Categoria, Funcionario, ListaDespesasResultado, ResumoDespesas } from '../types';

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

  useEffect(() => {
    funcionarioService.list(true).then(setFuncionarios);
    categoriaService.list(true).then(setCategorias);
  }, []);

  useEffect(() => {
    const filtros = {
      dataInicio: dataInicio || undefined,
      dataFim: dataFim || undefined,
      usuarioId: usuarioId || undefined,
      categoriaId: categoriaId || undefined,
    };

    setLoading(true);
    Promise.all([despesaService.list(filtros), despesaService.summary(filtros)])
      .then(([list, sum]) => {
        setResult(list);
        setSummary(sum);
      })
      .finally(() => setLoading(false));
  }, [dataInicio, dataFim, usuarioId, categoriaId]);

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
                <th>Descrição</th>
                <th>Valor</th>
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
                  <td>{despesa.descricao ?? '—'}</td>
                  <td>{fmtMoney(Number(despesa.valor))}</td>
                </tr>
              ))}
              {result && result.items.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </ManagerLayout>
  );
}
