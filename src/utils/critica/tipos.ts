/** Um trecho de texto do PDF, com a posição na página (origem embaixo à esquerda, como no PDF). */
export interface ItemPdf {
  pagina: number;
  x: number;
  y: number;
  /** Largura do trecho — `x + w` é a borda direita, que é o que alinha as colunas numéricas. */
  w: number;
  s: string;
}

/** Itens da mesma linha visual, da esquerda para a direita. */
export interface LinhaPdf {
  pagina: number;
  y: number;
  itens: ItemPdf[];
  /** Texto da linha inteira, itens separados por espaço. */
  texto: string;
}

// ---------------------------------------------------------------- CotaPreço

export interface ItemCota {
  /** Posição na ordem do PDF (1, 2, 3…) — identifica o item nas telas. */
  id: number;
  ean: string | null;
  produto: string;
  qtd: number;
  unitario: number;
  subtotal: number;
  /**
   * Distribuidora do pedido a que o item pertence. Só vem preenchida quando o PDF junta vários pedidos
   * (uma página por distribuidora); num PDF de um pedido só fica vazia.
   */
  distribuidora?: string | null;
  /** Número do pedido (PED-…) do item — idem. */
  pedidoNumero?: string | null;
}

/** Um dos pedidos de um PDF que junta vários (um por distribuidora). */
export interface PedidoDaDistribuidora {
  numero: string | null;
  distribuidora: string;
  representante: string | null;
  totalDeclarado: number | null;
  minimoDistribuidora: number | null;
  itens: number;
}

export interface PedidoCota {
  numero: string | null;
  cotacao: string | null;
  comprador: string | null;
  compradorCnpj: string | null;
  distribuidora: string | null;
  representante: string | null;
  /** "TOTAL DO PEDIDO" impresso no documento — pode não bater com a soma dos itens. */
  totalDeclarado: number | null;
  minimoDistribuidora: number | null;
  geradoEm: string | null;
  itens: ItemCota[];
  /**
   * Preenchido só quando o PDF junta vários pedidos: um resumo por distribuidora. Nesse caso `distribuidora`
   * e `numero` acima são textos-resumo ("Várias (5): …", "PED-… +4") e cada item diz de qual pedido veio.
   */
  pedidos?: PedidoDaDistribuidora[];
}

// -------------------------------------------------------------------- Trier

export interface ItemTrier {
  id: number;
  /** Código interno do Trier (não é EAN). */
  codigo: string;
  /** O Trier corta o nome em ~30 letras. */
  produto: string;
  laboratorio: string | null;
  grupo: string | null;
  estoque: number | null;
  /** Quantidade comprada (entrada). */
  qtd: number;
  /** Valor unitário (preço de compra bruto). */
  unitario: number;
  bruto: number;
  /** Desconto/acréscimo de rateio (negativo = acréscimo). */
  desconto: number;
  liquido: number;
  venda: number | null;
}

export interface RelatorioTrier {
  filial: string | null;
  periodo: string | null;
  fornecedor: string | null;
  emitidoEm: string | null;
  /** Total líquido impresso em "Total Geral". */
  totalLiquido: number | null;
  itens: ItemTrier[];
}
