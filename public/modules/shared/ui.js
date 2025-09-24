import { formatTimeAgo } from '/utils.js';

let dom;
let appState;
let lucide;

export function initSharedUI(dependencies) {
    dom = dependencies.dom;
    appState = dependencies.appState;
    lucide = dependencies.lucide;
}

export function renderNotificationCenter() {
    const container = document.getElementById('notification-center-container');
    if (!container) return;

    const notifications = appState.collections.notifications || [];
    const unreadCount = notifications.filter(n => !n.isRead).length;

    let notificationItemsHTML = '';
    if (notifications.length === 0) {
        notificationItemsHTML = '<p class="text-center text-sm text-slate-500 py-8">No tienes notificaciones.</p>';
    } else {
        notificationItemsHTML = notifications.slice(0, 10).map(n => `
            <a href="#" data-action="notification-click" data-view='${n.view}' data-params='${JSON.stringify(n.params)}' data-id="${n.docId}"
               class="block p-3 hover:bg-slate-100 transition-colors duration-150 ${n.isRead ? 'opacity-60' : 'font-semibold'}">
                <p class="text-sm">${n.message}</p>
                <p class="text-xs text-slate-400 mt-1">${formatTimeAgo(n.createdAt.seconds * 1000)}</p>
            </a>
        `).join('');
    }

    container.innerHTML = `
        <button id="notification-bell" class="relative p-2 rounded-full hover:bg-slate-100">
            <i data-lucide="bell" class="w-6 h-6 text-slate-600"></i>
            ${unreadCount > 0 ? `<span class="absolute top-0 right-0 block h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center border-2 border-white">${unreadCount}</span>` : ''}
        </button>
        <div id="notification-dropdown" class="absolute z-20 right-0 mt-2 w-80 bg-white border rounded-lg shadow-xl hidden dropdown-menu">
            <div class="flex justify-between items-center p-3 border-b">
                <h4 class="font-bold">Notificaciones</h4>
                ${unreadCount > 0 ? '<button data-action="mark-all-read" class="text-xs text-blue-600 hover:underline">Marcar todas como leídas</button>' : ''}
            </div>
            <div id="notification-list" class="max-h-96 overflow-y-auto">
                ${notificationItemsHTML}
            </div>
        </div>
    `;
    lucide.createIcons();

    document.getElementById('notification-bell')?.addEventListener('click', () => {
        document.getElementById('notification-dropdown')?.classList.toggle('hidden');
    });
}

/**
 * Muestra un mensaje flotante (toast) en la pantalla.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} [type='success'] - El tipo de toast ('success', 'error', 'info', 'loading').
 * @param {object} [options={}] - Opciones adicionales.
 * @param {number} [options.duration=3000] - Duración en milisegundos. 0 para que no se oculte.
 * @param {string|null} [options.toastId=null] - El ID de un toast existente para actualizarlo.
 * @returns {string} El ID del elemento toast.
 */
export function showToast(message, type = 'success', options = {}) {
    const { duration = 3000, toastId = null } = typeof options === 'number' ? { duration: options } : options;
    const icons = { success: 'check-circle', error: 'alert-circle', info: 'info', loading: 'loader' };
    const icon = icons[type] || 'info';

    let toastElement = toastId ? document.getElementById(toastId) : null;
    const toastContent = `<i data-lucide="${icon}" class="${type === 'loading' ? 'animate-spin' : ''}"></i><span>${message}</span>`;

    if (toastElement) {
        // Update existing toast
        toastElement.className = `toast ${type} show`;
        toastElement.innerHTML = toastContent;
        lucide.createIcons({ nodes: [toastElement.querySelector('i')] });
    } else {
        // Create new toast
        const newToastId = `toast-${Date.now()}`;
        const toast = document.createElement('div');
        toast.id = newToastId;
        toast.className = `toast ${type}`;
        toast.innerHTML = toastContent;

        dom.toastContainer.appendChild(toast);
        lucide.createIcons({ nodes: [toast.querySelector('i')] });
        // Use a short timeout to allow the element to be in the DOM for the transition to work.
        setTimeout(() => toast.classList.add('show'), 10);
        toastElement = toast;
    }

    // Auto-hide unless it's a loading message or duration is set to 0
    if (type !== 'loading' && duration > 0) {
        setTimeout(() => {
            toastElement.classList.remove('show');
            // Remove the element after the transition is complete
            toastElement.addEventListener('transitionend', () => toastElement.remove());
        }, duration);
    }

    return toastElement.id;
}

/**
 * Muestra un modal de confirmación.
 * @param {string} title - El título del modal.
 * @param {string} message - El mensaje del modal.
 * @param {function} onConfirm - La función a ejecutar si el usuario confirma.
 */
