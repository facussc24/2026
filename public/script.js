// script.js para la versión profesional del AMFE‑FMEA
// Esta implementación utiliza un árbol jerárquico (ítem → paso → elemento) en la
// columna izquierda y un panel de detalle en la derecha. El usuario puede
// añadir múltiples pasos por ítem, múltiples elementos (4M) por paso y
// múltiples modos de falla por elemento. La evaluación de riesgos y la
// planificación de acciones se realiza a nivel de elemento. Los datos se
// persisten en un backend Node.js vía fetch a /api/fmeas y pueden exportarse
// a Excel mediante SheetJS.

// Estado global de la aplicación
const state = {
  general: {
    orgName: '',
    tema: '',
    numeroAmfe: '',
    revisionAmfe: '',
    planta: '',
    fechaInicio: '',
    responsable: '',
    cliente: '',
    fechaRevision: '',
    confidencialidad: '',
    modelo: '',
    equipo: '',
    // Añadimos campos adicionales para la fase de planificación: número de plan de control,
    // contacto clave / teléfono y tipo de plan (Prototipo, Prelanzamiento, Producción, Lanzamiento Seguro).
    planNumber: '',
    contacto: '',
    tipoPlan: ''
    ,
    // Campos adicionales para trazabilidad del plan de control
    numParte: '',
    ultimoCambio: '',
    aprobProv: '',
    aprobIngCliente: '',
    aprobCalidadCliente: '',
    aprobOtras: '',
    safetyApproval: false
  },
  items: [], // array de ítems {id, name, steps: [...]}
  selected: {
    itemId: null,
    stepId: null,
    elementId: null
  },
  // Cabecera del plan de control (campos específicos del CP)
  controlHeader: {
    cpPhase: '',
    cpNumber: '',
    cpContact: '',
    cpDateOriginal: '',
    cpDateRevision: '',
    cpPartNumber: '',
    cpMainTeam: '',
    cpPartDescription: '',
    cpSupplierPlant: '',
    cpSupplierCode: '',
    cpApprovalSupplier: '',
    cpApprovalTechClient: '',
    cpApprovalQualityClient: '',
    cpApprovalOther: ''
  }
};

// --- Manejo de parámetros de URL y redirección ---
// Si la página index.html se abre sin un id en la URL, redirige al inicio
const urlParams = new URLSearchParams(window.location.search);
const currentDocId = urlParams.get('id');
if (!currentDocId) {
  // Redirige a la página de inicio cuando no hay id
  window.location.href = 'home.html';
}

// Generador de ID simple para ítems/steps/elements/fallas
let idCounter = 0;
function genId() {
  idCounter += 1;
  return 'id' + idCounter;
}

// Elementos de la UI
const itemList = document.getElementById('item-list');
const addItemBtn = document.getElementById('add-item');
const detailTitle = document.getElementById('detail-title');
const detailTabs = document.querySelectorAll('.detail-tab');
const detailContents = document.querySelectorAll('.detail-tab-content');
// Campos de funciones
const funcionItemField = document.getElementById('funcionItem');
const funcionPasoField = document.getElementById('funcionPaso');
const funcionElementoField = document.getElementById('funcionElemento');
// Campos de riesgos y caracteristicas
const severidadField = document.getElementById('severidad');
const ocurrenciaField = document.getElementById('ocurrencia');
const deteccionField = document.getElementById('deteccion');
const apDisplay = document.getElementById('ap-display');
const caracteristicasField = document.getElementById('caracteristicas');
const sPostField = document.getElementById('sPost');
const oPostField = document.getElementById('oPost');
const dPostField = document.getElementById('dPost');
const apPostDisplay = document.getElementById('ap-post-display');
const caracteristicasPostField = document.getElementById('caracteristicasPost');

// El campo de severidad post no debe ser editable: la severidad inicial se mantiene
sPostField.setAttribute('disabled', 'disabled');
// Campos de optimización
const accionPrevField = document.getElementById('accionPrev');
const accionDetField = document.getElementById('accionDet');
const personaRespField = document.getElementById('personaResp');
const fechaObjetivoField = document.getElementById('fechaObjetivo');
const estatusField = document.getElementById('estatus');
const accionTomadaField = document.getElementById('accionTomada');
const fechaTerminacionField = document.getElementById('fechaTerminacion');
const observacionesField = document.getElementById('observaciones');
// Fallas
const addFallaBtn = document.getElementById('add-falla');
const fallasBody = document.getElementById('fallas-body');
// Botones generales
const saveBtn = document.getElementById('save-btn');
const exportBtn = document.getElementById('export-btn');
// Plan de control
const controlBody = document.getElementById('control-body');

// Descripciones para las listas S, O y D. Estas se utilizan como tooltips en las
// opciones de los selects para ayudar al usuario a elegir valores apropiados.
const severityDescriptions = {
  1: 'Impacto insignificante o ningún efecto',
  2: 'Impacto muy bajo, apenas perceptible',
  3: 'Impacto bajo (no afecta función principal)',
  4: 'Impacto moderado (poca molestia para el cliente)',
  5: 'Impacto medio (puede causar reducción de desempeño)',
  6: 'Impacto significativo (pérdida parcial de función)',
  7: 'Impacto alto (mal funcionamiento evidente)',
  8: 'Impacto muy alto (no se cumple la función)',
  9: 'Impacto crítico (riesgo de incumplimiento normativo)',
  10: 'Impacto extremo (riesgo de seguridad o salud)'
};
const occurrenceDescriptions = {
  1: 'Extremadamente baja: falla improbable',
  2: 'Muy baja: fallo raro (≤1 en 1500)',
  3: 'Baja: fallo ocasional (1 en 1000)',
  4: 'Moderada-baja: fallo moderado (1 en 500)',
  5: 'Moderada: fallo frecuente (1 en 200)',
  6: 'Moderada-alta: fallo habitual (1 en 100)',
  7: 'Alta: fallos recurrentes (1 en 80)',
  8: 'Muy alta: fallos frecuentes (1 en 60)',
  9: 'Extremadamente alta: fallos muy frecuentes (1 en 30)',
  10: 'Prácticamente inevitable: sin controles preventivos'
};
const detectionDescriptions = {
  1: 'Poka‑yoke preventivo: imposible de producir el fallo',
  2: 'Poka‑yoke detectivo en estación: detiene el proceso',
  3: 'Detección automática en estación (poka‑yoke detectivo)',
  4: 'Detección automática post‑proceso',
  5: 'Verificación automática en línea o muestreo con R&R aceptable',
  6: 'Inspección visual/medición manual con R&R aprobado',
  7: 'Inspección visual/medición manual con baja capacidad',
  8: 'Inspección visual sin verificación o sin R&R',
  9: 'Sin método definido de detección',
  10: 'Sin detección: el fallo llegará al cliente'
};

// Inicializa los selects de 1 a 10 y añade tooltips con las descripciones
function initSODSelect(selectEl) {
  selectEl.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '';
  selectEl.appendChild(empty);
  for (let i = 1; i <= 10; i++) {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    // Asignar descripción según tipo de select
    let desc = '';
    if (selectEl.id && (selectEl.id.includes('severidad') || selectEl.id.includes('sPost'))) {
      desc = severityDescriptions[i];
    } else if (selectEl.id && (selectEl.id.includes('ocurrencia') || selectEl.id.includes('oPost'))) {
      desc = occurrenceDescriptions[i];
    } else {
      desc = detectionDescriptions[i];
    }
    opt.title = desc;
    selectEl.appendChild(opt);
  }
}

// Inicializa los tres campos S, O, D y post
['severidad', 'ocurrencia', 'deteccion', 'sPost', 'oPost', 'dPost'].forEach(id => {
  initSODSelect(document.getElementById(id));
});

// Función de cálculo de AP basada únicamente en S, O y D según las directrices AIAG‑VDA.
// En el estándar AIAG‑VDA se elimina el uso del NPR (RPN) y se prioriza la severidad.
// Esta implementación asigna prioridad alta si la severidad es muy alta (≥9) o
// si la severidad es alta (7‑8) en combinación con ocurrencia o detección muy altas.
// Para severidades medias (5‑6) se considera media cuando la ocurrencia o la detección
// son moderadas/altas. En el resto de casos se considera baja.
function computeAP(s, o, d) {
  const sv = parseInt(s) || 0;
  const oc = parseInt(o) || 0;
  const dt = parseInt(d) || 0;
  // Prioridad alta: severidad muy alta (9 o 10) siempre.
  if (sv >= 9) return 'High';
  // Para severidades altas (7‑8), si ocurrencia o detección es ≥8 se mantiene alta.
  if (sv >= 7) {
    if (oc >= 8 || dt >= 8) return 'High';
    return 'Medium';
  }
  // Severidades medias (5‑6): media si ocurrencia o detección es ≥6.
  if (sv >= 5) {
    if (oc >= 6 || dt >= 6) return 'Medium';
    return 'Low';
  }
  // Severidad baja (<5): prioridad baja.
  return 'Low';
}

// Calcula la clasificación de características especiales según las reglas AIAG‑VDA.
// Devuelve 'Crítica' cuando severidad ≥ 9, 'Significativa' cuando 5–8 y ocurrencia ≥ 4, de lo contrario ''.
function computeClassification(s, o) {
  const sv = parseInt(s) || 0;
  const oc = parseInt(o) || 0;
  if (sv >= 9) {
    return 'Crítica';
  }
  if (sv >= 5 && sv <= 8 && oc >= 4) {
    return 'Significativa';
  }
  return '';
}

