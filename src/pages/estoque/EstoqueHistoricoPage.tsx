import { useEffect, useState } from 'react';
import { Modal, Painel } from '../../components/estoque/Elementos';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { estoqueService, mensagemDeErro, type AbaHistorico } from '../../services/estoqueService';
import type { HistoricoEstoque, ImportacaoEstoque, ModoImportacao } from '../../types/estoque';
import { NAO_INFORMADO, fmtDataHora, fmtInteiro } from '../../utils/estoqueFormat';
import { valorLegivel } from '../../utils/estoqueHistorico';

const ABAS: Array<[AbaHistorico, string]> = [
  ['importacoes', 'Importações'],
  ['alteracoes', 'Alterações'],
  ['acoes', 'Ações executadas'],
];

const ROTULO_MODO: Record<ModoImportacao, string> = {
  ATUALIZAR: 'Atualização (manteve ações)',
  SUBSTITUIR: 'Substituição total',
  RESTAURACAO: 'Restauração',
};

/** Histórico: importações (com opção de restaurar), alterações manuais e a trilha de ações executadas. */
export function EstoqueHistoricoPage() {
  useDocumentTitle('Histórico — Estoque');
  const { importacoes, ultimaImportacao } = useEstoque();
  const [aba, setAba] = useState<AbaHistorico>('importacoes');

  return (
    <div className="est-pagina">
      <p className="est-dica">
        {ultimaImportacao ? (
          <>
            Última atualização dos dados: <strong>{fmtDataHora(ultimaImportacao.criadoEm)}</strong> ({ultimaImportacao.nomeArquivo}).
          </>
        ) : (
          'Nenhuma importação feita ainda.'
        )}
      </p>

      <div className="nav-tabs">
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

      {aba === 'importacoes' ? <Importacoes lista={importacoes} /> : <Registros aba={aba} />}
    </div>
  );
}

