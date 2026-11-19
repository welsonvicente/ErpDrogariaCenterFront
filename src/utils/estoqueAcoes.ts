import type { ConfigEstoque, ProdutoEstoque } from '../types/estoque';
import type { ProdutoAnalisado } from './estoqueAnalise';
import { normalizar } from './estoqueAnalise';
import { fmtMoeda, fmtQuantidade } from './estoqueFormat';

export type CategoriaProduto = 'MEDICAMENTO' | 'MEDICAMENTO_CONTROLADO' | 'VITAMINA_SUPLEMENTO' | 'INFANTIL' | 'PERFUMARIA_COSMETICO' | 'OUTROS';

export const ROTULO_CATEGORIA: Record<CategoriaProduto, string> = {
  MEDICAMENTO: 'Medicamento',
  MEDICAMENTO_CONTROLADO: 'Medicamento sujeito a prescrição',
  VITAMINA_SUPLEMENTO: 'Vitamina / suplemento',
  INFANTIL: 'Infantil',
  PERFUMARIA_COSMETICO: 'Perfumaria / cosmético',
  OUTROS: 'Outros',
};

const RE_CONTROLADO = /controlad|psicotrop|tarja (preta|vermelha)|portaria 344|antibiotic|antimicrobian|receituario/;
// "\betico" com borda de palavra: sem ela casaria dentro de "dermocosméticos".
const RE_GRUPO_MEDICAMENTO = /medicament|generic|similar|referencia|\betico|\bmip\b|isento de prescricao|\brx\b/;
const RE_INFANTIL = /infantil|bebe|baby|crianca|pediatr|fralda|mamadeira|chupeta|lenco umedecido|recem.?nascido|\bkids?\b/;
const RE_VITAMINA = /vitamin|suplement|mineral|omega|colageno|whey|proteina|probiotic|polivitaminic/;
const RE_PERFUMARIA =
  /perfum|cosmetic|higiene|beleza|shampoo|xampu|condicionador|creme|hidratante|sabonete|desodorante|protetor solar|maquiagem|esmalte|batom|capilar|barbear|absorvente|escova|fio dental|enxaguante|cabelo|\bpele\b|depilat/;
const RE_MEDICAMENTO_NO_NOME = /analgesic|antiinflamat|anti-inflamat|antialergic|xarope|comprimid|capsula|gotas|pomada|injetavel|antiacido|dipirona|paracetamol|ibuprofeno/;

/**
 * Classifica o produto só pelo que o relatório diz (grupo, nome, laboratório) —
 * não há campo "categoria" no Trier. Medicamentos têm precedência sobre os
 * demais: um "xarope infantil" continua sendo medicamento, e medicamento nunca
 * recebe sugestão de divulgação/promoção.
 */
export function categoriaDoProduto(p: Pick<ProdutoEstoque, 'produto' | 'grupo' | 'laboratorio'>): CategoriaProduto {
  const grupo = normalizar(p.grupo);
  const tudo = normalizar(`${p.grupo ?? ''} ${p.produto} ${p.laboratorio ?? ''}`);

  if (RE_CONTROLADO.test(tudo)) return 'MEDICAMENTO_CONTROLADO';
  if (RE_GRUPO_MEDICAMENTO.test(grupo)) return 'MEDICAMENTO';
  if (RE_INFANTIL.test(tudo)) return 'INFANTIL';
  if (RE_VITAMINA.test(tudo)) return 'VITAMINA_SUPLEMENTO';
  if (RE_PERFUMARIA.test(tudo)) return 'PERFUMARIA_COSMETICO';
  if (RE_MEDICAMENTO_NO_NOME.test(tudo)) return 'MEDICAMENTO';
  return 'OUTROS';
}

export interface SugestaoAcao {
  categoria: CategoriaProduto;
  acaoRecomendada: string;
  objetivo: string;
  comoExecutar: string;
}

function numerar(passos: string[]): string {
  return passos.map((p, i) => `${i + 1}. ${p}`).join('\n');
}

