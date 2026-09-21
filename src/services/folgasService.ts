import { api } from './api';
import { estadoFolgasVazio, type DiaSemanaBloqueado, type EstadoFolgas } from '../types/folgas';

const CHAVE_FOLGAS = 'drogaria-center-folgas';

function normalizarEstado(valor: string | null): EstadoFolgas {
  if (!valor) return estadoFolgasVazio();
  const bruto = JSON.parse(valor) as Partial<EstadoFolgas> & { blockedWeekdays?: Array<DiaSemanaBloqueado | number> };
  return {
    employees: Array.isArray(bruto.employees) ? bruto.employees : [],
    credits: Array.isArray(bruto.credits) ? bruto.credits : [],
    daysOff: Array.isArray(bruto.daysOff) ? bruto.daysOff : [],
    leaves: Array.isArray(bruto.leaves) ? bruto.leaves : [],
    creditSwaps: Array.isArray(bruto.creditSwaps) ? bruto.creditSwaps : [],
    blockedDates: Array.isArray(bruto.blockedDates) ? bruto.blockedDates : [],
    blockedWeekdays: Array.isArray(bruto.blockedWeekdays)
      ? bruto.blockedWeekdays.map((item) => (typeof item === 'number' ? { weekday: item, by: null, at: null } : item))
      : [],
    auditLog: Array.isArray(bruto.auditLog) ? bruto.auditLog : [],
  };
}

export const folgasService = {
  async get() {
    const { data } = await api.get<{ valor: string | null; versao: number }>(`/armazenamento/${CHAVE_FOLGAS}`);
    return { estado: normalizarEstado(data.valor), versao: data.versao };
  },

  async save(estado: EstadoFolgas, versaoEsperada: number) {
    const { data } = await api.put<{ versao: number }>(`/armazenamento/${CHAVE_FOLGAS}`, {
      valor: JSON.stringify(estado),
      versaoEsperada,
    });
    return data.versao;
  },
};

