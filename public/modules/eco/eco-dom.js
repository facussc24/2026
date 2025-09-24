/**
 * @file Contains all DOM generation logic for the ECO module's form.
 */

export const formSectionsData = [
    {
        title: 'ENG. PRODUCTO', id: 'eng_producto', icon: 'drafting-compass',
        checklist: [ '¿Se requiere cambio en el plano?', '¿Se requiere cambio en la especificación?', '¿Se requiere un nuevo herramental?', '¿Se requiere un nuevo dispositivo?' ]
    },
    {
        title: 'CALIDAD', id: 'calidad', icon: 'award',
        checklist: [ '¿Se requiere un nuevo plan de control?', '¿Se requiere un nuevo estudio de capacidad?', '¿Se requiere un nuevo R&R?', '¿Se requiere un nuevo layout?' ]
    },
    {
        title: 'ENG. PROCESO', id: 'eng_proceso', icon: 'cpu',
        checklist: [ '¿Se requiere un nuevo diagrama de flujo?', '¿Se requiere un nuevo AMEF?', '¿Se requiere un nuevo estudio de tiempos?', '¿Se requiere una nueva instrucción de trabajo?' ]
    },
    {
        title: 'DOCUMENTACIÓN CALIDAD', id: 'doc_calidad', icon: 'folder-check',
        checklist: [ '¿Se actualizó el AMFE de Proceso?', '¿Se actualizó el Plan de Control?', '¿Se actualizaron las Hojas de Proceso?', '¿Se actualizó el Diagrama de Flujo?' ]
    },
    {
        title: 'COMPRAS', id: 'compras', icon: 'shopping-cart',
        checklist: [ '¿Se requiere un nuevo proveedor?', '¿Se requiere un nuevo acuerdo de precios?', '¿Se requiere un nuevo embalaje?', '¿Se requiere un nuevo transporte?' ]
    },
    {
        title: 'LOGISTICA', id: 'logistica', icon: 'truck',
        checklist: [ '¿Se requiere un nuevo layout de almacén?', '¿Se requiere un nuevo sistema de identificación?', '¿Se requiere un nuevo flujo de materiales?', '¿Se requiere un nuevo sistema de transporte interno?' ]
    },
    {
        title: 'IMPLEMENTACIÓN', id: 'implementacion', icon: 'rocket',
        checklist: [ '¿Plan de acción completado?', '¿Se requiere actualizar el stock?', '¿Se requiere notificar al cliente?', '¿Se requiere capacitar al personal?', '¿Se requiere validar el proceso?' ]
    },
    {
        title: 'PLAN DE ACCIÓN', id: 'action_plan', icon: 'list-checks'
    },
    {
        title: 'APROBACIÓN FINAL', id: 'aprobacion_final', icon: 'flag',
        description: 'Aprobación final del ECO y cierre del proceso.',
        checklist: null
    }
];

export function getWizardLayoutHTML() {
    return `
        <header class="flex justify-between items-start border-b-2 pb-4 mb-6">
            <div>
                <img src="/barack_logo.png" alt="Logo" class="h-12">
                <button type="button" data-action="fill-all-with-ai" class="mt-2 bg-purple-600 text-white hover:bg-purple-700 font-semibold py-2 px-4 rounded-lg flex items-center gap-2">
                    <i data-lucide="brain-circuit" class="w-5 h-5 pointer-events-none"></i>
                    Rellenar todo con IA
                </button>
            </div>
            <div class="text-right">
                <h2 class="text-xl font-bold text-slate-800">ECO DE PRODUCTO / PROCESO</h2>
                <div class="form-field mt-1">
                    <input type="text" id="ecr_no_display" class="border-2 border-gray-300 rounded-md p-2 w-72 bg-gray-100" readonly placeholder="Seleccionar ECR...">
                    <input type="hidden" name="ecr_no" id="ecr_no">
                    <button type="button" data-action="open-ecr-search-for-eco" class="bg-blue-500 text-white p-2.5 rounded-md hover:bg-blue-600 align-bottom"><i data-lucide="search" class="h-5 w-5 pointer-events-none"></i></button>
                </div>
            </div>
        </header>

        <div id="eco-wizard" class="relative">
            <!-- Step Indicator -->
            <div id="wizard-steps" class="flex items-center justify-center mb-8"></div>

            <!-- Form Content -->
            <main id="wizard-content" class="bg-white p-8 rounded-lg shadow-inner border border-slate-200"></main>

            <!-- Navigation -->
            <footer id="wizard-navigation" class="mt-8 flex justify-between items-center"></footer>
        </div>
    `;
}

