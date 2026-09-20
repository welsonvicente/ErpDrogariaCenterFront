// ---------- Manager: employees CRUD ----------
// Colaborador aqui é só um vínculo com um usuário real do PharmaMind
// (`usuarioId`) — não existe mais cadastro próprio (nome/código digitados) nem
// cargo atribuído por dentro da ferramenta. Quem deve ter acesso de gestão se
// resolve promovendo a pessoa a GERENTE na tela de Funcionários do PharmaMind;
// aqui só se escolhe QUEM entra na escala de folgas.
const employeesModal = document.getElementById('employeesModal');
let usuariosDaOrganizacao = null; // cache simples — recarregado a cada abertura do modal

async function buscarUsuariosDaOrganizacao(){
  const token = getAuthToken();
  if(!token) return [];
  try{
    const res = await fetch(getApiBaseUrl() + '/usuarios', { headers: { 'Authorization': 'Bearer ' + token } });
    if(!res.ok) return [];
    return await res.json();
  }catch(e){
    console.error('Erro ao buscar usuários', e);
    return [];
  }
}

async function openEmployeesModal(){
  document.getElementById('newEmpUsuarioSelect').innerHTML = '<option value="">Carregando...</option>';
  document.getElementById('saveEmployeeBtn').disabled = true;
  renderEmployeesList();
  employeesModal.classList.add('open');

  usuariosDaOrganizacao = await buscarUsuariosDaOrganizacao();
  renderNovoColaboradorSelect();
}
document.getElementById('manageEmployeesBtn').addEventListener('click', openEmployeesModal);
document.getElementById('closeEmployeesModalBtn').addEventListener('click', ()=> employeesModal.classList.remove('open'));
employeesModal.addEventListener('click', (e)=>{ if(e.target===employeesModal) employeesModal.classList.remove('open'); });

/** Só oferece pra vincular quem ainda não está na escala — cada usuário entra uma vez só. */
function renderNovoColaboradorSelect(){
  const sel = document.getElementById('newEmpUsuarioSelect');
  const jaVinculados = new Set(state.employees.map(e=> e.usuarioId).filter(Boolean));
  const disponiveis = (usuariosDaOrganizacao || []).filter(u=> u.ativo && !jaVinculados.has(u.id));

  if(disponiveis.length === 0){
    sel.innerHTML = '<option value="">Nenhum usuário disponível pra vincular</option>';
    document.getElementById('saveEmployeeBtn').disabled = true;
    return;
  }
  sel.innerHTML = disponiveis.map(u=> `<option value="${u.id}">${u.nome}${u.perfil!=='FUNCIONARIO' ? ' ('+u.perfil+')' : ''}</option>`).join('');
  document.getElementById('saveEmployeeBtn').disabled = false;
}

function renderEmployeesList(){
  const el = document.getElementById('employeesList');
  el.innerHTML = '';
  if(state.employees.length === 0){
    el.innerHTML = '<div class="empty-row" style="padding:10px 0;">Nenhum colaborador na escala ainda.</div>';
    return;
  }
  state.employees.forEach(emp=>{
    const row = document.createElement('div');
    row.className = 'emp-manage-row';
    const label = document.createElement('span');
    label.textContent = emp.name;
    if(!emp.usuarioId){
      const semVinculo = document.createElement('span');
      semVinculo.className = 'ecode';
      semVinculo.style.color = 'var(--red)';
      semVinculo.textContent = ' sem vínculo — recadastre';
      label.appendChild(semVinculo);
    }

    const actions = document.createElement('span');
    actions.className = 'eactions';
    const delBtn = document.createElement('button');
    delBtn.type='button'; delBtn.className='del'; delBtn.textContent='Remover';
    delBtn.addEventListener('click', ()=> deleteEmployee(emp.id));
    actions.appendChild(delBtn);

    row.appendChild(label); row.appendChild(actions);
    el.appendChild(row);
  });
}
async function deleteEmployee(id){
  if(!(await showConfirm('Remover este colaborador da escala? O histórico de créditos e folgas dele é mantido.'))) return;
  const emp = state.employees.find(e=>e.id===id);
  state.employees = state.employees.filter(e=>e.id!==id);
  await saveState();
  await logAction('Removeu colaborador da escala', emp ? emp.name : id);
  renderEmployeesList();
  renderNovoColaboradorSelect();
  renderManagerView();
}
document.getElementById('saveEmployeeBtn').addEventListener('click', async ()=>{
  const usuarioId = document.getElementById('newEmpUsuarioSelect').value;
  if(!usuarioId){ await showAlert('Escolha um usuário pra adicionar à escala.'); return; }
  const usuario = (usuariosDaOrganizacao || []).find(u=> u.id === usuarioId);
  if(!usuario) return;

  state.employees.push({ id: uid('emp'), usuarioId, name: usuario.nome });
  await saveState();
  await logAction('Adicionou colaborador à escala', usuario.nome);
  renderEmployeesList();
  renderNovoColaboradorSelect();
  renderManagerView();
});

