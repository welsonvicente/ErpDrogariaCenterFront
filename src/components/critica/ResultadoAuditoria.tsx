import { useMemo, useState } from 'react';
import { somarImpacto, type Auditoria, type Decisao, type Decisoes, type LinhaAuditoria, type Resultado, type Veredito } from '../../utils/critica/auditoria';
import { EMOJI_RESULTADO, ROTULO_RESULTADO } from '../../utils/critica/exportar';
import { secaoAuditoria, secaoAusentes, secaoDistribuidoras, secaoExtras, secaoFinanceiro, secaoProvidencias, type Formato, type SecaoRel } from '../../utils/critica/relatorio';
import type { ItemTrier } from '../../utils/critica/tipos';
import type { Anotacao, Anotacoes } from '../../utils/critica/anotacoes';
import { CampoAnotacao } from './CampoAnotacao';
import { MenuBaixar } from './MenuBaixar';
import { fmtInteiro, fmtMoeda, fmtPercentual, fmtQuantidade } from '../../utils/estoqueFormat';

const TRACO = '—';
const sinal = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '');
const moedaComSinal = (v: number | null) => (v === null ? TRACO : `${sinal(v)}${fmtMoeda(Math.abs(v))}`);
const qtd = (v: number | null) => (v === null ? TRACO : fmtQuantidade(v));
const moeda = (v: number | null) => (v === null ? TRACO : fmtMoeda(v));

const VEREDITO: Record<Veredito, { titulo: string; emoji: string; classe: string }> = {
  APROVADO: { titulo: 'APROVADO', emoji: '✅', classe: 'crit-veredito-ok' },
  APROVADO_COM_RESSALVAS: { titulo: 'APROVADO COM RESSALVAS', emoji: '⚠️', classe: 'crit-veredito-aviso' },
  REPROVADO: { titulo: 'REPROVADO / COM DIVERGÊNCIAS', emoji: '⛔', classe: 'crit-veredito-erro' },
};

const ORDEM_FILTRO: Resultado[] = ['DIVERGENCIA', 'AUSENTE', 'NAO_CONFIRMADO', 'ATENCAO', 'EXTRA', 'OK'];

interface Props {
  auditoria: Auditoria;
  decisoes: Decisoes;
  onDecisao: (grupoId: number, decisao: Decisao | null) => void;
  /** Motivo/observação anotados por linha (chave = `chave` da linha da auditoria). */
  anotacoes: Anotacoes;
  onAnotar: (chave: string, anotacao: Anotacao) => void;
  /** Baixa um bloco da tela (a tabela de um filtro, o financeiro, uma lista ou as providências) no formato escolhido. */
  aoBaixar: (secao: SecaoRel, formato: Formato) => Promise<void>;
}

type IdSecao = 'financeiro' | 'distribuidoras' | 'ausentes' | 'extras' | 'providencias';
const IDS_SECAO: IdSecao[] = ['financeiro', 'distribuidoras', 'ausentes', 'extras', 'providencias'];
/** Lista com mais linhas que isto começa minimizada. */
const LISTA_LONGA = 15;

/** "▾ Minimizar" / "▸ Expandir" do título de uma seção. */
function BotaoMinimizar({ minimizada, onAlternar, alvo }: { minimizada: boolean; onAlternar: () => void; alvo: string }) {
  return (
    <button type="button" className="btn-ghost crit-minimizar" onClick={onAlternar} aria-expanded={!minimizada} aria-controls={alvo}>
      {minimizada ? '▸ Expandir' : '▾ Minimizar'}
    </button>
  );
}

const idDoGrupo = (l: LinhaAuditoria) => (l.chave.startsWith('c') ? Number(l.chave.slice(1)) : null);
const rotuloTrier = (t: ItemTrier) => `${t.codigo} · ${t.produto} · ${fmtQuantidade(t.qtd)} un × ${fmtMoeda(t.unitario)}`;

