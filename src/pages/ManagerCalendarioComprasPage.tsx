import { useLayoutEffect } from 'react';
import { isAxiosError } from 'axios';
import { ManagerLayout } from '../components/ManagerLayout';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { api } from '../services/api';

/** Ponte que o calendário (iframe do mesmo origin) usa para ler/gravar no servidor. */
export interface PharmaArmazenamento {
  get(chave: string): Promise<{ valor: string | null; versao: number }>;
  set(chave: string, valor: string, versaoEsperada: number): Promise<{ conflito: boolean; versao: number }>;
}

declare global {
  interface Window {
    pharmaArmazenamento?: PharmaArmazenamento;
  }
}

const pharmaArmazenamento: PharmaArmazenamento = {
  async get(chave) {
    const { data } = await api.get<{ valor: string | null; versao: number }>(`/armazenamento/${chave}`);
    return data;
  },
  async set(chave, valor, versaoEsperada) {
    try {
      const { data } = await api.put<{ versao: number }>(`/armazenamento/${chave}`, { valor, versaoEsperada });
      return { conflito: false, versao: data.versao };
    } catch (erro) {
      if (isAxiosError(erro) && erro.response?.status === 409) {
        return { conflito: true, versao: (erro.response.data as { versao?: number })?.versao ?? versaoEsperada };
      }
      throw erro;
    }
  },
};

/**
 * Gestão → Calendário de compras: a ferramenta public/gestao/calendario-compras.html
 * embutida na moldura do painel. Categorias, regras, feriados e os meses ficam no
 * armazenamento da organização (`/armazenamento/drogaria-center-calendario-compras`,
 * só ADMIN/GERENTE), então o calendário é o mesmo em qualquer computador da loja.
 */
export function ManagerCalendarioComprasPage() {
  useDocumentTitle('Calendário de compras');

  // Antes do iframe carregar: o script dele procura a ponte no window do painel logo ao abrir.
  useLayoutEffect(() => {
    window.pharmaArmazenamento = pharmaArmazenamento;
    return () => {
      delete window.pharmaArmazenamento;
    };
  }, []);

  return (
    <ManagerLayout>
      <div className="card ferramenta-embutida ferramenta-embutida--gestao">
        <iframe src="/gestao/calendario-compras.html" title="Calendário de compras" />
      </div>
    </ManagerLayout>
  );
}
