import { BrandLogo } from '../components/BrandLogo';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import { categoriaService } from '../services/categoriaService';
import { despesaService } from '../services/despesaService';
import { funcionarioService } from '../services/funcionarioService';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { FORMA_PAGAMENTO_LABEL, type Categoria, type Colega, type Despesa, type FormaPagamento } from '../types';
import { parseValorBr } from '../utils/money';

/** Nome exato da categoria que exige escolher quem recebe o valor — precisa bater com o seed (categoriasPadrao.ts). */
const CATEGORIA_DIARIA_NOME = 'Diária de domingo ou feriado';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtMoney(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * A ferramenta de Cartazes é uma página HTML estática (fora do bundle do
 * React — ver public/tools/cartazes.html), não uma rota do app. Ela recebe
 * a URL da API já resolvida via query string, porque um arquivo estático
 * não tem acesso a VITE_API_URL (isso só existe em módulos que passam pelo
 * build do Vite). É ferramenta de funcionário (balcão), por isso mora aqui
 * e não no hub do gestor.
 */
function urlFerramentaCartazes(): string {
  return `/tools/cartazes.html?api=${encodeURIComponent(api.defaults.baseURL ?? '')}`;
}

/**
 * Ferramenta de Folgas (banco de folgas por domingo/feriado trabalhado,
 * atestados e escala) — mesmo esquema da de Cartazes: página estática fora
 * do bundle, recebe a URL da API por query string. Tem papel de gestor
 * ("Administração", com senha própria) e de funcionário (código de acesso
 * próprio da ferramenta), por isso o link mora aqui e é usável por ambos.
 */
function urlFerramentaFolgas(): string {
  return `/tools/folgas-drogaria-center.html?api=${encodeURIComponent(api.defaults.baseURL ?? '')}`;
}

const FORMAS_PAGAMENTO: FormaPagamento[] = ['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX', 'BOLETO', 'OUTRO'];

/** Fluxo do funcionário (já autenticado por código+PIN): escolher categoria e lançar o valor gasto, ou ver o que já lançou. */
export function EmployeeExpensePage() {
  const { usuario, logout } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [aba, setAba] = useState<'lancar' | 'meus'>('lancar');
  useDocumentTitle(aba === 'lancar' ? 'Lançar gasto' : 'Meus lançamentos');

  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<Categoria | null>(null);
  const [data, setData] = useState(todayStr());
  const [valor, setValor] = useState('');
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>('DINHEIRO');
  const [descricao, setDescricao] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const [colegas, setColegas] = useState<Colega[]>([]);
  const [beneficiarioId, setBeneficiarioId] = useState('');
  const precisaBeneficiario = categoriaSelecionada?.nome === CATEGORIA_DIARIA_NOME;

  const [meusLancamentos, setMeusLancamentos] = useState<Despesa[]>([]);
  const [carregandoMeus, setCarregandoMeus] = useState(false);

  useEffect(() => {
    if (!usuario) {
      navigate(`/${orgSlug}/funcionario`);
      return;
    }
    categoriaService.list().then(setCategorias);
    funcionarioService.listColegas().then(setColegas);
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

  function handleEscolherCategoria(cat: Categoria) {
    setError('');
    setBeneficiarioId('');
    setCategoriaSelecionada(cat);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!categoriaSelecionada) return;
    if (precisaBeneficiario && !beneficiarioId) {
      setError('Selecione o colaborador que vai receber a diária.');
      return;
    }
    const valorNumerico = parseValorBr(valor);
    if (!valorNumerico || valorNumerico <= 0) {
      setError('Digite um valor válido (ex: 9,99 ou 1.234,56).');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await despesaService.create({
        data,
        valor: valorNumerico,
        formaPagamento,
        descricao: descricao || undefined,
        categoriaId: categoriaSelecionada.id,
        beneficiarioId: precisaBeneficiario ? beneficiarioId : undefined,
      });
      setToast('Gasto lançado com sucesso!');
      setCategoriaSelecionada(null);
      setValor('');
      setFormaPagamento('DINHEIRO');
      setDescricao('');
      setBeneficiarioId('');
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
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn-ghost" href={urlFerramentaCartazes()} target="_blank" rel="noopener noreferrer">
            🖼️ Cartazes e panfletos
          </a>
          <a className="btn-ghost" href={urlFerramentaFolgas()} target="_blank" rel="noopener noreferrer">
            📅 Folgas
          </a>
          {usuario.podeAcessarGestor && (
            <Link className="btn-ghost" to={`/${orgSlug}/gestor/login`}>
              🔐 Painel do Gestor — Gastos
            </Link>
          )}
          <button className="btn-ghost" onClick={handleTrocarFuncionario}>
            Trocar funcionário
          </button>
        </div>
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
                onClick={() => handleEscolherCategoria(cat)}
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
              {precisaBeneficiario && (
                <div className="field">
                  <label htmlFor="beneficiario">Colaborador que vai receber a diária</label>
                  <select
                    id="beneficiario"
                    value={beneficiarioId}
                    onChange={(e) => setBeneficiarioId(e.target.value)}
                    required
                  >
                    <option value="">Selecione...</option>
                    {colegas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.icone} {c.nome}
                      </option>
                    ))}
                  </select>
                </div>
              )}
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
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => {
                    setCategoriaSelecionada(null);
                    setBeneficiarioId('');
                  }}
                >
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
                  <th>Horário</th>
                  <th>Categoria</th>
                  <th>Recebeu</th>
                  <th>Forma de pagamento</th>
                  <th>Descrição</th>
                  <th>Valor</th>
                </tr>
              </thead>
              <tbody>
                {meusLancamentos.map((despesa) => (
                  <tr key={despesa.id}>
                    <td>{new Date(despesa.data + 'T00:00:00').toLocaleDateString('pt-BR')}</td>
                    <td>{fmtHora(despesa.criadoEm)}</td>
                    <td>
                      {despesa.categoria.icone} {despesa.categoria.nome}
                    </td>
                    <td>{despesa.beneficiario ? `${despesa.beneficiario.icone} ${despesa.beneficiario.nome}` : '—'}</td>
                    <td>{FORMA_PAGAMENTO_LABEL[despesa.formaPagamento]}</td>
                    <td>{despesa.descricao ?? '—'}</td>
                    <td>{fmtMoney(Number(despesa.valor))}</td>
                  </tr>
                ))}
                {meusLancamentos.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: 'var(--ink-soft)' }}>
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