// Valida los datos antes de guardar/exportar. Devuelve true si es válido.
function validateData() {
  const issues = [];
  // Validar cabecera
  const general = state.general;
  const requiredFields = ['tema', 'numeroAmfe'];
  const fieldNames = {
    tema: 'Tema',
    numeroAmfe: 'Nº de AMFE',
  };
  requiredFields.forEach(field => {
    if (!general[field] || general[field].trim() === '') {
      const label = fieldNames[field] || field;
      issues.push(`El campo "${label}" es obligatorio.`);
    }
  });
  // Validar elementos
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        // Si existen fallas en el elemento o se ha introducido cualquier función, validar S/O/D
        const hasData = el.fallas.length > 0 || el.funciones.funcionItem || el.funciones.funcionPaso || el.funciones.funcionElemento;
        if (hasData) {
          if (!el.riesgos.severidad || !el.riesgos.ocurrencia || !el.riesgos.deteccion) {
            issues.push(`Debe establecer Severidad, Ocurrencia y Detección para el elemento ${el.type} del paso "${step.name}" en el ítem "${item.name}".`);
          }
          // Si AP es alta o media, debe haber acción preventiva o detectiva o justificación en observaciones
          const ap = el.riesgos.ap;
          if (ap === 'High' || ap === 'Medium') {
            const noAccion = !el.acciones.accionPrev && !el.acciones.accionDet;
            const noJustif = !el.acciones.observaciones || el.acciones.observaciones.trim() === '';
            if (noAccion && noJustif) {
              issues.push(`Para AP ${ap === 'High' ? 'Alta' : 'Media'}, defina al menos una acción preventiva o detectiva o justifique en observaciones para el elemento ${el.type} en "${step.name}".`);
            }
          }
          // Si existe acción, debe tener responsable y fecha objetivo
          if (el.acciones.accionPrev || el.acciones.accionDet || el.acciones.accionTomada) {
            if (!el.acciones.personaResp) {
              issues.push(`Defina la persona responsable para el elemento ${el.type} en "${step.name}".`);
            }
            if (!el.acciones.fechaObjetivo) {
              issues.push(`Defina la fecha objetivo para el elemento ${el.type} en "${step.name}".`);
            }
          }
          // Aviso si fecha objetivo está vencida y estatus no completado
          if (el.acciones.fechaObjetivo) {
            const target = new Date(el.acciones.fechaObjetivo);
            const today = new Date();
            // ignore time zone: compare date parts only
            if (target.setHours(0, 0, 0, 0) < today.setHours(0, 0, 0, 0)) {
              if (el.acciones.estatus !== 'Completa' && el.acciones.estatus !== 'No implementado') {
                issues.push(`La fecha objetivo para el elemento ${el.type} en "${step.name}" ha vencido.`);
              }
            }
          }
        }
        // Validación de plan de control a nivel de elemento
        if (el.control) {
          const detVal = parseInt(el.riesgos.deteccion) || 0;
          // Plan de reacción obligatorio si la detección es muy baja (9 o 10)
          if (detVal >= 9) {
            if (!el.control.reactionPlan || el.control.reactionPlan.trim() === '') {
              issues.push(`El elemento ${el.type} en "${step.name}" requiere un plan de reacción cuando D=${el.riesgos.deteccion}.`);
            }
            // También se necesita responsable (plan de reacción usa columna 25-26). Para simplicidad, usamos personaResp
            if (!el.acciones.personaResp) {
              issues.push(`Debe asignar un responsable para el plan de reacción en el elemento ${el.type} en "${step.name}".`);
            }
          }
          // Estatus MSA debe estar definido (especialmente si D >= 5)
          if (detVal >= 5) {
            if (!el.control.msaStatus || el.control.msaStatus.trim() === '') {
              issues.push(`Debe indicar el estatus MSA para el elemento ${el.type} en "${step.name}" (detección = ${el.riesgos.deteccion}).`);
            }
          }

          // Si Ocurrencia = 1 (Extremadamente baja), debe existir un control preventivo robusto
          const occVal = parseInt(el.riesgos.ocurrencia) || 0;
          if (occVal === 1) {
            // Revisar si algún modo de falla del elemento tiene controles preventivos actuales
            let hasControlPrev = false;
            el.fallas.forEach(falla => {
              if (falla.controlesPrev && falla.controlesPrev.trim() !== '') {
                hasControlPrev = true;
              }
            });
            if (!hasControlPrev) {
              issues.push(`Para ocurrencia O=1 se requiere un control preventivo robusto (por ejemplo poka‑yoke de diseño) en el elemento ${el.type} del paso "${step.name}".`);
            }
          }
        }
        // Validar campos de verificación de Poka-Yoke
        const isPokaYoke = el.control && el.control.errorProofing && el.control.errorProofing.toLowerCase().includes('poka-yoke');
        if (isPokaYoke) {
            if (!el.control.verificationMethod || el.control.verificationMethod.trim() === '') {
                issues.push(`El campo "Método de Verificación de Efectividad" es obligatorio para Poka-Yoke en el elemento ${el.type} del paso "${step.name}".`);
            }
            if (!el.control.verificationFrequency || el.control.verificationFrequency.trim() === '') {
                issues.push(`El campo "Frecuencia de Verificación" es obligatorio para Poka-Yoke en el elemento ${el.type} del paso "${step.name}".`);
            }
            if (!el.control.reactionPlan || el.control.reactionPlan.trim() === '') {
                issues.push(`El campo "Plan de reacción" es obligatorio para Poka-Yoke en el elemento ${el.type} del paso "${step.name}".`);
            }
        }
      });
    });
  });

  // Validar aprobación de seguridad si hay características críticas
  const hasCritical = state.items.some(item => item.steps.some(step => step.elements.some(el => el.riesgos.caracteristicas === 'Crítica')));
  if (hasCritical && !state.general.safetyApproval) {
    issues.push('Debe marcar la casilla de "Aprobación de Seguridad" porque se han detectado características críticas.');
  }

  // Validar controles temporales activos (IATF 8.5.6.1.1)
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        if (el.temporaryControl && el.temporaryControl.isActive) {
          // Verificar que hay trazabilidad
          if (!el.temporaryControl.traceabilityLots || el.temporaryControl.traceabilityLots.length === 0) {
            issues.push(`Control temporal activo en ${el.type} (${step.name}) requiere registros de trazabilidad.`);
          }
          // Verificar verificaciones diarias
          const daysSinceActivation = Math.floor((new Date() - new Date(el.temporaryControl.activationDate)) / (1000 * 60 * 60 * 24));
          if (daysSinceActivation > 0 && (!el.temporaryControl.dailyVerifications || el.temporaryControl.dailyVerifications.length < daysSinceActivation)) {
            issues.push(`Control temporal activo en ${el.type} (${step.name}) requiere verificación diaria. Días activo: ${daysSinceActivation}, Verificaciones: ${el.temporaryControl.dailyVerifications?.length || 0}`);
          }
        }
        
        // Validar Pass-Through Characteristics
        if (el.supplyChain && el.supplyChain.isPassThrough) {
          if (!el.supplyChain.supplierName || el.supplyChain.supplierName.trim() === '') {
            issues.push(`Pass-Through Characteristic en ${el.type} (${step.name}) requiere especificar el proveedor.`);
          }
          if (!el.supplyChain.controlAtManufacture || el.supplyChain.controlAtManufacture.trim() === '') {
            issues.push(`Pass-Through Characteristic en ${el.type} (${step.name}) requiere especificar controles en el punto de fabricación.`);
          }
        }
        
        // Validar escalación de riesgos de alta severidad
        const severity = parseInt(el.riesgos.severidad) || 0;
        if (severity >= 9) {
          if (!el.escalation || !el.escalation.escalatedTo || el.escalation.escalatedTo.trim() === '') {
            issues.push(`Severidad crítica (${severity}) en ${el.type} (${step.name}) requiere escalación a la dirección.`);
          }
        }
      });
    });
  });

  if (issues.length > 0) {
    // Mostrar errores en resumen
    displayValidationErrors(issues);
    alert('Se encontraron los siguientes problemas:\n\n' + issues.join('\n'));
    return false;
  }
  // Sin errores, ocultar resumen
  displayValidationErrors([]);
  return true;
}

// Aplica la clase de color en función del valor S/O/D
function colorizeSelect(select) {
  const val = parseInt(select.value);
  let color = '';
  if (!val) {
    color = '';
  } else if (val >= 8) {
    color = '#ffcccc';
  } else if (val >= 5) {
    color = '#fff4b3';
  } else {
    color = '#c5f7c4';
  }
  select.style.backgroundColor = color;
}

// Muestra u oculta el resumen de errores de validación.
function displayValidationErrors(issues) {
  const container = document.getElementById('error-summary');
  if (!container) return;
  if (!issues || issues.length === 0) {
    container.innerHTML = '';
    container.style.display = 'none';
  } else {
    const ul = document.createElement('ul');
    issues.forEach(msg => {
      const li = document.createElement('li');
      li.textContent = msg;
      ul.appendChild(li);
    });
    container.innerHTML = '';
    container.appendChild(ul);
    container.style.display = 'block';
  }
}

// Actualiza visualmente la AP
function updateApDisplays() {
  const s = severidadField.value;
  const o = ocurrenciaField.value;
  const d = deteccionField.value;
  const apVal = computeAP(s, o, d);
  apDisplay.textContent = apVal;
  apDisplay.classList.remove('ap-high', 'ap-medium', 'ap-low');
  if (apVal === 'High') apDisplay.classList.add('ap-high');
  else if (apVal === 'Medium') apDisplay.classList.add('ap-medium');
  else apDisplay.classList.add('ap-low');

  // Si la severidad es muy alta (≥9) y la prioridad es Alta o Media, notificar que se requiere revisión de la dirección.
  const svVal = parseInt(s) || 0;
  if (svVal >= 9 && (apVal === 'High' || apVal === 'Medium')) {
    // Mostrar alerta informativa
    alert('Advertencia: Para severidades altas (≥9), se recomienda que la dirección revise las acciones propuestas.');
  }

  // Calcular clasificación de características y actualizar campo
  const classif = computeClassification(s, o);
  caracteristicasField.value = classif;
  // Aplicar resaltado visual a la clasificación de características especiales
  caracteristicasField.classList.remove('critica', 'significativa');
  const safetyApprovalContainer = document.getElementById('safety-approval-container');
  if (classif === 'Crítica') {
    caracteristicasField.classList.add('critica');
    safetyApprovalContainer.style.display = 'flex';
  } else if (classif === 'Significativa') {
    caracteristicasField.classList.add('significativa');
    safetyApprovalContainer.style.display = 'none';
  } else {
    safetyApprovalContainer.style.display = 'none';
  }
  // Post
  // La severidad post debe igualar siempre a la severidad original (invariabilidad de S)
  sPostField.value = severidadField.value;
  const sp = sPostField.value;
  const op = oPostField.value;
  const dp = dPostField.value;
  const apPostVal = computeAP(sp, op, dp);
  apPostDisplay.textContent = apPostVal;
  apPostDisplay.classList.remove('ap-high', 'ap-medium', 'ap-low');
  if (apPostVal === 'High') apPostDisplay.classList.add('ap-high');
  else if (apPostVal === 'Medium') apPostDisplay.classList.add('ap-medium');
  else apPostDisplay.classList.add('ap-low');
  const classifPost = computeClassification(sp, op);
  caracteristicasPostField.value = classifPost;
  // Aplicar resaltado visual a la clasificación post
  caracteristicasPostField.classList.remove('critica', 'significativa');
  if (classifPost === 'Crítica') {
    caracteristicasPostField.classList.add('critica');
  } else if (classifPost === 'Significativa') {
    caracteristicasPostField.classList.add('significativa');
  }
  // Color S/O/D selects
  [severidadField, ocurrenciaField, deteccionField, sPostField, oPostField, dPostField].forEach(select => colorizeSelect(select));

  // Actualizar el plan de control para reflejar cambios en clasificaciones
  updateControlPlan();
}

// Registra cambios en S/O/D y AP
[severidadField, ocurrenciaField, deteccionField, sPostField, oPostField, dPostField].forEach(sel => {
  sel.addEventListener('change', () => {
    updateApDisplays();
    saveElementData();
  });
});

// Actualiza otros campos a nivel de elemento
[
  funcionItemField,
  funcionPasoField,
  funcionElementoField,
  caracteristicasField,
  caracteristicasPostField,
  accionPrevField,
  accionDetField,
  personaRespField,
  fechaObjetivoField,
  estatusField,
  accionTomadaField,
  fechaTerminacionField,
  observacionesField
].forEach(el => {
  if (el) {
    el.addEventListener('input', () => {
      saveElementData();
    });
  }
});