// ---------- Manager: register credit ----------
const creditModal = document.getElementById('creditModal');
document.getElementById('addCreditBtn').addEventListener('click', ()=>{
  const sel = document.getElementById('creditEmployeeSelect');
  sel.innerHTML = state.employees.map(e=> `<option value="${e.id}">${e.name}</option>`).join('');
  if(state.employees.length === 0){
    sel.innerHTML = '<option value="">Cadastre um colaborador primeiro</option>';
  }
  document.getElementById('creditDateInput').value = todayStr();
  document.getElementById('creditNoteInput').value = '';
  creditModal.classList.add('open');
});
document.getElementById('cancelCreditBtn').addEventListener('click', ()=> creditModal.classList.remove('open'));
creditModal.addEventListener('click', (e)=>{ if(e.target===creditModal) creditModal.classList.remove('open'); });

document.getElementById('saveCreditBtn').addEventListener('click', async ()=>{
  const employeeId = document.getElementById('creditEmployeeSelect').value;
  const workedDate = document.getElementById('creditDateInput').value;
  const note = document.getElementById('creditNoteInput').value.trim();
  if(!employeeId){ await showAlert('Cadastre e selecione um colaborador.'); return; }
  if(!workedDate){ await showAlert('Escolha a data trabalhada.'); return; }

  const weekday = new Date(workedDate+'T00:00:00').getDay();
  if(weekday !== 0){
    const proceed = await showConfirm('Essa data não é um domingo. Se for feriado, pode confirmar mesmo assim. Deseja continuar?');
    if(!proceed) return;
  }

  state.credits.push({ id: uid('cred'), employeeId, workedDate, note, createdAt: new Date().toISOString() });
  await saveState();
  const emp = state.employees.find(e=>e.id===employeeId);
  await logAction('Registrou crédito de folga', (emp?emp.name:'') + ' — trabalhou em ' + fmtDateBr(workedDate));
  creditModal.classList.remove('open');
  renderManagerView();
  showToast('Crédito de folga registrado!');
});

// ---------- Manager: vender/trocar folga por pagamento ----------
// A folga é "fungível" (o saldo é só créditos menos usadas, sem vínculo fixo
// a uma data) — então vender 1 folga consome o crédito disponível mais
// antigo do colaborador, igual já acontece visualmente no pareamento do
// histórico de créditos.
function oldestAvailableCredit(employeeId){
  const paired = pairCreditsWithDaysOff();
  const sorted = creditsOf(employeeId).slice().sort((a,b)=> new Date(a.workedDate)-new Date(b.workedDate));
  return sorted.find(c=> !paired.has(c.id)) || null;
}
const sellModal = document.getElementById('sellModal');
let sellTargetEmployeeId = null;
function openSellModal(employeeId){
  const emp = state.employees.find(e=>e.id===employeeId);
  if(!emp) return;
  if(balanceOf(employeeId) <= 0){ showAlert('Esse colaborador não tem folga disponível pra vender/trocar.'); return; }
  sellTargetEmployeeId = employeeId;
  document.getElementById('sellEmployeeName').textContent = emp.name;
  document.getElementById('sellValorInput').value = '';
  document.getElementById('sellFormaSelect').value = 'dinheiro';
  document.getElementById('sellNoteInput').value = '';
  sellModal.classList.add('open');
}
document.getElementById('cancelSellBtn').addEventListener('click', ()=> sellModal.classList.remove('open'));
sellModal.addEventListener('click', (e)=>{ if(e.target===sellModal) sellModal.classList.remove('open'); });

document.getElementById('confirmSellBtn').addEventListener('click', async ()=>{
  const employeeId = sellTargetEmployeeId;
  const emp = state.employees.find(e=>e.id===employeeId);
  if(!emp) return;
  const valor = Number(document.getElementById('sellValorInput').value);
  const forma = document.getElementById('sellFormaSelect').value;
  const nota = document.getElementById('sellNoteInput').value.trim();
  if(!valor || valor <= 0){ await showAlert('Informe o valor pago pela folga.'); return; }

  const credit = oldestAvailableCredit(employeeId);
  if(!credit){ await showAlert('Esse colaborador não tem folga disponível pra vender/trocar.'); return; }

  const proceed = await showConfirm('Remover 1 folga disponível de ' + emp.name + ' e registrar a troca por R$ ' + fmtMoney(valor) + ' (' + FORMA_PAGAMENTO_FOLGA_LABEL[forma] + ')?');
  if(!proceed) return;

  state.credits = state.credits.filter(c=> c.id !== credit.id);
  state.creditSwaps.push({
    id: uid('swap'),
    employeeId,
    workedDate: credit.workedDate,
    valor,
    forma,
    nota,
    createdAt: new Date().toISOString(),
    createdBy: currentActorLabel(),
    originalCredit: credit, // guardado pra poder devolver exatamente esse crédito se a troca for cancelada
  });
  await saveState();
  await logAction('Vendeu/trocou folga por pagamento', emp.name + ' — R$ ' + fmtMoney(valor) + ' (' + FORMA_PAGAMENTO_FOLGA_LABEL[forma] + ')' + (nota ? ' — ' + nota : ''));
  sellModal.classList.remove('open');
  renderManagerView();
  showToast('Folga trocada por pagamento!');
});

