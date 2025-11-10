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
    aprobOtras: ''
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
  if (classif === 'Crítica') {
    caracteristicasField.classList.add('critica');
  } else if (classif === 'Significativa') {
    caracteristicasField.classList.add('significativa');
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
    fallas: []
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
            sampleQuantity: '',
            sampleFrequency: '',
            controlMethod: '',
            reactionPlan: ''
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
        if (!el.control.specialClass) {
          el.control.specialClass = classif;
        }
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
        // 10: Error proofing
        const tdError = document.createElement('td');
        const errorInput = document.createElement('input');
        errorInput.type = 'text';
        errorInput.placeholder = 'Poka yoke / Error proofing';
        errorInput.value = el.control.errorProofing || '';
        errorInput.addEventListener('input', () => {
          el.control.errorProofing = errorInput.value;
        });
        tdError.appendChild(errorInput);
        tr.appendChild(tdError);
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
        // 13: Método de control
        const tdCtrl = document.createElement('td');
        const ctrlInput = document.createElement('input');
        ctrlInput.type = 'text';
        ctrlInput.placeholder = 'Método de control';
        ctrlInput.value = el.control.controlMethod || '';
        ctrlInput.addEventListener('input', () => {
          el.control.controlMethod = ctrlInput.value;
        });
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

// Tab principal (FMEA / Plan de control)
document.getElementById('tab-fmea').addEventListener('click', () => {
  document.getElementById('fmea-section').classList.add('active');
  document.getElementById('control-section').classList.remove('active');
  document.getElementById('standard-section').classList.remove('active');
  document.getElementById('tab-fmea').classList.add('active');
  document.getElementById('tab-control').classList.remove('active');
  document.getElementById('tab-standard').classList.remove('active');
});
document.getElementById('tab-control').addEventListener('click', () => {
  document.getElementById('control-section').classList.add('active');
  document.getElementById('fmea-section').classList.remove('active');
  document.getElementById('standard-section').classList.remove('active');
  document.getElementById('tab-control').classList.add('active');
  document.getElementById('tab-fmea').classList.remove('active');
  document.getElementById('tab-standard').classList.remove('active');
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
  document.getElementById('tab-standard').classList.add('active');
  document.getElementById('tab-fmea').classList.remove('active');
  document.getElementById('tab-control').classList.remove('active');
  // Generar la tabla estándar al activar la pestaña
  renderStandardView();
});

// Botón de exportación de la vista estándar
document.getElementById('export-standard').addEventListener('click', exportStandardToPDF);

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