import { useMemo, useState } from 'react';
import type { Auditoria, Decisao, Decisoes, LinhaAuditoria, Resultado, Veredito } from '../../utils/critica/auditoria';
import { EMOJI_RESULTADO, ROTULO_RESULTADO } from '../../utils/critica/exportar';
import { secaoAuditoria, secaoAusentes, secaoExtras, secaoFinanceiro, secaoProvidencias, type Formato, type SecaoRel } from '../../utils/critica/relatorio';
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

const idDoGrupo = (l: LinhaAuditoria) => (l.chave.startsWith('c') ? Number(l.chave.slice(1)) : null);
const rotuloTrier = (t: ItemTrier) => `${t.codigo} · ${t.produto} · ${fmtQuantidade(t.qtd)} un × ${fmtMoeda(t.unitario)}`;

export function ResultadoAuditoria({ auditoria, decisoes, onDecisao, anotacoes, onAnotar, aoBaixar }: Props) {
  const [filtro, setFiltro] = useState<Resultado | 'TODOS'>('TODOS');
  const { contagens, financeiro: f, veredito, linhas } = auditoria;
  const v = VEREDITO[veredito];
  const visiveis = useMemo(() => (filtro === 'TODOS' ? linhas : linhas.filter((l) => l.resultado === filtro)), [linhas, filtro]);
  const ausentes = linhas.filter((l) => l.resultado === 'AUSENTE');
  const extras = linhas.filter((l) => l.resultado === 'EXTRA');

  return (
    <>
      <section className={`crit-veredito ${v.classe}`} role="status">
        <span className="crit-veredito-emoji">{v.emoji}</span>
        <div>
          <strong>{v.titulo}</strong>
          <p>{auditoria.justificativa}</p>
        </div>
      </section>

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
          <span className="crit-nao-imprimir">
            <MenuBaixar oque="a conferência financeira" aoBaixar={(f) => aoBaixar(secaoFinanceiro(auditoria), f)} />
          </span>
        </div>
        <div className="crit-financeiro">
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

      <section className="card crit-painel">
        <div className="crit-filtros crit-nao-imprimir">
          <span className="crit-chip-grupo">
            <button type="button" className={`crit-chip ${filtro === 'TODOS' ? 'ativo' : ''}`} onClick={() => setFiltro('TODOS')}>
              Todos ({fmtInteiro(linhas.length)})
            </button>
            <MenuBaixar compacto oque="todos os itens" aoBaixar={(f) => aoBaixar(secaoAuditoria(auditoria, 'TODOS', anotacoes), f)} />
          </span>
          {ORDEM_FILTRO.filter((r) => contagens[r] > 0).map((r) => (
            <span key={r} className="crit-chip-grupo">
              <button type="button" className={`crit-chip ${filtro === r ? 'ativo' : ''}`} onClick={() => setFiltro(r)}>
                {EMOJI_RESULTADO[r]} {ROTULO_RESULTADO[r]} ({contagens[r]})
              </button>
              <MenuBaixar compacto oque={`os itens: ${ROTULO_RESULTADO[r].toLowerCase()}`} aoBaixar={(f) => aoBaixar(secaoAuditoria(auditoria, r, anotacoes), f)} />
            </span>
          ))}
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
          </table>
        </div>
      </section>

      <div className="crit-listas">
        <section className="card crit-painel">
          <div className="crit-titulo-secao">
            <h2>A) No CotaPreço, mas não aparecem no Trier</h2>
            <span className="crit-nao-imprimir">
              <MenuBaixar oque="a lista de ausentes no Trier" aoBaixar={(f) => aoBaixar(secaoAusentes(auditoria, anotacoes), f)} />
            </span>
          </div>
          {ausentes.length === 0 ? (
            <p className="est-dica">Nenhum produto do pedido ficou de fora.</p>
          ) : (
            <div className="crit-tabela-rolagem">
              <table className="data-table crit-tabela">
                <thead>
                  <tr>
                    <th>Produto</th>
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
                    <td colSpan={3}>Total</td>
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
            <h2>B) No Trier, mas não estão no CotaPreço</h2>
            <span className="crit-nao-imprimir">
              <MenuBaixar oque="a lista de extras no Trier" aoBaixar={(f) => aoBaixar(secaoExtras(auditoria, anotacoes), f)} />
            </span>
          </div>
          {extras.length === 0 ? (
            <p className="est-dica">Nenhum produto extra no Trier.</p>
          ) : (
            <div className="crit-tabela-rolagem">
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
          <h2>Providências</h2>
          <span className="crit-nao-imprimir">
            <MenuBaixar oque="as providências" aoBaixar={(f) => aoBaixar(secaoProvidencias(auditoria), f)} />
          </span>
        </div>
        {auditoria.providencias.length === 0 ? (
          <p className="est-dica">Nenhuma providência: tudo conciliado.</p>
        ) : (
          <ol className="crit-providencias">
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

function LinhaDaTabela({ linha: l, decisao, disponiveis, onDecisao, anotacao, onAnotar }: { linha: LinhaAuditoria; decisao?: Decisao; disponiveis: ItemTrier[]; onDecisao: Props['onDecisao']; anotacao?: Anotacao; onAnotar: Props['onAnotar'] }) {
  const grupoId = idDoGrupo(l);
  const destaqueQtd = l.resultado === 'DIVERGENCIA' && l.situacaoQtd !== 'CORRETA';
  const destaquePreco = l.resultado === 'DIVERGENCIA' && l.situacaoPreco !== 'CORRETO';

  return (
    <tr className={`crit-linha crit-r-${l.resultado.toLowerCase()}`}>
      <td>
        <strong>{l.produto}</strong>
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
