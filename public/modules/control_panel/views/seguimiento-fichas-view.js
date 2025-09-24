/**
 * @file Manages the Seguimiento ECR/ECO View, which shows individual follow-up sheets.
 */
import { COLLECTIONS } from '/utils.js';

/**
 * Renders the Seguimiento ECR/ECO view.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - Firestore functions { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, writeBatch, limit }.
 * @param {object} deps.dom - DOM elements mapping.
 * @param {function} deps.lucide - Lucide icons creation function.
 * @param {object} deps.appState - The global application state.
 * @param {function} deps.showToast - Function to show a toast notification.
 * @param {function} deps.switchView - Function to switch views.
 * @param {function} deps.showConfirmationModal - Function to show a confirmation modal.
 * @param {function} deps.checkUserPermission - Function to check user permissions.
 */
export function renderSeguimientoFichasView(deps) {
    const { db, firestore, dom, lucide, appState, showToast, switchView, showConfirmationModal, checkUserPermission } = deps;
    const { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, writeBatch, limit, orderBy } = firestore;

    dom.headerActions.style.display = 'none';
    const SEGUIMIENTO_COLLECTION = 'seguimiento_ecr_eco';
    let unsubscribe;
    let sortConfig = { key: 'lastModified', direction: 'desc' };
    let fichasData = [];

    const DEPARTAMENTOS = [
        'ENG. PRODUCTO', 'ENG. PROCESSO PLTL', 'HSE', 'QUALIDADE / CALIDAD', 'COMPRAS',
        'QUALIDADE COMPRAS', 'TOOLING & EQUIPAMENTS', 'LOGISTICA E PC&L', 'FINANCEIRO / COSTING',
        'COMERCIAL', 'MANUTENÇÃO / MANTENIMIENTO', 'PRODUÇÃO / PRODUCCIÓN', 'QUALIDADE CLIENTE'
    ];

    const ESTADOS_FICHA = ['CERRADA', 'ABIERTA', 'RECHAZADO', 'PENDIENTE', 'SIN NOTAS', 'FALTA FIRMAR'];
    const STATUS_COLORS = {
        CERRADA: 'status-cerrada',
        ABIERTA: 'status-abierta',
        RECHAZADO: 'status-rechazado',
        PENDIENTE: 'status-pendiente',
        SIN_NOTAS: 'status-sin-notas',
        FALTA_FIRMAR: 'status-falta-firmar'
    };

    const renderFichaForm = (fichaData = null, isReadOnly = false) => {
        if (!checkUserPermission('edit')) {
            isReadOnly = true;
        }
        const isEditing = fichaData !== null;
        const ecrEcoId = isEditing ? fichaData.id : `ECR-ECO-${Date.now()}`;

        let departamentosHTML = '';
        DEPARTAMENTOS.forEach(depto => {
            const deptoKey = depto.replace(/[\s/&]/g, '_');
            const ecrComentario = isEditing ? (fichaData.departamentos?.[deptoKey]?.ecrComentario || '') : '';
            const ecrFirmada = isEditing ? (fichaData.departamentos?.[deptoKey]?.ecrFirmada || 'NO') : 'NO';
            const ecoComentario = isEditing ? (fichaData.departamentos?.[deptoKey]?.ecoComentario || '') : '';
            const ecoFirmada = isEditing ? (fichaData.departamentos?.[deptoKey]?.ecoFirmada || 'NO') : 'NO';

            departamentosHTML += `
                <tr>
                    <td class="col-departamento">${depto}</td>
                    <td class="col-comentarios"><textarea name="ecr_comentario_${deptoKey}">${ecrComentario}</textarea></td>
                    <td class="col-firma">
                        <select name="ecr_firmada_${deptoKey}">
                            <option value="SI" ${ecrFirmada === 'SI' ? 'selected' : ''}>SI</option>
                            <option value="NO" ${ecrFirmada === 'NO' ? 'selected' : ''}>NO</option>
                        </select>
                    </td>
                    <td class="col-comentarios"><textarea name="eco_comentario_${deptoKey}">${ecoComentario}</textarea></td>
                    <td class="col-firma">
                        <select name="eco_firmada_${deptoKey}">
                            <option value="SI" ${ecoFirmada === 'SI' ? 'selected' : ''}>SI</option>
                            <option value="NO" ${ecoFirmada === 'NO' ? 'selected' : ''}>NO</option>
                        </select>
                    </td>
                </tr>
            `;
        });

        const estadoOptionsHTML = ESTADOS_FICHA.map(estado => {
            const selected = isEditing && fichaData.estadoGeneral === estado ? 'selected' : '';
            return `<option value="${estado}" ${selected}>${estado}</option>`;
        }).join('');

        const leyendaHTML = ESTADOS_FICHA.map(estado => `
            <div class="leyenda-item">
                <div class="leyenda-color-box ${STATUS_COLORS[estado.replace(' ', '_')]}"></div>
                <span>${estado}</span>
            </div>
        `).join('');

        const viewHTML = `
            <div class="ficha-seguimiento animate-fade-in-up">
                <form id="ficha-form" data-id="${ecrEcoId}">
                    <header class="ficha-header">
                        <div class="ficha-grid-meta">
                            <div class="meta-item">
                                <label for="n_eco_ecr">N° de Eco/Ecr</label>
                                <input type="text" id="n_eco_ecr" name="n_eco_ecr" value="${isEditing ? fichaData.n_eco_ecr : ''}" required>
                            </div>
                            <div class="meta-item">
                                <label for="cliente">Cliente</label>
                                <input type="text" id="cliente" name="cliente" value="${isEditing ? fichaData.cliente : ''}">
                            </div>
                            <div class="meta-item">
                                <label for="pedido">Pedido</label>
                                <input type="text" id="pedido" name="pedido" value="${isEditing ? fichaData.pedido : ''}">
                            </div>
                             <div class="meta-item" style="grid-column: 1 / -1;">
                                <label for="descripcion">Descripcion</label>
                                <textarea id="descripcion" name="descripcion" rows="2">${isEditing ? fichaData.descripcion : ''}</textarea>
                            </div>
                        </div>
                    </header>
                    <div class="ficha-body">
                        <table class="departamentos-table">
                            <thead>
                                <tr>
                                    <th class="col-departamento">Departamento</th>
                                    <th class="col-comentarios">Comentarios según ECR</th>
                                    <th class="col-firma">Firmada (ECR)</th>
                                    <th class="col-comentarios">Comentarios según ECO</th>
                                    <th class="col-firma">Firmada (ECO)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${departamentosHTML}
                            </tbody>
                        </table>
                    </div>
                    <footer class="ficha-footer">
                        <div class="estado-general-container">
                            <label for="estado-general">Estado General:</label>
                            <select id="estado-general" name="estadoGeneral" class="estado-general-select ${STATUS_COLORS[(isEditing ? fichaData.estadoGeneral : 'ABIERTA').replace(' ', '_')]}">
                                ${estadoOptionsHTML}
                            </select>
                        </div>
                         <div class="leyenda-colores">
                            ${leyendaHTML}
                        </div>
                        <div class="ficha-actions">
                            <button type="button" class="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600" id="back-to-list-btn">Volver a la Lista</button>
                            <button type="submit" class="btn-save">${isEditing ? 'Actualizar Ficha' : 'Guardar Ficha'}</button>
                            ${isEditing ? `<button type="button" class="btn-delete" id="delete-ficha-btn">Eliminar Ficha</button>` : ''}
                        </div>
                    </footer>
                </form>
            </div>
        `;
        dom.viewContent.innerHTML = viewHTML;

        const form = document.getElementById('ficha-form');

        if (isReadOnly) {
            form.querySelectorAll('input, textarea, select').forEach(el => {
                el.disabled = true;
            });
            const saveBtn = form.querySelector('.btn-save');
            if (saveBtn) saveBtn.style.display = 'none';
            const deleteBtn = form.querySelector('.btn-delete');
            if (deleteBtn) deleteBtn.style.display = 'none';

            const actionsContainer = form.querySelector('.ficha-actions');
            if (actionsContainer) {
                const n_eco_ecr = fichaData.n_eco_ecr || '';
                let associatedButtonHTML = '';
                if (n_eco_ecr) {
                    const type = n_eco_ecr.startsWith('ECR') ? 'ecr' : (n_eco_ecr.startsWith('ECO') ? 'eco' : null);
                    if (type) {
                        associatedButtonHTML = `
                            <button type="button" data-action="view-associated-${type}" data-id="${n_eco_ecr}" class="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 font-semibold">
                                Ver ${type.toUpperCase()}
                            </button>`;
                    }
                }

                const newButtonsHTML = `
                    <button type="button" data-action="generate-ficha-pdf" data-id="${fichaData.id}" class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 font-semibold">
                        Generar PDF
                    </button>
                    ${associatedButtonHTML}
                `;
                actionsContainer.insertAdjacentHTML('beforeend', newButtonsHTML);
            }
        }

        form.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button || button.type === 'submit') return;

            e.preventDefault();

            const action = button.dataset.action;
            const id = button.dataset.id;

            if (action === 'generate-ficha-pdf') {
                await generateFichaPdf(id);
            } else if (action === 'view-associated-ecr') {
                switchView('ecr_form', { ecrId: id });
            } else if (action === 'view-associated-eco') {
                switchView('eco_form', { ecoId: id });
            }
        });

        form.addEventListener('submit', handleSaveFicha);

        document.getElementById('back-to-list-btn').addEventListener('click', renderMainView);

        if (isEditing && !isReadOnly) {
            document.getElementById('delete-ficha-btn').addEventListener('click', () => handleDeleteFicha(ecrEcoId));
        }

        const estadoSelect = document.getElementById('estado-general');
        estadoSelect.addEventListener('change', (e) => {
            estadoSelect.className = 'estado-general-select'; // Reset classes
            const selectedStatusClass = STATUS_COLORS[e.target.value.replace(' ', '_')];
            if(selectedStatusClass) {
                estadoSelect.classList.add(selectedStatusClass);
            }
        });
    };

    const handleSaveFicha = async (e) => {
        e.preventDefault();
        const form = e.target;
        const id = form.dataset.id;
        const n_eco_ecr = form.querySelector('[name="n_eco_ecr"]').value;

        if (!n_eco_ecr) {
            showToast('El campo "N° de Eco/Ecr" es obligatorio.', 'error');
            return;
        }

        const fichaData = {
            id: id,
            n_eco_ecr: n_eco_ecr,
            cliente: form.querySelector('[name="cliente"]').value,
            pedido: form.querySelector('[name="pedido"]').value,
            descripcion: form.querySelector('[name="descripcion"]').value,
            estadoGeneral: form.querySelector('[name="estadoGeneral"]').value,
            departamentos: {},
            lastModified: new Date()
        };

        DEPARTAMENTOS.forEach(depto => {
            const deptoKey = depto.replace(/[\s/&]/g, '_');
            fichaData.departamentos[deptoKey] = {
                ecrComentario: form.querySelector(`[name="ecr_comentario_${deptoKey}"]`).value,
                ecrFirmada: form.querySelector(`[name="ecr_firmada_${deptoKey}"]`).value,
                ecoComentario: form.querySelector(`[name="eco_comentario_${deptoKey}"]`).value,
                ecoFirmada: form.querySelector(`[name="eco_firmada_${deptoKey}"]`).value,
            };
        });

        try {
            const docRef = doc(db, SEGUIMIENTO_COLLECTION, id);
            await setDoc(docRef, fichaData, { merge: true });
            showToast('Ficha guardada con éxito.', 'success');
            renderMainView();
        } catch (error) {
            console.error("Error guardando la ficha: ", error);
            showToast('Error al guardar la ficha.', 'error');
        }
    };

    const handleDeleteFicha = (id) => {
        showConfirmationModal('Eliminar Ficha', '¿Está seguro de que desea eliminar esta ficha? Esta acción no se puede deshacer.', async () => {
            try {
                await deleteDoc(doc(db, SEGUIMIENTO_COLLECTION, id));
                showToast('Ficha eliminada.', 'success');
                renderMainView();
            } catch (error) {
                console.error("Error deleting ficha: ", error);
                showToast('Error al eliminar la ficha.', 'error');
            }
        });
    };

    const seedSeguimientoData = async () => {
        const snapshot = await getDocs(query(collection(db, SEGUIMIENTO_COLLECTION), limit(1)));
        if (!snapshot.empty) {
            console.log('La colección de seguimiento ya tiene datos. No se necesita seeding.');
            return;
        }

        showToast('Creando datos de prueba para seguimiento...', 'info');
        const batch = writeBatch(db);
        const sampleFicha1 = {
            id: 'ECR-ECO-SAMPLE-1',
            n_eco_ecr: 'ECR-2024-001',
            cliente: 'Cliente de Prueba A',
            pedido: 'PED-001',
            descripcion: 'Modificación inicial del componente X para mejorar la durabilidad.',
            estadoGeneral: 'ABIERTA',
            departamentos: {
                'ENG_PRODUCTO': { ecrComentario: 'Revisar planos y especificaciones.', ecrFirmada: 'SI', ecoComentario: '', ecoFirmada: 'NO' },
                'COMPRAS': { ecrComentario: 'Evaluar impacto en proveedores.', ecrFirmada: 'NO', ecoComentario: '', ecoFirmada: 'NO' }
            },
            lastModified: new Date()
        };
        const sampleFicha2 = {
            id: 'ECR-ECO-SAMPLE-2',
            n_eco_ecr: 'ECO-2024-002',
            cliente: 'Cliente de Prueba B',
            pedido: 'PED-002',
            descripcion: 'Implementación del cambio de material para el ensamblaje Y.',
            estadoGeneral: 'PENDIENTE',
            departamentos: {
                'ENG_PRODUCTO': { ecrComentario: 'Planos actualizados.', ecrFirmada: 'SI', ecoComentario: 'Cambio implementado.', ecoFirmada: 'SI' },
                'QUALIDADE_CALIDAD': { ecrComentario: 'Plan de control requerido.', ecrFirmada: 'SI', ecoComentario: 'Plan de control actualizado y validado.', ecoFirmada: 'NO' }
            },
            lastModified: new Date()
        };

        batch.set(doc(db, SEGUIMIENTO_COLLECTION, sampleFicha1.id), sampleFicha1);
        batch.set(doc(db, SEGUIMIENTO_COLLECTION, sampleFicha2.id), sampleFicha2);

        try {
            await batch.commit();
            showToast('Datos de prueba creados.', 'success');
        } catch(error) {
            console.error('Error al crear datos de prueba de seguimiento:', error);
            showToast('Error al crear datos de prueba.', 'error');
        }
    };

    const renderMainView = () => {
        seedSeguimientoData();

        const canCreate = checkUserPermission('edit');
        const createButtonHTML = canCreate ? `
            <button id="create-new-ficha-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md">
                <i data-lucide="plus" class="mr-2 h-5 w-5"></i>Crear Nueva Ficha
            </button>` : '';

        const viewHTML = `
            <div class="animate-fade-in-up">
                 <div class="flex justify-between items-center mb-6">
                     <div class="flex items-center gap-2">
                        <button data-view="control_ecrs" class="p-2 rounded-full hover:bg-slate-100 transition-colors">
                            <i data-lucide="arrow-left" class="w-6 h-6 text-slate-600"></i>
                        </button>
                        <h2 class="text-2xl font-bold text-slate-800">Listado de Fichas de Seguimiento</h2>
                     </div>
                    ${createButtonHTML}
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg">
                    <div class="overflow-x-auto list-container">
                        <table class="w-full text-sm text-left text-gray-600">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="n_eco_ecr" title="Número de Engineering Change Order / Request. Haga clic para ordenar.">N° Eco/Ecr</th>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="descripcion" title="Descripción de la ficha. Haga clic para ordenar.">Descripción</th>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="cliente" title="Cliente asociado. Haga clic para ordenar.">Cliente</th>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="estadoGeneral" title="Estado actual de la ficha. Haga clic para ordenar.">Estado</th>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="lastModified" title="Fecha de la última modificación. Haga clic para ordenar.">Última Modificación</th>
                                    <th scope="col" class="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="fichas-list">
                                <tr><td colspan="6" class="text-center py-16"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto"></i></td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        dom.viewContent.innerHTML = viewHTML;
        lucide.createIcons();

        if (canCreate) {
            document.getElementById('create-new-ficha-btn').addEventListener('click', () => renderFichaForm());
        }

        const listBody = document.getElementById('fichas-list');
        const tableHead = dom.viewContent.querySelector('thead');

        tableHead.addEventListener('click', (e) => {
            const header = e.target.closest('.sortable-header');
            if (header) {
                const key = header.dataset.sort;
                if (sortConfig.key === key) {
                    sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    sortConfig.key = key;
                    sortConfig.direction = 'asc';
                }
                renderTableRows(fichasData);
            }
        });

        listBody.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const fichaId = button.dataset.id;
            const action = button.dataset.action;

            if (action === 'view-ficha' || action === 'edit-ficha') {
                const docRef = doc(db, SEGUIMIENTO_COLLECTION, fichaId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const isReadOnly = action === 'view-ficha';
                    renderFichaForm(docSnap.data(), isReadOnly);
                } else {
                    showToast('Error: No se encontró la ficha.', 'error');
                }
            }
        });

        const fichasCollection = collection(db, SEGUIMIENTO_COLLECTION);

        const q = query(fichasCollection, orderBy('lastModified', 'desc'));

        unsubscribe = onSnapshot(q, (snapshot) => {
            fichasData = snapshot.docs.map(doc => doc.data());
            renderTableRows(fichasData);
        }, (error) => {
            console.error("Error fetching fichas: ", error);
            showToast('Error al cargar las fichas de seguimiento.', 'error');
            const listBody = document.getElementById('fichas-list');
            if(listBody) listBody.innerHTML = `<tr><td colspan="6" class="text-center py-16 text-red-500">Error al cargar los datos.</td></tr>`;
        });
    };

    const renderTableRows = (data) => {
        const listBody = document.getElementById('fichas-list');
        if (!listBody) return;

        data.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            if (valA?.toDate && valB?.toDate) {
                valA = valA.toDate();
                valB = valB.toDate();
            }

            if (valA < valB) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

        dom.viewContent.querySelectorAll('.sortable-header').forEach(header => {
            const key = header.dataset.sort;
            const iconContainer = header.querySelector('.sort-icon') || document.createElement('i');
            iconContainer.className = 'sort-icon inline-block ml-1';
            if (sortConfig.key === key) {
                iconContainer.setAttribute('data-lucide', sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down');
            } else {
                iconContainer.removeAttribute('data-lucide');
            }
            if (!header.querySelector('.sort-icon')) {
                 header.appendChild(iconContainer);
            }
        });

        if (data.length === 0) {
            listBody.innerHTML = `<tr><td colspan="6" class="text-center py-16 text-gray-500">No hay fichas de seguimiento. Puede crear una nueva.</td></tr>`;
            return;
        }

        listBody.innerHTML = data.map(ficha => {
            const statusClass = STATUS_COLORS[ficha.estadoGeneral?.replace(' ', '_')] || 'bg-gray-100 text-gray-800';
            const editButtonHTML = checkUserPermission('edit') ?
                `<button data-id="${ficha.id}" data-action="edit-ficha" class="text-gray-500 hover:text-green-600 p-1" title="Editar Ficha"><i data-lucide="edit" class="h-5 w-5 pointer-events-none"></i></button>` :
                '';

            return `
                <tr class="bg-white border-b hover:bg-gray-50">
                    <td class="px-6 py-4 font-medium text-gray-900">${ficha.n_eco_ecr}</td>
                    <td class="px-6 py-4">${ficha.descripcion || ''}</td>
                    <td class="px-6 py-4">${ficha.cliente || ''}</td>
                    <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusClass}">${ficha.estadoGeneral}</span></td>
                    <td class="px-6 py-4">${ficha.lastModified.toDate().toLocaleString('es-AR')}</td>
                    <td class="px-6 py-4 text-right space-x-2">
                        <button data-id="${ficha.id}" data-action="view-ficha" class="text-gray-500 hover:text-blue-600 p-1" title="Ver Ficha"><i data-lucide="eye" class="h-5 w-5 pointer-events-none"></i></button>
                        ${editButtonHTML}
                    </td>
                </tr>
            `;
        }).join('');
        lucide.createIcons();
    };

    renderMainView();

    appState.currentViewCleanup = () => {
        if (unsubscribe) {
            unsubscribe();
        }
    };
}
