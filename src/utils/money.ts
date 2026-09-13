/**
 * Converte um valor digitado no formato brasileiro (vírgula decimal, ponto
 * como separador de milhar) pra number. Um `Number(valor.replace(',', '.'))`
 * ingênuo quebra em qualquer valor com milhar (ex.: "1.234,56" vira
 * "1.234.56", que é NaN) — bem comum ao lançar gastos maiores.
 */
export function parseValorBr(valor: string): number {
  const limpo = valor.trim();
  if (!limpo) return NaN;

  if (limpo.includes(',')) {
    // Vírgula presente = é o separador decimal (padrão BR); qualquer ponto
    // antes dela é separador de milhar e pode ser removido.
    return Number(limpo.replace(/\./g, '').replace(',', '.'));
  }

  const pontos = (limpo.match(/\./g) || []).length;
  if (pontos <= 1) {
    // Sem vírgula e no máximo um ponto: só tratamos o ponto como milhar
    // quando tiver exatamente 3 casas depois dele (ex.: "1.234" = 1234) —
    // um ponto com 1-2 casas (ex.: "10.50") é mais provavelmente decimal.
    if (pontos === 1 && limpo.split('.')[1]?.length === 3) {
      return Number(limpo.replace('.', ''));
    }
    return Number(limpo);
  }

  // Mais de um ponto só faz sentido como separador de milhar (ex.: "1.234.567").
  return Number(limpo.replace(/\./g, ''));
}
