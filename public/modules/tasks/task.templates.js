/**
 * @file This file contains all the HTML template functions for the tasks module.
 * These functions are responsible for generating the HTML structure of the components.
 */

export function getKanbanBoardHTML(state, selectedUser) {
    let topBarHTML = '';
    if (state.kanban.selectedUserId) {
        topBarHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">Tareas de ${selectedUser?.name || 'Usuario'}</h3>
            <button data-action="admin-back-to-supervision" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Volver a Supervisión</button>
        </div>
        `;
    }

    return `
        ${topBarHTML}
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 ${state.kanban.selectedUserId ? 'hidden' : ''}">
            <div id="task-filters" class="flex items-center gap-2 rounded-lg bg-slate-200 p-1 flex-wrap"></div>

            <div class="flex items-center gap-2 flex-grow w-full md:w-auto">
                <div class="relative flex-grow">
                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i>
                    <input type="text" id="task-search-input" placeholder="Buscar tareas..." class="w-full pl-10 pr-4 py-2 border rounded-full bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                </div>
                <div class="relative">
                    <select id="task-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-white shadow-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                        <option value="all">Prioridad (todas)</option>
                        <option value="high">Alta</option>
                        <option value="medium">Media</option>
                        <option value="low">Baja</option>
                    </select>
                    <i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"></i>
                </div>
            </div>

            <div id="kanban-header-buttons" class="flex items-center gap-4 flex-shrink-0">
                <button id="add-new-task-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                    <i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea
                </button>
            </div>
        </div>
        <div id="task-board" class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="todo">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="list-todo" class="w-5 h-5 text-yellow-600"></i>Por Hacer</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="inprogress">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="timer" class="w-5 h-5 text-blue-600"></i>En Progreso</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="done">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>Completadas</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
        </div>
    `;
}

export function getMultiTaskConfirmationHTML(suggestedTasks) {
    const tasksListHTML = suggestedTasks.map((task, index) => {
        const priorityMap = { high: 'Alta', medium: 'Media', low: 'Baja' };
        const priorityText = priorityMap[task.priority] || 'N/A';
        const dueDateText = task.dueDate || 'N/A';

        return `
            <label class="block p-4 bg-white rounded-lg border hover:border-blue-500 hover:shadow-sm cursor-pointer transition-all duration-150 has-[:checked]:bg-blue-50 has-[:checked]:border-blue-400">
                <div class="flex items-start gap-4">
                    <input type="checkbox" class="suggested-task-checkbox mt-1 h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300" data-task-index="${index}" checked>
                    <div class="flex-grow">
                        <p class="font-bold text-slate-800">${task.title}</p>
                        <p class="text-sm text-slate-600 mt-1">${task.description}</p>
                        <div class="text-xs text-slate-500 mt-3 flex items-center gap-x-6 gap-y-1 flex-wrap">
                            <span class="flex items-center gap-1.5"><i data-lucide="flag" class="w-3.5 h-3.5"></i><strong>Prioridad:</strong> ${priorityText}</span>
                            <span class="flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5"></i><strong>Fecha Límite:</strong> ${dueDateText}</span>
                        </div>
                    </div>
                </div>
            </label>
        `;
    }).join('');

    return `
        <div id="multi-task-confirmation-view" class="p-6 animate-fade-in flex flex-col h-full">
            <div class="text-center mb-4 flex-shrink-0">
                <i data-lucide="git-fork" class="w-12 h-12 mx-auto text-blue-500"></i>
                <h3 class="text-xl font-bold text-gray-800 mt-2">La IA ha sugerido dividir la entrada en ${suggestedTasks.length} tareas.</h3>
                <p class="text-sm text-gray-600 mt-1">Revisa las tareas sugeridas a continuación. Desmarca las que no quieras crear.</p>
            </div>

            <div id="suggested-tasks-list" class="space-y-3 overflow-y-auto border p-4 rounded-lg bg-slate-100 custom-scrollbar py-1">
                ${tasksListHTML}
            </div>

            <div class="flex justify-end items-center gap-3 mt-6 pt-4 border-t flex-shrink-0">
                <button id="cancel-multi-task-btn" type="button" class="btn btn-secondary">Cancelar</button>
                <button id="create-selected-tasks-btn" type="button" class="btn btn-primary">
                    <i data-lucide="check-check" class="w-4 h-4 mr-2"></i>
                    Crear Tareas Seleccionadas
                </button>
            </div>
        </div>
    `;
}

export function getTelegramConfigHTML() {
    return `
    <div id="telegram-config-collapsible" class="bg-white rounded-xl shadow-lg mb-6 border border-blue-200 overflow-hidden">
        <button id="telegram-config-header" class="w-full flex justify-between items-center p-4">
            <div class="flex items-center gap-4">
                <i data-lucide="send" class="w-8 h-8 text-blue-500"></i>
                <div>
                    <h3 class="text-lg font-bold text-slate-800 text-left">Configuración de Notificaciones de Telegram</h3>
                    <p class="text-sm text-slate-500 text-left">Recibe notificaciones de tus tareas directamente en tu teléfono.</p>
                </div>
            </div>
            <i data-lucide="chevron-down" id="telegram-config-chevron" class="w-6 h-6 text-slate-500 transition-transform"></i>
        </button>
        <div id="telegram-config-body" class="p-6 pt-0" style="display: none;">
            <div class="text-sm text-slate-600 bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-4">
                <div>
                    <p class="font-bold text-blue-800 mb-2 flex items-center gap-2"><i data-lucide="info"></i>¿Cómo funciona?</p>
                    <ul class="list-disc list-inside space-y-1 pl-5">
                        <li>Recibirás un mensaje cuando alguien te <strong>asigne una tarea nueva</strong>.</li>
                        <li>Recibirás un mensaje cuando el estado de una <strong>tarea que tú creaste</strong> cambie (por ejemplo, de "Por Hacer" a "En Progreso").</li>
                    </ul>
                </div>
                <div>
                    <p class="font-bold text-blue-800 mb-2 flex items-center gap-2"><i data-lucide="help-circle"></i>¿Cómo obtener tu Chat ID?</p>
                    <p class="pl-5">
                        Abre Telegram y busca el bot <a href="https://t.me/userinfobot" target="_blank" class="text-blue-600 font-semibold hover:underline">@userinfobot</a>. Inicia una conversación con él y te enviará tu Chat ID numérico. Cópialo y pégalo en el campo de abajo.
                    </p>
                </div>
            </div>
            <form id="telegram-config-form" class="auth-form mt-6">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="input-group">
                        <label for="telegram-chat-id">Tu Chat ID de Telegram</label>
                        <input type="text" id="telegram-chat-id" placeholder="Ingresa tu Chat ID numérico">
                    </div>
                    <div class="input-group">
                        <label>¿Cuándo notificar?</label>
                        <div class="space-y-3 mt-2">
                            <label class="flex items-center gap-3">
                                <input type="checkbox" id="notify-on-assignment" name="onAssignment" class="h-4 w-4 rounded text-blue-600">
                                <span class="text-sm">Cuando se me asigna una tarea nueva.</span>
                            </label>
                            <label class="flex items-center gap-3">
                                <input type="checkbox" id="notify-on-status-change" name="onStatusChange" class="h-4 w-4 rounded text-blue-600">
                                <span class="text-sm">Cuando una tarea que creé cambia de estado.</span>
                            </label>
                            <label class="flex items-center gap-3">
                                <input type="checkbox" id="notify-on-due-date-reminder" name="onDueDateReminder" class="h-4 w-4 rounded text-blue-600">
                                <span class="text-sm">Un día antes del vencimiento de una tarea asignada.</span>
                            </label>
                        </div>
                    </div>
                </div>
                <div class="mt-6 flex items-center gap-4 pt-4 border-t border-slate-200">
                    <button id="save-telegram-config-btn" type="button" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Configuración</button>
                    <button id="send-test-telegram-btn" type="button" class="bg-slate-200 text-slate-700 px-6 py-2 rounded-md hover:bg-slate-300 font-semibold">Enviar Mensaje de Prueba</button>
                </div>
            </form>
        </div>
    </div>
    `;
}

export function getAdminUserListHTML(users) {
    return `
        <div class="bg-white p-8 rounded-xl shadow-lg border animate-fade-in-up">
            <div class="max-w-3xl mx-auto text-center">
                <i data-lucide="users" class="w-16 h-16 mx-auto text-slate-300"></i>
                <h2 class="text-3xl font-extrabold text-slate-800 mt-4">Modo Supervisión</h2>
                <p class="text-slate-500 mt-2 text-lg">Selecciona un usuario para ver su tablero de tareas.</p>
            </div>
            <div id="admin-user-list-container" class="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                ${users.map(user => `
                    <div class="admin-user-card text-center p-6 bg-slate-50 rounded-lg hover:shadow-xl hover:bg-white hover:-translate-y-1 transition-all duration-200 cursor-pointer border" data-user-id="${user.docId}">
                        <img src="${user.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(user.name)}`}" alt="Avatar" class="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-white shadow-md">
                        <h3 class="font-bold text-slate-800">${user.name}</h3>
                        <p class="text-sm text-slate-500">${user.email}</p>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

export function getTasksTableHTML(tasks, userMap) {
    if (tasks.length === 0) {
        return `<div class="text-center py-16 text-slate-500 dark:text-slate-400">
            <i data-lucide="inbox" class="w-12 h-12 mx-auto text-slate-400"></i>
            <h3 class="mt-4 text-lg font-semibold">No se encontraron tareas</h3>
            <p class="text-sm text-slate-400 mt-1">Intenta ajustar los filtros de búsqueda.</p>
        </div>`;
    }

    const tableRows = tasks.map(task => {
        const assignee = userMap.get(task.assigneeUid);
        const assigneeName = assignee ? assignee.name : 'No asignado';
        const project = task.proyecto || 'N/A';

        const statusMap = { todo: 'Pendiente', inprogress: 'En progreso', done: 'Completado' };
        const statusText = statusMap[task.status] || 'Pendiente';
        const statusColor = { todo: 'btn-warning', inprogress: 'btn-info', done: 'btn-success'}[task.status] || 'btn-secondary';

        const priorityMap = { low: 'Baja', medium: 'Media', high: 'Alta' };
        const priorityText = priorityMap[task.priority] || 'Media';
        const priorityColor = { low: 'btn-success', medium: 'btn-warning', high: 'btn-danger'}[task.priority] || 'btn-secondary';

        const dueDate = task.dueDate ? new Date(task.dueDate + "T00:00:00").toLocaleDateString('es-AR') : 'N/A';

        let progress = 0;
        if (task.subtasks && task.subtasks.length > 0) {
            const completed = task.subtasks.filter(st => st.completed).length;
            progress = Math.round((completed / task.subtasks.length) * 100);
        } else if (task.status === 'done') {
            progress = 100;
        }

        return `
            <tr class="border-t border-t-[#dbe0e6] dark:border-slate-700 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors duration-150" data-task-id="${task.docId}" style="cursor: pointer;">
                <td class="h-[72px] px-4 py-2 text-text-light dark:text-text-dark text-sm font-medium leading-normal">${task.title}</td>
                <td class="h-[72px] px-4 py-2 text-text-secondary-light dark:text-text-secondary-dark text-sm font-normal leading-normal">${project}</td>
                <td class="h-[72px] px-4 py-2 text-text-secondary-light dark:text-text-secondary-dark text-sm font-normal leading-normal">${assigneeName}</td>
                <td class="h-[72px] px-4 py-2 w-40 text-sm font-normal leading-normal"><button class="btn btn-sm w-full ${statusColor} !opacity-100" disabled>${statusText}</button></td>
                <td class="h-[72px] px-4 py-2 w-40 text-sm font-normal leading-normal"><button class="btn btn-sm w-full ${priorityColor} !opacity-100" disabled>${priorityText}</button></td>
                <td class="h-[72px] px-4 py-2 text-text-secondary-light dark:text-text-secondary-dark text-sm font-normal leading-normal">${dueDate}</td>
                <td class="h-[72px] px-4 py-2 w-48 text-sm font-normal leading-normal">
                    <div class="flex items-center gap-3">
                        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5"><div class="h-2.5 rounded-full bg-primary-DEFAULT" style="width: ${progress}%;"></div></div>
                        <p class="text-text-light dark:text-text-dark text-sm font-medium leading-normal">${progress}%</p>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <div class="overflow-x-auto rounded-xl border border-[#dbe0e6] dark:border-slate-700 bg-white dark:bg-card-dark">
            <table class="min-w-full">
                <thead>
                    <tr class="bg-white dark:bg-card-dark">
                        <th class="px-4 py-3 text-left text-text-light dark:text-text-dark text-sm font-medium leading-normal">Tarea</th>
                        <th class="px-4 py-3 text-left text-text-secondary-light dark:text-text-secondary-dark text-sm font-medium leading-normal">Proyecto</th>
                        <th class="px-4 py-3 text-left text-text-secondary-light dark:text-text-secondary-dark text-sm font-medium leading-normal">Usuario</th>
                        <th class="px-4 py-3 text-left text-text-secondary-light dark:text-text-secondary-dark text-sm font-medium leading-normal">Estado</th>
                        <th class="px-4 py-3 text-left text-text-secondary-light dark:text-text-secondary-dark text-sm font-medium leading-normal">Prioridad</th>
                        <th class="px-4 py-3 text-left text-text-secondary-light dark:text-text-secondary-dark text-sm font-medium leading-normal">Fecha límite</th>
                        <th class="px-4 py-3 text-left text-text-secondary-light dark:text-text-secondary-dark text-sm font-medium leading-normal">Progreso</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
}

export function getPaginationControlsHTML(currentPage, isLastPage) {
    const prevDisabled = currentPage === 1;
    const nextDisabled = isLastPage;

    return `
        <div class="flex items-center justify-center gap-4">
            <button data-page="prev" class="btn btn-secondary" ${prevDisabled ? 'disabled' : ''}>
                <i data-lucide="arrow-left" class="w-4 h-4 mr-2"></i>
                Anterior
            </button>
            <span class="text-sm font-medium text-text-light dark:text-text-dark px-4 py-2 bg-slate-100 dark:bg-slate-700 rounded-md">
                Página ${currentPage}
            </span>
            <button data-page="next" class="btn btn-secondary" ${nextDisabled ? 'disabled' : ''}>
                Siguiente
                <i data-lucide="arrow-right" class="w-4 h-4 ml-2"></i>
            </button>
        </div>
    `;
}

export function getTaskTableFiltersHTML(currentUser, users) {
    let userFilterHTML = '';
    if (currentUser.role === 'admin') {
        const userOptions = users.map(u => `<option value="${u.docId}">${u.name || u.email}</option>`).join('');
        userFilterHTML = `
            <div class="relative">
                <i data-lucide="user" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary-light dark:text-text-secondary-dark"></i>
                <select id="user-filter-select" class="select pl-9">
                    <option value="all">Todos los Usuarios</option>
                    ${userOptions}
                </select>
            </div>
        `;
    }

    const buildFilterGroup = (type, primary, options) => `
        <div class="flex items-center gap-1 bg-gray-200 dark:bg-gray-700 rounded-lg p-1">
            <button data-filter-type="${type}" data-filter-value="${primary.value}" class="btn btn-sm btn-primary text-white shadow-sm">${primary.label}</button>
            ${options.map(opt => `<button data-filter-type="${type}" data-filter-value="${opt.value}" class="btn btn-sm btn-ghost text-text-secondary-light dark:text-text-secondary-dark">${opt.label}</button>`).join('')}
        </div>
    `;

    const statusFilterHTML = buildFilterGroup('status', {value: 'all', label: 'Estado'}, [
        {value: 'todo', label: 'Pendiente'},
        {value: 'inprogress', label: 'En Progreso'},
        {value: 'done', label: 'Completado'}
    ]);

    const priorityFilterHTML = buildFilterGroup('priority', {value: 'all', label: 'Prioridad'}, [
        {value: 'high', label: 'Alta'},
        {value: 'medium', label: 'Media'},
        {value: 'low', label: 'Baja'}
    ]);

    return userFilterHTML + statusFilterHTML + priorityFilterHTML;
}

export function getMyPendingTasksWidgetHTML(tasks) {
    if (tasks.length === 0) {
        return '<p class="text-sm text-slate-500 text-center py-4">¡No tienes tareas pendientes!</p>';
    }

    return tasks.map(task => {
        const dueDate = task.dueDate ? new Date(task.dueDate + "T00:00:00") : null;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const isOverdue = dueDate && dueDate < today;
        const dateClass = isOverdue ? 'text-red-500 font-semibold' : 'text-slate-500';
        const dueDateStr = dueDate ? `Vence: ${dueDate.toLocaleDateString('es-AR')}` : 'Sin fecha';

        const priorityClasses = {
            high: 'border-red-500',
            medium: 'border-yellow-500',
            low: 'border-slate-300',
        };
        const priorityBorder = priorityClasses[task.priority] || 'border-slate-300';

        return `
            <div class="p-3 bg-slate-50 hover:bg-slate-100 rounded-lg border-l-4 ${priorityBorder} cursor-pointer" data-action="view-task" data-task-id="${task.docId}">
                <div class="flex justify-between items-center">
                    <p class="font-bold text-slate-800 text-sm">${task.title}</p>
                    <span class="text-xs ${dateClass}">${dueDateStr}</span>
                </div>
            </div>
        `;
    }).join('');
}

export function getCalendarLayoutHTML() {
    return `
        <div class="bg-white p-6 rounded-xl shadow-lg">
            <div id="calendar-header" class="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                <div class="flex items-center gap-4">
                    <button id="prev-calendar-btn" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-left" class="h-6 w-6"></i></button>
                    <h3 id="calendar-title" class="text-2xl font-bold text-slate-800 text-center w-48"></h3>
                    <button id="next-calendar-btn" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-right" class="h-6 w-6"></i></button>
                    <button id="today-calendar-btn" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Hoy</button>
                </div>
                <div class="flex items-center gap-2">
                    <select id="calendar-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-white shadow-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm">
                        <option value="all">Prioridad (todas)</option>
                        <option value="high">Alta</option>
                        <option value="medium">Media</option>
                        <option value="low">Baja</option>
                    </select>
                    <div class="flex items-center gap-2 rounded-lg bg-slate-200 p-1">
                        <button data-view="monthly" class="calendar-view-btn px-4 py-1.5 text-sm font-semibold rounded-md">Mensual</button>
                        <button data-view="weekly" class="calendar-view-btn px-4 py-1.5 text-sm font-semibold rounded-md">Semanal</button>
                    </div>
                </div>
            </div>
            <div id="calendar-grid" class="mt-6"></div>
        </div>
    `;
}

export function getCalendarMonthlyViewHTML(date) {
    const year = date.getFullYear();
    const month = date.getMonth();

    let html = `
        <div class="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Sem</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Lunes</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Martes</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Miércoles</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Jueves</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Viernes</div>
    `;

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let currentDate = new Date(firstDayOfMonth);
    let dayOfWeek = currentDate.getDay();
    let dateOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    currentDate.setDate(currentDate.getDate() - dateOffset);

    let weekHasContent = true;
    while(weekHasContent) {
        let weekNumber = currentDate.getWeekNumber();
        html += `<div class="bg-slate-100 text-center p-2 font-bold text-slate-500 text-sm flex items-center justify-center">${weekNumber}</div>`;

        let daysInThisWeekFromMonth = 0;
        for (let i = 0; i < 5; i++) { // Monday to Friday
            const dayClass = (currentDate.getMonth() === month) ? 'bg-white' : 'bg-slate-50 text-slate-400';
            const dateStr = currentDate.toISOString().split('T')[0];
            html += `
                <div class="relative p-2 min-h-[120px] ${dayClass}">
                    <time datetime="${dateStr}" class="font-semibold text-sm">${currentDate.getDate()}</time>
                    <div class="task-list mt-1 space-y-1" data-date="${dateStr}"></div>
                </div>
            `;
            if (currentDate.getMonth() === month) {
                daysInThisWeekFromMonth++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        currentDate.setDate(currentDate.getDate() + 2);

        if (daysInThisWeekFromMonth === 0 && currentDate > lastDayOfMonth) {
            weekHasContent = false;
        }
    }

    html += `</div>`;
    return html;
}

export function getCalendarWeeklyViewHTML(date) {
    let dayOfWeek = date.getDay();
    let dateOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    let monday = new Date(date);
    monday.setDate(date.getDate() - dateOffset);

    const dayHeaders = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    let headerHtml = '';
    for(let i=0; i<5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        headerHtml += `<div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">${dayHeaders[i]} ${d.getDate()}</div>`;
    }

    let html = `
        <div class="grid grid-cols-5 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            ${headerHtml}
    `;

    for (let i = 0; i < 5; i++) {
        const currentDate = new Date(monday);
        currentDate.setDate(monday.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        html += `
            <div class="relative bg-white p-2 min-h-[200px]">
                <div class="task-list mt-1 space-y-1" data-date="${dateStr}"></div>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

export function getTaskCardHTML(task, assignee, checkUserPermission) {
    const priorities = {
        low: { label: 'Baja', color: 'bg-slate-100 text-slate-800' },
        medium: { label: 'Media', color: 'bg-yellow-100 text-yellow-800' },
        high: { label: 'Alta', color: 'bg-red-100 text-red-800' }
    };
    const priority = priorities[task.priority] || priorities.medium;

    const dueDate = task.dueDate ? new Date(task.dueDate + "T00:00:00") : null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const isOverdue = dueDate && dueDate < today;
    const dueDateStr = dueDate ? dueDate.toLocaleDateString('es-AR') : 'Sin fecha';
    const urgencyClass = isOverdue ? 'border-red-600 bg-red-50/50' : 'border-slate-200';
    const dateClass = isOverdue ? 'text-red-600 font-bold' : 'text-slate-500';

    const creationDate = task.createdAt?.seconds ? new Date(task.createdAt.seconds * 1000) : null;
    const creationDateStr = creationDate ? creationDate.toLocaleDateString('es-AR') : 'N/A';

    const taskTypeIcon = task.isPublic
        ? `<span title="Tarea de Ingeniería (Pública)"><i data-lucide="briefcase" class="w-4 h-4 text-slate-400"></i></span>`
        : `<span title="Tarea Privada"><i data-lucide="lock" class="w-4 h-4 text-slate-400"></i></span>`;

    let subtaskProgressHTML = '';
    if (task.subtasks && task.subtasks.length > 0) {
        const totalSubtasks = task.subtasks.length;
        const completedSubtasks = task.subtasks.filter(st => st.completed).length;
        const progressPercentage = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

        subtaskProgressHTML = `
            <div class="mt-3">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold text-slate-500 flex items-center">
                        <i data-lucide="check-square" class="w-3.5 h-3.5 mr-1.5"></i>
                        Sub-tareas
                    </span>
                    <span class="text-xs font-bold text-slate-600">${completedSubtasks} / ${totalSubtasks}</span>
                </div>
                <div class="w-full bg-slate-200 rounded-full h-1.5">
                    <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style="width: ${progressPercentage}%"></div>
                </div>
            </div>
        `;
    }
    const dragClass = checkUserPermission('edit', task) ? '' : 'no-drag';

    return `
        <div class="task-card bg-white rounded-lg p-4 shadow-sm border ${urgencyClass} cursor-pointer hover:shadow-md hover:border-blue-400 animate-fade-in-up flex flex-col ${dragClass} transition-transform transform hover:-translate-y-1" data-task-id="${task.docId}">
            <div class="flex justify-between items-start gap-2 mb-2">
                <h4 class="font-bold text-slate-800 flex-grow">${task.title}</h4>
                ${taskTypeIcon}
            </div>

            <p class="text-sm text-slate-600 break-words flex-grow mb-3">${task.description || ''}</p>

            ${subtaskProgressHTML}

            <div class="mt-auto pt-3 border-t border-slate-200/80">
                <div class="flex justify-between items-center text-xs text-slate-500 mb-3">
                    <span class="px-2 py-0.5 rounded-full font-semibold ${priority.color}">${priority.label}</span>
                    <div class="flex items-center gap-3">
                        <span class="flex items-center gap-1.5 font-medium" title="Fecha de creación">
                            <i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i> ${creationDateStr}
                        </span>
                        <span class="flex items-center gap-1.5 font-medium ${dateClass}" title="Fecha de entrega">
                            <i data-lucide="calendar-check" class="w-3.5 h-3.5"></i> ${dueDateStr}
                        </span>
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        ${assignee ? `<img src="${assignee.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(assignee.name || assignee.email)}`}" title="Asignada a: ${assignee.name || assignee.email}" class="w-6 h-6 rounded-full">` : '<div class="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center" title="No asignada"><i data-lucide="user-x" class="w-4 h-4 text-gray-500"></i></div>'}
                        <span class="text-sm text-slate-500">${assignee ? (assignee.name || assignee.email.split('@')[0]) : 'No asignada'}</span>
                    </div>
                    <div class="task-actions">
                    ${checkUserPermission('delete', task) ? `
                        <button data-action="delete-task" data-doc-id="${task.docId}" class="text-gray-400 hover:text-red-600 p-1 rounded-full" title="Eliminar tarea">
                            <i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function getSubtaskHTML(subtask) {
    const titleClass = subtask.completed ? 'line-through text-slate-500' : 'text-slate-800';
    const containerClass = subtask.completed ? 'opacity-70' : '';
    const checkboxId = `subtask-checkbox-${subtask.id}`;
    return `
        <div class="subtask-item group flex items-center gap-3 p-2 bg-slate-100 hover:bg-slate-200/70 rounded-md transition-all duration-150 ${containerClass}" data-subtask-id="${subtask.id}">
            <label for="${checkboxId}" class="flex-grow flex items-center gap-3 cursor-pointer">
                <input type="checkbox" id="${checkboxId}" name="${checkboxId}" class="subtask-checkbox h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer" ${subtask.completed ? 'checked' : ''}>
                <span class="flex-grow text-sm font-medium ${titleClass}">${subtask.title}</span>
            </label>
            <button type="button" class="subtask-delete-btn text-slate-400 hover:text-red-500 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
        </div>
    `;
}

export function getTaskFormModalHTML(task, defaultStatus, selectedUid, defaultDate, isAdmin) {
    const isEditing = task !== null;
    return `
    <div id="task-form-modal" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
        <div class="bg-slate-50 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4 animate-scale-in">
            <div class="flex justify-between items-center p-4 border-b border-slate-200 bg-white rounded-t-lg sticky top-0">
                <h3 class="text-xl font-bold text-slate-800">${isEditing ? 'Editar' : 'Nueva'} Tarea</h3>
                <button data-action="close" class="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 transition-colors"><i data-lucide="x" class="h-6 w-6"></i></button>
            </div>
            <form id="task-form" class="p-6 overflow-y-auto space-y-6" novalidate>
                <input type="hidden" name="taskId" value="${isEditing ? task.docId : ''}">
                <input type="hidden" name="status" value="${isEditing ? task.status : defaultStatus}">

                <!-- AI Section -->
                <div class="task-form-section bg-blue-50 border border-blue-200">
                    <div class="form-section-header">
                        <i data-lucide="brain-circuit" class="w-5 h-5 text-blue-600"></i>
                        <h4 class="font-bold text-blue-800">Organizador de Tareas con IA</h4>
                    </div>
                    <div class="p-4">
                        <p class="text-sm text-slate-600 mb-3">
                            Escribe todas tus ideas o lo que necesitas hacer. La IA lo analizará para rellenar los campos automáticamente.
                        </p>
                        <textarea id="task-ai-braindump" placeholder="Ej: Necesito preparar la presentación para el cliente nuevo para el viernes. Tengo que investigar sus datos, armar el powerpoint y coordinar con Marcelo." rows="4" class="w-full"></textarea>
                        <button type="button" id="organize-with-ai-btn" class="btn btn-primary w-full mt-3">
                            <i data-lucide="sparkles" class="w-4 h-4 mr-2"></i>
                            Organizar Tarea
                        </button>
                    </div>
                </div>

                <!-- Core Details Section -->
                <div class="task-form-section">
                     <div class="form-section-header">
                        <i data-lucide="file-text" class="w-5 h-5"></i>
                        <h4>Detalles Principales</h4>
                    </div>
                    <div class="p-4 space-y-4">
                        <div class="input-group">
                            <label for="task-title">Título</label>
                            <input type="text" id="task-title" name="title" value="${isEditing && task.title ? task.title : ''}" required>
                        </div>
                        <div class="input-group">
                            <label for="task-description">Descripción</label>
                            <textarea id="task-description" name="description" rows="4">${isEditing && task.description ? task.description : ''}</textarea>
                        </div>
                    </div>
                </div>

                <!-- Planning Section -->
                <div class="task-form-section">
                     <div class="form-section-header">
                        <i data-lucide="calendar-clock" class="w-5 h-5"></i>
                        <h4>Planificación</h4>
                    </div>
                    <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        <div class="input-group">
                            <label for="task-assignee">Asignar a</label>
                            <select id="task-assignee" name="assigneeUid" data-selected-uid="${selectedUid}"><option value="">Cargando...</option></select>
                        </div>
                        <div class="input-group">
                            <label for="task-priority">Prioridad</label>
                            <select id="task-priority" name="priority">
                                <option value="low" ${isEditing && task.priority === 'low' ? 'selected' : ''}>Baja</option>
                                <option value="medium" ${!isEditing || (isEditing && task.priority === 'medium') ? 'selected' : ''}>Media</option>
                                <option value="high" ${isEditing && task.priority === 'high' ? 'selected' : ''}>Alta</option>
                            </select>
                        </div>
                        <div class="input-group">
                            <label for="task-startdate">Fecha de Inicio</label>
                            <input type="date" id="task-startdate" name="startDate" value="${isEditing && task.startDate ? task.startDate : (defaultDate || '')}">
                        </div>
                        <div class="input-group">
                            <label for="task-duedate">Fecha Límite</label>
                            <input type="date" id="task-duedate" name="dueDate" value="${isEditing && task.dueDate ? task.dueDate : (defaultDate || '')}">
                        </div>
                    </div>
                </div>

                <!-- Subtasks Section -->
                <div class="task-form-section">
                     <div class="form-section-header">
                        <i data-lucide="check-square" class="w-5 h-5"></i>
                        <h4>Sub-tareas</h4>
                    </div>
                    <div class="p-4">
                        <div id="subtasks-list" class="space-y-2 max-h-48 overflow-y-auto p-2 rounded-md bg-slate-100 border"></div>
                        <div class="flex items-center gap-2 mt-2">
                            <input type="text" id="new-subtask-title" placeholder="Añadir sub-tarea y presionar Enter">
                        </div>
                    </div>
                </div>

                <!-- Comments Section -->
                <div class="task-form-section">
                    <div class="form-section-header">
                        <i data-lucide="message-square" class="w-5 h-5"></i>
                        <h4>Comentarios</h4>
                    </div>
                    <div class="p-4">
                        <div id="task-comments-list" class="space-y-3 max-h-60 overflow-y-auto p-3 rounded-md bg-slate-100 border custom-scrollbar">
                            <p class="text-xs text-center text-slate-400 py-2">Cargando comentarios...</p>
                        </div>
                        <div class="flex items-start gap-2 mt-2">
                            <textarea id="new-task-comment" placeholder="Escribe un comentario..." rows="2"></textarea>
                            <button type="button" id="post-comment-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold h-full">
                                <i data-lucide="send" class="w-5 h-5"></i>
                            </button>
                        </div>
                    </div>
                </div>

                ${isAdmin ? `
                <div class="task-form-section p-4">
                    <label class="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" id="task-is-public" name="isPublic" class="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" ${isEditing && task.isPublic ? 'checked' : ''}>
                        <span>Tarea Pública (Visible para todos en Ingeniería)</span>
                    </label>
                </div>
                ` : ''}
            </form>
            <div class="flex justify-end items-center p-4 border-t border-slate-200 bg-white/70 backdrop-blur-sm sticky bottom-0">
                ${isEditing ? `<button data-action="delete" class="text-red-600 font-semibold mr-auto px-4 py-2 rounded-md hover:bg-red-50">Eliminar Tarea</button>` : ''}
                <button data-action="close" type="button" class="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300 font-semibold">Cancelar</button>
                <button type="submit" form="task-form" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold ml-3">Guardar Tarea</button>
            </div>
        </div>
    </div>
    `;
}

export function getAIAssistantModalHTML() {
    return `
    <div id="ai-assistant-modal" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
        <div class="bg-slate-50 dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4 animate-scale-in">
            <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-t-lg sticky top-0">
                <h3 class="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
                    <i data-lucide="brain-circuit" class="w-6 h-6 text-primary-DEFAULT"></i>
                    Asistente de Tareas IA
                </h3>
                <button data-action="close" class="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 p-1 rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                    <i data-lucide="x" class="h-6 w-6"></i>
                </button>
            </div>
            <div class="p-6 overflow-y-auto space-y-6">
                <div>
                    <p class="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Selecciona una pregunta para obtener un resumen de las tareas visibles actualmente:</p>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button data-question="summary" class="ai-question-btn">
                            <i data-lucide="align-left"></i>
                            <span>Generar resumen del estado actual</span>
                        </button>
                        <button data-question="urgent" class="ai-question-btn">
                             <i data-lucide="alert-triangle"></i>
                            <span>¿Cuáles son las 3 tareas más urgentes?</span>
                        </button>
                        <button data-question="at_risk" class="ai-question-btn">
                             <i data-lucide="shield-alert"></i>
                            <span>¿Qué tareas están en riesgo?</span>
                        </button>
                         <button data-question="blocked" class="ai-question-btn">
                             <i data-lucide="hand"></i>
                            <span>¿Hay alguna tarea bloqueada?</span>
                        </button>
                    </div>
                </div>
                <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                     <h5 class="text-base font-bold text-slate-800 dark:text-slate-200 mb-3">Respuesta del Asistente:</h5>
                     <div id="ai-assistant-response-container" class="bg-white dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 min-h-[150px] text-sm text-slate-700 dark:text-slate-300 prose prose-sm max-w-none dark:prose-invert prose-p:my-2 prose-ul:my-2 prose-li:my-1">
                        <div id="ai-assistant-placeholder" class="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 text-center">
                            <i data-lucide="sparkles" class="w-10 h-10 mb-2"></i>
                            <p>La respuesta de la IA aparecerá aquí.</p>
                        </div>
                        <div id="ai-assistant-loader" class="hidden animate-pulse flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 text-center">
                            <i data-lucide="loader-circle" class="w-10 h-10 mb-2 animate-spin"></i>
                            <p>Analizando tareas...</p>
                        </div>
                     </div>
                </div>
            </div>
        </div>
    </div>
    `;
}

export function getDashboardLayoutHTML() {
    return `
    <div class="flex flex-col flex-1 w-full mx-auto">
        <!-- Header -->
        <div class="flex flex-wrap justify-between items-center gap-3 p-4">
            <div class="flex flex-col gap-2">
                <h2 id="task-list-title" class="text-text-light dark:text-text-dark tracking-light text-2xl md:text-3xl font-bold leading-tight"></h2>
                <p class="text-text-secondary-light dark:text-text-secondary-dark text-sm font-normal leading-normal">
                  Visualiza y gestiona todas las tareas. Utiliza los filtros para encontrar tareas específicas.
                </p>
            </div>
            <div class="flex items-center gap-2">
                <button id="ai-assistant-btn" class="btn btn-secondary flex items-center gap-2">
                    <i data-lucide="brain-circuit" class="w-4 h-4"></i>
                    <span>Asistente IA</span>
                </button>
                <button id="export-tasks-btn" class="btn btn-primary flex items-center gap-2">
                    <i data-lucide="file-spreadsheet" class="w-4 h-4"></i>
                    <span>Exportar Excel</span>
                </button>
            </div>
        </div>

        <!-- Filters and Search -->
        <div class="flex flex-col gap-4 p-4">
            <div id="task-filters-container" class="flex gap-2 flex-wrap">
                <!-- Filter buttons will be injected here by renderTaskTableFilters -->
            </div>
            <div class="w-full">
                <div class="relative">
                    <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary-light dark:text-text-secondary-dark"></i>
                    <input id="task-search-input" type="text" placeholder="Buscar tareas por nombre, proyecto o usuario..." class="input w-full pl-12 pr-4 py-3">
                </div>
            </div>
        </div>

        <!-- Task Table -->
        <div id="tasks-table-container" class="px-4 py-3">
            <!-- Table will be rendered here by renderTasksTable -->
        </div>

        <!-- Pagination -->
        <div id="pagination-container" class="flex items-center justify-center p-4">
            <!-- Pagination controls will be rendered here by renderPaginationControls -->
        </div>

        <!-- Divider -->
        <div class="px-4 pt-8 pb-4">
            <div class="border-t border-border-light dark:border-border-dark"></div>
        </div>

        <!-- Existing Charts Section -->
        <div class="p-4">
            <h2 class="text-text-light dark:text-text-dark text-xl md:text-2xl font-bold leading-tight">Resumen del rendimiento del equipo</h2>
            <div id="old-charts-container" class="grid grid-cols-1 lg:grid-cols-3 gap-6 relative pt-6">
                <!-- The old charts HTML will be injected here -->
            </div>
        </div>
    </div>
    `;
}