async function cancelSwap(swapId){
  const swap = state.creditSwaps.find(s=> s.id===swapId);
  if(!swap) return;
  const emp = state.employees.find(e=>e.id===swap.employeeId);
  const proceed = await showConfirm('Cancelar essa troca? A folga volta pro saldo de ' + (emp?emp.name:'—') + '. Se o pagamento de R$ ' + fmtMoney(swap.valor) + ' já tiver sido feito, o estorno do dinheiro precisa ser resolvido separadamente.');
  if(!proceed) return;

  state.creditSwaps = state.creditSwaps.filter(s=> s.id!==swapId);
  state.credits.push(swap.originalCredit || { id: uid('cred'), employeeId: swap.employeeId, workedDate: swap.workedDate, note: '', createdAt: new Date().toISOString() });
  await saveState();
  await logAction('Cancelou troca de folga por pagamento', (emp?emp.name:'—') + ' — R$ ' + fmtMoney(swap.valor) + ' (' + (FORMA_PAGAMENTO_FOLGA_LABEL[swap.forma]||swap.forma) + ')');
  renderManagerView();
  showToast('Troca cancelada — a folga voltou pro saldo do colaborador.');
}

// ---------- Helpers: bloqueios (dia bloqueado pela gerência / colaborador de férias) ----------
function blockedDateInfo(date){
  return state.blockedDates.find(b=> b.date===date) || null;
}
function isWeekdayBlocked(date){
  const wd = new Date(date+'T00:00:00').getDay();
  return state.blockedWeekdays.some(b=> b.weekday === wd);
}
function employeeOnLeaveAt(employeeId, date){
  return state.leaves.find(l=> l.employeeId===employeeId && date >= l.startDate && date <= l.endDate) || null;
}

// ---------- Manager: bloquear dias específicos ----------
const blockedModal = document.getElementById('blockedModal');
let pendingBlockedDates = []; // [{date, reason}] ainda não salvos

const WEEKDAY_LABELS = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];

function renderWeekdayToggles(){
  const el = document.getElementById('weekdayToggles');
  el.innerHTML = '';
  WEEKDAY_LABELS.forEach((label, idx)=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'weekday-toggle' + (state.blockedWeekdays.some(b=>b.weekday===idx) ? ' active' : '');
    btn.textContent = label;
    btn.addEventListener('click', ()=> toggleWeekdayBlock(idx));
    el.appendChild(btn);
  });

  // Observação: quem bloqueou cada dia da semana ativo — visível pra
  // qualquer cargo (Supervisor, Gerência ou CEO) que abrir essa tela.
  const infoEl = document.getElementById('weekdayBlockedInfo');
  const blocked = state.blockedWeekdays.slice().sort((a,b)=> a.weekday-b.weekday);
  if(blocked.length === 0){
    infoEl.innerHTML = '';
  } else {
    infoEl.innerHTML = blocked.map(b=>{
      const quem = b.by || 'não registrado (bloqueado antes desse recurso existir)';
      const quando = b.at ? ' em ' + fmtDateBr(b.at.slice(0,10)) : '';
      return '<div>🚫 <strong>' + WEEKDAY_LABELS[b.weekday] + '</strong> — bloqueado por ' + quem + quando + '</div>';
    }).join('');
  }
}

async function toggleWeekdayBlock(idx){
  let action;
  if(state.blockedWeekdays.some(b=>b.weekday===idx)){
    state.blockedWeekdays = state.blockedWeekdays.filter(b=>b.weekday!==idx);
    action = 'Desbloqueou dia da semana';
  } else {
    state.blockedWeekdays.push({ weekday: idx, by: currentActorLabel(), at: new Date().toISOString() });
    action = 'Bloqueou dia da semana';
  }
  await saveState();
  await logAction(action, WEEKDAY_LABELS[idx]);
  renderWeekdayToggles();
}

function openBlockedModal(){
  document.getElementById('blockedDateInput').value = tomorrowStr();
  document.getElementById('blockedDateEndInput').value = '';
  document.getElementById('blockedReasonInput').value = '';
  pendingBlockedDates = [];
  renderWeekdayToggles();
  renderBlockedList();
  renderPendingBlockedList();
  blockedModal.classList.add('open');
}
document.getElementById('manageBlockedBtn').addEventListener('click', openBlockedModal);
document.getElementById('closeBlockedModalBtn').addEventListener('click', ()=> blockedModal.classList.remove('open'));
blockedModal.addEventListener('click', (e)=>{ if(e.target===blockedModal) blockedModal.classList.remove('open'); });

function renderBlockedList(){
  const el = document.getElementById('blockedList');
  el.innerHTML = '';
  if(state.blockedDates.length === 0){
    el.innerHTML = '<div class="empty-row" style="padding:10px 0;">Nenhum dia bloqueado.</div>';
    return;
  }
  const sorted = state.blockedDates.slice().sort((a,b)=> new Date(a.date)-new Date(b.date));
  sorted.forEach(b=>{
    const row = document.createElement('div');
    row.className = 'emp-manage-row';
    const quem = b.by || 'não registrado';
    row.innerHTML = `
      <span>${fmtDateBr(b.date)} <span style="color:var(--ink-soft);font-size:11.5px;">(${weekdayName(b.date)})</span>${b.reason?' — '+b.reason:''}<br><span style="color:var(--ink-soft);font-size:11px;">bloqueado por ${quem}</span></span>
      <span class="eactions"><button class="del" data-delblocked="${b.id}">Remover</button></span>
    `;
    el.appendChild(row);
  });
  el.querySelectorAll('[data-delblocked]').forEach(btn=> btn.addEventListener('click', ()=> deleteBlockedDate(btn.dataset.delblocked)));
}

