import JSZip from 'jszip';

async function paraArquivo(conteudo: string | Blob, nomeArquivo: string, mime?: string): Promise<File> {
  if (typeof conteudo === 'string') {
    const res = await fetch(conteudo);
    const blob = await res.blob();
    return new File([blob], nomeArquivo, { type: mime || blob.type });
  }
  return new File([conteudo], nomeArquivo, { type: mime || conteudo.type });
}

function baixarPorLink(arquivo: File) {
  const url = URL.createObjectURL(arquivo);
  const link = document.createElement('a');
  link.download = arquivo.name;
  link.href = url;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Baixa o arquivo direto pra pasta de Downloads do computador — sem passar
 * pela folha de compartilhar (Web Share API), mesmo quando o navegador
 * suportaria compartilhar. Existe porque `salvarOuCompartilharArquivo` prefere
 * compartilhar quando disponível (útil pra mandar direto pro WhatsApp em
 * celular), mas às vezes a pessoa só quer o arquivo salvo ali no PC mesmo,
 * sem abrir a folha de compartilhar do Windows/Mac no meio do caminho.
 */
export async function baixarArquivoDireto(conteudo: string | Blob, nomeArquivo: string, mime: string) {
  const arquivo = await paraArquivo(conteudo, nomeArquivo, mime);
  baixarPorLink(arquivo);
}

/**
 * "Baixa" ou compartilha um arquivo — no iPhone (Safari/Chrome-iOS), o
 * atributo `download` do `<a>` é ignorado, então clicar no link simplesmente
 * não baixa nada. A Web Share API (passando o arquivo) é o jeito confiável de
 * "salvar" ali: abre a folha de compartilhar nativa, que tem "Salvar
 * Imagem"/"Salvar Arquivo". Em desktop/Android o download normal já funciona
 * bem, então só usa o compartilhamento quando o navegador realmente suportar
 * compartilhar aquele arquivo.
 *
 * Aceita uma dataURL (caso comum, uma imagem só) ou um `Blob` já pronto (caso
 * do .zip de várias páginas de panfleto, que nunca faria sentido virar dataURL).
 */
export async function salvarOuCompartilharArquivo(
  conteudo: string | Blob,
  nomeArquivo: string,
  mime: string,
  tituloCompartilhamento?: string,
) {
  const arquivo = await paraArquivo(conteudo, nomeArquivo, mime);

  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title?: string }) => Promise<void> };
  if (nav.canShare?.({ files: [arquivo] })) {
    try {
      // "title" é o texto que aparece pra pessoa na folha de compartilhar (ex.:
      // no iPhone) — usamos o nome do produto em vez do nome técnico do
      // arquivo (com slug e timestamp), que não diz nada pra quem recebe.
      await nav.share?.({ files: [arquivo], title: tituloCompartilhamento || nomeArquivo });
      return;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return; // cancelou o compartilhamento, não é erro
      // qualquer outro erro cai pro download tradicional abaixo
    }
  }

  // Fallback: download por link — funciona em desktop e Android. No
  // iPhone/iPad sem suporte a compartilhar arquivo, a saída é tocar e segurar
  // a imagem que já fica visível na tela pra salvar.
  baixarPorLink(arquivo);
}

/**
 * Compartilha VÁRIOS arquivos de uma vez (ex.: o story de cada produto do
 * panfleto) — quando o navegador suporta compartilhar múltiplos arquivos
 * (a maioria dos celulares), WhatsApp/Instagram recebem as imagens prontas
 * pra postar, sem precisar descompactar nada antes. Sem esse suporte (a
 * maioria dos navegadores de desktop), baixa um único .zip com tudo dentro
 * — pra isso servir tanto "mandar direto" no celular quanto "guardar tudo"
 * no computador.
 */
export async function compartilharOuBaixarVarios(
  itens: { conteudo: string | Blob; nomeArquivo: string; mime: string }[],
  nomeZip: string,
  tituloCompartilhamento?: string,
) {
  const arquivos = await Promise.all(itens.map((item) => paraArquivo(item.conteudo, item.nomeArquivo, item.mime)));

  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean; share?: (data: { files: File[]; title?: string }) => Promise<void> };
  if (nav.canShare?.({ files: arquivos })) {
    try {
      await nav.share?.({ files: arquivos, title: tituloCompartilhamento });
      return;
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return; // cancelou o compartilhamento, não é erro
      // qualquer outro erro cai pro .zip abaixo
    }
  }

  const zip = new JSZip();
  arquivos.forEach((arquivo) => zip.file(arquivo.name, arquivo));
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  baixarPorLink(await paraArquivo(zipBlob, nomeZip, 'application/zip'));
}