// Manejador para las pestañas de detalle (funciones, fallas, riesgos, optimización)
detailTabs.forEach(btn => {
  btn.addEventListener('click', () => {
    detailTabs.forEach(b => b.classList.remove('active'));
    detailContents.forEach(div => div.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-' + tab).classList.add('active');
  });
});

// Habilita o deshabilita el botón de añadir fallo en función de si hay elemento seleccionado
function updateAddFallaButton() {
  const el = getSelectedElement();
  if (!el) {
    addFallaBtn.setAttribute('disabled', 'disabled');
  } else {
    addFallaBtn.removeAttribute('disabled');
  }
}

// Añade un nuevo ítem al árbol
function addItem() {
  const item = { id: genId(), name: 'Nuevo Ítem', steps: [] };
  state.items.push(item);
  state.selected = { itemId: item.id, stepId: null, elementId: null };
  renderStructure();
  renderDetail();
}

// Elimina un ítem
function deleteItem(itemId) {
  if (!confirm('¿Está seguro de que desea eliminar este ítem y todo su contenido?')) return;
  state.items = state.items.filter(item => item.id !== itemId);
  if (state.selected.itemId === itemId) {
    state.selected = { itemId: null, stepId: null, elementId: null };
  }
  renderStructure();
  renderDetail();
}

// Elimina un paso de un ítem
function deleteStep(itemId, stepId) {
  if (!confirm('¿Está seguro de que desea eliminar este paso y todos sus elementos?')) return;
  const item = state.items.find(it => it.id === itemId);
  if (item) {
    item.steps = item.steps.filter(step => step.id !== stepId);
    if (state.selected.stepId === stepId) {
      state.selected.stepId = null;
      state.selected.elementId = null;
    }
  }
  renderStructure();
  renderDetail();
}

// Elimina un elemento de un paso
function deleteElement(itemId, stepId, elementId) {
  if (!confirm('¿Está seguro de que desea eliminar este elemento?')) return;
  const item = state.items.find(it => it.id === itemId);
  if (item) {
    const step = item.steps.find(st => st.id === stepId);
    if (step) {
      step.elements = step.elements.filter(el => el.id !== elementId);
      if (state.selected.elementId === elementId) {
        state.selected.elementId = null;
      }
    }
  }
  renderStructure();
  renderDetail();
}

// Añade un paso dentro de un ítem
function addStep(itemId) {
  const item = state.items.find(it => it.id === itemId);
  if (!item) return;
  const step = { id: genId(), name: 'Nuevo Paso', elements: [] };
  item.steps.push(step);
  state.selected = { itemId: itemId, stepId: step.id, elementId: null };
  renderStructure();
  renderDetail();
  // Crear automáticamente un elemento 4M por defecto para que el plan de control pueda llenarse sin acciones adicionales.
  addElement(itemId, step.id);
}

// Añade un elemento (4M) dentro de un paso
function addElement(itemId, stepId) {
  const item = state.items.find(it => it.id === itemId);
  if (!item) return;
  const step = item.steps.find(st => st.id === stepId);
  if (!step) return;
  // Preguntar tipo de 4M con opciones numeradas para orientar al usuario
  const typeOptions = ['Maquina', 'Mano de Obra', 'Materiales', 'Método', 'Medición', 'Medio Ambiente'];
  let selection = prompt(
    'Seleccione el tipo de 4M:\n' +
    '1. Maquina\n' +
    '2. Mano de Obra\n' +
    '3. Materiales\n' +
    '4. Método\n' +
    '5. Medición\n' +
    '6. Medio Ambiente',
    '1'
  );
  let index = parseInt(selection);
  if (isNaN(index) || index < 1 || index > typeOptions.length) {
    index = 1;
  }
  let type = typeOptions[index - 1];
  const element = {
    id: genId(),
    name: `${type}`,
    type: type,
    funciones: { funcionItem: '', funcionPaso: '', funcionElemento: '' },
    riesgos: {
      severidad: '',
      ocurrencia: '',
      deteccion: '',
      ap: '',
      caracteristicas: '',
      sPost: '',
      oPost: '',
      dPost: '',
      apPost: '',
      caracteristicasPost: ''
    },
    acciones: {
      accionPrev: '',
      accionDet: '',
      personaResp: '',
      fechaObjetivo: '',
      estatus: '',
      accionTomada: '',
      fechaTerminacion: '',
      observaciones: ''
    },
    fallas: [],
    // Nuevos campos para IATF 16949 compliance
    temporaryControl: {
      hasAlternative: false,
      alternativeMethod: '',
      isActive: false,
      activationDate: '',
      deactivationDate: '',
      limitType: '', // 'date' o 'quantity'
      limitValue: '',
      riskAssessment: '',
      approvalInternal: '',
      approvalClient: '',
      reason: '',
      dailyVerifications: [],
      traceabilityLots: []
    },
    supplyChain: {
      isPassThrough: false,
      supplierName: '',
      supplierPFMEA: '',
      supplierAuditDate: '',
      supplierAuditStatus: '',
      controlAtManufacture: ''
    },
    escalation: {
      requiresEscalation: false,
      escalationDate: '',
      escalatedTo: '',
      escalationReason: '',
      escalationStatus: ''
    }
  };
  step.elements.push(element);
  state.selected = { itemId: itemId, stepId: stepId, elementId: element.id };
  renderStructure();
  renderDetail();
}

// Añade una falla a un elemento
function addFalla() {
  const { itemId, stepId, elementId } = state.selected;
  if (!itemId || !stepId || !elementId) {
    alert('Seleccione un elemento 4M para agregar un modo de falla.');
    return;
  }
  const element = getSelectedElement();
  if (!element) return;
  const falla = {
    id: genId(),
    efecto: '',
    modo: '',
    causa: '',
    controlesPrev: '',
    controlesDetect: ''
  };
  element.fallas.push(falla);
  renderFallasTable();
  saveElementData();
}

// Obtiene el elemento actualmente seleccionado
function getSelectedElement() {
  const { itemId, stepId, elementId } = state.selected;
  const item = state.items.find(it => it.id === itemId);
  if (!item) return null;
  const step = item.steps.find(st => st.id === stepId);
  if (!step) return null;
  return step.elements.find(el => el.id === elementId) || null;
}

// Guarda los datos actuales del panel de detalle en el estado
function saveElementData() {
  const el = getSelectedElement();
  if (!el) return;
  // Guardar funciones
  el.funciones.funcionItem = funcionItemField.value;
  el.funciones.funcionPaso = funcionPasoField.value;
  el.funciones.funcionElemento = funcionElementoField.value;
  // Riesgos
  el.riesgos.severidad = severidadField.value;
  el.riesgos.ocurrencia = ocurrenciaField.value;
  el.riesgos.deteccion = deteccionField.value;
  el.riesgos.ap = apDisplay.textContent;
  el.riesgos.caracteristicas = caracteristicasField.value;
  el.riesgos.sPost = sPostField.value;
  el.riesgos.oPost = oPostField.value;
  el.riesgos.dPost = dPostField.value;
  el.riesgos.apPost = apPostDisplay.textContent;
  el.riesgos.caracteristicasPost = caracteristicasPostField.value;
  // Acciones
  el.acciones.accionPrev = accionPrevField.value;
  el.acciones.accionDet = accionDetField.value;
  el.acciones.personaResp = personaRespField.value;
  el.acciones.fechaObjetivo = fechaObjetivoField.value;
  el.acciones.estatus = estatusField.value;
  el.acciones.accionTomada = accionTomadaField.value;
  el.acciones.fechaTerminacion = fechaTerminacionField.value;
  el.acciones.observaciones = observacionesField.value;
  // Fallas se actualizan desde la tabla directamente
}

// Rellena el panel de detalle con los datos del elemento seleccionado
function renderDetail() {
  const el = getSelectedElement();
  if (!el) {
    detailTitle.textContent = 'Detalle';
    // Vaciar campos
    funcionItemField.value = '';
    funcionPasoField.value = '';
    funcionElementoField.value = '';
    severidadField.value = '';
    ocurrenciaField.value = '';
    deteccionField.value = '';
    sPostField.value = '';
    oPostField.value = '';
    dPostField.value = '';
    caracteristicasField.value = '';
    caracteristicasPostField.value = '';
    accionPrevField.value = '';
    accionDetField.value = '';
    personaRespField.value = '';
    fechaObjetivoField.value = '';
    estatusField.value = '';
    accionTomadaField.value = '';
    fechaTerminacionField.value = '';
    observacionesField.value = '';
    apDisplay.textContent = '';
    apDisplay.className = 'ap-cell';
    apPostDisplay.textContent = '';
    apPostDisplay.className = 'ap-cell';
    fallasBody.innerHTML = '';
    updateAddFallaButton();
    return;
  }
  detailTitle.textContent = `Detalle – ${el.type} (${el.name})`;
  // Asignar valores
  funcionItemField.value = el.funciones.funcionItem || '';
  funcionPasoField.value = el.funciones.funcionPaso || '';
  funcionElementoField.value = el.funciones.funcionElemento || '';
  severidadField.value = el.riesgos.severidad || '';
  ocurrenciaField.value = el.riesgos.ocurrencia || '';
  deteccionField.value = el.riesgos.deteccion || '';
  sPostField.value = el.riesgos.sPost || '';
  oPostField.value = el.riesgos.oPost || '';
  dPostField.value = el.riesgos.dPost || '';
  caracteristicasField.value = el.riesgos.caracteristicas || '';
  caracteristicasPostField.value = el.riesgos.caracteristicasPost || '';
  accionPrevField.value = el.acciones.accionPrev || '';
  accionDetField.value = el.acciones.accionDet || '';
  personaRespField.value = el.acciones.personaResp || '';
  fechaObjetivoField.value = el.acciones.fechaObjetivo || '';
  estatusField.value = el.acciones.estatus || '';
  accionTomadaField.value = el.acciones.accionTomada || '';
  fechaTerminacionField.value = el.acciones.fechaTerminacion || '';
  observacionesField.value = el.acciones.observaciones || '';
  // Actualizar AP displays
  updateApDisplays();
  // Renderizar fallas
  renderFallasTable();
  // Habilitar o deshabilitar botón de fallo
  updateAddFallaButton();
}

// Renderiza la lista de fallas de un elemento
function renderFallasTable() {
  const el = getSelectedElement();
  fallasBody.innerHTML = '';
  if (!el) return;
  el.fallas.forEach(falla => {
    const tr = document.createElement('tr');
    // Efecto
    const tdEf = document.createElement('td');
    const inpEf = document.createElement('textarea');
    inpEf.value = falla.efecto;
    inpEf.addEventListener('input', () => {
      falla.efecto = inpEf.value;
    });
    tdEf.appendChild(inpEf);
    tr.appendChild(tdEf);
    // Modo
    const tdMod = document.createElement('td');
    const inpMod = document.createElement('textarea');
    inpMod.value = falla.modo;
    inpMod.addEventListener('input', () => {
      falla.modo = inpMod.value;
    });
    tdMod.appendChild(inpMod);
    tr.appendChild(tdMod);
    // Causa
    const tdCau = document.createElement('td');
    const inpCau = document.createElement('textarea');
    inpCau.value = falla.causa;
    inpCau.addEventListener('input', () => {
      falla.causa = inpCau.value;
    });
    tdCau.appendChild(inpCau);
    tr.appendChild(tdCau);
    // Controles preventivos
    const tdPrev = document.createElement('td');
    const inpPrev = document.createElement('textarea');
    inpPrev.value = falla.controlesPrev;
    inpPrev.addEventListener('input', () => {
      falla.controlesPrev = inpPrev.value;
    });
    tdPrev.appendChild(inpPrev);
    tr.appendChild(tdPrev);
    // Controles detectivos
    const tdDet = document.createElement('td');
    const inpDet = document.createElement('textarea');
    inpDet.value = falla.controlesDetect;
    inpDet.addEventListener('input', () => {
      falla.controlesDetect = inpDet.value;
    });
    tdDet.appendChild(inpDet);
    tr.appendChild(tdDet);
    fallasBody.appendChild(tr);
  });
}

// Renderiza la estructura completa (items, pasos, elementos)
function renderStructure() {
  // Asegurarse de que el detalle se actualice con la estructura
  renderDetail();
  itemList.innerHTML = '';
  state.items.forEach(item => {
    const liItem = document.createElement('li');
    // Crear contenedor de fila para el ítem (nombre y botones)
    const rowDiv = document.createElement('div');
    rowDiv.className = 'tree-row';
    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.name;
    // Seleccionar item al hacer clic en el nombre
    nameSpan.addEventListener('click', e => {
      state.selected = { itemId: item.id, stepId: null, elementId: null };
      renderStructure();
      renderDetail();
    });
    if (state.selected.itemId === item.id && state.selected.stepId === null) {
      nameSpan.classList.add('active');
    }
    rowDiv.appendChild(nameSpan);
    // Contenedor para botones de item
    const btnContainer = document.createElement('span');
    btnContainer.className = 'tree-buttons';
    // Botón para agregar paso
    const addStepBtn = document.createElement('button');
    addStepBtn.textContent = '+ Paso';
    addStepBtn.className = 'small';
    addStepBtn.title = 'Añadir paso';
    addStepBtn.addEventListener('click', e => {
      e.stopPropagation();
      addStep(item.id);
    });
    btnContainer.appendChild(addStepBtn);
    // Botón para renombrar ítem
    const renameBtn = document.createElement('button');
    renameBtn.textContent = '✎';
    renameBtn.className = 'small';
    renameBtn.title = 'Renombrar ítem';
    renameBtn.addEventListener('click', e => {
      e.stopPropagation();
      const newName = prompt('Nombre del ítem:', item.name);
      if (newName) {
        item.name = newName;
        renderStructure();
        updateControlPlan();
      }
    });
    btnContainer.appendChild(renameBtn);
    // Botón para eliminar ítem
    const deleteItemBtn = document.createElement('button');
    deleteItemBtn.textContent = '🗑️';
    deleteItemBtn.className = 'small';
    deleteItemBtn.title = 'Eliminar ítem';
    deleteItemBtn.addEventListener('click', e => {
      e.stopPropagation();
      deleteItem(item.id);
    });
    btnContainer.appendChild(deleteItemBtn);
    rowDiv.appendChild(btnContainer);
    liItem.appendChild(rowDiv);
    // Lista de pasos
    const ulSteps = document.createElement('ul');
    ulSteps.className = 'step-list';
    item.steps.forEach(step => {
      const liStep = document.createElement('li');
      // Crear fila para el paso
      const rowStep = document.createElement('div');
      rowStep.className = 'tree-row';
      const stepSpan = document.createElement('span');
      stepSpan.textContent = step.name;
      stepSpan.addEventListener('click', e => {
        state.selected = { itemId: item.id, stepId: step.id, elementId: null };
        renderStructure();
        renderDetail();
      });
      if (state.selected.itemId === item.id && state.selected.stepId === step.id && state.selected.elementId === null) {
        stepSpan.classList.add('active');
      }
      rowStep.appendChild(stepSpan);
      // Contenedor para botones de paso
      const btnStepContainer = document.createElement('span');
      btnStepContainer.className = 'tree-buttons';
      // Botón para agregar elemento
      const addElBtn = document.createElement('button');
      addElBtn.textContent = '+ 4M';
      addElBtn.className = 'small';
      addElBtn.title = 'Añadir elemento 4M';
      addElBtn.addEventListener('click', e => {
        e.stopPropagation();
        addElement(item.id, step.id);
      });
      btnStepContainer.appendChild(addElBtn);
      // Botón renombrar paso
      const renStepBtn = document.createElement('button');
      renStepBtn.textContent = '✎';
      renStepBtn.className = 'small';
      renStepBtn.title = 'Renombrar paso';
      renStepBtn.addEventListener('click', e => {
        e.stopPropagation();
        const newName = prompt('Nombre del paso:', step.name);
        if (newName) {
          step.name = newName;
          renderStructure();
        }
      });
      btnStepContainer.appendChild(renStepBtn);
      // Botón para eliminar paso
      const deleteStepBtn = document.createElement('button');
      deleteStepBtn.textContent = '🗑️';
      deleteStepBtn.className = 'small';
      deleteStepBtn.title = 'Eliminar paso';
      deleteStepBtn.addEventListener('click', e => {
        e.stopPropagation();
        deleteStep(item.id, step.id);
      });
      btnStepContainer.appendChild(deleteStepBtn);
      rowStep.appendChild(btnStepContainer);
      liStep.appendChild(rowStep);
      // Lista de elementos
      const ulEls = document.createElement('ul');
      ulEls.className = 'step-list';
      step.elements.forEach(el => {
        const liEl = document.createElement('li');
        // Fila para el elemento (con botón de eliminar)
        const rowEl = document.createElement('div');
        rowEl.className = 'tree-row';
        const elSpan = document.createElement('span');
        elSpan.textContent = `${el.name}`; // Mostrar nombre en lugar de tipo
        elSpan.addEventListener('click', e => {
          state.selected = { itemId: item.id, stepId: step.id, elementId: el.id };
          renderStructure();
          renderDetail();
        });
        if (
          state.selected.itemId === item.id &&
          state.selected.stepId === step.id &&
          state.selected.elementId === el.id
        ) {
          elSpan.classList.add('active');
        }
        rowEl.appendChild(elSpan);

        const btnElContainer = document.createElement('span');
        btnElContainer.className = 'tree-buttons';

        // Botón para renombrar elemento
        const renameElBtn = document.createElement('button');
        renameElBtn.textContent = '✎';
        renameElBtn.className = 'small';
        renameElBtn.title = 'Renombrar elemento';
        renameElBtn.addEventListener('click', e => {
          e.stopPropagation();
          const newName = prompt('Nuevo nombre para el elemento:', el.name);
          if (newName && newName.trim()) {
            el.name = newName.trim();
            renderStructure();
            renderDetail(); // Actualizar título si está seleccionado
          }
        });
        btnElContainer.appendChild(renameElBtn);

        // Botón para eliminar elemento
        const deleteElBtn = document.createElement('button');
        deleteElBtn.textContent = '🗑️';
        deleteElBtn.className = 'small';
        deleteElBtn.title = 'Eliminar elemento';
        deleteElBtn.addEventListener('click', e => {
          e.stopPropagation();
          deleteElement(item.id, step.id, el.id);
        });
        btnElContainer.appendChild(deleteElBtn);

        rowEl.appendChild(btnElContainer);
        liEl.appendChild(rowEl);
        ulEls.appendChild(liEl);
      });
      liStep.appendChild(ulEls);
      ulSteps.appendChild(liStep);
    });
    liItem.appendChild(ulSteps);
    itemList.appendChild(liItem);
  });
  // Actualizar plan de control
  updateControlPlan();
}

// Actualiza el plan de control en función de los ítems definidos. Cada elemento 4M genera una fila
// en el plan de control para capturar controles y planes de reacción a nivel granular.
function updateControlPlan() {
  // Limpiar cuerpo de la tabla
  controlBody.innerHTML = '';
  let processCounter = 1;
  // Recorrer estructura y generar filas según el nuevo formato
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        // Inicializar objeto control si no existe
        if (!el.control) {
          el.control = {
            numProcessPart: '',
            processName: '',
            machineTools: '',
            characteristicNumber: '',
            productChar: '',
            processChar: '',
            specialClass: '',
            specTol: '',
            measurementTech: '',
            errorProofing: '',
            verificationMethod: '',
            verificationFrequency: '',
            sampleQuantity: '',
            sampleFrequency: '',
            controlMethod: '',
            reactionPlan: '',
            msaStatus: ''
          };
        }
        // Inicializar campos adicionales para IATF compliance si no existen
        if (!el.temporaryControl) {
          el.temporaryControl = {
            hasAlternative: false,
            alternativeMethod: '',
            isActive: false,
            activationDate: '',
            deactivationDate: '',
            limitType: '',
            limitValue: '',
            riskAssessment: '',
            approvalInternal: '',
            approvalClient: '',
            reason: '',
            dailyVerifications: [],
            traceabilityLots: []
          };
        }
        if (!el.supplyChain) {
          el.supplyChain = {
            isPassThrough: false,
            supplierName: '',
            supplierPFMEA: '',
            supplierAuditDate: '',
            supplierAuditStatus: '',
            controlAtManufacture: ''
          };
        }
        if (!el.escalation) {
          el.escalation = {
            requiresEscalation: false,
            escalationDate: '',
            escalatedTo: '',
            escalationReason: '',
            escalationStatus: ''
          };
        }
        const tr = document.createElement('tr');
        // 1: Nº proceso/parte
        const tdNum = document.createElement('td');
        const numInput = document.createElement('input');
        numInput.type = 'text';
        if (!el.control.numProcessPart) {
          el.control.numProcessPart = processCounter.toString();
        }
        numInput.value = el.control.numProcessPart;
        numInput.addEventListener('input', () => {
          el.control.numProcessPart = numInput.value;
        });
        tdNum.appendChild(numInput);
        tr.appendChild(tdNum);
        processCounter++;
        // 2: Nombre de proceso
        const tdProcName = document.createElement('td');
        const procInput = document.createElement('input');
        procInput.type = 'text';
        if (!el.control.processName) {
          el.control.processName = step.name;
        }
        procInput.value = el.control.processName;
        procInput.addEventListener('input', () => {
          el.control.processName = procInput.value;
        });
        tdProcName.appendChild(procInput);
        tr.appendChild(tdProcName);
        // 3: Máquina / herramientas
        const tdMach = document.createElement('td');
        const machInput = document.createElement('input');
        machInput.type = 'text';
        machInput.value = el.control.machineTools || el.type || '';
        machInput.addEventListener('input', () => {
          el.control.machineTools = machInput.value;
        });
        tdMach.appendChild(machInput);
        tr.appendChild(tdMach);
        // 4: Nº característica
        const tdCharNum = document.createElement('td');
        const charInput = document.createElement('input');
        charInput.type = 'text';
        charInput.value = el.control.characteristicNumber || '';
        charInput.addEventListener('input', () => {
          el.control.characteristicNumber = charInput.value;
        });
        tdCharNum.appendChild(charInput);
        tr.appendChild(tdCharNum);
        // 5: Producto
        const tdProd = document.createElement('td');
        const prodInput = document.createElement('input');
        prodInput.type = 'text';
        if (!el.control.productChar) {
          el.control.productChar = el.funciones.funcionPaso || '';
        }
        prodInput.value = el.control.productChar;
        prodInput.addEventListener('input', () => {
          el.control.productChar = prodInput.value;
        });
        tdProd.appendChild(prodInput);
        tr.appendChild(tdProd);
        // 6: Proceso
        const tdProcChar = document.createElement('td');
        const procCharInput = document.createElement('input');
        procCharInput.type = 'text';
        if (!el.control.processChar) {
          el.control.processChar = el.funciones.funcionElemento || '';
        }
        procCharInput.value = el.control.processChar;
        procCharInput.addEventListener('input', () => {
          el.control.processChar = procCharInput.value;
        });
        tdProcChar.appendChild(procCharInput);
        tr.appendChild(tdProcChar);
        // 7: Clase especial
        const tdClass = document.createElement('td');
        const classInput = document.createElement('input');
        const classif = computeClassification(el.riesgos.severidad, el.riesgos.ocurrencia) || '';
        el.control.specialClass = classif;
        classInput.value = el.control.specialClass;
        classInput.setAttribute('readonly', 'readonly');
        classInput.classList.remove('critica', 'significativa');
        if (el.control.specialClass === 'Crítica') {
          classInput.classList.add('critica');
        } else if (el.control.specialClass === 'Significativa') {
          classInput.classList.add('significativa');
        }
        tdClass.appendChild(classInput);
        tr.appendChild(tdClass);
        // 8: Especificación/Tolerancia
        const tdSpec = document.createElement('td');
        const specInput = document.createElement('input');
        specInput.type = 'text';
        specInput.placeholder = 'Especificación/Tolerancia';
        specInput.value = el.control.specTol || '';
        specInput.addEventListener('input', () => {
          el.control.specTol = specInput.value;
        });
        tdSpec.appendChild(specInput);
        tr.appendChild(tdSpec);
        // 9: Técnica de medición
        const tdMeas = document.createElement('td');
        const measInput = document.createElement('input');
        measInput.type = 'text';
        measInput.placeholder = 'Técnica de medición';
        measInput.value = el.control.measurementTech || '';
        measInput.addEventListener('input', () => {
          el.control.measurementTech = measInput.value;
        });
        tdMeas.appendChild(measInput);
        tr.appendChild(tdMeas);
        // 10: Error proofing (Controles de prevención)
        const tdError = document.createElement('td');
        const errorInput = document.createElement('input');
        errorInput.type = 'text';
        errorInput.placeholder = 'Poka yoke / Error proofing';
        // Combinar controles preventivos actuales y acciones preventivas
        const prevControls = el.fallas.map(f => f.controlesPrev).filter(Boolean);
        if (el.acciones.accionPrev) prevControls.push(el.acciones.accionPrev);
        el.control.errorProofing = prevControls.join('; ');
        errorInput.value = el.control.errorProofing;
        errorInput.setAttribute('readonly', 'readonly'); // Solo lectura
        tdError.appendChild(errorInput);
        tr.appendChild(tdError);

        // Nuevos campos para Verificación de Poka-Yoke
        const isPokaYoke = el.control.errorProofing && el.control.errorProofing.toLowerCase().includes('poka-yoke');

        // Método de Verificación
        const tdVerifMethod = document.createElement('td');
        const verifMethodInput = document.createElement('input');
        verifMethodInput.type = 'text';
        verifMethodInput.placeholder = 'Método de Verificación';
        verifMethodInput.value = el.control.verificationMethod || '';
        verifMethodInput.addEventListener('input', () => {
          el.control.verificationMethod = verifMethodInput.value;
        });
        if (!isPokaYoke) {
            verifMethodInput.setAttribute('readonly', 'readonly');
        }
        tdVerifMethod.appendChild(verifMethodInput);
        tr.appendChild(tdVerifMethod);

        // Frecuencia de Verificación
        const tdVerifFreq = document.createElement('td');
        const verifFreqInput = document.createElement('input');
        verifFreqInput.type = 'text';
        verifFreqInput.placeholder = 'Frecuencia';
        verifFreqInput.value = el.control.verificationFrequency || '';
        verifFreqInput.addEventListener('input', () => {
          el.control.verificationFrequency = verifFreqInput.value;
        });
        if (!isPokaYoke) {
            verifFreqInput.setAttribute('readonly', 'readonly');
        }
        tdVerifFreq.appendChild(verifFreqInput);
        tr.appendChild(tdVerifFreq);


        // 11: Muestra – Cantidad
        const tdQty = document.createElement('td');
        const qtyInput = document.createElement('input');
        qtyInput.type = 'text';
        qtyInput.placeholder = 'Cantidad';
        qtyInput.value = el.control.sampleQuantity || '';
        qtyInput.addEventListener('input', () => {
          el.control.sampleQuantity = qtyInput.value;
        });
        tdQty.appendChild(qtyInput);
        tr.appendChild(tdQty);

        // 12: Muestra – Frecuencia
        const tdFreq = document.createElement('td');
        const freqInput = document.createElement('input');
        freqInput.type = 'text';
        freqInput.placeholder = 'Frecuencia';
        freqInput.value = el.control.sampleFrequency || '';
        freqInput.addEventListener('input', () => {
          el.control.sampleFrequency = freqInput.value;
        });
        tdFreq.appendChild(freqInput);
        tr.appendChild(tdFreq);

        // 13: Método de control (Controles de detección)
        const tdCtrl = document.createElement('td');
        const ctrlInput = document.createElement('input');
        ctrlInput.type = 'text';
        ctrlInput.placeholder = 'Método de control';
        // Combinar controles detectivos actuales y acciones detectivas
        const detectControls = el.fallas.map(f => f.controlesDetect).filter(Boolean);
        if (el.acciones.accionDet) detectControls.push(el.acciones.accionDet);
        el.control.controlMethod = detectControls.join('; ');
        ctrlInput.value = el.control.controlMethod;
        ctrlInput.setAttribute('readonly', 'readonly'); // Solo lectura
        tdCtrl.appendChild(ctrlInput);
        tr.appendChild(tdCtrl);
        // 14: Plan de reacción
        const tdReact = document.createElement('td');
        const reactInput = document.createElement('input');
        reactInput.type = 'text';
        reactInput.placeholder = 'Plan de reacción';
        reactInput.value = el.control.reactionPlan || '';
        reactInput.addEventListener('input', () => {
          el.control.reactionPlan = reactInput.value;
        });
        tdReact.appendChild(reactInput);
        tr.appendChild(tdReact);
        controlBody.appendChild(tr);
      });
    });
  });
}

