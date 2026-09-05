import { useEffect } from 'react';

/** Define o título da aba do navegador para a página atual, sempre com o sufixo da marca. */
export function useDocumentTitle(titulo: string) {
  useEffect(() => {
    document.title = `${titulo} — PharmaMind`;
  }, [titulo]);
}
