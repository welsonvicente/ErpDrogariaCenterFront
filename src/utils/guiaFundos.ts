/**
 * Textos prontos pra pedir ao ChatGPT o FUNDO de cada arte, com o modelo
 * (PNG em branco mostrando onde ficam os produtos) de cada formato. As
 * porcentagens e os tamanhos vêm das mesmas contas dos motores de desenho
 * (panfletoEngine.ts, tabletEngine.ts, cartazOfertaEngine.ts, borda padrão 40).
 * Os modelos ficam em /public/modelos-de-fundo.
 */

export interface ModeloFundo {
  rotulo: string;
  arquivo: string;
  tamanho: string;
}

export interface GuiaFundo {
  id: string;
  titulo: string;
  ondeUsar: string;
  texto: string;
  modelos: ModeloFundo[];
}

const PASTA = '/modelos-de-fundo';

const REGRA_SEM_TEXTO = 'NÃO coloque nenhum texto, número, preço, logotipo nem produto na imagem.';

function modelo(rotulo: string, arquivo: string, tamanho: string): ModeloFundo {
  return { rotulo, arquivo: `${PASTA}/${arquivo}`, tamanho };
}

interface ConfigPanfleto {
  itens: number;
  proporcao: string;
  grade: string;
  topo: number;
  baseSemQr: number;
  baseComQr: number;
  semQr: string;
  comQr: string;
}

const PANFLETOS: ConfigPanfleto[] = [
  { itens: 3, proporcao: 'horizontal na proporção 3:2', grade: '3 cards brancos de produtos lado a lado, numa única linha', topo: 18, baseSemQr: 86, baseComQr: 76, semQr: '3264x2100', comQr: '3264x2370' },
  { itens: 6, proporcao: 'quase quadrado (proporção 1:1)', grade: '6 cards brancos de produtos, em 3 colunas por 2 linhas', topo: 13, baseSemQr: 90, baseComQr: 82, semQr: '2904x2982', comQr: '2904x3252' },
  { itens: 9, proporcao: 'vertical na proporção 3:4', grade: '9 cards brancos de produtos, em 3 colunas por 3 linhas', topo: 11, baseSemQr: 92, baseComQr: 85, semQr: '2724x3654', comQr: '2724x3924' },
  { itens: 12, proporcao: 'vertical na proporção 3:5', grade: '12 cards brancos de produtos, em 3 colunas por 4 linhas', topo: 9, baseSemQr: 93, baseComQr: 87, semQr: '2454x4146', comQr: '2454x4416' },
];

function textoPanfleto(c: ConfigPanfleto): string {
  return `Crie uma imagem de FUNDO para um panfleto de ofertas de farmácia (Drogaria Center), formato ${c.proporcao}. Use a imagem anexada apenas como guia de layout: NÃO reproduza os retângulos, as cores de guia nem os textos dela.

Regras de layout (obrigatórias):
- Faixa do topo (0% a ${c.topo}% da altura): área decorativa com espaço limpo à esquerda para o nome da loja e o título, que serão escritos depois.
- Área central (${c.topo}% a ${c.baseSemQr}% da altura, com margem de 4% nas laterais): vai ficar COBERTA por ${c.grade}. Aqui o fundo deve ser suave e sem detalhes importantes — só textura leve, degradê ou elementos que podem ficar escondidos atrás dos cards.
- Faixa de baixo (${c.baseSemQr}% a 100% da altura): área decorativa, com espaço limpo para uma linha de texto.
- Se for a versão COM QR Code: a faixa de baixo começa em ${c.baseComQr}% da altura e tem um quadrado de QR Code no canto inferior esquerdo — deixe esse canto limpo e claro.

Estilo: alegre, limpo, comercial, de farmácia. Cores principais: verde (#628B00), verde escuro (#173C3A), branco, com detalhes em vermelho (#E30613). Pode usar elementos como cruz de farmácia, folhas, formas onduladas e brilho suave nas bordas e nos espaços entre os cards.

${REGRA_SEM_TEXTO}`;
}

