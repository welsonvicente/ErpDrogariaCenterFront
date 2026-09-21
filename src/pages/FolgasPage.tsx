import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { FerramentaShell } from '../components/FerramentaShell';
import { useAuth } from '../context/AuthContext';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { folgasService } from '../services/folgasService';
import { funcionarioService } from '../services/funcionarioService';
import type { Funcionario } from '../types';
import {
  estadoFolgasVazio,
  type EstadoFolgas,
  type FormaPagamentoFolga,
  type FolgasAfastamento,
} from '../types/folgas';
import {
  amanhaIso,
  ator,
  creditoDisponivelMaisAntigo,
  creditosDe,
  diaSemana,
  DIAS_SEMANA,
  diasInclusivos,
  folgasDe,
  formatarData,
  formatarDataHora,
  formatarDinheiro,
  hojeIso,
  parearCreditos,
  primeiroDiaMesIso,
  saldoDe,
  uid,
} from '../utils/folgas';

type Modal = 'agendar' | 'atestado' | 'colaboradores' | 'credito' | 'troca' | 'afastamentos' | 'bloqueios' | 'auditoria' | null;
type Relatorio = 'activeLeaves' | 'sickSummary' | 'sickDetail' | 'balance' | 'scheduled' | 'credits' | 'swaps';
type CelulaRelatorio = string | number;

const FORMA_LABEL: Record<FormaPagamentoFolga, string> = { dinheiro: 'Dinheiro', pix: 'Pix', outro: 'Outro' };
const TIPO_AFASTAMENTO: Record<FolgasAfastamento['type'], string> = { ferias: '🏖️ Férias', atestado: '🩹 Atestado médico' };

function clonar(estado: EstadoFolgas): EstadoFolgas {
  return JSON.parse(JSON.stringify(estado)) as EstadoFolgas;
}

function mensagemErro(erro: unknown) {
  const resposta = erro as { response?: { status?: number; data?: { message?: string } } };
  if (resposta.response?.status === 409) return 'Outra pessoa salvou uma alteração ao mesmo tempo. Os dados foram recarregados; confira e repita sua ação.';
  return resposta.response?.data?.message || 'Não foi possível salvar. Confira sua conexão e tente novamente.';
}

