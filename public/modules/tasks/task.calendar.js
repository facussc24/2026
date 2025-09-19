import { getState } from './task.state.js';
import { openTaskFormModal } from './task.ui.js';

export function initCalendar(dependencies) {
    // any future dependencies
}

Date.prototype.getWeekNumber = function() {
  var d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
};

// This is the original function used by the admin dashboard.
// We leave it untouched to avoid breaking existing functionality.
export function renderCalendar(date, view) {
    const state = getState();
    if (!state.dashboard.calendar) return;

    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    if (!calendarGrid || !calendarTitle) return;

    const aDate = date || state.dashboard.calendar.currentDate;
    const aView = view || state.dashboard.calendar.view;

    state.dashboard.calendar.currentDate = aDate;
    state.dashboard.calendar.view = aView;

    document.querySelectorAll('.calendar-view-btn').forEach(btn => {
        if (btn.dataset.view === aView) {
            btn.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
            btn.classList.remove('text-slate-600', 'hover:bg-slate-300/50');
        } else {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
            btn.classList.add('text-slate-600', 'hover:bg-slate-300/50');
        }
    });

    if (aView === 'monthly') {
        renderMonthlyView(aDate);
    } else {
        renderWeeklyView(aDate);
    }

    displayTasksOnCalendar(state.dashboard.allTasks);
}

// This is the new function for the main tasks module view.
export function renderTaskCalendar(container) {
    const state = getState();
    const calendarState = state.dashboard.calendar; // Use the existing state structure
    const lucide = state.dependencies.lucide;

    container.innerHTML = `
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

    const rerender = () => {
        const { currentDate, view } = calendarState;
        if (view === 'monthly') {
            renderMonthlyView(currentDate);
        } else {
            renderWeeklyView(currentDate);
        }
        displayTasksOnCalendar(state.dashboard.allTasks);
        updateActiveViewButton();
    };

    const updateActiveViewButton = () => {
        container.querySelectorAll('.calendar-view-btn').forEach(btn => {
            if (btn.dataset.view === calendarState.view) {
                btn.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
                btn.classList.remove('text-slate-600', 'hover:bg-slate-300/50');
            } else {
                btn.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
                btn.classList.add('text-slate-600', 'hover:bg-slate-300/50');
            }
        });
    };

    // Event Listeners
    container.querySelector('#prev-calendar-btn').addEventListener('click', () => {
        if (calendarState.view === 'monthly') {
            calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() - 1);
        } else {
            calendarState.currentDate.setDate(calendarState.currentDate.getDate() - 7);
        }
        rerender();
    });

    container.querySelector('#next-calendar-btn').addEventListener('click', () => {
        if (calendarState.view === 'monthly') {
            calendarState.currentDate.setMonth(calendarState.currentDate.getMonth() + 1);
        } else {
            calendarState.currentDate.setDate(calendarState.currentDate.getDate() + 7);
        }
        rerender();
    });

    container.querySelector('#today-calendar-btn').addEventListener('click', () => {
        calendarState.currentDate = new Date();
        rerender();
    });

    container.querySelector('#calendar-priority-filter').addEventListener('change', (e) => {
        calendarState.priorityFilter = e.target.value;
        rerender();
    });

    container.querySelectorAll('.calendar-view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            calendarState.view = e.target.dataset.view;
            rerender();
        });
    });

    // Initial Render
    rerender();
    lucide.createIcons();
}

function renderMonthlyView(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    const year = date.getFullYear();
    const month = date.getMonth();

    calendarTitle.textContent = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());

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
    calendarGrid.innerHTML = html;
}

function renderWeeklyView(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    let dayOfWeek = date.getDay();
    let dateOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    let monday = new Date(date);
    monday.setDate(date.getDate() - dateOffset);

    let friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const weekNumber = monday.getWeekNumber();
    calendarTitle.textContent = `Semana ${weekNumber}`;

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
    calendarGrid.innerHTML = html;
}

function displayTasksOnCalendar(tasks) {
    document.querySelectorAll('#calendar-grid .task-list').forEach(list => {
        list.innerHTML = '';
    });

    if (!tasks) return;

    const tasksToDisplay = tasks.filter(task => {
        const { priorityFilter } = getState().dashboard.calendar;
        if (priorityFilter !== 'all' && (task.priority || 'medium') !== priorityFilter) {
            return false;
        }
        return true;
    });

    tasksToDisplay.forEach(task => {
        if (task.dueDate) {
            const taskDateStr = task.dueDate;
            const dayCell = document.querySelector(`#calendar-grid .task-list[data-date="${taskDateStr}"]`);

            if (dayCell) {
                const priorityClasses = {
                    high: 'bg-red-100 border-l-4 border-red-500 text-red-800',
                    medium: 'bg-yellow-100 border-l-4 border-yellow-500 text-yellow-800',
                    low: 'bg-slate-100 border-l-4 border-slate-500 text-slate-800',
                };
                const priority = task.priority || 'medium';

                const taskElement = document.createElement('div');
                taskElement.className = `p-1.5 rounded-md text-xs font-semibold cursor-pointer hover:opacity-80 truncate ${priorityClasses[priority]}`;
                taskElement.textContent = task.title;
                taskElement.title = task.title;
                taskElement.dataset.taskId = task.docId;

                taskElement.addEventListener('click', () => {
                    openTaskFormModal(task);
                });

                dayCell.appendChild(taskElement);
            }
        }
    });
}
