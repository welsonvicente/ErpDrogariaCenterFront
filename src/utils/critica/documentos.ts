import { ErroLeituraPdf, lerPedidoCotaPreco } from './parserCotaPreco';
import { lerRelatorioTrier } from './parserTrier';
import type { ItemPdf, PedidoCota, RelatorioTrier } from './tipos';

export type DocumentoLido = { tipo: 'COTAPRECO'; pedido: PedidoCota } | { tipo: 'TRIER'; relatorio: RelatorioTrier };

/**
 * Descobre sozinho de qual sistema é o PDF (CotaPreço ou Trier) pelo conteúdo,
 * então a pessoa pode soltar os dois arquivos juntos, em qualquer ordem.
 */
export function lerDocumento(itens: ItemPdf[]): DocumentoLido {
  try {
    return { tipo: 'COTAPRECO', pedido: lerPedidoCotaPreco(itens) };
  } catch (erroCota) {
    try {
      return { tipo: 'TRIER', relatorio: lerRelatorioTrier(itens) };
    } catch (erroTrier) {
      // Se um dos dois reconheceu o layout mas não achou itens, essa é a mensagem útil.
      const reconhecido = [erroCota, erroTrier].find((e) => e instanceof ErroLeituraPdf && /foi reconhecido/.test(e.message));
      if (reconhecido instanceof ErroLeituraPdf) throw reconhecido;
      throw new ErroLeituraPdf('Não reconheci este PDF. Envie o pedido de compra do CotaPreço e o relatório "Compras por preço de venda" do Trier, ambos em PDF gerado pelo próprio sistema.');
    }
  }
}
