import { useMemo, useState } from 'react';
import { Painel, SemDados, SeloPrioridade } from '../../components/estoque/Elementos';
import { SimuladorPreco } from '../../components/estoque/SimuladorPreco';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { filtrarProdutos } from '../../utils/estoqueAnalise';
import { fmtMoeda, fmtQuantidade } from '../../utils/estoqueFormat';

/** Simulador de preços e margem: escolhe um produto (ou simula "no vazio") e compara preço atual × novo. */
export function EstoqueSimuladorPage() {
  useDocumentTitle('Simulador de preços');
  const { analisados } = useEstoque();
  const [busca, setBusca] = useState('');
  const [escolhidoId, setEscolhidoId] = useState<string | null>(null);
  const [semProduto, setSemProduto] = useState(false);

  const resultados = useMemo(() => (busca.trim() ? filtrarProdutos(analisados, { busca }).slice(0, 8) : []), [analisados, busca]);
  const escolhido = analisados.find((p) => p.id === escolhidoId);

  if (!analisados.length) return <SemDados />;

  return (
    <div className="est-pagina est-pagina-estreita">
      <Painel titulo="1. Escolha o produto">
        <label className="field">
          <span>Buscar por nome, código Trier ou código de barras</span>
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite para buscar…" autoFocus />
        </label>
        {resultados.length > 0 && (
          <ul className="est-resultados-busca">
            {resultados.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => {
                    setEscolhidoId(p.id);
                    setSemProduto(false);
                    setBusca('');
                  }}
                >
                  <strong>{p.produto}</strong>
                  <small>
                    {p.codigoTrier} · {fmtQuantidade(p.saldo)} unid. · custo {fmtMoeda(p.custoUnitario)}
                  </small>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!escolhido && !semProduto && (
          <button type="button" className="est-link" onClick={() => setSemProduto(true)}>
            Prefiro simular sem escolher um produto
          </button>
        )}
      </Painel>

      {(escolhido || semProduto) && (
        <Painel
          titulo={escolhido ? escolhido.produto : 'Simulação livre'}
          acoes={escolhido && <SeloPrioridade prioridade={escolhido.prioridade} />}
        >
          <SimuladorPreco key={escolhido?.id ?? 'livre'} produto={escolhido} />
        </Painel>
      )}
    </div>
  );
}
