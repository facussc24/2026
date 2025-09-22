// A single state object for the entire tasks module
// Cache-busting comment
const tasksModuleState = {
    // Kanban View State
    kanban: {
        activeFilter: 'personal', // 'engineering', 'personal', 'all'
        searchTerm: '',
        priorityFilter: 'all',
        selectedUserId: null, // for supervision view
    },

    // Dashboard & Admin View State
    dashboard: {
        allTasks: [], // Raw list of all tasks for the dashboard
        viewMode: 'all', // 'all', 'my-tasks', or a specific user ID

        // Filters for the table view
        tableFilters: {
            searchTerm: '',
            user: 'all',
            priority: 'all',
            status: 'all'
        },
        tableSort: {
            by: 'createdAt',
            order: 'desc'
        },
        tablePagination: {
            pageHistory: [null], // An array of document snapshots, acting as cursors for each page.
            currentPage: 1,
            isLastPage: false,
            pageSize: 10
        },

        // Calendar state
        calendar: {
            currentDate: new Date(),
            view: 'monthly',
            priorityFilter: 'all'
        },

        // Chart instances
        charts: {
            statusChart: null,
            priorityChart: null,
            userLoadChart: null
        }
    },

    // Common state
    unsubscribers: [],
};

// --- State Accessors and Mutators ---

export function initTaskState(dependencies) {
    // This function can be used to reset the state if needed
}

export function getState() {
    return tasksModuleState;
}

export function setKanbanFilter(filter) {
    tasksModuleState.kanban.activeFilter = filter;
}

export function setKanbanSearchTerm(term) {
    tasksModuleState.kanban.searchTerm = term;
}

export function setKanbanPriorityFilter(priority) {
    tasksModuleState.kanban.priorityFilter = priority;
}

export function setKanbanSelectedUser(userId) {
    tasksModuleState.kanban.selectedUserId = userId;
}

export function setDashboardTasks(tasks) {
    tasksModuleState.dashboard.allTasks = tasks;
}

export function setDashboardViewMode(mode) {
    tasksModuleState.dashboard.viewMode = mode;
}

export function setDashboardTableFilter(filter, value) {
    tasksModuleState.dashboard.tableFilters[filter] = value;
}

export function setDashboardTableSort(by) {
    if (tasksModuleState.dashboard.tableSort.by === by) {
        tasksModuleState.dashboard.tableSort.order = tasksModuleState.dashboard.tableSort.order === 'asc' ? 'desc' : 'asc';
    } else {
        tasksModuleState.dashboard.tableSort.by = by;
        tasksModuleState.dashboard.tableSort.order = 'asc';
    }
}

export function setDashboardTablePage(page) {
    tasksModuleState.dashboard.tablePagination.currentPage = page;
}

export function setDashboardTablePageHistory(history) {
    tasksModuleState.dashboard.tablePagination.pageHistory = history;
}

export function setDashboardTableIsLastPage(isLast) {
    tasksModuleState.dashboard.tablePagination.isLastPage = isLast;
}

export function resetDashboardState() {
    const d = tasksModuleState.dashboard;
    d.allTasks = [];
    d.viewMode = 'all';
    d.tableFilters = { searchTerm: '', user: 'all', priority: 'all', status: 'all' };
    d.tableSort = { by: 'createdAt', order: 'desc' };
    d.tablePagination = { currentPage: 1, pageSize: 10 };
    d.calendar = { currentDate: new Date(), view: 'monthly', priorityFilter: 'all' };
}

export function setCalendarDate(date) {
    tasksModuleState.dashboard.calendar.currentDate = date;
}

export function setCalendarView(view) {
    tasksModuleState.dashboard.calendar.view = view;
}

export function setCalendarPriorityFilter(priority) {
    tasksModuleState.dashboard.calendar.priorityFilter = priority;
}

export function addUnsubscriber(unsub) {
    if (Array.isArray(unsub)) {
        tasksModuleState.unsubscribers.push(...unsub);
    } else {
        tasksModuleState.unsubscribers.push(unsub);
    }
}

export function clearUnsubscribers() {
    tasksModuleState.unsubscribers.forEach(unsub => unsub());
    tasksModuleState.unsubscribers = [];
}
