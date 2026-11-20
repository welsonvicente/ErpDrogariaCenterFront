import { useCallback, useEffect, useMemo, useState } from 'react';
import { CriticasSalvas } from '../components/critica/CriticasSalvas';
import { EnvioDocumentos, type TipoDocumento } from '../components/critica/EnvioDocumentos';
import { MenuBaixar } from '../components/critica/MenuBaixar';
import { ResultadoAuditoria } from '../components/critica/ResultadoAuditoria';
import { ManagerLayout } from '../components/ManagerLayout';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { criticaPedidoService, mensagemDeErroCritica, type CriticaSalva, type ResumoCritica } from '../services/criticaPedidoService';
import { anotacaoVazia, type Anotacao, type Anotacoes } from '../utils/critica/anotacoes';
import { TOLERANCIAS_PADRAO, auditar, type Auditoria, type Decisao, type Decisoes, type Tolerancias } from '../utils/critica/auditoria';
import { baixarDocumento } from '../utils/critica/baixar';
import { lerDocumento } from '../utils/critica/documentos';
import { extrairItensDoPdf } from '../utils/critica/leitorPdf';
import { documentoCompleto, documentoDaSecao, nomeDoArquivo, type Formato, type SecaoRel } from '../utils/critica/relatorio';
import type { PedidoCota, RelatorioTrier } from '../utils/critica/tipos';
import { LIMITE_PDF_GUARDADO_BYTES } from '../utils/critica/limites';
import { arquivoParaBase64 } from '../utils/estoqueImportacao';
import '../critica.css';