export function buildWizardStepsHTML(currentStep) {
    let stepsHTML = '';
    formSectionsData.forEach((section, index) => {
        const isCompleted = index < currentStep;
        const isActive = index === currentStep;
        stepsHTML += `
            <div class="flex items-center">
                <div class="flex flex-col items-center">
                    <div class="w-10 h-10 rounded-full flex items-center justify-center
                        ${isActive ? 'bg-blue-600 text-white font-bold' : ''}
                        ${isCompleted ? 'bg-green-500 text-white' : ''}
                        ${!isActive && !isCompleted ? 'bg-slate-200 text-slate-500' : ''}">
                        ${isCompleted ? '<i data-lucide="check" class="w-6 h-6"></i>' : `<i data-lucide="${section.icon}" class="w-5 h-5"></i>`}
                    </div>
                    <p class="text-xs text-center mt-2 w-24 ${isActive ? 'text-blue-600 font-semibold' : 'text-slate-500'}">${section.title}</p>
                </div>
                ${index < formSectionsData.length - 1 ? '<div class="flex-auto border-t-2 mx-4 ' + (isCompleted ? 'border-green-500' : 'border-slate-200') + '"></div>' : ''}
            </div>
        `;
    });
    return stepsHTML;
}

export function buildSectionHTML(section, index) {
    const isHidden = index !== 0; // Hide all but the first step initially
    if (section.id === 'action_plan') {
        return buildActionPlanHTML(isHidden);
    }

    const checklistItemsHTML = section.checklist
        ? section.checklist.map((item, chIndex) => `
            <div class="flex justify-between items-center py-2 border-b border-slate-100">
                <span class="text-sm">${item}</span>
                <div class="flex items-center gap-6">
                    <label class="flex items-center gap-2 text-sm font-medium cursor-pointer"><input type="checkbox" name="check_${section.id}_${chIndex}_si" class="h-5 w-5 text-blue-600 rounded-md border-gray-300 focus:ring-blue-500"><span>SI</span></label>
                    <label class="flex items-center gap-2 text-sm font-medium cursor-pointer"><input type="checkbox" name="check_${section.id}_${chIndex}_na" class="h-5 w-5 text-gray-400 rounded-md border-gray-300 focus:ring-gray-500"><span>N/A</span></label>
                </div>
            </div>`).join('')
        : '';

    const commentsHTML = `
        <div class="flex-1">
            <div class="flex justify-between items-center mb-2">
                <label for="comments_${section.id}" class="block font-bold text-slate-700">Comentarios:</label>
                <button type="button" data-action="generate-ai-comment" data-section-id="${section.id}" class="text-xs bg-blue-100 text-blue-800 hover:bg-blue-200 font-semibold py-1 px-3 rounded-full flex items-center gap-1">
                    <i data-lucide="sparkles" class="w-4 h-4"></i>
                    Generar con IA
                </button>
            </div>
            <textarea id="comments_${section.id}" name="comments_${section.id}" rows="8" class="w-full border-slate-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"></textarea>
        </div>`;

    const mainContentHTML = section.checklist ? `<div class="flex-1 space-y-2 pr-6 border-r border-slate-200">${checklistItemsHTML}</div>${commentsHTML}` : `<div class="p-4 w-full text-center text-slate-500 italic">${section.description}</div>`;

    const statusFieldHTML = section.checklist ? `
        <div>
            <label class="text-sm font-medium text-slate-600">Estado</label>
            <div class="flex items-center gap-4 mt-1">
                <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="status_${section.id}" value="ok" class="h-4 w-4 text-green-600 focus:ring-green-500"> <span class="font-semibold text-green-700">OK</span></label>
                <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="status_${section.id}" value="nok" class="h-4 w-4 text-red-600 focus:ring-red-500"> <span class="font-semibold text-red-700">NOK</span></label>
            </div>
        </div>` : '';

    return `
    <div data-step="${index}" class="${isHidden ? 'hidden' : ''}">
        <section class="border border-slate-200 rounded-xl bg-white shadow-sm">
            <header class="bg-slate-50 px-5 py-3 font-bold text-lg text-slate-800 flex items-center gap-3 border-b border-slate-200 rounded-t-xl">
                <i data-lucide="${section.icon || 'help-circle'}" class="w-6 h-6 text-blue-600"></i>
                <span>${section.title}</span>
            </header>
            <div class="p-5">
                <div class="flex gap-6">${mainContentHTML}</div>
            </div>
            <footer class="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-wrap items-end gap-x-6 gap-y-3 text-sm rounded-b-xl">
                <div><label class="block text-xs font-medium text-slate-500">Fecha de Revisión</label><input type="date" name="date_review_${section.id}" class="mt-1 p-1 border border-slate-300 rounded-md shadow-sm"></div>
                ${statusFieldHTML}
                <div class="flex-grow"></div>
                <div><label class="block text-xs font-medium text-slate-500">Nombre del Aprobador</label><input type="text" name="name_${section.id}" class="mt-1 p-1 border border-slate-300 rounded-md shadow-sm w-48"></div>
                <div><label class="block text-xs font-medium text-slate-500">Firma</label><input type="text" name="visto_${section.id}" class="mt-1 p-1 border border-slate-300 rounded-md shadow-sm w-32"></div>
            </footer>
        </section>
    </div>`;
}

