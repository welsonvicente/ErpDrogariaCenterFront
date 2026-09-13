// ---------- Diálogos próprios (substituem confirm()/alert() nativos) ----------
let _confirmResolve = null;
function showConfirm(msg){
  document.getElementById('confirmDialogMsg').textContent = msg;
  document.getElementById('confirmDialogOverlay').classList.add('open');
  return new Promise(resolve=>{ _confirmResolve = resolve; });
}
document.getElementById('confirmDialogCancel').addEventListener('click', ()=>{
  document.getElementById('confirmDialogOverlay').classList.remove('open');
  if(_confirmResolve) _confirmResolve(false);
});
document.getElementById('confirmDialogOk').addEventListener('click', ()=>{
  document.getElementById('confirmDialogOverlay').classList.remove('open');
  if(_confirmResolve) _confirmResolve(true);
});
let _alertResolve = null;
function showAlert(msg){
  document.getElementById('alertDialogMsg').textContent = msg;
  document.getElementById('alertDialogOverlay').classList.add('open');
  return new Promise(resolve=>{ _alertResolve = resolve; });
}
document.getElementById('alertDialogOk').addEventListener('click', ()=>{
  document.getElementById('alertDialogOverlay').classList.remove('open');
  if(_alertResolve) _alertResolve();
});

const STORAGE_KEY = 'drogaria-center-folgas';
const DEFAULT_ROLE_PASSWORDS = {
  'Supervisor': '11111',
  'Gerência': '45595',
  'CEO': '99999'
};

let state = { employees: [], credits: [], daysOff: [], leaves: [], creditSwaps: [], blockedDates: [], blockedWeekdays: [], auditLog: [], rolePasswords: {...DEFAULT_ROLE_PASSWORDS} };
let loaded = false;
let versaoAtual = 0; // controle de concorrência otimista — ver loadState()/saveState()
let editingEmployeeId = null;
let currentEmployee = null;
let currentRole = null; // 'Supervisor' | 'Gerência' | 'CEO'
let currentManagerEmployee = null; // colaborador dono do cargo, quando o acesso veio do código dele (não da senha genérica)
const CARGOS = ['Supervisor', 'Gerência', 'CEO'];

/** Identifica quem está logado na área de supervisão agora, pra registrar em bloqueios/auditoria. */
function currentActorLabel(){
  return currentManagerEmployee ? (currentRole + ' — ' + currentManagerEmployee.name) : (currentRole || '—');
}
async function logAction(action, details){
  state.auditLog.push({
    id: uid('log'),
    role: currentActorLabel(),
    action,
    details: details || '',
    timestamp: new Date().toISOString()
  });
  await saveState();
}

function uid(prefix){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,7); }
function pad(n){ return n.toString().padStart(2,'0'); }
function todayStr(){ const d = new Date(); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function tomorrowStr(){ const d = new Date(); d.setDate(d.getDate()+1); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function fmtDateBr(iso){ const [y,m,d] = iso.split('-'); return d+'/'+m+'/'+y; }
function fmtMoney(v){ return Number(v||0).toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2}); }
const FORMA_PAGAMENTO_FOLGA_LABEL = { dinheiro: 'dinheiro', pix: 'Pix', outro: 'outro' };
function weekdayName(iso){
  const d = new Date(iso+'T00:00:00');
  return ['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'][d.getDay()];
}
function daysBetweenInclusive(start, end){
  const ms = new Date(end+'T00:00:00') - new Date(start+'T00:00:00');
  return Math.round(ms / 86400000) + 1;
}

// Base da API e sessão do PharmaMind — lidas do link que abriu essa ferramenta
// (?api=...) e do localStorage da própria sessão logada (mesmo domínio do
// front), no mesmo esquema usado pela ferramenta de Cartazes. O estado
// (funcionários, créditos, folgas, atestados...) é salvo no backend, escopado
// pela organização de quem estiver logado — assim gestor e funcionário, em
// aparelhos diferentes, enxergam sempre os mesmos dados.
function getApiBaseUrl(){
  const fromQuery = new URLSearchParams(location.search).get('api');
  if(fromQuery) return fromQuery;
  return location.protocol + '//' + location.hostname + ':3333/api';
}
function getAuthToken(){
  try{
    for(const key of ['drogaria:session:gestor', 'drogaria:session:funcionario']){
      const raw = localStorage.getItem(key);
      if(raw){ const t = (JSON.parse(raw)||{}).token; if(t) return t; }
    }
  }catch(e){ /* sem sessão salva */ }
  return null;
}
/** Lê o slug da organização de qualquer sessão salva, mesmo expirada — só o token vence, o resto do objeto continua no localStorage. */
function getOrgSlugSalvo(){
  try{
    for(const key of ['drogaria:session:gestor', 'drogaria:session:funcionario']){
      const raw = localStorage.getItem(key);
      if(raw){ const slug = (JSON.parse(raw)||{}).orgSlug; if(slug) return slug; }
    }
  }catch(e){ /* sem sessão salva */ }
  return null;
}
/** Monta o link de login do PharmaMind pra essa organização — funcionário por padrão (tela pública), gestor se pedido. */
function urlLoginPharmaMind(comoGestor){
  const slug = getOrgSlugSalvo();
  if(!slug) return location.origin + '/';
  return location.origin + '/' + slug + (comoGestor ? '/gestor/login' : '/funcionario');
}

