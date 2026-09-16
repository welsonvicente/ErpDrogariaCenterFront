import { useEffect, useState } from 'react';

const INTERVALO_VERIFICACAO_MS = 5 * 60 * 1000;

/**
 * Avisa quando um deploy novo saiu enquanto a aba estava aberta — sem isso,
 * quem já tinha a página carregada continua rodando o JS antigo (às vezes
 * incompatível com o backend já atualizado) até recarregar manualmente.
 */
export function UpdateBanner() {
  const [novaVersaoDisponivel, setNovaVersaoDisponivel] = useState(false);

  useEffect(() => {
    let cancelado = false;

    async function verificarVersao() {
      try {
        const resposta = await fetch('/version.json', { cache: 'no-store' });
        if (!resposta.ok) return;
        const dados = await resposta.json();
        if (!cancelado && dados.buildId && dados.buildId !== __BUILD_ID__) {
          setNovaVersaoDisponivel(true);
        }
      } catch {
        // Sem rede ou version.json indisponível (ex.: dev local) — tenta de novo no próximo ciclo.
      }
    }

    verificarVersao();
    const intervalId = setInterval(verificarVersao, INTERVALO_VERIFICACAO_MS);

    function aoVoltarParaAba() {
      if (document.visibilityState === 'visible') verificarVersao();
    }
    document.addEventListener('visibilitychange', aoVoltarParaAba);

    return () => {
      cancelado = true;
      clearInterval(intervalId);
      document.removeEventListener('visibilitychange', aoVoltarParaAba);
    };
  }, []);

  if (!novaVersaoDisponivel) return null;

  return (
    <div className="update-banner">
      <span>Nova versão disponível</span>
      <button className="btn-primary" onClick={() => window.location.reload()}>
        Atualizar
      </button>
    </div>
  );
}
