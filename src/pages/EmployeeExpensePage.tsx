import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { categoriaService } from '../services/categoriaService';
import { despesaService } from '../services/despesaService';
import type { Categoria } from '../types';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fluxo do funcionário (já autenticado por código+PIN): escolher categoria e lançar o valor gasto. */
export function EmployeeExpensePage() {
  const { usuario, logout } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<Categoria | null>(null);
  const [data, setData] = useState(todayStr());
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!usuario) {
      navigate(`/${orgSlug}/funcionario`);
      return;
    }
    categoriaService.list().then(setCategorias);
  }, [usuario, orgSlug, navigate]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!usuario) return null;

  function handleTrocarFuncionario() {
    logout();
    navigate(`/${orgSlug}/funcionario`);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!categoriaSelecionada) return;
    setError('');
    setSaving(true);
    try {
      await despesaService.create({
        data,
        valor: Number(valor.replace(',', '.')),
        descricao: descricao || undefined,
        categoriaId: categoriaSelecionada.id,
      });
      setToast('Gasto lançado com sucesso!');
      setCategoriaSelecionada(null);
      setValor('');
      setDescricao('');
      setData(todayStr());
    } catch {
      setError('Não foi possível lançar o gasto. Tente novamente.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>
            Olá, {usuario.nome.split(' ')[0]} {usuario.icone}
          </h1>
          <p>Selecione a categoria do gasto</p>
        </div>
        <button className="btn-ghost" onClick={handleTrocarFuncionario}>
          Trocar funcionário
        </button>
      </div>

      {!categoriaSelecionada ? (
        <div className="cat-grid">
          {categorias.map((cat) => (
            <div key={cat.id} className="card cat-card" onClick={() => setCategoriaSelecionada(cat)}>
              <div className="icon-badge">{cat.icone}</div>
              <div className="cname">{cat.nome}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card" style={{ maxWidth: 420, margin: '0 auto', padding: 28 }}>
          <h3 style={{ marginTop: 0, color: 'var(--teal-deep)' }}>
            {categoriaSelecionada.icone} {categoriaSelecionada.nome}
          </h3>
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label htmlFor="data">Data</label>
              <input id="data" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="valor">Valor (R$)</label>
              <input
                id="valor"
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="descricao">Descrição (opcional)</label>
              <textarea
                id="descricao"
                rows={3}
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
              />
            </div>
            <p className="error-text">{error}</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn-ghost" onClick={() => setCategoriaSelecionada(null)}>
                Voltar
              </button>
              <button className="btn-primary" style={{ flex: 1 }} type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Lançar gasto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