async function deleteBlockedDate(id){
  if(!(await showConfirm('Desbloquear esse dia? Colaboradores voltam a poder agendar folga nele.'))) return;
  const blk = state.blockedDates.find(b=>b.id===id);
  state.blockedDates = state.blockedDates.filter(b=>b.id!==id);
  await saveState();
  await logAction('Desbloqueou data', blk ? fmtDateBr(blk.date) : id);
  renderBlockedList();
}

function renderPendingBlockedList(){
  const el = document.getElementById('pendingBlockedList');
  el.innerHTML = '';
  pendingBlockedDates.forEach((item, idx)=>{
    const chip = document.createElement('span');
    chip.className = 'pending-chip';
    chip.innerHTML = `${fmtDateBr(item.date)} <button type="button" title="Remover da lista">✕</button>`;
    chip.querySelector('button').addEventListener('click', ()=>{
      pendingBlockedDates.splice(idx,1);
      renderPendingBlockedList();
    });
    el.appendChild(chip);
  });
  document.getElementById('saveBlockedBtn').textContent = pendingBlockedDates.length
    ? 'Bloquear ' + pendingBlockedDates.length + ' dia(s) da lista'
    : 'Bloquear dia(s) da lista';
}

function addDaysToPendingList(){
  const start = document.getElementById('blockedDateInput').value;
  const end = document.getElementById('blockedDateEndInput').value;
  const reason = document.getElementById('blockedReasonInput').value.trim();
  if(!start) return { added: 0, skipped: 0 };

  const dates = [];
  if(end && end >= start){
    let d = new Date(start+'T00:00:00');
    const last = new Date(end+'T00:00:00');
    while(d <= last){
      dates.push(d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()));
      d.setDate(d.getDate()+1);
    }
  } else {
    dates.push(start);
  }

  let added = 0, skipped = 0;
  dates.forEach(date=>{
    const alreadyBlocked = state.blockedDates.some(b=>b.date===date);
    const alreadyPending = pendingBlockedDates.some(p=>p.date===date);
    if(alreadyBlocked || alreadyPending){ skipped++; return; }
    pendingBlockedDates.push({ date, reason });
    added++;
  });
  return { added, skipped };
}

document.getElementById('addPendingBlockedBtn').addEventListener('click', async ()=>{
  const start = document.getElementById('blockedDateInput').value;
  if(!start){ await showAlert('Escolha pelo menos a data inicial.'); return; }
  const { added, skipped } = addDaysToPendingList();
  if(added === 0 && skipped > 0){ await showAlert('Essa(s) data(s) já está(ão) bloqueada(s) ou já está(ão) na lista.'); return; }
  document.getElementById('blockedDateEndInput').value = '';
  renderPendingBlockedList();
});

document.getElementById('saveBlockedBtn').addEventListener('click', async ()=>{
  if(pendingBlockedDates.length === 0){
    // conveniência: se a lista está vazia mas há uma data preenchida, tenta adicionar e bloquear direto
    const start = document.getElementById('blockedDateInput').value;
    if(!start){ await showAlert('Escolha ao menos uma data e clique em "+ Adicionar à lista", ou preencha a data para bloquear direto.'); return; }
    addDaysToPendingList();
  }
  if(pendingBlockedDates.length === 0){ await showAlert('Nenhuma data nova para bloquear.'); return; }

  const blockedDatesList = pendingBlockedDates.map(item=> fmtDateBr(item.date)).join(', ');
  pendingBlockedDates.forEach(item=>{
    state.blockedDates.push({ id: uid('blk'), date: item.date, reason: item.reason, by: currentActorLabel(), createdAt: new Date().toISOString() });
  });
  const count = pendingBlockedDates.length;
  pendingBlockedDates = [];
  await saveState();
  await logAction('Bloqueou data(s)', blockedDatesList);
  document.getElementById('blockedDateEndInput').value = '';
  renderBlockedList();
  renderPendingBlockedList();
  showToast(count + ' dia(s) bloqueado(s) para folga!');
});

// ---------- Manager: leaves (férias/atestados) ----------
const leavesModal = document.getElementById('leavesModal');
const LEAVE_LABELS = { ferias: '🏖️ Férias', atestado: '🩹 Atestado médico' };

