import { useRef, useState, type DragEvent } from 'react';
import type { PedidoCota, RelatorioTrier } from '../../utils/critica/tipos';
import { fmtInteiro, fmtMoeda } from '../../utils/estoqueFormat';

export type TipoDocumento = 'COTAPRECO' | 'TRIER';

interface Props {
  pedido: PedidoCota | null;
  relatorio: RelatorioTrier | null;
  nomeCota: string | null;
  nomeTrier: string | null;
  lendo: boolean;
  erros: string[];
  /** Documento trocado/removido desde que a crítica foi aberta do banco (ainda não gravado). */
  alterados: { cota: boolean; trier: boolean };
  onArquivos: (arquivos: File[]) => void;
  /** Troca o documento daquele cartão: o PDF tem que ser do tipo certo. */
  onTrocar: (tipo: TipoDocumento, arquivo: File) => void;
  onRemover: (tipo: TipoDocumento) => void;
  onLimpar: () => void;
}

/** Botões de cada cartão: escolher/trocar o PDF só daquele documento, ou tirá-lo. */
function AcoesDoCartao({ tipo, tem, lendo, onTrocar, onRemover }: { tipo: TipoDocumento; tem: boolean; lendo: boolean; onTrocar: Props['onTrocar']; onRemover: Props['onRemover'] }) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <div className="crit-doc-acoes">
      <input
        ref={entrada}
        type="file"
        accept=".pdf,application/pdf"
        hidden
        onChange={(e) => {
          const arquivo = e.target.files?.[0];
          if (arquivo) onTrocar(tipo, arquivo);
          if (entrada.current) entrada.current.value = '';
        }}
      />
      <button type="button" className="btn-ghost" disabled={lendo} onClick={() => entrada.current?.click()}>
        {tem ? '🔄 Trocar arquivo' : '📎 Escolher arquivo'}
      </button>
      {tem && (
        <button type="button" className="btn-ghost crit-remover" disabled={lendo} onClick={() => onRemover(tipo)}>
          🗑️ Remover
        </button>
      )}
    </div>
  );
}

/**
 * Uma área só pros dois PDFs: o sistema descobre pelo conteúdo qual é o do
 * CotaPreço e qual é o do Trier. Os cartões ao lado mostram o que foi lido de
 * cada um, pra a pessoa conferir antes de olhar a auditoria.
 */
export function EnvioDocumentos({ pedido, relatorio, nomeCota, nomeTrier, lendo, erros, alterados, onArquivos, onTrocar, onRemover, onLimpar }: Props) {
  const entrada = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  /** Com os dois documentos lidos, a área de envio encolhe para uma faixa (continua aceitando arrastar/clicar). */
  const completo = !!pedido && !!relatorio;

  function aoSoltar(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setArrastando(false);
    onArquivos([...e.dataTransfer.files]);
  }

  return (
    <section className="card crit-envio crit-nao-imprimir">
      <label
        className={`crit-dropzone ${arrastando ? 'ativa' : ''} ${completo ? 'compacta' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={aoSoltar}
      >
        <input
          ref={entrada}
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={(e) => {
            onArquivos([...(e.target.files ?? [])]);
            if (entrada.current) entrada.current.value = '';
          }}
        />
        {completo ? (
          <>
            <strong>{lendo ? 'Lendo os PDFs…' : '＋ Enviar outros PDFs'}</strong>
            <small>clique ou arraste — o documento do mesmo tipo é substituído</small>
          </>
        ) : (
          <>
            <span className="crit-dropzone-icone">📑</span>
            <strong>{lendo ? 'Lendo os PDFs…' : 'Clique para escolher ou arraste os 2 PDFs aqui'}</strong>
            <small>O pedido de compra do CotaPreço e o relatório “Compras por preço de venda” do Trier, em qualquer ordem. Os arquivos são lidos no seu navegador e não são enviados a lugar nenhum.</small>
          </>
        )}
      </label>

      {erros.map((erro, i) => (
        <p key={i} className="error-text" role="alert">
          {erro}
        </p>
      ))}

      <div className="crit-docs">
        <div className={`crit-doc ${pedido ? 'ok' : ''}`}>
          <h3>CotaPreço — pedido de compra</h3>
          {pedido ? (
            <ul>
              <li className="crit-arquivo">
                {nomeCota ?? 'PDF original não guardado'}
                {alterados.cota && <span className="crit-trocado"> · trocado, falta salvar</span>}
              </li>
              <li>
                Pedido <strong>{pedido.numero ?? '—'}</strong> · {pedido.cotacao ?? ''}
              </li>
              {pedido.pedidos && pedido.pedidos.length > 1 ? (
                <li>
                  <strong>{pedido.pedidos.length} distribuidoras</strong> neste PDF:
                  <ul className="crit-distribuidoras-lista">
                    {pedido.pedidos.map((p, i) => (
                      <li key={i}>
                        🏭 {p.distribuidora} <small>· {fmtInteiro(p.itens)} itens{p.totalDeclarado !== null ? ` · ${fmtMoeda(p.totalDeclarado)}` : ''}</small>
                      </li>
                    ))}
                  </ul>
                </li>
              ) : (
                <li>{pedido.distribuidora ?? 'Distribuidora não informada'}</li>
              )}
              <li>
                <strong>{fmtInteiro(pedido.itens.length)}</strong> itens · total {pedido.totalDeclarado !== null ? fmtMoeda(pedido.totalDeclarado) : 'não informado'}
              </li>
            </ul>
          ) : (
            <p className="crit-vazio">{alterados.cota ? 'Removido.' : 'Ainda não enviado.'}</p>
          )}
          <AcoesDoCartao tipo="COTAPRECO" tem={!!pedido} lendo={lendo} onTrocar={onTrocar} onRemover={onRemover} />
        </div>
        <div className={`crit-doc ${relatorio ? 'ok' : ''}`}>
          <h3>Trier — compras por preço de venda</h3>
          {relatorio ? (
            <ul>
              <li className="crit-arquivo">
                {nomeTrier ?? 'PDF original não guardado'}
                {alterados.trier && <span className="crit-trocado"> · trocado, falta salvar</span>}
              </li>
              <li>
                Período <strong>{relatorio.periodo ?? '—'}</strong> · {relatorio.filial ?? ''}
              </li>
              <li>Fornecedor: {relatorio.fornecedor ?? 'não informado'}</li>
              <li>
                <strong>{fmtInteiro(relatorio.itens.length)}</strong> produtos · total líquido {relatorio.totalLiquido !== null ? fmtMoeda(relatorio.totalLiquido) : 'não informado'}
              </li>
            </ul>
          ) : (
            <p className="crit-vazio">{alterados.trier ? 'Removido.' : 'Ainda não enviado.'}</p>
          )}
          <AcoesDoCartao tipo="TRIER" tem={!!relatorio} lendo={lendo} onTrocar={onTrocar} onRemover={onRemover} />
        </div>
      </div>

      {(pedido || relatorio) && (
        <button type="button" className="btn-ghost" onClick={onLimpar}>
          Limpar e começar outra crítica
        </button>
      )}
    </section>
  );
}
