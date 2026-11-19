import { useMemo, useState } from 'react';
import { useEstoque } from '../../context/EstoqueContext';
import { mensagemDeErro } from '../../services/estoqueService';
import { STATUS_ACAO_LABEL, STATUS_ACAO_ORDEM, type StatusAcao } from '../../types/estoque';
import { calcularTotais, type ProdutoAnalisado } from '../../utils/estoqueAnalise';
import { fmtInteiro, fmtMoeda, fmtQuantidade } from '../../utils/estoqueFormat';

interface Props {
  selecionados: Set<string>;
  onSelecionados: (ids: Set<string>) => void;
  /** Tudo que está filtrado agora — permite "selecionar todos os N" além da página visível. */
  filtrados: ProdutoAnalisado[];
}

/**
 * Aparece quando há produtos selecionados: resume o que foi selecionado
 * (quantos, unidades, capital) e aplica status/responsável/prazo em lote.
 * Campo deixado em branco = "não alterar".
 */
export function BarraLote({ selecionados, onSelecionados, filtrados }: Props) {
  const { analisados, config, atualizarLote, avisar } = useEstoque();
  const [status, setStatus] = useState<StatusAcao | ''>('');
  const [responsavel, setResponsavel] = useState('');
  const [dataInicio, setDataInicio] = useState('');
  const [prazo, setPrazo] = useState('');
  const [aplicando, setAplicando] = useState(false);

  const escolhidos = useMemo(() => analisados.filter((p) => selecionados.has(p.id)), [analisados, selecionados]);
  const totais = useMemo(() => calcularTotais(escolhidos, config), [escolhidos, config]);

  if (!selecionados.size) return null;

  async function aplicar(extra: { negociarFornecedor?: boolean } = {}) {
    const campos = {
      ...(status ? { statusAcao: status } : {}),
      ...(responsavel.trim() ? { responsavel: responsavel.trim() } : {}),
      ...(dataInicio ? { dataInicio } : {}),
      ...(prazo ? { prazo } : {}),
      ...extra,
    };
    if (!Object.keys(campos).length) {
      avisar('Escolha o que alterar (status, responsável ou prazo) antes de aplicar.');
      return;
    }
    setAplicando(true);
    try {
      await atualizarLote([...selecionados], campos);
      avisar(`${fmtInteiro(selecionados.size)} produto(s) atualizado(s).`);
      setStatus('');
      setResponsavel('');
      setDataInicio('');
      setPrazo('');
    } catch (e) {
      avisar(mensagemDeErro(e));
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="card est-lote">
      <div className="est-lote-resumo">
        <strong>{fmtInteiro(selecionados.size)} selecionado(s)</strong>
        <span>{fmtQuantidade(totais.unidades)} unidades</span>
        <span>
          {fmtMoeda(totais.valor)} investidos
          {totais.semValor > 0 && <small> ({totais.semValor} sem custo informado)</small>}
        </span>
        {selecionados.size < filtrados.length && (
          <button type="button" className="est-link" onClick={() => onSelecionados(new Set(filtrados.map((p) => p.id)))}>
            Selecionar os {fmtInteiro(filtrados.length)} filtrados
          </button>
        )}
        <button type="button" className="est-link" onClick={() => onSelecionados(new Set())}>
          Limpar seleção
        </button>
      </div>

      <div className="est-lote-acoes">
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as StatusAcao | '')}>
            <option value="">Não alterar</option>
            {STATUS_ACAO_ORDEM.map((s) => (
              <option key={s} value={s}>
                {STATUS_ACAO_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Responsável</span>
          <input list="est-responsaveis" value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Não alterar" />
        </label>
        <label className="field">
          <span>Início</span>
          <input type="date" value={dataInicio} onChange={(e) => setDataInicio(e.target.value)} />
        </label>
        <label className="field">
          <span>Prazo</span>
          <input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </label>
        <button type="button" className="btn-primary" onClick={() => aplicar()} disabled={aplicando}>
          {aplicando ? 'Aplicando…' : 'Aplicar aos selecionados'}
        </button>
        <button type="button" className="btn-ghost" onClick={() => aplicar({ negociarFornecedor: true })} disabled={aplicando} title="Marca os selecionados como candidatos a troca/devolução">
          Marcar p/ negociar
        </button>
      </div>
    </div>
  );
}