export function showConfirmationModal(title, message, onConfirm) {
    const modalId = `confirm-modal-${Date.now()}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-md m-4 animate-scale-in">
                <div class="p-6 text-center">
                    <i data-lucide="alert-triangle" class="h-12 w-12 mx-auto text-yellow-500 mb-4"></i>
                    <h3 class="text-xl font-bold text-slate-800 mb-2">${title}</h3>
                    <p class="text-slate-600">${message}</p>
                </div>
                <div class="flex justify-center items-center p-4 border-t border-slate-200 bg-slate-50 space-x-4">
                    <button data-action="cancel" class="bg-slate-200 text-slate-800 px-6 py-2 rounded-md hover:bg-slate-300 font-semibold transition-colors">Cancelar</button>
                    <button data-action="confirm" class="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 font-semibold transition-colors">Confirmar</button>
                </div>
            </div>
        </div>`;
    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);
    modalElement.addEventListener('click', e => {
        const action = e.target.closest('button')?.dataset.action;
        if (action === 'confirm') { onConfirm(); modalElement.remove(); }
        else if (action === 'cancel') { modalElement.remove(); }
    });
}

/**
 * Muestra un modal de información.
 * @param {string} title - El título del modal.
 * @param {string} htmlContent - El contenido HTML del modal.
 */
export function showInfoModal(title, htmlContent) {
    const modalId = `info-modal-${Date.now()}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 max-h-[80vh] flex flex-col animate-scale-in">
                <div class="flex justify-between items-center p-5 border-b border-slate-200">
                    <h3 class="text-xl font-bold text-slate-800 flex items-center gap-3"><i data-lucide="info" class="w-6 h-6 text-blue-500"></i>${title}</h3>
                    <button data-action="close" class="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 transition-colors"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-6 overflow-y-auto custom-scrollbar">
                    ${htmlContent}
                </div>
                <div class="flex justify-end items-center p-4 border-t border-slate-200 bg-slate-50">
                    <button data-action="close" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold transition-colors">Entendido</button>
                </div>
            </div>
        </div>`;
    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);
    modalElement.addEventListener('click', e => {
        if (e.target.closest('button')?.dataset.action === 'close') {
            modalElement.remove();
        }
    });
}

/**
 * Muestra un modal para solicitar una fecha.
 * @param {string} title - El título del modal.
 * @param {string} message - El mensaje a mostrar.
 * @returns {Promise<string|null>} La fecha seleccionada en formato YYYY-MM-DD o null si se cancela.
 */
