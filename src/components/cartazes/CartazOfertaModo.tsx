import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { carregarImagemDeArquivo, carregarImagemEBlobDeArquivo } from '../../utils/arquivoImagem';
import { arquivoCartazService } from '../../services/arquivoCartazService';
import { descricaoDoProduto, salvarDescricaoProduto, type FolhaCartazOferta } from '../../utils/cartazPersistencia';
import { carregarFundoDoServidor, enviarFundoParaServidor, type FundoNoServidor } from '../../utils/fundoNoServidor';
import { campanhaCartazService, type CampanhaCartaz } from '../../services/campanhaCartazService';
import { baixarArquivoDireto } from '../../utils/compartilharArquivo';
import {
  blobDoCanvas,
  CABECALHO_ORIGINAL,
  CARTAZES_POR_FOLHA_OPCOES,
  CORES_ORIGINAIS_CARTAZ,
  type CoresCartaz,
  desenharFolhaOfertas,
  layoutFolhaOferta,
  ofertasDaPlanilha,
  pdfDasFolhas,
  type OfertaCartaz,
  type OfertaLote,
} from '../../utils/cartazOfertaEngine';
import { EditorProdutoPanfleto, precoParaExibir, type EdicaoProdutoPanfleto } from './EditorProdutoPanfleto';

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
  /** Campanha aberta — a folha (dados, lote, página e fundo) é desta campanha, salva no servidor. */
  campanha: CampanhaCartaz;
}

