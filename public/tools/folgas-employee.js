// ---------- Identificação ----------
// Não existe mais tela de código/senha própria da ferramenta: quem está
// logado no PharmaMind (gestor ou funcionário, terminal já autenticado) é
// automaticamente reconhecido aqui — ADMIN/GERENTE cai direto na gestão,
// FUNCIONARIO cai no próprio painel (achado pelo vínculo `usuarioId` no
// cadastro de colaboradores). Ver PLANO-PAPEIS-E-ACESSO.md, Etapa 3.
const employeeView = document.getElementById('employeeView');
const managerView = document.getElementById('managerView');
const backBtn = document.getElementById('backBtn');
const headerSub = document.getElementById('headerSub');

function showOnly(el){
  [employeeView, managerView].forEach(x=> x.hidden = (x !== el));
}

backBtn.addEventListener('click', ()=>{
  // "Voltar" só faz sentido pra sair da área de gestão quando a sessão é de
  // gestor — não há mais "trocar de colaborador" (a identidade vem da sessão
  // do PharmaMind, não de um código digitado aqui).
  location.reload();
});

/** Entra na área de gestão — qualquer ADMIN/GERENTE do PharmaMind. */
function enterManagerView(){
  currentRole = 'gerente';
  const sessao = sessaoAtual();
  const nome = (sessao && sessao.usuario && sessao.usuario.nome) || 'Gestor';
  headerSub.textContent = 'Gestão de folgas — ' + nome;
  document.getElementById('roleBadge').textContent = '🔐 ' + nome;
  backBtn.hidden = false;
  showOnly(managerView);
  renderManagerView();
}

// ---------- Employee view ----------
/**
 * Roda uma vez ao carregar a página (depois de `loadState()`, ver
 * folgas-reports.js/init) — decide a tela a partir da sessão do PharmaMind já
 * logada, sem recarregar o estado de novo.
 */
function identificarSessaoAtual(){
  currentEmployee = null;
  document.getElementById('codeGate').hidden = true;
  document.getElementById('employeeLoggedArea').hidden = true;
  backBtn.hidden = true;

  const sessao = sessaoAtual();
  if(!sessao || !sessao.usuario){
    document.getElementById('codeGate').hidden = false;
    document.getElementById('codeErr').textContent = 'Sessão do PharmaMind não encontrada. Faça login no PharmaMind (nesta mesma aba) e recarregue esta página.';
    return;
  }

  if(sessao.usuario.perfil === 'ADMIN' || sessao.usuario.perfil === 'GERENTE'){
    enterManagerView();
    return;
  }

  const emp = state.employees.find(e=> e.usuarioId === sessao.usuario.id);
  if(!emp){
    document.getElementById('codeGate').hidden = false;
    document.getElementById('codeErr').textContent = 'Seu cadastro ainda não foi vinculado nesta ferramenta. Peça pro seu gerente adicionar "' + sessao.usuario.nome + '" em Colaboradores.';
    return;
  }

  currentEmployee = emp;
  document.getElementById('employeeLoggedArea').hidden = false;
  document.getElementById('greetingText').textContent = 'Olá, ' + emp.name + '!';
  renderEmployeeDashboard();
}

document.getElementById('recarregarIdentificacaoBtn').addEventListener('click', ()=> location.reload());

// Terminal costuma ser compartilhado (balcão) — "Sair" encerra a sessão do
// PharmaMind de verdade (é ela que diz quem você é aqui dentro agora, não um
// código digitado só nesta ferramenta), pra quem usar o aparelho em seguida
// não herdar o painel de quem usou antes.
document.getElementById('switchEmployeeBtn').addEventListener('click', ()=>{
  try{
    localStorage.removeItem('drogaria:session:gestor');
    localStorage.removeItem('drogaria:session:funcionario');
  }catch(e){ /* sem storage disponível */ }
  location.href = urlLoginPharmaMind(false);
});