// ---------- Elevação de acesso (senhas de papel / atestados ficam ocultos até provar acesso de gestor) ----------
// O servidor esconde dado sensível (senhas de papel, motivo de atestado) de
// quem não provou ter acesso de gestor — ver backend/FolgasSigiloService.
// "Elevar" aqui é chamar /elevar com uma credencial (senha de papel, ou o
// próprio código de um colaborador promovido) e guardar o token de curta
// duração que isso devolve, usado nas próximas chamadas de carregar/salvar.
const ELEVACAO_STORAGE_KEY = 'drogaria:folgas:elevacao';
let acessoRestrito = false; // true quando o último carregamento veio com dado sensível oculto
function getElevacaoToken(){
  try{ return sessionStorage.getItem(ELEVACAO_STORAGE_KEY); }catch(e){ return null; }
}
function setElevacaoToken(token){
  try{ sessionStorage.setItem(ELEVACAO_STORAGE_KEY, token); }catch(e){ /* sem storage disponível — segue sem persistir */ }
}
function limparElevacaoToken(){
  try{ sessionStorage.removeItem(ELEVACAO_STORAGE_KEY); }catch(e){ /* nada a limpar */ }
}
/** Tenta provar uma credencial de gestor no servidor. Devolve o papel concedido (string) ou null se inválida/erro. */
async function elevarAcesso(credencial){
  const token = getAuthToken();
  if(!token) return null;
  try{
    const res = await fetch(getApiBaseUrl() + '/armazenamento/' + STORAGE_KEY + '/elevar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify(credencial)
    });
    if(!res.ok) return null;
    const data = await res.json();
    setElevacaoToken(data.token);
    await loadState(); // recarrega já sem a ocultação, agora que provamos acesso
    return data.papel;
  }catch(e){
    console.error('Erro ao elevar acesso', e);
    return null;
  }
}

function estadoPadrao(){
  return { employees: [], credits: [], daysOff: [], leaves: [], creditSwaps: [], blockedDates: [], blockedWeekdays: [], auditLog: [], rolePasswords: {...DEFAULT_ROLE_PASSWORDS} };
}

// Guarda por que loadState falhou (token ausente/expirado, erro de rede...) —
// usado pra NUNCA confundir "não consegui carregar" com "não tem nada
// cadastrado ainda". Antes, qualquer falha (ex.: sessão expirada depois de
// 8h) fazia a tela mostrar tudo vazio e as próximas gravações falhavam
// caladas — parecia que "nada salvava" quando na real ninguém tinha
// conseguido nem carregar os dados reais.
let loadErro = null;

