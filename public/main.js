/**
 * @file Main application logic for the "Gestión PRO" manufacturing management system.
 * @description This file handles Firebase initialization, global state management,
 * UI rendering, event handling, and the core logic for all application views and features.
 * It orchestrates the entire frontend application, connecting data from Firestore
 * with the user interface.
 * @requires firebase/app - For Firebase initialization.
 * @requires firebase/auth - For user authentication.
 * @requires firebase/firestore - For database interactions.
 * @requires firebase/functions - For calling cloud functions.
 * @requires ./utils.js - For shared utility functions and constants.
 * @requires ./data_logic.js - For complex business logic operations.
 * @requires ./tutorial.js - For the interactive tutorial feature.
 * @requires ./new-control-panel-tutorial.js - For the control panel tutorial.
 */

// --- 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE ---
// =================================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser, sendEmailVerification, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch, runTransaction, orderBy, limit, startAfter, or, getCountFromServer } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS, getUniqueKeyForCollection, createHelpTooltip, shouldRequirePpapConfirmation, validateField, saveEcrFormToLocalStorage, loadEcrFormFromLocalStorage } from './utils.js';
import { deleteProductAndOrphanedSubProducts, registerEcrApproval, getEcrFormData } from './data_logic.js';
import tutorial from './tutorial.js';
import newControlPanelTutorial from './new-control-panel-tutorial.js';

/**
 * Recursively traverses a product structure and returns a flattened array
 * representation for table views, applying level filters if necessary.
 * This function is exported for use in testing.
 * @param {object} product - The product object containing the 'estructura' tree.
 * @param {Set<string>} levelFilters - A set of level numbers (as strings) to display.
 * @returns {Array<object>} A flattened array of nodes for rendering.
 */
export const getFlattenedData = (product, levelFilters) => {
    if (!product || !product.estructura) return [];
    const tagLevels = (nodes, level) => {
        if (!nodes) return [];
        return nodes.map(node => {
            const newNode = { ...node, originalLevel: level };
            if (node.children) newNode.children = tagLevels(node.children, level + 1);
            return newNode;
        });
    };
    const taggedStructure = tagLevels(product.estructura, 0);
    const filterTree = (nodes) => {
        if (!nodes) return [];
        return nodes.reduce((acc, node) => {
            if (levelFilters.has(node.originalLevel.toString())) {
                const newNode = { ...node };
                if (node.children) newNode.children = filterTree(node.children);
                acc.push(newNode);
            } else if (node.children) {
                acc.push(...filterTree(node.children));
            }
            return acc;
        }, []);
    };
    const finalStructure = (!levelFilters || levelFilters.size === 0) ? taggedStructure : filterTree(taggedStructure);
    const flatten = (nodes, displayLevel, lineage) => {
        if (!nodes) return [];
        let result = [];
        nodes.forEach((node, index) => {
            const isLast = index === nodes.length - 1;
            const collectionName = node.tipo + 's';
            const item = appState.collectionsById[collectionName]?.get(node.refId);
            if (item) {
                result.push({ node, item, level: displayLevel, isLast, lineage });
                if (node.children) result.push(...flatten(node.children, displayLevel + 1, [...lineage, !isLast]));
            }
        });
        return result;
    };
    return flatten(finalStructure, 0, []);
};

/**
 * Recursively traverses a node tree and assigns new, unique IDs to each node.
 * This is crucial for cloning products to ensure the new structure has unique identifiers.
 * This function is exported for testing purposes.
 * @param {Array<object>} nodes - The array of root nodes of the structure to process.
 */
export function regenerateNodeIds(nodes) {
    if (!nodes) return;
    let counter = 0;
    const timestamp = Date.now();
    function processNodes(nodeArray) {
        nodeArray.forEach(node => {
            node.id = `comp_${timestamp}_${counter++}`;
            if (node.children) processNodes(node.children);
        });
    }
    processNodes(nodes);
}

