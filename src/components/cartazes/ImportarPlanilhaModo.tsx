import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import JSZip from 'jszip';
import { AjustarEnquadramentoModal } from '../AjustarEnquadramentoModal';
import { CameraModal } from '../CameraModal';
import { carregarImagemDeArquivo } from '../../utils/arquivoImagem';
import {
  ALTURA_STORY,
  LARGURA_STORY,
  fmtMoney,
  montarTextoPromocional,
  pintarStory,
} from '../../utils/cartazEngine';
import {
  carregarImagemExterna,
  imagemExportavel,
  lerArquivoComoWorkbook,
  parseColunasColadas,
  parseWorkbookParaProdutos,
  TRANSFORM_PADRAO,
  type ProdutoImportado,
} from '../../utils/batchEngine';
import { carregarConfiguracoesLote, salvarConfiguracoesLote } from '../../utils/cartazPersistencia';
import { salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';
import { cartazService } from '../../services/cartazService';
import type { ProdutoPanfleto } from '../../utils/panfletoEngine';

const ROTULO_STATUS: Record<ProdutoImportado['status'], string> = {
  pending: 'Sem imagem',
  searching: 'Buscando…',
  found: 'Imagem encontrada',
  manual: 'Foto manual',
  failed: 'Busca falhou',
};

interface ImportarPlanilhaModoProps {
  /** Envia os produtos com foto pro modo Panfleto e troca de aba. */
  aoEnviarParaPanfleto: (produtos: ProdutoPanfleto[]) => void;
}

/**
 * Importar planilha (.xls/.xlsx ou colar colunas do Excel/Sheets) — Fase 3 da
 * reescrita de Cartazes como tela React nativa (ver PLANO-REESCRITA-FERRAMENTAS.md).
 *
 * A leitura/parsing é toda em utils/batchEngine.ts (função pura); os stories
 * em lote reaproveitam `pintarStory` de utils/cartazEngine.ts sem duplicar
 * nada — mesmo motor usado pelo modo Story, só com cores próprias deste modo
 * e o resto (posição das faixas, tamanhos, margens) no padrão de fábrica.
 */
export function ImportarPlanilhaModo({ aoEnviarParaPanfleto }: ImportarPlanilhaModoProps) {
  const inputPlanilhaRef = useRef<HTMLInputElement>(null);
  const inputManualRef = useRef<HTMLInputElement>(null);
  const trocaAlvoIdx = useRef<number | null>(null);

  const [produtos, setProdutos] = useState<ProdutoImportado[]>([]);
  const [statusImportacao, setStatusImportacao] = useState(
    'A planilha precisa ter colunas com o nome do produto, preço normal, valor da promoção e EAN (código de barras).',
  );

  const [descColada, setDescColada] = useState('');
  const [normalColada, setNormalColada] = useState('');
  const [promoColada, setPromoColada] = useState('');
  const [eanColada, setEanColada] = useState('');

  const [corLogo, setCorLogo] = useState('#436000');
  const [corTextoNome, setCorTextoNome] = useState('#FFFFFF');
  const [corPreco, setCorPreco] = useState('#E30613');

  const [cameraDestino, setCameraDestino] = useState<number | null>(null);
  const [ajusteIdx, setAjusteIdx] = useState<number | null>(null);
  const [buscandoTodas, setBuscandoTodas] = useState(false);
  const [gerandoZip, setGerandoZip] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const config = carregarConfiguracoesLote();
    if (!config) return;
    if (config.corLogo) setCorLogo(config.corLogo);
    if (config.corTextoNome) setCorTextoNome(config.corTextoNome);
    if (config.corPreco) setCorPreco(config.corPreco);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      salvarConfiguracoesLote({ corLogo, corTextoNome, corPreco });
    }, 400);
    return () => clearTimeout(timer);
  }, [corLogo, corTextoNome, corPreco]);

  function atualizarProduto(idx: number, patch: Partial<ProdutoImportado>) {
    setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, ...patch } : p)));
  }

  async function handleEscolherPlanilha(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    setStatusImportacao('Lendo planilha…');
    try {
      const workbook = await lerArquivoComoWorkbook(arquivo);
      const importados = parseWorkbookParaProdutos(workbook);
      if (importados === null) {
        setStatusImportacao('Não consegui identificar as colunas dessa planilha. Confirme que ela tem uma coluna com o nome do produto.');
        return;
      }
      if (importados.length === 0) {
        setStatusImportacao('Nenhum produto encontrado nessa planilha.');
        return;
      }
      setProdutos(importados);
      setStatusImportacao(`${importados.length} produto(s) importado(s) com sucesso.`);
    } catch {
      setStatusImportacao('Não foi possível ler esse arquivo. Confirme que é um .xls ou .xlsx válido.');
    }
  }

  function handleAdicionarColados() {
    const novos = parseColunasColadas(descColada, normalColada, promoColada, eanColada);
    if (novos.length === 0) {
      setToast('Cole ao menos a descrição dos produtos (uma por linha).');
      return;
    }
    setProdutos((atual) => [...atual, ...novos]);
    setDescColada('');
    setNormalColada('');
    setPromoColada('');
    setEanColada('');
    setStatusImportacao(`${novos.length} produto(s) adicionado(s) por colagem.`);
  }

  async function buscarImagemProduto(idx: number) {
    const produto = produtos[idx];
    if (!produto) return;
    atualizarProduto(idx, { status: 'searching' });
    try {
      const imageUrl = await cartazService.buscarImagem(produto.descricao, produto.ean || undefined);
      if (!imageUrl) {
        atualizarProduto(idx, { status: 'failed' });
        return;
      }
      const img = await carregarImagemExterna(imageUrl);
      if (imagemExportavel(img)) {
        atualizarProduto(idx, { imagem: img, status: 'found' });
      } else {
        atualizarProduto(idx, { status: 'failed' });
      }
    } catch {
      atualizarProduto(idx, { status: 'failed' });
    }
  }

  async function handleBuscarTodas() {
    setBuscandoTodas(true);
    try {
      for (let i = 0; i < produtos.length; i++) {
        if (produtos[i].imagem) continue;
        // eslint-disable-next-line no-await-in-loop
        await buscarImagemProduto(i);
      }
    } finally {
      setBuscandoTodas(false);
    }
  }

  async function handleTrocarFotoManual(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    const idx = trocaAlvoIdx.current;
    trocaAlvoIdx.current = null;
    if (!arquivo || idx === null) return;
    const imagem = await carregarImagemDeArquivo(arquivo);
    atualizarProduto(idx, { imagem, status: 'manual', transform: TRANSFORM_PADRAO });
  }

  function handleRemoverProduto(idx: number) {
    setProdutos((atual) => atual.filter((_, i) => i !== idx));
  }

  function handleRemoverTodos() {
    if (produtos.length === 0) return;
    if (!window.confirm(`Remover todos os ${produtos.length} produtos importados?`)) return;
    setProdutos([]);
  }

  async function copiarTexto(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setToast('Texto copiado! Já pode colar no WhatsApp/Instagram.');
    } catch {
      setToast('Não foi possível copiar automaticamente — selecione e copie o texto manualmente.');
    }
  }

  function handleCopiarTextoItem(idx: number) {
    const p = produtos[idx];
    if (!p) return;
    copiarTexto(`🔥 *OFERTA* 🔥\n\n${montarTextoPromocional(p.descricao, String(p.normal ?? ''), String(p.promo ?? ''))}\n\n📍 Corre que é por tempo limitado!`);
  }

  function handleCopiarTextoTodos() {
    if (produtos.length === 0) {
      setToast('Importe produtos antes de gerar o texto.');
      return;
    }
    let texto = '🔥 *OFERTAS DA SEMANA — DROGARIA CENTER* 🔥\n\n';
    produtos.forEach((p) => {
      texto += `${montarTextoPromocional(p.descricao, String(p.normal ?? ''), String(p.promo ?? ''))}\n\n`;
    });
    texto += '📍 Válido enquanto durar o estoque!';
    copiarTexto(texto);
  }

  function handleUsarNoPanfleto() {
    const comImagem = produtos.filter((p) => p.imagem);
    if (comImagem.length === 0) {
      setToast('Nenhum produto tem imagem ainda. Busque ou envie fotos antes de usar no panfleto.');
      return;
    }
    aoEnviarParaPanfleto(
      comImagem.map((p) => ({
        imagem: p.imagem as HTMLImageElement,
        nome: p.descricao,
        de: p.normal !== null ? String(p.normal) : '',
        por: p.promo !== null ? String(p.promo) : '',
        transform: p.transform,
      })),
    );
    setToast(`${comImagem.length} produto(s) enviados pro panfleto!`);
  }

  async function handleBaixarZipStories() {
    const comImagem = produtos.filter((p) => p.imagem);
    if (comImagem.length === 0) {
      setToast('Nenhum produto tem imagem ainda. Busque ou envie fotos antes de gerar os stories.');
      return;
    }
    setGerandoZip(true);
    try {
      const zip = new JSZip();
      for (let i = 0; i < comImagem.length; i++) {
        const p = comImagem[i];
        const canvas = document.createElement('canvas');
        canvas.width = LARGURA_STORY;
        canvas.height = ALTURA_STORY;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        pintarStory(ctx, LARGURA_STORY, ALTURA_STORY, {
          imagem: p.imagem,
          transformImagem: p.transform,
          nome: p.descricao,
          de: p.normal !== null ? String(p.normal) : '',
          por: p.promo !== null ? String(p.promo) : '',
          emoji: '🤩😱',
          corLogo,
          corTextoNome,
          corPreco,
          nomeY: 130,
          precoY: 320,
          nomeOffsetX: 0,
          precoOffsetX: 0,
          tamanhoNome: 40,
          tamanhoPreco: 62,
          frases: '',
          frasesY: 560,
          frasesOffsetX: 0,
          corFundoFrases: '#173C3A',
          corTextoFrases: '#FFFFFF',
          tamanhoFrases: 32,
          margemNome: 60,
          margemPreco: 60,
          margemFrases: 60,
        });
        // eslint-disable-next-line no-await-in-loop
        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png');
        });
        const nomeSeguro = p.descricao
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .slice(0, 40);
        zip.file(`story-${i + 1}-${nomeSeguro}.png`, blob);
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      await salvarOuCompartilharArquivo(zipBlob, `stories-${Date.now()}.zip`, 'application/zip', `Stories de ofertas (${comImagem.length} produtos)`);
    } catch {
      setToast('Não foi possível gerar o pacote de stories. Tente novamente.');
    } finally {
      setGerandoZip(false);
    }
  }

  const produtoAjuste = ajusteIdx !== null ? produtos[ajusteIdx] : null;

  return (
    <>
      <div className="card cartaz-painel" style={{ marginBottom: 20 }}>
        <h3 className="cartaz-titulo-secao">Importar planilha (.xls ou .xlsx)</h3>
        <label className="upload-box" style={{ display: 'block', cursor: 'pointer', maxWidth: 420 }} onClick={() => inputPlanilhaRef.current?.click()}>
          📊 Clique para escolher o arquivo da planilha
        </label>
        <input ref={inputPlanilhaRef} type="file" accept=".xls,.xlsx" style={{ display: 'none' }} onChange={handleEscolherPlanilha} />
        <p className="footnote" style={{ textAlign: 'left' }}>
          {statusImportacao}
        </p>

        <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '18px 0' }} />

        <h3 className="cartaz-titulo-secao">Ou cole direto do Excel/Sheets (uma coluna por vez)</h3>
        <p className="footnote" style={{ textAlign: 'left', marginBottom: 10 }}>
          Copia uma coluna inteira da planilha (Ctrl+C) e cola no campo correspondente abaixo — um valor por linha. A
          ordem das linhas é o que liga um campo ao outro (linha 1 de "Descrição" = linha 1 de "Preço Normal" etc).
        </p>
        <div className="field">
          <label>Descrição do produto (uma por linha)</label>
          <textarea
            rows={4}
            value={descColada}
            onChange={(e) => setDescColada(e.target.value)}
            placeholder={'ABERALGINA 500MG/ML GTS 10ML\nAPEVITIN BC LIQ 240ML\n...'}
          />
        </div>
        <div className="paste-grid">
          <div className="field">
            <label>Preço Normal</label>
            <textarea rows={4} value={normalColada} onChange={(e) => setNormalColada(e.target.value)} placeholder={'4,00\n17,00\n...'} />
          </div>
          <div className="field">
            <label>Valor Promoção</label>
            <textarea rows={4} value={promoColada} onChange={(e) => setPromoColada(e.target.value)} placeholder={'1,99\n9,99\n...'} />
          </div>
          <div className="field">
            <label>EAN</label>
            <textarea rows={4} value={eanColada} onChange={(e) => setEanColada(e.target.value)} placeholder={'7894164000050\n...'} />
          </div>
        </div>
        <button type="button" className="btn-ghost" onClick={handleAdicionarColados}>
          + Adicionar produtos colados
        </button>
      </div>

      {produtos.length > 0 && (
        <div className="card cartaz-painel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
            <h3 className="cartaz-titulo-secao" style={{ margin: 0 }}>
              Produtos importados ({produtos.length})
            </h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={handleBuscarTodas} disabled={buscandoTodas}>
                {buscandoTodas ? 'Buscando…' : '🔍 Buscar todas as imagens'}
              </button>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={handleUsarNoPanfleto}>
                🗞️ Usar no panfleto
              </button>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={handleCopiarTextoTodos}>
                📋 Copiar texto pronto
              </button>
              <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={handleBaixarZipStories} disabled={gerandoZip}>
                {gerandoZip ? 'Gerando…' : '📦 Baixar todos os stories (.zip)'}
              </button>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={handleRemoverTodos}>
                🗑️ Remover todos
              </button>
            </div>
          </div>
          <p className="footnote" style={{ textAlign: 'left', marginBottom: 12 }}>
            A busca automática de imagem nem sempre funciona (muitos sites bloqueiam uso externo da foto) — quando
            falhar, use "Trocar" pra enviar a foto manualmente.
          </p>
          <div className="field-row">
            <div className="field">
              <label>Cor do logo/nome (stories gerados)</label>
              <input type="color" value={corLogo} onChange={(e) => setCorLogo(e.target.value)} />
            </div>
            <div className="field">
              <label>Cor do texto do nome</label>
              <input type="color" value={corTextoNome} onChange={(e) => setCorTextoNome(e.target.value)} />
            </div>
            <div className="field">
              <label>Cor do preço</label>
              <input type="color" value={corPreco} onChange={(e) => setCorPreco(e.target.value)} />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {produtos.map((p, idx) => (
              <div className="batch-row" key={`${p.descricao}-${idx}`}>
                <div className="thumb">{p.imagem ? <img src={p.imagem.src} alt="" /> : '💊'}</div>
                <div className="binfo">
                  <div className="bname">{p.descricao}</div>
                  <div className="bprice">
                    {p.normal ? `De R$${fmtMoney(p.normal)} · ` : ''}
                    {p.promo ? `Por R$${fmtMoney(p.promo)}` : 'sem preço promo'}
                    {p.ean ? ` · EAN ${p.ean}` : ''}
                  </div>
                  <span className={`bstatus ${p.status}`}>{ROTULO_STATUS[p.status]}</span>
                </div>
                <div className="bactions">
                  <button type="button" onClick={() => buscarImagemProduto(idx)}>
                    🔍 Buscar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      trocaAlvoIdx.current = idx;
                      inputManualRef.current?.click();
                    }}
                  >
                    📤 Trocar
                  </button>
                  <button type="button" onClick={() => setCameraDestino(idx)}>
                    📸 Foto
                  </button>
                  {p.imagem && (
                    <button type="button" onClick={() => setAjusteIdx(idx)}>
                      🖼️ Ajustar
                    </button>
                  )}
                  <button type="button" onClick={() => handleCopiarTextoItem(idx)}>
                    📋 Copiar texto
                  </button>
                  <button type="button" className="del" onClick={() => handleRemoverProduto(idx)}>
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <input ref={inputManualRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleTrocarFotoManual} />

      {toast && <div className="toast">{toast}</div>}

      <CameraModal
        aberto={cameraDestino !== null}
        onFechar={() => setCameraDestino(null)}
        onCapturar={(img) => {
          if (cameraDestino !== null) {
            atualizarProduto(cameraDestino, { imagem: img, status: 'manual', transform: TRANSFORM_PADRAO });
          }
          setCameraDestino(null);
        }}
      />

      {produtoAjuste?.imagem && (
        <AjustarEnquadramentoModal
          imagem={produtoAjuste.imagem}
          transformInicial={produtoAjuste.transform}
          onFechar={() => setAjusteIdx(null)}
          onSalvar={(t) => {
            if (ajusteIdx !== null) atualizarProduto(ajusteIdx, { transform: t });
            setAjusteIdx(null);
          }}
        />
      )}
    </>
  );
}