function renderEmployeeDashboard(){
  if(!currentEmployee) return;
  const balance = balanceOf(currentEmployee.id);
  document.getElementById('balanceNum').textContent = balance;
  document.getElementById('scheduleBtn').disabled = balance <= 0;

  const list = document.getElementById('myOffList');
  list.innerHTML = '';
  const mine = scheduledOf(currentEmployee.id).slice().sort((a,b)=> new Date(a.date)-new Date(b.date));
  if(mine.length === 0){
    list.innerHTML = '<div class="empty-note">Você ainda não agendou nenhuma folga.</div>';
  } else {
    mine.forEach(off=>{
      const item = document.createElement('div');
      item.className = 'off-item';
      item.innerHTML = `<span><span class="date">${fmtDateBr(off.date)}</span><span class="weekday">${weekdayName(off.date)}</span></span><button data-cancel="${off.id}">Cancelar</button>`;
      list.appendChild(item);
    });
    list.querySelectorAll('[data-cancel]').forEach(btn=> btn.addEventListener('click', ()=> cancelMyDayOff(btn.dataset.cancel)));
  }

  const sickList = document.getElementById('mySickList');
  sickList.innerHTML = '';
  const mySick = state.leaves.filter(l=> l.employeeId===currentEmployee.id && l.type==='atestado')
    .slice().sort((a,b)=> new Date(b.startDate)-new Date(a.startDate));
  if(mySick.length === 0){
    sickList.innerHTML = '<div class="empty-note">Nenhum atestado registrado.</div>';
  } else {
    mySick.forEach(s=>{
      const item = document.createElement('div');
      item.className = 'off-item';
      item.style.alignItems = 'flex-start';
      item.innerHTML = `<span><span class="date">${fmtDateBr(s.startDate)} a ${fmtDateBr(s.endDate)}</span><br><span style="font-size:12px;color:var(--ink-soft);">${s.note||'—'}</span></span>`;
      sickList.appendChild(item);
    });
  }

  const swapList = document.getElementById('mySwapList');
  swapList.innerHTML = '';
  const mySwaps = state.creditSwaps.filter(s=> s.employeeId===currentEmployee.id)
    .slice().sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  if(mySwaps.length === 0){
    swapList.innerHTML = '<div class="empty-note">Nenhuma folga trocada por pagamento.</div>';
  } else {
    mySwaps.forEach(s=>{
      const item = document.createElement('div');
      item.className = 'off-item';
      item.style.alignItems = 'flex-start';
      item.innerHTML = `<span><span class="date">Folga do dia trabalhado ${fmtDateBr(s.workedDate)}</span><br><span style="font-size:12px;color:var(--ink-soft);">Trocada por R$ ${fmtMoney(s.valor)} (${FORMA_PAGAMENTO_FOLGA_LABEL[s.forma]||s.forma}) em ${fmtDateBr(s.createdAt.slice(0,10))}${s.nota ? ' — ' + s.nota : ''}</span></span>`;
      swapList.appendChild(item);
    });
  }
}

async function cancelMyDayOff(offId){
  if(!(await showConfirm('Cancelar essa folga agendada? A folga volta pro seu saldo disponível.'))) return;
  state.daysOff = state.daysOff.filter(d=>d.id!==offId);
  await saveState();
  renderEmployeeDashboard();
  showToast('Folga cancelada. Ela voltou pro seu saldo.');
}

// ---------- Schedule modal ----------
const scheduleModal = document.getElementById('scheduleModal');
function validateScheduleDate(){
  const date = document.getElementById('scheduleDateInput').value;
  const warning = document.getElementById('dayWarning');
  const confirmBtn = document.getElementById('confirmScheduleBtn');
  if(!date){ warning.classList.remove('show'); confirmBtn.disabled = false; return; }

  if(isWeekdayBlocked(date)){
    warning.textContent = '🚫 Toda(o) ' + weekdayName(date) + ' está bloqueada(o) pela gerência para folgas.';
    warning.classList.add('show');
    confirmBtn.disabled = true;
    return;
  }

  const blocked = blockedDateInfo(date);
  if(blocked){
    warning.textContent = '🚫 Esse dia foi bloqueado pela gerência para folgas' + (blocked.reason ? (': ' + blocked.reason) : '.') ;
    warning.classList.add('show');
    confirmBtn.disabled = true;
    return;
  }

  const onLeave = employeeOnLeaveAt(currentEmployee.id, date);
  if(onLeave){
    warning.textContent = '🚫 Você está de ' + (onLeave.type==='ferias'?'férias':'atestado') + ' nesse período — não é possível agendar folga.';
    warning.classList.add('show');
    confirmBtn.disabled = true;
    return;
  }

  const takenBy = state.daysOff.find(d=> d.date===date && d.employeeId!==currentEmployee.id);
  if(takenBy){
    const emp = state.employees.find(e=>e.id===takenBy.employeeId);
    warning.textContent = '🚫 ' + (emp?emp.name:'Outro colaborador') + ' já está de folga nesse dia. Só é permitida 1 folga por dia — escolha outra data.';
    warning.classList.add('show');
    confirmBtn.disabled = true;
  } else {
    warning.classList.remove('show');
    confirmBtn.disabled = false;
  }
}

