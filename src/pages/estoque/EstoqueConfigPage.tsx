import { useMemo, useState, type FormEvent } from 'react';
import { Painel } from '../../components/estoque/Elementos';
import { useEstoque } from '../../context/EstoqueContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { mensagemDeErro } from '../../services/estoqueService';
import type { ConfigEstoque } from '../../types/estoque';
import { CONFIG_PADRAO } from '../../utils/estoqueAnalise';
import { fmtInteiro } from '../../utils/estoqueFormat';

/** Texto digitado → número (aceita vírgula). NaN quando vazio/ilegível, pra validação barrar. */
const n = (texto: string) => (texto.trim() === '' ? NaN : Number(texto.replace(',', '.')));

interface Campos {
  p1Min: string;
  p2Min: string;
  p3Min: string;
  p4Min: string;
  diasAlerta: string;
  diasCritico: string;
  estoqueElevadoMin: string;
  margemMinimaPct: string;
  pesoQuantidade: string;
  pesoValor: string;
  pesoTempo: string;
}

const paraCampos = (c: ConfigEstoque): Campos => ({
  p1Min: String(c.faixas.p1Min),
  p2Min: String(c.faixas.p2Min),
  p3Min: String(c.faixas.p3Min),
  p4Min: String(c.faixas.p4Min),
  diasAlerta: String(c.diasAlerta),
  diasCritico: String(c.diasCritico),
  estoqueElevadoMin: String(c.estoqueElevadoMin),
  margemMinimaPct: String(c.margemMinimaPct),
  pesoQuantidade: String(c.pesos.quantidade),
  pesoValor: String(c.pesos.valor),
  pesoTempo: String(c.pesos.tempo),
});

function paraConfig(c: Campos, nomesGrupos: Record<string, string>): ConfigEstoque {
  return {
    faixas: { p1Min: n(c.p1Min), p2Min: n(c.p2Min), p3Min: n(c.p3Min), p4Min: n(c.p4Min) },
    diasAlerta: n(c.diasAlerta),
    diasCritico: n(c.diasCritico),
    estoqueElevadoMin: n(c.estoqueElevadoMin),
    margemMinimaPct: n(c.margemMinimaPct),
    pesos: { quantidade: n(c.pesoQuantidade), valor: n(c.pesoValor), tempo: n(c.pesoTempo) },
    nomesGrupos,
  };
}

/** Mesmas regras do servidor — barra o erro antes de ir à rede e explica em português. */
function validar(c: ConfigEstoque): string {
  const numeros = [c.faixas.p1Min, c.faixas.p2Min, c.faixas.p3Min, c.faixas.p4Min, c.diasAlerta, c.diasCritico, c.estoqueElevadoMin, c.margemMinimaPct, c.pesos.quantidade, c.pesos.valor, c.pesos.tempo];
  if (numeros.some((v) => !Number.isFinite(v) || v < 0)) return 'Preencha todos os campos com números (zero ou maiores).';
  const { p1Min, p2Min, p3Min, p4Min } = c.faixas;
  if (!(p1Min > p2Min && p2Min > p3Min && p3Min > p4Min)) return 'Os mínimos das faixas precisam ser decrescentes: P1 > P2 > P3 > P4.';
  if (p4Min < 0.001) return 'O mínimo da faixa P4 precisa ser maior que zero.';
  if (c.diasCritico < c.diasAlerta) return 'O prazo crítico não pode ser menor que o de alerta.';
  if (c.margemMinimaPct >= 100) return 'A margem mínima precisa ser menor que 100%.';
  if (c.pesos.quantidade + c.pesos.valor + c.pesos.tempo <= 0) return 'Pelo menos um peso do ranking precisa ser maior que zero.';
  return '';
}

