console.info("ArtBeauty V3.0.1 cargado correctamente");
const API_URL = "https://script.google.com/macros/s/AKfycbyNdSbHFgVadu08GVDlNQT5Dqat97l8pi33nVlkDBcBv1o-unYV8Gewq4Fi2NdK7ywNGw/exec";
const state = { user:null, dashboard:null, citas:[], clientas:[], servicios:[], pagos:[], configuracion:{}, calendarView:"week", calendarDate:new Date() };
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n||0));
const today = () => new Date().toISOString().slice(0,10);
const esc = v => String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const slug = v => String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"-");
const normalizeTime = value => {
  if (value === null || value === undefined || value === "") return "";
  const s = String(value).trim();

  // Normal HH:mm or HH:mm:ss
  const plain = s.match(/(?:^|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:\s|$)/);
  if (plain && !s.includes("1899-12-30")) {
    return `${String(Number(plain[1])).padStart(2,"0")}:${plain[2]}`;
  }

  // Google Sheets can return time-only cells as 1899-12-30T09:00:00...
  const sheetTime = s.match(/1899-12-30(?:T|\s)(\d{1,2}):(\d{2})/);
  if (sheetTime) return `${String(Number(sheetTime[1])).padStart(2,"0")}:${sheetTime[2]}`;

  // ISO date containing a time
  const iso = s.match(/T(\d{1,2}):(\d{2})/);
  if (iso) return `${String(Number(iso[1])).padStart(2,"0")}:${iso[2]}`;

  // Decimal fraction of a day (Sheets serial time)
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0 && n < 1) {
    const totalMinutes = Math.round(n * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2,"0")}:${String(totalMinutes % 60).padStart(2,"0")}`;
  }
  return s.slice(-8, -3);
};
const displayTime = value => {
  const t = normalizeTime(value);
  if (!t) return "";
  const [h,m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(m).padStart(2,"0")} ${suffix}`;
};

function toast(message,error=false){const t=$("toast");t.textContent=message;t.className="toast show"+(error?" error":"");clearTimeout(toast.timer);toast.timer=setTimeout(()=>t.className="toast",3200)}
function loading(on){$("loading").classList.toggle("hidden",!on)}

async function api(action,data={}){
  const params=new URLSearchParams();
  params.set("action",action);
  Object.entries(data).forEach(([k,v])=>params.set(k,typeof v==="object"?JSON.stringify(v):String(v??"")));
  let response;
  try{
    response=await fetch(API_URL,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},body:params.toString(),redirect:"follow"});
  }catch(err){throw new Error("No se pudo conectar. Revisa Internet y la implementación de Apps Script.")}
  if(!response.ok) throw new Error("Error de conexión "+response.status);
  const result=await response.json();
  if(!result.ok) throw new Error(result.error||"Ocurrió un error");
  return result.data;
}

document.addEventListener("DOMContentLoaded",()=>{
  $("todayText").textContent=new Intl.DateTimeFormat("es-MX",{dateStyle:"full"}).format(new Date());
  bindEvents(); applyTheme(localStorage.getItem("ab_theme")||"light");
  const saved=sessionStorage.getItem("ab_user");
  if(saved){try{state.user=JSON.parse(saved);showApp();loadAll();}catch{sessionStorage.removeItem("ab_user")}}
});

