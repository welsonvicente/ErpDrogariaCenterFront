import { useEffect } from 'react';

/**
 * Bloqueia fechar/recarregar a aba (`beforeunload`) enquanto houver upload de
 * foto em andamento ou uma alteração ainda não confirmada no servidor —
 * sem isso, sair bem no meio de um upload ou antes do autosave (debounce)
 * disparar perdia a mudança sem nenhum aviso.
 *
 * Cobre fechar a aba, recarregar e navegar pra fora do site. Não cobre trocar
 * de rota dentro do próprio app (SPA) — ver `salvarAgora` nos modos de
 * Cartazes, que evita a maior parte desse risco salvando na hora em vez de
 * esperar o debounce assim que uma foto confirma.
 */
export function useAvisoSairComPendencia(pendente: boolean) {
  useEffect(() => {
    function handler(evento: BeforeUnloadEvent) {
      if (!pendente) return;
      evento.preventDefault();
      evento.returnValue = '';
    }
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendente]);
}
