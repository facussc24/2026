import { appState, dom } from '../../main.js';
import { getDocs, collection, query, orderBy, where, doc, updateDoc } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";

// Module-level variables
let db;
const timelineState = {
    zoomLevel: 'year', // 'year', 'month', 'week'
    visibleDate: new Date(),
};
const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abr", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DAY_NAMES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

function getWeekRangeString(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const format = (dt) => `${dt.getDate()} ${MONTH_NAMES[dt.getMonth()].slice(0,3)}`;
    if (monday.getMonth() === sunday.getMonth()) return `${monday.getDate()} - ${sunday.getDate()} ${MONTH_NAMES[sunday.getMonth()]}, ${sunday.getFullYear()}`;
    else if (monday.getFullYear() === sunday.getFullYear()) return `${format(monday)} - ${format(sunday)}, ${sunday.getFullYear()}`;
    else return `${format(monday)}, ${monday.getFullYear()} - ${format(sunday)}, ${sunday.getFullYear()}`;
}

function dateToDayOfYear(dateStr, year) {
    if (!dateStr) return 0;
    try {
        const date = new Date(dateStr + 'T00:00:00');
        if (isNaN(date)) return 0;
        const start = new Date(year, 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    } catch (e) { return 0; }
}

function dateToDayOfMonth(dateStr, dateInMonth) {
    if (!dateStr) return 0;
    try {
        const date = new Date(dateStr + 'T00:00:00');
        if (isNaN(date) || date.getFullYear() !== dateInMonth.getFullYear() || date.getMonth() !== dateInMonth.getMonth()) return 0;
        return date.getDate();
    } catch (e) { return 0; }
}

function dateToDayOfWeek(dateStr, weekStartDate) {
    if (!dateStr) return 0;
    try {
        const date = new Date(dateStr + 'T00:00:00');
        if (isNaN(date)) return 0;
        const normalizedWeekStart = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate());
        const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const diff = normalizedDate - normalizedWeekStart;
        const oneDay = 1000 * 60 * 60 * 24;
        const dayIndex = Math.floor(diff / oneDay);
        return dayIndex + 1;
    } catch (e) { return 0; }
}

function dayOfYearToDate(day, year) {
    const date = new Date(year, 0, day);
    return date.toISOString().split('T')[0];
}

function dayOfMonthToDate(day, month, year) {
    const date = new Date(year, month, day);
    return date.toISOString().split('T')[0];
}

function dayOfWeekToDate(day, weekStartDate) {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + day - 1);
    return date.toISOString().split('T')[0];
}

function pixelsToDays(pixelValue, totalWidth, daysInPeriod) {
    if (totalWidth === 0) return 0;
    const pixelsPerDay = totalWidth / daysInPeriod;
    if (pixelsPerDay === 0) return 0;
    return Math.round(pixelValue / pixelsPerDay);
}

async function updateTaskDates(taskId, newStartDate, newEndDate) {
    if (!db || !taskId) return false;
    const toastId = window.showToast('Guardando cambios...', 'loading', { duration: 0 });
    try {
        const taskRef = doc(db, 'tareas', taskId);
        await updateDoc(taskRef, { startDate: newStartDate, dueDate: newEndDate });
        window.showToast('Tarea actualizada.', 'success', { toastId });
        return true;
    } catch (error) {
        console.error("Error updating task dates:", error);
        window.showToast('Error al guardar la tarea.', 'error', { toastId });
        return false;
    }
}

