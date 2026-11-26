import { useEffect, useState, type FormEvent } from 'react';
import { campanhaCartazService, type CampanhaCartaz, type CampanhaCartazResumo } from '../../services/campanhaCartazService';
import { aparenciaParaNovaCampanha } from '../../utils/cartazPersistencia';

interface CampanhasPainelProps {
  /** Campanha aberta agora (destacada na lista) — null na primeira escolha. */
  atualId: string | null;
  onAbrir: (campanha: CampanhaCartaz) => void;
  /** Ausente = não dá pra fechar sem escolher (primeira vez). */
  onFechar?: () => void;
}

function quando(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' às ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Escolher, criar, renomear ou apagar campanhas de Cartazes. Cada campanha tem
 * os seus projetos (fotos, panfleto, planilha) e a sua folha de Cartaz de oferta —
 * abrir uma não mexe nas outras.
 */
export function CampanhasPainel({ atualId, onAbrir, onFechar }: CampanhasPainelProps) {
  const [campanhas, setCampanhas] = useState<CampanhaCartazResumo[] | null>(null);
  const [erro, setErro] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);

  async function carregar() {
    setErro('');
    try {
      setCampanhas(await campanhaCartazService.listar());
    } catch {
      setErro('Não foi possível carregar as campanhas. Confira a conexão e tente de novo.');
      setCampanhas([]);
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  useEffect(() => {
    if (!onFechar) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar(); };
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onFechar]);

  async function abrir(id: string) {
    setOcupado(id);
    try {
      onAbrir(await campanhaCartazService.obter(id));
    } catch {
      setErro('Não foi possível abrir essa campanha. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  async function criar(e: FormEvent) {
    e.preventDefault();
    const nome = novoNome.trim();
    if (!nome) return;
    setOcupado('nova');
    try {
      // Começa com as cores e posições da campanha aberta, mas sem os fundos dela.
      onAbrir(await campanhaCartazService.criar(nome, aparenciaParaNovaCampanha()));
    } catch {
      setErro('Não foi possível criar a campanha. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  async function renomear(c: CampanhaCartazResumo) {
    const nome = window.prompt('Novo nome da campanha:', c.nome)?.trim();
    if (!nome || nome === c.nome) return;
    try {
      await campanhaCartazService.renomear(c.id, nome);
      await carregar();
    } catch {
      setErro('Não foi possível renomear. Tente de novo.');
    }
  }

  async function apagar(c: CampanhaCartazResumo) {
    const total = c.projetos.story + c.projetos.panfleto + c.projetos.planilha;
    const confirmado = window.confirm(
      `Apagar a campanha "${c.nome}"?\n\nIsso apaga de vez ${total} projeto(s) dela — fotos, panfleto, planilha importada e a folha do Cartaz de oferta. As outras campanhas não são afetadas.\n\nNão dá pra desfazer.`,
    );
    if (!confirmado) return;
    setOcupado(c.id);
    try {
      await campanhaCartazService.remover(c.id);
      await carregar();
    } catch {
      setErro('Não foi possível apagar a campanha. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  }

  const conteudo = (
    <section className={`card campanhas-painel${onFechar ? '' : ' campanhas-painel--inicio'}`} role={onFechar ? 'dialog' : undefined} aria-modal={onFechar ? true : undefined} aria-label="Campanhas">
      <div className="campanhas-painel-head">
        <div>
          <h3>📣 Campanhas</h3>
          <p className="footnote" style={{ textAlign: 'left', margin: 0 }}>
            Cada campanha guarda as suas fotos, panfletos, planilha importada, cartaz de oferta e os seus próprios fundos, cores e logo. Mexer numa não muda as outras.
          </p>
        </div>
        {onFechar && <button type="button" className="btn-ghost" onClick={onFechar}>Fechar</button>}
      </div>

      <form className="campanhas-nova" onSubmit={(e) => void criar(e)}>
        <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Nome da nova campanha — ex.: Black Friday semana 2" maxLength={120} aria-label="Nome da nova campanha" />
        <button type="submit" className="btn-primary" disabled={!novoNome.trim() || ocupado !== null}>{ocupado === 'nova' ? 'Criando…' : '+ Criar e abrir'}</button>
      </form>

      {erro && <p className="error-text">{erro}</p>}
      {campanhas === null && <p className="footnote">Carregando campanhas…</p>}
      {campanhas?.length === 0 && !erro && <p className="footnote">Nenhuma campanha ainda — crie a primeira acima.</p>}

      <ul className="campanhas-lista">
        {campanhas?.map((c) => (
          <li key={c.id} className={c.id === atualId ? 'atual' : undefined}>
            <div className="campanhas-info">
              <strong>{c.nome}</strong>
              {c.id === atualId && <span className="campanhas-tag">aberta agora</span>}
              <span className="campanhas-meta">
                📊 {c.projetos.planilha} planilha · 🗞️ {c.projetos.panfleto} panfleto · 📱 {c.projetos.story} story · última atividade {quando(c.ultimaAtividade)}
              </span>
            </div>
            <div className="campanhas-acoes">
              <button type="button" className="btn-primary" disabled={ocupado !== null} onClick={() => (c.id === atualId && onFechar ? onFechar() : void abrir(c.id))}>
                {ocupado === c.id ? 'Abrindo…' : c.id === atualId ? 'Continuar' : 'Abrir'}
              </button>
              <button type="button" className="btn-ghost" disabled={ocupado !== null} onClick={() => void renomear(c)} title="Renomear">✏️</button>
              <button type="button" className="btn-ghost campanhas-apagar" disabled={ocupado !== null || c.id === atualId} onClick={() => void apagar(c)} title={c.id === atualId ? 'Troque de campanha antes de apagar esta' : 'Apagar campanha'}>🗑️</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );

  if (!onFechar) return conteudo;
  return (
    <div className="guia-fundos-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      {conteudo}
    </div>
  );
}
