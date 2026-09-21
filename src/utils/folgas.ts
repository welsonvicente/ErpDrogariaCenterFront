import type { EstadoFolgas, FolgasCredito } from '../types/folgas';

export const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

export function uid(prefixo: string) {
  return `${prefixo}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function hojeIso() {
  const data = new Date();
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

export function amanhaIso() {
  const data = new Date();
  data.setDate(data.getDate() + 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
}

export function primeiroDiaMesIso() {
  return `${hojeIso().slice(0, 7)}-01`;
}

export function formatarData(dataIso: string) {
  if (!dataIso) return '—';
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function formatarDataHora(dataIso: string) {
  return new Date(dataIso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function formatarDinheiro(valor: number) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function diaSemana(dataIso: string) {
  return DIAS_SEMANA[new Date(`${dataIso}T12:00:00`).getDay()];
}

export function diasInclusivos(inicio: string, fim: string) {
  const a = new Date(`${inicio}T12:00:00Z`).getTime();
  const b = new Date(`${fim}T12:00:00Z`).getTime();
  return Math.max(0, Math.round((b - a) / 86_400_000) + 1);
}

export function creditosDe(estado: EstadoFolgas, employeeId: string) {
  return estado.credits.filter((item) => item.employeeId === employeeId);
}

export function folgasDe(estado: EstadoFolgas, employeeId: string) {
  return estado.daysOff.filter((item) => item.employeeId === employeeId);
}

export function saldoDe(estado: EstadoFolgas, employeeId: string) {
  return creditosDe(estado, employeeId).length - folgasDe(estado, employeeId).length;
}

/** Pareia folgas aos créditos mais antigos, reproduzindo a regra da ferramenta original. */
export function parearCreditos(estado: EstadoFolgas) {
  const usados = new Map<string, string>();
  for (const colaborador of estado.employees) {
    const creditos = creditosDe(estado, colaborador.id).slice().sort((a, b) => a.workedDate.localeCompare(b.workedDate));
    const folgas = folgasDe(estado, colaborador.id).slice().sort((a, b) => a.date.localeCompare(b.date));
    folgas.forEach((folga, indice) => {
      if (creditos[indice]) usados.set(creditos[indice].id, folga.date);
    });
  }
  return usados;
}

export function creditoDisponivelMaisAntigo(estado: EstadoFolgas, employeeId: string): FolgasCredito | null {
  const usados = parearCreditos(estado);
  return creditosDe(estado, employeeId)
    .slice()
    .sort((a, b) => a.workedDate.localeCompare(b.workedDate))
    .find((credito) => !usados.has(credito.id)) ?? null;
}

export function ator(nome: string, perfil: string) {
  return `${nome} (${perfil === 'ADMIN' ? 'Administrador' : perfil === 'GERENTE' ? 'Gerente' : 'Funcionário'})`;
}

