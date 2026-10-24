import { useState, type FormEvent } from 'react';
import { perfilService } from '../services/perfilService';

/** Espelha o backend (backend/src/constants/credenciais.ts). */
const PIN_MIN = 4;
const PIN_MIN_GESTOR = 6;
const PIN_MAX = 8;

/**
 * O próprio funcionário troca o PIN do login (código + PIN) — só ele fica
 * sabendo o novo, diferente do "Redefinir PIN" da gerência. Pede o PIN atual
 * porque o terminal do balcão é compartilhado: sem isso, quem pegasse a sessão
 * aberta de um colega trocaria o PIN dele.
 */
export function TrocarPinModal({ ehGestao, onClose, onTrocado }: { ehGestao: boolean; onClose: () => void; onTrocado: () => void }) {
  const minimo = ehGestao ? PIN_MIN_GESTOR : PIN_MIN;
  const [pinAtual, setPinAtual] = useState('');
  const [novoPin, setNovoPin] = useState('');
  const [confirmarPin, setConfirmarPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (novoPin.length < minimo) return setError(`O novo PIN precisa ter ao menos ${minimo} dígitos.`);
    if (novoPin !== confirmarPin) return setError('A confirmação não bate com o novo PIN.');
    if (novoPin === pinAtual) return setError('O novo PIN precisa ser diferente do atual.');

    setSaving(true);
    try {
      await perfilService.trocarPin(pinAtual, novoPin);
      onTrocado();
    } catch (err: unknown) {
      const resposta = (err as { response?: { data?: { message?: string } } }).response;
      setError(resposta?.data?.message ?? 'Não foi possível trocar o PIN. Confira a conexão e tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  const soNumeros = (texto: string) => texto.replace(/\D/g, '').slice(0, PIN_MAX);

  return (
    <div className="modal-pin-overlay" onClick={onClose}>
      <div className="card modal-pin" role="dialog" aria-modal="true" aria-label="Trocar meu PIN" onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginTop: 0 }}>🔑 Trocar meu PIN</h3>
        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
          Escolha um PIN de {minimo} a {PIN_MAX} números. Só você vai saber — a gerência não vê. Se esquecer, peça pra gerência
          redefinir.
        </p>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="trocarPinAtual">PIN atual</label>
            <input id="trocarPinAtual" type="password" inputMode="numeric" autoComplete="current-password" value={pinAtual} onChange={(e) => setPinAtual(soNumeros(e.target.value))} autoFocus required />
          </div>
          <div className="field">
            <label htmlFor="trocarPinNovo">Novo PIN</label>
            <input id="trocarPinNovo" type="password" inputMode="numeric" autoComplete="new-password" value={novoPin} onChange={(e) => setNovoPin(soNumeros(e.target.value))} required />
          </div>
          <div className="field">
            <label htmlFor="trocarPinConfirmar">Confirmar novo PIN</label>
            <input id="trocarPinConfirmar" type="password" inputMode="numeric" autoComplete="new-password" value={confirmarPin} onChange={(e) => setConfirmarPin(soNumeros(e.target.value))} required />
          </div>
          <p className="error-text" role="alert">{error}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancelar
            </button>
            <button className="btn-primary" style={{ flex: 1 }} type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Trocar PIN'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
