import { useEffect, useState, type FormEvent } from 'react';
import { EmojiPicker } from '../components/EmojiPicker';
import { ManagerLayout } from '../components/ManagerLayout';
import { ResetPinModal } from '../components/ResetPinModal';
import { funcionarioService } from '../services/funcionarioService';
import type { Funcionario } from '../types';

/** CRUD de funcionários: nome, código de acesso e PIN (login rápido no balcão). */
export function ManagerFuncionariosPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');
  const [pin, setPin] = useState('');
  const [icone, setIcone] = useState('🙂');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [funcionarioParaRedefinirPin, setFuncionarioParaRedefinirPin] = useState<Funcionario | null>(null);
  const [toast, setToast] = useState('');
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [editingIconId, setEditingIconId] = useState<string | null>(null);
  const [editingNomeId, setEditingNomeId] = useState<string | null>(null);
  const [nomeEmEdicao, setNomeEmEdicao] = useState('');

  function reload() {
    funcionarioService.list(true).then(setFuncionarios);
  }

  useEffect(reload, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await funcionarioService.create({ nome, codigo, pin, icone });
      setNome('');
      setCodigo('');
      setPin('');
      setIcone('🙂');
      reload();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível salvar o funcionário.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    setRowError(null);
    await funcionarioService.deactivate(id);
    reload();
  }

  async function handleActivate(id: string) {
    setRowError(null);
    await funcionarioService.activate(id);
    reload();
  }

  async function handleRemove(funcionario: Funcionario) {
    if (!confirm(`Excluir definitivamente o funcionário "${funcionario.nome}"? Essa ação não pode ser desfeita.`)) {
      return;
    }
    setRowError(null);
    try {
      await funcionarioService.remove(funcionario.id);
      reload();
    } catch (err: any) {
      setRowError({
        id: funcionario.id,
        message: err?.response?.data?.message ?? 'Não foi possível excluir o funcionário.',
      });
    }
  }

  async function handleChangeIcon(id: string, novoIcone: string) {
    setRowError(null);
    await funcionarioService.update(id, { icone: novoIcone });
    setEditingIconId(null);
    reload();
  }

  function startEditNome(funcionario: Funcionario) {
    setRowError(null);
    setEditingNomeId(funcionario.id);
    setNomeEmEdicao(funcionario.nome);
  }

  async function handleSaveNome(id: string) {
    setRowError(null);
    const novoNome = nomeEmEdicao.trim();
    if (novoNome.length < 2) {
      setRowError({ id, message: 'Nome deve ter ao menos 2 caracteres.' });
      return;
    }
    try {
      await funcionarioService.update(id, { nome: novoNome });
      setEditingNomeId(null);
      reload();
    } catch (err: any) {
      setRowError({ id, message: err?.response?.data?.message ?? 'Não foi possível salvar o nome.' });
    }
  }

  return (
    <ManagerLayout>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        <form className="card" style={{ padding: 20 }} onSubmit={handleSubmit}>
          <h3 style={{ marginTop: 0 }}>Novo funcionário</h3>
          <div className="field">
            <label htmlFor="nome">Nome</label>
            <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="codigo">Código de acesso</label>
            <input id="codigo" value={codigo} onChange={(e) => setCodigo(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="pin">PIN (login rápido)</label>
            <input
              id="pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              minLength={4}
              required
            />
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
                <th>Funcionário</th>
                <th>Código</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {funcionarios.map((f) => (
                <tr key={f.id}>
                  <td>
                    {editingIconId === f.id ? (
                      <EmojiPicker value={f.icone} onChange={(novoIcone) => handleChangeIcon(f.id, novoIcone)} />
                    ) : (
                      <button
                        className="btn-ghost"
                        type="button"
                        title="Trocar ícone"
                        onClick={() => setEditingIconId(f.id)}
                      >
                        {f.icone}
                      </button>
                    )}
                  </td>
                  <td>
                    {editingNomeId === f.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          autoFocus
                          value={nomeEmEdicao}
                          onChange={(e) => setNomeEmEdicao(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveNome(f.id);
                            if (e.key === 'Escape') setEditingNomeId(null);
                          }}
                          style={{ maxWidth: 160 }}
                        />
                        <button className="btn-ghost" type="button" onClick={() => handleSaveNome(f.id)}>
                          Salvar
                        </button>
                        <button className="btn-ghost" type="button" onClick={() => setEditingNomeId(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button className="btn-ghost" type="button" title="Editar nome" onClick={() => startEditNome(f)}>
                        {f.nome}
                      </button>
                    )}
                  </td>
                  <td>{f.codigo}</td>
                  <td>{f.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn-ghost" type="button" onClick={() => setFuncionarioParaRedefinirPin(f)}>
                        Redefinir PIN
                      </button>
                      {f.ativo ? (
                        <button className="btn-ghost" type="button" onClick={() => handleDeactivate(f.id)}>
                          Inativar
                        </button>
                      ) : (
                        <button className="btn-ghost" type="button" onClick={() => handleActivate(f.id)}>
                          Ativar
                        </button>
                      )}
                      <button className="btn-ghost" type="button" onClick={() => handleRemove(f)}>
                        Excluir
                      </button>
                    </div>
                    {rowError?.id === f.id && (
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

      {funcionarioParaRedefinirPin && (
        <ResetPinModal
          funcionario={funcionarioParaRedefinirPin}
          onClose={() => setFuncionarioParaRedefinirPin(null)}
          onSaved={() => {
            setFuncionarioParaRedefinirPin(null);
            setToast('PIN redefinido com sucesso.');
          }}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </ManagerLayout>
  );
}
