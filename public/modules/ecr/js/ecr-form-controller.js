import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { showToast } from '../../shared/ui.js';

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
    function collectData(){
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
      {key:'ingenieriaProducto', title:'INGENIERÍA PRODUCTO', checklist:{
        noAfecta:['ESTRUCTURA DE PRODUCTO','PLANO DE VALIDACIÓN','LANZAMIENTO DE PROTÓTIPOS','EVALUADO POR EL ESPECIALISTA DE PRODUCTO','ACTUALIZAR DISEÑO 3D','ACTUALIZAR DISEÑO 2D'],
        afecta:['ACTUALIZAR DFMEA','COPIA DE ESTA ECR PARA OTRO SITIO?','NECESITA PIEZA DE REPOSICIÓN']
      }, extras:'DISENO', design:true},
      {key:'ingenieriaManufactura', title:'INGENIERÍA MANUFACTURA Y PROCESO', checklist:{
        noAfecta:['HACER RUN A RATE','ACTUALIZAR DISEÑO MANUFACTURA','LAY OUT','AFECTA EQUIPAMIENTO','ACTUALIZAR INSTRUCCIONES , FLUJOGRAMAS','ACTUALIZAR PFMEA','POKA YOKES','ACTUALIZAR TIEMPOS'],
        afecta:['CAPACIDAD DE PERSONAL','AFECTA A S&R  / HSE']
      }, note:'En las instrucciones se coloca la nueva cinta a utilizar con nuevas fotos.'},
      {key:'hse', title:'HSE', checklist:{
        noAfecta:['CHECK LIST DE LIB DE MAQUINA','COMUNICAR ORGÃO AMBIENTAL','COMUNICACIÓN MINISTERIO DE TRABAJO'],
        afecta:[]
      }},
      {key:'calidad', title:'CALIDAD', checklist:{
        noAfecta:['AFECTA DIMENSIONAL CLIENTE ?','AFECTA FUNCIONAL E MONTABILIDADE?','ACTUALIZAR PLANO DE CONTROLES/ INSTRUCCIONES','AFECTA ASPECTO/ACTUALIZAR BIBLIA DE DEFEITOS/PÇ PATRON?','AFECTA CAPABILIDADE (AFECTA CAPACIDAD)','MODIFICAR DISPOSITIVO DE CONTROLE E SEU MODO DE CONTROLE'],
        afecta:['NUEVO ESTUDIO DE MSA / CALIBRACIÓN','NECESITA VALIDACIÓN (PLANO DEBE ESTAR EN ANEXO)','NECESARIO NUEVO PPAP/PSW CLIENTE','ANALISIS DE MATERIA PRIMA','IMPLEMENTAR MURO DE CALIDAD IMPLEMENTADO (APLICADO)','NECESITA AUDITORIA S&R','AFECTA POKA-YOKE?','AFECTA AUDITORIA DE PRODUCTO?']
      }},
      {key:'compras', title:'COMPRAS', special:'compras'},
      {key:'calidadProveedores', title:'CALIDAD PROVEEDORES', checklist:{
        noAfecta:['NECESITA NUEVO PSW PROVEEDOR - FECHA LIMITE: ___/___/___','AFECTA LAY OUT','AFECTA EMBALAJE','AFECTA DISPOSITIVO CONTROL PROVEEDOR','AFECTA SUBPROVEEDOR'],
        afecta:['NECESITA DE ASISTENTE']
      }},
      {key:'te', title:'Tooling & Equipaments (T&E)', checklist:{
        noAfecta:['AFECTA HERRAMIENTA','ANALISIS TECNICA DE ALTERACIÓN','OTROS IMPACTOS CAUSADOS POR LA ALTERACION NO HERRAMENTAL'],
        afecta:[]
      }},
      {key:'logistica', title:'LOGÍSTICA Y PC&L', checklist:{
        noAfecta:['PARAMETROS LOGISTICOS / ITEMS NUEVOS','GESTION DE STOCK (PIEZA ANTIGUA/NUEVA)','NECESITA DE STOCK DE SEGURIDAD','NUEVO PROTOCOLO LOGISTICO'],
        afecta:['AFECTA EMBALAJE']
      }},
      {key:'pcl', title:'PC&L', checklist:{
        noAfecta:['ALTERA PROGRAMA P/ PROVEEDOR (PIEZA NUEVA/ANTIGUA)','IMPACTO POST VENTA'],
        afecta:['IMPACTO MOI/MOD']
      }},
      {key:'finanzas', title:'FINANCIERO / COSTING', checklist:{
        noAfecta:['BUSINESS PLAN','BOA - BUSINESS OPORTUNITY','MoB - ANALISYS','PAYBACK / UPFRONT'],
        afecta:[]
      }},
      {key:'comercial', title:'COMERCIAL', checklist:{
        noAfecta:['NECESARIO RENEGOCIAR CON EL CLIENTE','IMPACTO POST VENTA ANALISADO','NECESARIA NUEVA ORDEN DE VENTA AL CLIENTE','NEGOCIACIÓN DE OBSOLETOS'],
        afecta:[]
      }},
      {key:'mantenimiento', title:'MANTENIMIENTO', checklist:{
        noAfecta:['PROYETO PRESENTA VIABILIDAD TÉCNICA / TÉCNLOGICA','NECESITA AQUISICION DE MATERIALES/EQUIPAMIENTOS','NECESIDAD /DISPONIBILIDAD DE ENERGIAS:ELECTRICA,','NEUMÁTICA E HIDRAULICA','CREACION/ALTERACIÓN DE MANTENIMIENTO PREVENTIVAS','NECESITA REGISTRO DE NUEVOS ITEMS EM ALMACÉN'],
        afecta:[]
      }},
      {key:'produccion', title:'PRODUCCIÓN', checklist:{
        noAfecta:['AFECTA INSTRUCCION DE TRABAJO (SW)','AFECTA LIBERACION DE PROCESO (SET UP)','IMPACTO MOD / MOI','CAPACITACION'],
        afecta:['AFECTA ALTERACIÓN DE PLANO DE CORTE']
      }},
      {key:'calidadCliente', title:'CALIDAD CLIENTE', checklist:{
        noAfecta:['NECESITA APROVACIÓN CLIENTE EXTERNO','NECESARIO APROVACIÓN CLIENTE INTERNO','ECR SOBRE DESVIO Nº: _____________________________________','OTROS: ________________________________________________'],
        afecta:[]
      }}
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

        // special compras
        if(cfg.special==='compras'){
          body.innerHTML=`<div class=grid style="grid-template-columns:repeat(3,1fr);gap:10px">
            <div><label>PIEZA Actual</label><div class="checkrow">
              <label class=chip><input type=checkbox data-name="departamentos.${cfg.key}.piezaActual.nacional"> PIEZA NACIONAL</label>
              <label class=chip><input type=checkbox data-name="departamentos.${cfg.key}.piezaActual.importada"> PIEZA IMPORTADA</label>
              <label class=chip>PROVEEDOR:<input type=text data-name="departamentos.${cfg.key}.piezaActual.proveedor" style="margin-left:8px"></label>
            </div></div>
            <div><label>PIEZA Propuesta</label><div class="checkrow">
              <label class=chip><input type=checkbox data-name="departamentos.${cfg.key}.piezaProp.nacional"> PIEZA NACIONAL</label>
              <label class=chip><input type=checkbox data-name="departamentos.${cfg.key}.piezaProp.importada"> PIEZA IMPORTADA</label>
              <label class=chip>PROVEEDOR:<input type=text data-name="departamentos.${cfg.key}.piezaProp.proveedor" style="margin-left:8px"></label>
            </div></div>
            <div><label>Modificación</label><div class="checkrow">
              <label class=chip><input type=checkbox data-name="departamentos.${cfg.key}.mod.reversible"> REVERSIBLE</label>
              <label class=chip><input type=checkbox data-name="departamentos.${cfg.key}.mod.irreversible"> IRREVERSIBLE</label>
            </div></div>
          </div>
          <div class="section-title" style="margin-top:10px">Checklist</div>
          <div class=checkrow>
            ${['COSTOS EVALUADOS','PEDIDO COMPRA PROTOTIPOS','PEDIDO COMPRA TOOLING','AFECTA HERRAMIENTA DE PROVEEDOR','NECESARIO ENVIAR DISEÑO P/ PROVEEDOR','IMPACTO POST VENTA ANALISADO'].map(txt=>`<label class=chip><input type=checkbox data-name="departamentos.${cfg.key}.checklist.${txt}"> ${txt}</label>`).join('')}
          </div>
          ${signatureBlock(cfg.key)}
          `;
        } else {
          // generic block
          const ck=(arr,prefix)=>arr.map(txt=>{
            if(cfg.key==='calidadCliente'){
              if(txt.includes('ECR SOBRE DESVIO')){
                return `<label class=chip>
                  <input type=checkbox data-enhance="with-text" data-name="departamentos.${cfg.key}.checklist.${prefix}.desvio"> ECR SOBRE DESVÍO Nº:
                  <input type=text class="chip-inline" data-name="departamentos.${cfg.key}.campos.desvio" placeholder="N° de desvío" style="margin-left:6px;display:none" disabled>
                </label>`;
              }
              if(txt.startsWith('OTROS')){
                return `<label class=chip>
                  <input type=checkbox data-enhance="with-text" data-name="departamentos.${cfg.key}.checklist.${prefix}.otros"> OTROS:
                  <input type=text class="chip-inline" data-name="departamentos.${cfg.key}.campos.otros" placeholder="Especificar" style="margin-left:6px;display:none" disabled>
                </label>`;
              }
            }
            return `<label class=chip><input type=checkbox data-name="departamentos.${cfg.key}.checklist.${prefix}.${txt}"> ${txt}</label>`;
          }).join('');
          body.innerHTML = `
            ${cfg.design?designTable(cfg.key):''}
            <div class="flex">
              <div class="w-100">
                <label>Comentarios Generales y Justificativos:</label>
                <textarea data-name="departamentos.${cfg.key}.comentarios">${cfg.note||''}</textarea>
              </div>
            </div>
            <div class="section-title">Checklist</div>
            <div class="checkrow">${ck(cfg.checklist.noAfecta||[], 'noAfecta')}</div>
            <div style="height:6px"></div>
            <div class="checkrow">${ck(cfg.checklist.afecta||[], 'afecta')}</div>
            ${signatureBlock(cfg.key)}
          `;
        }
        item.appendChild(body); wrap.appendChild(item); body.style.display='none';
      });
      // hydrate from seed if provided
      if(seed){ Object.entries(seed).forEach(([k,v])=>{ for(const [path,val] of Object.entries(flatten(v,`departamentos.${k}`))){ const el=document.querySelector(`[data-name="${path}"]`); if(el){ if(el.type==='checkbox') el.checked=!!val; else el.value=val; } } }); }
      // abrir por defecto los 3 primeros para guiar al usuario
      document.querySelectorAll('#dept-accordion .acc-item').forEach((it,idx)=>{ if(idx<3){ it.classList.add('open'); const b=it.querySelector('.acc-body'); if(b) b.style.display='block'; } });
      // inicializar chips con input condicional
      initChipEnhancements();
    }
    function designTable(key){
      return `<div class="section-title">DISEÑO</div>
      <table><thead><tr><th>Componente</th><th>Ref. actual / IND</th><th>Ref. nueva / IND</th><th>QTD./Carro</th><th>Costo cliente</th><th>Costo Barack</th><th>Costo proveedor</th><th>Afecta al cliente</th><th>Afecta S&R</th></tr></thead>
      <tbody>
        <tr>
          <td><input type=text data-name="departamentos.${key}.diseno.componente"></td>
          <td><input type=text data-name="departamentos.${key}.diseno.refActual"></td>
          <td><input type=text data-name="departamentos.${key}.diseno.refNueva"></td>
          <td><input type=text data-name="departamentos.${key}.diseno.qtd"></td>
          <td style=text-align:center><input type=checkbox data-name="departamentos.${key}.diseno.costos.cliente"></td>
          <td style=text-align:center><input type=checkbox data-name="departamentos.${key}.diseno.costos.barack"></td>
          <td style=text-align:center><input type=checkbox data-name="departamentos.${key}.diseno.costos.proveedor"></td>
          <td style=text-align:center><input type=checkbox data-name="departamentos.${key}.diseno.costos.afectaCliente"></td>
          <td style=text-align:center><input type=checkbox data-name="departamentos.${key}.diseno.costos.afectaSR"></td>
        </tr>
      </tbody></table>`
    }
    function signatureBlock(key){
      return `<div class="mini" style="margin-top:8px">
        <div><label>OK</label><input type=checkbox data-name="departamentos.${key}.ok"></div>
        <div><label>NOK</label><input type=checkbox data-name="departamentos.${key}.nok"></div>
        <div><label>Fecha</label><input type=date data-name="departamentos.${key}.fecha"></div>
        <div><label>Nombre</label><input type=text data-name="departamentos.${key}.nombre"></div>
        <div><label>Visto</label><input type=text data-name="departamentos.${key}.visto"></div>
      </div>`
    }
    function flatten(obj,prefix=''){ const out={}; for(const [k,v] of Object.entries(obj||{})){ const key=prefix?`${prefix}.${k}`:k; if(v && typeof v==='object' && !Array.isArray(v)) Object.assign(out, flatten(v,key)); else out[key]=v; } return out; }
    function gatherDeparts(){
      const out={};
      deptConfig.forEach(cfg=>{
        const base=`departamentos.${cfg.key}`;
        const inputs=document.querySelectorAll(`[data-name^="${base}"]`);
        inputs.forEach(el=>{
          const path=el.getAttribute('data-name');
          const val=el.type==='checkbox'?el.checked:el.value;
          setPath(out, path.replace('departamentos.'+cfg.key+'.',''), val);
        });
      });
      return out;
    }

    // ---- Export/Import ----
    document.getElementById('btn-save').addEventListener('click',()=>{
      const data=collectData();
      const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`ECR_${data.meta?.ecrNumero||'nuevo'}.json`; a.click();
    });
    document.getElementById('btn-load').addEventListener('click',()=>{
      const i=document.createElement('input'); i.type='file'; i.accept='.json'; i.onchange=async()=>{ const f=i.files[0]; if(!f) return; const text=await f.text(); try{ const json=JSON.parse(text); hydrate(json); }catch(e){ alert('JSON inválido'); } }; i.click();
    });

    // Inicializar
    buildStaticTables();
    buildDepartments();
    initChipEnhancements();
    // default dates
    const today=new Date().toISOString().slice(0,10);
    document.querySelector('[data-name="meta.fechaEmision"]').value=today;
    // expand/collapse all
    const ex=document.getElementById('expand-all');
    const co=document.getElementById('collapse-all');
    if(ex&&co){
      ex.addEventListener('click',()=>{ document.querySelectorAll('#dept-accordion .acc-item').forEach(it=>{ it.classList.add('open'); const b=it.querySelector('.acc-body'); if(b) b.style.display='block'; }); });
      co.addEventListener('click',()=>{ document.querySelectorAll('#dept-accordion .acc-item').forEach(it=>{ it.classList.remove('open'); const b=it.querySelector('.acc-body'); if(b) b.style.display='none'; }); });
    }

    // chips con input dependiente de checkbox
    function initChipEnhancements(){
      function sync(chk){
        const txt=chk.closest('label').querySelector('input[type=text]');
        if(!txt) return;
        const show = chk.checked || (txt.value && txt.value.trim()!=='');
        chk.checked = show; // si hay valor, marcamos
        txt.disabled = !show;
        txt.style.display = show ? 'inline-block' : 'none';
      }
      document.querySelectorAll('input[type=checkbox][data-enhance="with-text"]').forEach(chk=>{
        sync(chk);
        chk.addEventListener('change',()=>sync(chk));
      });
    }

    // ---- Lógica de IA ----
    function showAIModal(title, onConfirm) {
        const modalId = `ai-modal-${Date.now()}`;
        const modalHTML = `
            <div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center" style="background-color: rgba(0,0,0,0.5);">
                <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4">
                    <div class="flex justify-between items-center p-5 border-b">
                        <h3 class="text-xl font-bold">${title}</h3>
                        <button data-action="close" class="text-gray-500 hover:text-gray-800">&times;</button>
                    </div>
                    <div class="p-6">
                        <textarea id="ai-input" class="w-full h-48 p-2 border rounded" placeholder="Describa la situación o el cambio requerido..."></textarea>
                    </div>
                    <div class="flex justify-end items-center p-4 border-t bg-gray-50">
                        <button data-action="close" class="btn">Cancelar</button>
                        <button id="ai-confirm-btn" class="btn primary ml-2">Generar</button>
                    </div>
                </div>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        const modalElement = document.getElementById(modalId);
        modalElement.querySelector('#ai-confirm-btn').addEventListener('click', () => {
            const text = modalElement.querySelector('#ai-input').value;
            onConfirm(text);
            modalElement.remove();
        });
        modalElement.addEventListener('click', e => {
            if (e.target.dataset.action === 'close' || e.target === modalElement) {
                modalElement.remove();
            }
        });
    }

    async function callAIFunction(functionName, data) {
        const functions = getFunctions();
        const callableFunction = httpsCallable(functions, functionName);
        try {
            const result = await callableFunction(data);
            return result.data;
        } catch (error) {
            console.error(`Error calling ${functionName}:`, error);
            showToast(`Error al contactar la IA para ${functionName}.`, 'error');
            return null;
        }
    }

    document.getElementById('btn-ai-generate').addEventListener('click', () => {
        showAIModal('Generar ECR con IA', async (text) => {
            if (!text.trim()) {
                showToast('El texto no puede estar vacío.', 'warning');
                return;
            }
            const aiData = await callAIFunction('generateEcrDraftWithAI', { text });
            if (aiData) {
                const formData = {
                    meta: {
                        proyecto: aiData.proyecto,
                        cliente: aiData.cliente,
                    },
                    codigos: {
                        barack: aiData.codigo_barack,
                        denominacion: aiData.denominacion_producto
                    },
                    situacion: {
                        existente: { descripcion: aiData.situacion_existente },
                        propuesta: { descripcion: aiData.situacion_propuesta }
                    },
                    origenPedido: {
                        CLIENTE: aiData.origen_cliente,
                        INTERNO: aiData.origen_interno
                    }
                };
                hydrate(formData);
                showToast('ECR rellenado por la IA.', 'success');
            }
        });
    });

    document.getElementById('btn-suggest-proposal').addEventListener('click', async () => {
        const situacionActual = document.querySelector('[data-name="situacion.existente.descripcion"]').value;
        if (!situacionActual.trim()) {
            showToast('La "Situación Existente" no puede estar vacía.', 'warning');
            return;
        }
        const result = await callAIFunction('generateEcrProposal', { text: situacionActual });
        if (result && result.proposal) {
            document.querySelector('[data-name="situacion.propuesta.descripcion"]').value = result.proposal;
            showToast('Propuesta generada por la IA.', 'success');
        }
    });

    document.getElementById('btn-analyze-impacts').addEventListener('click', async () => {
        const situacionActual = document.querySelector('[data-name="situacion.existente.descripcion"]').value;
        const situacionPropuesta = document.querySelector('[data-name="situacion.propuesta.descripcion"]').value;

        if (!situacionActual.trim() || !situacionPropuesta.trim()) {
            showToast('Las situaciones "Existente" y "Propuesta" deben tener contenido.', 'warning');
            return;
        }

        const result = await callAIFunction('analyzeEcrImpacts', { situacionActual, situacionPropuesta });

        if (result) {
            const impactMapping = {
                'afecta_calidad': "clasificacion.objetivos.Mejoría de calidad",
                'afecta_proceso': "clasificacion.alteraciones.Proceso",
            };
            for (const [key, dataName] of Object.entries(impactMapping)) {
                const element = document.querySelector(`[data-name="${dataName}"]`);
                if (element) {
                    element.checked = !!result[key];
                }
            }
            showToast('Análisis de impacto completado por la IA.', 'success');
        }
    });
}