function assignLanesToTasks(tasks, context) {
    if (!tasks || tasks.length === 0) return { lanedTasks: [], totalLanes: 0 };
    const { zoomLevel, visibleDate } = context;
    const year = visibleDate.getFullYear();

    const processedTasks = tasks.map(t => {
        let startDay, endDay, originalStartDay, originalEndDay;
        if (zoomLevel === 'year') {
            const daysInYear = isLeapYear(year) ? 366 : 365;
            originalStartDay = dateToDayOfYear(t.startDate, year);
            originalEndDay = dateToDayOfYear(t.dueDate, year);
            startDay = Math.max(1, originalStartDay);
            endDay = Math.min(daysInYear, originalEndDay);
        } else if (zoomLevel === 'month') {
            const month = visibleDate.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            originalStartDay = dateToDayOfMonth(t.startDate, visibleDate);
            originalEndDay = dateToDayOfMonth(t.dueDate, visibleDate);
            startDay = Math.max(1, originalStartDay);
            endDay = Math.min(daysInMonth, originalEndDay);
        } else if (zoomLevel === 'week') {
            const d = new Date(visibleDate);
            const day = d.getDay();
            const diff = d.getDate() - day + (day === 0 ? -6 : 1);
            const monday = new Date(d.setDate(diff));
            originalStartDay = dateToDayOfWeek(t.startDate, monday);
            originalEndDay = dateToDayOfWeek(t.dueDate, monday);
            startDay = Math.max(1, originalStartDay);
            endDay = Math.min(7, originalEndDay);
        }
        return { ...t, startDay, endDay, originalStartDay, originalEndDay };
    })
    .filter(t => t.startDay && t.endDay && t.endDay >= t.startDay)
    .sort((a, b) => a.startDay - b.startDay);

    const lanes = [];
    processedTasks.forEach(task => {
        let assigned = false;
        for (let i = 0; i < lanes.length; i++) {
            if (task.startDay > lanes[i]) {
                task.laneIndex = i;
                lanes[i] = task.endDay;
                assigned = true;
                break;
            }
        }
        if (!assigned) {
            task.laneIndex = lanes.length;
            lanes.push(task.endDay);
        }
    });

    return { lanedTasks: processedTasks, totalLanes: lanes.length };
}

function getTimelineScaleHTML(zoomLevel, date) {
    const year = date.getFullYear();
    switch (zoomLevel) {
        case 'week':
            let weekHtml = '';
            const monday = new Date(date);
            monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
            for (let i = 0; i < 7; i++) {
                const day = new Date(monday);
                day.setDate(monday.getDate() + i);
                weekHtml += `<div class="timescale-day"><span class="font-normal">${DAY_NAMES[day.getDay()]}</span><span class="font-bold">${day.getDate()}</span></div>`;
            }
            return `<div class="timescale-year">${getWeekRangeString(date)}</div><div class="timescale-days" style="grid-template-columns: repeat(7, 1fr);">${weekHtml}</div>`;
        case 'month':
            const month = date.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            let daysHtml = '';
            for (let i = 1; i <= daysInMonth; i++) { daysHtml += `<div class="timescale-day">${i}</div>`; }
            return `<div class="timescale-year">${MONTH_NAMES[month]} ${year}</div><div class="timescale-days" style="grid-template-columns: repeat(${daysInMonth}, 1fr);">${daysHtml}</div>`;
        case 'year':
        default:
            const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
            let scaleHtml = `<div class="timescale-year">${year}</div>`;
            scaleHtml += '<div class="timescale-months">';
            months.forEach(month => { scaleHtml += `<div class="timescale-month">${month}</div>`; });
            scaleHtml += '</div>';
            return scaleHtml;
    }
}

function getGridLinesHTML(zoomLevel, date) {
    const year = date.getFullYear();
    let linesHTML = '';
    let today = new Date();
    switch (zoomLevel) {
        case 'week':
            for (let i = 1; i < 7; i++) { linesHTML += `<div class="grid-line" style="left: ${(i / 7) * 100}%;"></div>`; }
            break;
        case 'month':
            const month = date.getMonth();
            const daysInMonth = new Date(year, month + 1, 0).getDate();
            for (let i = 1; i < daysInMonth; i++) { linesHTML += `<div class="grid-line" style="left: ${(i / daysInMonth) * 100}%;"></div>`; }
            if (today.getFullYear() === year && today.getMonth() === month) {
                const todayDay = today.getDate();
                linesHTML += `<div class="today-marker" style="left: ${((todayDay - 0.5) / daysInMonth) * 100}%;"><span class="today-label">Hoy</span></div>`;
            }
            break;
        case 'year':
        default:
            const daysInYear = isLeapYear(year) ? 366 : 365;
            const daysInMonths = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            let dayCounter = 0;
            for (let i = 0; i < 11; i++) {
                dayCounter += daysInMonths[i];
                linesHTML += `<div class="grid-line" style="left: ${(dayCounter / daysInYear) * 100}%;"></div>`;
            }
            if (today.getFullYear() === year) {
                const todayDayOfYear = dateToDayOfYear(today.toISOString().split('T')[0], year);
                linesHTML += `<div class="today-marker" style="left: ${(todayDayOfYear / daysInYear) * 100}%;"><span class="today-label">Hoy</span></div>`;
            }
            break;
    }
    return linesHTML;
}

