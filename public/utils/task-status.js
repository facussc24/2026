const MS_IN_DAY = 24 * 60 * 60 * 1000;

export const TASK_STATE = {
    COMPLETED: 'completed',
    ON_TIME: 'on_time',
    AT_RISK: 'at_risk',
    DELAYED: 'delayed'
};

export const TASK_STATE_SEQUENCE = [
    TASK_STATE.COMPLETED,
    TASK_STATE.ON_TIME,
    TASK_STATE.AT_RISK,
    TASK_STATE.DELAYED
];

const STATE_ICONS = {
    [TASK_STATE.COMPLETED]: 'check-circle-2',
    [TASK_STATE.ON_TIME]: 'clock-3',
    [TASK_STATE.AT_RISK]: 'alert-circle',
    [TASK_STATE.DELAYED]: 'alert-triangle'
};

export const TASK_STATE_CONFIG = {
    [TASK_STATE.COMPLETED]: {
        label: 'Completada',
        icon: STATE_ICONS[TASK_STATE.COMPLETED],
        chipText: () => 'Completada'
    },
    [TASK_STATE.ON_TIME]: {
        label: 'A tiempo',
        icon: STATE_ICONS[TASK_STATE.ON_TIME],
        chipText: () => 'A tiempo'
    },
    [TASK_STATE.AT_RISK]: {
        label: 'En riesgo',
        icon: STATE_ICONS[TASK_STATE.AT_RISK],
        chipText: () => 'En riesgo'
    },
    [TASK_STATE.DELAYED]: {
        label: 'Atrasada',
        icon: STATE_ICONS[TASK_STATE.DELAYED],
        chipText: (schedule) => {
            const delay = Number.isFinite(schedule?.atrasoDias) ? schedule.atrasoDias : 0;
            if (delay > 0) {
                return `Atrasada (+${delay}d)`;
            }
            return 'Atrasada';
        }
    }
};

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

function normalizeDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    date.setHours(0, 0, 0, 0);
    return date;
}

function parseTaskDate(value) {
    if (!value) return null;

    if (value instanceof Date) {
        return normalizeDate(value);
    }

    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const isoCandidate = trimmed.includes('T') ? trimmed : `${trimmed}T00:00:00`;
        return normalizeDate(isoCandidate);
    }

    if (typeof value === 'number') {
        return normalizeDate(value);
    }

    if (value && typeof value.toDate === 'function') {
        try {
            return normalizeDate(value.toDate());
        } catch (error) {
            return null;
        }
    }

    if (value && typeof value === 'object' && typeof value.seconds === 'number') {
        return normalizeDate(value.seconds * 1000);
    }

    return null;
}

function formatTooltipDate(date) {
    if (!date || Number.isNaN(date.getTime())) {
        return '—';
    }
    const formatter = new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short'
    });
    const formatted = formatter.format(date);
    return formatted.replace('.', '').replace(/\s+/g, ' ');
}

function resolveActualDate(task, type) {
    if (!task || typeof task !== 'object') return null;
    const candidateKeys = type === 'start'
        ? ['actualStartDate', 'realStartDate', 'startReal', 'startedAt']
        : ['actualEndDate', 'realEndDate', 'endReal', 'completedAt', 'endDate'];
    for (const key of candidateKeys) {
        if (Object.prototype.hasOwnProperty.call(task, key)) {
            const parsed = parseTaskDate(task[key]);
            if (parsed) {
                return parsed;
            }
        }
    }
    return null;
}

export function formatSignedPoints(value) {
    if (!Number.isFinite(value)) return '0';
    const rounded = Math.round(value);
    if (rounded > 0) return `+${rounded}`;
    return String(rounded);
}

export function formatDelayLabel(days) {
    if (!Number.isFinite(days) || days <= 0) {
        return '0 días';
    }
    return `${days} ${days === 1 ? 'día' : 'días'}`;
}

export function formatPlannedRange(schedule, options = {}) {
    const { includeYear = false } = options;
    const startDate = schedule?.planStartDate instanceof Date ? schedule.planStartDate : null;
    const endDate = schedule?.planEndDate instanceof Date ? schedule.planEndDate : null;

    if (!startDate && !endDate) {
        return 'Sin plan';
    }

    const formatter = new Intl.DateTimeFormat('es-AR', {
        day: '2-digit',
        month: 'short',
        ...(includeYear ? { year: 'numeric' } : {})
    });

    const formatPart = (value) => {
        if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
            return '—';
        }
        return formatter.format(value).replace('.', '').replace(/\s+/g, ' ');
    };

    return `${formatPart(startDate)} → ${formatPart(endDate)}`;
}