async function loadState(){
  loadErro = null;
  try{
    const token = getAuthToken();
    if(!token){ state = estadoPadrao(); loadErro = 'sem-sessao'; loaded = true; return; }
    const headers = { 'Authorization': 'Bearer ' + token };
    const elevacao = getElevacaoToken();
    if(elevacao) headers['X-Elevacao-Token'] = elevacao;
    const res = await fetch(getApiBaseUrl() + '/armazenamento/' + STORAGE_KEY, { headers });
    if(res.status === 401){ state = estadoPadrao(); loadErro = 'sessao-expirada'; loaded = true; return; }
    if(!res.ok) throw new Error('Falha ao carregar (' + res.status + ')');
    const data = await res.json();
    state = data.valor ? JSON.parse(data.valor) : estadoPadrao();
    versaoAtual = data.versao || 0; // controle de concorrência otimista — ver saveState()
    if(!state.leaves) state.leaves = [];
    if(!state.creditSwaps) state.creditSwaps = [];
    if(!state.blockedDates) state.blockedDates = [];
    if(!state.blockedWeekdays) state.blockedWeekdays = [];
    // Migração: blockedWeekdays era só uma lista de números (0-6). Agora cada
    // item registra também quem bloqueou — dado antigo vira "quem bloqueou: —".
    state.blockedWeekdays = state.blockedWeekdays.map(b=> typeof b === 'number' ? { weekday: b, by: null, at: null } : b);
    if(!state.auditLog) state.auditLog = [];
    // `_acessoRestrito` (ver backend/FolgasSigiloService) avisa que rolePasswords
    // e as notas de atestado vieram ocultas de propósito — nesse caso NÃO
    // preenche com as senhas padrão (senão pareceria que são as senhas reais).
    acessoRestrito = !!state._acessoRestrito;
    delete state._acessoRestrito;
    if(!state.rolePasswords && !acessoRestrito) state.rolePasswords = {...DEFAULT_ROLE_PASSWORDS};
  }catch(e){
    console.error('Erro ao carregar', e);
    state = estadoPadrao();
    loadErro = 'erro-conexao';
  }
  loaded = true;
}
async function saveState(){
  const token = getAuthToken();
  if(!token){
    await showAlert('⚠️ Sua sessão do PharmaMind expirou ou não foi encontrada — isso que você acabou de fazer NÃO foi salvo. Saia e entre de novo (recarregue a página) antes de continuar.');
    return false;
  }
  try{
    const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token };
    const elevacao = getElevacaoToken();
    if(elevacao) headers['X-Elevacao-Token'] = elevacao;
    const res = await fetch(getApiBaseUrl() + '/armazenamento/' + STORAGE_KEY, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ valor: JSON.stringify(state), versaoEsperada: versaoAtual })
    });
    if(res.status === 401){
      await showAlert('⚠️ Sua sessão do PharmaMind expirou — isso que você acabou de fazer NÃO foi salvo. Recarregue a página, faça login de novo no PharmaMind e repita a última ação.');
      return false;
    }
    if(res.status === 409){
      // Alguém mais salvou uma mudança aqui nesse meio-tempo (ex.: gestor e
      // funcionário mexendo ao mesmo tempo) — recarrega o que está
      // realmente salvo em vez de sobrescrever sem avisar. O que você
      // acabou de fazer não foi salvo; repita a ação depois de conferir.
      await showAlert('⚠️ Outra pessoa salvou uma alteração aqui enquanto você mexia — pra não perder o trabalho de ninguém, isso que você acabou de fazer NÃO foi salvo. Vamos recarregar os dados mais recentes; confira e repita sua ação.');
      await loadState();
      renderEmployeeDashboard();
      if(!managerView.hidden) renderManagerView();
      return false;
    }
    if(!res.ok){
      await showAlert('⚠️ Não foi possível salvar (erro ' + res.status + '). Recarregue a página e tente de novo — se continuar acontecendo, avise o suporte.');
      return false;
    }
    const data = await res.json();
    versaoAtual = data.versao || versaoAtual;
    return true;
  }catch(e){
    console.error('Erro ao salvar', e);
    await showAlert('⚠️ Não foi possível salvar por um problema de conexão. Confira sua internet e tente de novo — o que você acabou de fazer NÃO foi salvo.');
    return false;
  }
}

function creditsOf(employeeId){ return state.credits.filter(c=>c.employeeId===employeeId); }
function scheduledOf(employeeId){ return state.daysOff.filter(d=>d.employeeId===employeeId); }
function balanceOf(employeeId){ return creditsOf(employeeId).length - scheduledOf(employeeId).length; }

// Pareia cada crédito (do mais antigo pro mais novo) com a folga correspondente (também da mais antiga pra mais nova),
// pra mostrar no histórico "trabalhou em X -> vai folgar em Y". Créditos sem folga pareada ainda estão disponíveis.
function pairCreditsWithDaysOff(){
  const map = new Map();
  state.employees.forEach(emp=>{
    const credits = creditsOf(emp.id).slice().sort((a,b)=> new Date(a.workedDate)-new Date(b.workedDate));
    const offs = scheduledOf(emp.id).slice().sort((a,b)=> new Date(a.date)-new Date(b.date));
    credits.forEach((c, idx)=>{
      if(offs[idx]) map.set(c.id, offs[idx].date);
    });
  });
  return map;
}

function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.opacity = '1';
  setTimeout(()=> t.style.opacity = '0', 2200);
}

