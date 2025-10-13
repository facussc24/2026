import { getFirestore, collection, query, where, onSnapshot, addDoc, doc, updateDoc, deleteDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { openAIAssistantModal } from '../tasks/tasks.js';

let db;

export function initPlanningModule(appDependencies) {
    db = appDependencies.db;
    console.log('Planning module initialized with Firestore');
}

// Helper function to wait for an element to be available in the DOM
function waitForElement(selector) {
    return new Promise(resolve => {
        const check = () => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
            } else {
                requestAnimationFrame(check);
            }
        };
        check();
    });
}

export async function runPlanningLogic() {
    const viewContent = document.getElementById('view-content');
    if (!viewContent) {
        console.error('View content element not found');
        return;
    }

    try {
        const response = await fetch('/modules/planning/planning.html');
        if (!response.ok) {
            throw new Error(`Failed to fetch planning.html: ${response.statusText}`);
        }
        const html = await response.text();
        viewContent.innerHTML = html;

        // Wait for a key element from the injected HTML to be present
        await waitForElement('#modal-overlay');

        // Now that the HTML is injected and confirmed, we can safely run the Gantt App logic
        GanttApp();

        // Re-render icons for the newly injected content
        if (window.lucide) {
            window.lucide.createIcons();
        }

    } catch (error) {
        console.error('Error loading planning module:', error);
        viewContent.innerHTML = '<p class="text-red-500">Error loading planning module. Check console for details.</p>';
    }
}


function GanttApp() {
    'use strict';

    const state = {
        tasks: [],
        milestones: [],
        config: { startYear: 2025, endYear: 2026, mode: 'annual', showTodayLine: true },
        dom: {},
        view: { rangeStart: null, rangeEnd: null, dayWidth: 18, totalDays: 0, taskPositions: new Map() },
        zoomDebounceTimer: null,
        linking: null,
    };

    const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const daysInMonth = (y, m) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const toUTC = (y, m, d) => new Date(Date.UTC(y, m, d));
    const addDaysUTC = (date, days) => new Date(date.getTime() + 86400000 * days);
    const getISOWeekInfo = (date) => {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - day);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
        return { year: d.getUTCFullYear(), week: week };
    };
    const $ = (id) => document.getElementById(id);
    const getCssVar = (name) => parseInt(getComputedStyle(document.documentElement).getPropertyValue(name), 10);
    const setCssVar = (name, val) => document.documentElement.style.setProperty(name, val);

