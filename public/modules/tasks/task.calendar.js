import { getState, setCalendarView, setCalendarDate, setCalendarPriorityFilter } from './task.state.js';
import { openTaskFormModal } from './task.modal.js';
import { getCalendarLayoutHTML, getCalendarMonthlyViewHTML, getCalendarWeeklyViewHTML } from './task.templates.js';

let appState;
let lucide;

export function initCalendar(dependencies) {
    appState = dependencies.appState;
    lucide = dependencies.lucide;
}

// Helper to get week number
Date.prototype.getWeekNumber = function() {
  var d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
};

export function renderTaskCalendar(container) {
    container.innerHTML = getCalendarLayoutHTML();
    lucide.createIcons();

    const state = getState().dashboard.calendar;

    // Setup event listeners
    container.querySelector('#prev-calendar-btn').addEventListener('click', () => {
        const newDate = new Date(state.currentDate);
        if (state.view === 'monthly') {
            newDate.setMonth(newDate.getMonth() - 1);
        } else {
            newDate.setDate(newDate.getDate() - 7);
        }
        setCalendarDate(newDate);
        updateCalendarDisplay(container);
    });

    container.querySelector('#next-calendar-btn').addEventListener('click', () => {
        const newDate = new Date(state.currentDate);
        if (state.view === 'monthly') {
            newDate.setMonth(newDate.getMonth() + 1);
        } else {
            newDate.setDate(newDate.getDate() + 7);
        }
        setCalendarDate(newDate);
        updateCalendarDisplay(container);
    });

    container.querySelector('#today-calendar-btn').addEventListener('click', () => {
        setCalendarDate(new Date());
        updateCalendarDisplay(container);
    });

    container.querySelectorAll('.calendar-view-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            setCalendarView(btn.dataset.view);
            updateCalendarDisplay(container);
        });
    });

    container.querySelector('#calendar-priority-filter').addEventListener('change', (e) => {
        setCalendarPriorityFilter(e.target.value);
        updateCalendarDisplay(container);
    });

    // Initial render
    updateCalendarDisplay(container);
}


function updateCalendarDisplay(container) {
    const state = getState().dashboard;
    if (!state.calendar) return;

    const { currentDate, view, priorityFilter } = state.calendar;

    container.querySelector('#calendar-priority-filter').value = priorityFilter;

    container.querySelectorAll('.calendar-view-btn').forEach(btn => {
        if (btn.dataset.view === view) {
            btn.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
            btn.classList.remove('text-slate-600', 'hover:bg-slate-300/50');
        } else {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
            btn.classList.add('text-slate-600', 'hover:bg-slate-300/50');
        }
    });

    if (view === 'monthly') {
        renderMonthlyView(container, currentDate);
    } else {
        renderWeeklyView(container, currentDate);
    }

    displayTasksOnCalendar(container, state.allTasks);
}

function renderMonthlyView(container, date) {
    const calendarGrid = container.querySelector('#calendar-grid');
    const calendarTitle = container.querySelector('#calendar-title');

    calendarTitle.textContent = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());
    calendarGrid.innerHTML = getCalendarMonthlyViewHTML(date);
}

function renderWeeklyView(container, date) {
    const calendarGrid = container.querySelector('#calendar-grid');
    const calendarTitle = container.querySelector('#calendar-title');

    const monday = new Date(date);
    let dayOfWeek = date.getDay();
    let dateOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    monday.setDate(date.getDate() - dateOffset);

    const weekNumber = monday.getWeekNumber();
    calendarTitle.textContent = `Semana ${weekNumber}`;

    calendarGrid.innerHTML = getCalendarWeeklyViewHTML(date);
}

function displayTasksOnCalendar(container, tasks) {
    container.querySelectorAll('.task-list').forEach(list => {
        list.innerHTML = '';
    });

    if (!tasks) return;

    const state = getState().dashboard.calendar;

    const tasksToDisplay = tasks.filter(task => {
        if (state.priorityFilter !== 'all' && (task.priority || 'medium') !== state.priorityFilter) {
            return false;
        }
        return true;
    });

    tasksToDisplay.forEach(task => {
        if (task.dueDate) {
            const taskDateStr = task.dueDate;
            const dayCell = container.querySelector(`.task-list[data-date="${taskDateStr}"]`);

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