// Recoge los datos del formulario y del estado y los envía al backend
async function saveData() {
  const saveBtn = document.getElementById('save-btn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Guardando...';

  // Allow UI to update before blocking for validation
  await new Promise(resolve => setTimeout(resolve, 0));

  try {
    // Actualizar datos generales
    state.general.orgName = document.getElementById('orgName').value;
    state.general.tema = document.getElementById('tema').value;
    state.general.numeroAmfe = document.getElementById('numeroAmfe').value;
    state.general.revisionAmfe = document.getElementById('revisionAmfe').value;
    state.general.planta = document.getElementById('planta').value;
    state.general.fechaInicio = document.getElementById('fechaInicio').value;
    state.general.responsable = document.getElementById('responsable').value;
    state.general.cliente = document.getElementById('cliente').value;
    state.general.fechaRevision = document.getElementById('fechaRevision').value;
    state.general.confidencialidad = document.getElementById('confidencialidad').value;
    state.general.modelo = document.getElementById('modelo').value;
    state.general.equipo = document.getElementById('equipo').value;
    // Campos adicionales del plan
    state.general.planNumber = document.getElementById('planNumber').value;
    state.general.contacto = document.getElementById('contacto').value;
    state.general.tipoPlan = document.getElementById('tipoPlan').value;
    // Campos adicionales de trazabilidad
    state.general.numParte = document.getElementById('numParte').value;
    state.general.ultimoCambio = document.getElementById('ultimoCambio').value;
    state.general.aprobProv = document.getElementById('aprobProv').value;
    state.general.aprobIngCliente = document.getElementById('aprobIngCliente').value;
    state.general.aprobCalidadCliente = document.getElementById('aprobCalidadCliente').value;
    state.general.aprobOtras = document.getElementById('aprobOtras').value;
    state.general.safetyApproval = document.getElementById('safetyApproval').checked;

    // Guardar datos del elemento activo
    saveElementData();

    // Validar datos antes de guardar
    if (!validateData()) {
      return; // La validación falló, el botón se reactivará en el finally
    }

    // Guardar los datos en el servidor
    await persistServer();
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Guardar AMFE';
  }
}

// Exporta el estado actual a un archivo Excel (FMEA y Plan de control)
async function exportToExcel() {
  const exportBtn = document.getElementById('export-btn');
  exportBtn.disabled = true;
  exportBtn.textContent = 'Exportando...';

  // Allow UI to update before blocking the thread
  await new Promise(resolve => setTimeout(resolve, 0));

  try {
    // Asegura que los cambios del elemento activo se guardan
    saveElementData();
    // Actualizar información general desde el formulario antes de validar.
    // Esto evita que se usen valores obsoletos de state.general cuando se
    // exporta directamente sin pulsar "Guardar AMFE".
    state.general.orgName = document.getElementById('orgName').value;
    state.general.tema = document.getElementById('tema').value;
    state.general.numeroAmfe = document.getElementById('numeroAmfe').value;
    state.general.revisionAmfe = document.getElementById('revisionAmfe').value;
    state.general.planta = document.getElementById('planta').value;
    state.general.fechaInicio = document.getElementById('fechaInicio').value;
    state.general.responsable = document.getElementById('responsable').value;
    state.general.cliente = document.getElementById('cliente').value;
    state.general.fechaRevision = document.getElementById('fechaRevision').value;
    state.general.confidencialidad = document.getElementById('confidencialidad').value;
    state.general.modelo = document.getElementById('modelo').value;
    state.general.equipo = document.getElementById('equipo').value;
    state.general.planNumber = document.getElementById('planNumber').value;
    state.general.contacto = document.getElementById('contacto').value;
    state.general.tipoPlan = document.getElementById('tipoPlan').value;
    state.general.numParte = document.getElementById('numParte').value;
    state.general.ultimoCambio = document.getElementById('ultimoCambio').value;
    state.general.aprobProv = document.getElementById('aprobProv').value;
    state.general.aprobIngCliente = document.getElementById('aprobIngCliente').value;
    state.general.aprobCalidadCliente = document.getElementById('aprobCalidadCliente').value;
    state.general.aprobOtras = document.getElementById('aprobOtras').value;
    // Validar datos antes de exportar
    if (!validateData()) {
      return;
    }
    // Construir datos para la hoja AMFE
    const amfeRows = [];
    state.items.forEach(item => {
      item.steps.forEach(step => {
        step.elements.forEach(el => {
          // Si no hay fallas, aún se exporta una fila vacía para el elemento
          if (el.fallas.length === 0) {
            const row = {
              'Nº de AMFE': state.general.numeroAmfe || '',
              'Revisión': state.general.revisionAmfe || '',
              'Item del proceso': item.name,
              'Paso del proceso': step.name,
              'Elemento de trabajo del proceso': el.type,
              'Función del ítem del proceso': el.funciones.funcionItem,
              'Función del paso del proceso': el.funciones.funcionPaso,
              'Función del elemento de trabajo': el.funciones.funcionElemento,
              'Efecto de la falla (EF)': '',
              'Modo de falla (FM)': '',
              'Causa de la falla (FC)': '',
              'Controles preventivos actuales': '',
              'Controles detectivos actuales': '',
              'Severidad (S)': el.riesgos.severidad,
              'Ocurrencia (O)': el.riesgos.ocurrencia,
              'Detección (D)': el.riesgos.deteccion,
              'AP (High/Medium/Low)': el.riesgos.ap,
              'Características especiales': el.riesgos.caracteristicas,
              'Acción preventiva': el.acciones.accionPrev,
              'Acción detectiva': el.acciones.accionDet,
              'Nombre de la persona responsable': el.acciones.personaResp,
              'Fecha objetivo de terminación': el.acciones.fechaObjetivo,
              'Estatus': el.acciones.estatus,
              'Acción tomada': el.acciones.accionTomada,
              'Fecha de terminación': el.acciones.fechaTerminacion,
              'Severidad post (S)': el.riesgos.sPost,
              'Ocurrencia post (O)': el.riesgos.oPost,
              'Detección post (D)': el.riesgos.dPost,
              'Características especiales post': el.riesgos.caracteristicasPost,
              'AP FMEA post': el.riesgos.apPost,
              'Observaciones': el.acciones.observaciones
            };
            amfeRows.push(row);
          } else {
            el.fallas.forEach(falla => {
              const row = {
                'Nº de AMFE': state.general.numeroAmfe || '',
                'Revisión': state.general.revisionAmfe || '',
                'Item del proceso': item.name,
                'Paso del proceso': step.name,
                'Elemento de trabajo del proceso': el.type,
                'Función del ítem del proceso': el.funciones.funcionItem,
                'Función del paso del proceso': el.funciones.funcionPaso,
                'Función del elemento de trabajo': el.funciones.funcionElemento,
                'Efecto de la falla (EF)': falla.efecto,
                'Modo de falla (FM)': falla.modo,
                'Causa de la falla (FC)': falla.causa,
                'Controles preventivos actuales': falla.controlesPrev,
                'Controles detectivos actuales': falla.controlesDetect,
                'Severidad (S)': el.riesgos.severidad,
                'Ocurrencia (O)': el.riesgos.ocurrencia,
                'Detección (D)': el.riesgos.deteccion,
                'AP (High/Medium/Low)': el.riesgos.ap,
                'Características especiales': el.riesgos.caracteristicas,
                'Acción preventiva': el.acciones.accionPrev,
                'Acción detectiva': el.acciones.accionDet,
                'Nombre de la persona responsable': el.acciones.personaResp,
                'Fecha objetivo de terminación': el.acciones.fechaObjetivo,
                'Estatus': el.acciones.estatus,
                'Acción tomada': el.acciones.accionTomada,
                'Fecha de terminación': el.acciones.fechaTerminacion,
                'Severidad post (S)': el.riesgos.sPost,
                'Ocurrencia post (O)': el.riesgos.oPost,
                'Detección post (D)': el.riesgos.dPost,
                'Características especiales post': el.riesgos.caracteristicasPost,
                'AP FMEA post': el.riesgos.apPost,
                'Observaciones': el.acciones.observaciones
              };
              amfeRows.push(row);
            });
          }
        });
      });
    });
    // Construir hoja Plan de control
    const controlRows = [];
    const controlHeaders = [
      'Nº proceso / Parte', 'Nombre de proceso', 'Máquina, utillaje, herramientas',
      'Nº característica', 'Producto', 'Proceso', 'Clase especial',
      'Especificación / Tolerancia (producto/proceso)', 'Técnica de medición',
      'Error proofing', 'Muestra – Cantidad', 'Muestra – Frecuencia',
      'Método de control', 'Plan de reacción'
    ];
    Array.from(controlBody.children).forEach(tr => {
      const row = {};
      const tds = Array.from(tr.children);
      tds.forEach((td, i) => {
        const header = controlHeaders[i];
        const input = td.querySelector('input, select, textarea');
        row[header] = input ? input.value : td.textContent;
      });
      controlRows.push(row);
    });
    // Crear workbook
    const wb = XLSX.utils.book_new();
    const wsAmfe = XLSX.utils.json_to_sheet(amfeRows);
    XLSX.utils.book_append_sheet(wb, wsAmfe, 'AMFE');
    const wsCp = XLSX.utils.json_to_sheet(controlRows);
    XLSX.utils.book_append_sheet(wb, wsCp, 'Plan de Control');
    // Guardar
    XLSX.writeFile(wb, 'AMFE-FMEA.xlsx');
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = 'Exportar a Excel';
  }
}

// Event Listeners generales
addItemBtn.addEventListener('click', addItem);
addFallaBtn.addEventListener('click', addFalla);
saveBtn.addEventListener('click', saveData);
exportBtn.addEventListener('click', exportToExcel);

// --- Lógica para el historial de cambios ---
const historyBtn = document.getElementById('history-btn');
const historyModal = document.getElementById('history-modal');
const closeBtn = document.querySelector('.close-btn');
const historyList = document.getElementById('history-list');

// Muestra el modal del historial
async function showHistory() {
  historyList.innerHTML = '<li>Cargando historial...</li>';
  historyModal.style.display = 'block';

  try {
    const snapshot = await db.collection('changeLogs')
      .where('docId', '==', currentDocId)
      .orderBy('timestamp', 'desc')
      .get();

    if (snapshot.empty) {
      historyList.innerHTML = '<li>No hay historial de cambios para este documento.</li>';
      return;
    }

    historyList.innerHTML = '';
    snapshot.forEach(doc => {
      const log = doc.data();
      const li = document.createElement('li');
      const date = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Fecha desconocida';
      li.innerHTML = `<strong>${date}:</strong> ${log.change} (Solicitante: ${log.requester || 'N/A'}, Aprobador: ${log.approver || 'N/A'})`;
      historyList.appendChild(li);
    });
  } catch (error) {
    console.error("Error al obtener el historial:", error);
    historyList.innerHTML = '<li>Error al cargar el historial.</li>';
  }
}

// Oculta el modal
function hideHistory() {
  historyModal.style.display = 'none';
}

historyBtn.addEventListener('click', showHistory);
closeBtn.addEventListener('click', hideHistory);
window.addEventListener('click', (event) => {
  if (event.target == historyModal) {
    hideHistory();
  }
});

// Tab principal (FMEA / Plan de control)
document.getElementById('tab-fmea').addEventListener('click', () => {
  document.getElementById('fmea-section').classList.add('active');
  document.getElementById('control-section').classList.remove('active');
  document.getElementById('standard-section').classList.remove('active');
  document.getElementById('instructions-section').classList.remove('active');
  document.getElementById('iatf-section').classList.remove('active');
  document.getElementById('tab-fmea').classList.add('active');
  document.getElementById('tab-control').classList.remove('active');
  document.getElementById('tab-standard').classList.remove('active');
  document.getElementById('tab-instructions').classList.remove('active');
  document.getElementById('tab-iatf').classList.remove('active');
});
document.getElementById('tab-control').addEventListener('click', () => {
  document.getElementById('control-section').classList.add('active');
  document.getElementById('fmea-section').classList.remove('active');
  document.getElementById('standard-section').classList.remove('active');
  document.getElementById('instructions-section').classList.remove('active');
  document.getElementById('iatf-section').classList.remove('active');
  document.getElementById('tab-control').classList.add('active');
  document.getElementById('tab-fmea').classList.remove('active');
  document.getElementById('tab-standard').classList.remove('active');
  document.getElementById('tab-instructions').classList.remove('active');
  document.getElementById('tab-iatf').classList.remove('active');
  // Recalcular el plan de control para reflejar cualquier cambio en las clasificaciones.
  updateControlPlan();
});

// Inicialización de la aplicación
function init() {
  // Añadir un ítem por defecto para facilitar la interacción inicial
  if (state.items.length === 0) {
    const item = { id: genId(), name: 'Proceso 1', steps: [] };
    state.items.push(item);
    state.selected = { itemId: item.id, stepId: null, elementId: null };
  }
  renderStructure();
  renderDetail();
  updateApDisplays();

  // Inicializar cabecera del plan de control
  initControlHeaderUI();
  // Inicializar información general
  initGeneralInfoUI();
}

function initGeneralInfoUI() {
  // Aquí puedes añadir todos los campos de información general que necesites inicializar
  const safetyApprovalCheckbox = document.getElementById('safetyApproval');
  if (safetyApprovalCheckbox) {
    safetyApprovalCheckbox.checked = state.general.safetyApproval || false;
    safetyApprovalCheckbox.addEventListener('change', () => {
      state.general.safetyApproval = safetyApprovalCheckbox.checked;
    });
  }
}

// Cargar valores de la cabecera del plan de control en los campos del DOM y registrar escuchadores
function initControlHeaderUI() {
  const mappings = {
    cpPhase: 'cpPhase',
    cpNumber: 'cpNumber',
    cpContact: 'cpContact',
    cpDateOriginal: 'cpDateOriginal',
    cpDateRevision: 'cpDateRevision',
    cpPartNumber: 'cpPartNumber',
    cpMainTeam: 'cpMainTeam',
    cpPartDescription: 'cpPartDescription',
    cpSupplierPlant: 'cpSupplierPlant',
    cpSupplierCode: 'cpSupplierCode',
    cpApprovalSupplier: 'cpApprovalSupplier',
    cpApprovalTechClient: 'cpApprovalTechClient',
    cpApprovalQualityClient: 'cpApprovalQualityClient',
    cpApprovalOther: 'cpApprovalOther'
  };
  Object.keys(mappings).forEach(key => {
    const inputId = mappings[key];
    const el = document.getElementById(inputId);
    if (!el) return;
    // Establecer valor inicial
    if (state.controlHeader[key]) {
      el.value = state.controlHeader[key];
    }
    // Registrar listener para actualizar estado
    el.addEventListener('input', () => {
      state.controlHeader[key] = el.value;
    });
    // Para selects también escuchar change
    el.addEventListener('change', () => {
      state.controlHeader[key] = el.value;
    });
  });
}


// --- Funciones para persistencia en servidor ---
async function loadFromServer() {
  if (!currentDocId) return;
  try {
    const docRef = db.collection('docs').doc(currentDocId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const saved = docSnap.data().content || {};
      // Copiar propiedades guardadas al estado actual
      if (saved.general) {
        Object.assign(state.general, saved.general);
      }
      if (Array.isArray(saved.items)) {
        state.items = saved.items;
      }
      if (saved.controlHeader) {
        Object.assign(state.controlHeader, saved.controlHeader);
      }
    } else {
      console.log("No such document!");
    }
  } catch (ex) {
    console.error("Error getting document:", ex);
  }
}

// Guardar estado en servidor
async function persistServer() {
  if (!currentDocId) return;

  const changeDescription = prompt("Por favor, describe los cambios realizados en esta versión:");
  if (changeDescription === null || changeDescription.trim() === '') {
    alert("El guardado ha sido cancelado. Debes proporcionar una descripción de los cambios.");
    return;
  }
  const requester = prompt("Introduce el nombre del solicitante del cambio:");
  if (requester === null || requester.trim() === '') {
    alert("El guardado ha sido cancelado. Debes introducir un solicitante.");
    return;
  }
  const approver = prompt("Introduce el nombre del aprobador del cambio:");
  if (approver === null || approver.trim() === '') {
    alert("El guardado ha sido cancelado. Debes introducir un aprobador.");
    return;
  }

  const statusEl = document.getElementById('save-status');
  if (statusEl) {
    statusEl.textContent = 'Guardando...';
    statusEl.style.color = 'orange';
  }

  try {
    const copy = JSON.parse(JSON.stringify(state));
    const name = state.general.tema && state.general.tema.trim() !== '' ? state.general.tema.trim() : 'AMFE sin tema';

    await db.collection('docs').doc(currentDocId).set({
      name: name,
      content: copy,
      lastModified: new Date().toISOString()
    }, { merge: true });

    await persistChangeLog(changeDescription, requester, approver);

    if (statusEl) {
      statusEl.textContent = 'Guardado correctamente.';
      statusEl.style.color = 'green';
      setTimeout(() => {
        statusEl.textContent = '';
      }, 3000);
    }
  } catch (ex) {
    console.error('Error al guardar en servidor:', ex);
    if (statusEl) {
      statusEl.textContent = 'Error al guardar.';
      statusEl.style.color = 'red';
    }
  }
}

// Guarda una entrada en el historial de cambios
async function persistChangeLog(changeDescription, requester, approver) {
  if (!currentDocId) return;
  try {
    await db.collection('changeLogs').add({
      docId: currentDocId,
      change: changeDescription,
      requester: requester,
      approver: approver,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error al guardar en el historial de cambios:", error);
  }
}

// Mostrar la vista estándar en la pestaña correspondiente
function renderStandardView() {
  const container = document.getElementById('standard-table-container');
  if (!container) return;
  // Limpiar contenedor
  container.innerHTML = '';
  // Crear tabla
  const table = document.createElement('table');
  table.className = 'standard-table';
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  // Definir columnas según el formato AIAG‑VDA
  const cols = [
    { label: 'Ítem del Proceso', class: 'col-struct' },
    { label: 'Paso del Proceso', class: 'col-struct' },
    { label: 'Elemento 4M', class: 'col-struct' },
    { label: 'Función del Ítem', class: 'col-func' },
    { label: 'Función del Paso', class: 'col-func' },
    { label: 'Función del Elemento', class: 'col-func' },
    { label: 'Efecto de la Falla (EF)', class: 'col-failure' },
    { label: 'Modo de Falla (FM)', class: 'col-failure' },
    { label: 'Causa de Falla (FC)', class: 'col-failure' },
    { label: 'Severidad (S)', class: 'col-risk' },
    { label: 'Ocurrencia (O)', class: 'col-risk' },
    { label: 'Detección (D)', class: 'col-risk' },
    { label: 'AP', class: 'col-risk' },
    { label: 'Característica Especial', class: 'col-risk' },
    { label: 'Acción Prev./Det.', class: 'col-opt' },
    { label: 'Responsable', class: 'col-opt' },
    { label: 'Fecha Objetivo', class: 'col-opt' },
    { label: 'Estatus', class: 'col-opt' },
    { label: 'Acción Tomada', class: 'col-opt' },
    { label: 'Fecha de Terminación', class: 'col-opt' },
    { label: 'Observaciones', class: 'col-opt' }
  ];
  cols.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    th.className = col.class;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  // Generar filas por cada elemento 4M
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        // Asegurar que al menos una fila exista por cada falla o una sola si no hay fallas
        const fallas = el.fallas && el.fallas.length > 0 ? el.fallas : [null];
        fallas.forEach(falla => {
          const tr = document.createElement('tr');
          // Columnas estructurales
          const cells = [];
          cells.push(item.name);
          cells.push(step.name);
          cells.push(el.type);
          // Funciones
          cells.push(el.funciones.funcionItem || '');
          cells.push(el.funciones.funcionPaso || '');
          cells.push(el.funciones.funcionElemento || '');
          // Fallas
          cells.push(falla ? falla.efecto : '');
          cells.push(falla ? falla.modo : '');
          cells.push(falla ? falla.causa : '');
          // Riesgos
          cells.push(el.riesgos.severidad || '');
          cells.push(el.riesgos.ocurrencia || '');
          cells.push(el.riesgos.deteccion || '');
          cells.push(el.riesgos.ap || '');
          cells.push(el.riesgos.caracteristicas || '');
          // Optimización (acciones)
          cells.push(el.acciones.accionPrev || el.acciones.accionDet || '');
          cells.push(el.acciones.personaResp || '');
          cells.push(el.acciones.fechaObjetivo || '');
          cells.push(el.acciones.estatus || '');
          cells.push(el.acciones.accionTomada || '');
          cells.push(el.acciones.fechaTerminacion || '');
          cells.push(el.acciones.observaciones || '');
          cells.forEach((text, idx) => {
            const td = document.createElement('td');
            td.textContent = text;
            td.className = cols[idx].class;
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
      });
    });
  });
  table.appendChild(tbody);
  container.appendChild(table);
}

// Exportar la vista estándar a PDF utilizando html2canvas y jsPDF
async function exportStandardToPDF() {
  const container = document.getElementById('standard-table-container');
  if (!container) return;
  // Cargar librerías si no están presentes
  if (typeof html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    alert('Las librerías de exportación no están disponibles.');
    return;
  }
  // Renderizar como canvas
  const canvas = await html2canvas(container, { scale: 1 });
  const imgData = canvas.toDataURL('image/png');
  const { jsPDF } = window.jspdf;
  const pdf = new window.jspdf.jsPDF({
    orientation: 'l',
    unit: 'pt',
    format: [canvas.width, canvas.height]
  });
  pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
  pdf.save('vista_estandar_amfe.pdf');
}

// Control de pestañas principal (incluyendo la nueva vista estándar)
document.getElementById('tab-standard').addEventListener('click', () => {
  document.getElementById('standard-section').classList.add('active');
  document.getElementById('fmea-section').classList.remove('active');
  document.getElementById('control-section').classList.remove('active');
  document.getElementById('instructions-section').classList.remove('active');
  document.getElementById('iatf-section').classList.remove('active');
  document.getElementById('tab-standard').classList.add('active');
  document.getElementById('tab-fmea').classList.remove('active');
  document.getElementById('tab-control').classList.remove('active');
  document.getElementById('tab-instructions').classList.remove('active');
  document.getElementById('tab-iatf').classList.remove('active');
  // Generar la tabla estándar al activar la pestaña
  renderStandardView();
});

document.getElementById('tab-instructions').addEventListener('click', () => {
    document.getElementById('instructions-section').classList.add('active');
    document.getElementById('fmea-section').classList.remove('active');
    document.getElementById('control-section').classList.remove('active');
    document.getElementById('standard-section').classList.remove('active');
    document.getElementById('iatf-section').classList.remove('active');
    document.getElementById('tab-instructions').classList.add('active');
    document.getElementById('tab-fmea').classList.remove('active');
    document.getElementById('tab-control').classList.remove('active');
    document.getElementById('tab-standard').classList.remove('active');
    document.getElementById('tab-iatf').classList.remove('active');
    renderWorkInstructions();
});

// Botón de exportación de la vista estándar
document.getElementById('export-standard').addEventListener('click', exportStandardToPDF);

// --- Lógica para Instrucciones de Proceso ---
function renderWorkInstructions() {
    const container = document.getElementById('instructions-container');
    if (!container) return;

    container.innerHTML = ''; // Limpiar contenedor

    state.items.forEach(item => {
        item.steps.forEach(step => {
            const instructionDiv = document.createElement('div');
            instructionDiv.className = 'work-instruction';

            const title = document.createElement('h3');
            title.textContent = `Paso: ${step.name}`;
            instructionDiv.appendChild(title);

            const ul = document.createElement('ul');
            step.elements.forEach(el => {
                const li = document.createElement('li');
                let instructionText = `<strong>Elemento: ${el.type}</strong><br>`;

                // Añadir controles
                const controls = [
                    ...el.fallas.map(f => f.controlesDetect),
                    el.acciones.accionDet
                ].filter(Boolean).join('; ');

                if (controls) {
                    instructionText += `Control a aplicar: ${controls}<br>`;
                }

                // Añadir plan de reacción
                if (el.control && el.control.reactionPlan) {
                    instructionText += `Plan de reacción en caso de fallo: ${el.control.reactionPlan}`;
                }

                li.innerHTML = instructionText;
                ul.appendChild(li);
            });

            instructionDiv.appendChild(ul);
            container.appendChild(instructionDiv);
        });
    });
}

async function exportInstructionsToPDF() {
    const container = document.getElementById('instructions-container');
    if (!container) return;

    const canvas = await html2canvas(container, { scale: 1 });
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({
        orientation: 'p',
        unit: 'pt',
        format: [canvas.width, canvas.height]
    });
    pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
    pdf.save('instrucciones_de_proceso.pdf');
}

document.getElementById('export-instructions').addEventListener('click', exportInstructionsToPDF);


// No longer need to wrap these functions

// Cargar desde localStorage antes de inicializar
document.addEventListener('DOMContentLoaded', () => {
  // Cargar datos guardados desde el servidor antes de inicializar
  loadFromServer().then(() => {
    // Ejecuta la inicialización (crea un ítem por defecto si no hay)
    init();
    // Después de cargar e inicializar, renderizar vistas
    renderStructure();
    renderDetail();
    updateApDisplays();
  });
});

// Evento para mostrar u ocultar las guías de detección y clasificación.  Al cargar el
// documento, se asigna un manejador al botón "toggle-guidelines".  Este botón
// alterna la visibilidad del contenedor de guías y actualiza su texto para
// reflejar el estado actual (Mostrar/Ocultar).  Se coloca fuera de init para
// garantizar que funcione incluso si init redefine contenido de la página.
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-guidelines');
  const guideBox = document.getElementById('guidelines-box');
  if (toggleBtn && guideBox) {
    // Ya no añadimos un listener aquí, porque usamos la función global toggleGuidelines()
    // que se enlaza directamente desde el atributo onclick en el HTML.
  }
});