/** "há X dias" sem afirmar nada sobre vendas — só o que o relatório sabe: a data da última entrada. */
function frasePrazo(p: ProdutoAnalisado, config: ConfigEstoque): string {
  if (p.dias === null) return 'A data da última entrada não foi informada no relatório.';
  if (p.dias > config.diasCritico) return `A última entrada foi há mais de ${config.diasCritico} dias (${p.dias} dias).`;
  if (p.dias > config.diasAlerta) return `A última entrada foi há mais de ${config.diasAlerta} dias (${p.dias} dias).`;
  return `A última entrada foi há ${p.dias} dias.`;
}

/**
 * Sugestão de plano de ação, montada só com dados do relatório (quantidade,
 * valor, laboratório, grupo, fornecedor, tempo desde a última entrada). É um
 * ponto de partida: a gestão edita e salva o que quiser — o texto salvo
 * sempre vence a sugestão (ver `acaoEfetiva`).
 */
export function sugerirAcao(p: ProdutoAnalisado, config: ConfigEstoque): SugestaoAcao {
  const categoria = categoriaDoProduto(p);
  const qtd = fmtQuantidade(p.saldo);
  const capital = p.valor !== null ? fmtMoeda(p.valor) : null;
  const parceiro = p.fornecedor ?? p.laboratorio;
  const linha = p.laboratorio ? ` da linha ${p.laboratorio}` : '';
  const rotina = p.prioridade === 'P4' || p.prioridade === 'SEM';
  const margem = `${config.margemMinimaPct.toLocaleString('pt-BR')}%`;
  const prazo = frasePrazo(p, config);
  const metaCapital = capital ? ` e recuperar o capital parado de ${capital}` : '';

  const reavaliar = `Reavaliar o saldo em 15 dias, registrar o resultado e atualizar o status desta ação.`;
  const confereFisico = `Conferir a quantidade física (sistema: ${qtd} unid.) e a validade dos itens em estoque.`;

  switch (categoria) {
    case 'PERFUMARIA_COSMETICO':
      return {
        categoria,
        acaoRecomendada: rotina ? 'Acompanhar na rotina e evitar nova compra até o saldo girar' : 'Dar destaque na gôndola e montar kit promocional',
        objetivo: `Girar as ${qtd} unidades em estoque${metaCapital}. ${prazo}`,
        comoExecutar: numerar([
          confereFisico,
          'Levar o produto para uma área de maior circulação (ponta de gôndola ou balcão de caixa), com cartaz de oferta.',
          `Montar um kit com produto complementar${linha}, com preço de kit menor que a soma dos itens.`,
          'Divulgar nos canais digitais (WhatsApp, Instagram) com foto e preço.',
          `Antes de aplicar desconto, simular no Simulador de preços e respeitar a margem mínima de ${margem}.`,
          reavaliar,
        ]),
      };

    case 'INFANTIL':
      return {
        categoria,
        acaoRecomendada: rotina ? 'Acompanhar na rotina e evitar nova compra até o saldo girar' : 'Criar exposição temática e kits de produtos complementares',
        objetivo: `Girar as ${qtd} unidades em estoque${metaCapital}. ${prazo}`,
        comoExecutar: numerar([
          confereFisico,
          'Montar uma exposição temática (cuidados com o bebê / higiene infantil) em local visível da loja.',
          `Oferecer kit com produtos complementares${linha} (ex.: higiene + proteção), com preço de kit.`,
          'Divulgar para o público de interesse (clientes com perfil infantil) nos canais digitais e no balcão, sem prometer resultados.',
          `Antes de aplicar desconto, simular no Simulador de preços e respeitar a margem mínima de ${margem}.`,
          reavaliar,
        ]),
      };

    case 'VITAMINA_SUPLEMENTO':
      return {
        categoria,
        acaoRecomendada: rotina ? 'Acompanhar na rotina e evitar nova compra até o saldo girar' : 'Criar exposição estratégica com orientação farmacêutica responsável',
        objetivo: `Girar as ${qtd} unidades em estoque${metaCapital}, com orientação responsável. ${prazo}`,
        comoExecutar: numerar([
          confereFisico,
          'Expor em ponto estratégico, perto do atendimento, para facilitar a orientação do farmacêutico.',
          'Alinhar com a equipe que a indicação e a orientação de uso são do farmacêutico, sem prometer efeitos ou cura.',
          'Criar campanha comercial compatível com a legislação (sem alegações terapêuticas não permitidas na embalagem ou no material).',
          `Se for aplicar condição comercial, simular no Simulador de preços e respeitar a margem mínima de ${margem}.`,
          reavaliar,
        ]),
      };

    case 'MEDICAMENTO_CONTROLADO':
      return {
        categoria,
        acaoRecomendada: 'Verificar validade e negociar troca ou devolução com o fornecedor (sem divulgação comercial)',
        objetivo: `Recuperar o capital parado${capital ? ` de ${capital}` : ''} sem gerar nova compra, dentro das regras sanitárias. ${prazo}`,
        comoExecutar: numerar([
          'Conferir validade e lotes em estoque e o saldo na escrituração obrigatória do produto.',
          `Consultar ${parceiro ?? 'o fornecedor/laboratório'} sobre troca ou devolução dos lotes.`,
          `Revisar o estoque mínimo (${p.estoqueMinimo !== null ? fmtQuantidade(p.estoqueMinimo) + ' unid.' : 'não informado no relatório'}) e o parâmetro de reposição para não repetir a compra.`,
          'Medicamento sujeito a prescrição: não fazer publicidade, promoção nem qualquer incentivo ao uso.',
          reavaliar,
        ]),
      };

    case 'MEDICAMENTO':
      return {
        categoria,
        acaoRecomendada: 'Verificar validade e avaliar devolução ou negociação com o fornecedor',
        objetivo: `Recuperar o capital parado${capital ? ` de ${capital}` : ''} sem gerar nova compra do item, respeitando as regras sanitárias. ${prazo}`,
        comoExecutar: numerar([
          'Conferir validade e lotes em estoque, separando os de vencimento mais próximo.',
          `Consultar ${parceiro ?? 'o fornecedor/laboratório'} sobre troca, devolução ou condição comercial para o saldo parado (${qtd} unid.).`,
          `Revisar o estoque mínimo (${p.estoqueMinimo !== null ? fmtQuantidade(p.estoqueMinimo) + ' unid.' : 'não informado no relatório'}) e o parâmetro de reposição para não repetir a compra.`,
          'Avaliar com a gerência condições comerciais de balcão, sempre respeitando as regras sanitárias e de dispensação.',
          'Não divulgar nem promover medicamentos sujeitos a prescrição, nem estimular o uso.',
          reavaliar,
        ]),
      };

    default:
      return {
        categoria,
        acaoRecomendada: rotina ? 'Acompanhar na rotina e evitar nova compra até o saldo girar' : 'Avaliar o giro do item e definir exposição, condição comercial ou negociação com o fornecedor',
        objetivo: `Reduzir o estoque parado de ${qtd} unidades${metaCapital}. ${prazo}`,
        comoExecutar: numerar([
          confereFisico,
          'Verificar se o produto está bem exposto e com preço visível; se não, reposicionar.',
          `Consultar ${parceiro ?? 'o fornecedor'} sobre troca ou devolução, se o produto permitir.`,
          `Se for aplicar desconto, simular no Simulador de preços e respeitar a margem mínima de ${margem}.`,
          reavaliar,
        ]),
      };
  }
}

