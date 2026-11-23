import { montarTextoPromocional } from './cartazEngine';

/** Texto da oferta que acompanha a imagem (o mesmo do "Copiar texto"). */
export function montarTextoOfertaWhatsapp(descricao: string, de: string, por: string): string {
  return `🔥 *OFERTA* 🔥\n\n${montarTextoPromocional(descricao, de, por)}\n\n📍 Corre que é por tempo limitado!`;
}

/** dataURL → Blob sem esperar nada: o clique continua valendo pra compartilhar/copiar/abrir a aba. */
function blobDeDataUrl(dataUrl: string): Blob {
  const [cabecalho, base64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(cabecalho)?.[1] ?? 'image/png';
  const bytes = atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) buffer[i] = bytes.charCodeAt(i);
  return new Blob([buffer], { type: mime });
}

export type ResultadoEnvioWhatsapp = 'compartilhado' | 'cancelado' | 'whatsapp-aberto' | 'imagem-baixada';

/**
 * Manda a arte do produto pro WhatsApp com o texto da oferta.
 * - Celular e Windows (Chrome/Edge): janela "Compartilhar" do sistema — escolhe o WhatsApp.
 *   Foto e texto vão juntos, sem colar nada. Quem decide o formato é o WhatsApp: no Android o texto vira
 *   a legenda (uma mensagem só); no Windows chegam dois balões (foto e texto); no iPhone às vezes só a foto.
 * - Sem essa janela: copia a IMAGEM e abre o WhatsApp já com o TEXTO escrito; na conversa, Ctrl+V cola
 *   a imagem. Sem copiar imagem (navegador antigo), baixa o PNG.
 * Chamar direto do clique (sem esperas antes): navegadores só deixam compartilhar/abrir aba durante o clique.
 */
export async function enviarNoWhatsapp(imagemDataUrl: string, nomeArquivo: string, texto: string): Promise<ResultadoEnvioWhatsapp> {
  const blob = blobDeDataUrl(imagemDataUrl);
  const arquivo = new File([blob], nomeArquivo, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[]; text?: string }) => boolean;
    share?: (data: { files?: File[]; text?: string; title?: string }) => Promise<void>;
  };

  const dados = { files: [arquivo], text: texto };
  if (nav.share && nav.canShare?.(dados)) {
    try {
      await nav.share(dados);
      return 'compartilhado';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return 'cancelado';
      // outro erro (ex.: sistema sem destino pra imagem): segue pro caminho de copiar e colar
    }
  }

  let imagemCopiada = false;
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      imagemCopiada = true;
    }
  } catch {
    /* sem permissão de copiar imagem — baixa o arquivo abaixo */
  }
  if (!imagemCopiada) {
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement('a');
    link.download = nomeArquivo;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  // api.whatsapp.com (e não wa.me): o redirecionamento do wa.me estraga os emojis (viram "�").
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
  return imagemCopiada ? 'whatsapp-aberto' : 'imagem-baixada';
}

/** Aviso pra tela depois de enviar — explica o passo que falta em cada caso. */
export function mensagemEnvioWhatsapp(resultado: ResultadoEnvioWhatsapp): string {
  if (resultado === 'whatsapp-aberto') return 'WhatsApp aberto com o texto da oferta. Escolha a conversa e cole a imagem com Ctrl+V.';
  if (resultado === 'imagem-baixada') return 'WhatsApp aberto com o texto da oferta. A imagem foi baixada — anexe-a na conversa.';
  if (resultado === 'compartilhado') return '';
  return '';
}
