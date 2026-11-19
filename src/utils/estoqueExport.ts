import { fmtData } from './estoqueFormat';
import type { ProdutoAnalisado } from './estoqueAnalise';
import { NOME_PRIORIDADE } from './estoqueAnalise';
import { STATUS_ACAO_LABEL } from '../types/estoque';

const num = (v: number | null) => (v === null ? '' : String(v).replace('.', ','));
const txt = (v: string | null) => v ?? '';

const COLUNAS: Array<[string, (p: ProdutoAnalisado) => string]> = [
  ['Ranking', (p) => (p.ranking === null ? '' : String(p.ranking))],
  ['Prioridade', (p) => `${p.prioridade} - ${NOME_PRIORIDADE[p.prioridade]}`],
  ['Código Trier', (p) => p.codigoTrier],
  ['Código de barras', (p) => txt(p.codigoBarras)],
  ['Produto', (p) => p.produto],
  ['Laboratório', (p) => txt(p.laboratorio)],
  ['Grupo', (p) => txt(p.grupo)],
  ['Fornecedor', (p) => txt(p.fornecedor)],
  ['Quantidade em estoque', (p) => num(p.saldo)],
  ['Custo unitário', (p) => num(p.custoUnitario)],
  ['Valor em estoque', (p) => num(p.valor === null ? null : Math.round(p.valor * 100) / 100)],
  ['Data da última entrada', (p) => (p.dataUltimaEntrada ? fmtData(p.dataUltimaEntrada) : '')],
  ['Dias desde a última entrada', (p) => (p.dias === null ? '' : String(p.dias))],
  ['Status da ação', (p) => STATUS_ACAO_LABEL[p.statusAcao]],
  ['Responsável', (p) => txt(p.responsavel)],
  ['Prazo', (p) => (p.prazo ? fmtData(p.prazo) : '')],
  ['Observações', (p) => txt(p.observacoes)],
];

function celula(valor: string): string {
  const seguro = /^[=+\-@]/.test(valor) ? `'${valor}` : valor; // evita que o Excel trate texto como fórmula
  return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro;
}

/** CSV no padrão que o Excel brasileiro abre direto: separador ";", vírgula decimal e BOM UTF-8 (acentos). Campo ausente fica vazio. */
export function produtosParaCsv(produtos: ProdutoAnalisado[]): string {
  const linhas = [COLUNAS.map(([titulo]) => titulo), ...produtos.map((p) => COLUNAS.map(([, valor]) => valor(p)))];
  return '﻿' + linhas.map((l) => l.map(celula).join(';')).join('\r\n');
}

/** Recurso adicional (não obrigatório): baixa a lista filtrada como CSV. */
export function baixarCsv(produtos: ProdutoAnalisado[], nomeBase = 'estoque-parado') {
  const blob = new Blob([produtosParaCsv(produtos)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${nomeBase}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