export interface AcaoEfetiva extends SugestaoAcao {
  /** true quando a gestão já salvou algum dos três textos (o que ela salvou vale mais que a sugestão). */
  personalizada: boolean;
}

/** Texto que a gestão salvou, campo a campo, ou a sugestão automática onde ela não escreveu nada. */
export function acaoEfetiva(p: ProdutoAnalisado, config: ConfigEstoque): AcaoEfetiva {
  const s = sugerirAcao(p, config);
  return {
    categoria: s.categoria,
    acaoRecomendada: p.acaoRecomendada ?? s.acaoRecomendada,
    objetivo: p.objetivo ?? s.objetivo,
    comoExecutar: p.comoExecutar ?? s.comoExecutar,
    personalizada: !!(p.acaoRecomendada || p.objetivo || p.comoExecutar),
  };
}

/**
 * Candidato a troca/devolução com o fornecedor: sobra de estoque (P1/P2) com
 * muito tempo desde a última entrada. É só uma indicação — quem decide é a
 * gestão, que marca o produto na tela de fornecedores.
 */
export function candidatoNegociacao(p: ProdutoAnalisado, config: ConfigEstoque): boolean {
  return (p.prioridade === 'P1' || p.prioridade === 'P2') && p.dias !== null && p.dias > config.diasAlerta;
}