export function showDatePromptModal(title, message) {
    return new Promise(resolve => {
        const modalId = `date-prompt-modal-${Date.now()}`;
        const today = new Date().toISOString().split('T')[0];
        const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-md m-4 modal-content">
                <div class="p-6">
                    <h3 class="text-xl font-bold mb-2">${title}</h3>
                    <p class="text-gray-600 mb-4">${message}</p>
                    <input type="date" id="date-prompt-input" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" value="${today}">
                </div>
                <div class="flex justify-end items-center p-4 border-t bg-gray-50 space-x-4">
                    <button data-action="cancel" class="bg-gray-200 text-gray-800 px-6 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                    <button data-action="confirm" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Aceptar</button>
                </div>
            </div>
        </div>`;
        dom.modalContainer.innerHTML = modalHTML;
        const modalElement = document.getElementById(modalId);
        const input = modalElement.querySelector('#date-prompt-input');
        input.focus();

        const close = (value) => {
            modalElement.remove();
            resolve(value);
        };

        modalElement.addEventListener('click', e => {
            const action = e.target.closest('button')?.dataset.action;
            if (action === 'confirm') {
                close(input.value);
            } else if (action === 'cancel') {
                close(null);
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                close(input.value);
            } else if (e.key === 'Escape') {
                close(null);
            }
        });
    });
}

export function updateNavForRole() {
    const userManagementLink = document.querySelector('[data-view="user_management"]');
    const coverMasterLink = document.querySelector('[data-view="cover_master"]');
    if (!userManagementLink || !coverMasterLink) return;

    const shouldShow = appState.currentUser && appState.currentUser.role === 'admin';

    userManagementLink.style.display = shouldShow ? 'flex' : 'none';
    coverMasterLink.style.display = shouldShow ? 'flex' : 'none';

    // This targets the divider between the admin links and the regular user links
    const divider = coverMasterLink.nextElementSibling;
    if (divider && divider.matches('.border-t')) {
        divider.style.display = shouldShow ? 'block' : 'none';
    }
}

export function renderUserMenu() {
    if (appState.currentUser) {
        const isGodModeUser = appState.currentUser.isSuperAdmin;
        let godModeHTML = '';

        if (isGodModeUser) {
            const roles = ['admin', 'editor', 'lector'];
            const roleLabels = { admin: 'Admin', editor: 'Editor', lector: 'Lector' };

            const buttonsHTML = roles.map(role => {
                const isActive = appState.currentUser.role === role && appState.godModeState?.isImpersonating;
                return `<button data-god-mode-role="${role}" class="god-mode-role-btn w-full text-left flex items-center gap-3 px-2 py-1.5 text-sm rounded-md hover:bg-slate-100 ${isActive ? 'bg-blue-100 text-blue-700 font-bold' : ''}">
                    <i data-lucide="${isActive ? 'check-circle' : 'circle'}" class="w-4 h-4"></i>
                    Simular ${roleLabels[role]}
                </button>`;
            }).join('');

            godModeHTML = `
                <div class="border-t border-b bg-yellow-50/50">
                    <div class="px-4 pt-3 pb-2">
                        <p class="text-xs font-bold uppercase text-yellow-600 flex items-center gap-2">
                            <i data-lucide="shield-check" class="w-4 h-4"></i>Modo Dios
                        </p>
                    </div>
                    <div class="p-2 space-y-1">
                        ${buttonsHTML}
                        <div class="border-t my-1"></div>
                        <button data-god-mode-role="real" class="god-mode-role-btn w-full text-left flex items-center gap-3 px-2 py-1.5 text-sm rounded-md font-bold text-yellow-800 hover:bg-yellow-100">
                           <i data-lucide="user-check" class="w-4 h-4"></i> Volver a Rol Real
                        </button>
                    </div>
                </div>
            `;
        }

        dom.userMenuContainer.innerHTML = `
            <button id="user-menu-button" class="flex items-center space-x-2">
                <img src="${appState.currentUser.avatarUrl}" alt="Avatar" class="w-10 h-10 rounded-full border-2 border-slate-300">
                <span class="font-semibold text-slate-700 hidden md:inline">${appState.currentUser.name}</span>
                <i data-lucide="chevron-down" class="text-slate-600"></i>
            </button>
            <div id="user-dropdown" class="absolute z-20 right-0 mt-2 w-56 bg-white border rounded-lg shadow-xl hidden dropdown-menu">
                <div class="p-4 border-b"><p class="font-bold text-slate-800">${appState.currentUser.name}</p><p class="text-sm text-slate-500">${appState.currentUser.email}</p></div>
                ${godModeHTML}
                <a href="#" data-view="profile" class="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-100"><i data-lucide="user-circle" class="w-5 h-5 text-slate-500"></i>Mi Perfil</a>
                <a href="#" id="logout-button" class="flex items-center gap-3 px-4 py-3 text-sm text-red-600 hover:bg-red-50"><i data-lucide="log-out" class="w-5 h-5"></i>Cerrar Sesión</a>
            </div>`;
    } else {
        dom.userMenuContainer.innerHTML = '';
    }
    lucide.createIcons();
}

/**
 * Muestra un modal para solicitar un valor de texto.
 * @param {string} title - El título del modal.
 * @param {string} message - El mensaje a mostrar.
 * @returns {Promise<string|null>} El texto ingresado o null si se cancela.
 */
export function showPromptModal(title, message) {
    return new Promise(resolve => {
        const modalId = `prompt-modal-${Date.now()}`;
        const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-md m-4 modal-content">
                <div class="p-6">
                    <h3 class="text-xl font-bold mb-2">${title}</h3>
                    <p class="text-gray-600 mb-4">${message}</p>
                    <input type="text" id="prompt-input" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                </div>
                <div class="flex justify-end items-center p-4 border-t bg-gray-50 space-x-4">
                    <button data-action="cancel" class="bg-gray-200 text-gray-800 px-6 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                    <button data-action="confirm" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Aceptar</button>
                </div>
            </div>
        </div>`;
        dom.modalContainer.innerHTML = modalHTML;
        const modalElement = document.getElementById(modalId);
        const input = modalElement.querySelector('#prompt-input');
        input.focus();

        const close = (value) => {
            modalElement.remove();
            resolve(value);
        };

        modalElement.addEventListener('click', e => {
            const action = e.target.closest('button')?.dataset.action;
            if (action === 'confirm') {
                close(input.value.trim());
            } else if (action === 'cancel') {
                close(null);
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                close(input.value.trim());
            } else if (e.key === 'Escape') {
                close(null);
            }
        });
    });
}
