import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { descricaoDoProduto, salvarDescricaoProduto } from '../../utils/cartazPersistencia';
import { baixarArquivoDireto } from '../../utils/compartilharArquivo';
import {
  blobDoCanvas,
  CARTAZES_POR_FOLHA_OPCOES,
  desenharFolhaOfertas,
  layoutFolhaOferta,
  ofertasDaPlanilha,
  pdfDasFolhas,
  type OfertaCartaz,
  type OfertaLote,
} from '../../utils/cartazOfertaEngine';
import { NomeProdutoEditavel } from './NomeProdutoEditavel';

const FUNDO_OFICIAL = '/oferta-background.png';
const ROTULO_TAMANHO: Record<number, string> = { 1: '1 por folha · máximo', 2: '2 por folha · maior', 4: '4 por folha · grande', 6: '6 por folha · médio', 8: '8 por folha · pequeno', 9: '9 por folha', 10: '10 por folha · menor', 12: '12 por folha · compacto' };

function slug(texto: string) {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'oferta';
}

/**
 * Cartaz de oferta pra imprimir em A4 — trazido do "Gerador de cartazes de
 * oferta" do projeto Drogaria Center (ver cartazOfertaEngine.ts). Cartaz
 * individual (várias cópias por folha) ou lote por planilha; no lote, os
 * nomes passam pelo dicionário de descrições da farmácia, como no Panfleto.
 */
interface CartazOfertaModoProps {
  /** Ofertas enviadas pelo Importar planilha ("Gerar cartazes de oferta") — null quando não há nada pendente. */
  ofertasRecebidas?: OfertaLote[] | null;
  /** Avisa que `ofertasRecebidas` já virou o lote, pra não importar de novo a cada render. */
  aoReceberOfertas?: () => void;
}