function openLeavesModal(){
  const sel = document.getElementById('leaveEmployeeSelect');
  sel.innerHTML = state.employees.length
    ? state.employees.map(e=> `<option value="${e.id}">${e.name}</option>`).join('')
    : '<option value="">Cadastre um colaborador primeiro</option>';
  document.getElementById('leaveTypeSelect').value = 'ferias';
  document.getElementById('leaveStartInput').value = todayStr();
  document.getElementById('leaveEndInput').value = todayStr();
  document.getElementById('leaveNoteInput').value = '';
  renderLeavesList();
  leavesModal.classList.add('open');
}
document.getElementById('manageLeavesBtn').addEventListener('click', openLeavesModal);
document.getElementById('closeLeavesModalBtn').addEventListener('click', ()=> leavesModal.classList.remove('open'));
leavesModal.addEventListener('click', (e)=>{ if(e.target===leavesModal) leavesModal.classList.remove('open'); });

function leaveStatus(leave){
  const today = todayStr();
  if(today < leave.startDate) return { label:'Agendado', cls:'zero' };
  if(today > leave.endDate) return { label:'Encerrado', cls:'zero' };
  return { label:'Em andamento', cls:'pos' };
}

function renderLeavesList(){
  const el = document.getElementById('leavesList');
  el.innerHTML = '';
  if(state.leaves.length === 0){
    el.innerHTML = '<div class="empty-row" style="padding:10px 0;">Nenhuma férias ou atestado registrado ainda.</div>';
    return;
  }
  const sorted = state.leaves.slice().sort((a,b)=> new Date(b.startDate)-new Date(a.startDate));
  sorted.forEach(leave=>{
    const emp = state.employees.find(e=>e.id===leave.employeeId);
    const st = leaveStatus(leave);
    const row = document.createElement('div');
    row.className = 'emp-manage-row';
    row.innerHTML = `
      <span>${LEAVE_LABELS[leave.type]||leave.type} — ${emp?emp.name:'—'} ${leave.submittedBy==='colaborador' ? '<span class="balance-pill zero" style="font-size:10px;">enviado pelo colaborador</span>' : ''}<br>
        <span style="font-size:11.5px;color:var(--ink-soft);">${fmtDateBr(leave.startDate)} a ${fmtDateBr(leave.endDate)}${leave.note?' · '+leave.note:''}</span>
        <span class="balance-pill ${st.cls}" style="margin-left:6px;">${st.label}</span>
      </span>
      <span class="eactions"><button class="del" data-delleave="${leave.id}">Remover</button></span>
    `;
    el.appendChild(row);
  });
  el.querySelectorAll('[data-delleave]').forEach(btn=> btn.addEventListener('click', ()=> deleteLeave(btn.dataset.delleave)));
}

async function deleteLeave(id){
  if(!(await showConfirm('Remover este registro de férias/atestado?'))) return;
  const leave = state.leaves.find(l=>l.id===id);
  const emp = leave ? state.employees.find(e=>e.id===leave.employeeId) : null;
  state.leaves = state.leaves.filter(l=>l.id!==id);
  await saveState();
  await logAction('Removeu registro de ' + (leave&&leave.type==='ferias'?'férias':'atestado'), (emp?emp.name:'—'));
  renderLeavesList();
  renderManagerView();
}

document.getElementById('saveLeaveBtn').addEventListener('click', async ()=>{
  const employeeId = document.getElementById('leaveEmployeeSelect').value;
  const type = document.getElementById('leaveTypeSelect').value;
  const startDate = document.getElementById('leaveStartInput').value;
  const endDate = document.getElementById('leaveEndInput').value;
  const note = document.getElementById('leaveNoteInput').value.trim();
  if(!employeeId){ await showAlert('Cadastre e selecione um colaborador.'); return; }
  if(!startDate || !endDate){ await showAlert('Preencha a data de início e fim.'); return; }
  if(endDate < startDate){ await showAlert('A data final não pode ser antes da data inicial.'); return; }

  state.leaves.push({ id: uid('leave'), employeeId, type, startDate, endDate, note, createdAt: new Date().toISOString() });
  await saveState();
  const emp = state.employees.find(e=>e.id===employeeId);
  await logAction('Registrou ' + (type==='ferias'?'férias':'atestado'), (emp?emp.name:'') + ' — ' + fmtDateBr(startDate) + ' a ' + fmtDateBr(endDate));
  document.getElementById('leaveNoteInput').value = '';
  renderLeavesList();
  renderManagerView();
  showToast((type==='ferias'?'Férias':'Atestado') + ' registrado(a)!');
});

// ---------- Relatório de auditoria ----------
// Antes era exclusivo do cargo "CEO" (o mais alto dos 3 papéis próprios da
// ferramenta). Não existe mais essa distinção — qualquer ADMIN/GERENTE do
// PharmaMind vê a auditoria, igual já é o padrão no resto do sistema.
const auditModal = document.getElementById('auditModal');
function fmtDateTimeBr(iso){
  const d = new Date(iso);
  return pad(d.getDate())+'/'+pad(d.getMonth()+1)+'/'+d.getFullYear()+' às '+pad(d.getHours())+':'+pad(d.getMinutes());
}
function openAuditModal(){
  renderAuditList();
  auditModal.classList.add('open');
}
document.getElementById('auditBtn').addEventListener('click', openAuditModal);
document.getElementById('closeAuditModalBtn').addEventListener('click', ()=> auditModal.classList.remove('open'));
auditModal.addEventListener('click', (e)=>{ if(e.target===auditModal) auditModal.classList.remove('open'); });