export function CartazOfertaModo({ ofertasRecebidas, aoReceberOfertas, campanha }: CartazOfertaModoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputFundoRef = useRef<HTMLInputElement>(null);
  // Abre com a folha desta campanha (vazia numa campanha nova = modelo e exemplo de sempre).
  const [folhaInicial] = useState<Partial<FolhaCartazOferta> | null>(() =>
    Object.keys(campanha.folhaOferta ?? {}).length > 0 ? (campanha.folhaOferta as Partial<FolhaCartazOferta>) : null,
  );
  const [fundo, setFundo] = useState<HTMLImageElement | null>(null);
  const [fundoSalvo, setFundoSalvo] = useState<FundoNoServidor | null>(folhaInicial?.fundo ?? null);
  const fundoMostradoRef = useRef<string | null | undefined>(undefined);
  const [enviandoFundo, setEnviandoFundo] = useState(false);
  const [nomeFundo, setNomeFundo] = useState('Modelo oficial');
  const [erro, setErro] = useState('');
  const [modo, setModo] = useState<'individual' | 'lote'>(folhaInicial?.modo ?? 'individual');
  const [oferta, setOferta] = useState<OfertaCartaz>(folhaInicial?.oferta ?? { produto: 'SONRIDOR RAPID+FORTE 4CP REV', precoAntigo: '7,99', preco: '1,99' });
  const [quantidade, setQuantidade] = useState(folhaInicial?.quantidade ?? '2');
  const [porFolhaIndividual, setPorFolhaIndividual] = useState(folhaInicial?.porFolhaIndividual ?? 2);
  const [lote, setLote] = useState<OfertaLote[]>(folhaInicial?.lote ?? []);
  const [nomeArquivoLote, setNomeArquivoLote] = useState(folhaInicial?.nomeArquivoLote ?? '');
  const [porFolhaLote, setPorFolhaLote] = useState(folhaInicial?.porFolhaLote ?? 8);
  const [pagina, setPagina] = useState(folhaInicial?.pagina ?? 0);
  const [gerando, setGerando] = useState('');
  /** Oferta do lote aberta no editor de descrição/preços. */
  const [editandoLote, setEditandoLote] = useState<number | null>(null);
  /** Cores das letras de todos os cartazes (vazio = originais do modelo). */
  const [cores, setCores] = useState<CoresCartaz>(folhaInicial?.cores ?? {});
  /** Cartaz do lote com o editor "cor só deste" aberto. */
  const [corDoItem, setCorDoItem] = useState<number | null>(null);
  /** Faixa "OFERTA" e logomarca (modelo oficial) — vazio = como no modelo. */
  const [cabecalho, setCabecalho] = useState<NonNullable<FolhaCartazOferta['cabecalho']>>(folhaInicial?.cabecalho ?? {});
  const [logoImagem, setLogoImagem] = useState<HTMLImageElement | null>(null);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const inputLogoRef = useRef<HTMLInputElement>(null);

  // Logomarca trocada: baixa do servidor quando muda (ao abrir a campanha, ou trocada aqui).
  const logoId = cabecalho.logo?.arquivoId ?? null;
  useEffect(() => {
    if (!logoId) return setLogoImagem(null);
    let cancelado = false;
    carregarFundoDoServidor(logoId)
      .then((img) => { if (!cancelado) setLogoImagem(img); })
      .catch(() => { if (!cancelado) setErro('Não foi possível baixar a logomarca salva — usando a original.'); });
    return () => { cancelado = true; };
  }, [logoId]);

  function carregarFundoOficial() {
    const img = new Image();
    img.onload = () => {
      setFundo(img);
      setNomeFundo('Modelo oficial');
    };
    img.onerror = () => setErro('Não foi possível carregar o modelo oficial do cartaz.');
    img.src = FUNDO_OFICIAL;
  }

  // Mostra o fundo da folha salva: o personalizado (baixado do R2) ou o modelo oficial.
  useEffect(() => {
    const id = fundoSalvo?.arquivoId ?? null;
    // Só pula o download se ESTA imagem já está na tela (acabou de ser escolhida aqui). A marca é feita
    // depois de baixar — marcar antes fazia um download cancelado (efeito rodando 2x ao abrir a tela)
    // impedir o próximo, e o fundo salvo não aparecia.
    if (id && fundoMostradoRef.current === id) return;
    if (!fundoSalvo) {
      fundoMostradoRef.current = null;
      return carregarFundoOficial();
    }
    let cancelado = false;
    carregarFundoDoServidor(fundoSalvo.arquivoId)
      .then((img) => {
        if (cancelado) return;
        fundoMostradoRef.current = id;
        setFundo(img);
        setNomeFundo(fundoSalvo.nome);
      })
      .catch(() => {
        if (cancelado) return;
        setErro('Não foi possível baixar o fundo salvo — usando o modelo oficial.');
        carregarFundoOficial();
      });
    return () => {
      cancelado = true;
    };
    // Depende só do ID: a sincronização das preferências reaplica o mesmo fundo como objeto novo, e
    // depender do objeto cancelava o download em andamento sem começar outro (o fundo não aparecia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundoSalvo?.arquivoId]);

  // Salva a folha (dados, quantidades, lote, página e fundo) na campanha — abre igual em qualquer aparelho da conta.
  const primeiraVezRef = useRef(true);
  useEffect(() => {
    if (primeiraVezRef.current) {
      primeiraVezRef.current = false; // acabou de abrir: nada mudou ainda
      return;
    }
    const folha: FolhaCartazOferta = { modo, oferta, quantidade, porFolhaIndividual, lote, nomeArquivoLote, porFolhaLote, pagina, fundo: fundoSalvo, cores, cabecalho };
    const timer = setTimeout(() => {
      campanhaCartazService
        .salvarFolhaOferta(campanha.id, folha as unknown as Record<string, unknown>)
        .catch(() => setErro('Não foi possível salvar a folha do cartaz agora. Confira a conexão — a próxima alteração tenta de novo.'));
    }, 800);
    return () => clearTimeout(timer);
  }, [campanha.id, modo, oferta, quantidade, porFolhaIndividual, lote, nomeArquivoLote, porFolhaLote, pagina, fundoSalvo, cores, cabecalho]);

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

  // Faixa e logo editáveis só no modelo oficial (com imagem própria, valem as da imagem).
  const usandoModeloOficial = !fundoSalvo;
  const cabecalhoDesenho = usandoModeloOficial ? { ...cabecalho, logoImagem: cabecalho.logo ? logoImagem : null } : undefined;

  function ofertasDaPagina(i: number): OfertaCartaz[] {
    if (modo === 'individual') return Array.from({ length: Math.max(0, Math.min(porFolha, copias - i * porFolha)) }, () => oferta);
    return lote.slice(i * porFolha, (i + 1) * porFolha);
  }

  useEffect(() => {
    if (fundo && canvasRef.current) desenharFolhaOfertas(canvasRef.current, fundo, ofertasDaPagina(paginaValida), porFolha, cores, cabecalhoDesenho);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundo, modo, oferta, copias, porFolha, lote, paginaValida, cores, cabecalho, logoImagem, fundoSalvo]);

  function folhas() {
    return Array.from({ length: totalPaginas }, (_, i) => {
      const canvas = document.createElement('canvas');
      desenharFolhaOfertas(canvas, fundo!, ofertasDaPagina(i), porFolha, cores, cabecalhoDesenho);
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

  async function escolherFundo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/') && !/\.(png|jpe?g|webp)$/i.test(arquivo.name)) return setErro('Escolha uma imagem PNG, JPG ou WEBP.');
    if (arquivo.size > 20 * 1024 * 1024) return setErro('A imagem deve ter no máximo 20 MB.');
    setErro('');
    setEnviandoFundo(true);
    try {
      // Mostra na hora e envia pro servidor — o fundo passa a valer em todos os aparelhos da conta.
      const img = await carregarImagemDeArquivo(arquivo);
      setFundo(img);
      setNomeFundo(arquivo.name);
      const arquivoId = await enviarFundoParaServidor(img, 1334);
      fundoMostradoRef.current = arquivoId; // já está na tela, não precisa baixar de volta
      setFundoSalvo({ nome: arquivo.name, arquivoId });
    } catch {
      setErro('Não foi possível salvar esse fundo no servidor. Confira a conexão e tente de novo.');
    } finally {
      setEnviandoFundo(false);
    }
  }

  /** Logomarca nova (PNG com fundo transparente fica melhor) — vai pro servidor e vale nesta campanha. */
  async function escolherLogo(e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro('');
    setEnviandoLogo(true);
    try {
      const { imagem, blob, mimeType } = await carregarImagemEBlobDeArquivo(arquivo);
      setLogoImagem(imagem);
      const arquivoId = await arquivoCartazService.enviarImagem(blob, mimeType);
      setCabecalho((c) => ({ ...c, logo: { nome: arquivo.name, arquivoId }, semLogo: false }));
    } catch {
      setErro('Não foi possível salvar essa logomarca. Confira a conexão e tente de novo.');
    } finally {
      setEnviandoLogo(false);
    }
  }

  const cabecalhoAlterado = Boolean(
    (cabecalho.texto != null && cabecalho.texto !== CABECALHO_ORIGINAL.texto) || cabecalho.corFaixa || cabecalho.corTexto || cabecalho.corLogo || cabecalho.semLogo || cabecalho.logo,
  );

  /** Descrição vai pro dicionário da farmácia; preços, só nesta oferta. */
  function salvarEdicaoLote(i: number, edicao: EdicaoProdutoPanfleto) {
    if (edicao.nome !== lote[i]?.produto) editarDescricaoLote(i, edicao.nome);
    setLote((atual) => atual.map((o, j) => (j === i ? { ...o, precoAntigo: edicao.de, preco: edicao.por } : o)));
    setEditandoLote(null);
  }

  function editarDescricaoLote(i: number, novo: string) {
    const alvo = lote[i];
    salvarDescricaoProduto(alvo.produtoOriginal, alvo.ean, novo);
    setLote((atual) => atual.map((o) => (o.produtoOriginal === alvo.produtoOriginal && o.ean === alvo.ean ? { ...o, produto: descricaoDoProduto(o.produtoOriginal, o.ean) } : o)));
  }

  /** Cor própria de um cartaz do lote (`null` em tudo = volta pra cor geral). */
  function definirCorDoItem(i: number, mudanca: CoresCartaz) {
    setLote((atual) =>
      atual.map((o, j) => {
        if (j !== i) return o;
        const novas = { ...o.cores, ...mudanca };
        const temAlguma = Boolean(novas.preco || novas.nome);
        return { ...o, cores: temAlguma ? novas : undefined };
      }),
    );
  }

  const corGeralPreco = cores.preco || CORES_ORIGINAIS_CARTAZ.preco;
  const corGeralNome = cores.nome || CORES_ORIGINAIS_CARTAZ.nome;
  const itensComCorPropria = lote.filter((o) => o.cores?.preco || o.cores?.nome).length;

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
                      {editandoLote === i ? (
                        <EditorProdutoPanfleto
                          inicial={{ nome: o.produto, de: String(o.precoAntigo ?? ''), por: String(o.preco ?? '') }}
                          onSalvar={(edicao) => salvarEdicaoLote(i, edicao)}
                          onCancelar={() => setEditandoLote(null)}
                        />
                      ) : (
                        <>
                          <div className="pname nome-produto-editavel">
                            <span>{o.produto}</span>
                            <button type="button" className="nome-produto-editar" title="Editar descrição e preços" aria-label={`Editar descrição e preços de ${o.produto}`} onClick={() => setEditandoLote(i)}>
                              ✏️
                            </button>
                          </div>
                          <div className="pprice">
                            {[precoParaExibir(o.precoAntigo) && `De ${precoParaExibir(o.precoAntigo)}`, `Por ${precoParaExibir(o.preco) || '—'}`].filter(Boolean).join(' · ')}
                          </div>
                          {corDoItem === i && (
                            <div className="oferta-cor-item">
                              <label>
                                <input type="color" value={o.cores?.preco || corGeralPreco} onChange={(e) => definirCorDoItem(i, { preco: e.target.value })} />
                                Preço, DE e POR
                              </label>
                              <label>
                                <input type="color" value={o.cores?.nome || corGeralNome} onChange={(e) => definirCorDoItem(i, { nome: e.target.value })} />
                                Nome
                              </label>
                              <button type="button" className="btn-ghost" disabled={!o.cores} onClick={() => definirCorDoItem(i, { preco: null, nome: null })}>↺ Usar as cores gerais</button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    {editandoLote !== i && (
                      <button
                        type="button"
                        className={`oferta-cor-botao${o.cores ? ' propria' : ''}`}
                        style={{ background: o.cores?.preco || corGeralPreco }}
                        title={o.cores ? 'Este cartaz tem cor própria — clique para mudar' : 'Mudar a cor só deste cartaz'}
                        aria-label={`Cor do cartaz de ${o.produto}`}
                        aria-expanded={corDoItem === i}
                        onClick={() => setCorDoItem(corDoItem === i ? null : i)}
                      >
                        {o.cores ? '★' : ''}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <h3 className="cartaz-titulo-secao" style={{ marginTop: 18 }}>Fundo do cartaz</h3>
        <p className="footnote" style={{ textAlign: 'left', marginTop: 0 }}>
          Usando: <b>{nomeFundo === 'Modelo oficial' ? 'Modelo oficial (padrão)' : nomeFundo}</b>
          {fundoSalvo && ' — salva na conta, aparece em todos os aparelhos.'}
        </p>
        <div className="cartaz-oferta-acoes">
          <button type="button" className="btn-ghost" disabled={enviandoFundo} onClick={() => inputFundoRef.current?.click()}>{enviandoFundo ? 'Enviando fundo…' : '🖼️ Usar outra imagem'}</button>
          {/* Sempre visível (apagado quando não há imagem própria) pra a pessoa saber onde fica. */}
          <button
            type="button"
            className="btn-ghost"
            disabled={enviandoFundo || !fundoSalvo}
            title={fundoSalvo ? 'Apaga a imagem que você subiu e volta pro modelo oficial (em todos os aparelhos)' : 'Nenhuma imagem própria — já está usando o modelo oficial'}
            onClick={() => {
              if (window.confirm('Remover a imagem de fundo e voltar pro modelo oficial em todos os aparelhos?')) setFundoSalvo(null);
            }}
          >
            🗑️ Remover imagem
          </button>
          <input ref={inputFundoRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={escolherFundo} />
        </div>

        <h3 className="cartaz-titulo-secao" style={{ marginTop: 18 }}>🎨 Cor das letras</h3>
        <p className="footnote" style={{ textAlign: 'left', marginTop: 0 }}>
          {modo === 'lote'
            ? <>Vale para <b>todos os {lote.length} cartazes</b> do lote. Para mudar só um, use a bolinha colorida ao lado dele na lista{itensComCorPropria > 0 ? ` (${itensComCorPropria} com cor própria, marcados com ★)` : ''}.</>
            : 'Vale para os cartazes desta folha.'}
        </p>
        <div className="oferta-cores-gerais">
          <label>
            <input type="color" value={corGeralPreco} onChange={(e) => setCores((c) => ({ ...c, preco: e.target.value }))} />
            <span>Preço, “DE” e “POR”</span>
            {cores.preco && <button type="button" className="btn-ghost" onClick={() => setCores((c) => ({ ...c, preco: null }))} title="Volta ao vermelho original do modelo">↺ Original</button>}
          </label>
          <label>
            <input type="color" value={corGeralNome} onChange={(e) => setCores((c) => ({ ...c, nome: e.target.value }))} />
            <span>Nome do produto</span>
            {cores.nome && <button type="button" className="btn-ghost" onClick={() => setCores((c) => ({ ...c, nome: null }))} title="Volta à cor original do modelo">↺ Original</button>}
          </label>
        </div>
        <div className="cartaz-oferta-acoes">
          <button type="button" className="btn-ghost" disabled={!cores.preco && !cores.nome} onClick={() => setCores({})}>↺ Voltar às cores originais</button>
          {modo === 'lote' && (
            <button
              type="button"
              className="btn-ghost"
              disabled={itensComCorPropria === 0}
              onClick={() => {
                if (window.confirm(`Tirar a cor própria de ${itensComCorPropria} cartaz(es)? Eles voltam a usar a cor geral.`)) setLote((atual) => atual.map((o) => ({ ...o, cores: undefined })));
              }}
            >
              ↺ Tirar cor própria de todos
            </button>
          )}
        </div>

        <h3 className="cartaz-titulo-secao" style={{ marginTop: 18 }}>🏷️ Faixa “OFERTA” e logomarca</h3>
        {!usandoModeloOficial ? (
          <p className="footnote" style={{ textAlign: 'left', marginTop: 0 }}>
            Com imagem de fundo própria, a faixa e a logomarca são as da sua imagem. Para editar aqui, use o modelo oficial (“Remover imagem” acima).
          </p>
        ) : (
          <>
            <p className="footnote" style={{ textAlign: 'left', marginTop: 0 }}>Vale para todos os cartazes desta campanha. O original fica guardado — dá pra voltar quando quiser.</p>
            <div className="field">
              <label htmlFor="oferta-faixa-texto">Texto da faixa</label>
              <div className="oferta-faixa-texto">
                <input id="oferta-faixa-texto" maxLength={20} value={cabecalho.texto ?? CABECALHO_ORIGINAL.texto} onChange={(e) => setCabecalho((c) => ({ ...c, texto: e.target.value }))} placeholder="OFERTA" />
                {cabecalho.texto != null && cabecalho.texto !== CABECALHO_ORIGINAL.texto && (
                  <button type="button" className="btn-ghost" onClick={() => setCabecalho((c) => ({ ...c, texto: null }))}>↺ OFERTA</button>
                )}
              </div>
            </div>
            <div className="oferta-cores-gerais">
              <label>
                <input type="color" value={cabecalho.corFaixa || CABECALHO_ORIGINAL.corFaixa} onChange={(e) => setCabecalho((c) => ({ ...c, corFaixa: e.target.value }))} />
                <span>Cor da faixa</span>
                {cabecalho.corFaixa && <button type="button" className="btn-ghost" onClick={() => setCabecalho((c) => ({ ...c, corFaixa: null }))}>↺ Original</button>}
              </label>
              <label>
                <input type="color" value={cabecalho.corTexto || CABECALHO_ORIGINAL.corTexto} onChange={(e) => setCabecalho((c) => ({ ...c, corTexto: e.target.value }))} />
                <span>Cor do texto da faixa</span>
                {cabecalho.corTexto && <button type="button" className="btn-ghost" onClick={() => setCabecalho((c) => ({ ...c, corTexto: null }))}>↺ Original</button>}
              </label>
              <label>
                <input type="color" disabled={cabecalho.semLogo} value={cabecalho.corLogo || '#dc0019'} onChange={(e) => setCabecalho((c) => ({ ...c, corLogo: e.target.value }))} />
                <span>Cor da logomarca <small>(pinta a logo inteira de uma cor)</small></span>
                {cabecalho.corLogo && <button type="button" className="btn-ghost" onClick={() => setCabecalho((c) => ({ ...c, corLogo: null }))}>↺ Cores originais</button>}
              </label>
            </div>
            <p className="footnote" style={{ textAlign: 'left', margin: '0 0 6px' }}>
              Logomarca: <b>{cabecalho.semLogo ? 'sem logomarca' : cabecalho.logo ? cabecalho.logo.nome : 'Drogaria Center (original)'}</b>
            </p>
            <div className="cartaz-oferta-acoes">
              <button type="button" className="btn-ghost" disabled={enviandoLogo} onClick={() => inputLogoRef.current?.click()}>{enviandoLogo ? 'Enviando…' : '🖼️ Trocar logomarca'}</button>
              {cabecalho.logo && <button type="button" className="btn-ghost" onClick={() => setCabecalho((c) => ({ ...c, logo: null }))}>↺ Logo original</button>}
              <button type="button" className="btn-ghost" onClick={() => setCabecalho((c) => ({ ...c, semLogo: !c.semLogo }))}>{cabecalho.semLogo ? '➕ Mostrar logomarca' : '🚫 Sem logomarca'}</button>
              <input ref={inputLogoRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => void escolherLogo(e)} />
            </div>
            <div className="cartaz-oferta-acoes">
              <button type="button" className="btn-ghost" disabled={!cabecalhoAlterado} onClick={() => { if (window.confirm('Voltar a faixa e a logomarca ao modelo original?')) setCabecalho({}); }}>↺ Voltar faixa e logo ao original</button>
            </div>
          </>
        )}

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
