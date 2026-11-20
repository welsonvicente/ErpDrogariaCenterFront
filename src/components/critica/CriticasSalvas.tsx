import type { CriticaSalva } from '../../services/criticaPedidoService';
import type { Veredito } from '../../utils/critica/auditoria';
import { fmtDataHora, fmtMoeda } from '../../utils/estoqueFormat';

const SELO: Record<Veredito, { texto: string; classe: string }> = {
  APROVADO: { texto: 'Aprovado', classe: 'crit-selo-ok' },
  APROVADO_COM_RESSALVAS: { texto: 'Com ressalvas', classe: 'crit-selo-aviso' },
  REPROVADO: { texto: 'Reprovado', classe: 'crit-selo-erro' },
};

const ORDEM: Array<[string, string]> = [
  ['DIVERGENCIA', 'divergência(s)'],
  ['AUSENTE', 'ausente(s)'],
  ['NAO_CONFIRMADO', 'a confirmar'],
  ['ATENCAO', 'atenção'],
  ['EXTRA', 'extra(s)'],
  ['OK', 'OK'],
];

interface Props {
  criticas: CriticaSalva[];
  abertaId: string | null;
  carregando: boolean;
  onAbrir: (id: string) => void;
  onExcluir: (c: CriticaSalva) => void;
  onBaixarPdf: (c: CriticaSalva, qual: 'cota' | 'trier') => void;
}

/** As conferências já salvas no banco: reabrir, baixar os PDFs originais ou excluir. */
export function CriticasSalvas({ criticas, abertaId, carregando, onAbrir, onExcluir, onBaixarPdf }: Props) {
  return (
    <details className="card crit-salvas crit-nao-imprimir" open={criticas.length > 0 && !abertaId}>
      <summary>📚 Críticas salvas ({criticas.length})</summary>
      {carregando ? (
        <p className="est-dica">Carregando…</p>
      ) : criticas.length === 0 ? (
        <p className="est-dica">Nenhuma crítica salva ainda. Depois de conferir um pedido, use “Salvar no banco” para guardar.</p>
      ) : (
        <div className="crit-tabela-rolagem">
          <table className="data-table crit-tabela">
            <thead>
              <tr>
                <th>Salva em</th>
                <th>Crítica</th>
                <th>Resultado</th>
                <th>Itens</th>
                <th className="crit-dir">Pedido</th>
                <th className="crit-dir">Diferença</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {criticas.map((c) => (
                <tr key={c.id} className={c.id === abertaId ? 'crit-linha-aberta' : ''}>
                  <td>
                    {fmtDataHora(c.criadoEm)}
                    {c.usuarioNome && <small className="crit-sub">{c.usuarioNome}</small>}
                  </td>
                  <td>
                    <strong>{c.titulo}</strong>
                    <small className="crit-sub">{[c.distribuidora, c.numeroPedido && `pedido ${c.numeroPedido}`, c.periodoTrier && `Trier ${c.periodoTrier}`].filter(Boolean).join(' · ')}</small>
                  </td>
                  <td>
                    <span className={`crit-selo-veredito ${SELO[c.veredito].classe}`}>{SELO[c.veredito].texto}</span>
                  </td>
                  <td className="crit-contagens">{ORDEM.filter(([k]) => c.contagens[k]).map(([k, rotulo]) => `${c.contagens[k]} ${rotulo}`).join(' · ')}</td>
                  <td className="crit-dir">{c.totalPedido === null ? '—' : fmtMoeda(c.totalPedido)}</td>
                  <td className="crit-dir">{c.diferenca === null ? '—' : fmtMoeda(c.diferenca)}</td>
                  <td>
                    <div className="crit-mini-acoes">
                      <button type="button" className="crit-mini crit-mini-principal" onClick={() => onAbrir(c.id)}>
                        Abrir
                      </button>
                      {c.temPdfCota && (
                        <button type="button" className="crit-mini" onClick={() => onBaixarPdf(c, 'cota')} title={`Baixar o PDF original do CotaPreço${c.pdfCotaNome ? `: ${c.pdfCotaNome}` : ''}`}>
                          ⬇ Cota
                        </button>
                      )}
                      {c.temPdfTrier && (
                        <button type="button" className="crit-mini" onClick={() => onBaixarPdf(c, 'trier')} title={`Baixar o PDF original do Trier${c.pdfTrierNome ? `: ${c.pdfTrierNome}` : ''}`}>
                          ⬇ Trier
                        </button>
                      )}
                      <button type="button" className="crit-mini crit-mini-perigo" onClick={() => onExcluir(c)} title="Excluir esta crítica e os PDFs guardados" aria-label={`Excluir a crítica ${c.titulo}`}>
                        🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}