function renderAuditList(){
  const el = document.getElementById('auditList');
  el.innerHTML = '';
  const entries = state.auditLog.slice().sort((a,b)=> new Date(b.timestamp)-new Date(a.timestamp));

  if(entries.length === 0){
    el.innerHTML = '<div class="empty-row">Nenhuma ação registrada ainda.</div>';
    return;
  }
  entries.forEach(entry=>{
    const row = document.createElement('div');
    row.className = 'emp-manage-row';
    row.style.alignItems = 'flex-start';
    row.innerHTML = `
      <span>
        <span class="balance-pill pos" style="margin-right:6px;">${entry.role}</span>
        <b>${entry.action}</b>${entry.details ? ' — '+entry.details : ''}<br>
        <span style="font-size:11px;color:var(--ink-soft);">${fmtDateTimeBr(entry.timestamp)}</span>
      </span>
    `;
    el.appendChild(row);
  });
}

// ---------- Manager: dashboard ----------
// ---------- Período de visualização (filtra os painéis de histórico do dashboard) ----------
let periodoModo = 'mes'; // 'mes' (até hoje) | 'especifico' (datas escolhidas)
let periodoInicioManual = null;
let periodoFimManual = null;

function primeiroDiaDoMes(){
  const d = new Date();
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-01';
}
/** Início/fim (strings AAAA-MM-DD) do período atualmente selecionado — "mês atual" sempre vai até hoje, não até o fim do mês. */
function periodoAtual(){
  if(periodoModo === 'especifico' && periodoInicioManual && periodoFimManual){
    return { inicio: periodoInicioManual, fim: periodoFimManual };
  }
  return { inicio: primeiroDiaDoMes(), fim: todayStr() };
}
/** `dataIso` pode ser "AAAA-MM-DD" ou um timestamp ISO completo — só a parte da data importa aqui. */
function dentroDoPeriodo(dataIso){
  if(!dataIso) return false;
  const { inicio, fim } = periodoAtual();
  const data = dataIso.slice(0,10);
  return data >= inicio && data <= fim;
}
function atualizarPeriodoUI(){
  document.getElementById('periodTabMes').classList.toggle('active', periodoModo==='mes');
  document.getElementById('periodTabEspecifico').classList.toggle('active', periodoModo==='especifico');
  document.getElementById('periodFieldsEspecifico').style.display = periodoModo==='especifico' ? 'flex' : 'none';
  const { inicio, fim } = periodoAtual();
  document.getElementById('periodSummary').textContent = '📊 Mostrando dados de ' + fmtDateBr(inicio) + ' até ' + fmtDateBr(fim) + '.';
}
document.getElementById('periodTabMes').addEventListener('click', ()=>{
  periodoModo = 'mes';
  atualizarPeriodoUI();
  renderManagerView();
});
document.getElementById('periodTabEspecifico').addEventListener('click', ()=>{
  periodoModo = 'especifico';
  if(!periodoInicioManual) periodoInicioManual = primeiroDiaDoMes();
  if(!periodoFimManual) periodoFimManual = todayStr();
  document.getElementById('periodoInicioInput').value = periodoInicioManual;
  document.getElementById('periodoFimInput').value = periodoFimManual;
  atualizarPeriodoUI();
  renderManagerView();
});
document.getElementById('periodoAplicarBtn').addEventListener('click', ()=>{
  const inicio = document.getElementById('periodoInicioInput').value;
  const fim = document.getElementById('periodoFimInput').value;
  if(!inicio || !fim){ showAlert('Escolha as duas datas do período.'); return; }
  if(fim < inicio){ showAlert('A data final não pode ser antes da data inicial.'); return; }
  periodoInicioManual = inicio;
  periodoFimManual = fim;
  atualizarPeriodoUI();
  renderManagerView();
});

