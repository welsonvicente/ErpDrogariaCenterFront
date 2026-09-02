import { useEffect, useState, type FormEvent } from 'react';
import { EmojiPicker } from '../components/EmojiPicker';
import { ManagerLayout } from '../components/ManagerLayout';
import { categoriaService } from '../services/categoriaService';
import type { Categoria } from '../types';

/** CRUD simples de categorias de despesa. */
export function ManagerCategoriesPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nome, setNome] = useState('');
  const [icone, setIcone] = useState('✳️');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function reload() {
    categoriaService.list(true).then(setCategorias);
  }

  useEffect(reload, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await categoriaService.create({ nome, icone, ordem: categorias.length });
      setNome('');
      setIcone('✳️');
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível salvar a categoria.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    await categoriaService.deactivate(id);
    reload();
  }

  return (
    <ManagerLayout>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        <form className="card" style={{ padding: 20 }} onSubmit={handleSubmit}>
          <h3 style={{ marginTop: 0 }}>Nova categoria</h3>
          <div className="field">
            <label htmlFor="nome">Nome</label>
            <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="icone">Ícone</label>
            <EmojiPicker id="icone" value={icone} onChange={setIcone} />
          </div>
          <p className="error-text">{error}</p>
          <button className="btn-primary" style={{ width: '100%' }} type="submit" disabled={saving}>
            {saving ? 'Salvando...' : 'Adicionar'}
          </button>
        </form>

        <div className="card" style={{ padding: 20 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    {cat.icone} {cat.nome}
                  </td>
                  <td>{cat.ativo ? 'Ativa' : 'Inativa'}</td>
                  <td>
                    {cat.ativo && (
                      <button className="btn-ghost" onClick={() => handleDeactivate(cat.id)}>
                        Inativar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </ManagerLayout>
  );
}