// Función global para mostrar u ocultar la sección de guías de detección y clasificación.
function toggleGuidelines() {
  const guideBox = document.getElementById('guidelines-box');
  const toggleBtn = document.getElementById('toggle-guidelines');
  if (!guideBox || !toggleBtn) return;
  if (guideBox.style.display === 'none') {
    guideBox.style.display = '';
    toggleBtn.textContent = 'Ocultar guías';
  } else {
    guideBox.style.display = 'none';
    toggleBtn.textContent = 'Mostrar guías';
  }
}

// ============================================
// GESTIÓN IATF 16949
// ============================================

// Tab handler for IATF section
document.getElementById('tab-iatf').addEventListener('click', () => {
  document.getElementById('iatf-section').classList.add('active');
  document.getElementById('fmea-section').classList.remove('active');
  document.getElementById('control-section').classList.remove('active');
  document.getElementById('standard-section').classList.remove('active');
  document.getElementById('instructions-section').classList.remove('active');
  document.getElementById('tab-iatf').classList.add('active');
  document.getElementById('tab-fmea').classList.remove('active');
  document.getElementById('tab-control').classList.remove('active');
  document.getElementById('tab-standard').classList.remove('active');
  document.getElementById('tab-instructions').classList.remove('active');
  renderIATFSection();
});