function renderManagerView(){
  atualizarPeriodoUI();
  renderFolgaHojeAmanha();
  document.getElementById('statEmployees').textContent = state.employees.length;
  document.getElementById('statCredits').textContent = state.credits.length;
  document.getElementById('statScheduled').textContent = state.daysOff.length;
  const totalAvailable = state.employees.reduce((s,e)=> s + Math.max(0,balanceOf(e.id)), 0);
  document.getElementById('statAvailable').textContent = totalAvailable;

  const activeBody = document.getElementById('activeLeavesBody');
  activeBody.innerHTML = '';
  const today = todayStr();
  const activeLeaves = state.leaves.filter(l=> today >= l.startDate && today <= l.endDate);
  if(activeLeaves.length === 0){
    activeBody.innerHTML = '<tr><td colspan="3" class="empty-row">Ninguém de férias ou atestado hoje.</td></tr>';
  } else {
    activeLeaves.forEach(leave=>{
      const emp = state.employees.find(e=>e.id===leave.employeeId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${emp?emp.name:'—'}</td><td>${LEAVE_LABELS[leave.type]||leave.type}</td><td>${fmtDateBr(leave.endDate)}</td>`;
      activeBody.appendChild(tr);
    });
  }

  const sickBody = document.getElementById('sickReportBody');
  sickBody.innerHTML = '';
  const sickStats = state.employees.map(emp=>{
    const atestados = state.leaves.filter(l=> l.employeeId===emp.id && l.type==='atestado' && dentroDoPeriodo(l.startDate));
    const totalDays = atestados.reduce((s,l)=> s + daysBetweenInclusive(l.startDate, l.endDate), 0);
    return { emp, count: atestados.length, totalDays };
  }).filter(s=> s.count > 0).sort((a,b)=> b.totalDays - a.totalDays);

  if(sickStats.length === 0){
    sickBody.innerHTML = '<tr><td colspan="3" class="empty-row">Nenhum atestado nesse período.</td></tr>';
  } else {
    sickStats.forEach(s=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${s.emp.name}</td><td>${s.count}</td><td><b>${s.totalDays}</b> dia(s)</td>`;
      sickBody.appendChild(tr);
    });
  }

  const sickDetailBody = document.getElementById('sickDetailBody');
  sickDetailBody.innerHTML = '';
  const allSick = state.leaves.filter(l=> l.type==='atestado' && dentroDoPeriodo(l.startDate)).slice().sort((a,b)=> new Date(b.startDate)-new Date(a.startDate));
  if(allSick.length === 0){
    sickDetailBody.innerHTML = '<tr><td colspan="6" class="empty-row">Nenhum atestado nesse período.</td></tr>';
  } else {
    allSick.forEach(l=>{
      const emp = state.employees.find(e=>e.id===l.employeeId);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${emp?emp.name:'—'}</td>
        <td>${l.createdAt ? fmtDateTimeBr(l.createdAt) : '—'}</td>
        <td>${fmtDateBr(l.startDate)}</td>
        <td>${fmtDateBr(l.endDate)}</td>
        <td>${daysBetweenInclusive(l.startDate, l.endDate)}</td>
        <td>${l.note || '—'}</td>
      `;
      sickDetailBody.appendChild(tr);
    });
  }

  const balanceBody = document.getElementById('balanceBody');
  balanceBody.innerHTML = '';
  if(state.employees.length === 0){
    balanceBody.innerHTML = '<tr><td colspan="5" class="empty-row">Nenhum colaborador cadastrado.</td></tr>';
  } else {
    state.employees.forEach(emp=>{
      const earned = creditsOf(emp.id).length;
      const used = scheduledOf(emp.id).length;
      const bal = earned - used;
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${emp.name}</td><td>${earned}</td><td>${used}</td><td><span class="balance-pill ${bal>0?'pos':'zero'}">${bal}</span></td><td class="row-actions">${bal>0 ? `<button class="del" data-sellcredit="${emp.id}" style="color:var(--green-deep);">💰 Vender/trocar</button>` : ''}</td>`;
      balanceBody.appendChild(tr);
    });
    balanceBody.querySelectorAll('[data-sellcredit]').forEach(btn=> btn.addEventListener('click', ()=> openSellModal(btn.dataset.sellcredit)));
  }

  const schedBody = document.getElementById('scheduledBody');
  schedBody.innerHTML = '';
  const upcoming = state.daysOff.filter(off=> dentroDoPeriodo(off.date)).sort((a,b)=> new Date(a.date)-new Date(b.date));
  if(upcoming.length === 0){
    schedBody.innerHTML = '<tr><td colspan="3" class="empty-row">Nenhuma folga agendada nesse período.</td></tr>';
  } else {
    upcoming.forEach(off=>{
      const emp = state.employees.find(e=>e.id===off.employeeId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${emp?emp.name:'—'}</td><td>${fmtDateBr(off.date)} <span style="color:var(--ink-soft);font-size:11.5px;">(${weekdayName(off.date)})</span></td><td class="row-actions"><button class="del" data-cancelsched="${off.id}">Cancelar</button></td>`;
      schedBody.appendChild(tr);
    });
    schedBody.querySelectorAll('[data-cancelsched]').forEach(btn=> btn.addEventListener('click', ()=> cancelScheduled(btn.dataset.cancelsched)));
  }

  const credBody = document.getElementById('creditsBody');
  credBody.innerHTML = '';
  const creditsSorted = state.credits.filter(c=> dentroDoPeriodo(c.workedDate)).sort((a,b)=> new Date(b.workedDate)-new Date(a.workedDate));
  if(creditsSorted.length === 0){
    credBody.innerHTML = '<tr><td colspan="4" class="empty-row">Nenhum crédito registrado nesse período.</td></tr>';
  } else {
    const usedDateByCredit = pairCreditsWithDaysOff();
    creditsSorted.forEach(c=>{
      const emp = state.employees.find(e=>e.id===c.employeeId);
      const usedDate = usedDateByCredit.get(c.id);
      const usedCell = usedDate
        ? fmtDateBr(usedDate) + ' <span style="color:var(--ink-soft);font-size:11.5px;">('+weekdayName(usedDate)+')</span>'
        : '<span class="balance-pill zero">Disponível</span>';
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${emp?emp.name:'—'}</td><td>${fmtDateBr(c.workedDate)}${c.note?' — '+c.note:''}</td><td>${usedCell}</td><td class="row-actions"><button class="del" data-delcredit="${c.id}">Remover</button></td>`;
      credBody.appendChild(tr);
    });
    credBody.querySelectorAll('[data-delcredit]').forEach(btn=> btn.addEventListener('click', ()=> deleteCredit(btn.dataset.delcredit)));
  }

  const swapsBody = document.getElementById('swapsBody');
  swapsBody.innerHTML = '';
  const swapsSorted = state.creditSwaps.filter(s=> dentroDoPeriodo(s.createdAt)).sort((a,b)=> new Date(b.createdAt)-new Date(a.createdAt));
  if(swapsSorted.length === 0){
    swapsBody.innerHTML = '<tr><td colspan="7" class="empty-row">Nenhuma folga trocada por pagamento nesse período.</td></tr>';
  } else {
    swapsSorted.forEach(s=>{
      const emp = state.employees.find(e=>e.id===s.employeeId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${emp?emp.name:'—'}</td><td>${fmtDateBr(s.workedDate)}</td><td>${fmtDateTimeBr(s.createdAt)}</td><td>R$ ${fmtMoney(s.valor)}</td><td>${FORMA_PAGAMENTO_FOLGA_LABEL[s.forma]||s.forma}</td><td>${s.nota||'—'}</td><td class="row-actions"><button class="del" data-cancelswap="${s.id}">↩️ Cancelar troca</button></td>`;
      swapsBody.appendChild(tr);
    });
    swapsBody.querySelectorAll('[data-cancelswap]').forEach(btn=> btn.addEventListener('click', ()=> cancelSwap(btn.dataset.cancelswap)));
  }
}

// ---------- Quem está de folga (hoje / amanhã / consulta livre) ----------
const MESES_LABEL = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];

/** Colaboradores com folga agendada dentro de [dataInicio, dataFim] (inclusive), ordenado por data. */
function folgasNoIntervalo(dataInicio, dataFim){
  return state.daysOff
    .filter(d=> d.date >= dataInicio && d.date <= dataFim)
    .map(d=> ({ nome: (state.employees.find(e=>e.id===d.employeeId)||{}).name || '—', data: d.date }))
    .sort((a,b)=> a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome));
}

function renderFolgaHojeAmanha(){
  const hoje = folgasNoIntervalo(todayStr(), todayStr());
  const amanha = folgasNoIntervalo(tomorrowStr(), tomorrowStr());
  document.getElementById('folgaHojeNomes').textContent = hoje.length ? hoje.map(x=>x.nome).join(', ') : 'Ninguém';
  document.getElementById('folgaAmanhaNomes').textContent = amanha.length ? amanha.map(x=>x.nome).join(', ') : 'Ninguém';
}

function atualizarCamposConsultaFolga(){
  const tipo = document.getElementById('folgaConsultaTipo').value;
  document.getElementById('folgaConsultaDiaField').style.display = tipo==='dia' ? '' : 'none';
  document.getElementById('folgaConsultaMesField').style.display = tipo==='mes' ? '' : 'none';
  document.getElementById('folgaConsultaInicioField').style.display = tipo==='periodo' ? '' : 'none';
  document.getElementById('folgaConsultaFimField').style.display = tipo==='periodo' ? '' : 'none';
}
document.getElementById('folgaConsultaTipo').addEventListener('change', atualizarCamposConsultaFolga);

document.getElementById('folgaConsultaBtn').addEventListener('click', async ()=>{
  const tipo = document.getElementById('folgaConsultaTipo').value;
  let inicio, fim, label;

  if(tipo === 'dia'){
    inicio = fim = document.getElementById('folgaConsultaDia').value;
    if(!inicio){ await showAlert('Escolha uma data.'); return; }
    label = fmtDateBr(inicio);
  } else if(tipo === 'mes'){
    const mes = document.getElementById('folgaConsultaMes').value; // "AAAA-MM"
    if(!mes){ await showAlert('Escolha um mês.'); return; }
    const [ano, mesNum] = mes.split('-').map(Number);
    inicio = mes + '-01';
    fim = mes + '-' + pad(new Date(ano, mesNum, 0).getDate());
    label = MESES_LABEL[mesNum-1] + '/' + ano;
  } else {
    inicio = document.getElementById('folgaConsultaInicio').value;
    fim = document.getElementById('folgaConsultaFim').value;
    if(!inicio || !fim){ await showAlert('Escolha as duas datas do período.'); return; }
    if(fim < inicio){ await showAlert('A data final não pode ser antes da inicial.'); return; }
    label = fmtDateBr(inicio) + ' a ' + fmtDateBr(fim);
  }

  const lista = folgasNoIntervalo(inicio, fim);
  const el = document.getElementById('folgaConsultaResultado');
  if(lista.length === 0){
    el.innerHTML = '<div class="empty-note">Ninguém de folga em ' + label + '.</div>';
  } else {
    el.innerHTML = '<div class="footnote" style="margin:0 0 8px;">Folgas em ' + label + ':</div>' +
      lista.map(x=> '<div class="off-item"><span><span class="date">'+x.nome+'</span><span class="weekday">'+fmtDateBr(x.data)+' ('+weekdayName(x.data)+')</span></span></div>').join('');
  }
});

atualizarCamposConsultaFolga();
document.getElementById('folgaConsultaDia').value = todayStr();