export function buildActionPlanHTML(isHidden) {
    return `
    <div data-step="${formSectionsData.findIndex(s => s.id === 'action_plan')}" class="${isHidden ? 'hidden' : ''}">
        <section class="border border-slate-200 rounded-xl bg-white shadow-sm">
            <header class="bg-slate-50 px-5 py-3 font-bold text-lg text-slate-800 flex items-center gap-3 border-b border-slate-200 rounded-t-xl">
                 <i data-lucide="list-checks" class="w-6 h-6 text-blue-600"></i>
                 <span>PLAN DE ACCIÓN</span>
            </header>
            <div class="p-4">
                <div class="flex justify-end mb-4">
                    <button type="button" data-action="ai-generate-action-plan" class="bg-blue-100 text-blue-800 hover:bg-blue-200 font-semibold py-2 px-4 rounded-lg flex items-center gap-2">
                        <i data-lucide="sparkles" class="w-5 h-5 pointer-events-none"></i>
                        Sugerir Plan de Acción con IA
                    </button>
                </div>
                <div id="action-plan-list" class="space-y-2"></div>
                <div id="add-action-item-form" class="mt-4 flex items-end gap-3 p-3 bg-slate-50 rounded-lg border">
                    <div class="flex-grow"><label class="text-xs font-bold text-slate-600">Nueva Acción</label><input type="text" id="new-action-description" placeholder="Descripción de la tarea..." class="w-full mt-1 p-2 border rounded-md"></div>
                    <div class="w-48"><label class="text-xs font-bold text-slate-600">Responsable</label><select id="new-action-assignee" class="w-full mt-1 p-2 border rounded-md"></select></div>
                    <div class="w-40"><label class="text-xs font-bold text-slate-600">Fecha Límite</label><input type="date" id="new-action-duedate" class="w-full mt-1 p-2 border rounded-md"></div>
                    <button type="button" data-action="add-action-item" class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 font-semibold h-10">Agregar</button>
                </div>
            </div>
        </section>
    </div>`;
}

export function buildWizardNavHTML(currentStep) {
    const isFirstStep = currentStep === 0;
    const isLastStep = currentStep === formSectionsData.length - 1;

    const prevButton = isFirstStep
        ? `<button type="button" id="eco-back-button" class="bg-gray-200 text-gray-800 px-6 py-3 rounded-lg hover:bg-gray-300 font-semibold">Volver a la Lista</button>`
        : `<button type="button" data-action="prev-step" class="bg-blue-500 text-white px-8 py-3 rounded-lg hover:bg-blue-600 font-semibold flex items-center gap-2"><i data-lucide="arrow-left"></i> Anterior</button>`;

    const nextButton = isLastStep
        ? `<button type="button" data-action="approve" class="bg-green-600 text-white px-8 py-3 rounded-lg hover:bg-green-700 font-semibold flex items-center gap-2">Aprobar y Guardar <i data-lucide="check-circle"></i></button>`
        : `<button type="button" data-action="next-step" class="bg-blue-500 text-white px-8 py-3 rounded-lg hover:bg-blue-600 font-semibold flex items-center gap-2">Siguiente <i data-lucide="arrow-right"></i></button>`;

    return `
        <div>
            ${prevButton}
        </div>
        <div>
            <button type="button" data-action="save-progress" class="bg-gray-500 text-white px-6 py-3 rounded-lg hover:bg-gray-600 font-semibold">Guardar Progreso</button>
            ${nextButton}
        </div>
    `;
}
