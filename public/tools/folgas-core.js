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

// Estado da ferramenta — "gestor" aqui é só "ADMIN/GERENTE no PharmaMind" (ver
// sessaoAtual()); não existe mais um sistema de papéis próprio da ferramenta
// (Supervisor/Gerência/CEO por senha compartilhada) nem cadastro de código de
// acesso por colaborador — cada colaborador referencia um `usuário` real do
// PharmaMind (`usuarioId`). Ver PLANO-PAPEIS-E-ACESSO.md, Etapa 3.
let state = { employees: [], credits: [], daysOff: [], leaves: [], creditSwaps: [], blockedDates: [], blockedWeekdays: [], auditLog: [] };
let loaded = false;
let versaoAtual = 0; // controle de concorrência otimista — ver loadState()/saveState()
let currentEmployee = null;
let currentRole = null; // null | 'gerente' — ver identificarSessaoAtual() em folgas-employee.js

/** Lê a sessão do PharmaMind já carregada (gestor ou funcionário) — a mesma usada pra autenticar as chamadas. */
function sessaoAtual(){
  try{
    for(const key of ['drogaria:session:gestor', 'drogaria:session:funcionario']){
      const raw = localStorage.getItem(key);
      if(raw){ const sessao = JSON.parse(raw); if(sessao && sessao.usuario) return sessao; }
    }
  }catch(e){ /* sem sessão salva */ }
  return null;
}

/** Identifica quem está logado na área de gestão agora, pra registrar em bloqueios/auditoria. */
function currentActorLabel(){
  const sessao = sessaoAtual();
  return (sessao && sessao.usuario && sessao.usuario.nome) || currentRole || '—';
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

// Base da API e sessão do PharmaMind — a sessão vem do localStorage da própria
// sessão logada (mesmo domínio do front), no mesmo esquema usado pela
// ferramenta de Cartazes. O estado (funcionários, créditos, folgas,
// atestados...) é salvo no backend, escopado pela organização de quem estiver
// logado — assim gestor e funcionário, em aparelhos diferentes, enxergam
// sempre os mesmos dados.
//
// A base da API é SEMPRE derivada do host que serviu esta página — nunca de um
// parâmetro da URL. Antes havia um override `?api=...`: como toda chamada daqui
// manda o token da sessão no cabeçalho Authorization, um link do tipo
// "...folgas-drogaria-center.html?api=https://site-do-atacante/api" fazia a
// ferramenta entregar a sessão inteira pra quem montou o link, com um clique —
// e getAuthToken() tenta a sessão de GESTOR primeiro, então num aparelho de
// gestor o que vazava era o token de maior privilégio.
function getApiBaseUrl(){
  // Vem da sessão salva pelo próprio app (mesmo origin), nunca da URL: era um
  // parâmetro `?api=...`, e como toda chamada daqui manda o token no
  // Authorization, um link com `?api=https://site-do-atacante/api` entregava a
  // sessão inteira com um clique.
  try{
    for(const key of ['drogaria:session:gestor', 'drogaria:session:funcionario']){
      const raw = localStorage.getItem(key);
      if(raw){ const base = (JSON.parse(raw)||{}).apiBaseUrl; if(base) return base; }
    }
  }catch(e){ /* sem sessão salva — cai no padrão abaixo */ }
  return apiBaseUrlPadrao();
}

/**
 * Último recurso, quando a sessão salva não traz a URL da API.
 *
 * A porta 3333 é o backend rodando na máquina de quem desenvolve — em produção
 * esse chute vira um erro de "sem conexão" que não diz nada sobre a causa real.
 * Fora de um host local, o palpite razoável é a mesma origem; se também estiver
 * errado, ao menos a pessoa relogando resolve, porque o login grava a URL certa.
 */
function apiBaseUrlPadrao(){
  const local = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.local)$/i.test(location.hostname)
    || /^(10|127|192\.168)\./.test(location.hostname)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(location.hostname);
  if(local) return location.protocol + '//' + location.hostname + ':3333/api';
  return location.origin + '/api';
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

// ---------- Sigilo do motivo de atestado ----------
// O servidor esconde o motivo do atestado (ver backend/FolgasSigiloService)
// de quem não é ADMIN/GERENTE de verdade no PharmaMind — a checagem é dele,
// baseada no token da sessão já carregada; não existe mais elevação por
// senha/código dentro da própria ferramenta.
let acessoRestrito = false; // true quando o último carregamento veio com o motivo do atestado oculto

function estadoPadrao(){
  return { employees: [], credits: [], daysOff: [], leaves: [], creditSwaps: [], blockedDates: [], blockedWeekdays: [], auditLog: [] };
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
    // `_acessoRestrito` (ver backend/FolgasSigiloService) avisa que a nota dos
    // atestados veio oculta de propósito — e não "ainda não preenchida".
    acessoRestrito = !!state._acessoRestrito;
    delete state._acessoRestrito;
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

