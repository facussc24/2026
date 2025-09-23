/**
 * @file Manages the ECR Table View, which is the master table for all ECRs.
 */
import { COLLECTIONS } from '../../utils.js';

/**
 * Renders the ECR table view with filtering and searching capabilities.
 * @param {object} deps - Dependencies object.
 * @param {object} deps.db - The Firestore database instance.
 * @param {object} deps.firestore - Firestore functions { collection, onSnapshot, getDoc, doc }.
 * @param {object} deps.dom - DOM elements mapping.
 * @param {function} deps.lucide - Lucide icons creation function.
 * @param {object} deps.appState - The global application state.
 * @param {function} deps.showToast - Function to show a toast notification.
 */
export function renderEcrTableView(deps) {
    const { db, firestore, dom, lucide, appState, showToast } = deps;
    const { collection, onSnapshot, getDoc, doc } = firestore;

    dom.headerActions.style.display = 'none';
    let allEcrs = []; // To store all ECRs for client-side filtering

    const renderTableRows = async (ecrsToRender) => {
        const tableBody = dom.viewContent.querySelector('#ecr-control-table-body');
        if (!tableBody) return;

        if (ecrsToRender.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="23" class="text-center py-16 text-gray-500">No se encontraron ECRs que coincidan con la búsqueda.</td></tr>`;
            return;
        }

        const statusPill = (status) => {
            if (!status) return `<span class="status-pill status-gray">N/A</span>`;
            const statusMap = {
                'approved': { text: 'Aprobado', class: 'status-green' },
                'in-progress': { text: 'En Progreso', class: 'status-yellow' },
                'rejected': { text: 'Rechazado', class: 'status-red' },
                'pending-approval': { text: 'Pend. Aprobación', class: 'status-blue' },
                'draft': { text: 'Borrador', class: 'status-gray' },
                'stand-by': { text: 'Stand-By', class: 'status-orange' },
                'aprobado': { text: 'Aprobado', class: 'status-green' }, // For client status
                'pendiente': { text: 'Pendiente', class: 'status-blue' },
                'rechazado': { text: 'Rechazado', class: 'status-red' },
                'na': { text: 'No Aplica', class: 'status-gray' }
            };
            const s = statusMap[status] || { text: status, class: 'status-gray' };
            return `<span class="status-pill ${s.class}">${s.text}</span>`;
        };

        const ecrIds = ecrsToRender.map(ecr => ecr.id).filter(Boolean);
        let ecoStatuses = new Map();

        if (ecrIds.length > 0) {
            const ecoPromises = ecrIds.map(id => getDoc(doc(db, COLLECTIONS.ECO_FORMS, id)));
            const ecoSnaps = await Promise.all(ecoPromises);
            ecoSnaps.forEach(ecoSnap => {
                if (ecoSnap.exists()) {
                    ecoStatuses.set(ecoSnap.id, ecoSnap.data().status);
                }
            });
        }

        tableBody.innerHTML = ecrsToRender.map(ecr => {
            const origem = ecr.origen_cliente ? 'Cliente' : (ecr.origen_interno ? 'Interno' : (ecr.origen_proveedor ? 'Proveedor' : (ecr.origen_reglamentacion ? 'Reglamentación' : 'N/A')));
            const tipoEcr = ecr.tipo_producto ? 'Producto' : (ecr.tipo_proceso ? 'Proceso' : (ecr.tipo_otro ? ecr.tipo_otro_text || 'Otro' : 'N/A'));
            const ecoStatus = ecoStatuses.get(ecr.id) || null;

            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td title="${ecr.id || ''}">${ecr.id || 'N/A'}</td>
                <td title="${ecr.cliente || ''}">${ecr.cliente || 'N/A'}</td>
                <td title="MAL">MAL</td>
                <td title="${origem}">${origem}</td>
                <td title="${tipoEcr}">${tipoEcr}</td>
                <td title="${ecr.fecha_emision || ''}">${ecr.fecha_emision || 'N/A'}</td>
                <td title="${ecr.denominacion_producto || ''}">${ecr.denominacion_producto || 'N/A'}</td>
                <td title="${ecr.codigo_barack || ''}">${ecr.codigo_barack || 'N/A'}</td>
                <td title="${ecr.codigo_cliente || ''}">${ecr.codigo_cliente || 'N/A'}</td>
                <td title="${ecr.equipo_c1_0 || ecr.modifiedBy || ''}">${ecr.equipo_c1_0 || ecr.modifiedBy || 'N/A'}</td>
                <td title="${ecr.fecha_cierre || ''}">${ecr.fecha_cierre || 'N/A'}</td>
                <td title="${ecr.fecha_realizacion_ecr || ''}">${ecr.fecha_realizacion_ecr || 'N/A'}</td>
                <td>${statusPill(ecr.status)}</td>
                <td>${statusPill(ecoStatus)}</td>
                <td title="${ecr.cliente_requiere_aprobacion ? 'Sí' : 'No'}">${ecr.cliente_requiere_aprobacion ? 'Sí' : 'No'}</td>
                <td title="${ecr.cliente_aprobacion_estado || ''}">${statusPill(ecr.cliente_aprobacion_estado)}</td>
                <td title="${ecr.cliente_requiere_ppap ? 'Sí' : 'No'}">${ecr.cliente_requiere_ppap ? 'Sí' : 'No'}</td>
                <td title="${ecr.situacion_propuesta || ''}">${ecr.situacion_propuesta || 'N/A'}</td>
                <td title="${ecr.causas_solicitud || ''}">${ecr.causas_solicitud || 'N/A'}</td>
                <td title="${ecr.comentarios_alertas || ''}">${ecr.comentarios_alertas || 'N/A'}</td>
                <td title="${ecr.componentes_obsoletos || ''}">${ecr.componentes_obsoletos || 'N/A'}</td>
                <td title="${ecr.accion_objetiva || ''}">${ecr.accion_objetiva || 'N/A'}</td>
                <td title="${ecr.final_coordinador || ''}">${ecr.final_coordinador || 'N/A'}</td>
            </tr>
        `}).join('');
    };

    const filterAndRender = () => {
        const searchTerm = dom.viewContent.querySelector('#ecr-control-search').value.toLowerCase();
        const clientFilter = dom.viewContent.querySelector('#ecr-client-filter').value;
        const statusFilter = dom.viewContent.querySelector('#ecr-status-filter').value;
        const typeFilter = dom.viewContent.querySelector('#ecr-type-filter').value;

        let filtered = allEcrs;

        if (clientFilter !== 'all') {
            filtered = filtered.filter(ecr => ecr.cliente === clientFilter);
        }
        if (statusFilter !== 'all') {
            filtered = filtered.filter(ecr => ecr.status === statusFilter);
        }
        if (typeFilter !== 'all') {
            filtered = filtered.filter(ecr => {
                if (typeFilter === 'producto') return ecr.tipo_producto;
                if (typeFilter === 'proceso') return ecr.tipo_proceso;
                if (typeFilter === 'otro') return ecr.tipo_otro;
                return false;
            });
        }
        if (searchTerm) {
            filtered = filtered.filter(ecr =>
                Object.values(ecr).some(val =>
                    String(val).toLowerCase().includes(searchTerm)
                )
            );
        }
        renderTableRows(filtered);
    };

    const createFilterGroup = (title, content) => {
        return `
            <div class="filter-group">
                <h4 class="filter-group-title">${title}</h4>
                <div class="filter-group-content">
                    ${content}
                </div>
            </div>
        `;
    };

    const viewHTML = `
    <style>
        .filters-container { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; padding: 1.5rem; background-color: #f8fafc; border-radius: 0.75rem; border: 1px solid #e2e8f0; margin-bottom: 1.5rem; }
        .filter-group { display: flex; flex-direction: column; gap: 0.5rem; }
        .filter-group-title { font-size: 0.75rem; font-weight: 700; color: #475569; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.25rem; margin-bottom: 0.5rem; }
        .filter-control { display: flex; flex-direction: column; }
        .filter-control label { font-size: 0.875rem; font-weight: 600; color: #334155; margin-bottom: 0.25rem; }
        .filter-control input, .filter-control select { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; background-color: #ffffff; box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05); transition: border-color 0.2s; }
        .filter-control input:focus, .filter-control select:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px #bfdbfe; }
        .search-filter-group { grid-column: 1 / -1; }
        .search-container { position: relative; }
        .search-container .search-icon { position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: #94a3b8; pointer-events: none; }
        .search-container input { padding-left: 2.5rem; }
        .filter-actions { display: flex; align-items: center; justify-content: flex-end; gap: 1rem; }
        #active-filters-indicator { font-size: 0.875rem; color: #475569; font-weight: 500; }
        #active-filters-indicator .count { font-weight: 700; color: #1e293b; }
    </style>
    <div class="animate-fade-in-up" data-tutorial-id="ecr-table-view-container">
        <header class="flex justify-between items-center mb-6">
            <div class="flex items-center gap-4">
                 <button data-view="control_ecrs" class="flex items-center justify-center p-2 rounded-full hover:bg-slate-100 transition-colors">
                    <i data-lucide="arrow-left" class="w-6 h-6 text-slate-600"></i>
                </button>
                <div>
                    <h1 class="text-2xl font-bold text-gray-800" style="font-family: 'Inter', sans-serif;">Tabla de Control ECR</h1>
                    <p class="text-gray-500 text-sm">Hoja de seguimiento de proyectos corporativa</p>
                </div>
            </div>
            <div class="text-sm text-gray-600 text-right">
                <div><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-AR')}</div>
                <div><strong>Responsable:</strong> ${appState.currentUser.name}</div>
            </div>
        </header>

        <div class="filters-container">
            ${createFilterGroup('Búsqueda General', `
                <div class="filter-control">
                    <label for="ecr-control-search">Buscar en todos los campos</label>
                    <div class="search-container">
                        <i data-lucide="search" class="search-icon h-5 w-5"></i>
                        <input type="text" id="ecr-control-search" placeholder="Escriba para buscar...">
                    </div>
                </div>
            `)}

            ${createFilterGroup('Filtros Específicos', `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="filter-control">
                        <label for="ecr-client-filter">Cliente</label>
                        <select id="ecr-client-filter"><option value="all">Todos</option></select>
                    </div>
                    <div class="filter-control">
                        <label for="ecr-status-filter">Estado ECR</label>
                        <select id="ecr-status-filter">
                            <option value="all">Todos</option>
                            <option value="draft">Borrador</option>
                            <option value="pending-approval">Pend. Aprobación</option>
                            <option value="approved">Aprobado</option>
                            <option value="rejected">Rechazado</option>
                            <option value="stand-by">Stand-By</option>
                        </select>
                    </div>
                    <div class="filter-control">
                        <label for="ecr-type-filter">Tipo de ECR</label>
                        <select id="ecr-type-filter">
                            <option value="all">Todos</option>
                            <option value="producto">Producto</option>
                            <option value="proceso">Proceso</option>
                            <option value="otro">Otro</option>
                        </select>
                    </div>
                </div>
            `)}
             ${createFilterGroup('Acciones', `
                <div class="filter-actions">
                    <span id="active-filters-indicator"></span>
                    <button id="clear-filters-btn" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold text-sm">Limpiar Filtros</button>
                </div>
            `)}
        </div>

        <div class="ecr-control-table-wrapper">
            <div class="overflow-x-auto ecr-control-table-container">
                <table class="modern-table">
                    <thead>
                        <tr>
                            <th>N° de ECR</th>
                            <th>Cliente</th>
                            <th>Site</th>
                            <th>Origem del Pedido (Cliente ou interno)</th>
                            <th>Tipo ECR</th>
                            <th>Fecha de Abertura</th>
                            <th>Producto Afectado</th>
                            <th>Código Programa</th>
                            <th>SIC</th>
                            <th>Responsable</th>
                            <th>Plazo ECR</th>
                            <th>Fecha realizacion ECR</th>
                            <th>Status ECR</th>
                            <th>Status ECO</th>
                            <th>Req. Aprob. Cliente</th>
                            <th>Estado Aprob. Cliente</th>
                            <th>Req. PPAP</th>
                            <th>Descripcion</th>
                            <th>Causas Quien solicito el pedido</th>
                            <th>Comentarios N°de Alert / Fete / concert</th>
                            <th>Componente Obsoletos</th>
                            <th>Accion Objetiva</th>
                            <th>Responsable</th>
                    </tr>
                </thead>
                <tbody id="ecr-control-table-body">
                    <tr><td colspan="23" class="text-center py-16 text-gray-500"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto"></i><p class="mt-2">Cargando datos...</p></td></tr>
                </tbody>
            </table>
        </div>
    </div>
    `;
    dom.viewContent.innerHTML = viewHTML;
    lucide.createIcons();

    const searchInput = dom.viewContent.querySelector('#ecr-control-search');
    const clientFilter = dom.viewContent.querySelector('#ecr-client-filter');
    const statusFilter = dom.viewContent.querySelector('#ecr-status-filter');
    const typeFilter = dom.viewContent.querySelector('#ecr-type-filter');
    const clearButton = dom.viewContent.querySelector('#clear-filters-btn');
    const indicator = dom.viewContent.querySelector('#active-filters-indicator');

    const updateActiveFilterIndicator = () => {
        let activeCount = 0;
        if (searchInput.value) activeCount++;
        if (clientFilter.value !== 'all') activeCount++;
        if (statusFilter.value !== 'all') activeCount++;
        if (typeFilter.value !== 'all') activeCount++;

        if (activeCount > 0) {
            indicator.innerHTML = `<span class="count">${activeCount}</span> filtro(s) activo(s)`;
        } else {
            indicator.innerHTML = 'No hay filtros activos';
        }
    };

    const enhancedFilterAndRender = () => {
        filterAndRender();
        updateActiveFilterIndicator();
    };

    searchInput.addEventListener('input', enhancedFilterAndRender);
    clientFilter.addEventListener('change', enhancedFilterAndRender);
    statusFilter.addEventListener('change', enhancedFilterAndRender);
    typeFilter.addEventListener('change', enhancedFilterAndRender);

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clientFilter.value = 'all';
        statusFilter.value = 'all';
        typeFilter.value = 'all';
        enhancedFilterAndRender();
    });

    const scrollableArea = dom.viewContent.querySelector('.ecr-control-table-container');

    if (scrollableArea) {
        if (scrollableArea.scrollWidth > scrollableArea.clientWidth) {
            scrollableArea.style.cursor = 'grab';
        }

        let isDown = false;
        let startX;
        let scrollLeft;

        scrollableArea.addEventListener('mousedown', (e) => {
            if (e.target.closest('thead')) {
                return;
            }
            if (e.offsetX >= scrollableArea.clientWidth || e.offsetY >= scrollableArea.clientHeight) {
                return;
            }

            isDown = true;
            scrollableArea.classList.add('active');
            startX = e.pageX - scrollableArea.offsetLeft;
            scrollLeft = scrollableArea.scrollLeft;
            scrollableArea.style.cursor = 'grabbing';
        });

        const stopDragging = () => {
            if (!isDown) return;
            isDown = false;
            scrollableArea.classList.remove('active');
            if (scrollableArea.scrollWidth > scrollableArea.clientWidth) {
                scrollableArea.style.cursor = 'grab';
            } else {
                scrollableArea.style.cursor = 'default';
            }
        };

        window.addEventListener('mouseup', stopDragging);
        window.addEventListener('mouseleave', stopDragging);

        scrollableArea.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - scrollableArea.offsetLeft;
            const walk = (x - startX) * 2;
            scrollableArea.scrollLeft = scrollLeft - walk;
        });
    }

    const unsubscribe = onSnapshot(collection(db, COLLECTIONS.ECR_FORMS), (snapshot) => {
        allEcrs = snapshot.docs.map(doc => doc.data());

        const clientFilterEl = dom.viewContent.querySelector('#ecr-client-filter');
        const clients = [...new Set(allEcrs.map(ecr => ecr.cliente).filter(Boolean))];
        clientFilterEl.innerHTML = '<option value="all">Todos los Clientes</option>';
        clients.sort().forEach(client => {
            clientFilterEl.innerHTML += `<option value="${client}">${client}</option>`;
        });

        filterAndRender();
    }, (error) => {
        console.error("Error fetching ECRs for control panel:", error);
        showToast('Error al cargar los datos de ECR.', 'error');
        const tableBody = dom.viewContent.querySelector('#ecr-control-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="23" class="text-center py-16 text-red-500"><i data-lucide="alert-triangle" class="mx-auto h-8 w-8"></i><p class="mt-2">Error al cargar los datos.</p></td></tr>`;
            lucide.createIcons();
        }
    });

    appState.currentViewCleanup = () => {
        unsubscribe();
    };
}
