import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { showToast } from '../../shared/ui.js';
import { setPath, COLLECTIONS } from "/utils.js";
import { runTransaction, doc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { db, sendNotification } from "../../../main.js";


export function getEcrFormData(){
      const data={meta:{},codigos:{},clasificacion:{objetivos:{},alteraciones:{}},situacion:{existente:{},propuesta:{}},equipo:{}};
      document.querySelectorAll('[data-name]').forEach(el=>{
        if (el.disabled) return; // <-- BUG FIX: Ignore disabled fields
        const key=el.getAttribute('data-name');
        if(el.type==='checkbox'){
          if(key.includes('origenPedido.')){
            const k=key.split('.')[1];
            setPath(data,'origenPedido.'+k,el.checked);
          }else if(key.includes('faseProyecto.')){
            const k=key.split('.')[1];
            setPath(data,'faseProyecto.'+k,el.checked);
          }else if(key.includes('clasificacion.objetivos.')||key.includes('clasificacion.alteraciones.')){
            setPath(data,key,el.checked);
          }else{
            setPath(data,key,el.checked);
          }
        }else if(el.closest('.switch')){
          // handled via switch state
        }else if(el.type==='radio'){
          if(el.checked) setPath(data,key,true);
        }else{
          setPath(data,key,el.value);
        }
      });
      // switch value
      const sw=document.querySelector('.switch[data-name="clasificacion.afectaSR"]');
      data.clasificacion.afectaSR=sw.querySelector('.active')?.dataset.val||'';
      // tablas dinámicas
      data.impactoFalla = tableToJSON('impacto-body');
      data.aprobacionCODIR = tableToJSON('codir-body');
      data.departamentos = gatherDeparts();
      return data;
    }
export function initEcrForm() {
    // ---- Utilidades JSON <-> Form ----
    function getPath(obj, path, def){
      const parts = path.split('.');
      let cur = obj;
      for(const p of parts){
        if(cur==null) return def;
        cur = cur[p];
      }
      return cur==null?def:cur;
    }
    function setPath(obj, path, value){
      const parts = path.split('.');
      let cur = obj;
      parts.forEach((p,i)=>{
        if(i===parts.length-1){cur[p]=value;}
        else{cur[p]=cur[p]||{}; cur=cur[p];}
      });
    }
    function getEcrFormData(){
      const data={meta:{},codigos:{},clasificacion:{objetivos:{},alteraciones:{}},situacion:{existente:{},propuesta:{}},equipo:{}};
      document.querySelectorAll('[data-name]').forEach(el=>{
        const key=el.getAttribute('data-name');
        if(el.type==='checkbox'){
          if(key.includes('origenPedido.')){
            const k=key.split('.')[1];
            setPath(data,'origenPedido.'+k,el.checked);
          }else if(key.includes('faseProyecto.')){
            const k=key.split('.')[1];
            setPath(data,'faseProyecto.'+k,el.checked);
          }else if(key.includes('clasificacion.objetivos.')||key.includes('clasificacion.alteraciones.')){
            setPath(data,key,el.checked);
          }else{
            setPath(data,key,el.checked);
          }
        }else if(el.closest('.switch')){
          // handled via switch state
        }else if(el.type==='radio'){
          if(el.checked) setPath(data,key,true);
        }else{
          setPath(data,key,el.value);
        }
      });
      // switch value
      const sw=document.querySelector('.switch[data-name="clasificacion.afectaSR"]');
      data.clasificacion.afectaSR=sw.querySelector('.active')?.dataset.val||'';
      // tablas dinámicas
      data.impactoFalla = tableToJSON('impacto-body');
      data.aprobacionCODIR = tableToJSON('codir-body');
      data.departamentos = gatherDeparts();
      return data;
    }
    function hydrate(data){
      document.querySelectorAll('[data-name]').forEach(el=>{
        const key=el.getAttribute('data-name');
        if(el.type==='checkbox'){
          el.checked=!!getPath(data,key,false);
        }else if(el.closest('.switch')){
          // handled below
        }else if(el.type==='radio'){
          // will keep default
        }else{
          const v=getPath(data,key,'');
          if(v!==undefined) el.value=v;
        }
      });
      // switch
      const sw=document.querySelector('.switch[data-name="clasificacion.afectaSR"]');
      const val=getPath(data,'clasificacion.afectaSR','NO');
      sw.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.val===val));
      // tablas
      if(data.impactoFalla) jsonToTable('impacto-body', data.impactoFalla);
      if(data.aprobacionCODIR) jsonToTable('codir-body', data.aprobacionCODIR);
      if(data.departamentos) buildDepartments(data.departamentos);
    }

    // ---- Tabs ----
    const tabs=document.querySelectorAll('.tab');
    tabs.forEach(t=>t.addEventListener('click',()=>{
      tabs.forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      document.querySelectorAll('.page').forEach(p=>p.hidden=true);
      document.getElementById(t.dataset.tab).hidden=false;
    }));

    // ---- Switch ----
    document.querySelectorAll('.switch').forEach(sw=>{
      sw.addEventListener('click',e=>{
        if(e.target.tagName==='BUTTON'){
          sw.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
          e.target.classList.add('active');
        }
      });
    });

    // ---- Impacto & CODIR: filas predefinidas ----
    const impactoItems=[
      ['Gerente de Calidad','RETORNO DE GARANTIA'],
      ['Gerente de calidad','RECLAMACIÓN ZERO KM'],
      ['Gerente de HSE','HSE'],
      ['Gerente de calidad','SATISFACCIÓN DEL CLIENTE'],
      ['Gerente de calidad','S/R (Seguridad y/o Reglamentación)']
    ];
    const codirItems=[
      ['Director Comercial'],
      ['Director industrial'],
      ['Otro']
    ];
    function jsonToTable(tbodyId, rows){
      const tb=document.getElementById(tbodyId); if(!tb) return; tb.innerHTML='';
      const sel = (cur)=>`
        <select>
          <option value=""></option>
          <option value="Bajo" ${cur==='Bajo'?'selected':''}>Bajo</option>
          <option value="Medio" ${cur==='Medio'?'selected':''}>Medio</option>
          <option value="Alto" ${cur==='Alto'?'selected':''}>Alto</option>
        </select>`;
      rows.forEach(r=>{
        const tr=document.createElement('tr');
        if(tbodyId==='impacto-body'){
          tr.innerHTML=`
            <td><input type="text" value="${r.responsable||''}"></td>
            <td><input type="text" value="${r.riesgo||''}"></td>
            <td>${sel(r.nivel||'')}</td>
            <td><input type="text" value="${r.observaciones||''}"></td>
            <td><input type="text" value="${r.nombre||''}"></td>
            <td><input type="date" value="${r.fecha||''}"></td>
            <td style="text-align:center"><input type="checkbox" ${r.visto?"checked":""}></td>`;
        } else {
          tr.innerHTML=`
            <td><input type="text" value="${r.miembro||''}"></td>
            <td style="text-align:center"><input type="checkbox" ${r.aprobado?"checked":""}></td>
            <td style="text-align:center"><input type="checkbox" ${r.rechazado?"checked":""}></td>
            <td><input type="text" value="${r.observaciones||''}"></td>
            <td><input type="text" value="${r.nombre||''}"></td>
            <td><input type="date" value="${r.fecha||''}"></td>
            <td style="text-align:center"><input type="checkbox" ${r.visto?"checked":""}></td>`;
        }
        tb.appendChild(tr);
      });
    }
    function tableToJSON(tbodyId){
      const tb=document.getElementById(tbodyId); const out=[]; if(!tb) return out;
      tb.querySelectorAll('tr').forEach(tr=>{
        const tds=tr.querySelectorAll('td');
        const obj={};
        if(tbodyId==='impacto-body'){
          obj.responsable=tds[0].querySelector('input').value;
          obj.riesgo=tds[1].querySelector('input').value;
          obj.nivel=(tds[2].querySelector('select')||tds[2].querySelector('input')).value;
          obj.observaciones=tds[3].querySelector('input').value;
          obj.nombre=tds[4].querySelector('input').value;
          obj.fecha=tds[5].querySelector('input').value;
          obj.visto=tds[6].querySelector('input').checked;
        } else {
          obj.miembro=tds[0].querySelector('input').value;
          obj.aprobado=tds[1].querySelector('input').checked;
          obj.rechazado=tds[2].querySelector('input').checked;
          obj.observaciones=tds[3].querySelector('input').value;
          obj.nombre=tds[4].querySelector('input').value;
          obj.fecha=tds[5].querySelector('input').value;
          obj.visto=tds[6].querySelector('input').checked;
        }
        out.push(obj);
      });
      return out;
    }
    function buildStaticTables(){
      jsonToTable('impacto-body', impactoItems.map(([r,ri])=>({responsable:r,riesgo:ri})));
      const tb=document.getElementById('codir-body'); if(!tb) return; tb.innerHTML='';
      codirItems.forEach(([m])=>{
        const tr=document.createElement('tr');
        tr.innerHTML=`<td><input type=text value="${m}"></td>
          <td style=text-align:center><input type=checkbox></td>
          <td style=text-align:center><input type=checkbox></td>
          <td><input type=text></td>
          <td><input type=text></td>
          <td><input type=date></td>
          <td style=text-align:center><input type=checkbox></td>`;
        tb.appendChild(tr);
      });
    }

    // ---- Departamentos (accordion) ----
    const deptConfig=[
      {key:'ingenieriaProducto', title:'INGENIERÍA PRODUCTO', checklist:{noAfecta:['ESTRUCTURA DE PRODUCTO','PLANO DE VALIDACIÓN','LANZAMIENTO DE PROTÓTIPOS','EVALUADO POR EL ESPECIALISTA DE PRODUCTO','ACTUALIZAR DISEÑO 3D','ACTUALIZAR DISEÑO 2D'], afecta:['ACTUALIZAR DFMEA','COPIA DE ESTA ECR PARA OTRO SITIO?','NECESITA PIEZA DE REPOSICIÓN']}, extras:'DISENO', design:true},
      {key:'ingenieriaManufactura', title:'INGENIERÍA MANUFACTURA Y PROCESO', checklist:{noAfecta:['HACER RUN A RATE','ACTUALIZAR DISEÑO MANUFACTURA','LAY OUT','AFECTA EQUIPAMIENTO','ACTUALIZAR INSTRUCCIONES , FLUJOGRAMAS','ACTUALIZAR PFMEA','POKA YOKES','ACTUALIZAR TIEMPOS'], afecta:['CAPACIDAD DE PERSONAL','AFECTA A S&R  / HSE']}, note:'En las instrucciones se coloca la nueva cinta a utilizar con nuevas fotos.'},
      {key:'hse', title:'HSE', checklist:{noAfecta:['CHECK LIST DE LIB DE MAQUINA','COMUNICAR ORGÃO AMBIENTAL','COMUNICACIÓN MINISTERIO DE TRABAJO'], afecta:[]}},
      {key:'calidad', title:'CALIDAD', checklist:{noAfecta:['AFECTA DIMENSIONAL CLIENTE ?','AFECTA FUNCIONAL E MONTABILIDADE?','ACTUALIZAR PLANO DE CONTROLES/ INSTRUCCIONES','AFECTA ASPECTO/ACTUALIZAR BIBLIA DE DEFEITOS/PÇ PATRON?','AFECTA CAPABILIDADE (AFECTA CAPACIDAD)','MODIFICAR DISPOSITIVO DE CONTROLE E SEU MODO DE CONTROLE'], afecta:['NUEVO ESTUDIO DE MSA / CALIBRACIÓN','NECESITA VALIDACIÓN (PLANO DEBE ESTAR EN ANEXO)','NECESARIO NUEVO PPAP/PSW CLIENTE','ANALISIS DE MATERIA PRIMA','IMPLEMENTAR MURO DE CALIDAD IMPLEMENTADO (APLICADO)','NECESITA AUDITORIA S&R','AFECTA POKA-YOKE?','AFECTA AUDITORIA DE PRODUCTO?']}},
      {key:'compras', title:'COMPRAS', special:'compras'},
      {key:'calidadProveedores', title:'CALIDAD PROVEEDORES', checklist:{noAfecta:['NECESITA NUEVO PSW PROVEEDOR - FECHA LIMITE: ___/___/___','AFECTA LAY OUT','AFECTA EMBALAJE','AFECTA DISPOSITIVO CONTROL PROVEEDOR','AFECTA SUBPROVEEDOR'], afecta:['NECESITA DE ASISTENTE']}},
      {key:'te', title:'Tooling & Equipaments (T&E)', checklist:{noAfecta:['AFECTA HERRAMIENTA','ANALISIS TECNICA DE ALTERACIÓN','OTROS IMPACTOS CAUSADOS POR LA ALTERACION NO HERRAMENTAL'], afecta:[]}},
      {key:'logistica', title:'LOGÍSTICA Y PC&L', checklist:{noAfecta:['PARAMETROS LOGISTICOS / ITEMS NUEVOS','GESTION DE STOCK (PIEZA ANTIGUA/NUEVA)','NECESITA DE STOCK DE SEGURIDAD','NUEVO PROTOCOLO LOGISTICO'], afecta:['AFECTA EMBALAJE']}},
      {key:'pcl', title:'PC&L', checklist:{noAfecta:['ALTERA PROGRAMA P/ PROVEEDOR (PIEZA NUEVA/ANTIGUA)','IMPACTO POST VENTA'], afecta:['IMPACTO MOI/MOD']}},
      {key:'finanzas', title:'FINANCIERO / COSTING', checklist:{noAfecta:['BUSINESS PLAN','BOA - BUSINESS OPORTUNITY','MoB - ANALISYS','PAYBACK / UPFRONT'], afecta:[]}},
      {key:'comercial', title:'COMERCIAL', checklist:{noAfecta:['NECESARIO RENEGOCIAR CON EL CLIENTE','IMPACTO POST VENTA ANALISADO','NECESARIA NUEVA ORDEN DE VENTA AL CLIENTE','NEGOCIACIÓN DE OBSOLETOS'], afecta:[]}},
      {key:'mantenimiento', title:'MANTENIMIENTO', checklist:{noAfecta:['PROYETO PRESENTA VIABILIDAD TÉCNICA / TÉCNLOGICA','NECESITA AQUISICION DE MATERIALES/EQUIPAMIENTOS','NECESIDAD /DISPONIBILILAYOUT DE ENERGIAS:ELECTRICA,','NEUMÁTICA E HIDRAULICA','CREACION/ALTERACIÓN DE MANTENIMIENTO PREVENTIVAS','NECESITA REGISTRO DE NUEVOS ITEMS EM ALMACÉN'], afecta:[]}},
      {key:'produccion', title:'PRODUCCIÓN', checklist:{noAfecta:['AFECTA INSTRUCCION DE TRABAJO (SW)','AFECTA LIBERACION DE PROCESO (SET UP)','IMPACTO MOD / MOI','CAPACITACION'], afecta:['AFECTA ALTERACIÓN DE PLANO DE CORTE']}},
      {key:'calidadCliente', title:'CALIDAD CLIENTE', checklist:{noAfecta:['NECESITA APROVACIÓN CLIENTE EXTERNO','NECESARIO APROVACIÓN CLIENTE INTERNO','ECR SOBRE DESVIO Nº: _____________________________________','OTROS: ________________________________________________'], afecta:[]}}
    ];
    function buildDepartments(seed){
      const wrap=document.getElementById('dept-accordion');
      wrap.innerHTML='';
      deptConfig.forEach(cfg=>{
        const item=document.createElement('div');
        item.className='acc-item';
        const head=document.createElement('div'); head.className='acc-head'; head.textContent=cfg.title; head.setAttribute('role','button'); head.setAttribute('tabindex','0'); item.appendChild(head);
        const body=document.createElement('div'); body.className='acc-body';
        function toggle(){ const open=item.classList.toggle('open'); body.style.display=open?'block':'none'; }
        head.addEventListener('click',toggle);
        head.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); toggle(); } });
        if(cfg.special==='compras'){
          body.innerHTML=`...`; // Omitido por brevedad
        } else {
          // ... (código omitido por brevedad)
        }
        item.appendChild(body); wrap.appendChild(item); body.style.display='none';
      });
      if(seed){ Object.entries(seed).forEach(([k,v])=>{ for(const [path,val] of Object.entries(flatten(v,`departamentos.${k}`))){ const el=document.querySelector(`[data-name="${path}"]`); if(el){ if(el.type==='checkbox') el.checked=!!val; else el.value=val; } } }); }
      document.querySelectorAll('#dept-accordion .acc-item').forEach((it,idx)=>{ if(idx<3){ it.classList.add('open'); const b=it.querySelector('.acc-body'); if(b) b.style.display='block'; } });
      initChipEnhancements();
    }
    // ... (El resto de las funciones auxiliares como designTable, signatureBlock, flatten, gatherDeparts, etc.)
    buildStaticTables();
    buildDepartments();
    initChipEnhancements();
}

