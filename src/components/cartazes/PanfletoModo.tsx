import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import JSZip from 'jszip';
import { AjustarEnquadramentoModal } from '../AjustarEnquadramentoModal';
import { CameraModal, type GuiaCamera } from '../CameraModal';
import { EditarStoryProdutoModal } from './EditarStoryProdutoModal';
import { carregarImagemDeArquivo } from '../../utils/arquivoImagem';
import { fmtMoney, montarTextoPromocional, type TransformImagem } from '../../utils/cartazEngine';
import {
  carregarConfiguracoesPanfleto,
  carregarImagemDeDataUrl,
  carregarProdutosRecentes,
  carregarRascunhoPanfleto,
  limparRascunhoPanfleto,
  montarGuiasCameraDoStory,
  salvarConfiguracoesPanfleto,
  salvarProdutoRecente,
  salvarRascunhoPanfleto,
  type ProdutoRecente,
} from '../../utils/cartazPersistencia';
import { baixarArquivoDireto, salvarOuCompartilharArquivo } from '../../utils/compartilharArquivo';
import {
  construirPaginasPanfleto,
  ESCALA_EXPORTACAO_PANFLETO,
  ITENS_POR_PAGINA_OPCOES,
  PRESETS_TAMANHO_PANFLETO,
  renderizarPaginaPanfleto,
  TRANSFORM_PADRAO_PANFLETO,
  type AjustesStoryProduto,
  type AlinhamentoTexto,
  type ParametrosPaginaPanfleto,
  type ProdutoPanfleto,
} from '../../utils/panfletoEngine';
import { gerarImagemQr } from '../../utils/qrCode';

type DestinoCamera = 'pendente' | number | null;

const TAMANHO_QR_LOGICO = 130;

/**
 * Gerador de Panfleto (vários produtos por página) — Fase 2 da reescrita de
 * Cartazes como tela React nativa (ver PLANO-REESCRITA-FERRAMENTAS.md).
 *
 * Cada página é pintada fora de tela pelo motor puro em utils/panfletoEngine.ts
 * (mesma matemática de layout do `public/tools/cartazes.html`), e a página
 * atual é copiada pro canvas visível — assim dá pra exportar todas as páginas
 * de uma vez (.zip) sem precisar navegar por elas.
 *
 * Cada produto também pode virar um story individual (1080×1920, formato
 * WhatsApp/Instagram Status) através do botão "📱", que abre um editor
 * completo (`EditarStoryProdutoModal`) com o mesmo arrasto/redimensionamento
 * do modo Story. Por padrão usa as cores/tamanhos/posições configuradas por
 * último no Story (`cartazes_story_settings_v1`), mas qualquer ajuste feito
 * ali fica salvo SÓ NESSE PRODUTO (`produto.ajustesStory`), sem afetar os
 * outros nem o padrão — que continua editável de qualquer produto através de
 * "Editar tamanho/posição padrão", que leva pro modo Story. O botão "🖼️
 * Ajustar" existe por outro motivo: o card do panfleto em si pinta a foto
 * inteira ("contain", sem cortar), então o enquadramento (pan/zoom) não muda
 * nada ali — só afeta a versão em story, que usa recorte "cover".
 */
interface PanfletoModoProps {
  /** Produtos enviados pelo modo Importar planilha ("Usar no panfleto") — null quando não há nada pendente. */
  produtosRecebidos?: ProdutoPanfleto[] | null;
  /** Avisa que `produtosRecebidos` já foi incorporado, pra não importar de novo a cada render. */
  aoReceberProdutos?: () => void;
  /** Leva pro modo Story, onde fica o padrão (tamanho/posição/cor) usado por qualquer produto sem ajuste próprio. */
  aoAbrirConfiguracaoPadrao?: () => void;
}