const firebaseConfig = {
  apiKey: "AIzaSyAUQxlBCiYoR4-tlGL-S3xR8LXrrMkx1Tk",
  authDomain: "barackingenieria-e763c.firebaseapp.com",
  projectId: "barackingenieria-e763c",
  storageBucket: "barackingenieria-e763c.firebasestorage.app",
  messagingSenderId: "44704892099",
  appId: "1:44704892099:web:738c8cbc3cea65808a8e76",
  measurementId: "G-ZHZ3R9XXDM"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);

// =================================================================================
// --- CONSTANTES Y CONFIGURACIÓN ---
// =================================================================================
/**
 * Lock timeout in milliseconds (30 minutes).
 * @type {number}
 */
const LOCK_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * An array of predefined avatar URLs for user profiles.
 * @type {string[]}
 */
const PREDEFINED_AVATARS = [
    'https://api.dicebear.com/8.x/identicon/svg?seed=Maria%20Mitchell',
    'https://api.dicebear.com/8.x/identicon/svg?seed=Mary%20Jackson',
    'https://api.dicebear.com/8.x/identicon/svg?seed=Grace%20Hopper',
    'https://api.dicebear.com/8.x/identicon/svg?seed=Hedy%20Lamarr',
    'https://api.dicebear.com/8.x/identicon/svg?seed=Ada%20Lovelace',
    'https://api.dicebear.com/8.x/identicon/svg?seed=Katherine%20Johnson'
];

// =================================================================================
// --- 2. ESTADO GLOBAL Y CONFIGURACIÓN DE LA APP ---
// =================================================================================

/**
 * Configuration object for all application views.
 * @type {Object<string, Object>}
 */
