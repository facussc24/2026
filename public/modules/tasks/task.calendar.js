import { getState, setCalendarDate, addUnsubscriber, clearUnsubscribers, setCalendarPriorityFilter } from './task.state.js';
import { openTaskFormModal } from './task.modal.js';
import { getTaskCardHTML } from './task.templates.js';
import { subscribeToTasks } from './task.service.js';
import { getFirestore, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { showToast, checkUserPermission } from '../../main.js';

let appState;
let lucide;

export function initCalendar(dependencies) {
    appState = dependencies.appState;
    lucide = dependencies.lucide;
}

// Main entry point for the calendar view
export function renderTaskCalendar(container) {
    loadCalendarCSS();

    container.innerHTML = getCalendarLayoutHTML(); // A new template function for the full layout
    lucide.createIcons();

    updateCalendarDisplay(container);
    setupEventListeners(container);
    subscribeToCalendarTasks(container);
}

function loadCalendarCSS() {
    if (!document.getElementById('calendar-styles')) {
        const link = document.createElement('link');
        link.id = 'calendar-styles';
        link.rel = 'stylesheet';
        link.href = 'modules/tasks/calendar.css';
        document.head.appendChild(link);
    }
}

// Template for the calendar layout, including filters
function getCalendarLayoutHTML() {
    return `
        <div id="calendar-view" class="animate-fade-in-up">
            <div id="calendar-header" class="flex items-center justify-between mb-6 flex-wrap gap-4">
                <div class="flex items-center gap-2">
                    <button id="prev-week" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-left" class="h-6 w-6 pointer-events-none"></i></button>
                    <h2 id="calendar-title" class="text-xl font-bold text-center w-64"></h2>
                    <button id="next-week" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-right" class="h-6 w-6 pointer-events-none"></i></button>
                </div>
                 <div class="flex items-center gap-2">
                    <div class="relative">
                        <select id="calendar-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-white shadow-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm">
                            <option value="all">Prioridad (todas)</option>
                            <option value="high">Alta</option>
                            <option value="medium">Media</option>
                            <option value="low">Baja</option>
                        </select>
                        <i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"></i>
                    </div>
                </div>
            </div>
            <div id="calendar-grid" class="calendar-grid-container"></div>
        </div>
    `;
}

function setupEventListeners(container) {
    container.querySelector('#prev-week').addEventListener('click', () => changeWeek(-1, container));
    container.querySelector('#next-week').addEventListener('click', () => changeWeek(1, container));
    container.querySelector('#calendar-priority-filter').addEventListener('change', (e) => {
        setCalendarPriorityFilter(e.target.value);
        displayTasksOnCalendar(container); // Re-render tasks with the new filter
    });

    container.querySelector('#calendar-grid').addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action="add-task"]');
        if (button) {
            const date = button.dataset.date;
            const dueDate = date === 'backlog' ? null : date;
            openTaskFormModal(null, 'todo', null, dueDate);
        }
    });
}

function subscribeToCalendarTasks(container) {
    clearUnsubscribers();
    const onTasksReceived = (tasks) => {
        // The state is updated inside subscribeToTasks, so we just need to re-render
        displayTasksOnCalendar(container);
    };
    const handleError = (error) => {
        console.error("Error fetching tasks for calendar:", error);
        showToast('Error al cargar las tareas del calendario.', 'error');
    };
    const unsub = subscribeToTasks(onTasksReceived, handleError);
    addUnsubscriber(unsub);
}