export function calculateTaskScheduleMetrics(task, options = {}) {
    const referenceDate = normalizeDate(options.referenceDate || new Date());
    const progressRaw = Number.parseFloat(task?.progress);
    let progressPercent = Number.isFinite(progressRaw) ? progressRaw : null;
    if (!Number.isFinite(progressPercent)) {
        if (task?.status === 'done' || task?.isArchived) {
            progressPercent = 100;
        } else {
            progressPercent = 0;
        }
    }
    progressPercent = clamp(progressPercent, 0, 100);
    const progressReal = progressPercent / 100;

    const planStartDate = parseTaskDate(task?.startDate);
    const planEndDate = parseTaskDate(task?.dueDate) || parseTaskDate(task?.endDate);
    const hasPlanRange = planStartDate && planEndDate && planEndDate.getTime() >= planStartDate.getTime();

    let planDurationDays = 0;
    let plannedProgress = progressReal;
    let plannedProgressPercent = progressPercent;
    let delta = 0;

    if (hasPlanRange) {
        const totalDurationMs = planEndDate.getTime() - planStartDate.getTime();
        const totalPlanDays = Math.max(1, totalDurationMs / MS_IN_DAY);
        const elapsedDays = referenceDate
            ? clamp((referenceDate.getTime() - planStartDate.getTime()) / MS_IN_DAY, 0, totalPlanDays)
            : 0;
        plannedProgress = clamp(elapsedDays / totalPlanDays, 0, 1);
        plannedProgressPercent = plannedProgress * 100;
        delta = progressReal - plannedProgress;
        planDurationDays = Math.max(1, Math.round(totalPlanDays));
    }

    const isCompleted = progressReal >= 1;
    const delayedByDate = !isCompleted && planEndDate && referenceDate && referenceDate.getTime() > planEndDate.getTime();
    const delayedByDelta = delta <= -0.15;

    let state = TASK_STATE.ON_TIME;
    if (isCompleted) {
        state = TASK_STATE.COMPLETED;
    } else if (delayedByDate || delayedByDelta) {
        state = TASK_STATE.DELAYED;
    } else if (delta < -0.05) {
        state = TASK_STATE.AT_RISK;
    }

    let atrasoDias = 0;
    if (state === TASK_STATE.DELAYED) {
        if (delayedByDate && planEndDate && referenceDate) {
            atrasoDias = Math.max(0, Math.round((referenceDate.getTime() - planEndDate.getTime()) / MS_IN_DAY));
        } else if (hasPlanRange) {
            atrasoDias = Math.max(0, Math.round((plannedProgress - progressReal) * planDurationDays));
        }
    }

    return {
        state,
        progressReal,
        progressPercent,
        plannedProgress,
        plannedProgressPercent,
        delta,
        deltaPercentagePoints: (progressReal - plannedProgress) * 100,
        atrasoDias,
        planDurationDays,
        planStartDate: hasPlanRange ? planStartDate : null,
        planEndDate: hasPlanRange ? planEndDate : null,
        hasPlanRange,
        delayedByDate,
        delayedByDelta,
        referenceDate
    };
}

export function getTaskStateDisplay(schedule) {
    const safeSchedule = schedule || {};
    const config = TASK_STATE_CONFIG[safeSchedule.state] || TASK_STATE_CONFIG[TASK_STATE.ON_TIME];
    const chipText = typeof config.chipText === 'function' ? config.chipText(safeSchedule) : config.chipText;
    return {
        state: safeSchedule.state || TASK_STATE.ON_TIME,
        label: config.label,
        icon: config.icon,
        chipText
    };
}

export function getTaskStateChipHTML(scheduleOrState, options = {}) {
    const schedule = typeof scheduleOrState === 'string'
        ? { state: scheduleOrState }
        : (scheduleOrState || {});

    const {
        showIcon = true,
        textType = 'chip',
        extraClasses = '',
        tooltip
    } = options;

    const display = getTaskStateDisplay(schedule);
    const text = textType === 'label' ? display.label : display.chipText;
    const iconMarkup = showIcon && display.icon
        ? `<i data-lucide="${display.icon}"></i>`
        : '';
    const className = ['task-state-chip', extraClasses].filter(Boolean).join(' ');
    const title = tooltip || display.label;

    return `<span class="${className}" data-task-state="${display.state}" title="${title}">${iconMarkup}${text}</span>`;
}

export function formatTaskScheduleTooltip(task, schedule) {
    const safeSchedule = schedule || {};
    const planStartLabel = formatTooltipDate(safeSchedule.planStartDate);
    const planEndLabel = formatTooltipDate(safeSchedule.planEndDate);
    const actualStart = resolveActualDate(task, 'start');
    const actualEnd = resolveActualDate(task, 'end');
    const actualStartLabel = formatTooltipDate(actualStart);
    const actualEndLabel = formatTooltipDate(actualEnd);
    const progressValue = Number.isFinite(safeSchedule.progressPercent)
        ? safeSchedule.progressPercent
        : (safeSchedule.progressReal ?? 0) * 100;
    const progressLabel = `${Math.round(progressValue)}%`;
    const deltaLabel = `${formatSignedPoints(safeSchedule.deltaPercentagePoints)} pp`;
    const delayLabel = formatDelayLabel(safeSchedule.atrasoDias);

    return `Plan: ${planStartLabel} → ${planEndLabel} • Real: ${actualStartLabel} → ${actualEndLabel} • Avance: ${progressLabel} • Delta: ${deltaLabel} • Atraso: ${delayLabel}`;
}

export function augmentTaskWithSchedule(task, options = {}) {
    if (!task || typeof task !== 'object') return task;
    const schedule = calculateTaskScheduleMetrics(task, options);
    return {
        ...task,
        schedule,
        isOverdue: schedule.state === TASK_STATE.DELAYED,
        delayDays: schedule.atrasoDias
    };
}

export function augmentTasksWithSchedule(tasks, options = {}) {
    if (!Array.isArray(tasks)) return [];
    return tasks.map(task => augmentTaskWithSchedule(task, options));
}