async function fetchTimelineTasks(zoomLevel, date) {
    if (!db) return [];
    try {
        const year = date.getFullYear();
        let startDate, endDate;
        switch(zoomLevel) {
            case 'month':
                const month = date.getMonth();
                startDate = new Date(year, month, 1).toISOString().split('T')[0];
                endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];
                break;
            case 'week':
                const d = new Date(date);
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                const sunday = new Date(monday);
                sunday.setDate(monday.getDate() + 6);
                startDate = monday.toISOString().split('T')[0];
                endDate = sunday.toISOString().split('T')[0];
                break;
            case 'year':
            default:
                startDate = `${year}-01-01`;
                endDate = `${year}-12-31`;
                break;
        }
        const tasksRef = collection(db, 'tareas');
        const q = query(tasksRef, where("startDate", "<=", endDate), where("dueDate", ">=", startDate));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error("Error fetching timeline tasks:", error);
        window.showToast("Error al cargar las tareas.", "error");
        return [];
    }
}

function getTaskListHTML(tasks, context) {
    if (!tasks || tasks.length === 0) {
        return `<p class="p-4 text-sm text-slate-500">No hay tareas para este período.</p>`;
    }
    const sortedTasks = [...tasks].sort((a, b) => a.startDay - b.startDay);
    return sortedTasks.map(task => `<div class="task-list-item p-3 my-2 bg-slate-50 rounded-md border text-sm cursor-pointer hover:bg-slate-100" data-task-id="${task.id}" title="${task.title}"><p class="font-semibold truncate">${task.title}</p><p class="text-xs text-slate-400">Vence: ${task.dueDate || 'N/A'}</p></div>`).join('');
}

function getTaskBarsHTML(lanedTasks, context) {
    if (!lanedTasks) return '';
    const { zoomLevel, visibleDate } = context;
    const year = visibleDate.getFullYear();
    const month = visibleDate.getMonth();
    const daysInPeriod = zoomLevel === 'year' ? (isLeapYear(year) ? 366 : 365) : zoomLevel === 'month' ? new Date(year, month + 1, 0).getDate() : 7;
    const BAR_HEIGHT = 30;
    const BAR_MARGIN = 10;

    return lanedTasks.map(task => {
        const fullTitle = `${task.title} (${task.startDate} - ${task.dueDate})`;
        const leftPercent = ((task.startDay - 1) / daysInPeriod) * 100;
        const widthPercent = ((task.endDay - task.startDay + 1) / daysInPeriod) * 100;
        const topPosition = task.laneIndex * (BAR_HEIGHT + BAR_MARGIN) + BAR_MARGIN;
        let progress = 0;
        if (task.subtasks && task.subtasks.length > 0) {
            const completed = task.subtasks.filter(st => st.completed).length;
            progress = (completed / task.subtasks.length) * 100;
        } else {
            switch (task.status) {
                case 'done': progress = 100; break;
                case 'inprogress': progress = 50; break;
                default: progress = 0; break;
            }
        }
        return `<div class="task-bar" data-task-id="${task.id}" style="left: ${leftPercent}%; width: ${widthPercent}%; top: ${topPosition}px;" title="${fullTitle}"><div class="task-bar-progress" style="width: ${progress}%;"></div><span class="task-bar-label">${task.title}</span></div>`;
    }).join('');
}