export const GUIAS_FUNDO: GuiaFundo[] = [
  {
    // Posições = padrão do Story (cartazEngine.ts: faixas em 130/320/560 e CAIXA_PRODUTO_PADRAO_STORY).
    id: 'story',
    titulo: '📱 Story do Instagram',
    ondeUsar: 'Story → "🎨 Fundo personalizado" → "Escolher fundo"',
    texto: `Crie uma imagem de FUNDO para story do Instagram de uma farmácia (Drogaria Center), para anunciar promoções de produtos. Use a imagem anexada apenas como guia de layout: NÃO reproduza os retângulos, as cores de guia nem os textos dela.

Formato obrigatório:
- Vertical, proporção 9:16, exatamente 1080 x 1920 pixels.

Importante — é só o fundo:
- NÃO coloque nenhum texto, letra, número, preço, logotipo, produto, pessoa ou mão na imagem.
- Os textos (nome do produto e preço) e a foto do produto serão colocados depois por cima, pelo nosso sistema.

Onde cada coisa vai ficar (deixe essas áreas limpas e com bom contraste):
- Topo (0 a 250 px de altura): só fundo, sem detalhes importantes (o Instagram cobre com o nome do perfil).
- Faixa de 130 a 660 px de altura: área dos textos (nome, preço e frases). Fundo mais calmo e uniforme.
- Faixa de 680 a 1820 px de altura, no centro (de 90 a 990 px na largura): onde a foto do produto vai aparecer, recortada e sem fundo. Deixe essa área bem limpa, com cor lisa ou degradê suave, de preferência mais clara, para o produto se destacar.
- Rodapé (1580 a 1920 px): só fundo (o Instagram cobre com o campo de mensagem).

Estilo:
- Clima de promoção/oferta, alegre e moderno, aparência profissional de farmácia.
- Cores principais: verde (#628B00 e #173C3A) com toques de vermelho (#E30613) e branco.
- Enfeites (formas, faixas, brilhos, folhas, confetes ou ondas) apenas nas bordas e nos cantos, sem invadir o centro.
- Iluminação suave, sem poluição visual.

Para variar o tema, troque a parte de "Estilo" — por exemplo: Dia das Mães (rosa e lilás com flores delicadas nos cantos), Black Friday (preto/grafite com detalhes em verde-limão e dourado), Natal (vermelho e verde com luzinhas e estrelas nas bordas), Inverno (azul-claro e branco com flocos de neve suaves nos cantos).

Entregue a imagem em alta qualidade, pronta para usar como fundo.`,
    modelos: [modelo('Story', 'story-1080x1920.png', '1080 × 1920')],
  },
  ...PANFLETOS.map((c) => ({
    id: `panfleto-${c.itens}`,
    titulo: `🗞️ Panfleto — ${c.itens} por página`,
    ondeUsar: 'Panfleto → "Imagem de fundo"',
    texto: textoPanfleto(c),
    modelos: [
      modelo('Sem QR Code', `panfleto-${c.itens}-por-pagina-sem-qrcode-${c.semQr}.png`, c.semQr.replace('x', ' × ')),
      modelo('Com QR Code', `panfleto-${c.itens}-por-pagina-com-qrcode-${c.comQr}.png`, c.comQr.replace('x', ' × ')),
    ],
  })),
  {
    id: 'tablet',
    titulo: '🖥️ Tablet da loja',
    ondeUsar: 'Panfleto → Artes para o tablet → "Escolher fundo"',
    texto: `Crie uma imagem de FUNDO para uma tela de TV/tablet de ofertas de farmácia (Drogaria Center), formato horizontal na proporção 16:9. Use a imagem anexada apenas como guia de layout: NÃO reproduza os retângulos nem os textos dela.

Regras de layout (obrigatórias):
- Canto superior esquerdo (faixa de 0% a 11% da altura): espaço limpo para uma logomarca que será colocada depois.
- Área central (13% a 87% da altura, com margem de 3% nas laterais): vai ficar COBERTA por 4 cards brancos de produtos lado a lado. Aqui o fundo deve ser suave e sem detalhes importantes.
- Faixa de baixo (87% a 100% da altura): pode ter elementos decorativos.
- Os detalhes mais bonitos devem ficar nas bordas e nos espaços estreitos entre os 4 cards.

Estilo: vibrante, moderno e comercial, de farmácia, chamativo para ver de longe. Cores: verde (#628B00), verde escuro (#173C3A), branco, com detalhes em vermelho (#E30613).

${REGRA_SEM_TEXTO}`,
    modelos: [modelo('Tablet', 'tablet-1920x1080.png', '1920 × 1080')],
  },
  {
    id: 'oferta',
    titulo: '🏷️ Cartaz de oferta (A4)',
    ondeUsar: 'Cartaz de oferta → "Usar outra imagem"',
    texto: `Crie uma imagem de FUNDO para um cartaz de oferta de farmácia (Drogaria Center), formato vertical na proporção 2:3. Use a imagem anexada apenas como guia de layout: NÃO reproduza os retângulos nem os textos dela.

Regras de layout (obrigatórias):
- Topo (0% a 18% da altura): uma faixa de destaque vermelha (#E30613), chamativa, onde depois será escrita a palavra "OFERTA". Deixe essa faixa lisa no centro.
- Meio (19% a 76% da altura): fundo BRANCO ou bem claro e liso, sem desenhos — aqui vão o nome do produto em letras escuras e o preço gigante em vermelho, então precisa de contraste e de nenhuma interferência.
- Base (77% a 100% da altura): área decorativa leve, com espaço limpo no centro para uma logomarca que será colocada depois.

Estilo: cartaz de supermercado/farmácia, limpo, de alto contraste, fácil de ler de longe. Detalhes em verde (#628B00) e vermelho (#E30613), só nas bordas.

${REGRA_SEM_TEXTO}`,
    modelos: [modelo('Cartaz', 'cartaz-oferta-1334x2000.png', '1334 × 2000')],
  },
];

export const PASSOS_AJUSTE_FUNDO = [
  'Cole o texto no ChatGPT e anexe o modelo do mesmo formato (botão "Baixar modelo").',
  'O ChatGPT gera em 1024 × 1536 ou 1536 × 1024 — abra a imagem no Canva (ou Photopea) num design do tamanho exato do modelo.',
  'Faça a imagem preencher o design; se a proporção não bater, expanda as bordas ou corte o excesso. Pode pôr o modelo por cima, transparente, pra conferir.',
  'Esconda o modelo, exporte em PNG/JPG e envie no lugar indicado em "Onde usar".',
  'Textos, preços e logo NÃO vão na arte: o sistema escreve os textos e a logo entra pela "Logomarca ou selo".',
];