function bindEvents(){
  $("loginForm").addEventListener("submit",login);
  $("logoutBtn").onclick=logout;$("menuBtn").onclick=()=> $("sidebar").classList.toggle("open");
  $("refreshBtn").onclick=loadAll;
  document.querySelectorAll("[data-page]").forEach(b=>b.onclick=()=>go(b.dataset.page));
  document.querySelectorAll("[data-go]").forEach(b=>b.onclick=()=>go(b.dataset.go));
  $("newAppointmentBtn").onclick=openAppointment;$("quickAppointment").onclick=openAppointment;$("receptionNewAppointment").onclick=openAppointment;
  $("newClientBtn").onclick=openClient;$("quickClient").onclick=openClient;$("receptionNewClient").onclick=openClient;
  $("newServiceBtn").onclick=openService;
  $("newPaymentBtn").onclick=openPayment;$("quickPayment").onclick=openPayment;$("receptionPayment").onclick=openPayment;
  $("receptionCheckIn").onclick=openCheckIn;
  $("appointmentSearch").oninput=renderAppointments;$("appointmentDateFilter").onchange=renderAppointments;$("appointmentStatusFilter").onchange=renderAppointments;
  $("calendarPrev").onclick=()=>moveCalendar(-1);$("calendarNext").onclick=()=>moveCalendar(1);$("calendarToday").onclick=()=>{state.calendarDate=new Date();renderAppointments()};
  document.querySelectorAll("[data-calendar-view]").forEach(b=>b.onclick=()=>{state.calendarView=b.dataset.calendarView;document.querySelectorAll("[data-calendar-view]").forEach(x=>x.classList.toggle("active",x===b));renderAppointments()});
  $("clientSearch").oninput=renderClients;
  $("modalClose").onclick=closeModal;$("modalCancel").onclick=closeModal;$("modalForm").onsubmit=saveModal;
  $("aiSend").onclick=sendAI;$("aiInput").addEventListener("keydown",e=>{if(e.key==="Enter")sendAI()});
  document.querySelectorAll(".quick-prompts button").forEach(b=>b.onclick=()=>{$("aiInput").value=b.textContent;sendAI()});
  $("themeSelect").onchange=e=>applyTheme(e.target.value);
  $("saveSettingsBtn").onclick=saveSettings;
}

async function login(e){
  e.preventDefault();loading(true);
  try{
    const user=await api("login",{usuario:$("loginUser").value,password:$("loginPassword").value});
    state.user=user;sessionStorage.setItem("ab_user",JSON.stringify(user));showApp();await loadAll();toast("Bienvenida, "+user.Nombre);
  }catch(err){toast(err.message,true)}finally{loading(false)}
}
function showApp(){
  $("loginView").classList.add("hidden");$("appView").classList.remove("hidden");
  $("userName").textContent=state.user.Nombre;$("userInitial").textContent=(state.user.Nombre||"?")[0].toUpperCase();$("roleLabel").textContent=state.user.Rol;
  const admin=/admin/i.test(state.user.Rol||"");document.querySelectorAll(".admin-only,.admin-nav").forEach(x=>x.classList.toggle("hidden",!admin));
  if(!admin && /recep/i.test(state.user.Rol||"")) go("reception");
}
function logout(){sessionStorage.clear();state.user=null;$("appView").classList.add("hidden");$("loginView").classList.remove("hidden");$("loginPassword").value=""}
function go(page){
  document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id===page));
  document.querySelectorAll("#mainNav button").forEach(x=>x.classList.toggle("active",x.dataset.page===page));
  const btn=document.querySelector(`#mainNav button[data-page="${page}"]`);$("pageTitle").textContent=btn?btn.innerText.trim():"ArtBeauty";$("sidebar").classList.remove("open");
}

async function loadAll(){
  if(!state.user)return;loading(true);
  try{
    const [dashboard,citas,clientas,servicios,pagos,config]=await Promise.all([
      api("getDashboard"),api("getCitas"),api("getClientas"),api("getServicios",{soloActivos:false}),api("getPagos"),api("getConfiguracion")
    ]);
    Object.assign(state,{dashboard,citas,clientas,servicios,pagos,configuracion:config});
    renderAll();$("apiStatus").textContent="Conectado";$("apiStatus").style.color="var(--success)";
  }catch(err){toast(err.message,true);$("apiStatus").textContent="Sin conexión";$("apiStatus").style.color="var(--danger)"}finally{loading(false)}
}
function renderAll(){renderDashboard();renderAppointments();renderClients();renderServices();renderPayments();renderReception();renderSettings();renderAIRecommendations()}

