import { useState, type FormEvent } from 'react';
import { funcionarioService } from '../services/funcionarioService';
import type { Funcionario } from '../types';

/**
 * Redefinição de PIN pelo gestor — diferente da troca de senha em
 * "Configurações" (que exige a senha atual), aqui o gestor define um PIN
 * novo direto, sem precisar saber o antigo. Cobre o caso de funcionário que
 * esqueceu o PIN.
 */
export function ResetPinModal({
  funcionario,
  onClose,
  onSaved,
}: {
  funcionario: Funcionario;
  onClose: () => void;
  onSaved: (novoPin: string) => void;
}) {
  const [novoPin, setNovoPin] = useState('');
  const [confirmarPin, setConfirmarPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (novoPin !== confirmarPin) {
      setError('A confirmação não bate com o novo PIN.');
      return;
    }

    setSaving(true);
    try {
      await funcionarioService.update(funcionario.id, { pin: novoPin });
      onSaved(novoPin);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível redefinir o PIN.');
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
      <div className="card" style={{ padding: 24, width: 340 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>
          Redefinir PIN — {funcionario.icone} {funcionario.nome}
        </h3>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="novoPin">Novo PIN</label>
            <input
              id="novoPin"
              type="password"
              inputMode="numeric"
              minLength={4}
              value={novoPin}
              onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="confirmarPin">Confirmar novo PIN</label>
            <input
              id="confirmarPin"
              type="password"
              inputMode="numeric"
              minLength={4}
              value={confirmarPin}
              onChange={(e) => setConfirmarPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <p className="error-text">{error}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" style={{ flex: 1 }} type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Redefinir'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