document.getElementById('scheduleBtn').addEventListener('click', ()=>{
  document.getElementById('scheduleDateInput').value = tomorrowStr();
  document.getElementById('scheduleDateInput').min = tomorrowStr();
  scheduleModal.classList.add('open');
  validateScheduleDate();
});
document.getElementById('cancelScheduleBtn').addEventListener('click', ()=> scheduleModal.classList.remove('open'));
scheduleModal.addEventListener('click', (e)=>{ if(e.target===scheduleModal) scheduleModal.classList.remove('open'); });

document.getElementById('scheduleDateInput').addEventListener('change', validateScheduleDate);

document.getElementById('confirmScheduleBtn').addEventListener('click', async ()=>{
  if(!currentEmployee) return;
  const date = document.getElementById('scheduleDateInput').value;
  if(!date){ await showAlert('Escolha uma data.'); return; }
  if(balanceOf(currentEmployee.id) <= 0){ await showAlert('Você não tem folgas disponíveis no momento.'); return; }
  const already = state.daysOff.find(d=> d.employeeId===currentEmployee.id && d.date===date);
  if(already){ await showAlert('Você já tem uma folga agendada nesse dia.'); return; }

  if(isWeekdayBlocked(date)){ await showAlert('Toda(o) ' + weekdayName(date) + ' está bloqueada(o) pela gerência para folgas.'); return; }

  const blocked = blockedDateInfo(date);
  if(blocked){ await showAlert('Esse dia foi bloqueado pela gerência para folgas' + (blocked.reason?(': '+blocked.reason):'.')); return; }

  const onLeave = employeeOnLeaveAt(currentEmployee.id, date);
  if(onLeave){ await showAlert('Você está de ' + (onLeave.type==='ferias'?'férias':'atestado') + ' nesse período — não é possível agendar folga.'); return; }

  const takenBy = state.daysOff.find(d=> d.date===date && d.employeeId!==currentEmployee.id);
  if(takenBy){
    const emp = state.employees.find(e=>e.id===takenBy.employeeId);
    await showAlert('Só é permitida 1 folga por dia, e ' + (emp?emp.name:'outro colaborador') + ' já está de folga nesse dia. Escolha outra data.');
    return;
  }

  state.daysOff.push({ id: uid('off'), employeeId: currentEmployee.id, date, createdAt: new Date().toISOString() });
  await saveState();
  scheduleModal.classList.remove('open');
  renderEmployeeDashboard();
  showToast('Folga agendada para ' + fmtDateBr(date) + '!');
});

// ---------- Employee: registrar atestado / ausência por saúde ----------
const sickModal = document.getElementById('sickModal');
document.getElementById('reportSickBtn').addEventListener('click', ()=>{
  document.getElementById('sickStartInput').value = todayStr();
  document.getElementById('sickEndInput').value = todayStr();
  document.getElementById('sickReasonInput').value = '';
  sickModal.classList.add('open');
});
document.getElementById('cancelSickBtn').addEventListener('click', ()=> sickModal.classList.remove('open'));
sickModal.addEventListener('click', (e)=>{ if(e.target===sickModal) sickModal.classList.remove('open'); });

document.getElementById('confirmSickBtn').addEventListener('click', async ()=>{
  if(!currentEmployee) return;
  const startDate = document.getElementById('sickStartInput').value;
  const endDate = document.getElementById('sickEndInput').value;
  const reason = document.getElementById('sickReasonInput').value.trim();
  if(!startDate || !endDate){ await showAlert('Preencha a data de início e fim.'); return; }
  if(endDate < startDate){ await showAlert('A data final não pode ser antes da data inicial.'); return; }
  if(!reason){ await showAlert('Conte pra gente o que você tem — esse campo é obrigatório pra justificar a ausência.'); return; }

  state.leaves.push({
    id: uid('leave'), employeeId: currentEmployee.id, type: 'atestado',
    startDate, endDate, note: reason, submittedBy: 'colaborador', createdAt: new Date().toISOString()
  });
  await saveState();
  sickModal.classList.remove('open');
  renderEmployeeDashboard();
  showToast('Atestado enviado. Melhoras!');
});