function renderDashboard(){
  const d=state.dashboard||{};$("statToday").textContent=d.citasHoy||0;$("statClients").textContent=d.clientasRegistradas||0;$("statIncome").textContent=money(d.ingresosTotales);$("statProfit").textContent=money(d.gananciaEstimada);
  $("smartGreeting").textContent=`Hola, ${state.user.Nombre} 👋`;$("smartSummary").textContent=d.citasHoy?`Tienes ${d.citasHoy} cita(s) programada(s) para hoy.`:"Hoy todavía no hay citas registradas.";
  $("todayAppointments").innerHTML=listAppointments((d.proximasCitas||[]).slice(0,6));
}
function listAppointments(items){
  if(!items.length)return '<div class="empty">No hay citas para mostrar.</div>';
  return items.map(c=>`<div class="list-item"><div><strong>${esc(c.ClientaNombre)}</strong><small>${esc(displayTime(c.HoraInicio))} · ${esc(c.Servicio)}</small></div><span class="badge ${slug(c.Estado)}">${esc(c.Estado)}</span></div>`).join("");
}
function renderAppointments(){
  let items=filteredAppointments();
  const listMode=state.calendarView==="list";
  $("professionalCalendar").classList.toggle("hidden",listMode);
  $("appointmentsTable").classList.toggle("hidden",!listMode);
  updateCalendarTitle();
  if(listMode){renderAppointmentTable(items);return}
  if(state.calendarView==="month") renderMonthCalendar(items);
  else if(state.calendarView==="day") renderDayCalendar(items);
  else renderWeekCalendar(items);
}
function filteredAppointments(){
  let items=[...state.citas];const q=$("appointmentSearch").value.toLowerCase(),date=$("appointmentDateFilter").value,status=$("appointmentStatusFilter").value;
  if(q)items=items.filter(c=>`${c.ClientaNombre} ${c.Servicio}`.toLowerCase().includes(q));
  if(date)items=items.filter(c=>dateKey(c.Fecha)===date);
  if(status)items=items.filter(c=>c.Estado===status);
  return items;
}
function renderAppointmentTable(items){
  $("appointmentsTable").innerHTML=items.length?`<table><thead><tr><th>Fecha</th><th>Hora</th><th>Clienta</th><th>Servicio</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead><tbody>${items.map(c=>`<tr><td>${esc(dateKey(c.Fecha))}</td><td>${esc(displayTime(c.HoraInicio))}–${esc(displayTime(c.HoraFin))}</td><td><b>${esc(c.ClientaNombre)}</b></td><td>${esc(c.Servicio)}</td><td><span class="badge ${slug(c.Estado)}">${esc(c.Estado)}</span></td><td>${money(c.Total)}</td><td><button class="small-btn" onclick='editAppointment(${JSON.stringify(c.ID)})'>Editar</button></td></tr>`).join("")}</tbody></table>`:'<div class="empty">No hay citas registradas.</div>';
}
function dateKey(value){
  if(!value)return "";
  if(typeof value==="string" && /^\d{4}-\d{2}-\d{2}/.test(value))return value.slice(0,10);
  const d=new Date(value);return isNaN(d)?String(value).slice(0,10):localISO(d);
}
function localISO(d){const x=new Date(d);return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`}
function parseLocalDate(value){const [y,m,d]=dateKey(value).split("-").map(Number);return new Date(y,m-1,d)}
function addDays(d,n){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function startOfWeek(d){const x=new Date(d),day=x.getDay();x.setDate(x.getDate()-(day===0?6:day-1));x.setHours(0,0,0,0);return x}
function sameDate(a,b){return localISO(a)===localISO(b)}
function formatDay(d,opts){return new Intl.DateTimeFormat("es-MX",opts).format(d)}
function updateCalendarTitle(){
  const d=state.calendarDate;
  if(state.calendarView==="month")$("calendarTitle").textContent=formatDay(d,{month:"long",year:"numeric"});
  else if(state.calendarView==="day")$("calendarTitle").textContent=formatDay(d,{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  else if(state.calendarView==="list")$("calendarTitle").textContent="Todas las citas";
  else{const s=startOfWeek(d),e=addDays(s,6);$("calendarTitle").textContent=`${formatDay(s,{day:"numeric",month:"short"})} – ${formatDay(e,{day:"numeric",month:"short",year:"numeric"})}`}
}
function moveCalendar(direction){
  const d=new Date(state.calendarDate);
  if(state.calendarView==="month")d.setMonth(d.getMonth()+direction);
  else if(state.calendarView==="day")d.setDate(d.getDate()+direction);
  else if(state.calendarView==="week")d.setDate(d.getDate()+direction*7);
  else d.setMonth(d.getMonth()+direction);
  state.calendarDate=d;renderAppointments();
}
function appointmentCard(c){
  return `<article class="calendar-event status-${slug(c.Estado)}" draggable="true" data-id="${esc(c.ID)}" onclick='editAppointment(${JSON.stringify(c.ID)})' ondragstart="calendarDragStart(event)">
    <strong>${esc(displayTime(c.HoraInicio))} ${esc(c.ClientaNombre||"")}</strong>
    <span>${esc(c.Servicio||"")}</span>
    <small>${esc(c.Empleada||"")} · ${esc(c.Estado||"")}</small>
  </article>`;
}
function dayEvents(items,d){return items.filter(c=>dateKey(c.Fecha)===localISO(d)).sort((a,b)=>normalizeTime(a.HoraInicio).localeCompare(normalizeTime(b.HoraInicio)))}
function renderMonthCalendar(items){
  const base=new Date(state.calendarDate.getFullYear(),state.calendarDate.getMonth(),1),first=startOfWeek(base);
  const heads=["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"].map(x=>`<div class="calendar-weekday">${x}</div>`).join("");
  let cells="";
  for(let i=0;i<42;i++){
    const d=addDays(first,i),events=dayEvents(items,d),outside=d.getMonth()!==base.getMonth();
    cells+=`<div class="calendar-day ${outside?"outside":""} ${sameDate(d,new Date())?"today":""}" data-date="${localISO(d)}" ondragover="event.preventDefault()" ondrop="calendarDrop(event)" onclick="calendarEmptyClick(event)">
      <div class="calendar-day-number">${d.getDate()}</div>
      <div class="calendar-day-events">${events.slice(0,4).map(appointmentCard).join("")}${events.length>4?`<button class="more-events" onclick="openDayFromCalendar(event,'${localISO(d)}')">+${events.length-4} más</button>`:""}</div>
    </div>`;
  }
  $("professionalCalendar").innerHTML=`<div class="month-calendar">${heads}${cells}</div>`;
}
function renderWeekCalendar(items){
  const start=startOfWeek(state.calendarDate);
  const days=Array.from({length:7},(_,i)=>addDays(start,i));
  $("professionalCalendar").innerHTML=`<div class="week-calendar">${days.map(d=>`<div class="week-day ${sameDate(d,new Date())?"today":""}" data-date="${localISO(d)}" ondragover="event.preventDefault()" ondrop="calendarDrop(event)" onclick="calendarEmptyClick(event)">
    <header><span>${formatDay(d,{weekday:"short"})}</span><b>${d.getDate()}</b></header>
    <div class="week-day-body">${dayEvents(items,d).map(appointmentCard).join("")||'<span class="empty-day">Disponible</span>'}</div>
  </div>`).join("")}</div>`;
}
function renderDayCalendar(items){
  const d=new Date(state.calendarDate),events=dayEvents(items,d);
  const hours=Array.from({length:13},(_,i)=>i+8);
  $("professionalCalendar").innerHTML=`<div class="day-calendar" data-date="${localISO(d)}" ondragover="event.preventDefault()" ondrop="calendarDrop(event)">
    ${hours.map(h=>{const hs=String(h).padStart(2,"0")+":00";const hourEvents=events.filter(c=>Number((normalizeTime(c.HoraInicio)||"0:00").split(":")[0])===h);return `<div class="hour-row" onclick="calendarHourClick(event,'${localISO(d)}','${hs}')"><time>${h>12?h-12:h}:00 ${h>=12?"PM":"AM"}</time><div>${hourEvents.map(appointmentCard).join("")}</div></div>`}).join("")}
  </div>`;
}
window.calendarDragStart=e=>{e.dataTransfer.setData("text/plain",e.currentTarget.dataset.id);e.dataTransfer.effectAllowed="move";e.stopPropagation()};
window.calendarDrop=async e=>{
  e.preventDefault();e.stopPropagation();const id=e.dataTransfer.getData("text/plain"),target=e.currentTarget.closest("[data-date]");if(!id||!target)return;
  const c=state.citas.find(x=>String(x.ID)===String(id));if(!c||dateKey(c.Fecha)===target.dataset.date)return;
  loading(true);
  try{await api("updateCita",{...c,Fecha:target.dataset.date,usuarioActual:state.user.Nombre});toast(`Cita movida al ${target.dataset.date}`);await loadAll()}
  catch(err){toast(err.message,true)}finally{loading(false)}
};
window.calendarEmptyClick=e=>{if(e.target.closest(".calendar-event,.more-events"))return;const cell=e.currentTarget;openAppointment({Fecha:cell.dataset.date})};
window.calendarHourClick=(e,date,hour)=>{if(e.target.closest(".calendar-event"))return;const end=String(Number(hour.slice(0,2))+1).padStart(2,"0")+":00";openAppointment({Fecha:date,HoraInicio:hour,HoraFin:end})};
window.openDayFromCalendar=(e,date)=>{e.stopPropagation();state.calendarDate=parseLocalDate(date);state.calendarView="day";document.querySelectorAll("[data-calendar-view]").forEach(x=>x.classList.toggle("active",x.dataset.calendarView==="day"));renderAppointments()};

function renderClients(){
  const q=$("clientSearch").value.toLowerCase();const items=state.clientas.filter(c=>`${c.Nombre} ${c.Telefono} ${c.Instagram}`.toLowerCase().includes(q));
  $("clientsGrid").innerHTML=items.length?items.map(c=>`<article class="client-card"><strong>${esc(c.Nombre)}</strong><p class="muted">${esc(c.Telefono||"Sin teléfono")}<br>${esc(c.Instagram||"")}</p><small>${esc(c.ServiciosFavoritos||c.Notas||"Sin notas")}</small><div class="card-actions"><button class="small-btn" onclick='editClient(${JSON.stringify(c.ID)})'>Editar</button></div></article>`).join(""):'<div class="empty">No hay clientas registradas.</div>';
}
function renderServices(){
  $("servicesGrid").innerHTML=state.servicios.length?state.servicios.map(s=>`<article class="service-card"><strong>${esc(s.Servicio)}</strong><p class="muted">${esc(s.Categoria)} · ${Number(s.DuracionMinutos||0)} min</p><div class="price">${s.PrecioDesde?"Desde ":""}${money(s.Precio)}</div><span class="badge ${s.Activo===true||String(s.Activo).toLowerCase()==="true"?"confirmada":"cancelada"}">${s.Activo===true||String(s.Activo).toLowerCase()==="true"?"Activo":"Inactivo"}</span></article>`).join(""):'<div class="empty">No hay servicios.</div>';
}
function renderPayments(){
  const total=state.pagos.reduce((a,p)=>a+Number(p.Total||0),0),tips=state.pagos.reduce((a,p)=>a+Number(p.Propina||0),0),balance=state.pagos.reduce((a,p)=>a+Number(p.Saldo||0),0);
  $("paymentTotal").textContent=money(total);$("tipTotal").textContent=money(tips);$("balanceTotal").textContent=money(balance);
  $("paymentsTable").innerHTML=state.pagos.length?`<table><thead><tr><th>Fecha</th><th>Cita</th><th>Total</th><th>Depósito</th><th>Saldo</th><th>Propina</th><th>Método</th></tr></thead><tbody>${state.pagos.map(p=>`<tr><td>${esc(String(p.Fecha).slice(0,10))}</td><td>${esc(p.CitaID||"—")}</td><td>${money(p.Total)}</td><td>${money(p.Deposito)}</td><td>${money(p.Saldo)}</td><td>${money(p.Propina)}</td><td>${esc(p.MetodoPago)}</td></tr>`).join("")}</tbody></table>`:'<div class="empty">No hay pagos registrados.</div>';
}
function renderReception(){const items=state.citas.filter(c=>String(c.Fecha).slice(0,10)===today());$("receptionAppointments").innerHTML=listAppointments(items)}
function renderSettings(){const c=state.configuracion;$("businessName").value=c.NEGOCIO_NOMBRE||"ArtBeauty";$("businessPhone").value=c.TELEFONO||"";$("businessInstagram").value=c.INSTAGRAM||"@artbeauty.queen";$("businessAddress").value=c.DIRECCION||""}
function renderAIRecommendations(){const d=state.dashboard||{};$("aiRecommendations").innerHTML=`<div class="list-item"><div><strong>${d.citasPendientes||0} citas pendientes</strong><small>Revisa confirmaciones.</small></div></div><div class="list-item"><div><strong>${money(d.gananciaEstimada)}</strong><small>Ganancia estimada registrada.</small></div></div>`}

let modalMode="",editingId="";
function openModal(title,body,mode,id=""){modalMode=mode;editingId=id;$("modalTitle").textContent=title;$("modalBody").innerHTML=body;$("modal").showModal()}
function closeModal(){$("modal").close();modalMode="";editingId=""}
const field=(label,name,value="",type="text",wide=false,extra="")=>`<label class="${wide?"wide":""}">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
function selectField(label,name,options,value="",wide=false){return `<label class="${wide?"wide":""}">${label}<select name="${name}">${options.map(o=>`<option ${String(o)===String(value)?"selected":""}>${esc(o)}</option>`).join("")}</select></label>`}

function openAppointment(c={}){
  const clients=state.clientas.map(x=>x.Nombre),services=state.servicios.filter(x=>String(x.Activo).toLowerCase()!=="false").map(x=>x.Servicio);
  openModal(c.ID?"Editar cita":"Nueva cita",
    field("Fecha","Fecha",dateKey(c.Fecha||today()),"date")+field("Hora de inicio","HoraInicio",normalizeTime(c.HoraInicio)||"09:00","time")+
    field("Hora final","HoraFin",normalizeTime(c.HoraFin)||"10:00","time")+`<label>Clienta<input name="ClientaNombre" list="clientList" value="${esc(c.ClientaNombre||"")}" required><datalist id="clientList">${clients.map(x=>`<option>${esc(x)}</option>`).join("")}</datalist></label>`+
    `<label>Servicio<input name="Servicio" list="serviceList" value="${esc(c.Servicio||"")}" required><datalist id="serviceList">${services.map(x=>`<option>${esc(x)}</option>`).join("")}</datalist></label>`+
    field("Empleada","Empleada",c.Empleada||"Lizbeth")+selectField("Estado","Estado",["Pendiente","Confirmada","En servicio","Completada","Cancelada","No se presentó","Lista de espera"],c.Estado||"Pendiente")+
    field("Precio base","PrecioBase",c.PrecioBase||0,"number",false,'step="0.01"')+field("Cargo mismo día","CargoMismoDia",c.CargoMismoDia||0,"number",false,'step="0.01"')+field("Descuento","Descuento",c.Descuento||0,"number",false,'step="0.01"')+
    `<label class="wide">Notas<textarea name="Notas">${esc(c.Notas||"")}</textarea></label>`,
    c.ID?"updateCita":"saveCita",c.ID||"");
}
window.editAppointment=id=>{const c=state.citas.find(x=>x.ID===id);if(c)openAppointment(c)};
function openClient(c={}){openModal(c.ID?"Editar clienta":"Nueva clienta",field("Nombre","Nombre",c.Nombre||"")+field("Teléfono","Telefono",c.Telefono||"","tel")+field("Instagram","Instagram",c.Instagram||"")+field("Email","Email",c.Email||"","email")+field("Alergias","Alergias",c.Alergias||"", "text",true)+field("Colores favoritos","ColoresFavoritos",c.ColoresFavoritos||"")+field("Diseños favoritos","DisenosFavoritos",c.DisenosFavoritos||"")+field("Servicios favoritos","ServiciosFavoritos",c.ServiciosFavoritos||"", "text",true)+`<label class="wide">Notas<textarea name="Notas">${esc(c.Notas||"")}</textarea></label>`,c.ID?"updateClienta":"saveClienta",c.ID||"")}
window.editClient=id=>{const c=state.clientas.find(x=>x.ID===id);if(c)openClient(c)};
function openService(){openModal("Nuevo servicio",field("Servicio","Servicio")+field("Precio","Precio",0,"number",false,'step="0.01"')+field("Duración en minutos","DuracionMinutos",60,"number")+selectField("Categoría","Categoria",["Uñas","Pedicure","Cabello","Faciales","Depilación","Masajes","Combos","Otros"],"Uñas"),"saveServicio")}
function openPayment(){openModal("Registrar pago",field("Fecha","Fecha",today(),"date")+field("ID de cita","CitaID")+field("ID de clienta","ClientaID")+field("Total","Total",0,"number",false,'step="0.01"')+field("Depósito","Deposito",0,"number",false,'step="0.01"')+field("Propina","Propina",0,"number",false,'step="0.01"')+selectField("Método","MetodoPago",["Efectivo","Zelle","Tap to Pay","Tarjeta","Otro"],"Efectivo")+`<label class="wide">Notas<textarea name="Notas"></textarea></label>`,"savePago")}
function openCheckIn(){
  const todayCitas=state.citas.filter(c=>String(c.Fecha).slice(0,10)===today()&&!["Cancelada","Completada"].includes(c.Estado));
  if(!todayCitas.length)return toast("No hay citas pendientes para hoy.",true);
  openModal("Confirmar llegada",selectField("Cita","ID",todayCitas.map(c=>`${c.ID} | ${displayTime(c.HoraInicio)} | ${c.ClientaNombre}`),"",true),"checkin");
}
async function saveModal(e){
  e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());data.usuarioActual=state.user.Nombre;if(editingId)data.ID=editingId;
  if(modalMode==="checkin"){data.ID=(data.ID||"").split(" | ")[0];data.Estado="En servicio";modalMode="updateCita"}
  loading(true);try{await api(modalMode,data);closeModal();toast("Guardado correctamente");await loadAll()}catch(err){toast(err.message,true)}finally{loading(false)}
}