function updateCalendarDisplay(container) {
    const grid = container.querySelector('#calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const currentDate = getState().calendar.currentDate;
    const weekDates = getWeekDates(currentDate);

    const firstDay = weekDates[0];
    const lastDay = weekDates[weekDates.length - 1];
    container.querySelector('#calendar-title').textContent =
        `Semana del ${firstDay.toLocaleDateString('es-ES', {day: '2-digit', month: 'long'})} al ${lastDay.toLocaleDateString('es-ES', {day: '2-digit', month: 'long', year: 'numeric'})}`;

    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    days.forEach((day, index) => {
        const date = weekDates[index];
        const dateString = date.toISOString().split('T')[0];
        const column = createDayColumn(day, date, dateString);
        grid.appendChild(column);
    });

    const backlogColumn = createDayColumn('Backlog', null, 'backlog');
    grid.appendChild(backlogColumn);

    lucide.createIcons();
    displayTasksOnCalendar(container);
    initCalendarDragAndDrop(container);
}

function createDayColumn(dayName, date, dateString) {
    const column = document.createElement('div');
    column.className = 'calendar-column';
    column.dataset.date = dateString;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isToday = date && date.getTime() === today.getTime();

    column.innerHTML = `
        <div class="calendar-column-header">
            <div>
                <h3 class="font-bold text-slate-700">${dayName}</h3>
                ${date ? `<p class="text-sm text-slate-500 ${isToday ? 'font-bold text-blue-600' : ''}">${date.toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit'})}</p>` : ''}
            </div>
            <button data-action="add-task" data-date="${dateString}" class="text-slate-400 hover:text-blue-600"><i data-lucide="plus-circle" class="pointer-events-none"></i></button>
        </div>
        <div class="task-list flex-grow min-h-[150px] space-y-2"></div>
    `;
    return column;
}

function getWeekDates(date) {
    const current = new Date(date);
    const dayOfWeek = current.getDay();
    const firstDayOfWeek = new Date(current);
    const diff = current.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    firstDayOfWeek.setDate(diff);

    const week = [];
    for (let i = 0; i < 7; i++) {
        const day = new Date(firstDayOfWeek);
        day.setDate(firstDayOfWeek.getDate() + i);
        week.push(day);
    }
    return week;
}

function changeWeek(direction, container) {
    const currentDate = getState().calendar.currentDate;
    const newDate = new Date(currentDate);
    newDate.setDate(currentDate.getDate() + (7 * direction));
    setCalendarDate(newDate);
    updateCalendarDisplay(container);
}

function displayTasksOnCalendar(container) {
    const state = getState();
    const tasks = state.allTasks || [];
    const priorityFilter = state.calendar.priorityFilter;

    container.querySelectorAll('.task-list').forEach(list => list.innerHTML = '');

    const filteredTasks = tasks.filter(task => {
        if (task.isArchived) return false;
        if (priorityFilter !== 'all' && (task.priority || 'medium') !== priorityFilter) {
            return false;
        }
        return true;
    });

    filteredTasks.forEach(task => {
        // Find the correct column (day or backlog) for the task
        const targetDate = task.dueDate || 'backlog';
        const column = container.querySelector(`.calendar-column[data-date="${targetDate}"] .task-list`);

        // Find all columns within the current week to place tasks
        const weekDates = getWeekDates(state.calendar.currentDate).map(d => d.toISOString().split('T')[0]);
        const backlogColumn = container.querySelector('.calendar-column[data-date="backlog"] .task-list');
        let targetColumn = container.querySelector(`.calendar-column[data-date="${task.dueDate}"] .task-list`);

        if (!task.dueDate) {
            targetColumn = backlogColumn;
        } else if (!weekDates.includes(task.dueDate)) {
            // If task's due date is not in the current week, don't display it
            return;
        }

        if (targetColumn) {
            const assignee = appState.collections.usuarios.find(u => u.docId === task.assigneeUid);
            const taskCardHTML = getTaskCardHTML(task, assignee, checkUserPermission);
            const template = document.createElement('template');
            template.innerHTML = taskCardHTML.trim();
            const cardNode = template.content.firstChild;

            cardNode.addEventListener('click', () => openTaskFormModal(task));
            targetColumn.appendChild(cardNode);
        }
    });

    lucide.createIcons();
}

function initCalendarDragAndDrop(container) {
    const lists = container.querySelectorAll('#calendar-grid .task-list');
    lists.forEach(list => {
        if (list.sortable) {
            list.sortable.destroy();
        }

        new Sortable(list, {
            group: 'calendar-tasks',
            animation: 150,
            ghostClass: 'task-card-ghost',
            filter: '.no-drag',
            onEnd: async (evt) => {
                const taskId = evt.item.dataset.taskId;
                const newDate = evt.to.closest('.calendar-column').dataset.date;

                if (!taskId) return;

                const db = getFirestore();
                const taskRef = doc(db, 'tareas', taskId);

                try {
                    const newDueDate = newDate === 'backlog' ? null : newDate;
                    await updateDoc(taskRef, {
                        dueDate: newDueDate,
                        updatedAt: serverTimestamp()
                    });
                    showToast('Fecha de la tarea actualizada.', 'success');
                } catch (error) {
                    console.error("Error updating task date:", error);
                    showToast('Error al mover la tarea.', 'error');
                    evt.from.appendChild(evt.item);
                }
            }
        });
    });
}