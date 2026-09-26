import { useEffect, useState } from 'react';
import { projetoCartazService, type ProjetoCartazCompleto, type ProjetoCartazResumo, type TipoProjetoCartaz } from '../../services/projetoCartazService';

const RECOMENDACOES_NOME: Record<TipoProjetoCartaz, string> = {
  story: 'Story',
  panfleto: 'Panfleto',
  planilha: 'Lote de fotos',
};

function nomeSugerido(tipo: TipoProjetoCartaz) {
  return `${RECOMENDACOES_NOME[tipo]} de ${new Date().toLocaleDateString('pt-BR')}`;
}

/**
 * Lista/cria/renomeia/apaga projetos de Cartazes — substitui o antigo
 * "rascunho implícito" que só existia em `localStorage` (um por modo, sem
 * nome, perdido ao trocar de aparelho). Compartilhado por Story, Panfleto e
 * Importar planilha; o `tipo` decide quais projetos aparecem na lista.
 *
 * Sempre mostrado como um painel cheio (não um modal pequeno): é a primeira
 * coisa que a pessoa vê ao entrar num modo sem projeto ativo, então precisa
 * ter espaço pra explicar o que é "projeto" pra quem nunca usou.
 */
export function ProjetosCartazPainel({
  tipo,
  onAbrirProjeto,
  onFechar,
}: {
  tipo: TipoProjetoCartaz;
  onAbrirProjeto: (projeto: ProjetoCartazCompleto) => void;
  /** Ausente = não dá pra fechar sem escolher um projeto (primeira abertura da tela). */
  onFechar?: () => void;
}) {
  const [projetos, setProjetos] = useState<ProjetoCartazResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [mostrarFormularioNovo, setMostrarFormularioNovo] = useState(false);
  const [nomeNovo, setNomeNovo] = useState(nomeSugerido(tipo));
  const [criando, setCriando] = useState(false);
  const [abrindoId, setAbrindoId] = useState<string | null>(null);
  const [renomeandoId, setRenomeandoId] = useState<string | null>(null);
  const [nomeRenomear, setNomeRenomear] = useState('');
  const [removendoId, setRemovendoId] = useState<string | null>(null);

  async function recarregar() {
    setCarregando(true);
    setErro('');
    try {
      const lista = await projetoCartazService.listar(tipo);
      setProjetos(lista);
      // Sem nenhum projeto ainda, criar é a única ação possível — abre o
      // formulário direto em vez de obrigar a pessoa a clicar em "+ Novo".
      if (lista.length === 0) setMostrarFormularioNovo(true);
    } catch {
      setErro('Não foi possível carregar seus projetos. Verifique a conexão e tente de novo.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo]);

  async function handleCriar() {
    const nome = nomeNovo.trim();
    if (!nome) {
      setErro('Dê um nome ao projeto antes de criar.');
      return;
    }
    setCriando(true);
    setErro('');
    try {
      const projeto = await projetoCartazService.criar(tipo, nome);
      // Projeto recém-criado nunca tem arquivo nenhum ainda — evita um GET extra só pra confirmar isso.
      onAbrirProjeto({ ...projeto, arquivos: [] });
    } catch {
      setErro('Não foi possível criar o projeto. Tente de novo.');
    } finally {
      setCriando(false);
    }
  }

  async function handleAbrir(id: string) {
    setAbrindoId(id);
    setErro('');
    try {
      const projeto = await projetoCartazService.obter(id);
      onAbrirProjeto(projeto);
    } catch {
      setErro('Não foi possível abrir esse projeto. Tente de novo.');
    } finally {
      setAbrindoId(null);
    }
  }

  async function handleRenomear(id: string) {
    const nome = nomeRenomear.trim();
    if (!nome) return;
    try {
      await projetoCartazService.atualizar(id, { nome });
      setRenomeandoId(null);
      recarregar();
    } catch {
      setErro('Não foi possível renomear esse projeto. Tente de novo.');
    }
  }

  async function handleRemover(projeto: ProjetoCartazResumo) {
    if (!window.confirm(`Excluir "${projeto.nome}"? Isso apaga também todas as fotos desse projeto. Não tem como desfazer.`)) return;
    setRemovendoId(projeto.id);
    try {
      await projetoCartazService.remover(projeto.id);
      setProjetos((atual) => atual.filter((p) => p.id !== projeto.id));
    } catch {
      setErro('Não foi possível excluir esse projeto. Tente de novo.');
    } finally {
      setRemovendoId(null);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,36,34,0.92)', zIndex: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 640, maxHeight: '92vh', overflowY: 'auto', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h3 style={{ margin: 0 }}>Projetos — {RECOMENDACOES_NOME[tipo]}</h3>
          {onFechar && (
            <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={onFechar}>
              Fechar
            </button>
          )}
        </div>
        <p className="footnote" style={{ textAlign: 'left', margin: '0 0 16px' }}>
          Seus projetos ficam salvos no servidor — continue de onde parou em qualquer computador ou celular logado
          nesta organização.
        </p>

        {erro && (
          <p className="footnote" style={{ textAlign: 'left', color: '#c0392b', marginBottom: 12 }}>
            {erro}
          </p>
        )}

        {carregando && <p className="footnote">Carregando projetos…</p>}

        {!carregando && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: mostrarFormularioNovo ? 16 : 0 }}>
              {projetos.map((projeto) => (
                <div key={projeto.id} className="batch-row" style={{ padding: '10px 12px' }}>
                  <div className="binfo">
                    {renomeandoId === projeto.id ? (
                      <div style={{ display: 'flex', gap: 6 }}>
                        <input
                          autoFocus
                          value={nomeRenomear}
                          onChange={(e) => setNomeRenomear(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleRenomear(projeto.id)}
                        />
                        <button type="button" className="btn-primary" style={{ width: 'auto', margin: 0 }} onClick={() => handleRenomear(projeto.id)}>
                          Salvar
                        </button>
                        <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={() => setRenomeandoId(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="bname">{projeto.nome}</div>
                        <div className="bprice">
                          Atualizado em {new Date(projeto.atualizadoEm).toLocaleString('pt-BR')}
                          {projeto.criadoPor ? ` · por ${projeto.criadoPor.nome}` : ''}
                        </div>
                      </>
                    )}
                  </div>
                  {renomeandoId !== projeto.id && (
                    <div className="bactions">
                      <button type="button" onClick={() => handleAbrir(projeto.id)} disabled={abrindoId !== null}>
                        {abrindoId === projeto.id ? 'Abrindo…' : '📂 Abrir'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRenomeandoId(projeto.id);
                          setNomeRenomear(projeto.nome);
                        }}
                      >
                        ✏️ Renomear
                      </button>
                      <button type="button" className="del" onClick={() => handleRemover(projeto)} disabled={removendoId === projeto.id}>
                        {removendoId === projeto.id ? 'Excluindo…' : 'Excluir'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {projetos.length === 0 && !mostrarFormularioNovo && <p className="footnote">Nenhum projeto ainda.</p>}
            </div>

            {!mostrarFormularioNovo ? (
              <button type="button" className="btn-ghost" style={{ width: '100%' }} onClick={() => setMostrarFormularioNovo(true)}>
                + Novo projeto
              </button>
            ) : (
              <div className="field-row" style={{ margin: 0, alignItems: 'flex-end' }}>
                <div className="field" style={{ flex: 2, margin: 0 }}>
                  <label>Nome do novo projeto</label>
                  <input
                    autoFocus
                    value={nomeNovo}
                    onChange={(e) => setNomeNovo(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCriar()}
                    placeholder="Ex: Ofertas de sexta"
                  />
                </div>
                <div className="field" style={{ margin: 0 }}>
                  <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={handleCriar} disabled={criando}>
                    {criando ? 'Criando…' : '+ Criar'}
                  </button>
                </div>
                {projetos.length > 0 && (
                  <div className="field" style={{ margin: 0 }}>
                    <button type="button" className="btn-ghost" style={{ width: 'auto' }} onClick={() => setMostrarFormularioNovo(false)}>
                      Cancelar
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