function setupTimelineInteractions(lanedTasks, context) {
    const taskList = document.querySelector('.timeline-task-list');
    const taskGrid = document.querySelector('.timeline-grid');
    const container = document.querySelector('.timeline-container');
    if (!taskList || !taskGrid || !container) return;

    let isSyncingScroll = false;
    taskList.addEventListener('scroll', () => { if (!isSyncingScroll) { isSyncingScroll = true; taskGrid.scrollTop = taskList.scrollTop; setTimeout(() => isSyncingScroll = false, 50); } });
    taskGrid.addEventListener('scroll', () => { if (!isSyncingScroll) { isSyncingScroll = true; taskList.scrollTop = taskGrid.scrollTop; setTimeout(() => isSyncingScroll = false, 50); } });
    container.addEventListener('mouseover', e => { const target = e.target.closest('[data-task-id]'); if (target) { const taskId = target.dataset.taskId; document.querySelectorAll(`[data-task-id="${taskId}"]`).forEach(el => el.classList.add('highlight')); } });
    container.addEventListener('mouseout', e => { const target = e.target.closest('[data-task-id]'); if (target) { const taskId = target.dataset.taskId; document.querySelectorAll(`[data-task-id="${taskId}"]`).forEach(el => el.classList.remove('highlight')); } });

    if (window.interact) {
        const { zoomLevel, visibleDate } = context;
        const year = visibleDate.getFullYear();
        const month = visibleDate.getMonth();
        const daysInPeriod = zoomLevel === 'year' ? (isLeapYear(year) ? 366 : 365) : zoomLevel === 'month' ? new Date(year, month + 1, 0).getDate() : 7;

        const dateFromDay = (day) => {
            if (zoomLevel === 'year') {
                return dayOfYearToDate(day, year);
            } else if (zoomLevel === 'month') {
                return dayOfMonthToDate(day, month, year);
            } else { // week
                const d = new Date(visibleDate);
                const dayOfWeek = d.getDay();
                const diff = d.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                const monday = new Date(d.setDate(diff));
                return dayOfWeekToDate(day, monday);
            }
        };

        window.interact('.task-bar').draggable({
            listeners: {
                move(event) {
                    const target = event.target;
                    const x = (parseFloat(target.getAttribute('data-x')) || 0) + event.dx;
                    target.style.transform = `translate(${x}px, 0px)`;
                    target.setAttribute('data-x', x);
                },
                async end(event) {
                    const target = event.target;
                    const gridContent = document.querySelector('.timeline-grid-content');
                    if (!gridContent) return;
                    const taskId = target.dataset.taskId;
                    const task = lanedTasks.find(t => t.id === taskId);
                    if (!task) return;

                    const x = parseFloat(target.getAttribute('data-x')) || 0;
                    const dayOffset = pixelsToDays(x, gridContent.offsetWidth, daysInPeriod);

                    const newStartDay = task.originalStartDay + dayOffset;
                    const duration = task.originalEndDay - task.originalStartDay;
                    const newEndDay = newStartDay + duration;

                    const newStartDate = dateFromDay(newStartDay);
                    const newEndDate = dateFromDay(newEndDay);

                    const success = await updateTaskDates(taskId, newStartDate, newEndDate);
                    renderTimeline();
                }
            }
        }).resizable({
            edges: { left: true, right: true },
            listeners: {
                move(event) {
                    const target = event.target;
                    let x = (parseFloat(target.getAttribute('data-x')) || 0);
                    target.style.width = `${event.rect.width}px`;
                    x += event.deltaRect.left;
                    target.style.transform = `translate(${x}px, 0px)`;
                    target.setAttribute('data-x', x);
                },
                async end(event) {
                    const target = event.target;
                    const gridContent = document.querySelector('.timeline-grid-content');
                    if (!gridContent) return;
                    const taskId = target.dataset.taskId;
                    const task = lanedTasks.find(t => t.id === taskId);
                    if (!task) return;

                    const x = parseFloat(target.getAttribute('data-x')) || 0;
                    const dayOffset = pixelsToDays(x, gridContent.offsetWidth, daysInPeriod);
                    const widthInPixels = event.rect.width;
                    const durationInDays = pixelsToDays(widthInPixels, gridContent.offsetWidth, daysInPeriod);

                    const newStartDay = task.originalStartDay + dayOffset;
                    const newEndDay = newStartDay + durationInDays - 1;

                    const newStartDate = dateFromDay(newStartDay);
                    const newEndDate = dateFromDay(newEndDay);

                    const success = await updateTaskDates(taskId, newStartDate, newEndDate);
                    renderTimeline();
                }
            }
        });
    }
}

export function initTimelineModule(app) {
    db = app.db;
}

