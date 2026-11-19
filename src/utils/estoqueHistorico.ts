import { STATUS_ACAO_LABEL, type StatusAcao } from '../types/estoque';
import { NAO_INFORMADO, fmtData, fmtMoeda, fmtQuantidade } from './estoqueFormat';

const CAMPOS_DE_DATA = ['Data de início', 'Prazo'];
const CAMPOS_DE_QUANTIDADE = ['Quantidade atualizada'];

/**
 * O histórico guarda os valores como texto cru (`NAO_INICIADO`, `2026-11-18`,
 * `12.9`); aqui eles viram o que a pessoa lê na tela (status por extenso, data
 * DD/MM/AAAA, preço em R$). Valor ausente é "Não informado".
 */
export function valorLegivel(campo: string | null, valor: string | null): string {
  if (valor === null || valor === '') return NAO_INFORMADO;
  if (campo === 'Status da ação') return STATUS_ACAO_LABEL[valor as StatusAcao] ?? valor;
  if (campo && CAMPOS_DE_DATA.includes(campo) && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return fmtData(valor);
  if (campo === 'Preço de venda' && Number.isFinite(Number(valor))) return fmtMoeda(Number(valor));
  if (campo && CAMPOS_DE_QUANTIDADE.includes(campo) && Number.isFinite(Number(valor))) return fmtQuantidade(Number(valor));
  return valor;
}
