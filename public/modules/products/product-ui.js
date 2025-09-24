const noop = () => false;

let uiDependencies = {
    appState: null,
    checkUserPermission: noop,
};

export function initProductUI(overrides = {}) {
    for (const [key, value] of Object.entries(overrides)) {
        if (value !== undefined) {
            uiDependencies[key] = value;
        }
    }
}

export function renderNodo(nodo, checkPermissionFunc = uiDependencies.checkUserPermission) {
    const appState = uiDependencies.appState;
    if (!appState) return '';

    const collectionName = nodo.tipo + 's';
    const item = appState.collectionsById[collectionName]?.get(nodo.refId);
    if (!item) return '';

    const addableChildrenTypes = { producto: ['semiterminado', 'insumo'], semiterminado: ['semiterminado', 'insumo'], insumo: [] }[nodo.tipo] || [];

    let addActionsDropdown = '';
    if (checkPermissionFunc('edit') && addableChildrenTypes.length > 0) {
        const dropdownItems = addableChildrenTypes.map(tipo =>
            `<a href="#" data-action="add-node" data-node-id="${nodo.id}" data-child-type="${tipo}" class="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">
                <i data-lucide="plus-circle" class="w-4 h-4 text-slate-500"></i>
                <span>Agregar ${tipo}</span>
            </a>`
        ).join('');

        addActionsDropdown = `
            <div class="relative dropdown-container">
                <button data-action="toggle-add-dropdown" class="p-1.5 rounded-full hover:bg-slate-200 transition-colors">
                    <i data-lucide="plus-circle" class="h-5 w-5 text-slate-600 pointer-events-none"></i>
                </button>
                <div class="dropdown-menu absolute right-0 mt-2 w-48 bg-white border rounded-lg shadow-xl hidden z-10 py-1">
                    ${dropdownItems}
                </div>
            </div>
        `;
    }

    const deleteButton = (checkPermissionFunc('delete') && nodo.tipo !== 'producto')
        ? `<button data-action="delete-node" data-node-id="${nodo.id}" class="p-1.5 rounded-full hover:bg-slate-200 transition-colors" title="Eliminar">
               <i data-lucide="trash-2" class="h-5 w-5 text-red-500 pointer-events-none"></i>
           </button>`
        : '';

    const isDraggable = nodo.tipo !== 'producto';
    const canEdit = checkPermissionFunc('edit');

    const quantityHTML = (nodo.tipo !== 'producto') ?
        `<span
            contenteditable="${canEdit}"
            data-field="quantity"
            class="node-attribute-editor min-w-[3ch] text-center text-sm font-semibold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full hover:bg-slate-300 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            title="Cantidad"
        >${nodo.quantity || 1}</span>` : '';

    const commentHTML =
        `<span
            contenteditable="${canEdit}"
            data-field="comment"
            class="node-attribute-editor text-sm text-slate-500 italic hover:bg-slate-100 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none rounded-md px-2 py-1"
            placeholder="Añadir comentario..."
        >${nodo.comment || ''}</span>`;

    return `<li data-node-id="${nodo.id}" class="group relative pt-2">
                <div class="node-content ${isDraggable ? '' : 'cursor-default'} bg-white border border-slate-200 rounded-lg p-3 flex items-center gap-3" data-type="${nodo.tipo}">
                    <i data-lucide="${nodo.icon}" class="h-5 w-5 text-slate-600 flex-shrink-0"></i>
                    <div class="flex-grow min-w-0">
                        <p class="font-semibold truncate" title="${item.descripcion}">${item.descripcion}</p>
                        <div class="flex items-center gap-2 mt-1">
                            <span class="text-xs text-white font-bold bg-slate-400 px-2 py-0.5 rounded-full flex-shrink-0">${nodo.tipo}</span>
                            ${quantityHTML}
                            ${commentHTML}
                        </div>
                    </div>
                    <div class="node-actions flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        ${addActionsDropdown}
                        ${deleteButton}
                    </div>
                </div>
                ${(addableChildrenTypes.length > 0 && nodo.children) ? `<ul class="node-children-list pl-6">${nodo.children.map(child => renderNodo(child, checkPermissionFunc)).join('')}</ul>` : ''}
            </li>`;
}
