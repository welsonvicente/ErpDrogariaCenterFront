/** Texto mostrado quando o relatório não trouxe o campo — nunca um zero ou traço que pareça dado. */
export const NAO_INFORMADO = 'Não informado';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const inteiro = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });

/** R$ 1.234,56 — `null` vira "Não informado". */
export function fmtMoeda(valor: number | null | undefined): string {
  return valor === null || valor === undefined ? NAO_INFORMADO : moeda.format(valor);
}

/** Quantidades: inteiro quando for inteiro, até 3 casas quando não for. */
export function fmtQuantidade(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return NAO_INFORMADO;
  return Number.isInteger(valor) ? inteiro.format(valor) : decimal.format(valor);
}

export function fmtInteiro(valor: number): string {
  return inteiro.format(valor);
}

export function fmtPercentual(valor: number | null | undefined, casas = 1): string {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

/** AAAA-MM-DD → DD/MM/AAAA (sem passar por `Date`, pra fuso horário nunca deslocar o dia). */
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return NAO_INFORMADO;
  const [a, m, d] = iso.slice(0, 10).split('-');
  return a && m && d ? `${d}/${m}/${a}` : NAO_INFORMADO;
}

/** AAAA-MM-DD → "março/2025". */
export function fmtMesAno(iso: string | null | undefined): string {
  if (!iso) return NAO_INFORMADO;
  const [a, m] = iso.slice(0, 10).split('-');
  const mes = MESES[Number(m) - 1];
  return a && mes ? `${mes}/${a}` : NAO_INFORMADO;
}

/** Timestamp ISO → "19/11/2026 14:30". */
export function fmtDataHora(iso: string | null | undefined): string {
  if (!iso) return NAO_INFORMADO;
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return NAO_INFORMADO;
  return `${data.toLocaleDateString('pt-BR')} ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Data de hoje em AAAA-MM-DD no fuso do usuário. */
export function hojeIso(hoje: Date = new Date()): string {
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;
}
