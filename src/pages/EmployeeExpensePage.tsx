import { BrandLogo } from '../components/BrandLogo';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { categoriaService } from '../services/categoriaService';
import { despesaService } from '../services/despesaService';
import { FORMA_PAGAMENTO_LABEL, type Categoria, type Despesa, type FormaPagamento } from '../types';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const FORMAS_PAGAMENTO: FormaPagamento[] = ['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX', 'BOLETO', 'OUTRO'];

/** Fluxo do funcionário (já autenticado por código+PIN): escolher categoria e lançar o valor gasto, ou ver o que já lançou. */
export function EmployeeExpensePage() {
  const { usuario, logout } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [aba, setAba] = useState<'lancar' | 'meus'>('lancar');

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<Categoria | null>(null);
  const [data, setData] = useState(todayStr());
  const [valor, setValor] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('DINHEIRO');
  const [descricao, setDescricao] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [meusLancamentos, setMeusLancamentos] = useState<Despesa[]>([]);
  const [carregandoMeus, setCarregandoMeus] = useState(false);

  useEffect(() => {
    if (!usuario) {
      navigate(`/${orgSlug}/funcionario`);
      return;
    }
    categoriaService.list().then(setCategorias);
  }, [usuario, orgSlug, navigate]);

  useEffect(() => {
    if (!usuario || aba !== 'meus') return;
    setCarregandoMeus(true);
    despesaService
      .listMinhas({ pageSize: 100 })
      .then((res) => setMeusLancamentos(res.items))
      .finally(() => setCarregandoMeus(false));
  }, [usuario, aba]);

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
        formaPagamento,
        descricao: descricao || undefined,
        categoriaId: categoriaSelecionada.id,
      });
      setToast('Gasto lançado com sucesso!');
      setCategoriaSelecionada(null);
      setValor('');
      setFormaPagamento('DINHEIRO');
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
      <div className="brand-header"><BrandLogo /></div>
      <div className="page-header">
        <div>
          <h1>
            Olá, {usuario.nome.split(' ')[0]} {usuario.icone}
          </h1>
          <p>{aba === 'lancar' ? 'Selecione a categoria do gasto' : 'Gastos que você já lançou'}</p>
        </div>
        <button className="btn-ghost" onClick={handleTrocarFuncionario}>
          Trocar funcionário
        </button>
      </div>

      <div className="nav-tabs">
        <a
          href="#lancar"
          className={aba === 'lancar' ? 'active' : ''}
          onClick={(e) => {
            e.preventDefault();
            setAba('lancar');
          }}
        >
          Lançar gasto
        </a>
        <a
          href="#meus"
          className={aba === 'meus' ? 'active' : ''}
          onClick={(e) => {
            e.preventDefault();
            setAba('meus');
          }}
        >
          Meus lançamentos
        </a>
      </div>

      {aba === 'lancar' &&
        (!categoriaSelecionada ? (
          <div className="cat-grid">
            {categorias.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className="card cat-card"
                onClick={() => setCategoriaSelecionada(cat)}
              >
                <div className="icon-badge">{cat.icone}</div>
                <div className="cname">{cat.nome}</div>
              </button>
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
                <label htmlFor="formaPagamento">Forma de pagamento</label>
                <select
                  id="formaPagamento"
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value as FormaPagamento)}
                >
                  {FORMAS_PAGAMENTO.map((fp) => (
                    <option key={fp} value={fp}>
                      {FORMA_PAGAMENTO_LABEL[fp]}
                    </option>
                  ))}
                </select>
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
        ))}

      {aba === 'meus' && (
        <div className="card" style={{ padding: 20, overflowX: 'auto' }}>
          {carregandoMeus ? (
            <p>Carregando...</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Categoria</th>
                  <th>Forma de pagamento</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {meusLancamentos.map((despesa) => (
                  <tr key={despesa.id}>
                    <td>{new Date(despesa.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>
                      {despesa.categoria.icone} {despesa.categoria.nome}
                    </td>
                    <td>{FORMA_PAGAMENTO_LABEL[despesa.formaPagamento]}</td>
                    <td>{despesa.descricao ?? '—'}</td>
                    <td>{fmtMoney(Number(despesa.valor))}</td>
                  </tr>
                ))}
                {meusLancamentos.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
                      Você ainda não lançou nenhum gasto.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: 14, marginBottom: 0 }}>
            Só o gestor pode editar ou excluir um lançamento.
          </p>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