const viewConfig = {
    dashboard: { title: 'Dashboard', singular: 'Dashboard' },
    sinoptico_tabular: { title: 'Reporte BOM (Tabular)', singular: 'Reporte BOM (Tabular)' },
    eco_form: { title: 'ECO de Producto / Proceso', singular: 'Formulario ECO' },
    eco: { title: 'Gestión de ECO', singular: 'ECO' },
    ecr: { title: 'Gestión de ECR', singular: 'ECR' },
    ecr_form: { title: 'ECR de Producto / Proceso', singular: 'Formulario ECR', dataKey: COLLECTIONS.ECR_FORMS, fields: [] },
    control_ecrs: { title: 'Panel de Control', singular: 'Control ECR' },
    seguimiento_ecr_eco: { title: 'Seguimiento ECR/ECO', singular: 'Ficha de Seguimiento' },
    ecr_seguimiento: { title: 'Seguimiento y Métricas de ECR', singular: 'Seguimiento ECR' },
    ecr_table_view: { title: 'Tabla de Control ECR', singular: 'Control ECR' },
    indicadores_ecm_view: { title: 'Indicadores ECM', singular: 'Indicador' },
    eco_form_mock_for_tutorial: { title: 'Plan de Acción (Ejemplo)', singular: 'Plan de Acción' },
    flujograma: { title: 'Flujograma de Procesos', singular: 'Flujograma' },
    arboles: { title: 'Editor de Árboles', singular: 'Árbol' },
    profile: { title: 'Mi Perfil', singular: 'Mi Perfil' },
    tareas: { title: 'Gestor de Tareas', singular: 'Tarea' },
    proyectos: { title: 'Proyectos', singular: 'Proyecto', dataKey: COLLECTIONS.PROYECTOS, columns: [ { key: 'codigo', label: 'Código' }, { key: 'nombre', label: 'Nombre' }, { key: 'descripcion', label: 'Descripción' }, { key: 'status', label: 'Estado' } ], fields: [ { key: 'codigo', label: 'Código', type: 'text', required: true }, { key: 'nombre', label: 'Nombre', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción', type: 'textarea' }, { key: 'status', label: 'Estado', type: 'select', options: ['Activo', 'Pausado', 'Finalizado'], required: true } ] },
    productos: { title: 'Productos', singular: 'Producto', dataKey: COLLECTIONS.PRODUCTOS, columns: [ { key: 'codigo_pieza', label: 'Código de pieza' }, { key: 'codigo_cliente', label: 'Código de cliente' }, { key: 'descripcion', label: 'Descripción' }, { key: 'proceso', label: 'Proceso' }, { key: 'aspecto', label: 'Aspecto' } ], fields: [ { key: 'codigo_pieza', label: 'Código de pieza', type: 'text', required: true }, { key: 'codigo_cliente', label: 'Código de cliente', type: 'text' }, { key: 'descripcion', label: 'Descripción', type: 'textarea', required: true }, { key: 'proceso', label: 'Proceso', type: 'select', searchKey: COLLECTIONS.PROCESOS, required: true }, { key: 'peso', label: 'Peso (gr)', type: 'number' }, { key: 'imagen', label: 'Imágen (URL)', type: 'text' }, { key: 'aspecto', label: 'Aspecto', type: 'select', options: ['Sí', 'No'], required: true } ] },
    semiterminados: { title: 'Semiterminados', singular: 'Semiterminado', dataKey: COLLECTIONS.SEMITERMINADOS, columns: [ { key: 'codigo_pieza', label: 'Código de pieza' }, { key: 'descripcion', label: 'Descripción' }, { key: 'proceso', label: 'Proceso' } ], fields: [ { key: 'codigo_pieza', label: 'Código de pieza', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción', type: 'textarea', required: true }, { key: 'lc_kd', label: 'LC / KD', type: 'select', options: ['LC', 'KD'], required: true }, { key: 'proceso', label: 'Proceso', type: 'select', searchKey: COLLECTIONS.PROCESOS, required: true }, { key: 'aspecto', label: 'Aspecto', type: 'select', options: ['Sí', 'No'], required: true }, { key: 'peso_gr', label: 'Peso (gr)', type: 'number' }, { key: 'tolerancia_gr', label: 'Tolerancia (gr)', type: 'number' }, { key: 'imagen', label: 'Imágen (URL)', type: 'text' } ] },
    insumos: { title: 'Insumos', singular: 'Insumo', dataKey: COLLECTIONS.INSUMOS, columns: [ { key: 'codigo_pieza', label: 'Código de pieza' }, { key: 'descripcion', label: 'Descripción' }, { key: 'proveedor', label: 'Proveedor' }, { key: 'proceso', label: 'Proceso' } ], fields: [ { key: 'codigo_pieza', label: 'Código de pieza', type: 'text', required: true }, { key: 'codigo_proveedor', label: 'Código de proveedor', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción', type: 'textarea', required: true }, { key: 'lc_kd', label: 'LC / KD', type: 'select', options: ['LC', 'KD'], required: true }, { key: 'imagen', label: 'Imágen (URL)', type: 'text' }, { key: 'proveedor', label: 'Proveedor', type: 'select', searchKey: COLLECTIONS.PROVEEDORES, required: true }, { key: 'proceso', label: 'Proceso', type: 'select', searchKey: COLLECTIONS.PROCESOS, required: true }, { key: 'aspecto', label: 'Aspecto', type: 'select', options: ['Sí', 'No'], required: true }, { key: 'unidad_medida', label: 'Unidad de Medida', type: 'select', searchKey: COLLECTIONS.UNIDADES, required: true } ] },
    clientes: { title: 'Clientes', singular: 'Cliente', dataKey: COLLECTIONS.CLIENTES, columns: [ { key: 'id', label: 'Código' }, { key: 'descripcion', label: 'Descripción' } ], fields: [ { key: 'id', label: 'Código', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción', type: 'text', required: true } ] },
    sectores: { title: 'Sectores', singular: 'Sector', dataKey: COLLECTIONS.SECTORES, columns: [ { key: 'id', label: 'Código' }, { key: 'descripcion', label: 'Descripción' } ], fields: [ { key: 'id', label: 'Código', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción', type: 'text', required: true }, { key: 'icon', label: 'Icono (Lucide)', type: 'text', required: true } ] },
    proveedores: { title: 'Proveedores', singular: 'Proveedor', dataKey: COLLECTIONS.PROVEEDORES, columns: [ { key: 'id', label: 'Código' }, { key: 'descripcion', label: 'Razón Social' } ], fields: [ { key: 'id', label: 'Código', type: 'text', required: true }, { key: 'descripcion', label: 'Razón Social', type: 'text', required: true } ] },
    unidades: { title: 'Unidades de Medida', singular: 'Unidad', dataKey: COLLECTIONS.UNIDADES, columns: [ { key: 'id', label: 'Abreviatura' }, { key: 'descripcion', label: 'Descripción' } ], fields: [ { key: 'id', label: 'Abreviatura (ej: Kg, M, Un)', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción (ej: Kilogramos, Metros, Unidades)', type: 'text', required: true } ] },
    procesos: { title: 'Procesos', singular: 'Proceso', dataKey: COLLECTIONS.PROCESOS, columns: [ { key: 'id', label: 'Código' }, { key: 'descripcion', label: 'Descripción' } ], fields: [ { key: 'id', label: 'Código', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción', type: 'text', required: true } ] },
    user_management: { title: 'Gestión de Usuarios', singular: 'Usuario', dataKey: COLLECTIONS.USUARIOS, columns: [ { key: 'name', label: 'Nombre' }, { key: 'email', label: 'Correo' }, { key: 'role', label: 'Rol' }, { key: 'sector', label: 'Sector' } ], fields: [ { key: 'name', label: 'Nombre', type: 'text', readonly: true }, { key: 'email', label: 'Correo', type: 'text', readonly: true }, { key: 'role', label: 'Rol', type: 'select', searchKey: COLLECTIONS.ROLES, required: true }, { key: 'sector', label: 'Sector', type: 'select', searchKey: COLLECTIONS.SECTORES, required: true } ] },
    roles: { title: 'Roles', singular: 'Rol', dataKey: COLLECTIONS.ROLES, columns: [ { key: 'id', label: 'ID' }, { key: 'descripcion', label: 'Descripción' } ], fields: [ { key: 'id', label: 'ID (admin, editor, lector)', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción (Administrador, Editor, Lector)', type: 'text', required: true } ] }
};

/**
 * Global state object for the application.
 * @type {object}
 */
export let appState = {
    currentView: 'dashboard', 
    currentData: [], 
    arbolActivo: null,
    currentUser: null,
    currentViewCleanup: null,
    isAppInitialized: false,
    isTutorialActive: false,
    collections: { [COLLECTIONS.ROLES]: [], [COLLECTIONS.SECTORES]: [], [COLLECTIONS.NOTIFICATIONS]: [], [COLLECTIONS.TAREAS]: [], [COLLECTIONS.USUARIOS]: [] },
    collectionsById: { [COLLECTIONS.ROLES]: new Map(), [COLLECTIONS.SECTORES]: new Map(), [COLLECTIONS.USUARIOS]: new Map() },
    collectionCounts: {},
    unsubscribeListeners: [],
    sinopticoState: null,
    sinopticoTabularState: null,
    pagination: { pageCursors: { 1: null }, currentPage: 1, totalItems: 0 },
    godModeState: null
};

/**
 * Object containing references to key DOM elements.
 * @type {Object<string, HTMLElement>}
 */
export let dom = {
    appView: document.getElementById('app-view'),
    authContainer: document.getElementById('auth-container'),
    loadingOverlay: document.getElementById('loading-overlay'),
    mainContent: document.getElementById('main-content'),
    viewTitle: document.getElementById('view-title'),
    headerActions: document.getElementById('header-actions'),
    searchInput: document.getElementById('search-input'),
    addNewButton: document.getElementById('add-new-button'),
    addButtonText: document.getElementById('add-button-text'),
    modalContainer: document.getElementById('modal-container'),
    toastContainer: document.getElementById('toast-container'),
    viewContent: document.getElementById('view-content'),
    userMenuContainer: document.getElementById('user-menu-container'),
};

/**
 * Object to hold references to Chart.js instances for the dashboard.
 * @type {Object<string, Chart>}
 */
const dashboardCharts = {};

// =================================================================================
// --- 3. LÓGICA DE DATOS (FIRESTORE) ---
// =================================================================================

/**
 * Starts real-time Firestore listeners for essential application data.
 * @returns {Promise<void>} A promise that resolves when initial data is loaded.
 */
async function startRealtimeListeners() {
    if (appState.unsubscribeListeners.length > 0) stopRealtimeListeners();
    const listeners = [];
    const userDocRef = doc(db, COLLECTIONS.USUARIOS, appState.currentUser.uid);
    const userUnsub = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
            appState.currentUser = { ...appState.currentUser, ...doc.data() };
            renderUserMenu();
        }
    });
    listeners.push(userUnsub);
    const notificationsQuery = query(collection(db, COLLECTIONS.NOTIFICATIONS), where('userId', '==', appState.currentUser.uid), orderBy('createdAt', 'desc'), limit(20));
    const notificationsUnsub = onSnapshot(notificationsQuery, (snapshot) => {
        appState.collections.notifications = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        renderNotificationCenter();
    });
    listeners.push(notificationsUnsub);
    try {
        const rolesSnap = await getDocs(collection(db, COLLECTIONS.ROLES));
        appState.collections.roles = rolesSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        appState.collectionsById.roles = new Map(appState.collections.roles.map(r => [r.id, r]));
        const sectoresSnap = await getDocs(collection(db, COLLECTIONS.SECTORES));
        appState.collections.sectores = sectoresSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        appState.collectionsById.sectores = new Map(appState.collections.sectores.map(s => [s.id, s]));
    } catch (error) {
        showToast('Error al cargar datos de configuración inicial.', 'error');
    }
    const tasksQuery = query(collection(db, COLLECTIONS.TAREAS), where('assigneeUid', '==', appState.currentUser.uid), orderBy('createdAt', 'desc'), limit(15));
    const tasksUnsub = onSnapshot(tasksQuery, (snapshot) => {
        const allRecentTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        appState.collections.tareas = allRecentTasks.filter(t => t.status !== 'done').slice(0, 5);
        if (appState.currentView === 'dashboard') renderDashboardTasks(appState.collections.tareas);
    });
    listeners.push(tasksUnsub);
    appState.unsubscribeListeners = listeners;
    appState.isAppInitialized = true;
}

/**
 * Opens a modal for the user to select a predefined avatar.
 */
function openAvatarSelectionModal() {
    const modalId = 'avatar-selection-modal';
    const avatarsHTML = PREDEFINED_AVATARS.map(avatarUrl => `<button data-avatar-url="${avatarUrl}" class="rounded-full overflow-hidden border-2 border-transparent hover:border-blue-500 focus:border-blue-500 w-24 h-24"><img src="${avatarUrl}" alt="Avatar" class="w-full h-full object-cover"></button>`).join('');
    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop"><div class="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">Seleccionar un Avatar</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><div class="p-6"><div class="grid grid-cols-3 sm:grid-cols-6 gap-4">${avatarsHTML}</div></div><div class="flex justify-end items-center p-4 border-t bg-gray-50"><button data-action="close" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button></div></div></div>`;
    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);
    modalElement.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;
        const { action, avatarUrl } = button.dataset;
        if (action === 'close') {
            modalElement.remove();
        } else if (avatarUrl) {
            try {
                await updateProfile(auth.currentUser, { photoURL: avatarUrl });
                await updateDoc(doc(db, COLLECTIONS.USUARIOS, auth.currentUser.uid), { photoURL: avatarUrl });
                appState.currentUser.avatarUrl = avatarUrl;
                showToast('Avatar actualizado con éxito.', 'success');
                renderUserMenu();
                runProfileLogic();
                modalElement.remove();
            } catch (error) {
                showToast("Error al actualizar el avatar.", "error");
            }
        }
    });
}

/**
 * Stops all active Firestore listeners.
 */
function stopRealtimeListeners() {
    appState.unsubscribeListeners.forEach(unsubscribe => unsubscribe());
    appState.unsubscribeListeners = [];
}

/**
 * Saves or updates a document in a specified Firestore collection.
 * @param {string} collectionName - The name of the collection.
 * @param {Object} data - The data to save.
 * @param {string|null} [docId=null] - The ID of the document to update.
 * @returns {Promise<boolean>} True on success, false on failure.
 */
async function saveDocument(collectionName, data, docId = null) {
    const toastId = showToast('Guardando...', 'loading', { duration: 0 });
    try {
        if (docId) {
            await updateDoc(doc(db, collectionName, docId), data);
            showToast('Registro actualizado con éxito.', 'success', { toastId });
        } else {
            const uniqueKeyField = getUniqueKeyForCollection(collectionName);
            const uniqueKeyValue = data[uniqueKeyField];
            if (!uniqueKeyValue) throw new Error(`El campo '${uniqueKeyField}' es obligatorio.`);
            data.id = uniqueKeyValue;
            const docRef = doc(db, collectionName, uniqueKeyValue);
            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (docSnap.exists()) throw new Error(`El valor "${uniqueKeyValue}" para "${uniqueKeyField}" ya existe.`);
                transaction.set(docRef, data);
            });
            showToast('Registro creado con éxito.', 'success', { toastId });
        }
        return true;
    } catch (error) {
        showToast(error.message || "Error al guardar el registro.", 'error', { toastId });
        return false;
    }
}

/**
 * Fetches the application logo and converts it to a Base64 string.
 * @returns {Promise<string|null>} The Base64 string of the logo, or null on error.
 */
async function getLogoBase64() {
    try {
        const response = await fetch('barack_logo.png');
        if (!response.ok) return null;
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return null;
    }
}

/**
 * Deletes a document from a specified Firestore collection.
 * @param {string} collectionName - The name of the collection.
 * @param {string} docId - The ID of the document to delete.
 */
async function deleteDocument(collectionName, docId) {
    const toastId = showToast('Eliminando...', 'loading', { duration: 0 });
    try {
        await deleteDoc(doc(db, collectionName, docId));
        showToast('Elemento eliminado.', 'success', { toastId });
        if (viewConfig[appState.currentView]?.dataKey === collectionName) runTableLogic();
    } catch (error) {
        showToast('Error al eliminar el elemento.', 'error', { toastId });
    }
}

/**
 * Handles the deletion of an item from a table view, with specific logic for different collections.
 * @param {string} docId - The document ID of the item to delete.
 */
function deleteItem(docId) {
    const config = viewConfig[appState.currentView];
    if (!config || !config.dataKey) return;
    if (config.dataKey !== COLLECTIONS.USUARIOS && config.dataKey !== COLLECTIONS.PRODUCTOS && !appState.currentUser.isSuperAdmin) {
        return showToast('Solo un Super Administrador puede eliminar este tipo de registro.', 'error');
    }
    if (config.dataKey === COLLECTIONS.USUARIOS) {
        const itemToDelete = appState.currentData.find(d => d.docId === docId);
        if (itemToDelete?.docId === auth.currentUser.uid) return showToast('No puedes deshabilitar tu propia cuenta.', 'error');
        const itemName = itemToDelete?.name || itemToDelete?.email || 'este usuario';
        return showConfirmationModal(`Deshabilitar Usuario`, `¿Seguro que deseas deshabilitar a "${itemName}"?`, async () => {
            try {
                await updateDoc(doc(db, COLLECTIONS.USUARIOS, docId), { disabled: true });
                showToast('Usuario deshabilitado.', 'success');
                runTableLogic();
            } catch (error) {
                showToast('Error al deshabilitar el usuario.', 'error');
            }
        });
    }
    if (config.dataKey === COLLECTIONS.PRODUCTOS) {
        const itemToDelete = appState.currentData.find(d => d.docId === docId);
        const itemName = itemToDelete?.descripcion || itemToDelete?.id || 'este producto';
        return showConfirmationModal(`Eliminar Producto y Huérfanos`, `¿Seguro que deseas eliminar "${itemName}"?`, () => {
            deleteProductAndOrphanedSubProducts(docId, db, { doc, getDoc, getDocs, deleteDoc, collection, query, where }, COLLECTIONS, { showToast, runTableLogic });
        });
    }
    const itemToDelete = appState.currentData.find(d => d.docId === docId);
    const itemName = itemToDelete?.descripcion || itemToDelete?.id || 'este elemento';
    showConfirmationModal(`Eliminar ${config.singular}`, `¿Seguro que deseas eliminar "${itemName}"?`, () => deleteDocument(config.dataKey, docId));
}

/**
 * Clears all data collections except for essential ones like users and tasks.
 * @returns {Promise<void>}
 */
async function clearDataOnly() {
    showToast('Limpiando colecciones de datos...', 'info');
    const collectionsToSkip = [COLLECTIONS.USUARIOS, COLLECTIONS.TAREAS, COLLECTIONS.COVER_MASTER, 'notifications'];
    for (const name of Object.values(COLLECTIONS)) {
        if (collectionsToSkip.includes(name)) continue;
        try {
            const snapshot = await getDocs(collection(db, name));
            if (snapshot.empty) continue;
            const batch = writeBatch(db);
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        } catch (error) {
            showToast(`Error al limpiar la colección ${name}.`, 'error');
        }
    }
    showToast('Limpieza de datos completada.', 'success');
}

/**
 * Deletes all user documents except for the main administrator.
 * @returns {Promise<void>}
 */
async function clearOtherUsers() {
    showToast('Eliminando otros usuarios...', 'info');
    const adminUID = 'HyM0eC3pujQtg8EgTXMu3h6AmMw2';
    try {
        const snapshot = await getDocs(collection(db, COLLECTIONS.USUARIOS));
        if (snapshot.empty) return showToast('No hay otros usuarios para eliminar.', 'info');
        const batch = writeBatch(db);
        let deletedCount = 0;
        snapshot.docs.forEach(doc => { if (doc.id !== adminUID) { batch.delete(doc.ref); deletedCount++; } });
        if (deletedCount > 0) {
            await batch.commit();
            showToast(`${deletedCount} usuario(s) eliminados.`, 'success');
        } else {
            showToast('No se encontraron otros usuarios para eliminar.', 'info');
        }
    } catch (error) {
        showToast('Error al eliminar los otros usuarios.', 'error');
    }
}

/**
 * Seeds a batch with detailed sample ECO documents.
 * @param {WriteBatch} batch - The Firestore write batch.
 * @param {Array<Object>} users - Array of user objects.
 * @param {Object} generatedData - Object with other generated test data.
 */
async function seedEcos(batch, users, generatedData) { /* Implementation omitted for brevity */ }

/**
 * Seeds a batch with detailed sample ECR documents.
 * @param {WriteBatch} batch - The Firestore write batch.
 * @param {Array<Object>} users - Array of user objects.
 * @param {Object} generatedData - Object with other generated test data.
 */
async function seedEcrs(batch, users, generatedData) { /* Implementation omitted for brevity */ }

/**
 * Seeds a batch with sample ECR meeting attendance records.
 * @param {WriteBatch} batch - The Firestore write batch.
 */
async function seedReunionesEcr(batch) { /* Implementation omitted for brevity */ }

/**
 * Clears and seeds the entire database with a rich set of test data.
 * @returns {Promise<void>}
 */
async function seedDatabase() { /* Implementation omitted for brevity */ }

// ... other functions ...

/**
 * Main authentication state change listener.
 */
onAuthStateChanged(auth, async (user) => {
    // ... implementation ...
});