function ModalFolgas({ titulo, children, fechar, largo = false }: { titulo: string; children: ReactNode; fechar: () => void; largo?: boolean }) {
  return (
    <div className="folgas-modal-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && fechar()}>
      <section className={`folgas-modal${largo ? ' folgas-modal--largo' : ''}`} role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="folgas-modal-head">
          <h2>{titulo}</h2>
          <button type="button" className="folgas-icon-btn" onClick={fechar} aria-label="Fechar">✕</button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <div className="folgas-vazio">{children}</div>;
}

function BadgeSaldo({ valor }: { valor: number }) {
  return <span className={`folgas-badge${valor > 0 ? ' folgas-badge--positivo' : ''}`}>{valor}</span>;
}

function nomeArquivo(base: string, extensao: string) {
  const limpo = base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `${limpo}-${hojeIso()}.${extensao}`;
}

function escaparHtml(valor: CelulaRelatorio) {
  return String(valor).replace(/[&<>"']/g, (caractere) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[caractere]!);
}

function nomeComparavel(nome: string) {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
}

export function FolgasPage() {
  useDocumentTitle('Folgas');
  const { usuario } = useAuth();
  const ehGestor = usuario?.perfil === 'ADMIN' || usuario?.perfil === 'GERENTE';

  const [estado, setEstado] = useState<EstadoFolgas>(() => estadoFolgasVazio());
  const [versao, setVersao] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [usuarios, setUsuarios] = useState<Funcionario[]>([]);

  const [periodoModo, setPeriodoModo] = useState<'mes' | 'especifico'>('mes');
  const [periodoInicio, setPeriodoInicio] = useState(primeiroDiaMesIso());
  const [periodoFim, setPeriodoFim] = useState(hojeIso());
  const periodo = periodoModo === 'mes' ? { inicio: primeiroDiaMesIso(), fim: hojeIso() } : { inicio: periodoInicio, fim: periodoFim };

  const [consultaTipo, setConsultaTipo] = useState<'dia' | 'mes' | 'periodo'>('dia');
  const [consultaDia, setConsultaDia] = useState(hojeIso());
  const [consultaMes, setConsultaMes] = useState(hojeIso().slice(0, 7));
  const [consultaInicio, setConsultaInicio] = useState(primeiroDiaMesIso());
  const [consultaFim, setConsultaFim] = useState(hojeIso());

  const [dataAgendada, setDataAgendada] = useState(amanhaIso());
  const [atestadoForm, setAtestadoForm] = useState({ inicio: hojeIso(), fim: hojeIso(), motivo: '' });
  const [novoUsuarioId, setNovoUsuarioId] = useState('');
  const [creditoForm, setCreditoForm] = useState({ employeeId: '', data: hojeIso(), nota: '' });
  const [trocaForm, setTrocaForm] = useState<{ employeeId: string; valor: string; forma: FormaPagamentoFolga; nota: string }>({ employeeId: '', valor: '', forma: 'dinheiro', nota: '' });
  const [afastamentoForm, setAfastamentoForm] = useState<{ employeeId: string; tipo: FolgasAfastamento['type']; inicio: string; fim: string; nota: string }>({ employeeId: '', tipo: 'ferias', inicio: hojeIso(), fim: hojeIso(), nota: '' });
  const [bloqueioForm, setBloqueioForm] = useState({ inicio: amanhaIso(), fim: '', motivo: '' });

  const carregar = useCallback(async () => {
    if (!usuario) {
      setCarregando(false);
      setErro('');
      return;
    }
    setCarregando(true);
    setErro('');
    try {
      const resultado = await folgasService.get();
      setEstado(resultado.estado);
      setVersao(resultado.versao);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [usuario]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const salvar = useCallback(async (
    alterar: (rascunho: EstadoFolgas) => void,
    auditoria?: { acao: string; detalhes?: string },
    sucesso?: string,
  ) => {
    if (salvando || !usuario) return false;
    const proximo = clonar(estado);
    alterar(proximo);
    if (auditoria && ehGestor) {
      proximo.auditLog.push({
        id: uid('audit'),
        role: ator(usuario.nome, usuario.perfil),
        action: auditoria.acao,
        details: auditoria.detalhes,
        timestamp: new Date().toISOString(),
      });
    }

    setSalvando(true);
    setErro('');
    try {
      const novaVersao = await folgasService.save(proximo, versao);
      setEstado(proximo);
      setVersao(novaVersao);
      if (sucesso) setToast(sucesso);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      if ((e as { response?: { status?: number } }).response?.status === 409) await carregar();
      return false;
    } finally {
      setSalvando(false);
    }
  }, [carregar, ehGestor, estado, salvando, usuario, versao]);

  // Registros antigos de folgas podiam existir antes do vínculo com usuário.
  // Conservamos o ID como referência principal, mas recuperamos um vínculo
  // legado por nome quando ele for único — assim uma pessoa que já está na
  // escala não perde o próprio saldo após atualização ou promoção de papel.
  const colaboradorAtual = usuario
    ? estado.employees.find((item) => item.usuarioId === usuario.id)
      ?? (() => {
        const mesmosNomes = estado.employees.filter((item) => nomeComparavel(item.name) === nomeComparavel(usuario.nome));
        return mesmosNomes.length === 1 ? mesmosNomes[0] : undefined;
      })()
    : undefined;
  const dentroDoPeriodo = (data: string) => !!data && data.slice(0, 10) >= periodo.inicio && data.slice(0, 10) <= periodo.fim;
  const nomeColaborador = (id: string) => estado.employees.find((item) => item.id === id)?.name ?? '—';
  const hoje = hojeIso();
  const afastamentosAtivos = estado.leaves.filter((item) => hoje >= item.startDate && hoje <= item.endDate);
  const creditosPareados = useMemo(() => parearCreditos(estado), [estado]);
  const resumoAtestados = estado.employees.map((colaborador) => {
    const atestados = estado.leaves.filter((item) => item.employeeId === colaborador.id && item.type === 'atestado' && dentroDoPeriodo(item.startDate));
    return { colaborador, quantidade: atestados.length, dias: atestados.reduce((total, item) => total + diasInclusivos(item.startDate, item.endDate), 0) };
  }).filter((item) => item.quantidade > 0).sort((a, b) => b.dias - a.dias);

  async function abrirColaboradores() {
    setModal('colaboradores');
    try {
      const lista = await funcionarioService.list();
      setUsuarios(lista);
      const vinculados = new Set(estado.employees.map((item) => item.usuarioId));
      setNovoUsuarioId(lista.find((item) => item.ativo && !vinculados.has(item.id))?.id ?? '');
    } catch {
      setErro('Não foi possível carregar os usuários da organização.');
    }
  }

  function abrirCredito() {
    setCreditoForm({ employeeId: estado.employees[0]?.id ?? '', data: hojeIso(), nota: '' });
    setModal('credito');
  }

  function abrirAfastamentos() {
    setAfastamentoForm({ employeeId: estado.employees[0]?.id ?? '', tipo: 'ferias', inicio: hojeIso(), fim: hojeIso(), nota: '' });
    setModal('afastamentos');
  }

  function abrirTroca(employeeId: string) {
    setTrocaForm({ employeeId, valor: '', forma: 'dinheiro', nota: '' });
    setModal('troca');
  }

  async function adicionarColaborador() {
    const selecionado = usuarios.find((item) => item.id === novoUsuarioId);
    if (!selecionado) return setErro('Escolha um usuário para adicionar à escala.');
    const ok = await salvar(
      (rascunho) => rascunho.employees.push({ id: uid('emp'), usuarioId: selecionado.id, name: selecionado.nome }),
      { acao: 'Adicionou colaborador à escala', detalhes: selecionado.nome },
      'Colaborador adicionado à escala.',
    );
    if (ok) setNovoUsuarioId('');
  }

  /** Administração e direito à folga são coisas independentes: gerente também pode entrar na própria escala. */
  async function entrarNaMinhaEscala() {
    if (!usuario || colaboradorAtual) return;
    await salvar(
      (rascunho) => {
        if (!rascunho.employees.some((item) => item.usuarioId === usuario.id)) {
          rascunho.employees.push({ id: uid('emp'), usuarioId: usuario.id, name: usuario.nome });
        }
      },
      { acao: 'Entrou na escala de folgas', detalhes: usuario.nome },
      'Você entrou na escala de folgas.',
    );
  }

  async function removerColaborador(id: string) {
    const colaborador = estado.employees.find((item) => item.id === id);
    if (!window.confirm('Remover este colaborador da escala? O histórico de créditos e folgas será mantido.')) return;
    await salvar(
      (rascunho) => { rascunho.employees = rascunho.employees.filter((item) => item.id !== id); },
      { acao: 'Removeu colaborador da escala', detalhes: colaborador?.name ?? id },
      'Colaborador removido da escala.',
    );
  }

  async function registrarCredito() {
    if (!creditoForm.employeeId || !creditoForm.data) return setErro('Escolha o colaborador e a data trabalhada.');
    if (new Date(`${creditoForm.data}T12:00:00`).getDay() !== 0 && !window.confirm('Essa data não é domingo. Se for feriado, deseja registrar mesmo assim?')) return;
    const nome = nomeColaborador(creditoForm.employeeId);
    const ok = await salvar(
      (rascunho) => rascunho.credits.push({ id: uid('cred'), employeeId: creditoForm.employeeId, workedDate: creditoForm.data, note: creditoForm.nota.trim(), createdAt: new Date().toISOString() }),
      { acao: 'Registrou crédito de folga', detalhes: `${nome} — trabalhou em ${formatarData(creditoForm.data)}` },
      'Crédito de folga registrado.',
    );
    if (ok) setModal(null);
  }

  async function removerCredito(id: string) {
    const credito = estado.credits.find((item) => item.id === id);
    if (!window.confirm('Remover este crédito? O saldo do colaborador pode ficar negativo.')) return;
    await salvar(
      (rascunho) => { rascunho.credits = rascunho.credits.filter((item) => item.id !== id); },
      { acao: 'Removeu crédito de folga', detalhes: `${nomeColaborador(credito?.employeeId ?? '')} — ${credito ? formatarData(credito.workedDate) : id}` },
      'Crédito removido.',
    );
  }

  async function confirmarTroca() {
    const valor = Number(trocaForm.valor.replace(',', '.'));
    const credito = creditoDisponivelMaisAntigo(estado, trocaForm.employeeId);
    if (!valor || valor <= 0) return setErro('Informe um valor válido para o pagamento.');
    if (!credito) return setErro('Esse colaborador não tem folga disponível para trocar.');
    const nome = nomeColaborador(trocaForm.employeeId);
    if (!window.confirm(`Remover uma folga disponível de ${nome} e registrar ${formatarDinheiro(valor)}?`)) return;
    const ok = await salvar((rascunho) => {
      rascunho.credits = rascunho.credits.filter((item) => item.id !== credito.id);
      rascunho.creditSwaps.push({
        id: uid('swap'), employeeId: trocaForm.employeeId, workedDate: credito.workedDate, valor,
        forma: trocaForm.forma, nota: trocaForm.nota.trim(), createdAt: new Date().toISOString(),
        createdBy: usuario ? ator(usuario.nome, usuario.perfil) : undefined, originalCredit: credito,
      });
    }, { acao: 'Vendeu/trocou folga por pagamento', detalhes: `${nome} — ${formatarDinheiro(valor)} (${FORMA_LABEL[trocaForm.forma]})` }, 'Folga trocada por pagamento.');
    if (ok) setModal(null);
  }

  async function cancelarTroca(id: string) {
    const troca = estado.creditSwaps.find((item) => item.id === id);
    if (!troca || !window.confirm('Cancelar a troca? A folga voltará para o saldo; eventual estorno financeiro deve ser tratado separadamente.')) return;
    const credito = troca.originalCredit ?? { id: uid('cred'), employeeId: troca.employeeId, workedDate: troca.workedDate, note: '', createdAt: new Date().toISOString() };
    await salvar((rascunho) => {
      rascunho.creditSwaps = rascunho.creditSwaps.filter((item) => item.id !== id);
      rascunho.credits.push(credito);
    }, { acao: 'Cancelou troca de folga por pagamento', detalhes: `${nomeColaborador(troca.employeeId)} — ${formatarDinheiro(troca.valor)}` }, 'Troca cancelada; a folga voltou ao saldo.');
  }

  async function registrarAfastamento() {
    if (!afastamentoForm.employeeId || !afastamentoForm.inicio || !afastamentoForm.fim) return setErro('Preencha colaborador, início e fim.');
    if (afastamentoForm.fim < afastamentoForm.inicio) return setErro('A data final não pode ser anterior à inicial.');
    const nome = nomeColaborador(afastamentoForm.employeeId);
    const ok = await salvar(
      (rascunho) => rascunho.leaves.push({ id: uid('leave'), employeeId: afastamentoForm.employeeId, type: afastamentoForm.tipo, startDate: afastamentoForm.inicio, endDate: afastamentoForm.fim, note: afastamentoForm.nota.trim(), createdAt: new Date().toISOString() }),
      { acao: `Registrou ${afastamentoForm.tipo === 'ferias' ? 'férias' : 'atestado'}`, detalhes: `${nome} — ${formatarData(afastamentoForm.inicio)} a ${formatarData(afastamentoForm.fim)}` },
      'Afastamento registrado.',
    );
    if (ok) setAfastamentoForm((atual) => ({ ...atual, nota: '' }));
  }

  async function removerAfastamento(id: string) {
    const afastamento = estado.leaves.find((item) => item.id === id);
    if (!afastamento || !window.confirm('Remover este registro de férias/atestado?')) return;
    await salvar(
      (rascunho) => { rascunho.leaves = rascunho.leaves.filter((item) => item.id !== id); },
      { acao: `Removeu registro de ${afastamento.type === 'ferias' ? 'férias' : 'atestado'}`, detalhes: nomeColaborador(afastamento.employeeId) },
      'Afastamento removido.',
    );
  }

  async function alternarDiaSemana(weekday: number) {
    const existe = estado.blockedWeekdays.some((item) => item.weekday === weekday);
    await salvar((rascunho) => {
      if (existe) rascunho.blockedWeekdays = rascunho.blockedWeekdays.filter((item) => item.weekday !== weekday);
      else rascunho.blockedWeekdays.push({ weekday, by: usuario?.nome, at: new Date().toISOString() });
    }, { acao: `${existe ? 'Desbloqueou' : 'Bloqueou'} dia da semana`, detalhes: DIAS_SEMANA[weekday] }, `${DIAS_SEMANA[weekday]} ${existe ? 'desbloqueado' : 'bloqueado'}.`);
  }

  async function bloquearDatas() {
    if (!bloqueioForm.inicio) return setErro('Escolha ao menos a data inicial.');
    if (bloqueioForm.fim && bloqueioForm.fim < bloqueioForm.inicio) return setErro('A data final não pode ser anterior à inicial.');
    const fim = bloqueioForm.fim || bloqueioForm.inicio;
    const datas: string[] = [];
    const cursor = new Date(`${bloqueioForm.inicio}T12:00:00`);
    const limite = new Date(`${fim}T12:00:00`);
    while (cursor <= limite) {
      const data = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
      if (!estado.blockedDates.some((item) => item.date === data)) datas.push(data);
      cursor.setDate(cursor.getDate() + 1);
    }
    if (!datas.length) return setErro('Todas as datas escolhidas já estão bloqueadas.');
    const ok = await salvar((rascunho) => {
      datas.forEach((data) => rascunho.blockedDates.push({ id: uid('blk'), date: data, reason: bloqueioForm.motivo.trim(), by: usuario?.nome, createdAt: new Date().toISOString() }));
    }, { acao: 'Bloqueou data(s)', detalhes: datas.map(formatarData).join(', ') }, `${datas.length} dia(s) bloqueado(s).`);
    if (ok) setBloqueioForm({ inicio: amanhaIso(), fim: '', motivo: '' });
  }

  async function removerBloqueio(id: string) {
    const bloqueio = estado.blockedDates.find((item) => item.id === id);
    if (!bloqueio || !window.confirm('Desbloquear este dia?')) return;
    await salvar((rascunho) => { rascunho.blockedDates = rascunho.blockedDates.filter((item) => item.id !== id); }, { acao: 'Desbloqueou data', detalhes: formatarData(bloqueio.date) }, 'Data desbloqueada.');
  }

  async function cancelarFolga(id: string, comoGestor = false) {
    const folga = estado.daysOff.find((item) => item.id === id);
    if (!folga || !window.confirm('Cancelar esta folga agendada? O crédito voltará ao saldo.')) return;
    await salvar(
      (rascunho) => { rascunho.daysOff = rascunho.daysOff.filter((item) => item.id !== id); },
      comoGestor ? { acao: 'Apagou folga agendada', detalhes: `${nomeColaborador(folga.employeeId)} — ${formatarData(folga.date)}` } : undefined,
      'Folga cancelada.',
    );
  }

  function validarDataFolga(employeeId: string, data: string) {
    if (!data || data <= hojeIso()) return 'Escolha uma data futura.';
    if (estado.blockedDates.some((item) => item.date === data)) return 'Essa data foi bloqueada pela gerência.';
    const weekday = new Date(`${data}T12:00:00`).getDay();
    if (estado.blockedWeekdays.some((item) => item.weekday === weekday)) return `Toda ${DIAS_SEMANA[weekday]} está bloqueada para folgas.`;
    if (estado.leaves.some((item) => item.employeeId === employeeId && data >= item.startDate && data <= item.endDate)) return 'Você está afastado nessa data.';
    if (estado.daysOff.some((item) => item.date === data)) return 'Já existe uma folga agendada nessa data.';
    return '';
  }

  async function agendarMinhaFolga() {
    if (!colaboradorAtual) return;
    const problema = validarDataFolga(colaboradorAtual.id, dataAgendada);
    if (problema) return setErro(problema);
    if (saldoDe(estado, colaboradorAtual.id) <= 0) return setErro('Você não tem folgas disponíveis.');
    const ok = await salvar((rascunho) => rascunho.daysOff.push({ id: uid('off'), employeeId: colaboradorAtual.id, date: dataAgendada, createdAt: new Date().toISOString() }), undefined, `Folga agendada para ${formatarData(dataAgendada)}.`);
    if (ok) setModal(null);
  }

  async function registrarMeuAtestado() {
    if (!colaboradorAtual) return;
    if (!atestadoForm.inicio || !atestadoForm.fim || !atestadoForm.motivo.trim()) return setErro('Preencha o período e o motivo do atestado.');
    if (atestadoForm.fim < atestadoForm.inicio) return setErro('A data final não pode ser anterior à inicial.');
    const ok = await salvar((rascunho) => rascunho.leaves.push({
      id: uid('leave'), employeeId: colaboradorAtual.id, type: 'atestado', startDate: atestadoForm.inicio,
      endDate: atestadoForm.fim, note: atestadoForm.motivo.trim(), submittedBy: 'colaborador', createdAt: new Date().toISOString(),
    }), undefined, 'Atestado enviado. Melhoras!');
    if (ok) setModal(null);
  }

  function intervaloConsulta() {
    if (consultaTipo === 'dia') return { inicio: consultaDia, fim: consultaDia };
    if (consultaTipo === 'mes') {
      const [ano, mes] = consultaMes.split('-').map(Number);
      return { inicio: `${consultaMes}-01`, fim: `${consultaMes}-${String(new Date(ano, mes, 0).getDate()).padStart(2, '0')}` };
    }
    return { inicio: consultaInicio, fim: consultaFim };
  }

  const folgasConsultadas = useMemo(() => {
    const faixa = intervaloConsulta();
    if (!faixa.inicio || !faixa.fim || faixa.fim < faixa.inicio) return [];
    return estado.daysOff.filter((item) => item.date >= faixa.inicio && item.date <= faixa.fim).sort((a, b) => a.date.localeCompare(b.date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consultaTipo, consultaDia, consultaMes, consultaInicio, consultaFim, estado.daysOff]);

  function dadosRelatorio(chave: Relatorio): { titulo: string; cabecalhos: string[]; linhas: CelulaRelatorio[][] } {
    if (chave === 'activeLeaves') return { titulo: 'Ausências agora', cabecalhos: ['Colaborador', 'Tipo', 'Até'], linhas: afastamentosAtivos.map((item) => [nomeColaborador(item.employeeId), TIPO_AFASTAMENTO[item.type], formatarData(item.endDate)]) };
    if (chave === 'sickSummary') {
      const linhas = estado.employees.map((colaborador) => {
        const atestados = estado.leaves.filter((item) => item.employeeId === colaborador.id && item.type === 'atestado' && dentroDoPeriodo(item.startDate));
        return [colaborador.name, atestados.length, atestados.reduce((total, item) => total + diasInclusivos(item.startDate, item.endDate), 0)] as CelulaRelatorio[];
      }).filter((linha) => Number(linha[1]) > 0).sort((a, b) => Number(b[2]) - Number(a[2]));
      return { titulo: 'Dias ausentes por atestado', cabecalhos: ['Colaborador', 'Atestados', 'Dias ausente'], linhas };
    }
    if (chave === 'sickDetail') return { titulo: 'Detalhamento de atestados', cabecalhos: ['Colaborador', 'Registrado em', 'Ausente de', 'Ausente até', 'Dias', 'Motivo'], linhas: estado.leaves.filter((item) => item.type === 'atestado' && dentroDoPeriodo(item.startDate)).map((item) => [nomeColaborador(item.employeeId), formatarDataHora(item.createdAt), formatarData(item.startDate), formatarData(item.endDate), diasInclusivos(item.startDate, item.endDate), item.note || '—']) };
    if (chave === 'balance') return { titulo: 'Saldo por colaborador', cabecalhos: ['Colaborador', 'Créditos', 'Usadas', 'Saldo'], linhas: estado.employees.map((item) => [item.name, creditosDe(estado, item.id).length, folgasDe(estado, item.id).length, saldoDe(estado, item.id)]) };
    if (chave === 'scheduled') return { titulo: 'Folgas agendadas', cabecalhos: ['Colaborador', 'Data', 'Dia da semana'], linhas: estado.daysOff.filter((item) => dentroDoPeriodo(item.date)).map((item) => [nomeColaborador(item.employeeId), formatarData(item.date), diaSemana(item.date)]) };
    if (chave === 'credits') return { titulo: 'Histórico de créditos', cabecalhos: ['Colaborador', 'Trabalhou em', 'Observação', 'Folga/Status'], linhas: estado.credits.filter((item) => dentroDoPeriodo(item.workedDate)).map((item) => [nomeColaborador(item.employeeId), formatarData(item.workedDate), item.note || '—', creditosPareados.has(item.id) ? formatarData(creditosPareados.get(item.id)!) : 'Disponível']) };
    return { titulo: 'Folgas trocadas por pagamento', cabecalhos: ['Colaborador', 'Trabalhou em', 'Trocada em', 'Valor', 'Forma', 'Observação'], linhas: estado.creditSwaps.filter((item) => dentroDoPeriodo(item.createdAt)).map((item) => [nomeColaborador(item.employeeId), formatarData(item.workedDate), formatarDataHora(item.createdAt), formatarDinheiro(item.valor), FORMA_LABEL[item.forma], item.nota || '—']) };
  }

  function exportarExcel(chaves: Relatorio[]) {
    const workbook = XLSX.utils.book_new();
    chaves.forEach((chave) => {
      const dados = dadosRelatorio(chave);
      const planilha = XLSX.utils.aoa_to_sheet([dados.cabecalhos, ...dados.linhas]);
      XLSX.utils.book_append_sheet(workbook, planilha, dados.titulo.slice(0, 31));
    });
    XLSX.writeFile(workbook, nomeArquivo(chaves.length > 1 ? 'relatorios-folgas' : dadosRelatorio(chaves[0]).titulo, 'xlsx'));
  }

  function exportarPdf(chaves: Relatorio[]) {
    const janela = window.open('', '_blank', 'width=1000,height=760');
    if (!janela) return setErro('O navegador bloqueou a janela de impressão. Libere pop-ups e tente novamente.');
    janela.opener = null;
    const secoes = chaves.map((chave) => {
      const dados = dadosRelatorio(chave);
      const linhas = dados.linhas.length ? dados.linhas : [['Nenhum dado encontrado.']];
      return `<section><h2>${escaparHtml(dados.titulo)}</h2><table><thead><tr>${dados.cabecalhos.map((item) => `<th>${escaparHtml(item)}</th>`).join('')}</tr></thead><tbody>${linhas.map((linha) => `<tr>${linha.map((item) => `<td>${escaparHtml(item)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
    }).join('');
    janela.document.write(`<!doctype html><html><head><title>Relatórios de folgas</title><style>body{font-family:Arial,sans-serif;color:#172321;padding:24px}h1{font-size:20px}h2{font-size:15px;margin-top:28px}table{width:100%;border-collapse:collapse;font-size:10px}th,td{border:1px solid #ccd7d2;padding:6px;text-align:left}th{background:#edf5f1}@media print{button{display:none}section{break-inside:avoid}}</style></head><body><h1>PharmaMind — Relatórios de folgas</h1><button onclick="window.print()">Imprimir / salvar PDF</button>${secoes}<script>window.onload=()=>window.print()</script></body></html>`);
    janela.document.close();
  }

  const todosRelatorios: Relatorio[] = ['activeLeaves', 'sickSummary', 'sickDetail', 'balance', 'scheduled', 'credits', 'swaps'];
  const disponiveis = usuarios.filter((item) => item.ativo && !estado.employees.some((colaborador) => colaborador.usuarioId === item.id));

  if (carregando) {
    return <FerramentaShell titulo="Folgas"><div className="card folgas-feedback">Carregando dados de folgas...</div></FerramentaShell>;
  }

  if (!usuario) {
    return (
      <FerramentaShell titulo="Folgas">
        <div className="card folgas-feedback">
          <div className="folgas-feedback-icon">🔒</div>
          <h2>Faça login para acessar Folgas</h2>
          <p>Use “Voltar” para entrar como funcionário ou gerente da organização.</p>
        </div>
      </FerramentaShell>
    );
  }

  return (
    <FerramentaShell titulo="Folgas">
      <div className="folgas-page">
        {erro && <div className="alert error folgas-alerta"><span>{erro}</span><button type="button" onClick={() => setErro('')}>✕</button></div>}
        {salvando && <div className="folgas-saving">Salvando…</div>}

        {!ehGestor ? (
          <section className="folgas-funcionario">
            {!colaboradorAtual ? (
              <div className="card folgas-feedback">
                <div className="folgas-feedback-icon">🪪</div>
                <h2>Seu usuário ainda não está na escala</h2>
                <p>Peça para um gerente abrir “Colaboradores” nesta tela e vincular {usuario?.nome}.</p>
              </div>
            ) : (
              <>
                <div className="folgas-hero">
                  <div><span className="folgas-eyebrow">Olá, {colaboradorAtual.name}</span><h2>Seu banco de folgas</h2><p>Cada domingo ou feriado trabalhado vale um crédito.</p></div>
                  <div className="folgas-saldo"><strong>{saldoDe(estado, colaboradorAtual.id)}</strong><span>folga(s) disponível(is)</span></div>
                  <div className="folgas-hero-actions">
                    <button type="button" className="btn-primary" disabled={saldoDe(estado, colaboradorAtual.id) <= 0} onClick={() => { setDataAgendada(amanhaIso()); setModal('agendar'); }}>📅 Agendar folga</button>
                    <button type="button" className="btn-ghost" onClick={() => { setAtestadoForm({ inicio: hojeIso(), fim: hojeIso(), motivo: '' }); setModal('atestado'); }}>🩹 Informar atestado</button>
                  </div>
                </div>

                <div className="folgas-grid folgas-grid--3">
                  <div className="card folgas-card-lista"><h3>Minhas folgas</h3>{folgasDe(estado, colaboradorAtual.id).length ? folgasDe(estado, colaboradorAtual.id).sort((a, b) => a.date.localeCompare(b.date)).map((item) => <div className="folgas-list-row" key={item.id}><span><strong>{formatarData(item.date)}</strong><small>{diaSemana(item.date)}</small></span><button type="button" className="btn-link danger" onClick={() => void cancelarFolga(item.id)}>Cancelar</button></div>) : <Vazio>Nenhuma folga agendada.</Vazio>}</div>
                  <div className="card folgas-card-lista"><h3>Meus atestados</h3>{estado.leaves.filter((item) => item.employeeId === colaboradorAtual.id && item.type === 'atestado').length ? estado.leaves.filter((item) => item.employeeId === colaboradorAtual.id && item.type === 'atestado').map((item) => <div className="folgas-list-row" key={item.id}><span><strong>{formatarData(item.startDate)} a {formatarData(item.endDate)}</strong><small>{item.note || '—'}</small></span></div>) : <Vazio>Nenhum atestado registrado.</Vazio>}</div>
                  <div className="card folgas-card-lista"><h3>Trocas por pagamento</h3>{estado.creditSwaps.filter((item) => item.employeeId === colaboradorAtual.id).length ? estado.creditSwaps.filter((item) => item.employeeId === colaboradorAtual.id).map((item) => <div className="folgas-list-row" key={item.id}><span><strong>{formatarDinheiro(item.valor)} · {FORMA_LABEL[item.forma]}</strong><small>Folga de {formatarData(item.workedDate)} · {formatarData(item.createdAt)}</small></span></div>) : <Vazio>Nenhuma troca registrada.</Vazio>}</div>
                </div>
              </>
            )}
          </section>
        ) : (
          <section className="folgas-gestao">
            <div className="card folgas-periodo">
              <div><span className="folgas-eyebrow">Visão da gestão</span><h2>Banco de folgas da equipe</h2><p>Mostrando dados de {formatarData(periodo.inicio)} até {formatarData(periodo.fim)}.</p></div>
              <div className="folgas-periodo-controles">
                <div className="folgas-segmented"><button type="button" className={periodoModo === 'mes' ? 'active' : ''} onClick={() => setPeriodoModo('mes')}>Mês atual</button><button type="button" className={periodoModo === 'especifico' ? 'active' : ''} onClick={() => setPeriodoModo('especifico')}>Período</button></div>
                {periodoModo === 'especifico' && <div className="folgas-inline-fields"><input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} /><span>até</span><input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} /></div>}
              </div>
            </div>

            {!colaboradorAtual ? (
              <div className="card folgas-participacao">
                <div>
                  <span className="folgas-eyebrow">Sua participação</span>
                  <h3>Você também pode participar da escala</h3>
                  <p>Seu perfil de gerente mantém as permissões de gestão e também permite acumular e agendar folgas.</p>
                </div>
                <button type="button" className="btn-primary" onClick={() => void entrarNaMinhaEscala()}>＋ Entrar na escala</button>
              </div>
            ) : (
              <div className="card folgas-participacao">
                <div>
                  <span className="folgas-eyebrow">Suas folgas</span>
                  <h3>Você participa da escala</h3>
                  <p>{saldoDe(estado, colaboradorAtual.id)} folga(s) disponível(is).</p>
                </div>
                <div className="folgas-participacao-actions">
                  <button type="button" className="btn-primary" disabled={saldoDe(estado, colaboradorAtual.id) <= 0} onClick={() => { setDataAgendada(amanhaIso()); setModal('agendar'); }}>📅 Agendar minha folga</button>
                  <button type="button" className="btn-ghost" onClick={() => { setAtestadoForm({ inicio: hojeIso(), fim: hojeIso(), motivo: '' }); setModal('atestado'); }}>🩹 Informar atestado</button>
                </div>
              </div>
            )}

            <div className="folgas-toolbar" aria-label="Ações da gestão de folgas">
              <div className="folgas-toolbar-group">
                <button type="button" className="btn-ghost" onClick={() => void abrirColaboradores()}>👤 Colaboradores</button>
                <button type="button" className="btn-ghost" onClick={abrirAfastamentos}>🏖️ Férias / atestados</button>
                <button type="button" className="btn-ghost" onClick={() => setModal('bloqueios')}>🚫 Bloquear dias</button>
                <button type="button" className="btn-primary" onClick={abrirCredito}>＋ Registrar crédito</button>
              </div>
              <span className="folgas-toolbar-divider" aria-hidden="true" />
              <div className="folgas-toolbar-group folgas-toolbar-group--reports">
                <button type="button" className="btn-ghost" onClick={() => exportarExcel(todosRelatorios)}>📊 Excel completo</button>
                <button type="button" className="btn-ghost" onClick={() => exportarPdf(todosRelatorios)}>📄 PDF completo</button>
                <button type="button" className="btn-ghost" onClick={() => setModal('auditoria')}>📋 Auditoria</button>
              </div>
            </div>

            <div className="folgas-stats">
              <div className="card"><strong>{estado.employees.length}</strong><span>Colaboradores</span></div>
              <div className="card"><strong>{estado.credits.length}</strong><span>Créditos concedidos</span></div>
              <div className="card"><strong>{estado.daysOff.length}</strong><span>Folgas agendadas</span></div>
              <div className="card"><strong>{estado.employees.reduce((total, item) => total + Math.max(0, saldoDe(estado, item.id)), 0)}</strong><span>Saldo disponível</span></div>
            </div>

            <div className="folgas-grid folgas-grid--2">
              <div className="card folgas-panel">
                <h3>🗓️ Quem está de folga</h3>
                <div className="folgas-today"><div><span>Hoje</span><strong>{estado.daysOff.filter((item) => item.date === hojeIso()).map((item) => nomeColaborador(item.employeeId)).join(', ') || 'Ninguém'}</strong></div><div><span>Amanhã</span><strong>{estado.daysOff.filter((item) => item.date === amanhaIso()).map((item) => nomeColaborador(item.employeeId)).join(', ') || 'Ninguém'}</strong></div></div>
                <div className="folgas-consulta">
                  <select value={consultaTipo} onChange={(e) => setConsultaTipo(e.target.value as typeof consultaTipo)}><option value="dia">Um dia</option><option value="mes">Um mês</option><option value="periodo">Período</option></select>
                  {consultaTipo === 'dia' && <input type="date" value={consultaDia} onChange={(e) => setConsultaDia(e.target.value)} />}
                  {consultaTipo === 'mes' && <input type="month" value={consultaMes} onChange={(e) => setConsultaMes(e.target.value)} />}
                  {consultaTipo === 'periodo' && <><input type="date" value={consultaInicio} onChange={(e) => setConsultaInicio(e.target.value)} /><input type="date" value={consultaFim} onChange={(e) => setConsultaFim(e.target.value)} /></>}
                </div>
                <div className="folgas-consulta-resultado">{folgasConsultadas.length ? folgasConsultadas.map((item) => <span key={item.id}><strong>{nomeColaborador(item.employeeId)}</strong> · {formatarData(item.date)} ({diaSemana(item.date)})</span>) : <Vazio>Ninguém de folga no intervalo.</Vazio>}</div>
              </div>
              <div className="card folgas-panel">
                <CabecalhoPainel titulo="Ausências agora" relatorio="activeLeaves" exportarExcel={exportarExcel} exportarPdf={exportarPdf} />
                <Tabela cabecalhos={['Colaborador', 'Tipo', 'Até']} vazio="Ninguém de férias ou atestado hoje.">{afastamentosAtivos.map((item) => <tr key={item.id}><td>{nomeColaborador(item.employeeId)}</td><td>{TIPO_AFASTAMENTO[item.type]}</td><td>{formatarData(item.endDate)}</td></tr>)}</Tabela>
              </div>
            </div>

            <div className="card folgas-panel">
              <CabecalhoPainel titulo="Saldo por colaborador" relatorio="balance" exportarExcel={exportarExcel} exportarPdf={exportarPdf} />
              <Tabela cabecalhos={['Colaborador', 'Créditos', 'Usadas', 'Saldo', '']} vazio="Nenhum colaborador na escala.">{estado.employees.map((item) => { const saldo = saldoDe(estado, item.id); return <tr key={item.id}><td>{item.name}</td><td>{creditosDe(estado, item.id).length}</td><td>{folgasDe(estado, item.id).length}</td><td><BadgeSaldo valor={saldo} /></td><td>{saldo > 0 && <button type="button" className="btn-link" onClick={() => abrirTroca(item.id)}>💰 Trocar</button>}</td></tr>; })}</Tabela>
            </div>

            <div className="card folgas-panel">
              <CabecalhoPainel titulo="Dias ausentes por atestado" relatorio="sickSummary" exportarExcel={exportarExcel} exportarPdf={exportarPdf} />
              <Tabela cabecalhos={['Colaborador', 'Atestados', 'Dias ausente']} vazio="Nenhum atestado neste período.">{resumoAtestados.map((item) => <tr key={item.colaborador.id}><td>{item.colaborador.name}</td><td>{item.quantidade}</td><td><strong>{item.dias}</strong> dia(s)</td></tr>)}</Tabela>
            </div>

            <div className="card folgas-panel">
              <CabecalhoPainel titulo="Atestados no período" relatorio="sickDetail" exportarExcel={exportarExcel} exportarPdf={exportarPdf} />
              <Tabela cabecalhos={['Colaborador', 'Registrado em', 'Período', 'Dias', 'Motivo']} vazio="Nenhum atestado neste período.">{estado.leaves.filter((item) => item.type === 'atestado' && dentroDoPeriodo(item.startDate)).map((item) => <tr key={item.id}><td>{nomeColaborador(item.employeeId)}</td><td>{formatarDataHora(item.createdAt)}</td><td>{formatarData(item.startDate)} a {formatarData(item.endDate)}</td><td>{diasInclusivos(item.startDate, item.endDate)}</td><td>{item.note || '—'}</td></tr>)}</Tabela>
            </div>

            <div className="folgas-grid folgas-grid--2">
              <div className="card folgas-panel"><CabecalhoPainel titulo="Folgas agendadas" relatorio="scheduled" exportarExcel={exportarExcel} exportarPdf={exportarPdf} /><Tabela cabecalhos={['Colaborador', 'Data', '']} vazio="Nenhuma folga no período.">{estado.daysOff.filter((item) => dentroDoPeriodo(item.date)).sort((a, b) => a.date.localeCompare(b.date)).map((item) => <tr key={item.id}><td>{nomeColaborador(item.employeeId)}</td><td>{formatarData(item.date)} · {diaSemana(item.date)}</td><td><button type="button" className="btn-link danger" onClick={() => void cancelarFolga(item.id, true)}>Cancelar</button></td></tr>)}</Tabela></div>
              <div className="card folgas-panel"><CabecalhoPainel titulo="Créditos concedidos" relatorio="credits" exportarExcel={exportarExcel} exportarPdf={exportarPdf} /><Tabela cabecalhos={['Colaborador', 'Trabalhou em', 'Uso', '']} vazio="Nenhum crédito no período.">{estado.credits.filter((item) => dentroDoPeriodo(item.workedDate)).map((item) => <tr key={item.id}><td>{nomeColaborador(item.employeeId)}</td><td>{formatarData(item.workedDate)}{item.note ? ` · ${item.note}` : ''}</td><td>{creditosPareados.has(item.id) ? formatarData(creditosPareados.get(item.id)!) : <span className="folgas-badge">Disponível</span>}</td><td><button type="button" className="btn-link danger" onClick={() => void removerCredito(item.id)}>Remover</button></td></tr>)}</Tabela></div>
            </div>

            <div className="card folgas-panel"><CabecalhoPainel titulo="Trocas por pagamento" relatorio="swaps" exportarExcel={exportarExcel} exportarPdf={exportarPdf} /><Tabela cabecalhos={['Colaborador', 'Folga trabalhada', 'Pagamento', 'Forma', 'Observação', '']} vazio="Nenhuma troca no período.">{estado.creditSwaps.filter((item) => dentroDoPeriodo(item.createdAt)).map((item) => <tr key={item.id}><td>{nomeColaborador(item.employeeId)}</td><td>{formatarData(item.workedDate)}</td><td>{formatarDinheiro(item.valor)}</td><td>{FORMA_LABEL[item.forma]}</td><td>{item.nota || '—'}</td><td><button type="button" className="btn-link danger" onClick={() => void cancelarTroca(item.id)}>Cancelar troca</button></td></tr>)}</Tabela></div>
          </section>
        )}
      </div>

      {modal === 'agendar' && <ModalFolgas titulo="Agendar minha folga" fechar={() => setModal(null)}><div className="field"><label>Data desejada</label><input type="date" min={amanhaIso()} value={dataAgendada} onChange={(e) => setDataAgendada(e.target.value)} /></div>{colaboradorAtual && validarDataFolga(colaboradorAtual.id, dataAgendada) && <div className="folgas-inline-alert">{validarDataFolga(colaboradorAtual.id, dataAgendada)}</div>}<div className="folgas-modal-actions"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button type="button" className="btn-primary" onClick={() => void agendarMinhaFolga()}>Confirmar folga</button></div></ModalFolgas>}

      {modal === 'atestado' && <ModalFolgas titulo="Informar atestado" fechar={() => setModal(null)}><div className="field-row"><div className="field"><label>Início</label><input type="date" value={atestadoForm.inicio} onChange={(e) => setAtestadoForm({ ...atestadoForm, inicio: e.target.value })} /></div><div className="field"><label>Fim</label><input type="date" value={atestadoForm.fim} onChange={(e) => setAtestadoForm({ ...atestadoForm, fim: e.target.value })} /></div></div><div className="field"><label>Motivo</label><textarea value={atestadoForm.motivo} onChange={(e) => setAtestadoForm({ ...atestadoForm, motivo: e.target.value })} placeholder="Ex.: gripe forte, consulta médica..." /></div><p className="folgas-privacidade">🔒 Informação sensível, visível somente para administradores e gerentes.</p><div className="folgas-modal-actions"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button type="button" className="btn-primary" onClick={() => void registrarMeuAtestado()}>Enviar atestado</button></div></ModalFolgas>}

      {modal === 'colaboradores' && <ModalFolgas titulo="Colaboradores na escala" fechar={() => setModal(null)}><div className="folgas-modal-list">{estado.employees.map((item) => <div className="folgas-list-row" key={item.id}><span><strong>{item.name}</strong>{!item.usuarioId && <small className="danger">Sem vínculo com usuário</small>}</span><button type="button" className="btn-link danger" onClick={() => void removerColaborador(item.id)}>Remover</button></div>)}{!estado.employees.length && <Vazio>Nenhum colaborador na escala.</Vazio>}</div><hr /><div className="field"><label>Adicionar usuário à escala</label><select value={novoUsuarioId} onChange={(e) => setNovoUsuarioId(e.target.value)}><option value="">Selecione...</option>{disponiveis.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.perfil !== 'FUNCIONARIO' ? ` (${item.perfil})` : ''}</option>)}</select></div><p className="folgas-privacidade">Todos os usuários ativos podem participar, inclusive gerentes e administradores.</p><div className="folgas-modal-actions"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Fechar</button><button type="button" className="btn-primary" disabled={!novoUsuarioId} onClick={() => void adicionarColaborador()}>Adicionar</button></div></ModalFolgas>}

      {modal === 'credito' && <ModalFolgas titulo="Registrar crédito de folga" fechar={() => setModal(null)}><div className="field"><label>Colaborador</label><select value={creditoForm.employeeId} onChange={(e) => setCreditoForm({ ...creditoForm, employeeId: e.target.value })}><option value="">Selecione...</option>{estado.employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="field"><label>Domingo ou feriado trabalhado</label><input type="date" value={creditoForm.data} onChange={(e) => setCreditoForm({ ...creditoForm, data: e.target.value })} /></div><div className="field"><label>Observação</label><input value={creditoForm.nota} onChange={(e) => setCreditoForm({ ...creditoForm, nota: e.target.value })} /></div><div className="folgas-modal-actions"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button type="button" className="btn-primary" onClick={() => void registrarCredito()}>Registrar</button></div></ModalFolgas>}

      {modal === 'troca' && <ModalFolgas titulo="Trocar folga por pagamento" fechar={() => setModal(null)}><p className="folgas-privacidade">Será consumido o crédito disponível mais antigo de <strong>{nomeColaborador(trocaForm.employeeId)}</strong>.</p><div className="field"><label>Valor pago</label><input type="number" min="0" step="0.01" value={trocaForm.valor} onChange={(e) => setTrocaForm({ ...trocaForm, valor: e.target.value })} /></div><div className="field"><label>Forma</label><select value={trocaForm.forma} onChange={(e) => setTrocaForm({ ...trocaForm, forma: e.target.value as FormaPagamentoFolga })}>{Object.entries(FORMA_LABEL).map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}</select></div><div className="field"><label>Observação</label><input value={trocaForm.nota} onChange={(e) => setTrocaForm({ ...trocaForm, nota: e.target.value })} /></div><div className="folgas-modal-actions"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Cancelar</button><button type="button" className="btn-primary" onClick={() => void confirmarTroca()}>Confirmar troca</button></div></ModalFolgas>}

      {modal === 'afastamentos' && <ModalFolgas titulo="Férias e atestados" fechar={() => setModal(null)} largo><div className="folgas-modal-list">{estado.leaves.slice().sort((a, b) => b.startDate.localeCompare(a.startDate)).map((item) => <div className="folgas-list-row" key={item.id}><span><strong>{TIPO_AFASTAMENTO[item.type]} · {nomeColaborador(item.employeeId)}</strong><small>{formatarData(item.startDate)} a {formatarData(item.endDate)}{item.note ? ` · ${item.note}` : ''}</small></span><button type="button" className="btn-link danger" onClick={() => void removerAfastamento(item.id)}>Remover</button></div>)}{!estado.leaves.length && <Vazio>Nenhum afastamento registrado.</Vazio>}</div><hr /><div className="folgas-form-grid"><div className="field"><label>Colaborador</label><select value={afastamentoForm.employeeId} onChange={(e) => setAfastamentoForm({ ...afastamentoForm, employeeId: e.target.value })}><option value="">Selecione...</option>{estado.employees.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div><div className="field"><label>Tipo</label><select value={afastamentoForm.tipo} onChange={(e) => setAfastamentoForm({ ...afastamentoForm, tipo: e.target.value as FolgasAfastamento['type'] })}><option value="ferias">Férias</option><option value="atestado">Atestado</option></select></div><div className="field"><label>Início</label><input type="date" value={afastamentoForm.inicio} onChange={(e) => setAfastamentoForm({ ...afastamentoForm, inicio: e.target.value })} /></div><div className="field"><label>Fim</label><input type="date" value={afastamentoForm.fim} onChange={(e) => setAfastamentoForm({ ...afastamentoForm, fim: e.target.value })} /></div></div><div className="field"><label>Observação</label><input value={afastamentoForm.nota} onChange={(e) => setAfastamentoForm({ ...afastamentoForm, nota: e.target.value })} /></div><div className="folgas-modal-actions"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Fechar</button><button type="button" className="btn-primary" onClick={() => void registrarAfastamento()}>Registrar</button></div></ModalFolgas>}

      {modal === 'bloqueios' && <ModalFolgas titulo="Bloquear dias para folga" fechar={() => setModal(null)} largo><label className="folgas-subtitle">Dias da semana recorrentes</label><div className="folgas-weekdays">{DIAS_SEMANA.map((label, indice) => <button type="button" key={label} className={estado.blockedWeekdays.some((item) => item.weekday === indice) ? 'active' : ''} onClick={() => void alternarDiaSemana(indice)}>{label}</button>)}</div><div className="folgas-modal-list">{estado.blockedDates.slice().sort((a, b) => a.date.localeCompare(b.date)).map((item) => <div className="folgas-list-row" key={item.id}><span><strong>{formatarData(item.date)} · {diaSemana(item.date)}</strong><small>{item.reason || 'Sem motivo'}{item.by ? ` · por ${item.by}` : ''}</small></span><button type="button" className="btn-link danger" onClick={() => void removerBloqueio(item.id)}>Desbloquear</button></div>)}{!estado.blockedDates.length && <Vazio>Nenhuma data específica bloqueada.</Vazio>}</div><hr /><div className="field"><label>Motivo</label><input value={bloqueioForm.motivo} onChange={(e) => setBloqueioForm({ ...bloqueioForm, motivo: e.target.value })} /></div><div className="field-row"><div className="field"><label>De</label><input type="date" value={bloqueioForm.inicio} onChange={(e) => setBloqueioForm({ ...bloqueioForm, inicio: e.target.value })} /></div><div className="field"><label>Até (opcional)</label><input type="date" value={bloqueioForm.fim} onChange={(e) => setBloqueioForm({ ...bloqueioForm, fim: e.target.value })} /></div></div><div className="folgas-modal-actions"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Fechar</button><button type="button" className="btn-primary" onClick={() => void bloquearDatas()}>Bloquear datas</button></div></ModalFolgas>}

      {modal === 'auditoria' && <ModalFolgas titulo="Auditoria de folgas" fechar={() => setModal(null)} largo><div className="folgas-modal-list">{estado.auditLog.slice().sort((a, b) => b.timestamp.localeCompare(a.timestamp)).map((item) => <div className="folgas-list-row folgas-audit-row" key={item.id}><span><strong>{item.action}</strong><small>{item.role}{item.details ? ` · ${item.details}` : ''}</small><small>{formatarDataHora(item.timestamp)}</small></span></div>)}{!estado.auditLog.length && <Vazio>Nenhuma ação registrada.</Vazio>}</div><div className="folgas-modal-actions"><button type="button" className="btn-ghost" onClick={() => setModal(null)}>Fechar</button></div></ModalFolgas>}

      {toast && <div className="folgas-toast">{toast}</div>}
    </FerramentaShell>
  );
}

function CabecalhoPainel({ titulo, relatorio, exportarExcel, exportarPdf }: { titulo: string; relatorio: Relatorio; exportarExcel: (chaves: Relatorio[]) => void; exportarPdf: (chaves: Relatorio[]) => void }) {
  return <div className="folgas-panel-head"><h3>{titulo}</h3><div><button type="button" onClick={() => exportarExcel([relatorio])}>Excel</button><button type="button" onClick={() => exportarPdf([relatorio])}>PDF</button></div></div>;
}

function Tabela({ cabecalhos, vazio, children }: { cabecalhos: string[]; vazio: string; children: ReactNode }) {
  const temLinhas = Array.isArray(children) ? children.length > 0 : !!children;
  return <div className="folgas-table-wrap"><table className="folgas-table"><thead><tr>{cabecalhos.map((item) => <th key={item}>{item}</th>)}</tr></thead><tbody>{temLinhas ? children : <tr><td colSpan={cabecalhos.length}><Vazio>{vazio}</Vazio></td></tr>}</tbody></table></div>;
}