export function EstoqueConfigPage() {
  useDocumentTitle('Configurações — Estoque');
  const { config, produtos, salvarConfig, avisar } = useEstoque();
  const [c, setC] = useState<Campos>(() => paraCampos(config));
  const [nomesGrupos, setNomesGrupos] = useState<Record<string, string>>(config.nomesGrupos ?? {});

  // Códigos de grupo que existem no relatório (com quantos produtos cada um) — só faz sentido nomear códigos numéricos.
  const gruposDoRelatorio = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const p of produtos) if (p.grupo) contagem.set(p.grupo, (contagem.get(p.grupo) ?? 0) + 1);
    const lista = [...contagem.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR', { numeric: true }));
    return lista.some(([codigo]) => /^\d+$/.test(codigo)) ? lista : [];
  }, [produtos]);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const mudar = (parcial: Partial<Campos>) => setC((atual) => ({ ...atual, ...parcial }));

  async function salvar(evento: FormEvent) {
    evento.preventDefault();
    // Só guarda nomes preenchidos e de códigos que ainda existem no relatório não faria sentido apagar nomes de códigos ausentes: mantém todos os preenchidos.
    const nomes = Object.fromEntries(Object.entries(nomesGrupos).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v !== ''));
    const nova = paraConfig(c, nomes);
    const problema = validar(nova);
    if (problema) {
      setErro(problema);
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      await salvarConfig(nova);
      avisar('Configurações salvas. A classificação foi recalculada.');
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  const campo = (rotulo: string, chave: keyof Campos, ajuda?: string) => (
    <label className="field">
      <span>{rotulo}</span>
      <input inputMode="decimal" value={c[chave]} onChange={(e) => mudar({ [chave]: e.target.value })} />
      {ajuda && <small className="est-dica">{ajuda}</small>}
    </label>
  );

  return (
    <form className="est-pagina est-pagina-estreita" onSubmit={salvar}>
      <Painel titulo="Faixas de prioridade (por quantidade em estoque)">
        <p className="est-dica">Cada faixa começa no mínimo informado e vai até o mínimo da faixa de cima. Abaixo do mínimo de P4, o produto fica “sem prioridade”.</p>
        <div className="est-form-grid">
          {campo('P1 · Imediata — a partir de (unid.)', 'p1Min')}
          {campo('P2 · Alta — a partir de (unid.)', 'p2Min')}
          {campo('P3 · Média — a partir de (unid.)', 'p3Min')}
          {campo('P4 · Rotina — a partir de (unid.)', 'p4Min')}
        </div>
      </Painel>

      <Painel titulo="Tempo desde a última entrada">
        <div className="est-form-grid">
          {campo('Alerta (dias)', 'diasAlerta', 'Usado no indicador “última entrada há mais de…”.')}
          {campo('Crítico (dias)', 'diasCritico')}
        </div>
        <p className="est-dica">É o tempo desde a última compra/entrada — o relatório não informa há quanto tempo o produto está sem vender.</p>
      </Painel>

      <Painel titulo="Indicadores e simulador">
        <div className="est-form-grid">
          {campo('Estoque elevado a partir de (unid.)', 'estoqueElevadoMin', 'Contagem do indicador “estoque elevado” no dashboard.')}
          {campo('Margem bruta mínima (%)', 'margemMinimaPct', 'O simulador avisa quando o novo preço fica abaixo dela.')}
        </div>
      </Painel>

      <Painel titulo="Pesos do ranking">
        <p className="est-dica">Quanto cada critério pesa na pontuação combinada. Podem ser quaisquer números (ex.: 50, 30, 20) — o que importa é a proporção.</p>
        <div className="est-form-grid">
          {campo('Quantidade em estoque', 'pesoQuantidade')}
          {campo('Valor investido', 'pesoValor')}
          {campo('Tempo desde a última entrada', 'pesoTempo')}
        </div>
      </Painel>

      {gruposDoRelatorio.length > 0 && (
        <Painel titulo="Nomes dos grupos do Trier">
          <p className="est-dica">O Trier exporta o grupo apenas como código. Dê um nome a cada um para os gráficos, filtros e a sugestão de ação (que depende do tipo de produto) fazerem sentido. O nome aparece como “Nome (código)”.</p>
          <div className="est-tabela-rolagem">
            <table className="data-table est-tabela">
              <thead>
                <tr>
                  <th>Código</th>
                  <th className="est-direita">Produtos</th>
                  <th>Nome do grupo</th>
                </tr>
              </thead>
              <tbody>
                {gruposDoRelatorio.map(([codigo, quantidade]) => (
                  <tr key={codigo}>
                    <td>
                      <code>{codigo}</code>
                    </td>
                    <td className="est-direita">{fmtInteiro(quantidade)}</td>
                    <td>
                      <input
                        value={nomesGrupos[codigo] ?? ''}
                        maxLength={80}
                        placeholder="Ex.: Suplementos"
                        onChange={(e) => setNomesGrupos((atual) => ({ ...atual, [codigo]: e.target.value }))}
                        aria-label={`Nome do grupo ${codigo}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Painel>
      )}

      <p className="error-text">{erro}</p>
      <div className="est-barra-botoes">
        <button type="submit" className="btn-primary" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar configurações'}
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            setC(paraCampos(CONFIG_PADRAO));
            setNomesGrupos(config.nomesGrupos ?? {});
          }}
        >
          Restaurar valores de fábrica
        </button>
      </div>
    </form>
  );
}