function Importacoes({ lista }: { lista: ImportacaoEstoque[] }) {
  const { restaurar, avisar } = useEstoque();
  const [candidata, setCandidata] = useState<ImportacaoEstoque | null>(null);
  const [restaurando, setRestaurando] = useState(false);
  const [baixando, setBaixando] = useState<string | null>(null);

  async function baixarOriginal(i: ImportacaoEstoque) {
    setBaixando(i.id);
    try {
      await estoqueService.baixarArquivoOriginal(i.id, i.nomeArquivo);
    } catch (e) {
      avisar(mensagemDeErro(e, 'Não foi possível baixar o arquivo.'));
    } finally {
      setBaixando(null);
    }
  }

  async function confirmar() {
    if (!candidata) return;
    setRestaurando(true);
    try {
      await restaurar(candidata.id);
      avisar('Importação restaurada. Suas ações e observações atuais foram mantidas.');
      setCandidata(null);
    } catch (e) {
      avisar(mensagemDeErro(e));
    } finally {
      setRestaurando(false);
    }
  }

  if (!lista.length) return <Painel>Nenhuma importação registrada.</Painel>;

  return (
    <Painel titulo="Importações do relatório do Trier">
      <div className="est-tabela-rolagem">
        <table className="data-table est-tabela">
          <thead>
            <tr>
              <th>Data</th>
              <th>Arquivo</th>
              <th>Tipo</th>
              <th className="est-direita">Produtos</th>
              <th>Resultado</th>
              <th>Por</th>
              <th>Arquivo original</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lista.map((i, indice) => (
              <tr key={i.id}>
                <td>{fmtDataHora(i.criadoEm)}</td>
                <td>
                  <strong>{i.nomeArquivo}</strong>
                </td>
                <td>{ROTULO_MODO[i.modo]}</td>
                <td className="est-direita">{fmtInteiro(i.totalProdutos)}</td>
                <td>
                  {i.resumo.novos} novos · {i.resumo.atualizados} atualizados
                  {i.resumo.saiuDoRelatorio > 0 && ` · ${i.resumo.saiuDoRelatorio} saíram do relatório`}
                  {i.resumo.removidos > 0 && ` · ${i.resumo.removidos} apagados`}
                  {i.resumo.ignoradas > 0 && ` · ${i.resumo.ignoradas} linhas ignoradas`}
                </td>
                <td>{i.usuarioNome ?? NAO_INFORMADO}</td>
                <td>
                  {i.arquivoTamanho ? (
                    <button type="button" className="btn-ghost" onClick={() => void baixarOriginal(i)} disabled={baixando === i.id}>
                      {baixando === i.id ? 'Baixando…' : `⬇️ Baixar (${Math.max(1, Math.round(i.arquivoTamanho / 1024))} KB)`}
                    </button>
                  ) : (
                    <span className="est-nao-informado">não guardado</span>
                  )}
                </td>
                <td>
                  {indice > 0 && (
                    <button type="button" className="btn-ghost" onClick={() => setCandidata(i)}>
                      ↺ Restaurar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {candidata && (
        <Modal titulo="Restaurar importação" onFechar={() => setCandidata(null)}>
          <p>
            Reaplicar os dados do relatório de <strong>{fmtDataHora(candidata.criadoEm)}</strong> (<em>{candidata.nomeArquivo}</em>, {fmtInteiro(candidata.totalProdutos)} produtos)?
          </p>
          <p className="est-dica">
            Quantidades, custos e datas voltam ao que aquele arquivo trazia. Planos de ação, status, responsáveis e observações que você já cadastrou <strong>não são alterados</strong>. Produtos que não estavam naquele arquivo ficam marcados como “fora do
            relatório”.
          </p>
          <div className="est-modal-rodape">
            <button type="button" className="btn-ghost" onClick={() => setCandidata(null)}>
              Cancelar
            </button>
            <button type="button" className="btn-primary" onClick={() => void confirmar()} disabled={restaurando}>
              {restaurando ? 'Restaurando…' : 'Restaurar'}
            </button>
          </div>
        </Modal>
      )}
    </Painel>
  );
}

function Registros({ aba }: { aba: Exclude<AbaHistorico, 'importacoes'> }) {
  const [itens, setItens] = useState<HistoricoEstoque[] | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let ativo = true;
    setItens(null);
    estoqueService
      .historico({ aba, limite: 500 })
      .then((l) => ativo && setItens(l))
      .catch((e) => ativo && setErro(mensagemDeErro(e)));
    return () => {
      ativo = false;
    };
  }, [aba]);

  if (erro) return <p className="error-text">{erro}</p>;
  if (itens === null) return <p>Carregando…</p>;
  if (!itens.length) return <Painel>{aba === 'acoes' ? 'Nenhuma mudança de status registrada ainda.' : 'Nenhuma alteração registrada ainda.'}</Painel>;

  return (
    <Painel titulo={aba === 'acoes' ? 'Mudanças de status das ações' : 'Alterações feitas à mão'}>
      <div className="est-tabela-rolagem">
        <table className="data-table est-tabela">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Produto</th>
              <th>Campo</th>
              <th>De</th>
              <th>Para</th>
              <th>Por</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((h) => (
              <tr key={h.id}>
                <td>{fmtDataHora(h.criadoEm)}</td>
                <td>{h.produtoNome ? <><strong>{h.produtoNome}</strong> <small>({h.codigoTrier})</small></> : '—'}</td>
                <td>{h.campo ?? h.descricao ?? '—'}</td>
                <td>{h.tipo === 'CONFIG' ? '—' : valorLegivel(h.campo, h.valorAnterior)}</td>
                <td>{h.tipo === 'CONFIG' ? '—' : valorLegivel(h.campo, h.valorNovo)}</td>
                <td>{h.usuarioNome ?? NAO_INFORMADO}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Painel>
  );
}
