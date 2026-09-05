import { useEffect, useState, type FormEvent } from 'react';
import { EmojiPicker } from '../components/EmojiPicker';
import { ManagerLayout } from '../components/ManagerLayout';
import { categoriaService } from '../services/categoriaService';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import type { Categoria } from '../types';

/** CRUD simples de categorias de despesa. */
export function ManagerCategoriesPage() {
  useDocumentTitle('Categorias');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nome, setNome] = useState('');
  const [icone, setIcone] = useState('✳️');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [editingIconId, setEditingIconId] = useState<string | null>(null);

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
    setRowError(null);
    await categoriaService.deactivate(id);
    reload();
  }

  async function handleActivate(id: string) {
    setRowError(null);
    await categoriaService.activate(id);
    reload();
  }

  async function handleRemove(categoria: Categoria) {
    if (!confirm(`Excluir definitivamente a categoria "${categoria.nome}"? Essa ação não pode ser desfeita.`)) {
      return;
    }
    setRowError(null);
    try {
      await categoriaService.remove(categoria.id);
      reload();
    } catch (err: any) {
      setRowError({
        id: categoria.id,
        message: err?.response?.data?.message ?? 'Não foi possível excluir a categoria.',
      });
    }
  }

  async function handleChangeIcon(id: string, novoIcone: string) {
    setRowError(null);
    await categoriaService.update(id, { icone: novoIcone });
    setEditingIconId(null);
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
                <th>Ícone</th>
                <th>Categoria</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {categorias.map((cat) => (
                <tr key={cat.id}>
                  <td>
                    {editingIconId === cat.id ? (
                      <EmojiPicker value={cat.icone} onChange={(novoIcone) => handleChangeIcon(cat.id, novoIcone)} />
                    ) : (
                      <button
                        className="btn-ghost"
                        type="button"
                        title="Trocar ícone"
                        onClick={() => setEditingIconId(cat.id)}
                      >
                        {cat.icone}
                      </button>
                    )}
                  </td>
                  <td>{cat.nome}</td>
                  <td>{cat.ativo ? 'Ativa' : 'Inativa'}</td>
                  <td>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      {cat.ativo ? (
                        <button className="btn-ghost" type="button" onClick={() => handleDeactivate(cat.id)}>
                          Inativar
                        </button>
                      ) : (
                        <button className="btn-ghost" type="button" onClick={() => handleActivate(cat.id)}>
                          Ativar
                        </button>
                      )}
                      <button className="btn-ghost" type="button" onClick={() => handleRemove(cat)}>
                        Excluir
                      </button>
                    </div>
                    {rowError?.id === cat.id && (
                      <p className="error-text" style={{ textAlign: 'right', marginTop: 4 }}>
                        {rowError.message}
                      </p>
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