// Update existing tab handlers to handle IATF tab
const originalFmeaHandler = document.getElementById('tab-fmea');
originalFmeaHandler.addEventListener('click', () => {
  document.getElementById('tab-iatf').classList.remove('active');
  document.getElementById('iatf-section').classList.remove('active');
});

const originalControlHandler = document.getElementById('tab-control');
originalControlHandler.addEventListener('click', () => {
  document.getElementById('tab-iatf').classList.remove('active');
  document.getElementById('iatf-section').classList.remove('active');
});

// Render IATF Section
function renderIATFSection() {
  renderTemporaryControls();
  renderSupplyChain();
  renderEscalation();
  updateActiveControlsWarning();
  updateEscalationAlerts();
}

// Render Temporary Controls Table
function renderTemporaryControls() {
  const tbody = document.getElementById('temporary-controls-body');
  tbody.innerHTML = '';
  
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        const tr = document.createElement('tr');
        
        // Proceso/Paso
        const tdProcess = document.createElement('td');
        tdProcess.textContent = `${item.name} / ${step.name}`;
        tr.appendChild(tdProcess);
        
        // Elemento
        const tdElement = document.createElement('td');
        tdElement.textContent = el.type;
        tr.appendChild(tdElement);
        
        // Control Principal
        const tdMainControl = document.createElement('td');
        tdMainControl.textContent = el.control?.controlMethod || 'No definido';
        tr.appendChild(tdMainControl);
        
        // Control Alternativo
        const tdAltControl = document.createElement('td');
        const altInput = document.createElement('input');
        altInput.type = 'text';
        altInput.value = el.temporaryControl.alternativeMethod || '';
        altInput.placeholder = 'Método alternativo aprobado';
        altInput.addEventListener('input', () => {
          el.temporaryControl.alternativeMethod = altInput.value;
          el.temporaryControl.hasAlternative = altInput.value.trim() !== '';
        });
        tdAltControl.appendChild(altInput);
        tr.appendChild(tdAltControl);
        
        // Estado
        const tdStatus = document.createElement('td');
        if (el.temporaryControl.isActive) {
          const activeSpan = document.createElement('span');
          activeSpan.className = 'status-active';
          activeSpan.textContent = 'ACTIVO';
          tdStatus.appendChild(activeSpan);
        } else {
          const inactiveSpan = document.createElement('span');
          inactiveSpan.className = 'status-inactive';
          inactiveSpan.textContent = 'Inactivo';
          tdStatus.appendChild(inactiveSpan);
        }
        tr.appendChild(tdStatus);
        
        // Acciones
        const tdActions = document.createElement('td');
        
        if (!el.temporaryControl.isActive && el.temporaryControl.hasAlternative) {
          const btnActivate = document.createElement('button');
          btnActivate.className = 'btn-activate';
          btnActivate.textContent = 'Activar';
          btnActivate.addEventListener('click', () => {
            showActivateTemporaryControlModal(item, step, el);
          });
          tdActions.appendChild(btnActivate);
        }
        
        if (el.temporaryControl.isActive) {
          const btnDeactivate = document.createElement('button');
          btnDeactivate.className = 'btn-deactivate';
          btnDeactivate.textContent = 'Desactivar';
          btnDeactivate.addEventListener('click', () => {
            deactivateTemporaryControl(item, step, el);
          });
          tdActions.appendChild(btnDeactivate);
          
          const btnVerify = document.createElement('button');
          btnVerify.className = 'btn-configure';
          btnVerify.textContent = 'Verificar';
          btnVerify.addEventListener('click', () => {
            showDailyVerificationModal(item, step, el);
          });
          tdActions.appendChild(btnVerify);
        }
        
        tr.appendChild(tdActions);
        tbody.appendChild(tr);
      });
    });
  });
}