export function PanfletoModo({ produtosRecebidos, aoReceberProdutos, aoAbrirConfiguracaoPadrao }: PanfletoModoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paginasCanvasRef = useRef<HTMLCanvasElement[]>([]);
  const inputPendenteRef = useRef<HTMLInputElement>(null);
  const inputTrocaRef = useRef<HTMLInputElement>(null);
  const inputFundoRef = useRef<HTMLInputElement>(null);
  const trocaAlvoIdx = useRef<number | null>(null);

  const [produtos, setProdutos] = useState<ProdutoPanfleto[]>([]);
  const [imagemPendente, setImagemPendente] = useState<HTMLImageElement | null>(null);
  const [carregandoImagem, setCarregandoImagem] = useState(false);
  const [nomeProduto, setNomeProduto] = useState('');
  const [deProduto, setDeProduto] = useState('');
  const [porProduto, setPorProduto] = useState('');
  const [cameraDestino, setCameraDestino] = useState<DestinoCamera>(null);

  const [produtosRecentes, setProdutosRecentes] = useState<ProdutoRecente[]>([]);

  const [mostrarTextosCabecalho, setMostrarTextosCabecalho] = useState(true);
  const [nomeLoja, setNomeLoja] = useState('Drogaria Center');
  const [nomeLojaAlinhamento, setNomeLojaAlinhamento] = useState<AlinhamentoTexto>('left');
  const [titulo, setTitulo] = useState('Ofertas da Semana');
  const [tituloAlinhamento, setTituloAlinhamento] = useState<AlinhamentoTexto>('left');

  const [mostrarTextosRodape, setMostrarTextosRodape] = useState(true);
  const [textoRodape1, setTextoRodape1] = useState('Feito com carinho pela Drogaria Center');
  const [textoRodape1Alinhamento, setTextoRodape1Alinhamento] = useState<AlinhamentoTexto>('left');
  const [textoRodape2, setTextoRodape2] = useState('Aponte a câmera do celular para o QR Code');
  const [textoRodape2Alinhamento, setTextoRodape2Alinhamento] = useState<AlinhamentoTexto>('left');
  const [qrAlinhamento, setQrAlinhamento] = useState<'left' | 'right'>('left');
  const [link, setLink] = useState('');

  const [itensPorPagina, setItensPorPagina] = useState(9);
  const [corLogo, setCorLogo] = useState('#436000');
  const [corDescricao, setCorDescricao] = useState('#173C3A');
  const [corPreco, setCorPreco] = useState('#436000');
  const [corFundoCard, setCorFundoCard] = useState('#FBFDF9');
  const [tamanhoNome, setTamanhoNome] = useState(15);
  const [tamanhoPreco, setTamanhoPreco] = useState(19);
  const [tamanhoBorda, setTamanhoBorda] = useState(40);
  const [tamanhoSelo, setTamanhoSelo] = useState(13);

  const [imagemFundo, setImagemFundo] = useState<HTMLImageElement | null>(null);
  const [manterFaixaBranca, setManterFaixaBranca] = useState(true);

  const [imagemQr, setImagemQr] = useState<HTMLImageElement | null>(null);
  const [paginaAtual, setPaginaAtual] = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [salvando, setSalvando] = useState(false);
  const [salvandoDireto, setSalvandoDireto] = useState(false);
  const [toast, setToast] = useState('');

  const [ajusteIdx, setAjusteIdx] = useState<number | null>(null);
  const [editarStoryIdx, setEditarStoryIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Recebe produtos enviados pelo modo Importar planilha ("Usar no panfleto").
  useEffect(() => {
    if (!produtosRecebidos || produtosRecebidos.length === 0) return;
    setProdutos((atual) => [...atual, ...produtosRecebidos]);
    aoReceberProdutos?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [produtosRecebidos]);

  // Gera o QR (async) quando o link muda — cacheado por texto em utils/qrCode.ts.
  useEffect(() => {
    const linkTrim = link.trim();
    if (!linkTrim) {
      setImagemQr(null);
      return;
    }
    let cancelado = false;
    gerarImagemQr(linkTrim, TAMANHO_QR_LOGICO * ESCALA_EXPORTACAO_PANFLETO)
      .then((img) => {
        if (!cancelado) setImagemQr(img);
      })
      .catch(() => {
        if (!cancelado) setImagemQr(null);
      });
    return () => {
      cancelado = true;
    };
  }, [link]);

  // Carrega configurações (preferências permanentes) e oferece restaurar o
  // rascunho (produtos em andamento) — só uma vez, ao montar.
  const [prontoParaPersistir, setProntoParaPersistir] = useState(false);
  useEffect(() => {
    const config = carregarConfiguracoesPanfleto();
    if (config) {
      if (config.nomeLoja !== undefined) setNomeLoja(config.nomeLoja);
      if (config.nomeLojaAlinhamento) setNomeLojaAlinhamento(config.nomeLojaAlinhamento);
      if (config.titulo !== undefined) setTitulo(config.titulo);
      if (config.tituloAlinhamento) setTituloAlinhamento(config.tituloAlinhamento);
      if (config.mostrarTextosCabecalho !== undefined) setMostrarTextosCabecalho(config.mostrarTextosCabecalho);
      if (config.mostrarTextosRodape !== undefined) setMostrarTextosRodape(config.mostrarTextosRodape);
      if (config.textoRodape1 !== undefined) setTextoRodape1(config.textoRodape1);
      if (config.textoRodape1Alinhamento) setTextoRodape1Alinhamento(config.textoRodape1Alinhamento);
      if (config.textoRodape2 !== undefined) setTextoRodape2(config.textoRodape2);
      if (config.textoRodape2Alinhamento) setTextoRodape2Alinhamento(config.textoRodape2Alinhamento);
      if (config.qrAlinhamento) setQrAlinhamento(config.qrAlinhamento);
      if (config.link !== undefined) setLink(config.link);
      if (config.itensPorPagina) setItensPorPagina(config.itensPorPagina);
      if (config.corLogo) setCorLogo(config.corLogo);
      if (config.corDescricao) setCorDescricao(config.corDescricao);
      if (config.corPreco) setCorPreco(config.corPreco);
      if (config.corFundoCard) setCorFundoCard(config.corFundoCard);
      if (config.tamanhoNome) setTamanhoNome(config.tamanhoNome);
      if (config.tamanhoPreco) setTamanhoPreco(config.tamanhoPreco);
      if (config.tamanhoBorda) setTamanhoBorda(config.tamanhoBorda);
      if (config.tamanhoSelo) setTamanhoSelo(config.tamanhoSelo);
      if (config.manterFaixaBranca !== undefined) setManterFaixaBranca(config.manterFaixaBranca);
    }

    setProdutosRecentes(carregarProdutosRecentes());

    async function restaurarRascunhoSeConfirmado() {
      const rascunho = carregarRascunhoPanfleto();
      if (!rascunho || rascunho.produtos.length === 0) return;

      const quando = rascunho.savedAt ? new Date(rascunho.savedAt).toLocaleString('pt-BR') : '';
      const mensagem = `Encontramos um rascunho não finalizado com ${rascunho.produtos.length} produto(s) do panfleto${quando ? ` (salvo em ${quando})` : ''}. Deseja continuar de onde parou?`;
      if (!window.confirm(mensagem)) {
        limparRascunhoPanfleto();
        return;
      }

      const restaurados: ProdutoPanfleto[] = [];
      for (const p of rascunho.produtos) {
        try {
          const imagem = await carregarImagemDeDataUrl(p.imgSrc);
          restaurados.push({ imagem, nome: p.nome, de: p.de, por: p.por, transform: p.transform || TRANSFORM_PADRAO_PANFLETO, ajustesStory: p.ajustesStory });
        } catch {
          /* foto do rascunho corrompida — pula esse produto */
        }
      }
      setProdutos(restaurados);
    }
    restaurarRascunhoSeConfirmado().finally(() => setProntoParaPersistir(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Salva as configurações (preferências permanentes) — não inclui os
  // produtos nem a imagem de fundo, que não são "preferência", são o trabalho
  // em andamento (produtos vão pro rascunho; a imagem de fundo, como no HTML
  // original, não é persistida — reenviar é mais simples que arriscar lotar o
  // localStorage com uma imagem grande a cada preferência salva).
  useEffect(() => {
    if (!prontoParaPersistir) return;
    const timer = setTimeout(() => {
      salvarConfiguracoesPanfleto({
        nomeLoja,
        nomeLojaAlinhamento,
        titulo,
        tituloAlinhamento,
        mostrarTextosCabecalho,
        mostrarTextosRodape,
        textoRodape1,
        textoRodape1Alinhamento,
        textoRodape2,
        textoRodape2Alinhamento,
        qrAlinhamento,
        link,
        itensPorPagina,
        corLogo,
        corDescricao,
        corPreco,
        corFundoCard,
        tamanhoNome,
        tamanhoPreco,
        tamanhoBorda,
        tamanhoSelo,
        manterFaixaBranca,
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [
    prontoParaPersistir,
    nomeLoja,
    nomeLojaAlinhamento,
    titulo,
    tituloAlinhamento,
    mostrarTextosCabecalho,
    mostrarTextosRodape,
    textoRodape1,
    textoRodape1Alinhamento,
    textoRodape2,
    textoRodape2Alinhamento,
    qrAlinhamento,
    link,
    itensPorPagina,
    corLogo,
    corDescricao,
    corPreco,
    corFundoCard,
    tamanhoNome,
    tamanhoPreco,
    tamanhoBorda,
    tamanhoSelo,
    manterFaixaBranca,
  ]);

  // Salva o rascunho (só os produtos) — recuperável se a aba fechar ou travar
  // no meio de um panfleto com vários produtos já adicionados.
  useEffect(() => {
    if (!prontoParaPersistir) return;
    const timer = setTimeout(() => {
      salvarRascunhoPanfleto(produtos.map((p) => ({ imgSrc: p.imagem.src, nome: p.nome, de: p.de, por: p.por, transform: p.transform, ajustesStory: p.ajustesStory })));
    }, 700);
    return () => clearTimeout(timer);
  }, [prontoParaPersistir, produtos]);

  function desenharPaginaVisivel(indice: number) {
    const visivel = canvasRef.current;
    const atual = paginasCanvasRef.current[indice];
    if (!visivel || !atual) return;
    visivel.width = atual.width;
    visivel.height = atual.height;
    visivel.getContext('2d')?.drawImage(atual, 0, 0);
  }

  // Repinta todas as páginas fora de tela sempre que produtos ou qualquer
  // parâmetro visual mudam — permite exportar todas de uma vez (.zip) sem
  // precisar navegar por elas primeiro.
  useEffect(() => {
    const sizing = PRESETS_TAMANHO_PANFLETO[itensPorPagina] || PRESETS_TAMANHO_PANFLETO[9];
    const paginas = construirPaginasPanfleto(produtos, itensPorPagina);
    const parametros: ParametrosPaginaPanfleto = {
      mostrarTextosCabecalho,
      nomeLoja,
      nomeLojaAlinhamento,
      titulo,
      tituloAlinhamento,
      mostrarTextosRodape,
      textoRodape1,
      textoRodape1Alinhamento,
      textoRodape2,
      textoRodape2Alinhamento,
      temLink: link.trim().length > 0,
      qrAlinhamento,
      imagemQr,
      corLogo,
      corDescricao,
      corPreco,
      corFundoCard,
      tamanhoNome,
      tamanhoPreco,
      tamanhoBorda,
      tamanhoSelo,
      imagemFundo,
      manterFaixaBranca,
    };

    paginasCanvasRef.current = paginas.map((produtosDaPagina, i) => {
      const canvas = document.createElement('canvas');
      renderizarPaginaPanfleto(canvas, produtosDaPagina, sizing, i + 1, paginas.length, parametros);
      return canvas;
    });
    setTotalPaginas(paginas.length);

    const indiceValido = Math.min(paginaAtual, paginas.length - 1);
    if (indiceValido !== paginaAtual) {
      setPaginaAtual(Math.max(0, indiceValido));
    } else {
      desenharPaginaVisivel(indiceValido);
    }
    // paginaAtual fica de fora de propósito — mudar de página não deve
    // reconstruir todas as páginas de novo, só redesenhar a visível (efeito
    // abaixo). Ele só entra aqui pra corrigir o índice quando páginas somem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    produtos,
    itensPorPagina,
    mostrarTextosCabecalho,
    nomeLoja,
    nomeLojaAlinhamento,
    titulo,
    tituloAlinhamento,
    mostrarTextosRodape,
    textoRodape1,
    textoRodape1Alinhamento,
    textoRodape2,
    textoRodape2Alinhamento,
    qrAlinhamento,
    link,
    imagemQr,
    corLogo,
    corDescricao,
    corPreco,
    corFundoCard,
    tamanhoNome,
    tamanhoPreco,
    tamanhoBorda,
    tamanhoSelo,
    imagemFundo,
    manterFaixaBranca,
  ]);

  useEffect(() => {
    desenharPaginaVisivel(paginaAtual);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paginaAtual]);

  async function handleEscolherArquivoPendente(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    setCarregandoImagem(true);
    try {
      setImagemPendente(await carregarImagemDeArquivo(arquivo));
    } finally {
      setCarregandoImagem(false);
    }
  }

  async function handleTrocarFotoProduto(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    const idx = trocaAlvoIdx.current;
    trocaAlvoIdx.current = null;
    if (!arquivo || idx === null) return;
    const imagem = await carregarImagemDeArquivo(arquivo);
    setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, imagem, transform: TRANSFORM_PADRAO_PANFLETO } : p)));
  }

  async function handleEscolherImagemFundo(event: ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo) return;
    setImagemFundo(await carregarImagemDeArquivo(arquivo));
  }

  function handleUsarProdutoRecente(produto: ProdutoRecente) {
    carregarImagemDeDataUrl(produto.imgSrc)
      .then((img) => {
        setImagemPendente(img);
        setNomeProduto(produto.name || '');
        setDeProduto(produto.de || '');
        setPorProduto(produto.por || '');
      })
      .catch(() => setToast('Não consegui recuperar a foto desse produto.'));
  }

  function handleAdicionarProduto() {
    const nomeTrim = nomeProduto.trim();
    if (!imagemPendente) {
      setToast('Escolha a foto do produto antes de adicionar.');
      return;
    }
    if (!nomeTrim) {
      setToast('Digite o nome do produto.');
      return;
    }
    if (!porProduto) {
      setToast('Digite o preço "Por".');
      return;
    }

    setProdutos((atual) => [...atual, { imagem: imagemPendente, nome: nomeTrim, de: deProduto, por: porProduto, transform: TRANSFORM_PADRAO_PANFLETO }]);
    salvarProdutoRecente({ imgSrc: imagemPendente.src, name: nomeTrim, de: deProduto, por: porProduto });
    setProdutosRecentes(carregarProdutosRecentes());

    setImagemPendente(null);
    setNomeProduto('');
    setDeProduto('');
    setPorProduto('');
  }

  function handleRemoverProduto(idx: number) {
    setProdutos((atual) => atual.filter((_, i) => i !== idx));
  }

  function handleRemoverTodos() {
    if (produtos.length === 0) return;
    if (!window.confirm(`Remover todos os ${produtos.length} produtos do panfleto?`)) return;
    setProdutos([]);
  }

  /** Gera o conteúdo pra baixar — uma página vira PNG direto, mais de uma vira um .zip com todas. */
  async function gerarConteudoPanfleto(): Promise<{ conteudo: string | Blob; nomeArquivo: string; mime: string } | null> {
    const paginas = paginasCanvasRef.current;
    if (paginas.length <= 1) {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return { conteudo: canvas.toDataURL('image/png'), nomeArquivo: `panfleto-${Date.now()}.png`, mime: 'image/png' };
    }

    const zip = new JSZip();
    for (let i = 0; i < paginas.length; i++) {
      const blob = await new Promise<Blob>((resolve, reject) => {
        paginas[i].toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falhou'))), 'image/png');
      });
      zip.file(`panfleto-parte-${i + 1}.png`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    return { conteudo: zipBlob, nomeArquivo: `panfletos-${Date.now()}.zip`, mime: 'application/zip' };
  }

  /** Baixa ou compartilha (Web Share, quando o navegador suportar) — no celular, dá pra mandar direto pro WhatsApp. */
  async function handleBaixarPanfleto() {
    setSalvando(true);
    try {
      const resultado = await gerarConteudoPanfleto();
      if (!resultado) return;
      const tituloCompartilhamento = titulo.trim() || nomeLoja.trim() || 'Panfleto de ofertas';
      await salvarOuCompartilharArquivo(resultado.conteudo, resultado.nomeArquivo, resultado.mime, tituloCompartilhamento);
    } catch {
      setToast('Não foi possível gerar os panfletos. Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  /** Salva direto na pasta de Downloads do computador, sem passar pela folha de compartilhar. */
  async function handleBaixarPanfletoDireto() {
    setSalvandoDireto(true);
    try {
      const resultado = await gerarConteudoPanfleto();
      if (!resultado) return;
      await baixarArquivoDireto(resultado.conteudo, resultado.nomeArquivo, resultado.mime);
    } catch {
      setToast('Não foi possível gerar os panfletos. Tente novamente.');
    } finally {
      setSalvandoDireto(false);
    }
  }

  async function handleCopiarTexto() {
    if (produtos.length === 0) {
      setToast('Adicione produtos ao panfleto antes de gerar o texto.');
      return;
    }
    let texto = `🔥 *${(titulo || 'Ofertas').toUpperCase()} — DROGARIA CENTER* 🔥\n\n`;
    produtos.forEach((p) => {
      texto += `${montarTextoPromocional(p.nome, p.de, p.por)}\n\n`;
    });
    texto += '📍 Venha conferir na loja ou chama no WhatsApp!';

    try {
      await navigator.clipboard.writeText(texto);
      setToast('Texto copiado! Já pode colar no WhatsApp/Instagram.');
    } catch {
      setToast('Não foi possível copiar automaticamente — selecione e copie o texto manualmente.');
    }
  }

  function handleSalvarAjuste(transform: TransformImagem) {
    if (ajusteIdx !== null) {
      setProdutos((atual) => atual.map((p, i) => (i === ajusteIdx ? { ...p, transform } : p)));
    }
    setAjusteIdx(null);
  }

  /** Grava os ajustes feitos no editor de story individual (posição/tamanho/texto) de volta no produto. */
  function handleSalvarAjustesStory(idx: number, ajustesStory: AjustesStoryProduto, campos: { nome: string; de: string; por: string }) {
    setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, ...campos, ajustesStory } : p)));
  }

  function OpcoesAlinhamento({ value, onChange }: { value: AlinhamentoTexto; onChange: (v: AlinhamentoTexto) => void }) {
    return (
      <select value={value} onChange={(e) => onChange(e.target.value as AlinhamentoTexto)}>
        <option value="left">Esquerda</option>
        <option value="center">Centro</option>
        <option value="right">Direita</option>
      </select>
    );
  }

  return (
    <>
      <div className="cartaz-cols">
        <div className="card cartaz-painel">
          <h3 className="cartaz-titulo-secao">Adicionar produto ao panfleto</h3>

          {produtosRecentes.length > 0 && (
            <div className="field" style={{ marginBottom: 10 }}>
              <label>Últimos produtos usados</label>
              <div className="cartaz-recentes">
                {produtosRecentes.map((p) => (
                  <button
                    type="button"
                    key={`${p.name}-${p.usedAt}`}
                    className="cartaz-recente-item"
                    title={`Usar "${p.name}" de novo`}
                    onClick={() => handleUsarProdutoRecente(p)}
                  >
                    <img src={p.imgSrc} alt="" />
                    <span className="cartaz-recente-nome">{p.name}</span>
                    <span className="cartaz-recente-preco">R${fmtMoney(p.por)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
            <label
              className="upload-box"
              style={{ display: 'block', cursor: 'pointer', flex: 1, margin: 0 }}
              onClick={() => inputPendenteRef.current?.click()}
            >
              {carregandoImagem
                ? '⏳ Carregando foto...'
                : imagemPendente
                  ? '📷 Trocar foto'
                  : '📷 Escolher foto'}
            </label>
            <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, whiteSpace: 'nowrap' }} onClick={() => setCameraDestino('pendente')}>
              📸 Tirar foto
            </button>
            <input ref={inputPendenteRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEscolherArquivoPendente} />
          </div>
          {imagemPendente && (
            <div style={{ marginBottom: 10 }}>
              <img src={imagemPendente.src} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} />
            </div>
          )}

          <div className="field">
            <label>Nome do produto</label>
            <input value={nomeProduto} onChange={(e) => setNomeProduto(e.target.value)} placeholder="Ex: SIMETICONA 125MG 30CAP" />
          </div>
          <div className="field-row">
            <div className="field">
              <label>De (R$)</label>
              <input type="number" step="0.01" value={deProduto} onChange={(e) => setDeProduto(e.target.value)} placeholder="20,99" />
            </div>
            <div className="field">
              <label>Por (R$)</label>
              <input type="number" step="0.01" value={porProduto} onChange={(e) => setPorProduto(e.target.value)} placeholder="9,99" />
            </div>
          </div>
          <button type="button" className="btn-primary" style={{ width: '100%' }} onClick={handleAdicionarProduto}>
            + Adicionar ao panfleto
          </button>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 20 }}>
            <h3 className="cartaz-titulo-secao" style={{ margin: 0 }}>
              Produtos no panfleto
            </h3>
            <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0, fontSize: 12, padding: '6px 10px' }} onClick={handleRemoverTodos}>
              🗑️ Remover todos
            </button>
          </div>
          {aoAbrirConfiguracaoPadrao && (
            <button
              type="button"
              className="btn-ghost"
              style={{ width: '100%', fontSize: 12, margin: '8px 0 0' }}
              onClick={aoAbrirConfiguracaoPadrao}
            >
              🖋️ Editar tamanho/posição padrão dos stories (vale pra todo produto sem ajuste próprio)
            </button>
          )}
          <div className="product-list">
            {produtos.length === 0 && <div className="empty-note">Nenhum produto adicionado ainda.</div>}
            {produtos.map((p, idx) => (
              <div className="product-row" key={`${p.nome}-${idx}`}>
                <img src={p.imagem.src} alt="" />
                <div className="pinfo">
                  <div className="pname">{p.nome}</div>
                  <div className="pprice">
                    {p.de ? `De R$${p.de} · ` : ''}Por R${p.por}
                  </div>
                </div>
                <div className="product-row-acoes">
                  <button
                    type="button"
                    className="product-row-acao"
                    title="Trocar foto (galeria)"
                    onClick={() => {
                      trocaAlvoIdx.current = idx;
                      inputTrocaRef.current?.click();
                    }}
                  >
                    🔄
                  </button>
                  <button type="button" className="product-row-acao" title="Trocar foto (câmera)" onClick={() => setCameraDestino(idx)}>
                    📸
                  </button>
                  <button type="button" className="product-row-acao" title="Ajustar enquadramento da foto (usado ao gerar story individual)" onClick={() => setAjusteIdx(idx)}>
                    🖼️
                  </button>
                  <button type="button" className="product-row-acao" title="Editar e baixar o story individual deste produto" onClick={() => setEditarStoryIdx(idx)}>
                    📱
                  </button>
                  <button type="button" title="Remover" onClick={() => handleRemoverProduto(idx)}>
                    Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
          <input ref={inputTrocaRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleTrocarFotoProduto} />

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', margin: '16px 0' }} />

          <h3 className="cartaz-titulo-secao">Textos do cabeçalho</h3>
          <label className="cartaz-checkbox">
            <input type="checkbox" checked={mostrarTextosCabecalho} onChange={(e) => setMostrarTextosCabecalho(e.target.checked)} /> Mostrar
            textos do cabeçalho
          </label>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label>Nome da loja</label>
              <input value={nomeLoja} onChange={(e) => setNomeLoja(e.target.value)} />
            </div>
            <div className="field">
              <label>Posição</label>
              <OpcoesAlinhamento value={nomeLojaAlinhamento} onChange={setNomeLojaAlinhamento} />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label>Título/chamada</label>
              <input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
            </div>
            <div className="field">
              <label>Posição</label>
              <OpcoesAlinhamento value={tituloAlinhamento} onChange={setTituloAlinhamento} />
            </div>
          </div>

          <h3 className="cartaz-titulo-secao" style={{ marginTop: 18 }}>
            Textos do rodapé
          </h3>
          <label className="cartaz-checkbox">
            <input type="checkbox" checked={mostrarTextosRodape} onChange={(e) => setMostrarTextosRodape(e.target.checked)} /> Mostrar
            textos do rodapé
          </label>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label>Frase principal do rodapé</label>
              <input value={textoRodape1} onChange={(e) => setTextoRodape1(e.target.value)} />
            </div>
            <div className="field">
              <label>Posição</label>
              <OpcoesAlinhamento value={textoRodape1Alinhamento} onChange={setTextoRodape1Alinhamento} />
            </div>
          </div>
          <div className="field-row">
            <div className="field" style={{ flex: 2 }}>
              <label>Frase secundária do rodapé</label>
              <input value={textoRodape2} onChange={(e) => setTextoRodape2(e.target.value)} />
            </div>
            <div className="field">
              <label>Posição</label>
              <OpcoesAlinhamento value={textoRodape2Alinhamento} onChange={setTextoRodape2Alinhamento} />
            </div>
          </div>
          <div className="field">
            <label>Posição do QR Code</label>
            <select value={qrAlinhamento} onChange={(e) => setQrAlinhamento(e.target.value as 'left' | 'right')}>
              <option value="left">Esquerda</option>
              <option value="right">Direita</option>
            </select>
          </div>
          <p className="footnote" style={{ textAlign: 'left', margin: '-6px 0 14px' }}>
            Dica: se o texto e o QR Code ficarem se sobrepondo, escolha posições opostas (ex: QR à esquerda, texto
            centralizado ou à direita).
          </p>

          <div className="field">
            <label>Itens por panfleto</label>
            <select value={itensPorPagina} onChange={(e) => setItensPorPagina(Number(e.target.value))}>
              {ITENS_POR_PAGINA_OPCOES.map((n) => (
                <option key={n} value={n}>
                  {n === 3 ? '3 (fotos grandes)' : n === 9 ? '9 (padrão)' : n === 12 ? '12 (fotos menores)' : n}
                </option>
              ))}
            </select>
          </div>
          <p className="footnote" style={{ textAlign: 'left', margin: '-6px 0 12px' }}>
            Se tiver mais produtos do que cabe, o restante vira automaticamente outros panfletos (baixados juntos num
            .zip).
          </p>

          <div className="field-row">
            <div className="field">
              <label>Cor da logo</label>
              <input type="color" value={corLogo} onChange={(e) => setCorLogo(e.target.value)} />
            </div>
            <div className="field">
              <label>Cor da descrição</label>
              <input type="color" value={corDescricao} onChange={(e) => setCorDescricao(e.target.value)} />
            </div>
            <div className="field">
              <label>Cor do preço</label>
              <input type="color" value={corPreco} onChange={(e) => setCorPreco(e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Cor de fundo dos quadrantes dos produtos</label>
            <input type="color" value={corFundoCard} onChange={(e) => setCorFundoCard(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field">
              <label>Tamanho da descrição {tamanhoNome}px</label>
              <input type="range" min={10} max={24} value={tamanhoNome} onChange={(e) => setTamanhoNome(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Tamanho do preço {tamanhoPreco}px</label>
              <input type="range" min={13} max={30} value={tamanhoPreco} onChange={(e) => setTamanhoPreco(Number(e.target.value))} />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Tamanho da borda externa {tamanhoBorda}px</label>
              <input type="range" min={12} max={90} value={tamanhoBorda} onChange={(e) => setTamanhoBorda(Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Tamanho da letra do selo de desconto {tamanhoSelo}px</label>
              <input type="range" min={9} max={22} value={tamanhoSelo} onChange={(e) => setTamanhoSelo(Number(e.target.value))} />
            </div>
          </div>

          <div className="field">
            <label>Imagem de fundo do panfleto (opcional)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <label
                className="upload-box"
                style={{ display: 'block', cursor: 'pointer', flex: 1, margin: 0, fontSize: 12, padding: 14 }}
                onClick={() => inputFundoRef.current?.click()}
              >
                {imagemFundo ? '🖼️ Trocar imagem de fundo' : '🖼️ Escolher imagem de fundo'}
              </label>
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} onClick={() => setImagemFundo(null)}>
                Remover
              </button>
            </div>
            <input ref={inputFundoRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleEscolherImagemFundo} />
            <label className="cartaz-checkbox" style={{ marginTop: 10 }}>
              <input type="checkbox" checked={manterFaixaBranca} onChange={(e) => setManterFaixaBranca(e.target.checked)} /> Manter faixa
              branca atrás do cabeçalho e do rodapé (ajuda a ler o texto sobre a imagem de fundo)
            </label>
          </div>

          <div className="field">
            <label>Link do Pix / WhatsApp para o QR Code (opcional)</label>
            <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Ex: https://wa.me/5511999999999" />
          </div>

          <div className="cartaz-actions">
            <button type="button" className="btn-ghost" onClick={handleBaixarPanfleto} disabled={salvando}>
              {salvando ? 'Gerando…' : '⬇️ Baixar ou compartilhar (WhatsApp etc.)'}
            </button>
            <button type="button" className="btn-primary" onClick={handleBaixarPanfletoDireto} disabled={salvandoDireto}>
              {salvandoDireto ? 'Gerando…' : '💾 Salvar direto no computador'}
            </button>
          </div>
          <p className="footnote" style={{ textAlign: 'left', margin: '4px 0 0' }}>
            "Salvar direto no computador" vai sem passar pela folha de compartilhar — cai certinho na pasta de
            Downloads.
          </p>
          <div className="cartaz-actions cartaz-actions--single">
            <button type="button" className="btn-ghost" onClick={handleCopiarTexto}>
              📋 Copiar texto pronto (WhatsApp/Instagram)
            </button>
          </div>
          <p className="footnote">Sem limite de gerações. Adicione quantos produtos quiser — o layout se ajusta sozinho.</p>
        </div>

        <div className="cartaz-preview">
          <div className="cartaz-preview-head">
            <strong>Prévia em tempo real</strong>
            <span>O panfleto se atualiza conforme você edita.</span>
          </div>
          <div className="cartaz-canvas-frame cartaz-canvas-frame--panfleto">
            <canvas ref={canvasRef} className="cartaz-canvas cartaz-canvas--panfleto" />
          </div>
          {totalPaginas > 1 && (
            <div className="panfleto-paginacao">
              <button type="button" className="btn-ghost" style={{ width: 'auto', margin: 0 }} disabled={paginaAtual === 0} onClick={() => setPaginaAtual((p) => Math.max(0, p - 1))}>
                ◀
              </button>
              <span>
                Página {paginaAtual + 1}/{totalPaginas}
              </span>
              <button
                type="button"
                className="btn-ghost"
                style={{ width: 'auto', margin: 0 }}
                disabled={paginaAtual >= totalPaginas - 1}
                onClick={() => setPaginaAtual((p) => Math.min(totalPaginas - 1, p + 1))}
              >
                ▶
              </button>
            </div>
          )}
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      <CameraModal
        aberto={cameraDestino !== null}
        onFechar={() => setCameraDestino(null)}
        onCapturar={(img) => {
          if (cameraDestino === 'pendente') {
            setImagemPendente(img);
          } else if (typeof cameraDestino === 'number') {
            const idx = cameraDestino;
            setProdutos((atual) => atual.map((p, i) => (i === idx ? { ...p, imagem: img, transform: TRANSFORM_PADRAO_PANFLETO } : p)));
          }
          setCameraDestino(null);
        }}
        guias={montarGuiasCameraDoStory() as GuiaCamera[]}
      />

      {ajusteIdx !== null && produtos[ajusteIdx] && (
        <AjustarEnquadramentoModal
          imagem={produtos[ajusteIdx].imagem}
          transformInicial={produtos[ajusteIdx].transform}
          onFechar={() => setAjusteIdx(null)}
          onSalvar={handleSalvarAjuste}
        />
      )}

      {editarStoryIdx !== null && produtos[editarStoryIdx] && (
        <EditarStoryProdutoModal
          // Força remontar ao trocar de produto — sem isso, alternar rápido
          // entre dois "📱" (fechar um e abrir outro) pode virar só uma troca
          // de props na MESMA instância aos olhos do React, e os campos
          // (nome/de/por, useState) ficam com o valor do produto anterior.
          key={editarStoryIdx}
          produto={produtos[editarStoryIdx]}
          onFechar={() => setEditarStoryIdx(null)}
          onSalvar={(ajustesStory, campos) => handleSalvarAjustesStory(editarStoryIdx, ajustesStory, campos)}
        />
      )}
    </>
  );
}