export function CartazOfertaModo({ ofertasRecebidas, aoReceberOfertas }: CartazOfertaModoProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputFundoRef = useRef<HTMLInputElement>(null);
  const [fundo, setFundo] = useState<HTMLImageElement | null>(null);
  const [nomeFundo, setNomeFundo] = useState('Modelo oficial');
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState<'individual' | 'lote'>('individual');
  const [oferta, setOferta] = useState<OfertaCartaz>({ produto: 'SONRIDOR RAPID+FORTE 4CP REV', precoAntigo: '7,99', preco: '1,99' });
  const [quantidade, setQuantidade] = useState('2');
  const [porFolhaIndividual, setPorFolhaIndividual] = useState(2);
  const [lote, setLote] = useState<OfertaLote[]>([]);
  const [nomeArquivoLote, setNomeArquivoLote] = useState('');
  const [porFolhaLote, setPorFolhaLote] = useState(8);
  const [pagina, setPagina] = useState(0);
  const [gerando, setGerando] = useState('');

  function carregarFundo(src: string, nome: string, revogar = false) {
    const img = new Image();
    img.onload = () => {
      setFundo(img);
      setNomeFundo(nome);
      setErro('');
      if (revogar) URL.revokeObjectURL(src);
    };
    img.onerror = () => {
      setErro(revogar ? 'Não foi possível abrir essa imagem. Use PNG, JPG ou WEBP.' : 'Não foi possível carregar o modelo oficial do cartaz.');
      if (revogar) URL.revokeObjectURL(src);
    };
    img.src = src;
  }

  useEffect(() => carregarFundo(FUNDO_OFICIAL, 'Modelo oficial'), []);

  useEffect(() => {
    if (!ofertasRecebidas || ofertasRecebidas.length === 0) return;
    setLote(ofertasRecebidas);
    setNomeArquivoLote('Produtos do Importar planilha');
    setModo('lote');
    setPagina(0);
    aoReceberOfertas?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofertasRecebidas]);

  const copias = Math.max(1, Math.min(999, Math.round(Number(quantidade) || 1)));
  const porFolha = modo === 'individual' ? porFolhaIndividual : porFolhaLote;
  const totalItens = modo === 'individual' ? copias : lote.length;
  const totalPaginas = Math.max(1, Math.ceil(totalItens / porFolha));
  const paginaValida = Math.min(pagina, totalPaginas - 1);

  function ofertasDaPagina(i: number): OfertaCartaz[] {
    if (modo === 'individual') return Array.from({ length: Math.max(0, Math.min(porFolha, copias - i * porFolha)) }, () => oferta);
    return lote.slice(i * porFolha, (i + 1) * porFolha);
  }

  useEffect(() => {
    if (fundo && canvasRef.current) desenharFolhaOfertas(canvasRef.current, fundo, ofertasDaPagina(paginaValida), porFolha);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundo, modo, oferta, copias, porFolha, lote, paginaValida]);

  function folhas() {
    return Array.from({ length: totalPaginas }, (_, i) => {
      const canvas = document.createElement('canvas');
      desenharFolhaOfertas(canvas, fundo!, ofertasDaPagina(i), porFolha);
      return canvas;
    });
  }

  const base = modo === 'individual' ? `cartaz-${slug(oferta.produto)}-${copias}-copias` : `cartazes-oferta-${lote.length}-itens`;

  async function baixar(formato: 'pdf' | 'png' | 'jpg' | 'zip') {
    if (!fundo || !canvasRef.current || totalItens === 0) return;
    setGerando(formato);
    setErro('');
    try {
      if (formato === 'pdf') await baixarArquivoDireto(await pdfDasFolhas(folhas()), `${base}.pdf`, 'application/pdf');
      else if (formato === 'zip') {
        const zip = new JSZip();
        const digitos = String(totalPaginas).length;
        const blobs = await Promise.all(folhas().map((f) => blobDoCanvas(f, 'image/png')));
        blobs.forEach((b, i) => zip.file(`${base}-pagina-${String(i + 1).padStart(digitos, '0')}-de-${totalPaginas}.png`, b));
        await baixarArquivoDireto(await zip.generateAsync({ type: 'blob', compression: 'STORE' }), `${base}.zip`, 'application/zip');
      } else {
        const mime = formato === 'png' ? 'image/png' : 'image/jpeg';
        await baixarArquivoDireto(await blobDoCanvas(canvasRef.current, mime, 0.96), `${base}-pagina-${paginaValida + 1}.${formato}`, mime);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível gerar o arquivo.');
    } finally {
      setGerando('');
    }
  }

  async function importarPlanilha(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    try {
      const workbook = XLSX.read(await arquivo.arrayBuffer(), { type: 'array' });
      setLote(ofertasDaPlanilha(XLSX, workbook).map((o) => ({ ...o, produtoOriginal: o.produto, produto: descricaoDoProduto(o.produto) })));
      setNomeArquivoLote(arquivo.name);
      setPagina(0);
    } catch (ex) {
      setErro(ex instanceof Error ? ex.message : 'Não foi possível ler a planilha.');
    }
  }

  function escolherFundo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/') && !/\.(png|jpe?g|webp)$/i.test(arquivo.name)) return setErro('Escolha uma imagem PNG, JPG ou WEBP.');
    if (arquivo.size > 20 * 1024 * 1024) return setErro('A imagem deve ter no máximo 20 MB.');
    carregarFundo(URL.createObjectURL(arquivo), arquivo.name, true);
  }

  function editarDescricaoLote(i: number, novo: string) {
    const alvo = lote[i];
    salvarDescricaoProduto(alvo.produtoOriginal, alvo.ean, novo);
    setLote((atual) => atual.map((o) => (o.produtoOriginal === alvo.produtoOriginal && o.ean === alvo.ean ? { ...o, produto: descricaoDoProduto(o.produtoOriginal, o.ean) } : o)));
  }

  const semConteudo = !fundo || totalItens === 0;
  const orientacao = layoutFolhaOferta(porFolha).orientacao === 'paisagem' ? 'horizontal' : 'vertical';

  return (
    <div className="cartaz-cols">
      <div className="card cartaz-painel">
        <div className="folgas-segmented cartaz-oferta-modos" role="tablist" aria-label="Modo de criação">
          <button type="button" role="tab" aria-selected={modo === 'individual'} className={modo === 'individual' ? 'active' : ''} onClick={() => { setModo('individual'); setPagina(0); }}>Cartaz individual</button>
          <button type="button" role="tab" aria-selected={modo === 'lote'} className={modo === 'lote' ? 'active' : ''} onClick={() => { setModo('lote'); setPagina(0); }}>Lote por planilha</button>
        </div>

        {modo === 'individual' ? (
          <>
            <h3 className="cartaz-titulo-secao">Dados da oferta</h3>
            <div className="field">
              <label htmlFor="oferta-produto">Nome do produto</label>
              <textarea id="oferta-produto" maxLength={70} value={oferta.produto} onChange={(e) => setOferta({ ...oferta, produto: e.target.value })} placeholder="Ex.: SONRIDOR RAPID+FORTE 4CP REV" />
            </div>
            <div className="field-row">
              <div className="field"><label htmlFor="oferta-de">Preço anterior</label><input id="oferta-de" inputMode="decimal" value={oferta.precoAntigo} onChange={(e) => setOferta({ ...oferta, precoAntigo: e.target.value })} placeholder="7,99" /></div>
              <div className="field"><label htmlFor="oferta-por">Preço da oferta</label><input id="oferta-por" inputMode="decimal" value={oferta.preco} onChange={(e) => setOferta({ ...oferta, preco: e.target.value })} placeholder="1,99" /></div>
            </div>
            <div className="field-row">
              <div className="field"><label htmlFor="oferta-qtd">Quantidade de cartazes</label><input id="oferta-qtd" type="number" min={1} max={999} value={quantidade} onChange={(e) => { setQuantidade(e.target.value); setPagina(0); }} onBlur={() => setQuantidade(String(copias))} /></div>
              <div className="field">
                <label htmlFor="oferta-por-folha">Tamanho na folha A4</label>
                <select id="oferta-por-folha" value={porFolhaIndividual} onChange={(e) => { setPorFolhaIndividual(Number(e.target.value)); setPagina(0); }}>
                  {CARTAZES_POR_FOLHA_OPCOES.filter((n) => n > 1).map((n) => <option key={n} value={n}>{ROTULO_TAMANHO[n]}</option>)}
                </select>
              </div>
            </div>
          </>
        ) : (
          <>
            <h3 className="cartaz-titulo-secao">Importe sua planilha</h3>
            <p className="footnote" style={{ textAlign: 'left', marginTop: 0 }}>A planilha precisa das colunas <b>Produto</b>, <b>Vlr.Promoção</b> e <b>Preço Normal</b>.</p>
            <label className="btn-ghost cartaz-oferta-upload">
              📂 Selecionar arquivo XLS ou XLSX
              <input type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={importarPlanilha} />
            </label>
            {nomeArquivoLote && <p className="footnote" style={{ textAlign: 'left' }}><b>{nomeArquivoLote}</b> · {lote.length} ofertas</p>}
            <div className="field">
              <label htmlFor="oferta-por-folha-lote">Cartazes por folha</label>
              <select id="oferta-por-folha-lote" value={porFolhaLote} onChange={(e) => { setPorFolhaLote(Number(e.target.value)); setPagina(0); }}>
                {CARTAZES_POR_FOLHA_OPCOES.map((n) => <option key={n} value={n}>{ROTULO_TAMANHO[n]}</option>)}
              </select>
            </div>
            {lote.length > 0 && (
              <div className="cartaz-oferta-lista">
                {lote.map((o, i) => (
                  <div className="product-row" key={`${o.produtoOriginal}-${i}`}>
                    <div className="pinfo">
                      <NomeProdutoEditavel className="pname" nome={o.produto} onSalvar={(novo) => editarDescricaoLote(i, novo)} />
                      <div className="pprice">De R$ {String(o.precoAntigo)} · Por R$ {String(o.preco)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <h3 className="cartaz-titulo-secao" style={{ marginTop: 18 }}>Fundo do cartaz</h3>
        <p className="footnote" style={{ textAlign: 'left', marginTop: 0 }}>Usando: <b>{nomeFundo}</b></p>
        <div className="cartaz-oferta-acoes">
          <button type="button" className="btn-ghost" onClick={() => inputFundoRef.current?.click()}>🖼️ Usar outra imagem</button>
          {nomeFundo !== 'Modelo oficial' && <button type="button" className="btn-ghost" onClick={() => carregarFundo(FUNDO_OFICIAL, 'Modelo oficial')}>Voltar ao modelo oficial</button>}
          <input ref={inputFundoRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={escolherFundo} />
        </div>

        <h3 className="cartaz-titulo-secao" style={{ marginTop: 18 }}>Baixar</h3>
        <div className="cartaz-oferta-acoes">
          <button type="button" className="btn-primary" disabled={semConteudo || !!gerando} onClick={() => void baixar('pdf')}>{gerando === 'pdf' ? 'Gerando PDF…' : '⬇️ PDF completo'}</button>
          {modo === 'lote' && <button type="button" className="btn-ghost" disabled={semConteudo || !!gerando} onClick={() => void baixar('zip')}>{gerando === 'zip' ? 'Gerando…' : '⬇️ Todas as páginas (ZIP)'}</button>}
          <button type="button" className="btn-ghost" disabled={semConteudo || !!gerando} onClick={() => void baixar('png')}>⬇️ PNG da página</button>
          {modo === 'individual' && <button type="button" className="btn-ghost" disabled={semConteudo || !!gerando} onClick={() => void baixar('jpg')}>⬇️ JPG da página</button>}
        </div>
        <p className="footnote" style={{ textAlign: 'left' }}>O PDF traz todas as folhas A4. PNG e JPG baixam a folha mostrada na prévia.</p>
        {erro && <p className="error-text" role="alert">{erro}</p>}
      </div>

      <div className="cartaz-preview">
        <div className="cartaz-preview-head">
          <strong>Prévia da folha A4</strong>
          <span>A4 {orientacao} · {porFolha} por folha · Página {paginaValida + 1} de {totalPaginas}</span>
        </div>
        {modo === 'lote' && lote.length === 0 ? (
          <div className="empty-note">Envie uma planilha para ver o lote.</div>
        ) : (
          <div className="cartaz-canvas-frame cartaz-oferta-frame">
            <canvas ref={canvasRef} className="cartaz-canvas" aria-label="Prévia da folha A4 com cartazes de oferta" />
          </div>
        )}
        {totalPaginas > 1 && (
          <div className="panfleto-paginacao">
            <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} disabled={paginaValida === 0} onClick={() => setPagina(paginaValida - 1)}>◀</button>
            <span>Página {paginaValida + 1}/{totalPaginas}</span>
            <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} disabled={paginaValida >= totalPaginas - 1} onClick={() => setPagina(paginaValida + 1)}>▶</button>
          </div>
        )}
      </div>
    </div>
  );
}
