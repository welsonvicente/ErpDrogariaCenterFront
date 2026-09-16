import { useState, type FormEvent } from 'react';
import { perfilService } from '../services/perfilService';

/** Espelha o piso do backend (backend/src/constants/credenciais.ts). */
const PIN_MIN = 6;

/**
 * Primeiro acesso ao Painel do Gerente: a pessoa escolhe aqui o PIN que passa a
 * valer pro login dela.
 *
 * Existe em vez de um PIN padrão. O PIN de balcão foi escolhido pra "lançar um
 * gasto em meu nome" — às vezes pelo próprio gerente que cadastrou a pessoa — e
 * agora a mesma credencial abriria o financeiro inteiro. Um PIN padrão seria
 * pior: credencial de fábrica que todo mundo conhece. Então ninguém além dela
 * escolhe, e nem o gerente fica sabendo.
 *
 * Pede o PIN atual porque o terminal do balcão é compartilhado: sem isso, quem
 * pegasse a sessão aberta de um colega escolheria um PIN novo e levaria embora
 * o acesso ao painel dele.
 */
export function DefinirPinGestorModal({ onClose, onDefinido }: { onClose: () => void; onDefinido: () => void }) {
  const [pinAtual, setPinAtual] = useState('');
  const [novoPin, setNovoPin] = useState('');
  const [confirmarPin, setConfirmarPin] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');

    if (novoPin.length < PIN_MIN) {
      setError(`O novo PIN precisa ter ao menos ${PIN_MIN} dígitos.`);
      return;
    }
    if (novoPin !== confirmarPin) {
      setError('A confirmação não bate com o novo PIN.');
      return;
    }

    setSaving(true);
    try {
      await perfilService.definirPinGestor(pinAtual, novoPin);
      onDefinido();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Não foi possível definir o PIN.');
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
        <h3 style={{ marginTop: 0 }}>🔐 Defina seu PIN do Painel do Gerente</h3>

        <p style={{ fontSize: 13, color: 'var(--ink-soft)', marginTop: 0 }}>
          Você recebeu acesso ao Painel do Gerente. Como esse acesso abre todas as despesas e a gestão da equipe, escolha
          agora um PIN de ao menos {PIN_MIN} dígitos — só seu, que ninguém mais precisa saber. Ele passa a ser o PIN que
          você usa pra entrar.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="pinAtualGestor">Seu PIN atual</label>
            <input
              id="pinAtualGestor"
              type="password"
              inputMode="numeric"
              value={pinAtual}
              onChange={(e) => setPinAtual(e.target.value.replace(/\D/g, ''))}
              autoFocus
              required
            />
          </div>
          <div className="field">
            <label htmlFor="novoPinGestorSelf">Novo PIN ({PIN_MIN}+ dígitos)</label>
            <input
              id="novoPinGestorSelf"
              type="password"
              inputMode="numeric"
              minLength={PIN_MIN}
              maxLength={8}
              value={novoPin}
              onChange={(e) => setNovoPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="confirmarPinGestorSelf">Confirmar novo PIN</label>
            <input
              id="confirmarPinGestorSelf"
              type="password"
              inputMode="numeric"
              minLength={PIN_MIN}
              maxLength={8}
              value={confirmarPin}
              onChange={(e) => setConfirmarPin(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
          <p className="error-text">{error}</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn-ghost" onClick={onClose}>
              Agora não
            </button>
            <button className="btn-primary" style={{ flex: 1 }} type="submit" disabled={saving}>
              {saving ? 'Salvando...' : 'Definir e entrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