// Milestones are still managed in local storage for this version.
function saveMilestoneState() {
    localStorage.setItem('ganttMilestoneState', JSON.stringify({ milestones: state.milestones }));
}
function loadMilestoneState() {
    const savedData = localStorage.getItem('ganttMilestoneState');
        if (savedData) {
            const parsed = JSON.parse(savedData);
            state.milestones = parsed.milestones || state.milestones;
        }
    }

    const dateToIndex = (date) => {
        if (!state.view.rangeStart || !date) return 0;
        const utcDate = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
        const utcStart = Date.UTC(state.view.rangeStart.getUTCFullYear(), state.view.rangeStart.getUTCMonth(), state.view.rangeStart.getUTCDate());
        return Math.floor((utcDate - utcStart) / 86400000);
    };
    const indexToDate = (idx) => addDaysUTC(state.view.rangeStart, idx);

    function attachDragToScroll(el, targetScrollEl) {
        let isDown = false, startX = 0, scrollLeft = 0;
        el.addEventListener('mousedown', (e) => {
            isDown = true;
            startX = e.pageX;
            scrollLeft = targetScrollEl.scrollLeft;
            el.style.cursor = 'grabbing';
        });
        ['mouseleave', 'mouseup'].forEach(evt => {
            document.addEventListener(evt, () => {
                isDown = false;
                el.style.cursor = 'grab';
            });
        });
        document.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX;
            const walk = x - startX;
            targetScrollEl.scrollLeft = scrollLeft - walk;
        });
    }

    // --- Modal Logic ---
    function cacheModalDomElements() {
        const modalIds = ['modal-overlay', 'modal-box', 'modal-title', 'modal-content', 'modal-actions', 'modal-cancel-btn', 'modal-ok-btn'];
        modalIds.forEach(id => {
            if (!state.dom[id]) {
                state.dom[id] = $(id);
            }
        });
    }

    function showModal({ title, content, onOk, onCancel }) {
        if (!state.dom.modalTitle) {
            cacheModalDomElements();
        }

        if (!state.dom.modalTitle) {
            console.error("Fatal: Modal DOM elements could not be found in the document.");
            return Promise.resolve(null);
        }

        state.dom.modalTitle.textContent = title;
        state.dom.modalContent.innerHTML = content;

        state.dom.modalOverlay.classList.remove('hidden');
        setTimeout(() => {
            state.dom.modalOverlay.classList.remove('opacity-0');
            state.dom.modalBox.classList.remove('scale-95');
        }, 10);

        return new Promise((resolve) => {
            const okHandler = () => {
                const inputs = [...state.dom.modalContent.querySelectorAll('input, select')];
                const result = inputs.reduce((acc, input) => {
                    acc[input.id] = input.value;
                    return acc;
                }, {});
                if (onOk) onOk(result);
                hideModal();
                resolve(result);
            };

            const cancelHandler = () => {
                if (onCancel) onCancel();
                hideModal();
                resolve(null);
            };

            state.dom.modalOkBtn.onclick = okHandler;
            state.dom.modalCancelBtn.onclick = cancelHandler;
        });
    }

    function hideModal() {
        state.dom.modalOverlay.classList.add('opacity-0');
        state.dom.modalBox.classList.add('scale-95');
        setTimeout(() => {
            state.dom.modalOverlay.classList.add('hidden');
            state.dom.modalOkBtn.onclick = null;
            state.dom.modalCancelBtn.onclick = null;
        }, 200);
    }

    function render() {
        updateViewState();
        renderLeftTaskList();
        renderHeaderTracks();
        renderTimelineGrid();
        updateTracksWidth();
        syncHeaderScroll();
    }

    function updateViewState() {
        state.view.dayWidth = getCssVar('--day-width');
        const range = (state.config.mode === 'annual')
            ? { start: toUTC(state.config.startYear, 0, 1), end: toUTC(state.config.endYear, 11, 31) }
            : (() => {
                const [y, m] = state.dom.monthPicker.value.split('-').map(Number);
                return { start: toUTC(y, m, 1), end: toUTC(y, m, daysInMonth(y, m)) };
            })();
        state.view.rangeStart = range.start;
        state.view.rangeEnd = range.end;
        state.view.totalDays = dateToIndex(range.end) + 1;
        state.dom.rangeLabel.textContent = state.config.mode === 'annual' ? `${state.config.startYear}–${state.config.endYear}` : `${MONTH_NAMES[range.start.getUTCMonth()]} ${range.start.getUTCFullYear()}`;
    }

    function renderLeftTaskList() {
        const frag = document.createDocumentFragment();
        state.tasks.forEach(t => {
            const card = document.createElement('div');
            card.className = 'p-2 rounded-md border border-border-light bg-cell-light shadow-sm task-card flex flex-col justify-center transition-shadow';
            card.setAttribute('draggable', true);
            card.dataset.taskId = t.id;

            if (!t.start || !t.end) card.classList.add('opacity-60');

            const title = document.createElement('p');
            title.className = 'font-medium text-[13px] text-gray-800 truncate pr-5 pointer-events-none';
            title.textContent = t.name;
            card.appendChild(title);
            card.addEventListener('dblclick', () => handleEditTaskName(t, card));

            const kw = document.createElement('p');
            kw.className = 'text-[11px] text-gray-500 pointer-events-none';
            if (t.start && t.end) {
                const sW = getISOWeekInfo(new Date(t.start)).week;
                const eW = getISOWeekInfo(new Date(t.end)).week;
                kw.textContent = sW === eW ? `KW ${String(sW).padStart(2, '0')}` : `KW ${String(sW).padStart(2, '0')} – ${String(eW).padStart(2, '0')}`;
            } else {
                kw.textContent = 'Sin fecha';
            }
            card.appendChild(kw);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-full transition-colors';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.title = 'Eliminar tarea';
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                handleDeleteTask(t.id);
            };
            card.appendChild(deleteBtn);

            frag.appendChild(card);
        });
        state.dom.taskList.replaceChildren(frag);
    }

    function renderHeaderTracks() {
        const { rangeStart, rangeEnd, dayWidth } = state.view;
        const yearsFrag = document.createDocumentFragment();
        const monthsFrag = document.createDocumentFragment();
        const weeksFrag = document.createDocumentFragment();
        const daysFrag = document.createDocumentFragment();

        for (let y = rangeStart.getUTCFullYear(); y <= rangeEnd.getUTCFullYear(); y++) {
            const yStart = (y === rangeStart.getUTCFullYear()) ? rangeStart : toUTC(y, 0, 1);
            const yEnd = (y === rangeEnd.getUTCFullYear()) ? rangeEnd : toUTC(y, 11, 31);
            const yDays = dateToIndex(yEnd) - dateToIndex(yStart) + 1;
            const yEl = document.createElement('div');
            yEl.className = 'year-divider py-1 text-gray-800 flex items-center justify-center';
            yEl.style.width = `${yDays * dayWidth}px`;
            yEl.textContent = y;
            yearsFrag.appendChild(yEl);
        }

        let mCursor = toUTC(rangeStart.getUTCFullYear(), rangeStart.getUTCMonth(), 1);
        while (mCursor <= rangeEnd) {
            const y = mCursor.getUTCFullYear();
            const m = mCursor.getUTCMonth();
            const mStart = (mCursor < rangeStart) ? rangeStart : mCursor;
            const mEndCand = toUTC(y, m, daysInMonth(y, m));
            const mEnd = (mEndCand > rangeEnd) ? rangeEnd : mEndCand;
            const mDays = dateToIndex(mEnd) - dateToIndex(mStart) + 1;
            if (mDays > 0) {
                const mEl = document.createElement('div');
                mEl.className = 'month-divider text-center py-1 font-medium';
                mEl.style.width = `${mDays * dayWidth}px`;
                mEl.textContent = MONTH_NAMES[m];
                monthsFrag.appendChild(mEl);
            }
            mCursor = toUTC(y, m + 1, 1);
        }

        for (let i = 0; i < state.view.totalDays; i++) {
            const dayDate = addDaysUTC(rangeStart, i);
            const dayOfWeek = dayDate.getUTCDay();
            if (dayOfWeek === 1 || i === 0) {
                 const wi = getISOWeekInfo(dayDate);
                 const dayInWeek = dayDate.getUTCDay() || 7;
                 const wEnd = new Date(Math.min(dayDate.getTime() + (7 - dayInWeek) * 86400000, rangeEnd.getTime()));
                 const wDays = dateToIndex(wEnd) - dateToIndex(dayDate) + 1;
                 const wEl = document.createElement('div');
                 wEl.className = 'week-divider kw-cell py-1 px-1 flex items-center justify-center';
                 wEl.style.width = `${wDays * dayWidth}px`;
                 wEl.textContent = `KW ${String(wi.week).padStart(2, '0')}`;
                 wEl.title = `Semana ${wi.week} / ${wi.year}`;
                 weeksFrag.appendChild(wEl);
            }
            const cell = document.createElement('div');
            cell.className = 'day-cell text-center py-[2px]';
            const dom = dayDate.getUTCDate();
            cell.textContent = String(dom);
            if (dom === 1) cell.classList.add('month-divider');
            daysFrag.appendChild(cell);
        }

        state.dom.yearsTrack.replaceChildren(yearsFrag);
        state.dom.monthsTrack.replaceChildren(monthsFrag);
        state.dom.weeksTrack.replaceChildren(weeksFrag);
        state.dom.daysTrack.replaceChildren(daysFrag);
        state.dom.daysTrack.style.gridTemplateColumns = `repeat(${state.view.totalDays}, var(--day-width))`;
    }

    function renderTimelineGrid() {
        state.view.taskPositions.clear();
        const barsGrid = document.createElement('div');
        barsGrid.className = 'bars-grid';
        barsGrid.style.gridTemplateColumns = `repeat(${state.view.totalDays}, var(--day-width))`;
        const tasksHeight = state.tasks.length * getCssVar('--row-height');
        barsGrid.style.minHeight = `${Math.max(tasksHeight, state.dom.timelineScroll.clientHeight)}px`;
        barsGrid.style.paddingBottom = '12px';

        barsGrid.appendChild(createRowGuidesLayer());
        barsGrid.appendChild(createWeekendLayer());
        const taskElements = state.tasks.map((task, idx) => createTaskElement(task, idx));
        barsGrid.append(...taskElements.filter(Boolean));
        barsGrid.appendChild(createMilestonesLayer());

        const todayLine = createTodayLine();
        if (todayLine) {
            barsGrid.appendChild(todayLine);
        }

        barsGrid.appendChild(createDependenciesLayer());
        state.dom.timelineScroll.replaceChildren(barsGrid);
        barsGrid.appendChild(createMonthDividersOverlay());
    }

    const createRowGuidesLayer = () => { const el = document.createElement('div'); el.className = 'row-guides'; return el; };

    const createWeekendLayer = () => {
        const layer = document.createElement('div');
        layer.className = 'weekend-layer';
        layer.style.gridTemplateColumns = `repeat(${state.view.totalDays}, var(--day-width))`;
        for (let i = 0; i < state.view.totalDays; i++) {
            const dayDate = addDaysUTC(state.view.rangeStart, i);
            const div = document.createElement('div');
            const day = dayDate.getUTCDay();
            if (day === 0 || day === 6) div.className = 'weekend';
            layer.appendChild(div);
        }
        return layer;
    };

    const createMonthDividersOverlay = () => {
        const overlay = document.createElement('div');
        overlay.className = 'absolute inset-0 pointer-events-none z-[2]';
        overlay.style.display = 'grid';
        overlay.style.gridTemplateColumns = `repeat(${state.view.totalDays}, var(--day-width))`;
        for (let i = 0; i < state.view.totalDays; i++) {
            const div = document.createElement('div');
            if (addDaysUTC(state.view.rangeStart, i).getUTCDate() === 1) {
                div.className = 'month-divider';
            }
            overlay.appendChild(div);
        }
        return overlay;
    };

    function createTaskElement(task, index) {
        if (!task.start || !task.end) return null;
        const s = new Date(task.start), e = new Date(task.end);
        if (e < state.view.rangeStart || s > state.view.rangeEnd) return null;

        const sClamped = new Date(Math.max(s, state.view.rangeStart));
        const eClamped = new Date(Math.min(e, state.view.rangeEnd));
        const startIdx = dateToIndex(sClamped), endIdx = dateToIndex(eClamped);
        const span = Math.max(1, endIdx - startIdx + 1);

        state.view.taskPositions.set(task.id, { startDay: dateToIndex(s), endDay: dateToIndex(e), row: index });

        const wrap = document.createElement('div');
        wrap.className = 'flex items-center relative task-bar-wrap';
        wrap.style.gridColumn = `${startIdx + 1} / span ${span}`;
        wrap.style.gridRow = index + 1;
        wrap.dataset.taskId = task.id;

        const bar = document.createElement('div');
        bar.className = 'task-bar bar-movable';

        const progressVal = (typeof task.progress === 'number') ? task.progress : 0;
        const progress = document.createElement('div');
        progress.className = 'task-bar-progress';
        progress.style.width = `${progressVal}%`;

        const pLabel = document.createElement('div');
        pLabel.className = 'progress-label';
        pLabel.textContent = `${progressVal}%`;

        const progressHandle = document.createElement('div');
        progressHandle.className = 'progress-handle';
        progressHandle.style.left = `${progressVal}%`;

        bar.append(progress, pLabel, progressHandle);

        const startLabel = document.createElement('div');
        startLabel.className = 'endpoint-label opacity-0';
        startLabel.textContent = s.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' });

        const endLabel = document.createElement('div');
        endLabel.className = 'endpoint-label opacity-0';
        endLabel.style.left = '100%';
        endLabel.textContent = e.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' });

        wrap.addEventListener('mouseenter', () => {
            [startLabel, endLabel].forEach(el => el.style.opacity = 1);
            document.querySelector(`.task-card[data-task-id='${task.id}']`)?.classList.add('highlighted');
        });
        wrap.addEventListener('mouseleave', () => {
             if (state.view.dayWidth < 18) { [startLabel, endLabel].forEach(el => el.style.opacity = 0); }
             document.querySelector(`.task-card[data-task-id='${task.id}']`)?.classList.remove('highlighted');
        });

        const hL = document.createElement('div'); hL.className = 'handle left'; hL.title = "Ajustar fecha de inicio";
        const hR = document.createElement('div'); hR.className = 'handle right'; hR.title = "Ajustar fecha de fin";

        const handleDepStart = document.createElement('div');
        handleDepStart.className = 'dep-handle start';
        handleDepStart.dataset.taskId = task.id;
        handleDepStart.dataset.side = 'start';
        handleDepStart.title = "Vincular desde el inicio";

        const handleDepEnd = document.createElement('div');
        handleDepEnd.className = 'dep-handle end';
        handleDepEnd.dataset.taskId = task.id;
        handleDepEnd.dataset.side = 'end';
        handleDepEnd.title = "Crear dependencia";

        bar.append(handleDepStart, handleDepEnd);
        wrap.append(startLabel, endLabel, hL, hR, bar);

        createDragHandler(bar, 'move', task, wrap);
        createDragHandler(hL, 'resize-left', task, wrap);
        createDragHandler(hR, 'resize-right', task, wrap);
        createProgressDragHandler(progressHandle, task, bar, progress, pLabel);
        return wrap;
    }

    async function createProgressDragHandler(handle, task, barEl, progressEl, labelEl) {
        handle.addEventListener('mousedown', e => {
            e.stopPropagation();
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';

            const barRect = barEl.getBoundingClientRect();

            const moveHandler = (ev) => {
                const newWidth = ev.clientX - barRect.left;
                const newProgress = Math.round(Math.max(0, Math.min(100, (newWidth / barRect.width) * 100)));
                // task.progress = newProgress; // The onSnapshot listener will update the state
                progressEl.style.width = `${newProgress}%`;
                labelEl.textContent = `${newProgress}%`;
                handle.style.left = `${newProgress}%`;
            };

            const upHandler = async () => {
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler, true);
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';

                const finalProgress = parseInt(progressEl.style.width, 10);
                const taskRef = doc(db, "tareas", task.id);
                try {
                    await updateDoc(taskRef, { progress: finalProgress });
                } catch (error) {
                    console.error("Error updating progress:", error);
                    render(); // Re-render to revert optimistic update
                }
            };

            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler, true);
        });
    }

    function createDragHandler(target, type, task, wrap) {
        target.addEventListener('mousedown', e => {
            e.stopPropagation();
            if (e.target.classList.contains('dep-handle') || e.target.classList.contains('progress-handle')) return;

            document.querySelector(`.task-card[data-task-id='${task.id}']`)?.classList.add('highlighted');
            document.body.style.userSelect = 'none';
            const sIdx0 = dateToIndex(new Date(task.start));
            const eIdx0 = dateToIndex(new Date(task.end));
            const span0 = eIdx0 - sIdx0 + 1;
            const initialPageX = e.pageX;

            function updatePreview(start, end) {
                start = Math.max(0, Math.min(state.view.totalDays - 1, start));
                end = Math.max(start, Math.min(state.view.totalDays - 1, end));
                wrap.style.gridColumn = `${start + 1} / span ${end - start + 1}`;
                const startLabel = wrap.querySelector('.endpoint-label');
                const endLabel = wrap.querySelector('.endpoint-label:last-of-type');
                if (startLabel) startLabel.textContent = indexToDate(start).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                if (endLabel) endLabel.textContent = indexToDate(end).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
            }

            async function commitDates(start, end) {
                const newStart = indexToDate(start).toISOString().slice(0, 10);
                const newEnd = indexToDate(end).toISOString().slice(0, 10);

                const taskRef = doc(db, "tareas", task.id);
                try {
                    await updateDoc(taskRef, { startDate: newStart, dueDate: newEnd });
                } catch (error) {
                    console.error("Error updating task dates:", error);
                    render(); // Re-render to show original state if update fails
                }
            }

            const moveHandler = (ev) => {
                const deltaPx = ev.pageX - initialPageX;
                const deltaDays = Math.round(deltaPx / state.view.dayWidth);

                if (type === 'move') {
                    const newStart = sIdx0 + deltaDays;
                    updatePreview(newStart, newStart + span0 - 1);
                } else if (type === 'resize-left') {
                    updatePreview(sIdx0 + deltaDays, eIdx0);
                } else if (type === 'resize-right') {
                    updatePreview(sIdx0, eIdx0 + deltaDays);
                }
            };

            const upHandler = () => {
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler);
                document.body.style.userSelect = 'auto';
                document.querySelector(`.task-card[data-task-id='${task.id}']`)?.classList.remove('highlighted');

                const [startPart, spanPart] = wrap.style.gridColumn.split(' / ');
                const finalStartIdx = parseInt(startPart, 10) - 1;
                const finalSpan = parseInt(spanPart.replace('span ', ''), 10);
                commitDates(finalStartIdx, finalStartIdx + finalSpan - 1);
            };

            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler);
        });
    }

    function createMilestonesLayer() {
        const layer = document.createElement('div');
        layer.className = 'milestones-layer';
        state.milestones.forEach(m => {
            const date = new Date(m.date);
            if (date < state.view.rangeStart || date > state.view.rangeEnd) return;
            const idx = dateToIndex(date);
            const el = document.createElement('div');
            el.className = 'milestone';
            el.style.left = `${idx * state.view.dayWidth}px`;
            const label = document.createElement('div');
            label.className = 'label';
            const labelText = document.createElement('span');
            labelText.textContent = m.name;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.innerHTML = '&times;';
            deleteBtn.onclick = (e) => { e.stopPropagation(); handleDeleteMilestone(m.id); };
            label.append(labelText, deleteBtn);
            el.appendChild(label);
            label.addEventListener('dblclick', (e) => { if (e.target !== deleteBtn) { e.stopPropagation(); handleEditMilestoneName(m, label); } });
            createMilestoneDragHandler(el, m);
            layer.appendChild(el);
        });
        return layer;
    }

    function createMilestoneDragHandler(el, milestone) {
        el.addEventListener('mousedown', e => {
            if (e.target.closest('.delete-btn')) return;
            e.stopPropagation();
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            const initialPageX = e.pageX;
            const initialLeft = el.offsetLeft;

            const moveHandler = (ev) => {
                const deltaPx = ev.pageX - initialPageX;
                el.style.left = `${initialLeft + deltaPx}px`;
            };

            const upHandler = () => {
                document.removeEventListener('mousemove', moveHandler);
                document.removeEventListener('mouseup', upHandler, true);
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
                const finalIndex = Math.round(el.offsetLeft / state.view.dayWidth);
                milestone.date = indexToDate(finalIndex).toISOString().slice(0, 10);
                saveMilestoneState();
                render();
            };

            document.addEventListener('mousemove', moveHandler);
            document.addEventListener('mouseup', upHandler, true);
        });
    }

    function createTodayLine() {
        if (!state.config.showTodayLine) return null;
        // Using a fixed date for consistency in demonstration
        const today = new Date('2025-10-11T12:00:00Z');
        const todayUTC = toUTC(today.getFullYear(), today.getMonth(), today.getDate());

        if (todayUTC >= state.view.rangeStart && todayUTC <= state.view.rangeEnd) {
            const idxToday = dateToIndex(todayUTC);
            const marker = document.createElement('div');
            marker.className = 'today-marker';
            marker.style.left = `${idxToday * state.view.dayWidth}px`;
            const line = document.createElement('div');
            line.className = 'current-day-line';
            const label = document.createElement('div');
            label.className = 'label';
            label.textContent = `Hoy ${today.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' })}`;
            marker.append(label, line);
            return marker;
        }
        return null;
    }

    function createDependenciesLayer() {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'dependencies-layer');

        state.tasks.forEach(task => {
            if (task.dependencies && task.dependencies.length > 0) {
                const dependentPos = state.view.taskPositions.get(task.id);
                if (!dependentPos) return;

                task.dependencies.forEach(depId => {
                    const prereqPos = state.view.taskPositions.get(depId);
                    if (!prereqPos) return;

                    const x1 = (prereqPos.endDay + 1) * state.view.dayWidth;
                    const y1 = prereqPos.row * getCssVar('--row-height') + getCssVar('--row-height') / 2;
                    const x2 = dependentPos.startDay * state.view.dayWidth;
                    const y2 = dependentPos.row * getCssVar('--row-height') + getCssVar('--row-height') / 2;
                    const isWarning = x2 < x1;

                    const group = document.createElementNS(svgNS, 'g');
                    group.classList.add('dep-group');

                    const path = document.createElementNS(svgNS, 'path');
                    const d = `M ${x1} ${y1} L ${x1 + state.view.dayWidth/2} ${y1} L ${x1 + state.view.dayWidth/2} ${y2} L ${x2} ${y2}`;
                    path.setAttribute('d', d);
                    path.setAttribute('class', `dep-path ${isWarning ? 'warning' : ''}`);
                    path.setAttribute('marker-end', `url(#arrowhead${isWarning ? '-warning' : ''})`);

                    const deleteBtn = document.createElementNS(svgNS, 'g');
                    deleteBtn.classList.add('dep-delete-btn');
                    const midX = x1 + state.view.dayWidth/2;
                    const midY = y2;
                    deleteBtn.setAttribute('transform', `translate(${midX-8}, ${midY-8})`);
                    deleteBtn.innerHTML = `<circle cx="8" cy="8" r="8" fill="#fee2e2"/><path d="M5 5l6 6M11 5l-6 6" stroke="#ef4444" stroke-width="1.5" stroke-linecap="round"/>`;
                    deleteBtn.onclick = () => handleDeleteDependency(depId, task.id);

                    group.append(path, deleteBtn);
                    svg.appendChild(group);
                });
            }
        });
        return svg;
    }

    async function handleDeleteDependency(fromId, toId) {
        const toTaskRef = doc(db, "tareas", toId);
        try {
            await updateDoc(toTaskRef, {
                dependsOn: arrayRemove(fromId)
            });
        } catch (error) {
            console.error("Error removing dependency: ", error);
        }
    }

    function updateTracksWidth() {
        const totalWidth = state.view.totalDays * state.view.dayWidth;
        [state.dom.yearsTrack, state.dom.monthsTrack, state.dom.weeksTrack, state.dom.daysTrack].forEach(track => {
            track.style.width = `${totalWidth}px`;
        });
    }

    function syncHeaderScroll() {
        const x = -state.dom.timelineScroll.scrollLeft;
        const transform = `translateX(${x}px)`;
        state.dom.yearsTrack.style.transform = transform;
        state.dom.monthsTrack.style.transform = transform;
        state.dom.weeksTrack.style.transform = transform;
        state.dom.daysTrack.style.transform = transform;
    }

    function handleZoom() {
        clearTimeout(state.zoomDebounceTimer);
        setCssVar('--day-width', `${state.dom.zoomRange.value}px`);
        state.zoomDebounceTimer = setTimeout(render, 50);
    }

    function handleModeChange(newMode) {
        state.config.mode = newMode;
        if (newMode === 'annual') {
            state.dom.monthlyNav.classList.add('hidden');
            state.dom.btnAnnual.classList.add('bg-white', 'text-gray-700', 'shadow');
            state.dom.btnMonthly.classList.remove('bg-white', 'text-gray-700', 'shadow');
        } else {
            state.dom.monthlyNav.classList.remove('hidden');
            state.dom.btnMonthly.classList.add('bg-white', 'text-gray-700', 'shadow');
            state.dom.btnAnnual.classList.remove('bg-white', 'text-gray-700', 'shadow');

            // Auto-zoom for detail view
            state.dom.zoomRange.value = 40;
            handleZoom();
        }
        render();
    }

    function handleMonthNav(direction) {
        const [year, month] = state.dom.monthPicker.value.split('-').map(Number);
        const currentDate = new Date(year, month, 1);
        currentDate.setMonth(currentDate.getMonth() + direction);
        const newYear = currentDate.getFullYear();
        const newMonth = currentDate.getMonth();

        if (newYear >= state.config.startYear && newYear <= state.config.endYear) {
            state.dom.monthPicker.value = `${newYear}-${newMonth}`;
            render();
        }
    }

    async function handleAddTask() {
        const todayStr = new Date().toISOString().slice(0, 10);
        const result = await showModal({
            title: 'Nueva Tarea',
            content: `
                <div>
                    <label for="name" class="block text-sm font-medium text-gray-700">Nombre de la tarea</label>
                    <input type="text" id="name" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Ej: Diseño inicial">
                </div>
                <div>
                    <label for="start" class="block text-sm font-medium text-gray-700">Fecha de inicio</label>
                    <input type="date" id="start" value="${todayStr}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                </div>
                <div>
                    <label for="end" class="block text-sm font-medium text-gray-700">Fecha de fin</label>
                    <input type="date" id="end" value="${todayStr}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                </div>
            `
        });

        if (result) {
            if (!result.name || !result.start || !result.end) return;
            if (new Date(result.end) < new Date(result.start)) {
                alert('La fecha de fin no puede ser anterior a la de inicio.');
                return;
            }
            try {
                await addDoc(collection(db, "tareas"), {
                    title: result.name,
                    startDate: result.start,
                    dueDate: result.end,
                    isProjectTask: true, // This is crucial for it to appear in the planning view
                    status: "Pendiente",
                    progress: 0,
                    dependsOn: []
                });
            } catch (error) {
                console.error("Error adding task: ", error);
                alert("No se pudo crear la tarea.");
            }
        }
    }

    async function handleDeleteTask(taskId) {
        // First, remove the dependency from any other tasks
        const tasksToUpdate = state.tasks.filter(t => t.dependencies?.includes(taskId));
        const updatePromises = tasksToUpdate.map(t => {
            const taskRef = doc(db, "tareas", t.id);
            return updateDoc(taskRef, {
                dependsOn: arrayRemove(taskId)
            });
        });

        try {
            await Promise.all(updatePromises);
            await deleteDoc(doc(db, "tareas", taskId));
        } catch (error) {
            console.error("Error deleting task and updating dependencies:", error);
        }
    }

    function handleEditTaskName(task, cardElement) {
        const titleP = cardElement.querySelector('p:first-child');
        const originalText = task.name;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText;
        input.className = 'font-medium text-[13px] text-gray-800 bg-white border border-blue-400 rounded p-0 m-0 w-full focus:ring-1 focus:ring-blue-500';

        titleP.replaceWith(input);
        input.focus();
        input.select();

        const saveChanges = async () => {
            const newName = input.value.trim();
            if (newName && newName !== originalText) {
                const taskRef = doc(db, "tareas", task.id);
                try {
                    await updateDoc(taskRef, { title: newName });
                } catch (error) {
                    console.error("Error updating task name:", error);
                    // Revert UI change if Firestore update fails
                    titleP.textContent = originalText;
                }
            } else {
                 titleP.textContent = originalText;
            }
            input.replaceWith(titleP);
        };
        const keydownHandler = (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = originalText; input.blur(); }
        };
        input.addEventListener('blur', saveChanges, { once: true });
        input.addEventListener('keydown', keydownHandler);
    }

    async function handleAddMilestone() {
        const todayStr = new Date().toISOString().slice(0, 10);
        const result = await showModal({
            title: 'Nueva Fecha Clave',
            content: `
                <div>
                    <label for="name" class="block text-sm font-medium text-gray-700">Nombre (ej: SOP)</label>
                    <input type="text" id="name" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm" placeholder="Hito importante">
                </div>
                <div>
                    <label for="date" class="block text-sm font-medium text-gray-700">Fecha</label>
                    <input type="date" id="date" value="${todayStr}" class="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                </div>
            `
        });
        if (result && result.name && result.date) {
            state.milestones.push({ id: `m${Date.now()}`, name: result.name, date: result.date });
            saveMilestoneState();
            render();
        }
    }

    function handleDeleteMilestone(milestoneId) {
        state.milestones = state.milestones.filter(m => m.id !== milestoneId);
        saveMilestoneState();
        render();
    }

    function handleEditMilestoneName(milestone, labelElement) {
        const labelSpan = labelElement.querySelector('span');
        const originalText = labelSpan.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.value = originalText;
        input.className = 'bg-transparent text-xs p-0 m-0 w-20 focus:ring-0 border-0 border-b border-yellow-700';

        labelSpan.style.display = 'none';
        labelElement.prepend(input);
        input.focus();
        input.select();

        const saveChanges = () => {
            const newName = input.value.trim();
            if (newName && newName !== milestone.name) {
                milestone.name = newName;
                saveMilestoneState();
            }
            labelSpan.textContent = milestone.name;
            labelSpan.style.display = 'inline';
            input.remove();
        };
        const keydownHandler = (e) => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') { input.value = originalText; input.blur(); }
        };
        input.addEventListener('blur', saveChanges, { once: true });
        input.addEventListener('keydown', keydownHandler);
    }

    function handleGoToToday() {
        const today = new Date('2025-10-11T12:00:00Z');
        const todayIdx = dateToIndex(today);
        const targetScrollLeft = Math.max(0, (todayIdx * state.view.dayWidth) - (state.dom.timelineScroll.clientWidth / 3));
        state.dom.timelineScroll.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    }

    function setupTaskListDnD() {
        // Drag and drop for task re-ordering is disabled when using Firestore real-time updates
        // as the order is determined by the data source. A specific order field would be needed.
        // This functionality could be re-enabled by adding an 'order' field to the Firestore documents
        // and updating it on drop.
        return;
    }

    async function handleDependencyClick(e) {
        const { taskId, side } = e.target.dataset;
        if (!state.linking) {
            if (side === 'start') return; // Cannot create dependency from a task's start
            state.linking = { fromTaskId: taskId, fromEl: e.target };
            e.target.classList.add('linking-from');
            document.body.classList.add('is-linking');
            createLinkingPreview();
        } else {
            if (side === 'end' || taskId === state.linking.fromTaskId) {
                cancelLinking();
                return;
            }

            const toTaskRef = doc(db, "tareas", taskId);
            try {
                await updateDoc(toTaskRef, {
                    dependsOn: arrayUnion(state.linking.fromTaskId)
                });
            } catch (error) {
                console.error("Error creating dependency: ", error);
            } finally {
                cancelLinking();
            }
        }
    }

    function createLinkingPreview() {
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, 'svg');
        svg.setAttribute('class', 'linking-layer');
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('class', 'linking-path');
        svg.appendChild(path);
        state.dom.timelineScroll.querySelector('.bars-grid').appendChild(svg);

        const rect = state.linking.fromEl.getBoundingClientRect();
        const scrollRect = state.dom.timelineScroll.getBoundingClientRect();
        const startX = rect.left - scrollRect.left + rect.width / 2 + state.dom.timelineScroll.scrollLeft;
        const startY = rect.top - scrollRect.top + rect.height / 2;

        const moveHandler = (e) => {
            const endX = e.clientX - scrollRect.left + state.dom.timelineScroll.scrollLeft;
            const endY = e.clientY - scrollRect.top;
            path.setAttribute('d', `M ${startX} ${startY} L ${endX} ${endY}`);
        };
        document.addEventListener('mousemove', moveHandler);
        state.linking.previewMoveHandler = moveHandler;
    }

    function cancelLinking() {
        if (!state.linking) return;
        document.removeEventListener('mousemove', state.linking.previewMoveHandler);
        state.linking.fromEl.classList.remove('linking-from');
        document.body.classList.remove('is-linking');
        const linkingLayer = state.dom.timelineScroll.querySelector('.linking-layer');
        if (linkingLayer) linkingLayer.remove();
        state.linking = null;
    }

    function init() {
        const domIds = [
            'rangeLabel', 'btnAnnual', 'btnMonthly', 'zoomRange', 'monthPicker', 'monthlyNav', 'btnPrevMonth', 'btnNextMonth',
            'taskList', 'timelineScroll', 'yearsTrack', 'monthsTrack', 'weeksTrack',
            'daysTrack', 'daysViewport', 'weeksViewport', 'addTaskBtn', 'addMilestoneBtn', 'btnGoToday'
        ];
        domIds.forEach(id => state.dom[id] = $(id));

        cacheModalDomElements();
        loadMilestoneState(); // Load milestones from local storage
        buildMonthPicker();
        attachEventListeners();

        // Listen for real-time updates from Firestore
        const q = query(collection(db, "tareas"), where("isProjectTask", "==", true));
        onSnapshot(q, (querySnapshot) => {
            const tasks = [];
            querySnapshot.forEach((doc) => {
                const data = doc.data();
                tasks.push({
                    id: doc.id,
                    name: data.title,
                    start: data.startDate,
                    end: data.dueDate,
                    progress: data.progress || 0,
                    dependencies: data.dependsOn || []
                });
            });
            state.tasks = tasks;
            // The render is now triggered by the onSnapshot listener, ensuring UI is always in sync with DB
            render();
        }, (error) => {
            console.error("Error fetching real-time tasks:", error);
        });
    }

    function buildMonthPicker() {
        const frag = document.createDocumentFragment();
        for (let y = state.config.startYear; y <= state.config.endYear; y++) {
            for (let m = 0; m < 12; m++) {
                const option = document.createElement('option');
                option.value = `${y}-${m}`;
                option.textContent = `${MONTH_NAMES[m]} ${y}`;
                frag.appendChild(option);
            }
        }
        state.dom.monthPicker.replaceChildren(frag);
        const now = new Date();
        const currentYear = now.getFullYear();
        if (currentYear >= state.config.startYear && currentYear <= state.config.endYear) {
            state.dom.monthPicker.value = `${currentYear}-${now.getMonth()}`;
        }
    }

    function attachEventListeners() {
        attachDragToScroll(state.dom.timelineScroll, state.dom.timelineScroll);
        attachDragToScroll(state.dom.daysViewport, state.dom.timelineScroll);
        attachDragToScroll(state.dom.weeksViewport, state.dom.timelineScroll);
        state.dom.timelineScroll.addEventListener('scroll', syncHeaderScroll);

        state.dom.zoomRange.addEventListener('input', handleZoom);
        state.dom.btnAnnual.addEventListener('click', () => handleModeChange('annual'));
        state.dom.btnMonthly.addEventListener('click', () => handleModeChange('monthly'));
        state.dom.monthPicker.addEventListener('change', render);

        state.dom.btnPrevMonth.addEventListener('click', () => handleMonthNav(-1));
        state.dom.btnNextMonth.addEventListener('click', () => handleMonthNav(1));

        if (state.dom.addTaskBtn) {
            state.dom.addTaskBtn.addEventListener('click', handleAddTask);
        }
        if (state.dom.addMilestoneBtn) {
            state.dom.addMilestoneBtn.addEventListener('click', handleAddMilestone);
        }
        state.dom.btnGoToday.addEventListener('click', handleGoToToday);

        setupTaskListDnD();

        const aiAssistantButton = $('ai-assistant-button');
        if (aiAssistantButton) {
            aiAssistantButton.addEventListener('click', openAIAssistantModal);
        }

        state.dom.timelineScroll.addEventListener('click', (e) => {
            if (e.target.classList.contains('dep-handle')) {
                handleDependencyClick(e);
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') cancelLinking();
        });
    }

    init();
}