export async function registerEcrApproval(ecrId, departmentId, decision, comment, deps) {
    // Inyección de dependencias para permitir el uso en la app y el mockeo en tests.
    const { appState } = deps;
    const ecrDocRef = doc(db, COLLECTIONS.ECR_FORMS, ecrId);

    try {
        await runTransaction(db, async (transaction) => {
            const ecrDoc = await transaction.get(ecrDocRef);
            if (!ecrDoc.exists()) {
                throw new Error("El documento ECR no existe.");
            }

            const ecrData = ecrDoc.data();
            const oldStatus = ecrData.status;

            // Construir el objeto de actualización para la aprobación específica del departamento.
            const approvalUpdate = {
                [`approvals.${departmentId}`]: {
                    status: decision,
                    user: appState.currentUser.name,
                    date: new Date().toISOString().split('T')[0],
                    comment: comment || ''
                }
            };

            // Crear una copia actualizada de las aprobaciones para la lógica de negocio.
            const updatedApprovals = { ...ecrData.approvals, [departmentId]: approvalUpdate[`approvals.${departmentId}`] };
            let newStatus = oldStatus; // Por defecto, el estado no cambia.

            // --- Lógica de la Máquina de Estados ---
            if (decision === 'rejected') {
                newStatus = 'rejected';
            } else if (decision === 'approved') {
                // Obtener la lista de departamentos requeridos para aprobar.
                const requiredDepartments = Object.keys(ecrData)
                    .filter(key => key.startsWith('afecta_') && ecrData[key] === true)
                    .map(key => key.replace('afecta_', ''));

                // Si no hay departamentos requeridos, se aprueba automáticamente.
                if (requiredDepartments.length === 0) {
                    newStatus = 'approved';
                } else {
                    // Verificar si TODOS los departamentos requeridos han aprobado.
                    const allRequiredApproved = requiredDepartments.every(
                        dept => updatedApprovals[dept]?.status === 'approved'
                    );
                    if (allRequiredApproved) {
                        newStatus = 'approved';
                    }
                }
            }

            // --- Actualización de Firestore ---
            const finalUpdate = { ...approvalUpdate };
            if (newStatus !== oldStatus) {
                finalUpdate.status = newStatus;
            }
            finalUpdate.lastModified = new Date();
            finalUpdate.modifiedBy = appState.currentUser.email;

            transaction.update(ecrDocRef, finalUpdate);

            // Enviar notificación si el estado final cambió a aprobado o rechazado.
            if (newStatus !== oldStatus && (newStatus === 'approved' || newStatus === 'rejected')) {
                const creatorId = ecrData.creatorUid;
                const message = `El estado del ECR "${ecrData.ecr_no}" ha cambiado a ${newStatus}.`;
                // La función de notificación real se llama aquí, pero se mockea en las pruebas.
                await sendNotification(creatorId, message, 'ecr_form', { ecrId });
            }
        });

        return { success: true };
    } catch (error) {
        console.error("Error en la transacción de aprobación de ECR:", error);
        return { success: false, error: error.message };
    }
}