export function ResultadoAuditoria({ auditoria, decisoes, onDecisao, anotacoes, onAnotar, aoBaixar }: Props) {
  const [filtro, setFiltro] = useState<Resultado | 'TODOS'>('TODOS');
  const [distribuidora, setDistribuidora] = useState<string | null>(null);
  const [escolhas, setEscolhas] = useState<Partial<Record<IdSecao, boolean>>>({});
  const { financeiro: f, veredito, linhas, distribuidoras } = auditoria;
  const v = VEREDITO[veredito];
  const comDistribuidora = distribuidoras.length > 0;
  // Se a crítica trocou e a distribuidora escolhida não existe mais, volta a mostrar todas.
  const filtroDistribuidora = distribuidora && distribuidoras.some((d) => d.nome === distribuidora) ? distribuidora : null;
  const daDistribuidora = useMemo(() => (filtroDistribuidora ? linhas.filter((l) => l.distribuidoras.includes(filtroDistribuidora)) : linhas), [linhas, filtroDistribuidora]);
  // As abas contam só o que é da distribuidora escolhida, pra os números baterem com a tabela.
  const contagemAbas = useMemo(() => {
    const c: Record<Resultado, number> = { OK: 0, ATENCAO: 0, DIVERGENCIA: 0, EXTRA: 0, AUSENTE: 0, NAO_CONFIRMADO: 0 };
    for (const l of daDistribuidora) c[l.resultado] += 1;
    return c;
  }, [daDistribuidora]);
  // Se a aba escolhida ficou vazia ao trocar de distribuidora, volta para "Todos".
  const filtroAtivo: Resultado | 'TODOS' = filtro !== 'TODOS' && contagemAbas[filtro] === 0 ? 'TODOS' : filtro;
  const visiveis = useMemo(() => (filtroAtivo === 'TODOS' ? daDistribuidora : daDistribuidora.filter((l) => l.resultado === filtroAtivo)), [daDistribuidora, filtroAtivo]);
  const nomeDaLista = filtroAtivo === 'TODOS' ? 'todos os itens' : `os itens: ${ROTULO_RESULTADO[filtroAtivo].toLowerCase()}`;
  const impactoVisiveis = useMemo(() => somarImpacto(visiveis), [visiveis]);
  const impacto = auditoria.impactoDivergencias;
  const ausentes = linhas.filter((l) => l.resultado === 'AUSENTE');
  const extras = linhas.filter((l) => l.resultado === 'EXTRA');

  // Seções que a pessoa pode minimizar. Sem escolha dela, as listas longas já começam minimizadas.
  const padraoMinimizada: Record<IdSecao, boolean> = {
    financeiro: false,
    distribuidoras: false,
    ausentes: ausentes.length > LISTA_LONGA,
    extras: extras.length > LISTA_LONGA,
    providencias: auditoria.providencias.length > LISTA_LONGA,
  };
  const minimizada = (id: IdSecao) => escolhas[id] ?? padraoMinimizada[id];
  const alternar = (id: IdSecao) => setEscolhas((e) => ({ ...e, [id]: !(e[id] ?? padraoMinimizada[id]) }));
  const definirTodas = (minimizar: boolean) => setEscolhas(Object.fromEntries(IDS_SECAO.map((id) => [id, minimizar])) as Record<IdSecao, boolean>);
  const provMinimizadas = minimizada('providencias');

  return (
    <>
      <section className={`crit-veredito ${v.classe}`} role="status">
        <span className="crit-veredito-emoji">{v.emoji}</span>
        <div>
          <strong>{v.titulo}</strong>
          <p>{auditoria.justificativa}</p>
        </div>
      </section>

      <section className="card crit-impacto" aria-label="Impacto das divergências">
        <div className="crit-impacto-principal">
          <span className="crit-impacto-rotulo">Impacto das divergências</span>
          <strong className={`crit-impacto-valor ${impacto.saldo > 0 ? 'mais' : impacto.saldo < 0 ? 'menos' : ''}`}>{moedaComSinal(impacto.saldo)}</strong>
          <small>{impacto.itens === 0 ? 'Nenhum item em divergência com diferença de valor.' : `saldo de ${fmtInteiro(impacto.itens)} item(ns) em divergência`}</small>
        </div>
        <div className="crit-impacto-parte">
          <span className="crit-impacto-rotulo">Trier acima do pedido</span>
          <strong className="crit-impacto-valor mais">{moedaComSinal(impacto.positivo)}</strong>
          <small>preço ou quantidade a mais</small>
        </div>
        <div className="crit-impacto-parte">
          <span className="crit-impacto-rotulo">Trier abaixo do pedido</span>
          <strong className="crit-impacto-valor menos">{moedaComSinal(impacto.negativo)}</strong>
          <small>preço ou quantidade a menos</small>
        </div>
      </section>

      <div className="crit-secoes-barra crit-nao-imprimir">
        <span>Seções</span>
        <button type="button" className="btn-ghost crit-minimizar" onClick={() => definirTodas(true)}>
          ▴ Recolher tudo
        </button>
        <button type="button" className="btn-ghost crit-minimizar" onClick={() => definirTodas(false)}>
          ▾ Expandir tudo
        </button>
      </div>

      {auditoria.avisosDosDocumentos.length > 0 && (
        <div className="est-alerta est-alerta-aviso">
          {auditoria.avisosDosDocumentos.map((a) => (
            <p key={a} style={{ margin: '2px 0' }}>
              ⚠️ {a}
            </p>
          ))}
        </div>
      )}

      <section className="card crit-painel">
        <div className="crit-titulo-secao">
          <h2>Conferência financeira</h2>
          <span className="crit-nao-imprimir crit-titulo-acoes">
            <BotaoMinimizar minimizada={minimizada('financeiro')} onAlternar={() => alternar('financeiro')} alvo="crit-bloco-financeiro" />
            <MenuBaixar oque="a conferência financeira" aoBaixar={(f) => aoBaixar(secaoFinanceiro(auditoria), f)} />
          </span>
        </div>
        {minimizada('financeiro') && (
          <p className="est-dica crit-nao-imprimir crit-prov-resumo">
            Diferença (Trier − pedido): <strong>{moedaComSinal(f.diferencaTotal)}</strong> · Parte não explicada: <strong>{Math.abs(f.naoExplicada) <= 0.011 ? '✓ nenhuma' : moedaComSinal(f.naoExplicada)}</strong>
          </p>
        )}
        <div id="crit-bloco-financeiro" className={`crit-financeiro ${minimizada('financeiro') ? 'crit-recolhida-bloco' : ''}`}>
          <div className="crit-fin-bloco">
            <h3>Totais dos documentos</h3>
            <dl>
              <div>
                <dt>Pedido no CotaPreço (impresso)</dt>
                <dd>{moeda(f.totalCotaDeclarado)}</dd>
              </div>
              <div>
                <dt>Pedido no CotaPreço (soma dos itens)</dt>
                <dd>{fmtMoeda(f.totalCotaItens)}</dd>
              </div>
              <div>
                <dt>Registrado no Trier (bruto)</dt>
                <dd>{fmtMoeda(f.totalTrierBruto)}</dd>
              </div>
              <div>
                <dt>Registrado no Trier (líquido)</dt>
                <dd>
                  {fmtMoeda(f.totalTrierLiquido)}
                  {f.totalTrierLiquidoImpresso !== null && <small> (impresso: {fmtMoeda(f.totalTrierLiquidoImpresso)})</small>}
                </dd>
              </div>
              <div className="crit-fin-total">
                <dt>Diferença (Trier bruto − pedido)</dt>
                <dd>{moedaComSinal(f.diferencaTotal)}</dd>
              </div>
            </dl>
          </div>

          <div className="crit-fin-bloco">
            <h3>De onde vem a diferença</h3>
            <dl>
              <div>
                <dt>Produtos correspondentes (pedido → Trier)</dt>
                <dd>
                  {fmtMoeda(f.correspondentesCota)} → {fmtMoeda(f.correspondentesTrier)}
                </dd>
              </div>
              <div>
                <dt>Diferença de preço</dt>
                <dd>{moedaComSinal(f.efeitoPreco)}</dd>
              </div>
              <div>
                <dt>Diferença de quantidade</dt>
                <dd>{moedaComSinal(f.efeitoQuantidade)}</dd>
              </div>
              <div>
                <dt>Arredondamento do unitário no Trier</dt>
                <dd>{moedaComSinal(f.arredondamentoUnitario)}</dd>
              </div>
              <div>
                <dt>Produtos extras no Trier</dt>
                <dd>{moedaComSinal(f.extrasTrier)}</dd>
              </div>
              <div>
                <dt>Produtos ausentes no Trier (pedidos)</dt>
                <dd>{moedaComSinal(-f.ausentesCota)}</dd>
              </div>
              <div>
                <dt>Não confirmados (Trier − pedido)</dt>
                <dd>{moedaComSinal(f.naoConfirmadosTrier - f.naoConfirmadosCota)}</dd>
              </div>
              <div className="crit-fin-total">
                <dt>Parte não explicada</dt>
                <dd>{Math.abs(f.naoExplicada) <= 0.011 ? '✓ nenhuma' : moedaComSinal(f.naoExplicada)}</dd>
              </div>
            </dl>
            <p className="est-dica">
              Descontos/rateio no Trier (bruto − líquido): <strong>{moedaComSinal(f.descontosEArredondamentos)}</strong>. Os totais globais só são comparáveis depois de separar o que é produto diferente — por isso as parcelas acima.
            </p>
          </div>
        </div>
      </section>

      {comDistribuidora && (
        <section className="card crit-painel">
          <div className="crit-titulo-secao">
            <h2>Por distribuidora ({distribuidoras.length})</h2>
            <span className="crit-nao-imprimir crit-titulo-acoes">
              <BotaoMinimizar minimizada={minimizada('distribuidoras')} onAlternar={() => alternar('distribuidoras')} alvo="crit-bloco-distribuidoras" />
              <MenuBaixar oque="o resumo por distribuidora" aoBaixar={(fmt) => aoBaixar(secaoDistribuidoras(auditoria), fmt)} />
            </span>
          </div>
          {minimizada('distribuidoras') && (
            <p className="est-dica crit-nao-imprimir crit-prov-resumo">
              {distribuidoras.length} distribuidoras · {fmtMoeda(distribuidoras.reduce((soma, d) => soma + d.totalPedido, 0))} em pedidos
            </p>
          )}
          <div id="crit-bloco-distribuidoras" className={`crit-tabela-rolagem ${minimizada('distribuidoras') ? 'crit-recolhida-bloco' : ''}`}>
            <table className="data-table crit-tabela">
              <thead>
                <tr>
                  <th>Distribuidora</th>
                  <th>Pedido</th>
                  <th className="crit-dir">Itens</th>
                  <th className="crit-dir">Total do pedido</th>
                  <th className="crit-dir">Diverg.</th>
                  <th className="crit-dir">Ausentes</th>
                  <th className="crit-dir">A confirmar</th>
                  <th className="crit-dir">Atenção</th>
                  <th className="crit-dir">OK</th>
                  <th className="crit-dir">Impacto das divergências</th>
                </tr>
              </thead>
              <tbody>
                {distribuidoras.map((d) => (
                  <tr key={d.nome} className={filtroDistribuidora === d.nome ? 'crit-linha-aberta' : ''}>
                    <td>
                      <button type="button" className="crit-link crit-nao-imprimir" onClick={() => setDistribuidora(filtroDistribuidora === d.nome ? null : d.nome)} title="Filtrar a tabela por esta distribuidora">
                        🏭 {d.nome}
                      </button>
                      <strong className="crit-so-impressao">{d.nome}</strong>
                      {d.representante && <small className="crit-sub">{d.representante}</small>}
                    </td>
                    <td className="crit-sub-linha">{d.pedidos.join(', ') || TRACO}</td>
                    <td className="crit-dir">{fmtInteiro(d.itens)}</td>
                    <td className="crit-dir">{fmtMoeda(d.totalPedido)}</td>
                    <td className={`crit-dir ${d.contagens.DIVERGENCIA ? 'crit-forte' : ''}`}>{d.contagens.DIVERGENCIA}</td>
                    <td className="crit-dir">{d.contagens.AUSENTE}</td>
                    <td className="crit-dir">{d.contagens.NAO_CONFIRMADO}</td>
                    <td className="crit-dir">{d.contagens.ATENCAO}</td>
                    <td className="crit-dir">{d.contagens.OK}</td>
                    <td className={`crit-dir crit-valor-${d.impactoDivergencias > 0 ? 'mais' : d.impactoDivergencias < 0 ? 'menos' : 'zero'}`}>{moedaComSinal(d.impactoDivergencias)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card crit-painel">
        <div className="crit-filtros crit-nao-imprimir">
          <div className="crit-filtros-topo">
            {comDistribuidora && (
              <label className="crit-filtro-distribuidora">
                <span>🏭 Distribuidora</span>
                <select value={filtroDistribuidora ?? ''} onChange={(e) => setDistribuidora(e.target.value || null)}>
                  <option value="">Todas ({distribuidoras.length})</option>
                  {distribuidoras.map((d) => (
                    <option key={d.nome} value={d.nome}>
                      {d.nome}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <span className="crit-filtros-info">
              Mostrando <strong>{fmtInteiro(visiveis.length)}</strong> de {fmtInteiro(daDistribuidora.length)} itens
            </span>
            <span className="crit-filtros-baixar">
              <MenuBaixar rotulo="Baixar esta lista" oque={nomeDaLista} aoBaixar={(f) => aoBaixar(secaoAuditoria(auditoria, filtroAtivo, anotacoes, filtroDistribuidora), f)} />
            </span>
          </div>
          <div className="crit-abas" role="tablist" aria-label="Filtrar por resultado">
            <button type="button" role="tab" aria-selected={filtroAtivo === 'TODOS'} className={`crit-aba ${filtroAtivo === 'TODOS' ? 'ativa' : ''}`} onClick={() => setFiltro('TODOS')}>
              Todos <span className="crit-aba-n">{fmtInteiro(daDistribuidora.length)}</span>
            </button>
            {ORDEM_FILTRO.filter((r) => contagemAbas[r] > 0).map((r) => (
              <button key={r} type="button" role="tab" aria-selected={filtroAtivo === r} className={`crit-aba ${filtroAtivo === r ? 'ativa' : ''}`} onClick={() => setFiltro(r)}>
                <span aria-hidden="true">{EMOJI_RESULTADO[r]}</span> {ROTULO_RESULTADO[r]} <span className="crit-aba-n">{contagemAbas[r]}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="crit-tabela-rolagem">
          <table className="data-table crit-tabela">
            <thead>
              <tr>
                <th>Produto</th>
                <th className="crit-dir">Qtd. CotaPreço</th>
                <th className="crit-dir">Qtd. Trier</th>
                <th className="crit-dir">Dif. Qtd.</th>
                <th className="crit-dir">Preço CotaPreço</th>
                <th className="crit-dir">Preço Trier</th>
                <th className="crit-dir">Dif. unitária</th>
                <th className="crit-dir">Impacto (R$)</th>
                <th>Resultado</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l) => (
                <LinhaDaTabela key={l.chave} linha={l} decisao={idDoGrupo(l) !== null ? decisoes[idDoGrupo(l)!] : undefined} disponiveis={auditoria.trierDisponiveis} onDecisao={onDecisao} anotacao={anotacoes[l.chave]} onAnotar={onAnotar} />
              ))}
            </tbody>
            {visiveis.some((l) => l.resultado === 'OK' || l.resultado === 'ATENCAO' || l.resultado === 'DIVERGENCIA') && (
              <tfoot>
                <tr className="crit-total">
                  <td colSpan={7}>
                    Impacto total das linhas mostradas{filtroDistribuidora ? ` (${filtroDistribuidora})` : ''} — {fmtInteiro(impactoVisiveis.itens)} item(ns) com diferença
                  </td>
                  <td className={`crit-dir crit-valor-${impactoVisiveis.saldo > 0 ? 'mais' : impactoVisiveis.saldo < 0 ? 'menos' : 'zero'}`}>{moedaComSinal(impactoVisiveis.saldo)}</td>
                  <td colSpan={2} className="crit-sub-linha">
                    acima do pedido {moedaComSinal(impactoVisiveis.positivo)} · abaixo {moedaComSinal(impactoVisiveis.negativo)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>

      <div className="crit-listas">
        <section className="card crit-painel">
          <div className="crit-titulo-secao">
            <h2>
              A) No CotaPreço, mas não aparecem no Trier <small className="crit-contagem-titulo">({ausentes.length})</small>
            </h2>
            <span className="crit-nao-imprimir crit-titulo-acoes">
              {ausentes.length > 0 && <BotaoMinimizar minimizada={minimizada('ausentes')} onAlternar={() => alternar('ausentes')} alvo="crit-bloco-ausentes" />}
              <MenuBaixar oque="a lista de ausentes no Trier" aoBaixar={(f) => aoBaixar(secaoAusentes(auditoria, anotacoes), f)} />
            </span>
          </div>
          {minimizada('ausentes') && ausentes.length > 0 && (
            <p className="est-dica crit-nao-imprimir crit-prov-resumo">
              {ausentes.length} produto(s) · {fmtMoeda(f.ausentesCota)} em pedidos sem entrada no Trier
            </p>
          )}
          {ausentes.length === 0 ? (
            <p className="est-dica">Nenhum produto do pedido ficou de fora.</p>
          ) : (
            <div id="crit-bloco-ausentes" className={`crit-tabela-rolagem ${minimizada('ausentes') ? 'crit-recolhida-bloco' : ''}`}>
              <table className="data-table crit-tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    {comDistribuidora && <th>Distribuidora</th>}
                    <th className="crit-dir">Qtd. pedida</th>
                    <th className="crit-dir">Preço unitário</th>
                    <th className="crit-dir">Valor total</th>
                    <th>Situação</th>
                    <th>Motivo / anotação</th>
                  </tr>
                </thead>
                <tbody>
                  {ausentes.map((l) => (
                    <tr key={l.chave}>
                      <td>
                        <strong>{l.produto}</strong>
                      </td>
                      {comDistribuidora && <td>{l.distribuidoras.join(' + ') || TRACO}</td>}
                      <td className="crit-dir">{qtd(l.qtdCota)}</td>
                      <td className="crit-dir">{moeda(l.precoCota)}</td>
                      <td className="crit-dir">{moeda(l.valorCota)}</td>
                      <td>🟠 Ausente — conferir nota, entrega e lançamento</td>
                      <td className="crit-obs">
                        <CampoAnotacao valor={anotacoes[l.chave]} produto={l.produto} onChange={(a) => onAnotar(l.chave, a)} />
                      </td>
                    </tr>
                  ))}
                  <tr className="crit-total">
                    <td colSpan={comDistribuidora ? 4 : 3}>Total</td>
                    <td className="crit-dir">{fmtMoeda(f.ausentesCota)}</td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card crit-painel">
          <div className="crit-titulo-secao">
            <h2>
              B) No Trier, mas não estão no CotaPreço <small className="crit-contagem-titulo">({extras.length})</small>
            </h2>
            <span className="crit-nao-imprimir crit-titulo-acoes">
              {extras.length > 0 && <BotaoMinimizar minimizada={minimizada('extras')} onAlternar={() => alternar('extras')} alvo="crit-bloco-extras" />}
              <MenuBaixar oque="a lista de extras no Trier" aoBaixar={(f) => aoBaixar(secaoExtras(auditoria, anotacoes), f)} />
            </span>
          </div>
          {minimizada('extras') && extras.length > 0 && (
            <p className="est-dica crit-nao-imprimir crit-prov-resumo">
              {extras.length} produto(s) · {fmtMoeda(f.extrasTrier)} lançados no Trier fora do pedido
            </p>
          )}
          {extras.length === 0 ? (
            <p className="est-dica">Nenhum produto extra no Trier.</p>
          ) : (
            <div id="crit-bloco-extras" className={`crit-tabela-rolagem ${minimizada('extras') ? 'crit-recolhida-bloco' : ''}`}>
              <table className="data-table crit-tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
                    <th className="crit-dir">Qtd. registrada</th>
                    <th className="crit-dir">Custo unitário</th>
                    <th className="crit-dir">Valor total</th>
                    <th>Situação</th>
                    <th>Motivo / anotação</th>
                  </tr>
                </thead>
                <tbody>
                  {extras.map((l) => (
                    <tr key={l.chave}>
                      <td>
                        <strong>{l.produto}</strong>
                        <small className="crit-sub"> código {l.trier[0]?.codigo}</small>
                      </td>
                      <td className="crit-dir">{qtd(l.qtdTrier)}</td>
                      <td className="crit-dir">{moeda(l.precoTrier)}</td>
                      <td className="crit-dir">{moeda(l.valorTrier)}</td>
                      <td>🔵 Investigar: outro pedido, bonificação ou lançamento adicional</td>
                      <td className="crit-obs">
                        <CampoAnotacao valor={anotacoes[l.chave]} produto={l.produto} onChange={(a) => onAnotar(l.chave, a)} />
                      </td>
                    </tr>
                  ))}
                  <tr className="crit-total">
                    <td colSpan={3}>Total</td>
                    <td className="crit-dir">{fmtMoeda(f.extrasTrier)}</td>
                    <td />
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <section className="card crit-painel">
        <div className="crit-titulo-secao">
          <h2>
            Providências <small className="crit-contagem-titulo">({auditoria.providencias.length})</small>
          </h2>
          <span className="crit-nao-imprimir crit-titulo-acoes">
            {auditoria.providencias.length > 0 && (
              <BotaoMinimizar minimizada={provMinimizadas} onAlternar={() => alternar('providencias')} alvo="crit-lista-providencias" />
            )}
            <MenuBaixar oque="as providências" aoBaixar={(f) => aoBaixar(secaoProvidencias(auditoria), f)} />
          </span>
        </div>
        {provMinimizadas && auditoria.providencias.length > 0 && (
          <p className="est-dica crit-nao-imprimir crit-prov-resumo">
            {resumoProvidencias(auditoria.providencias)} — clique em “Expandir” para ver a lista.
          </p>
        )}
        {auditoria.providencias.length === 0 ? (
          <p className="est-dica">Nenhuma providência: tudo conciliado.</p>
        ) : (
          <ol id="crit-lista-providencias" className={`crit-providencias ${provMinimizadas ? 'crit-recolhida' : ''}`}>
            {auditoria.providencias.map((p, i) => (
              <li key={i} className={`crit-prov crit-prov-${p.nivel}`}>
                <span className="crit-prov-nivel">{p.nivel === 'alta' ? 'Alta' : p.nivel === 'media' ? 'Média' : 'Baixa'}</span>
                {p.texto}
              </li>
            ))}
          </ol>
        )}
      </section>

      <p className="est-dica crit-nota">
        Quantidade comparada: “Qtd. Compra” do Trier. Preço comparado: “Vlr. Unit.” do Trier (preço de compra impresso) contra o unitário do pedido; o custo líquido (após rateio) aparece só como informação. Tolerância de arredondamento e limites de “atenção”
        são configuráveis.
      </p>
    </>
  );
}

/** "3 de prioridade alta · 2 média · 1 baixa" — o que dá pra saber sem abrir a lista. */
function resumoProvidencias(lista: Auditoria['providencias']): string {
  const n = (nivel: string) => lista.filter((p) => p.nivel === nivel).length;
  const partes = [n('alta') && `${n('alta')} de prioridade alta`, n('media') && `${n('media')} média`, n('baixa') && `${n('baixa')} baixa`].filter(Boolean);
  return `${lista.length} providência(s): ${partes.join(' · ')}`;
}

function LinhaDaTabela({ linha: l, decisao, disponiveis, onDecisao, anotacao, onAnotar }: { linha: LinhaAuditoria; decisao?: Decisao; disponiveis: ItemTrier[]; onDecisao: Props['onDecisao']; anotacao?: Anotacao; onAnotar: Props['onAnotar'] }) {
  const grupoId = idDoGrupo(l);
  const destaqueQtd = l.resultado === 'DIVERGENCIA' && l.situacaoQtd !== 'CORRETA';
  const destaquePreco = l.resultado === 'DIVERGENCIA' && l.situacaoPreco !== 'CORRETO';

  return (
    <tr className={`crit-linha crit-r-${l.resultado.toLowerCase()}`}>
      <td>
        <strong>{l.produto}</strong>
        {l.distribuidoras.length > 0 && <small className="crit-sub crit-distribuidora">🏭 {l.distribuidoras.join(' + ')}</small>}
        {l.trier[0] && l.trier[0].produto !== l.produto && <small className="crit-sub"> Trier: {l.trier.map((t) => t.produto).join(' + ')}</small>}
        {l.candidato && <small className="crit-sub"> Trier (candidato): {l.candidato.produto}</small>}
      </td>
      <td className="crit-dir">{qtd(l.qtdCota)}</td>
      <td className="crit-dir">{qtd(l.qtdTrier)}</td>
      <td className={`crit-dir ${destaqueQtd ? 'crit-forte' : ''}`}>{l.difQtd === null ? TRACO : `${sinal(l.difQtd)}${fmtQuantidade(Math.abs(l.difQtd))}`}</td>
      <td className="crit-dir">{moeda(l.precoCota)}</td>
      <td className="crit-dir">{moeda(l.precoTrier)}</td>
      <td className={`crit-dir ${destaquePreco ? 'crit-forte' : ''}`}>
        {l.difUnitaria === null ? TRACO : moedaComSinal(l.difUnitaria)}
        {l.difPct !== null && Math.abs(l.difUnitaria ?? 0) > 0.00001 && <small className="crit-sub"> {fmtPercentual(l.difPct)}</small>}
      </td>
      <td className="crit-dir">{l.resultado === 'OK' || l.resultado === 'ATENCAO' || l.resultado === 'DIVERGENCIA' ? moedaComSinal((l.impactoPreco ?? 0) + (l.impactoQtd ?? 0)) : TRACO}</td>
      <td>
        <span className="crit-selo">
          {EMOJI_RESULTADO[l.resultado]} {ROTULO_RESULTADO[l.resultado]}
        </span>
      </td>
      <td className="crit-obs">
        {l.observacoes.map((o, i) => (
          <p key={i}>{o}</p>
        ))}

        {grupoId !== null && l.resultado === 'NAO_CONFIRMADO' && (
          <div className="crit-acoes crit-nao-imprimir">
            <button type="button" className="btn-ghost" onClick={() => onDecisao(grupoId, { tipo: 'confirmar' })}>
              ✔ É o mesmo produto
            </button>
            <button type="button" className="btn-ghost" onClick={() => onDecisao(grupoId, { tipo: 'rejeitar' })}>
              ✖ Não é o mesmo
            </button>
          </div>
        )}
        {grupoId !== null && l.resultado === 'AUSENTE' && (
          <div className="crit-acoes crit-nao-imprimir">
            {disponiveis.length > 0 && (
              <select
                value=""
                aria-label={`Vincular ${l.produto} a uma linha do Trier`}
                onChange={(e) => e.target.value && onDecisao(grupoId, { tipo: 'vincular', trierIds: [Number(e.target.value)] })}
              >
                <option value="">Vincular a uma linha do Trier…</option>
                {disponiveis.map((t) => (
                  <option key={t.id} value={t.id}>
                    {rotuloTrier(t)}
                  </option>
                ))}
              </select>
            )}
            {decisao?.tipo === 'rejeitar' && (
              <button type="button" className="btn-ghost" onClick={() => onDecisao(grupoId, null)}>
                ↺ Reavaliar sugestão
              </button>
            )}
          </div>
        )}
        {grupoId !== null && l.criterio === 'MANUAL' && (
          <div className="crit-acoes crit-nao-imprimir">
            <button type="button" className="btn-ghost" onClick={() => onDecisao(grupoId, null)}>
              ↺ Desfazer vínculo
            </button>
          </div>
        )}
        <CampoAnotacao valor={anotacao} produto={l.produto} onChange={(a) => onAnotar(l.chave, a)} />
      </td>
    </tr>
  );
}
