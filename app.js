const API_URL = "https://script.google.com/macros/s/AKfycbyNdSbHFgVadu08GVDlNQT5Dqat97l8pi33nVlkDBcBv1o-unYV8Gewq4Fi2NdK7ywNGw/exec";
const state = { user:null, dashboard:null, citas:[], clientas:[], servicios:[], pagos:[], configuracion:{} };
const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(Number(n||0));
const today = () => new Date().toISOString().slice(0,10);
const esc = v => String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const slug = v => String(v||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g,"-");

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
  return items.map(c=>`<div class="list-item"><div><strong>${esc(c.ClientaNombre)}</strong><small>${esc(c.HoraInicio)} · ${esc(c.Servicio)}</small></div><span class="badge ${slug(c.Estado)}">${esc(c.Estado)}</span></div>`).join("");
}
function renderAppointments(){
  let items=[...state.citas];const q=$("appointmentSearch").value.toLowerCase(),date=$("appointmentDateFilter").value,status=$("appointmentStatusFilter").value;
  if(q)items=items.filter(c=>`${c.ClientaNombre} ${c.Servicio}`.toLowerCase().includes(q));if(date)items=items.filter(c=>String(c.Fecha).slice(0,10)===date);if(status)items=items.filter(c=>c.Estado===status);
  $("appointmentsTable").innerHTML=items.length?`<table><thead><tr><th>Fecha</th><th>Hora</th><th>Clienta</th><th>Servicio</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead><tbody>${items.map(c=>`<tr><td>${esc(String(c.Fecha).slice(0,10))}</td><td>${esc(c.HoraInicio)}–${esc(c.HoraFin)}</td><td><b>${esc(c.ClientaNombre)}</b></td><td>${esc(c.Servicio)}</td><td><span class="badge ${slug(c.Estado)}">${esc(c.Estado)}</span></td><td>${money(c.Total)}</td><td><button class="small-btn" onclick='editAppointment(${JSON.stringify(c.ID)})'>Editar</button></td></tr>`).join("")}</tbody></table>`:'<div class="empty">No hay citas registradas.</div>';
}
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
    field("Fecha","Fecha",String(c.Fecha||today()).slice(0,10),"date")+field("Hora de inicio","HoraInicio",c.HoraInicio||"09:00","time")+
    field("Hora final","HoraFin",c.HoraFin||"10:00","time")+`<label>Clienta<input name="ClientaNombre" list="clientList" value="${esc(c.ClientaNombre||"")}" required><datalist id="clientList">${clients.map(x=>`<option>${esc(x)}</option>`).join("")}</datalist></label>`+
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
  openModal("Confirmar llegada",selectField("Cita","ID",todayCitas.map(c=>`${c.ID} | ${c.HoraInicio} | ${c.ClientaNombre}`),"",true),"checkin");
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
