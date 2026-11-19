import { useMemo } from 'react';
import { useEstoque } from '../../context/EstoqueContext';
import { STATUS_ACAO_LABEL, STATUS_ACAO_ORDEM, type StatusAcao } from '../../types/estoque';
import {
  CODIGOS_PRIORIDADE,
  NOME_PRIORIDADE,
  descricaoFaixa,
  faixasDeTempo,
  valoresDistintos,
  type CodigoPrioridade,
  type FiltrosProduto,
  type SituacaoAcao,
} from '../../utils/estoqueAnalise';

export type CampoFiltro = 'busca' | 'laboratorio' | 'fornecedor' | 'grupo' | 'prioridade' | 'saldo' | 'periodo' | 'status' | 'situacao' | 'visao' | 'negociar';

const CAMPOS_TODOS: CampoFiltro[] = ['busca', 'laboratorio', 'fornecedor', 'grupo', 'prioridade', 'saldo', 'periodo', 'status', 'situacao', 'visao', 'negociar'];

export const ROTULO_SITUACAO: Record<SituacaoAcao, string> = {
  pendentes: 'Ações pendentes',
  atrasadas: 'Ações atrasadas',
  andamento: 'Em andamento',
  concluidas: 'Concluídas',
};

interface Props {
  valor: FiltrosProduto;
  onChange: (f: FiltrosProduto) => void;
  /** Quais controles mostrar (padrão: todos). */
  campos?: CampoFiltro[];
}

const numeroOuNulo = (texto: string): number | null => {
  const n = Number(texto.replace(',', '.'));
  return texto.trim() === '' || !Number.isFinite(n) ? null : n;
};

/** Filtros combináveis. Um filtro em branco simplesmente não restringe nada. */
export function FiltrosProdutos({ valor, onChange, campos = CAMPOS_TODOS }: Props) {
  const { analisados, config } = useEstoque();
  const mostra = (c: CampoFiltro) => campos.includes(c);
  const ativos = useMemo(() => analisados.filter((p) => p.ativo), [analisados]);
  const laboratorios = useMemo(() => valoresDistintos(ativos, (p) => p.laboratorio), [ativos]);
  const fornecedores = useMemo(() => valoresDistintos(ativos, (p) => p.fornecedor), [ativos]);
  const grupos = useMemo(() => valoresDistintos(ativos, (p) => p.grupo), [ativos]);
  const faixasTempo = useMemo(() => faixasDeTempo(config), [config]);

  const mudar = (parcial: Partial<FiltrosProduto>) => onChange({ ...valor, ...parcial });
  const algumFiltro = Object.entries(valor).some(([k, v]) => v !== undefined && v !== '' && v !== null && !(k === 'visao' && v === 'ativos') && v !== false);

  return (
    <div className="card est-filtros">
      <div className="est-filtros-grade">
        {mostra('busca') && (
          <label className="field est-filtro-largo">
            <span>Buscar</span>
            <input type="search" placeholder="Produto, código Trier, código de barras…" value={valor.busca ?? ''} onChange={(e) => mudar({ busca: e.target.value })} />
          </label>
        )}
        {mostra('laboratorio') && (
          <label className="field">
            <span>Laboratório</span>
            <select value={valor.laboratorio ?? ''} onChange={(e) => mudar({ laboratorio: e.target.value })}>
              <option value="">Todos</option>
              {laboratorios.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        )}
        {mostra('fornecedor') && (
          <label className="field">
            <span>Fornecedor</span>
            <select value={valor.fornecedor ?? ''} onChange={(e) => mudar({ fornecedor: e.target.value })}>
              <option value="">Todos</option>
              {fornecedores.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        )}
        {mostra('grupo') && (
          <label className="field">
            <span>Grupo</span>
            <select value={valor.grupo ?? ''} onChange={(e) => mudar({ grupo: e.target.value })}>
              <option value="">Todos</option>
              {grupos.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
        )}
        {mostra('prioridade') && (
          <label className="field">
            <span>Prioridade</span>
            <select value={valor.prioridade ?? ''} onChange={(e) => mudar({ prioridade: e.target.value as CodigoPrioridade | '' })}>
              <option value="">Todas</option>
              {CODIGOS_PRIORIDADE.map((c) => (
                <option key={c} value={c}>
                  {c === 'SEM' ? NOME_PRIORIDADE.SEM : `${c} · ${NOME_PRIORIDADE[c]} (${descricaoFaixa(c, config.faixas)})`}
                </option>
              ))}
            </select>
          </label>
        )}
        {mostra('saldo') && (
          <div className="field est-filtro-saldo">
            <span>Quantidade em estoque</span>
            <div>
              <input inputMode="numeric" placeholder="mín." value={valor.saldoMin ?? ''} onChange={(e) => mudar({ saldoMin: numeroOuNulo(e.target.value) })} aria-label="Quantidade mínima" />
              <input inputMode="numeric" placeholder="máx." value={valor.saldoMax ?? ''} onChange={(e) => mudar({ saldoMax: numeroOuNulo(e.target.value) })} aria-label="Quantidade máxima" />
            </div>
          </div>
        )}
        {mostra('periodo') && (
          <div className="field">
            <span>Última entrada</span>
            <select value={valor.faixaTempo ?? ''} onChange={(e) => mudar({ faixaTempo: e.target.value })} aria-label="Período desde a última entrada">
              <option value="">Qualquer período</option>
              {faixasTempo.map((f) => (
                <option key={f.chave} value={f.chave}>
                  {f.rotulo}
                </option>
              ))}
              <option value="SD">Sem data informada</option>
            </select>
            <input inputMode="numeric" placeholder="ou: mais de … dias" value={valor.diasMin ?? ''} onChange={(e) => mudar({ diasMin: numeroOuNulo(e.target.value) })} aria-label="Mais de quantos dias desde a última entrada" />
          </div>
        )}
        {mostra('status') && (
          <label className="field">
            <span>Status da ação</span>
            <select value={valor.status ?? ''} onChange={(e) => mudar({ status: e.target.value as StatusAcao | '' })}>
              <option value="">Todos</option>
              {STATUS_ACAO_ORDEM.map((s) => (
                <option key={s} value={s}>
                  {STATUS_ACAO_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        {mostra('situacao') && (
          <label className="field">
            <span>Situação do plano</span>
            <select value={valor.situacao ?? ''} onChange={(e) => mudar({ situacao: e.target.value as SituacaoAcao | '' })}>
              <option value="">Qualquer</option>
              {(Object.keys(ROTULO_SITUACAO) as SituacaoAcao[]).map((s) => (
                <option key={s} value={s}>
                  {ROTULO_SITUACAO[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        {mostra('visao') && (
          <label className="field">
            <span>Mostrar</span>
            <select value={valor.visao ?? 'ativos'} onChange={(e) => mudar({ visao: e.target.value as FiltrosProduto['visao'] })}>
              <option value="ativos">Só o relatório atual</option>
              <option value="fora">Fora do relatório atual</option>
              <option value="todos">Todos</option>
            </select>
          </label>
        )}
      </div>

      <div className="est-filtros-rodape">
        {mostra('negociar') && (
          <label className="est-check">
            <input type="checkbox" checked={!!valor.somenteNegociar} onChange={(e) => mudar({ somenteNegociar: e.target.checked })} /> Só os marcados para negociar com o fornecedor
          </label>
        )}
        {algumFiltro && (
          <button type="button" className="btn-ghost" onClick={() => onChange({})}>
            Limpar filtros
          </button>
        )}
      </div>
    </div>
  );
}
