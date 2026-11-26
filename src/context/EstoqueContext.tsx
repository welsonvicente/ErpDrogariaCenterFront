import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { estoqueService, mensagemDeErro, type PayloadImportacao } from '../services/estoqueService';
import type { ConfigEstoque, EdicaoProduto, ImportacaoEstoque, ProdutoEstoque } from '../types/estoque';
import { CONFIG_PADRAO, analisar, entradaDesconsiderada, type ProdutoAnalisado } from '../utils/estoqueAnalise';

interface EstoqueContextoValor {
  carregando: boolean;
  erro: string;
  produtos: ProdutoEstoque[];
  /** O que o relatório trouxe (menos o período desconsiderado) + classificação, dias, valor e ranking. */
  analisados: ProdutoAnalisado[];
  /** Produtos fora das análises por terem dado entrada no período desconsiderado (ver Config). */
  desconsiderados: ProdutoEstoque[];
  config: ConfigEstoque;
  importacoes: ImportacaoEstoque[];
  /** "Hoje" fixado quando a tela abriu — todos os cálculos de dias usam o mesmo dia. */
  hoje: Date;
  /** Importação mais recente que não é restauração — a "foto" atual dos dados. */
  ultimaImportacao: ImportacaoEstoque | null;
  recarregar: () => Promise<void>;
  importar: (payload: PayloadImportacao) => Promise<ImportacaoEstoque>;
  restaurar: (importacaoId: string) => Promise<ImportacaoEstoque>;
  atualizarProduto: (id: string, campos: EdicaoProduto) => Promise<void>;
  atualizarLote: (ids: string[], campos: Parameters<typeof estoqueService.atualizarLote>[1]) => Promise<void>;
  salvarConfig: (config: ConfigEstoque) => Promise<void>;
  avisar: (mensagem: string) => void;
}

const EstoqueContexto = createContext<EstoqueContextoValor | null>(null);

/**
 * Carrega o painel de estoque uma vez e mantém tudo em memória: o servidor
 * entrega todos os produtos da organização e o navegador filtra, ordena e
 * agrega — por isso filtros, gráficos e rankings respondem na hora. Cada
 * edição vai ao servidor e a resposta (a linha já salva) substitui a local.
 */
export function EstoqueProvider({ children }: { children: ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [produtos, setProdutos] = useState<ProdutoEstoque[]>([]);
  const [config, setConfig] = useState<ConfigEstoque>(CONFIG_PADRAO);
  const [importacoes, setImportacoes] = useState<ImportacaoEstoque[]>([]);
  const [toast, setToast] = useState('');
  const hoje = useMemo(() => new Date(), []);
  const temporizador = useRef<number | undefined>(undefined);

  const avisar = useCallback((mensagem: string) => {
    setToast(mensagem);
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setToast(''), 3500);
  }, []);

  const recarregar = useCallback(async () => {
    try {
      const painel = await estoqueService.carregar();
      setProdutos(painel.produtos);
      setConfig(painel.config);
      setImportacoes(painel.importacoes);
      setErro('');
    } catch (e) {
      setErro(mensagemDeErro(e, 'Não foi possível carregar os dados de estoque.'));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  // O período desconsiderado sai ANTES da análise: painel, ranking, plano, listas e totais já vêm sem ele.
  const desconsiderados = useMemo(() => produtos.filter((p) => entradaDesconsiderada(p, config.desconsiderarEntradas)), [produtos, config.desconsiderarEntradas]);
  const analisados = useMemo(() => {
    const fora = new Set(desconsiderados.map((p) => p.id));
    return analisar(fora.size ? produtos.filter((p) => !fora.has(p.id)) : produtos, config, hoje);
  }, [produtos, desconsiderados, config, hoje]);

  const substituir = useCallback((atualizados: ProdutoEstoque[]) => {
    const porId = new Map(atualizados.map((p) => [p.id, p]));
    setProdutos((atuais) => atuais.map((p) => porId.get(p.id) ?? p));
  }, []);

  const valor = useMemo<EstoqueContextoValor>(
    () => ({
      carregando,
      erro,
      produtos,
      analisados,
      desconsiderados,
      config,
      importacoes,
      hoje,
      ultimaImportacao: importacoes.find((i) => i.modo !== 'RESTAURACAO') ?? importacoes[0] ?? null,
      recarregar,
      avisar,
      async importar(payload) {
        const resultado = await estoqueService.importar(payload);
        await recarregar();
        return resultado;
      },
      async restaurar(importacaoId) {
        const resultado = await estoqueService.restaurar(importacaoId);
        await recarregar();
        return resultado;
      },
      async atualizarProduto(id, campos) {
        substituir([await estoqueService.atualizarProduto(id, campos)]);
      },
      async atualizarLote(ids, campos) {
        substituir(await estoqueService.atualizarLote(ids, campos));
      },
      async salvarConfig(nova) {
        setConfig(await estoqueService.salvarConfig(nova));
      },
    }),
    [carregando, erro, produtos, analisados, desconsiderados, config, importacoes, hoje, recarregar, avisar, substituir],
  );

  return (
    <EstoqueContexto.Provider value={valor}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </EstoqueContexto.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useEstoque() {
  const contexto = useContext(EstoqueContexto);
  if (!contexto) throw new Error('useEstoque precisa estar dentro de <EstoqueProvider>.');
  return contexto;
}
