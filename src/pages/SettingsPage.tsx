import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { organizacaoService } from '../services/organizacaoService';
import { perfilService } from '../services/perfilService';

/** Configurações: meus dados, troca de senha e dados da organização (tudo gestor-only). */
export function SettingsPage() {
  const { usuario, atualizarUsuarioLocal } = useAuth();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  // --- Meus dados ---
  const [nome, setNome] = useState(usuario?.nome ?? '');
  const [email, setEmail] = useState(usuario?.email ?? '');
  const [perfilError, setPerfilError] = useState('');
  const [perfilMsg, setPerfilMsg] = useState('');
  const [savingPerfil, setSavingPerfil] = useState(false);

  // --- Troca de senha ---
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [senhaError, setSenhaError] = useState('');
  const [senhaMsg, setSenhaMsg] = useState('');
  const [savingSenha, setSavingSenha] = useState(false);

  // --- Dados da organização ---
  const [orgNome, setOrgNome] = useState('');
  const [orgError, setOrgError] = useState('');
  const [orgMsg, setOrgMsg] = useState('');
  const [savingOrg, setSavingOrg] = useState(false);

  useEffect(() => {
    organizacaoService.getAtual().then((org) => setOrgNome(org.nome));
  }, []);

  async function handleSalvarPerfil(event: FormEvent) {
    event.preventDefault();
    setPerfilError('');
    setPerfilMsg('');
    setSavingPerfil(true);
    try {
      const atualizado = await perfilService.atualizar({ nome, email: email || undefined });
      atualizarUsuarioLocal({ nome: atualizado.nome, email: atualizado.email });
      setPerfilMsg('Dados atualizados.');
    } catch (err: any) {
      setPerfilError(err?.response?.data?.message ?? 'Não foi possível atualizar seus dados.');
    } finally {
      setSavingPerfil(false);
    }
  }

  async function handleTrocarSenha(event: FormEvent) {
    event.preventDefault();
    setSenhaError('');
    setSenhaMsg('');

    if (novaSenha !== confirmarSenha) {
      setSenhaError('A confirmação não bate com a nova senha.');
      return;
    }

    setSavingSenha(true);
    try {
      await perfilService.alterarSenha(senhaAtual, novaSenha);
      setSenhaMsg('Senha alterada com sucesso.');
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmarSenha('');
    } catch (err: any) {
      setSenhaError(err?.response?.data?.message ?? 'Não foi possível trocar a senha.');
    } finally {
      setSavingSenha(false);
    }
  }

  async function handleSalvarOrg(event: FormEvent) {
    event.preventDefault();
    setOrgError('');
    setOrgMsg('');
    setSavingOrg(true);
    try {
      await organizacaoService.atualizar(orgNome);
      setOrgMsg('Dados da organização atualizados.');
    } catch (err: any) {
      setOrgError(err?.response?.data?.message ?? 'Não foi possível atualizar a organização.');
    } finally {
      setSavingOrg(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <button
            style={{ border: 'none', background: 'none', color: 'var(--ink-soft)', fontSize: 12.5, fontWeight: 600, padding: 0, marginBottom: 4, cursor: 'pointer' }}
            onClick={() => navigate(`/${orgSlug}/ferramentas`)}
          >
            ← Ferramentas
          </button>
          <h1>Configurações</h1>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20 }}>
        <form className="card" style={{ padding: 20 }} onSubmit={handleSalvarPerfil}>
          <h3 style={{ marginTop: 0 }}>Meus dados</h3>
          <div className="field">
            <label htmlFor="nome">Nome</label>
            <input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <p className="error-text">{perfilError}</p>
          {perfilMsg && <p style={{ color: 'var(--ok)', fontSize: 13, fontWeight: 600 }}>{perfilMsg}</p>}
          <button className="btn-primary" type="submit" disabled={savingPerfil}>
            {savingPerfil ? 'Salvando...' : 'Salvar'}
          </button>
        </form>

        <form className="card" style={{ padding: 20 }} onSubmit={handleTrocarSenha}>
          <h3 style={{ marginTop: 0 }}>Trocar senha</h3>
          <div className="field">
            <label htmlFor="senhaAtual">Senha atual</label>
            <input
              id="senhaAtual"
              type="password"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="novaSenha">Nova senha</label>
            <input
              id="novaSenha"
              type="password"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="confirmarSenha">Confirmar nova senha</label>
            <input
              id="confirmarSenha"
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              minLength={8}
              required
            />
          </div>
          <p className="error-text">{senhaError}</p>
          {senhaMsg && <p style={{ color: 'var(--ok)', fontSize: 13, fontWeight: 600 }}>{senhaMsg}</p>}
          <button className="btn-primary" type="submit" disabled={savingSenha}>
            {savingSenha ? 'Salvando...' : 'Trocar senha'}
          </button>
        </form>

        <form className="card" style={{ padding: 20 }} onSubmit={handleSalvarOrg}>
          <h3 style={{ marginTop: 0 }}>Dados da organização</h3>
          <div className="field">
            <label htmlFor="orgNome">Nome da empresa</label>
            <input id="orgNome" value={orgNome} onChange={(e) => setOrgNome(e.target.value)} required />
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', marginTop: -8, marginBottom: 14 }}>
            O endereço da organização (<strong>/{orgSlug}</strong>) não pode ser alterado por aqui.
          </p>
          <p className="error-text">{orgError}</p>
          {orgMsg && <p style={{ color: 'var(--ok)', fontSize: 13, fontWeight: 600 }}>{orgMsg}</p>}
          <button className="btn-primary" type="submit" disabled={savingOrg}>
            {savingOrg ? 'Salvando...' : 'Salvar'}
          </button>
        </form>
      </div>
    </div>
  );
}
