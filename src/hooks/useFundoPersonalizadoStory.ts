import { useEffect, useMemo, useState } from 'react';
import type { CaixaStory } from '../utils/cartazEngine';
import { carregarConfiguracoes, EVENTO_CONFIG_STORY_SALVA, EVENTO_PREFERENCIAS_SINCRONIZADAS } from '../utils/cartazPersistencia';
import { carregarFundoDoServidor } from '../utils/fundoNoServidor';

export interface FundoPersonalizadoCarregado {
  imagem: HTMLImageElement;
  produtoCaixa: CaixaStory | null;
}

function lerConfig() {
  const config = carregarConfiguracoes() || {};
  return {
    arquivoId: config.fundoPersonalizadoAtivo ? config.fundoPersonalizado?.arquivoId ?? null : null,
    produtoCaixa: config.produtoCaixa ?? null,
  };
}

/**
 * Fundo personalizado dos stories (ligado no Story produto único), já baixado
 * e pronto pra pintar — `null` quando a opção está desligada, sem fundo, ainda
 * carregando ou se o arquivo não existe mais. Acompanha mudanças feitas no
 * Story (inclusive em outro aparelho, pela sincronização das preferências).
 */
export function useFundoPersonalizadoStory(): FundoPersonalizadoCarregado | null {
  const [config, setConfig] = useState(lerConfig);
  const [carregado, setCarregado] = useState<{ arquivoId: string; imagem: HTMLImageElement } | null>(null);

  useEffect(() => {
    // Só troca o estado se mudou de verdade — o Story grava a configuração a cada ajuste de cor/posição.
    const atualizar = () => setConfig((atual) => {
      const novo = lerConfig();
      return JSON.stringify(novo) === JSON.stringify(atual) ? atual : novo;
    });
    window.addEventListener(EVENTO_PREFERENCIAS_SINCRONIZADAS, atualizar);
    window.addEventListener(EVENTO_CONFIG_STORY_SALVA, atualizar);
    window.addEventListener('storage', atualizar);
    return () => {
      window.removeEventListener(EVENTO_PREFERENCIAS_SINCRONIZADAS, atualizar);
      window.removeEventListener(EVENTO_CONFIG_STORY_SALVA, atualizar);
      window.removeEventListener('storage', atualizar);
    };
  }, []);

  const { arquivoId } = config;
  useEffect(() => {
    if (!arquivoId) return;
    let cancelado = false;
    carregarFundoDoServidor(arquivoId)
      .then((imagem) => { if (!cancelado) setCarregado({ arquivoId, imagem }); })
      .catch(() => { if (!cancelado) setCarregado(null); });
    return () => { cancelado = true; };
  }, [arquivoId]);

  return useMemo(
    () => (arquivoId && carregado?.arquivoId === arquivoId ? { imagem: carregado.imagem, produtoCaixa: config.produtoCaixa } : null),
    [arquivoId, carregado, config.produtoCaixa],
  );
}
