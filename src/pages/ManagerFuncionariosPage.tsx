import { useEffect, useState, type FormEvent } from 'react';
import { EmojiPicker } from '../components/EmojiPicker';
import { ManagerLayout } from '../components/ManagerLayout';
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

  function reload() {
    funcionarioService.list(true).then(setFuncionarios);
  }

  useEffect(reload, []);

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
    await funcionarioService.deactivate(id);
    reload();
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
              onChange={(e) => setPin(e.target.value)}
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
                    {f.icone} {f.nome}
                  </td>
                  <td>{f.codigo}</td>
                  <td>{f.ativo ? 'Ativo' : 'Inativo'}</td>
                  <td>
                    {f.ativo && (
                      <button className="btn-ghost" onClick={() => handleDeactivate(f.id)}>
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