async function saveSettings(){
  const pairs=[["NEGOCIO_NOMBRE",$("businessName").value],["TELEFONO",$("businessPhone").value],["INSTAGRAM",$("businessInstagram").value],["DIRECCION",$("businessAddress").value]];
  loading(true);try{for(const [Clave,Valor] of pairs)await api("saveConfiguracion",{Clave,Valor,usuarioActual:state.user.Nombre});toast("Configuración guardada");await loadAll()}catch(err){toast(err.message,true)}finally{loading(false)}
}
function applyTheme(theme){localStorage.setItem("ab_theme",theme);const dark=theme==="dark"||(theme==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);document.body.classList.toggle("dark",dark);if($("themeSelect"))$("themeSelect").value=theme}
function sendAI(){
  const input=$("aiInput"),q=input.value.trim();if(!q)return;addMessage(q,"user");input.value="";const s=q.toLowerCase(),d=state.dashboard||{};let answer;
  if(s.includes("hoy")&&s.includes("cita"))answer=`Hay ${d.citasHoy||0} cita(s) para hoy.`;
  else if(s.includes("vend")||s.includes("ingreso"))answer=`Los ingresos registrados son ${money(d.ingresosTotales)}.`;
  else if(s.includes("client"))answer=`Hay ${d.clientasRegistradas||0} clientas registradas.`;
  else if(s.includes("servicio")&&s.includes("más")){const counts={};state.citas.forEach(c=>counts[c.Servicio]=(counts[c.Servicio]||0)+1);const top=Object.entries(counts).sort((a,b)=>b[1]-a[1])[0];answer=top?`El servicio más registrado es ${top[0]} con ${top[1]} cita(s).`:"Todavía no hay suficientes citas para calcularlo.";}
  else answer="Puedo responder sobre citas de hoy, ingresos, clientas y servicios registrados.";
  setTimeout(()=>addMessage(answer,"bot"),250);
}
function addMessage(text,type){const box=$("aiMessages"),div=document.createElement("div");div.className="message "+type;div.textContent=text;box.appendChild(div);box.scrollTop=box.scrollHeight}