async function renderTimeline() {
    const { zoomLevel, visibleDate } = timelineState;
    const timeContext = { zoomLevel, visibleDate };

    dom.viewContent.innerHTML = `
        <style>
            /* styles... */
        </style>
        <div class="bg-white p-6 rounded-xl shadow-lg animate-fade-in-up">
            <div class="flex justify-between items-center mb-4">
                 <div class="flex items-center gap-2 zoom-controls bg-slate-100 p-1 rounded-full">
                    <button data-zoom="year" class="px-3 py-1 text-sm font-semibold rounded-full">Año</button>
                    <button data-zoom="month" class="px-3 py-1 text-sm font-semibold rounded-full">Mes</button>
                    <button data-zoom="week" class="px-3 py-1 text-sm font-semibold rounded-full">Semana</button>
                </div>
                <div class="flex items-center gap-2">
                    <button id="timeline-prev" class="p-2 rounded-md hover:bg-slate-100"><i data-lucide="chevron-left"></i></button>
                    <span id="timeline-date-label" class="text-xl font-bold w-40 text-center"></span>
                    <button id="timeline-next" class="p-2 rounded-md hover:bg-slate-100"><i data-lucide="chevron-right"></i></button>
                </div>
            </div>
            <div class="timeline-container border rounded-lg">
                <div class="timeline-task-list"><div class="flex items-center justify-center h-full"><i data-lucide="loader"></i><span>Cargando...</span></div></div>
                <div class="timeline-timescale"></div>
                <div class="timeline-grid"><div class="timeline-grid-content"></div></div>
            </div>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();

    document.getElementById('timeline-prev').addEventListener('click', () => {
        if (zoomLevel === 'year') timelineState.visibleDate.setFullYear(timelineState.visibleDate.getFullYear() - 1);
        else if (zoomLevel === 'month') timelineState.visibleDate.setMonth(timelineState.visibleDate.getMonth() - 1);
        else if (zoomLevel === 'week') timelineState.visibleDate.setDate(timelineState.visibleDate.getDate() - 7);
        renderTimeline();
    });
    document.getElementById('timeline-next').addEventListener('click', () => {
        if (zoomLevel === 'year') timelineState.visibleDate.setFullYear(timelineState.visibleDate.getFullYear() + 1);
        else if (zoomLevel === 'month') timelineState.visibleDate.setMonth(timelineState.visibleDate.getMonth() + 1);
        else if (zoomLevel === 'week') timelineState.visibleDate.setDate(timelineState.visibleDate.getDate() + 7);
        renderTimeline();
    });
    document.querySelectorAll('.zoom-controls button').forEach(btn => { if(btn.dataset.zoom === zoomLevel) btn.classList.add('active'); btn.addEventListener('click', () => { timelineState.zoomLevel = btn.dataset.zoom; renderTimeline(); }); });

    const dateLabel = document.getElementById('timeline-date-label');
    if (zoomLevel === 'year') dateLabel.textContent = visibleDate.getFullYear();
    else if (zoomLevel === 'month') dateLabel.textContent = `${MONTH_NAMES[visibleDate.getMonth()]} ${visibleDate.getFullYear()}`;
    else if (zoomLevel === 'week') dateLabel.textContent = getWeekRangeString(visibleDate);

    const tasks = await fetchTimelineTasks(zoomLevel, visibleDate);
    const { lanedTasks, totalLanes } = assignLanesToTasks(tasks, timeContext);

    document.querySelector('.timeline-task-list').innerHTML = `<h3>Tareas</h3>` + getTaskListHTML(lanedTasks, timeContext);
    document.querySelector('.timeline-timescale').innerHTML = getTimelineScaleHTML(zoomLevel, visibleDate);
    const gridContent = document.querySelector('.timeline-grid-content');
    gridContent.innerHTML = getGridLinesHTML(zoomLevel, visibleDate) + getTaskBarsHTML(lanedTasks, timeContext);
    gridContent.style.minHeight = `${totalLanes * 40 + 20}px`;

    let minWidth = '1200px';
    if (zoomLevel === 'month') minWidth = `${new Date(visibleDate.getFullYear(), visibleDate.getMonth() + 1, 0).getDate() * 50}px`;
    else if (zoomLevel === 'week') minWidth = `${7 * 140}px`;
    gridContent.style.minWidth = minWidth;
    const timescaleElement = gridContent.parentElement.querySelector('.timescale-days, .timescale-months');
    if (timescaleElement) {
        timescaleElement.style.minWidth = minWidth;
    }


    setupTimelineInteractions(lanedTasks, timeContext);
}

export function runTimelineLogic() {
    timelineState.visibleDate = new Date();
    timelineState.zoomLevel = 'year';
    renderTimeline();
}
