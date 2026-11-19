import { useState } from 'react';
import { useEstoque } from '../../context/EstoqueContext';
import { mensagemDeErro } from '../../services/estoqueService';
import { simular } from '../../utils/estoqueAnalise';
import type { ProdutoAnalisado } from '../../utils/estoqueAnalise';
import { fmtMoeda, fmtPercentual } from '../../utils/estoqueFormat';
import { parseValorBr } from '../../utils/money';

/** Texto digitado (formato brasileiro) → número, ou null se vazio/ilegível. */
function numero(texto: string): number | null {
  if (!texto.trim()) return null;
  const n = parseValorBr(texto);
  return Number.isFinite(n) ? n : null;
}

function emTexto(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v).replace('.', ',');
}

/**
 * Simulador de preço e margem. Só apoia a decisão: nada aqui altera preço no
 * Trier nem aplica desconto sozinho — o único dado que pode ser gravado é o
 * "preço de venda atual" do produto (o relatório de parados não traz esse campo).
 */
export function SimuladorPreco({ produto }: { produto?: ProdutoAnalisado }) {
  const { config, atualizarProduto, avisar } = useEstoque();
  const [custo, setCusto] = useState(emTexto(produto?.custoUnitario));
  const [precoAtual, setPrecoAtual] = useState(emTexto(produto?.precoVenda));
  const [novoPreco, setNovoPreco] = useState('');
  const [quantidade, setQuantidade] = useState(emTexto(produto?.saldo));
  const [salvando, setSalvando] = useState(false);

  const entrada = { custo: numero(custo), precoAtual: numero(precoAtual), novoPreco: numero(novoPreco), quantidade: numero(quantidade) };
  const r = simular(entrada, config.margemMinimaPct);
  const podeSalvarPreco = !!produto && entrada.precoAtual !== null && entrada.precoAtual !== produto.precoVenda;

  async function salvarPrecoAtual() {
    if (!produto || entrada.precoAtual === null) return;
    setSalvando(true);
    try {
      await atualizarProduto(produto.id, { precoVenda: entrada.precoAtual });
      avisar('Preço de venda atual salvo no produto.');
    } catch (e) {
      avisar(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="est-simulador">
      <div className="est-form-grid">
        <label className="field">
          <span>Custo unitário (R$)</span>
          <input inputMode="decimal" value={custo} onChange={(e) => setCusto(e.target.value)} placeholder="0,00" />
        </label>
        <label className="field">
          <span>Preço de venda atual (R$)</span>
          <input inputMode="decimal" value={precoAtual} onChange={(e) => setPrecoAtual(e.target.value)} placeholder="0,00" />
        </label>
        <label className="field">
          <span>Novo preço pretendido (R$)</span>
          <input inputMode="decimal" value={novoPreco} onChange={(e) => setNovoPreco(e.target.value)} placeholder="0,00" />
        </label>
        <label className="field">
          <span>Quantidade que deseja vender</span>
          <input inputMode="decimal" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} placeholder="0" />
        </label>
      </div>

      {produto && entrada.precoAtual === null && (
        <p className="est-dica">O relatório do Trier não traz o preço de venda. Informe o preço atual para calcular a margem de hoje.</p>
      )}

      {r.abaixoDoCusto && (
        <div className="est-alerta est-alerta-erro" role="alert">
          ⚠️ O novo preço está <strong>abaixo do custo</strong> ({fmtMoeda(entrada.custo)}): cada unidade vendida gera prejuízo.
        </div>
      )}
      {!r.abaixoDoCusto && r.abaixoDaMargemMinima && (
        <div className="est-alerta est-alerta-aviso" role="alert">
          ⚠️ A margem no novo preço ({fmtPercentual(r.margemNova)}) está <strong>abaixo da margem mínima</strong> configurada ({fmtPercentual(config.margemMinimaPct, 0)}).
        </div>
      )}

      <dl className="est-resultados">
        <div>
          <dt>Margem bruta atual</dt>
          <dd>{fmtPercentual(r.margemAtual)}</dd>
        </div>
        <div>
          <dt>Margem bruta no novo preço</dt>
          <dd className={r.abaixoDaMargemMinima || r.abaixoDoCusto ? 'est-negativo' : ''}>{fmtPercentual(r.margemNova)}</dd>
        </div>
        <div>
          <dt>Lucro bruto unitário (atual → novo)</dt>
          <dd>
            {r.lucroUnitarioAtual === null ? '—' : fmtMoeda(r.lucroUnitarioAtual)} → {r.lucroUnitarioNovo === null ? '—' : fmtMoeda(r.lucroUnitarioNovo)}
          </dd>
        </div>
        <div>
          <dt>Desconto aplicado</dt>
          <dd>{fmtPercentual(r.descontoPct)}</dd>
        </div>
        <div>
          <dt>Receita estimada</dt>
          <dd>{r.receita === null ? '—' : fmtMoeda(r.receita)}</dd>
        </div>
        <div>
          <dt>Resultado bruto estimado da venda</dt>
          <dd className={r.resultadoBruto !== null && r.resultadoBruto < 0 ? 'est-negativo' : ''}>{r.resultadoBruto === null ? '—' : fmtMoeda(r.resultadoBruto)}</dd>
        </div>
      </dl>

      <p className="est-dica">Simulação para apoiar a decisão: nenhum desconto é aplicado automaticamente.</p>

      {podeSalvarPreco && (
        <button type="button" className="btn-ghost" onClick={salvarPrecoAtual} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar este preço como preço de venda atual do produto'}
        </button>
      )}
    </div>
  );
}
