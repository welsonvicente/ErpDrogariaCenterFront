// ---------- Login único ----------
// Não existe mais tela de escolha de papel: um só campo de código/senha.
// Colaborador (com ou sem cargo) sempre cai no próprio painel; as 3 senhas
// genéricas de cargo (Supervisor/Gerência/CEO) vão direto pra supervisão,
// já que não representam um colaborador específico.
const employeeView = document.getElementById('employeeView');
const managerView = document.getElementById('managerView');
const backBtn = document.getElementById('backBtn');
const headerSub = document.getElementById('headerSub');

function showOnly(el){
  [employeeView, managerView].forEach(x=> x.hidden = (x !== el));
}

backBtn.addEventListener('click', ()=>{
  headerSub.textContent = 'Banco de folgas';
  currentRole = null;
  currentManagerEmployee = null;
  showOnly(employeeView);
  renderEmployeeLoginState();
});

/**
 * Entra na área de supervisão com um cargo — seja pela senha genérica do
 * cargo, pelo código de um colaborador promovido digitado direto no login
 * único, ou pelo botão "Área de supervisão" dentro do painel dele.
 * `employee`, quando presente, é só pra exibir/atribuir quem fez cada ação.
 */
function enterManagerView(role, employee){
  currentRole = role;
  currentManagerEmployee = employee || null;
  const quemLabel = employee ? (role + ' — ' + employee.name) : role;
  headerSub.textContent = 'Gestão de folgas — ' + quemLabel;
  document.getElementById('roleBadge').textContent = '🔐 ' + quemLabel;
  document.getElementById('auditBtn').hidden = (role !== 'CEO');
  document.getElementById('passwordsBtn').hidden = (role !== 'CEO');
  backBtn.hidden = false;
  showOnly(managerView);
  renderManagerView();
}

// ---------- Employee view ----------
async function renderEmployeeLoginState(){
  currentEmployee = null;
  currentEmployeeCode = null; // terminal compartilhado: não deixa o código de quem saiu na memória da página
  document.getElementById('employeeCodeInput').value = '';
  document.getElementById('codeErr').textContent = '';
  document.getElementById('codeGate').hidden = false;
  document.getElementById('employeeLoggedArea').hidden = true;
  backBtn.hidden = true;
  setTimeout(()=> document.getElementById('employeeCodeInput').focus(), 50);

  // Terminal costuma ser compartilhado (balcão) — ao voltar pra essa tela,
  // esquece a elevação de acesso e descarta da memória o que tinha sido
  // carregado sem ocultação, pra quem usar o aparelho em seguida não herdar
  // dado sensível de quem usou antes.
  if(acessoRestrito === false && loaded){
    limparElevacaoToken();
    await loadState();
  }
}
async function tryLogin(){
  const val = document.getElementById('employeeCodeInput').value.trim();
  if(!val) return;

  // 1) senha genérica de cargo (Supervisor/Gerência/CEO) — verificada no
  // servidor, já que o cliente não enxerga mais as senhas reais (ver
  // elevarAcesso). Só quem sabe uma senha válida ganha o token de acesso.
  const btn = document.getElementById('codeLoginBtn');
  btn.disabled = true;
  try{
    const papel = await elevarAcesso({ tipo: 'papel', senha: val });
    if(papel){
      document.getElementById('employeeCodeInput').value = '';
      enterManagerView(papel);
      return;
    }

    // 2) código de colaborador — sempre entra no painel normal dele. Quem
    // confere o código é o servidor: a lista carregada aqui não traz mais o
    // código de ninguém (ver identificarPorCodigo / backend/FolgasSigiloService).
    const identificado = await identificarPorCodigo(val);
    const emp = identificado && state.employees.find(e=> e.id===identificado.id);
    if(!emp){
      document.getElementById('codeErr').textContent = 'Código ou senha incorretos. Confira com o gerente.';
      return;
    }
    currentEmployee = emp;
    currentEmployeeCode = val;
    document.getElementById('codeGate').hidden = true;
    document.getElementById('employeeLoggedArea').hidden = false;
    document.getElementById('greetingText').textContent = 'Olá, ' + emp.name + '!';
    // Ter um cargo não tira o acesso normal de funcionário — só soma um botão
    // extra pra entrar na área de supervisão quando quiser (ver "goSupervisionBtn").
    document.getElementById('goSupervisionBtn').hidden = !emp.role;
    backBtn.hidden = false;
    renderEmployeeDashboard();
  } finally {
    btn.disabled = false;
  }
}
document.getElementById('codeLoginBtn').addEventListener('click', tryLogin);
document.getElementById('employeeCodeInput').addEventListener('keydown', (e)=>{ if(e.key==='Enter') tryLogin(); });
document.getElementById('switchEmployeeBtn').addEventListener('click', renderEmployeeLoginState);
document.getElementById('goSupervisionBtn').addEventListener('click', async ()=>{
  if(!currentEmployee || !currentEmployee.role) return;
  const papel = await elevarAcesso({ tipo: 'funcionario', funcionarioId: currentEmployee.id, codigo: currentEmployeeCode });
  if(papel) enterManagerView(papel, currentEmployee);
  else await showAlert('Não foi possível confirmar seu acesso de supervisão. Tente entrar de novo com seu código.');
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

