import { useEffect, useState, type FormEvent } from 'react';
import { despesaService } from '../services/despesaService';
import { funcionarioService } from '../services/funcionarioService';
import { FORMA_PAGAMENTO_LABEL, type Categoria, type Colega, type Despesa, type FormaPagamento } from '../types';
import { parseValorBr } from '../utils/money';

const FORMAS_PAGAMENTO: FormaPagamento[] = ['DINHEIRO', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'PIX', 'BOLETO', 'OUTRO'];

/** Edição de uma despesa pelo gestor/admin — única tela do sistema que pode alterar um lançamento já feito. */
export function EditDespesaModal({
  despesa,
  categorias,
  onClose,
  onSaved,
}: {
  despesa: Despesa;
  categorias: Categoria[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState(despesa.data);
  const [valor, setValor] = useState(despesa.valor);
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento>(despesa.formaPagamento);
  const [categoriaId, setCategoriaId] = useState(despesa.categoriaId);
  const [descricao, setDescricao] = useState(despesa.descricao ?? '');
  const [beneficiarioId, setBeneficiarioId] = useState(despesa.beneficiarioId ?? '');
  const [colegas, setColegas] = useState<Colega[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const categoriaSelecionada = categorias.find((c) => c.id === categoriaId);
  const precisaBeneficiario = !!categoriaSelecionada?.exigeBeneficiario;

  useEffect(() => {
    funcionarioService.listColegas().then(setColegas);
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const valorNumerico = parseValorBr(String(valor));
    if (!valorNumerico || valorNumerico <= 0) {
      setError('Digite um valor válido (ex: 9,99 ou 1.234,56).');
      return;
    }
    if (precisaBeneficiario && !beneficiarioId) {
      setError('Selecione o colaborador que vai receber o valor.');
      return;
    }
    setError('');
    setSaving(true);
    try {
      await despesaService.update(despesa.id, {
        data,
        valor: valorNumerico,
        formaPagamento,
        categoriaId,
        descricao: descricao || undefined,
        beneficiarioId: precisaBeneficiario ? beneficiarioId : undefined,
      });
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível salvar as alterações.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(23,60,58,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
      }}
      onClick={onClose}
    >
      <div className="card" style={{ padding: 24, width: 380 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>Editar despesa</h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="editData">Data</label>
            <input id="editData" type="date" value={data} onChange={(e) => setData(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="editValor">Valor (R$)</label>
            <input id="editValor" value={valor} onChange={(e) => setValor(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="editCategoria">Categoria</label>
            <select id="editCategoria" value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.icone} {cat.nome}
                </option>
              ))}
            </select>
          </div>
          {precisaBeneficiario && (
            <div className="field">
              <label htmlFor="editBeneficiario">Colaborador que vai receber o valor</label>
              <select id="editBeneficiario" value={beneficiarioId} onChange={(e) => setBeneficiarioId(e.target.value)} required>
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
            <label htmlFor="editFormaPagamento">Forma de pagamento</label>
            <select
              id="editFormaPagamento"
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
            <label htmlFor="editDescricao">Descrição</label>
            <textarea id="editDescricao" rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>
          <p className="error-text">{error}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" style={{ flex: 1 }} type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