/** Número digitado (aceita vírgula); vazio/ilegível volta ao valor anterior. */
const numero = (texto: string, anterior: number) => {
  const n = Number(texto.replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : anterior;
};

function resumoDaAuditoria(a: Auditoria): ResumoCritica {
  return { veredito: a.veredito, totalPedido: a.financeiro.totalCotaItens, totalTrier: a.financeiro.totalTrierBruto, diferenca: a.financeiro.diferencaTotal, contagens: a.contagens };
}

/**
 * Gestão → Crítica de pedido: confere o pedido de compra do CotaPreço contra o
 * que foi lançado no Trier. Os PDFs são lidos no navegador; a crítica só vai
 * para o banco quando a pessoa clica em "Salvar no banco" (dados lidos, decisões
 * e os PDFs originais), e daí pode ser reaberta de qualquer aparelho.
 */
export function ManagerCriticaPedidoPage() {
  useDocumentTitle('Crítica de pedido');
  const [pedido, setPedido] = useState<PedidoCota | null>(null);
  const [relatorio, setRelatorio] = useState<RelatorioTrier | null>(null);
  const [arquivoCota, setArquivoCota] = useState<File | null>(null);
  const [arquivoTrier, setArquivoTrier] = useState<File | null>(null);
  const [nomeCota, setNomeCota] = useState<string | null>(null);
  const [nomeTrier, setNomeTrier] = useState<string | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [lendo, setLendo] = useState(false);
  const [decisoes, setDecisoes] = useState<Decisoes>({});
  const [anotacoes, setAnotacoes] = useState<Anotacoes>({});
  const [tolerancias, setTolerancias] = useState<Tolerancias>(TOLERANCIAS_PADRAO);

  const [criticaId, setCriticaId] = useState<string | null>(null);
  /** Documentos trocados/removidos depois de abrir a crítica do banco: são os que "Atualizar" precisa regravar. */
  const [alterados, setAlterados] = useState({ cota: false, trier: false });
  /** null = a pessoa ainda não mexeu no nome: vale o nome sugerido (distribuidora — pedido). */
  const [tituloEditado, setTituloEditado] = useState<string | null>(null);
  const [salvas, setSalvas] = useState<CriticaSalva[]>([]);
  const [carregandoSalvas, setCarregandoSalvas] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const auditoria = useMemo(() => (pedido && relatorio ? auditar(pedido, relatorio, tolerancias, decisoes) : null), [pedido, relatorio, tolerancias, decisoes]);
  const tituloPadrao = !pedido
    ? ''
    : pedido.pedidos && pedido.pedidos.length > 1
      ? `${pedido.pedidos.length} distribuidoras — ${pedido.cotacao ?? 'pedidos'}`
      : [pedido.distribuidora ?? 'Pedido', pedido.numero && `pedido ${pedido.numero}`].filter(Boolean).join(' — ');
  const titulo = tituloEditado ?? tituloPadrao;

  const recarregarSalvas = useCallback(async () => {
    try {
      setSalvas(await criticaPedidoService.listar());
    } catch {
      /* a lista é um extra: se falhar, a conferência continua funcionando */
    } finally {
      setCarregandoSalvas(false);
    }
  }, []);

  useEffect(() => {
    void recarregarSalvas();
  }, [recarregarSalvas]);

  /**
   * Um documento entrou, saiu ou foi trocado: as decisões da conferência anterior não valem mais. Se havia uma
   * crítica salva aberta, ela continua aberta (o "Atualizar" regrava o documento); senão, é uma conferência nova.
   */
  function mudouDocumento(tipo: TipoDocumento) {
    setDecisoes({});
    setAnotacoes({}); // as chaves das linhas são posições do documento antigo
    setAviso(null);
    if (criticaId) setAlterados((a) => (tipo === 'COTAPRECO' ? { ...a, cota: true } : { ...a, trier: true }));
    else setTituloEditado(null);
  }

  /** `so`: troca vinda de um cartão — o PDF precisa ser daquele tipo; sem `so`, qualquer um dos dois serve (arrastar). */
  async function receber(arquivos: File[], so?: TipoDocumento) {
    if (!arquivos.length) return;
    setLendo(true);
    const novosErros: string[] = [];
    for (const arquivo of arquivos) {
      try {
        const documento = lerDocumento(await extrairItensDoPdf(arquivo));
        if (so && documento.tipo !== so) {
          const esperado = so === 'COTAPRECO' ? 'o pedido de compra do CotaPreço' : 'o relatório do Trier';
          const recebido = documento.tipo === 'COTAPRECO' ? 'o pedido de compra do CotaPreço' : 'o relatório do Trier';
          throw new Error(`aqui vai ${esperado}, mas este PDF é ${recebido}. Use o outro cartão.`);
        }
        if (documento.tipo === 'COTAPRECO') {
          setPedido(documento.pedido);
          setNomeCota(arquivo.name);
          setArquivoCota(arquivo);
        } else {
          setRelatorio(documento.relatorio);
          setNomeTrier(arquivo.name);
          setArquivoTrier(arquivo);
        }
        mudouDocumento(documento.tipo);
      } catch (e) {
        novosErros.push(`${arquivo.name}: ${e instanceof Error ? e.message : 'não foi possível ler o arquivo.'}`);
      }
    }
    setErros(novosErros);
    setLendo(false);
  }

  function remover(tipo: TipoDocumento) {
    const outroPresente = tipo === 'COTAPRECO' ? !!relatorio : !!pedido;
    if (!outroPresente) return limpar(); // era o último: nada mais a conferir
    if (tipo === 'COTAPRECO') {
      setPedido(null);
      setNomeCota(null);
      setArquivoCota(null);
    } else {
      setRelatorio(null);
      setNomeTrier(null);
      setArquivoTrier(null);
    }
    setErros([]);
    mudouDocumento(tipo);
  }

  function decidir(grupoId: number, decisao: Decisao | null) {
    setDecisoes((atuais) => {
      const { [grupoId]: _removida, ...resto } = atuais;
      void _removida;
      return decisao ? { ...resto, [grupoId]: decisao } : resto;
    });
  }

  function anotar(chave: string, anotacao: Anotacao) {
    setAnotacoes((atuais) => {
      const { [chave]: _removida, ...resto } = atuais;
      void _removida;
      return anotacaoVazia(anotacao) ? resto : { ...resto, [chave]: anotacao };
    });
  }

  function limpar() {
    setPedido(null);
    setRelatorio(null);
    setNomeCota(null);
    setNomeTrier(null);
    setArquivoCota(null);
    setArquivoTrier(null);
    setErros([]);
    setDecisoes({});
    setAnotacoes({});
    setCriticaId(null);
    setAlterados({ cota: false, trier: false });
    setTituloEditado(null);
    setAviso(null);
  }

  // ---------------------------------------------------------------- baixar

  async function baixarSecao(secao: SecaoRel, formato: Formato) {
    if (!auditoria || !pedido || !relatorio) return;
    await baixarDocumento(documentoDaSecao(secao, auditoria, pedido, relatorio), formato, nomeDoArquivo(pedido, secao.nomeCurto));
  }

  async function baixarCompleto(formato: Formato) {
    if (!auditoria || !pedido || !relatorio) return;
    await baixarDocumento(documentoCompleto(auditoria, pedido, relatorio, anotacoes), formato, nomeDoArquivo(pedido, 'completo'));
  }

  // ---------------------------------------------------------------- banco

  /** O PDF a guardar: o arquivo escolhido agora (se couber no limite) ou, num "salvar como nova", o que já estava guardado na crítica de origem. */
  async function pdfParaGuardar(arquivo: File | null, qual: 'cota' | 'trier', origemId: string | null, nomeGuardado: string | null) {
    if (arquivo) return arquivo.size <= LIMITE_PDF_GUARDADO_BYTES ? { nome: arquivo.name, conteudoBase64: await arquivoParaBase64(arquivo) } : undefined;
    if (!origemId || !nomeGuardado) return undefined;
    try {
      const blob = await criticaPedidoService.buscarPdf(origemId, qual);
      return { nome: nomeGuardado, conteudoBase64: await arquivoParaBase64(new File([blob], nomeGuardado, { type: 'application/pdf' })) };
    } catch {
      return undefined; // o PDF antigo sumiu: salva só os dados
    }
  }

  async function salvar(comoNova = false) {
    if (!auditoria || !pedido || !relatorio) return;
    const trocouAlgum = alterados.cota || alterados.trier;
    if (criticaId && !comoNova && trocouAlgum && !window.confirm('Você trocou um documento desta crítica. Atualizar vai substituir, no banco, os dados lidos e o PDF guardado desse documento — não dá para desfazer. Continuar? (Para manter a crítica antiga, use “Salvar como nova”.)')) return;
    setSalvando(true);
    setAviso(null);
    try {
      const resumo = resumoDaAuditoria(auditoria);
      if (criticaId && !comoNova) {
        // Só vai o que mudou: documento não trocado continua como está no banco (com o PDF dele).
        await criticaPedidoService.atualizar(criticaId, {
          titulo,
          decisoes,
          anotacoes,
          tolerancias,
          resumo,
          ...(alterados.cota ? { pedido, pdfCota: await pdfParaGuardar(arquivoCota, 'cota', null, null) } : {}),
          ...(alterados.trier ? { relatorio, pdfTrier: await pdfParaGuardar(arquivoTrier, 'trier', null, null) } : {}),
        });
      } else {
        // Os PDFs originais vão junto pra poderem ser baixados depois; acima do limite só os dados são salvos.
        // Documento que não foi trocado e veio do banco (sem arquivo na tela) tem o PDF copiado da crítica de origem.
        const origem = comoNova ? criticaId : null;
        const salva = await criticaPedidoService.criar({
          titulo: comoNova ? `${titulo} (cópia)` : titulo,
          pedido,
          relatorio,
          decisoes,
          anotacoes,
          tolerancias,
          resumo,
          pdfCota: await pdfParaGuardar(arquivoCota, 'cota', alterados.cota ? null : origem, nomeCota),
          pdfTrier: await pdfParaGuardar(arquivoTrier, 'trier', alterados.trier ? null : origem, nomeTrier),
        });
        setCriticaId(salva.id);
        if (comoNova) setTituloEditado(salva.titulo);
      }
      setAlterados({ cota: false, trier: false });
      setAviso({ tipo: 'ok', texto: criticaId && !comoNova ? 'Crítica atualizada no banco.' : 'Crítica salva no banco. Dá para reabrir pela lista “Críticas salvas”.' });
      await recarregarSalvas();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDeErroCritica(e) });
    } finally {
      setSalvando(false);
    }
  }

  async function abrir(id: string) {
    setAviso(null);
    try {
      const c = await criticaPedidoService.obter(id);
      setPedido(c.pedido);
      setRelatorio(c.relatorio);
      setNomeCota(c.pdfCotaNome);
      setNomeTrier(c.pdfTrierNome);
      setArquivoCota(null);
      setArquivoTrier(null);
      setErros([]);
      setDecisoes(Object.fromEntries(Object.entries(c.decisoes).map(([k, v]) => [Number(k), v])));
      setAnotacoes(c.anotacoes ?? {});
      setTolerancias(c.tolerancias);
      setCriticaId(c.id);
      setAlterados({ cota: false, trier: false });
      setTituloEditado(c.titulo);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDeErroCritica(e) });
    }
  }

  async function excluir(c: CriticaSalva) {
    if (!window.confirm(`Excluir a crítica "${c.titulo}"? Os dados e os PDFs guardados serão apagados e não dá para desfazer.`)) return;
    try {
      await criticaPedidoService.remover(c.id);
      if (c.id === criticaId) {
        setCriticaId(null); // continua na tela, mas agora como conferência ainda não salva
        setAlterados({ cota: false, trier: false });
      }
      await recarregarSalvas();
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDeErroCritica(e) });
    }
  }

  async function baixarPdfOriginal(c: CriticaSalva, qual: 'cota' | 'trier') {
    try {
      await criticaPedidoService.baixarPdf(c.id, qual, (qual === 'cota' ? c.pdfCotaNome : c.pdfTrierNome) ?? `${qual}.pdf`);
    } catch (e) {
      setAviso({ tipo: 'erro', texto: mensagemDeErroCritica(e) });
    }
  }

  return (
    <ManagerLayout>
      <div className="crit-pagina">
        <div className="crit-cabecalho-impressao">
          <strong>Crítica de pedido — Drogaria Center</strong>
          <span>
            {pedido?.distribuidora ?? ''} {pedido?.numero ? `· pedido ${pedido.numero}` : ''} {relatorio?.periodo ? `· Trier ${relatorio.periodo}` : ''}
          </span>
          <small>Impresso em {new Date().toLocaleDateString('pt-BR')}</small>
        </div>

        <EnvioDocumentos
          pedido={pedido}
          relatorio={relatorio}
          nomeCota={nomeCota}
          nomeTrier={nomeTrier}
          lendo={lendo}
          erros={erros}
          alterados={alterados}
          onArquivos={(a) => void receber(a)}
          onTrocar={(tipo, arquivo) => void receber([arquivo], tipo)}
          onRemover={remover}
          onLimpar={limpar}
        />

        <CriticasSalvas criticas={salvas} abertaId={criticaId} carregando={carregandoSalvas} onAbrir={(id) => void abrir(id)} onExcluir={(c) => void excluir(c)} onBaixarPdf={(c, q) => void baixarPdfOriginal(c, q)} />

        <details className="card crit-tolerancias crit-nao-imprimir">
          <summary>Tolerâncias da conferência</summary>
          <div className="crit-tol-grade">
            <label className="field">
              <span>Arredondamento (R$ por unidade)</span>
              <input inputMode="decimal" value={tolerancias.arredondamento} onChange={(e) => setTolerancias((t) => ({ ...t, arredondamento: numero(e.target.value, t.arredondamento) }))} />
            </label>
            <label className="field">
              <span>“Atenção” até (R$ por unidade)</span>
              <input inputMode="decimal" value={tolerancias.pequenoReais} onChange={(e) => setTolerancias((t) => ({ ...t, pequenoReais: numero(e.target.value, t.pequenoReais) }))} />
            </label>
            <label className="field">
              <span>“Atenção” até (% do preço)</span>
              <input inputMode="decimal" value={tolerancias.pequenoPct} onChange={(e) => setTolerancias((t) => ({ ...t, pequenoPct: numero(e.target.value, t.pequenoPct) }))} />
            </label>
          </div>
          <p className="est-dica">Diferença de preço até o valor de arredondamento é considerada correta (e avisada). Acima disso, até os dois limites de “atenção”, é diferença pequena; além deles, divergência.</p>
        </details>

        {auditoria && pedido && relatorio ? (
          <>
            <div className="card crit-barra-acoes crit-nao-imprimir">
              <label className="crit-titulo-campo">
                <span>Nome da crítica</span>
                <input value={titulo} maxLength={200} onChange={(e) => setTituloEditado(e.target.value)} placeholder="Ex.: G1 distribuidora — pedido 762" />
              </label>
              <div className="crit-botoes">
                <button type="button" className="btn-primary" onClick={() => void salvar()} disabled={salvando || !titulo.trim()}>
                  {salvando ? 'Salvando…' : criticaId ? '💾 Atualizar no banco' : '💾 Salvar no banco'}
                </button>
                {criticaId && (
                  <button type="button" className="btn-ghost" onClick={() => void salvar(true)} disabled={salvando || !titulo.trim()}>
                    ➕ Salvar como nova
                  </button>
                )}
                <MenuBaixar rotulo="Baixar relatório completo" oque="o relatório completo" aoBaixar={baixarCompleto} />
                <button type="button" className="btn-ghost" onClick={() => window.print()}>
                  🖨️ Imprimir
                </button>
              </div>
              {aviso && (
                <p className={aviso.tipo === 'ok' ? 'crit-aviso-ok' : 'error-text'} role="status">
                  {aviso.tipo === 'ok' ? '✅ ' : ''}
                  {aviso.texto}
                </p>
              )}
              {criticaId && !alterados.cota && !alterados.trier && <p className="est-dica">Esta é uma crítica salva: “Atualizar” grava as decisões e tolerâncias de agora (os PDFs e os dados lidos continuam os mesmos).</p>}
              {criticaId && (alterados.cota || alterados.trier) && (
                <p className="crit-aviso-troca">
                  ⚠️ Você trocou {alterados.cota && alterados.trier ? 'os dois documentos' : 'um documento'} desta crítica, e as decisões e anotações foram zeradas. “Atualizar no banco” substitui os dados e o PDF guardados; “Salvar como nova” mantém a crítica antiga como está.
                </p>
              )}
            </div>
            <ResultadoAuditoria auditoria={auditoria} decisoes={decisoes} onDecisao={decidir} anotacoes={anotacoes} onAnotar={anotar} aoBaixar={baixarSecao} />
          </>
        ) : (
          <p className="est-dica crit-nao-imprimir">
            Envie os dois PDFs para ver a auditoria. {pedido || relatorio ? 'Falta o outro documento.' : ''}
            {criticaId ? ' A crítica salva continua intacta no banco até você atualizar.' : ''}
          </p>
        )}
      </div>
    </ManagerLayout>
  );
}
