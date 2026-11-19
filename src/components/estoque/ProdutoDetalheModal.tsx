import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useEstoque } from '../../context/EstoqueContext';
import { estoqueService, mensagemDeErro } from '../../services/estoqueService';
import { STATUS_ACAO_LABEL, STATUS_ACAO_ORDEM, type EdicaoProduto, type HistoricoEstoque, type StatusAcao } from '../../types/estoque';
import { ROTULO_CATEGORIA, categoriaDoProduto, sugerirAcao } from '../../utils/estoqueAcoes';
import { NOME_PRIORIDADE, type ProdutoAnalisado } from '../../utils/estoqueAnalise';
import { NAO_INFORMADO, fmtData, fmtDataHora, fmtMesAno, fmtMoeda, fmtQuantidade } from '../../utils/estoqueFormat';
import { valorLegivel } from '../../utils/estoqueHistorico';
import { Modal, SeloPrioridade } from './Elementos';
import { SimuladorPreco } from './SimuladorPreco';

type Aba = 'resumo' | 'plano' | 'simulador' | 'historico';

const ABAS: Array<[Aba, string]> = [
  ['resumo', 'Dados do relatório'],
  ['plano', 'Plano de ação'],
  ['simulador', 'Simulador de preço'],
  ['historico', 'Histórico'],
];

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="est-dado">
      <dt>{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ou<T extends string | number>(v: T | null | undefined, formatar?: (x: T) => string): ReactNode {
  if (v === null || v === undefined || v === '') return <span className="est-nao-informado">{NAO_INFORMADO}</span>;
  return formatar ? formatar(v) : String(v);
}

/** Detalhe do produto: dados do relatório, plano de ação editável, simulador e histórico — tudo numa janela. */
export function ProdutoDetalheModal({ id, onFechar, abaInicial = 'resumo' }: { id: string; onFechar: () => void; abaInicial?: Aba }) {
  const { analisados } = useEstoque();
  const produto = analisados.find((p) => p.id === id);
  const [aba, setAba] = useState<Aba>(abaInicial);

  if (!produto) return null;

  return (
    <Modal
      larga
      onFechar={onFechar}
      titulo={
        <span className="est-modal-titulo">
          <span>{produto.produto}</span>
          <small>
            Código Trier {produto.codigoTrier}
            {produto.codigoBarras ? ` · EAN ${produto.codigoBarras}` : ''}
          </small>
        </span>
      }
    >
      <div className="est-detalhe-cabeca">
        <SeloPrioridade prioridade={produto.prioridade} />
        {produto.ranking !== null && <span className="est-chip">Ranking #{produto.ranking}</span>}
        {!produto.ativo && <span className="est-chip est-chip-aviso">Fora do relatório atual</span>}
        {produto.atrasada && <span className="est-chip est-chip-erro">Ação atrasada</span>}
      </div>

      <div className="nav-tabs est-abas">
        {ABAS.map(([chave, rotulo]) => (
          <a
            key={chave}
            href={`#${chave}`}
            className={aba === chave ? 'active' : ''}
            onClick={(e) => {
              e.preventDefault();
              setAba(chave);
            }}
          >
            {rotulo}
          </a>
        ))}
      </div>

      {aba === 'resumo' && <Resumo produto={produto} />}
      {aba === 'plano' && <PlanoAcao key={produto.id} produto={produto} onSalvo={() => undefined} />}
      {aba === 'simulador' && <SimuladorPreco key={produto.id} produto={produto} />}
      {aba === 'historico' && <HistoricoProduto codigo={produto.codigoTrier} />}
    </Modal>
  );
}

function Resumo({ produto: p }: { produto: ProdutoAnalisado }) {
  return (
    <dl className="est-dados">
      <Dado rotulo="Laboratório">{ou(p.laboratorio)}</Dado>
      <Dado rotulo="Grupo">{ou(p.grupo)}</Dado>
      <Dado rotulo="Fornecedor">{ou(p.fornecedor)}</Dado>
      <Dado rotulo="Quantidade em estoque">{ou(p.saldo, fmtQuantidade)}</Dado>
      <Dado rotulo="Estoque mínimo">{ou(p.estoqueMinimo, fmtQuantidade)}</Dado>
      <Dado rotulo="Quantidade de demanda">{ou(p.demanda, fmtQuantidade)}</Dado>
      <Dado rotulo="Custo unitário">{ou(p.custoUnitario, fmtMoeda)}</Dado>
      <Dado rotulo="Valor total em estoque">{ou(p.valor, fmtMoeda)}</Dado>
      <Dado rotulo="Última compra/entrada">{ou(p.dataUltimaEntrada, fmtData)}</Dado>
      <Dado rotulo="Mês/ano da última entrada">{ou(p.dataUltimaEntrada, fmtMesAno)}</Dado>
      <Dado rotulo="Tempo desde a última entrada">{p.dias === null ? ou(null) : `${p.dias} dias`}</Dado>
      <Dado rotulo="Quantidade da última compra">{ou(p.qtdUltimaCompra, fmtQuantidade)}</Dado>
      <Dado rotulo="Preço da última compra">{ou(p.precoUltimaCompra, fmtMoeda)}</Dado>
      <Dado rotulo="Preço de venda atual">{ou(p.precoVenda, fmtMoeda)}</Dado>
      <Dado rotulo="Classificação">
        {p.prioridade === 'SEM' ? NOME_PRIORIDADE.SEM : `${p.prioridade} — ${NOME_PRIORIDADE[p.prioridade]}`}
        {p.pontuacao !== null && ` · pontuação ${p.pontuacao.toFixed(0)}`}
      </Dado>
      <Dado rotulo="Categoria (inferida)">{ROTULO_CATEGORIA[categoriaDoProduto(p)]}</Dado>
      <p className="est-dica est-dado-largo">A data da última entrada não comprova que o produto ficou sem vender desde então — é só o tempo desde a última compra/entrada.</p>
    </dl>
  );
}

interface Formulario {
  acaoRecomendada: string;
  objetivo: string;
  comoExecutar: string;
  statusAcao: StatusAcao;
  responsavel: string;
  dataInicio: string;
  prazo: string;
  observacoes: string;
  resultado: string;
  quantidadeAtualizada: string;
  negociarFornecedor: boolean;
}

function PlanoAcao({ produto: p, onSalvo }: { produto: ProdutoAnalisado; onSalvo: () => void }) {
  const { config, atualizarProduto, avisar } = useEstoque();
  const sugestao = useMemo(() => sugerirAcao(p, config), [p, config]);

  const inicial = useMemo<Formulario>(
    () => ({
      acaoRecomendada: p.acaoRecomendada ?? sugestao.acaoRecomendada,
      objetivo: p.objetivo ?? sugestao.objetivo,
      comoExecutar: p.comoExecutar ?? sugestao.comoExecutar,
      statusAcao: p.statusAcao,
      responsavel: p.responsavel ?? '',
      dataInicio: p.dataInicio ?? '',
      prazo: p.prazo ?? '',
      observacoes: p.observacoes ?? '',
      resultado: p.resultado ?? '',
      quantidadeAtualizada: p.quantidadeAtualizada === null ? '' : String(p.quantidadeAtualizada).replace('.', ','),
      negociarFornecedor: p.negociarFornecedor,
    }),
    [p, sugestao],
  );
  const [f, setF] = useState<Formulario>(inicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const mudar = (parcial: Partial<Formulario>) => setF((atual) => ({ ...atual, ...parcial }));

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    setErro('');

    const campos: EdicaoProduto = {};
    // Texto igual à sugestão = a pessoa não personalizou: volta a seguir a sugestão automática (grava null).
    for (const c of ['acaoRecomendada', 'objetivo', 'comoExecutar'] as const) {
      const novo = f[c].trim();
      if (novo === inicial[c].trim()) continue;
      campos[c] = novo === sugestao[c] || novo === '' ? null : novo;
    }
    if (f.statusAcao !== p.statusAcao) campos.statusAcao = f.statusAcao;
    if ((f.responsavel.trim() || null) !== p.responsavel) campos.responsavel = f.responsavel.trim() || null;
    if ((f.dataInicio || null) !== p.dataInicio) campos.dataInicio = f.dataInicio || null;
    if ((f.prazo || null) !== p.prazo) campos.prazo = f.prazo || null;
    if ((f.observacoes.trim() || null) !== p.observacoes) campos.observacoes = f.observacoes.trim() || null;
    if ((f.resultado.trim() || null) !== p.resultado) campos.resultado = f.resultado.trim() || null;
    if (f.negociarFornecedor !== p.negociarFornecedor) campos.negociarFornecedor = f.negociarFornecedor;

    const qtd = f.quantidadeAtualizada.trim() === '' ? null : Number(f.quantidadeAtualizada.replace(/\./g, '').replace(',', '.'));
    if (qtd !== null && (!Number.isFinite(qtd) || qtd < 0)) {
      setErro('Quantidade atualizada inválida.');
      return;
    }
    if (qtd !== p.quantidadeAtualizada) campos.quantidadeAtualizada = qtd;

    if (!Object.keys(campos).length) {
      avisar('Nada foi alterado.');
      return;
    }
    setSalvando(true);
    try {
      await atualizarProduto(p.id, campos);
      avisar('Plano de ação salvo.');
      onSalvo();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="est-plano">
      <p className="est-dica">
        Sugestão automática para <strong>{ROTULO_CATEGORIA[sugestao.categoria]}</strong>, montada com os dados do relatório. Edite o que quiser — o que você salvar passa a valer no lugar da sugestão.
      </p>

      <label className="field">
        <span>Ação recomendada — o que deve ser feito</span>
        <textarea rows={2} value={f.acaoRecomendada} onChange={(e) => mudar({ acaoRecomendada: e.target.value })} />
      </label>
      <label className="field">
        <span>Objetivo — qual resultado queremos alcançar</span>
        <textarea rows={2} value={f.objetivo} onChange={(e) => mudar({ objetivo: e.target.value })} />
      </label>
      <label className="field">
        <span>Como executar — passo a passo</span>
        <textarea rows={7} value={f.comoExecutar} onChange={(e) => mudar({ comoExecutar: e.target.value })} />
      </label>
      <button
        type="button"
        className="est-link"
        onClick={() => mudar({ acaoRecomendada: sugestao.acaoRecomendada, objetivo: sugestao.objetivo, comoExecutar: sugestao.comoExecutar })}
      >
        ↺ Voltar para a sugestão automática
      </button>

      <h3 className="est-subtitulo">Acompanhamento</h3>
      <div className="est-form-grid">
        <label className="field">
          <span>Status</span>
          <select value={f.statusAcao} onChange={(e) => mudar({ statusAcao: e.target.value as StatusAcao })}>
            {STATUS_ACAO_ORDEM.map((s) => (
              <option key={s} value={s}>
                {STATUS_ACAO_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Responsável pela ação</span>
          <input list="est-responsaveis" value={f.responsavel} onChange={(e) => mudar({ responsavel: e.target.value })} />
        </label>
        <label className="field">
          <span>Data de início</span>
          <input type="date" value={f.dataInicio} onChange={(e) => mudar({ dataInicio: e.target.value })} />
        </label>
        <label className="field">
          <span>Prazo para execução</span>
          <input type="date" value={f.prazo} onChange={(e) => mudar({ prazo: e.target.value })} />
        </label>
        <label className="field">
          <span>Quantidade atualizada em estoque</span>
          <input inputMode="decimal" value={f.quantidadeAtualizada} onChange={(e) => mudar({ quantidadeAtualizada: e.target.value })} placeholder={`No relatório: ${fmtQuantidade(p.saldo)}`} />
        </label>
        <div className="field">
          <span>Última atualização da ação</span>
          <div className="est-leitura">{p.acaoAtualizadaEm ? fmtDataHora(p.acaoAtualizadaEm) : 'Ainda não houve'}</div>
        </div>
      </div>
      <label className="field">
        <span>Observações</span>
        <textarea rows={2} value={f.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} />
      </label>
      <label className="field">
        <span>Resultado obtido</span>
        <textarea rows={2} value={f.resultado} onChange={(e) => mudar({ resultado: e.target.value })} />
      </label>
      <label className="est-check">
        <input type="checkbox" checked={f.negociarFornecedor} onChange={(e) => mudar({ negociarFornecedor: e.target.checked })} /> Candidato a troca/devolução com o fornecedor
      </label>

      <p className="error-text">{erro}</p>
      <div className="est-modal-rodape">
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar plano de ação'}
        </button>
      </div>
    </form>
  );
}

function HistoricoProduto({ codigo }: { codigo: string }) {
  const { produtos } = useEstoque();
  const [itens, setItens] = useState<HistoricoEstoque[] | null>(null);
  const versao = produtos.find((x) => x.codigoTrier === codigo)?.atualizadoEm;

  useEffect(() => {
    let ativo = true;
    estoqueService
      .historico({ codigoTrier: codigo, limite: 100 })
      .then((l) => ativo && setItens(l))
      .catch(() => ativo && setItens([]));
    return () => {
      ativo = false;
    };
  }, [codigo, versao]);

  if (itens === null) return <p>Carregando…</p>;
  if (!itens.length) return <p className="est-dica">Nenhuma alteração registrada para este produto ainda.</p>;
  return (
    <ul className="est-historico-lista">
      {itens.map((h) => (
        <li key={h.id}>
          <span className="est-historico-data">{fmtDataHora(h.criadoEm)}</span>
          <span>
            <strong>{h.campo}</strong>: {valorLegivel(h.campo, h.valorAnterior)} → <strong>{valorLegivel(h.campo, h.valorNovo)}</strong>
            {h.usuarioNome && <small> · {h.usuarioNome}</small>}
          </span>
        </li>
      ))}
    </ul>
  );
}