// Show modal to activate temporary control
function showActivateTemporaryControlModal(item, step, el) {
  // Create modal
  const modal = document.createElement('div');
  modal.className = 'iatf-modal';
  modal.innerHTML = `
    <div class="iatf-modal-content">
      <h3>⚠️ Activar Control Temporal</h3>
      <p><strong>Proceso:</strong> ${item.name} / ${step.name}</p>
      <p><strong>Elemento:</strong> ${el.type}</p>
      <p><strong>Control Alternativo:</strong> ${el.temporaryControl.alternativeMethod}</p>
      
      <label>
        Motivo de activación (obligatorio):
        <textarea id="temp-reason" required></textarea>
      </label>
      
      <label>
        Evaluación de riesgos (tipo FMEA) (obligatorio):
        <textarea id="temp-risk" required placeholder="Describir el efecto del método sustitutivo..."></textarea>
      </label>
      
      <label>
        Tipo de límite:
        <select id="temp-limit-type">
          <option value="date">Fecha límite</option>
          <option value="quantity">Cantidad de producción</option>
        </select>
      </label>
      
      <label>
        Valor del límite:
        <input type="text" id="temp-limit-value" placeholder="Fecha (YYYY-MM-DD) o cantidad">
      </label>
      
      <label>
        Aprobación interna (nombre):
        <input type="text" id="temp-approval-internal" required>
      </label>
      
      <label>
        Aprobación del cliente (si requerido):
        <input type="text" id="temp-approval-client">
      </label>
      
      <div class="iatf-modal-buttons">
        <button class="btn-cancel">Cancelar</button>
        <button class="btn-confirm">Activar Control Temporal</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
  
  // Cancel button
  modal.querySelector('.btn-cancel').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  // Confirm button
  modal.querySelector('.btn-confirm').addEventListener('click', () => {
    const reason = document.getElementById('temp-reason').value;
    const risk = document.getElementById('temp-risk').value;
    const limitType = document.getElementById('temp-limit-type').value;
    const limitValue = document.getElementById('temp-limit-value').value;
    const approvalInternal = document.getElementById('temp-approval-internal').value;
    const approvalClient = document.getElementById('temp-approval-client').value;
    
    if (!reason || !risk || !approvalInternal) {
      alert('Debe completar los campos obligatorios: Motivo, Evaluación de riesgos y Aprobación interna.');
      return;
    }
    
    // Activate temporary control
    el.temporaryControl.isActive = true;
    el.temporaryControl.activationDate = new Date().toISOString().split('T')[0];
    el.temporaryControl.reason = reason;
    el.temporaryControl.riskAssessment = risk;
    el.temporaryControl.limitType = limitType;
    el.temporaryControl.limitValue = limitValue;
    el.temporaryControl.approvalInternal = approvalInternal;
    el.temporaryControl.approvalClient = approvalClient;
    
    alert(`⚠️ CONTROL TEMPORAL ACTIVADO\n\nControl: ${el.temporaryControl.alternativeMethod}\nSe requiere trazabilidad del 100% del producto.\nSe debe revisar diariamente la eficacia del control.`);
    
    document.body.removeChild(modal);
    renderIATFSection();
  });
}

// Deactivate temporary control
function deactivateTemporaryControl(item, step, el) {
  if (!confirm(`¿Está seguro de desactivar el control temporal para ${el.type}?`)) {
    return;
  }
  
  el.temporaryControl.isActive = false;
  el.temporaryControl.deactivationDate = new Date().toISOString().split('T')[0];
  
  alert('Control temporal desactivado. El control principal ha sido restaurado.');
  renderIATFSection();
}

// Show daily verification modal
function showDailyVerificationModal(item, step, el) {
  const modal = document.createElement('div');
  modal.className = 'iatf-modal';
  modal.innerHTML = `
    <div class="iatf-modal-content">
      <h3>Verificación Diaria del Control Temporal</h3>
      <p><strong>Control:</strong> ${el.temporaryControl.alternativeMethod}</p>
      
      <label>
        Fecha de verificación:
        <input type="date" id="verify-date" value="${new Date().toISOString().split('T')[0]}">
      </label>
      
      <label>
        Verificado por:
        <input type="text" id="verify-by" required>
      </label>
      
      <label>
        Resultado de verificación:
        <select id="verify-result">
          <option value="OK">Conforme</option>
          <option value="NOK">No conforme</option>
        </select>
      </label>
      
      <label>
        Lote/Serie rastreado:
        <input type="text" id="verify-lot">
      </label>
      
      <label>
        Observaciones:
        <textarea id="verify-obs"></textarea>
      </label>
      
      <div class="iatf-modal-buttons">
        <button class="btn-cancel">Cancelar</button>
        <button class="btn-confirm">Registrar Verificación</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
  
  modal.querySelector('.btn-cancel').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('.btn-confirm').addEventListener('click', () => {
    const date = document.getElementById('verify-date').value;
    const by = document.getElementById('verify-by').value;
    const result = document.getElementById('verify-result').value;
    const lot = document.getElementById('verify-lot').value;
    const obs = document.getElementById('verify-obs').value;
    
    if (!by) {
      alert('Debe indicar quién realizó la verificación.');
      return;
    }
    
    el.temporaryControl.dailyVerifications.push({
      date,
      by,
      result,
      lot,
      observations: obs
    });
    
    if (lot) {
      el.temporaryControl.traceabilityLots.push(lot);
    }
    
    alert('Verificación registrada correctamente.');
    document.body.removeChild(modal);
  });
}

// Update active controls warning
function updateActiveControlsWarning() {
  const warningDiv = document.getElementById('temporary-controls-active-warning');
  const listDiv = document.getElementById('active-controls-list');
  
  const activeControls = [];
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        if (el.temporaryControl.isActive) {
          activeControls.push({
            process: `${item.name} / ${step.name}`,
            element: el.type,
            control: el.temporaryControl.alternativeMethod,
            activationDate: el.temporaryControl.activationDate,
            limit: `${el.temporaryControl.limitType === 'date' ? 'Fecha' : 'Cantidad'}: ${el.temporaryControl.limitValue}`
          });
        }
      });
    });
  });
  
  if (activeControls.length > 0) {
    warningDiv.style.display = 'block';
    listDiv.innerHTML = '<ul>' + activeControls.map(c => 
      `<li><strong>${c.process} - ${c.element}:</strong> ${c.control} (Activado: ${c.activationDate}, ${c.limit})</li>`
    ).join('') + '</ul>';
  } else {
    warningDiv.style.display = 'none';
  }
}

// Render Supply Chain Management Table
function renderSupplyChain() {
  const tbody = document.getElementById('supply-chain-body');
  tbody.innerHTML = '';
  
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        const tr = document.createElement('tr');
        
        // Proceso/Paso
        const tdProcess = document.createElement('td');
        tdProcess.textContent = `${item.name} / ${step.name}`;
        tr.appendChild(tdProcess);
        
        // Elemento
        const tdElement = document.createElement('td');
        tdElement.textContent = el.type;
        tr.appendChild(tdElement);
        
        // Es PTC
        const tdPTC = document.createElement('td');
        const ptcCheck = document.createElement('input');
        ptcCheck.type = 'checkbox';
        ptcCheck.checked = el.supplyChain.isPassThrough;
        ptcCheck.addEventListener('change', () => {
          el.supplyChain.isPassThrough = ptcCheck.checked;
        });
        tdPTC.appendChild(ptcCheck);
        tr.appendChild(tdPTC);
        
        // Proveedor
        const tdSupplier = document.createElement('td');
        const supplierInput = document.createElement('input');
        supplierInput.type = 'text';
        supplierInput.value = el.supplyChain.supplierName || '';
        supplierInput.addEventListener('input', () => {
          el.supplyChain.supplierName = supplierInput.value;
        });
        tdSupplier.appendChild(supplierInput);
        tr.appendChild(tdSupplier);
        
        // PFMEA Proveedor
        const tdPFMEA = document.createElement('td');
        const pfmeaInput = document.createElement('input');
        pfmeaInput.type = 'text';
        pfmeaInput.value = el.supplyChain.supplierPFMEA || '';
        pfmeaInput.placeholder = 'Ref. documento';
        pfmeaInput.addEventListener('input', () => {
          el.supplyChain.supplierPFMEA = pfmeaInput.value;
        });
        tdPFMEA.appendChild(pfmeaInput);
        tr.appendChild(tdPFMEA);
        
        // Última Auditoría
        const tdAudit = document.createElement('td');
        const auditInput = document.createElement('input');
        auditInput.type = 'date';
        auditInput.value = el.supplyChain.supplierAuditDate || '';
        auditInput.addEventListener('input', () => {
          el.supplyChain.supplierAuditDate = auditInput.value;
        });
        tdAudit.appendChild(auditInput);
        tr.appendChild(tdAudit);
        
        // Estado
        const tdStatus = document.createElement('td');
        const statusSelect = document.createElement('select');
        statusSelect.innerHTML = `
          <option value="">Seleccionar...</option>
          <option value="Conforme">Conforme</option>
          <option value="No conforme">No conforme</option>
          <option value="Pendiente">Pendiente</option>
        `;
        statusSelect.value = el.supplyChain.supplierAuditStatus || '';
        statusSelect.addEventListener('change', () => {
          el.supplyChain.supplierAuditStatus = statusSelect.value;
        });
        tdStatus.appendChild(statusSelect);
        tr.appendChild(tdStatus);
        
        // Control en Fabricación
        const tdControl = document.createElement('td');
        const controlInput = document.createElement('input');
        controlInput.type = 'text';
        controlInput.value = el.supplyChain.controlAtManufacture || '';
        controlInput.placeholder = 'Describir controles...';
        controlInput.addEventListener('input', () => {
          el.supplyChain.controlAtManufacture = controlInput.value;
        });
        tdControl.appendChild(controlInput);
        tr.appendChild(tdControl);
        
        tbody.appendChild(tr);
      });
    });
  });
}

