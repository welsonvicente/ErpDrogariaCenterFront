import { useEffect, useMemo, useState } from 'react';
import { arquivoCartazService } from '../services/arquivoCartazService';
import type { CaixaStory } from '../utils/cartazEngine';
import { carregarImagemDeDataUrl, carregarLogoPadraoStory, EVENTO_LOGO_PADRAO_STORY } from '../utils/cartazPersistencia';

export interface LogoStoryCarregada {
  imagem: HTMLImageElement;
  caixa: CaixaStory;
}

/**
 * Logomarca padrão dos stories (definida no Story produto único), já
 * carregada e pronta pra pintar — `null` enquanto não há logo, enquanto ela
 * carrega ou se o arquivo não existe mais no R2 (ex.: projeto de Story
 * apagado). Acompanha mudanças feitas no Story sem precisar recarregar.
 */
export function useLogoPadraoStory(): LogoStoryCarregada | null {
  const [config, setConfig] = useState(carregarLogoPadraoStory);
  const [carregada, setCarregada] = useState<{ arquivoId: string; imagem: HTMLImageElement } | null>(null);

  useEffect(() => {
    const atualizar = () => setConfig(carregarLogoPadraoStory());
    window.addEventListener(EVENTO_LOGO_PADRAO_STORY, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(EVENTO_LOGO_PADRAO_STORY, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);

  const arquivoId = config?.arquivoId ?? null;
  useEffect(() => {
    // Sem logo: nada a buscar — o retorno abaixo já dá `null` quando não há `config`.
    if (!arquivoId) return;
    let cancelado = false;
    arquivoCartazService
      .obterUrls([arquivoId])
      .then(async ([resultado]) => {
        if (!resultado) throw new Error('arquivo não encontrado');
        const imagem = await carregarImagemDeDataUrl(resultado.url);
        if (!cancelado) setCarregada({ arquivoId, imagem });
      })
      .catch(() => {
        if (!cancelado) setCarregada(null);
      });
    return () => {
      cancelado = true;
    };
  }, [arquivoId]);

  return useMemo(
    () => (config && carregada && carregada.arquivoId === config.arquivoId ? { imagem: carregada.imagem, caixa: config.caixa } : null),
    [config, carregada],
  );
}