// Render Escalation Table
function renderEscalation() {
  const tbody = document.getElementById('escalation-body');
  tbody.innerHTML = '';
  
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        // Solo mostrar elementos con severidad alta o con escalación existente
        const severity = parseInt(el.riesgos.severidad) || 0;
        if (severity < 9 && !el.escalation.requiresEscalation) {
          return; // Skip this element
        }
        
        const tr = document.createElement('tr');
        
        // Proceso/Paso
        const tdProcess = document.createElement('td');
        tdProcess.textContent = `${item.name} / ${step.name}`;
        tr.appendChild(tdProcess);
        
        // Elemento
        const tdElement = document.createElement('td');
        tdElement.textContent = el.type;
        tr.appendChild(tdElement);
        
        // Severidad
        const tdSeverity = document.createElement('td');
        tdSeverity.textContent = el.riesgos.severidad || 'N/A';
        if (severity >= 9) {
          tdSeverity.style.backgroundColor = '#ffcccc';
          tdSeverity.style.fontWeight = 'bold';
        }
        tr.appendChild(tdSeverity);
        
        // Modo de Fallo
        const tdFailure = document.createElement('td');
        const failures = el.fallas.map(f => f.modo).filter(Boolean).join(', ');
        tdFailure.textContent = failures || 'No definido';
        tr.appendChild(tdFailure);
        
        // Requiere Escalación
        const tdRequires = document.createElement('td');
        const requiresCheck = document.createElement('input');
        requiresCheck.type = 'checkbox';
        requiresCheck.checked = el.escalation.requiresEscalation || severity >= 9;
        requiresCheck.disabled = severity >= 9; // Auto-required for high severity
        requiresCheck.addEventListener('change', () => {
          el.escalation.requiresEscalation = requiresCheck.checked;
          if (!requiresCheck.checked) {
            el.escalation.escalationDate = '';
            el.escalation.escalatedTo = '';
            el.escalation.escalationReason = '';
            el.escalation.escalationStatus = '';
          }
        });
        tdRequires.appendChild(requiresCheck);
        tr.appendChild(tdRequires);
        
        // Escalado A
        const tdEscalatedTo = document.createElement('td');
        const escalatedInput = document.createElement('input');
        escalatedInput.type = 'text';
        escalatedInput.value = el.escalation.escalatedTo || '';
        escalatedInput.placeholder = 'Nombre/Cargo';
        escalatedInput.addEventListener('input', () => {
          el.escalation.escalatedTo = escalatedInput.value;
        });
        tdEscalatedTo.appendChild(escalatedInput);
        tr.appendChild(tdEscalatedTo);
        
        // Fecha
        const tdDate = document.createElement('td');
        const dateInput = document.createElement('input');
        dateInput.type = 'date';
        dateInput.value = el.escalation.escalationDate || '';
        dateInput.addEventListener('input', () => {
          el.escalation.escalationDate = dateInput.value;
        });
        tdDate.appendChild(dateInput);
        tr.appendChild(tdDate);
        
        // Estado
        const tdStatus = document.createElement('td');
        const statusSelect = document.createElement('select');
        statusSelect.innerHTML = `
          <option value="">Seleccionar...</option>
          <option value="Pendiente">Pendiente</option>
          <option value="En revisión">En revisión</option>
          <option value="Resuelta">Resuelta</option>
        `;
        statusSelect.value = el.escalation.escalationStatus || '';
        statusSelect.addEventListener('change', () => {
          el.escalation.escalationStatus = statusSelect.value;
        });
        tdStatus.appendChild(statusSelect);
        tr.appendChild(tdStatus);
        
        // Acciones
        const tdActions = document.createElement('td');
        const btnEscalate = document.createElement('button');
        btnEscalate.className = 'btn-escalate';
        btnEscalate.textContent = 'Registrar Escalación';
        btnEscalate.addEventListener('click', () => {
          showEscalationModal(item, step, el);
        });
        tdActions.appendChild(btnEscalate);
        tr.appendChild(tdActions);
        
        tbody.appendChild(tr);
      });
    });
  });
}

// Show escalation modal
function showEscalationModal(item, step, el) {
  const modal = document.createElement('div');
  modal.className = 'iatf-modal';
  modal.innerHTML = `
    <div class="iatf-modal-content">
      <h3>🚨 Registrar Escalación de Riesgo</h3>
      <p><strong>Proceso:</strong> ${item.name} / ${step.name}</p>
      <p><strong>Elemento:</strong> ${el.type}</p>
      <p><strong>Severidad:</strong> ${el.riesgos.severidad}</p>
      
      <label>
        Escalado a (nombre/cargo):
        <input type="text" id="esc-to" value="${el.escalation.escalatedTo || ''}" required>
      </label>
      
      <label>
        Fecha de escalación:
        <input type="date" id="esc-date" value="${el.escalation.escalationDate || new Date().toISOString().split('T')[0]}">
      </label>
      
      <label>
        Motivo de escalación:
        <textarea id="esc-reason" required>${el.escalation.escalationReason || ''}</textarea>
      </label>
      
      <label>
        Estado:
        <select id="esc-status">
          <option value="Pendiente">Pendiente</option>
          <option value="En revisión">En revisión</option>
          <option value="Resuelta">Resuelta</option>
        </select>
      </label>
      
      <div class="iatf-modal-buttons">
        <button class="btn-cancel">Cancelar</button>
        <button class="btn-confirm">Guardar Escalación</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  modal.style.display = 'block';
  
  modal.querySelector('.btn-cancel').addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  modal.querySelector('.btn-confirm').addEventListener('click', () => {
    const to = document.getElementById('esc-to').value;
    const date = document.getElementById('esc-date').value;
    const reason = document.getElementById('esc-reason').value;
    const status = document.getElementById('esc-status').value;
    
    if (!to || !reason) {
      alert('Debe completar los campos obligatorios.');
      return;
    }
    
    el.escalation.requiresEscalation = true;
    el.escalation.escalatedTo = to;
    el.escalation.escalationDate = date;
    el.escalation.escalationReason = reason;
    el.escalation.escalationStatus = status;
    
    alert('Escalación registrada correctamente.');
    document.body.removeChild(modal);
    renderIATFSection();
  });
}

// Update escalation alerts
function updateEscalationAlerts() {
  const alertsDiv = document.getElementById('escalation-alerts');
  const listDiv = document.getElementById('escalation-alerts-list');
  
  const pendingEscalations = [];
  state.items.forEach(item => {
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        const severity = parseInt(el.riesgos.severidad) || 0;
        if (severity >= 9 && (!el.escalation.escalatedTo || el.escalation.escalationStatus === 'Pendiente')) {
          pendingEscalations.push({
            process: `${item.name} / ${step.name}`,
            element: el.type,
            severity: el.riesgos.severidad
          });
        }
      });
    });
  });
  
  if (pendingEscalations.length > 0) {
    alertsDiv.style.display = 'block';
    listDiv.innerHTML = '<ul>' + pendingEscalations.map(e => 
      `<li><strong>${e.process} - ${e.element}:</strong> Severidad ${e.severity} - Requiere escalación inmediata</li>`
    ).join('') + '</ul>';
  } else {
    alertsDiv.style.display = 'none';
  }
}

// Collapsible sections functionality
function toggleSection(contentId) {
  const content = document.getElementById(contentId);
  const header = content.previousElementSibling;
  
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed');
    header.classList.remove('collapsed');
  } else {
    content.classList.add('collapsed');
    header.classList.add('collapsed');
  }
}

// Scroll to top functionality
function scrollToTop() {
  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

// Initialize collapsible sections on page load
document.addEventListener('DOMContentLoaded', () => {
  // Collapse "Datos generales" by default after 2 seconds to give user time to see it
  setTimeout(() => {
    const generalInfoContent = document.getElementById('general-info-content');
    const generalInfoHeader = generalInfoContent?.previousElementSibling;
    if (generalInfoContent && !generalInfoContent.querySelector('input:focus')) {
      generalInfoContent.classList.add('collapsed');
      if (generalInfoHeader) {
        generalInfoHeader.classList.add('collapsed');
      }
    }
  }, 2000);
});

// Update progress summary
function updateProgressSummary() {
  let itemCount = 0;
  let elementCount = 0;
  let criticalCount = 0;
  let completedElements = 0;
  
  state.items.forEach(item => {
    itemCount++;
    item.steps.forEach(step => {
      step.elements.forEach(el => {
        elementCount++;
        
        // Count critical risks
        const severity = parseInt(el.riesgos.severidad) || 0;
        if (severity >= 9) {
          criticalCount++;
        }
        
        // Check if element is completed (has basic data filled)
        if (el.funciones.funcionElemento && el.riesgos.severidad && el.riesgos.ocurrencia && el.riesgos.deteccion) {
          completedElements++;
        }
      });
    });
  });
  
  const completion = elementCount > 0 ? Math.round((completedElements / elementCount) * 100) : 0;
  
  // Update progress displays
  const itemsEl = document.getElementById('progress-items');
  const elementsEl = document.getElementById('progress-elements');
  const criticalEl = document.getElementById('progress-critical');
  const completionEl = document.getElementById('progress-completion');
  
  if (itemsEl) itemsEl.textContent = itemCount;
  if (elementsEl) elementsEl.textContent = elementCount;
  if (criticalEl) criticalEl.textContent = criticalCount;
  if (completionEl) completionEl.textContent = completion + '%';
}

// Call updateProgressSummary whenever the state changes
const originalRenderStructure = renderStructure;
renderStructure = function() {
  originalRenderStructure();
  updateProgressSummary();
};

const originalSaveElementData = saveElementData;
saveElementData = function() {
  originalSaveElementData();
  updateProgressSummary();
};

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl+S or Cmd+S to save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) {
      saveBtn.click();
    }
  }
  
  // Escape to close modals
  if (e.key === 'Escape') {
    const modals = document.querySelectorAll('.modal, .iatf-modal');
    modals.forEach(modal => {
      if (modal.style.display !== 'none') {
        modal.style.display = 'none';
      }
    });
  }
});

// Add tooltips to action buttons
document.addEventListener('DOMContentLoaded', () => {
  // Add tooltip styles if not already present
  if (!document.getElementById('tooltip-styles')) {
    const tooltipStyles = document.createElement('style');
    tooltipStyles.id = 'tooltip-styles';
    tooltipStyles.textContent = `
      [data-tooltip] {
        position: relative;
      }
      
      [data-tooltip]::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: 100%;
        left: 50%;
        transform: translateX(-50%);
        padding: 0.5rem;
        background: rgba(0,0,0,0.9);
        color: white;
        border-radius: 4px;
        font-size: 0.85rem;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s;
        margin-bottom: 5px;
        z-index: 1000;
      }
      
      [data-tooltip]:hover::after {
        opacity: 1;
      }
    `;
    document.head.appendChild(tooltipStyles);
  }
  
  // Ensure progress summary is initialized
  setTimeout(() => {
    if (typeof updateProgressSummary === 'function') {
      updateProgressSummary();
    }
  }, 500);
});

// Improve tree item hover effects
const improveTreeItemHover = () => {
  const style = document.createElement('style');
  style.textContent = `
    .tree-row:hover {
      background-color: rgba(52, 152, 219, 0.1);
      border-radius: 4px;
      transition: background-color 0.2s ease;
    }
    
    .tree-row.active {
      background-color: var(--secondary-color);
      color: white;
      border-radius: 4px;
    }
    
    .subtabs .detail-tab {
      position: relative;
    }
    
    .subtabs .detail-tab.active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 3px;
      background: var(--secondary-color);
    }
  `;
  document.head.appendChild(style);
};

// Initialize improvements
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', improveTreeItemHover);
} else {
  improveTreeItemHover();
}
