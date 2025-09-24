// --- 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE ---
// =================================================================================
// Importar funciones de los SDKs de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch, runTransaction, orderBy, limit, startAfter, or, getCountFromServer } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-storage.js";
import { initSharedUI, showToast, showConfirmationModal, showInfoModal, showDatePromptModal, showPromptModal, updateNavForRole, renderUserMenu, renderNotificationCenter } from './modules/shared/ui.js';
import { initFirestoreHelpers, saveDocument, deleteDocument } from './modules/shared/firestore-helpers.js';
import { COLLECTIONS, getUniqueKeyForCollection, createHelpTooltip, shouldRequirePpapConfirmation, validateField, saveEcrDraftToFirestore, loadEcrDraftFromFirestore, deleteEcrDraftFromFirestore, flattenEstructura, prepareDataForPdfAutoTable, generateProductStructureReportHTML, getLogoBase64, formatTimeAgo, eventBus } from './utils.js';
import { initAuthModule, showAuthScreen, logOutUser } from './auth.js';
import {
    initTasksModule,
    runTasksLogic as runTasksLogicFromModule,
    calculateOverdueTasksCount,
    fetchAllTasks,
    renderMyPendingTasksWidget,
    renderTasksByProjectChart,
    renderTaskDashboardView
} from './modules/tasks/tasks.js';
import { initLandingPageModule, runLandingPageLogic } from './modules/landing_page.js';
import { checkUserPermission } from './permissions.js';
import { registerEcrApproval, getEcrFormData, checkAndUpdateEcrStatus } from './modules/ecr/ecr-logic.js';
import { deleteProductAndOrphanedSubProducts, cloneProduct, regenerateNodeIds, getFlattenedData, handleDropEvent, handleProductSelect } from './modules/products/product-logic.js';
import { renderEcoListView, renderEcoFormView } from './modules/eco/eco-ui.js';
import * as ecoLogic from './modules/eco/eco-logic.js';
import { initEcoEventListeners } from './modules/eco/eco-events.js';
import { handleEcoView } from './modules/eco/eco.js';
import { ensureCollectionsAreLoaded } from './utils.js';
import { handleControlPanelView } from './modules/control_panel/control-panel.js';
import { handleEcrView } from './modules/ecr/ecr.js';
import tutorial from './tutorial.js';
import newControlPanelTutorial from './new-control-panel-tutorial.js';
import { runVisor3dLogic } from './modulos/visor3d/js/visor3d.js';
import { initAdminModule, seedDatabase, clearDataOnly, clearOtherUsers, handleGodModeRoleChange } from './modules/admin/admin.js';

// NOTA DE SEGURIDAD: La configuración de Firebase no debe estar hardcodeada en el código fuente.
// En un entorno de producción, estos valores deben cargarse de forma segura,
// por ejemplo, desde variables de entorno o un servicio de configuración remota.

// IMPORTANTE: La siguiente configuración de Firebase está hardcodeada.
// Debido a una incompatibilidad entre el sistema de módulos ES de la aplicación
// y el script de inicialización de Firebase Hosting, este método es
// actualmente el único que permite que la aplicación se conecte a Firebase.
// NO REEMPLAZAR con la inicialización automática de Firebase Hosting sin
// refactorizar la carga de módulos en toda la aplicación.
const firebaseConfig = {
  apiKey: "AIzaSyAUQxlBCiYoR4-tlGL-S3xR8LXrrMkx1Tk",
  authDomain: "barackingenieria-e763c.firebaseapp.com",
  projectId: "barackingenieria-e763c",
  storageBucket: "barackingenieria-e763c.firebasestorage.app",
  messagingSenderId: "44704892099",
  appId: "1:44704892099:web:738c8cbc3cea65808a8e76",
  measurementId: "G-ZHZ3R9XXDM"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const functions = getFunctions(app);
const storage = getStorage(app);

// =================================================================================
// --- CONSTANTES Y CONFIGURACIÓN ---
// =================================================================================
const LOCK_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutos en milisegundos
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

// --- Configuración de Vistas ---
const viewConfig = {
    visor3d: { title: 'Visor 3D', singular: 'Visor 3D' },
    'landing-page': { title: 'Página Principal', singular: 'Página Principal' },
    sinoptico_tabular: { title: 'Lista de Materiales (Tabular)', singular: 'Lista de Materiales (Tabular)' },
    eco_form: { title: 'ECO de Producto / Proceso', singular: 'Formulario ECO' },
    eco: { title: 'Gestión de ECO', singular: 'ECO' },
    ecr: { title: 'Gestión de ECR', singular: 'ECR' },
    ecr_creation_hub: { title: 'Crear Nuevo ECR', singular: 'ECR' },
    ecr_form: {
        title: 'ECR de Producto / Proceso',
        singular: 'Formulario ECR',
        dataKey: COLLECTIONS.ECR_FORMS,
        // The 'fields' array will be populated in a later step.
        // For now, this structure makes it consistent with other views.
        fields: []
    },
    control_ecrs: { title: 'Panel de Control', singular: 'Control ECR' },
    seguimiento_ecr_eco: { title: 'Seguimiento ECR/ECO', singular: 'Ficha de Seguimiento' },
    ecr_seguimiento: { title: 'Seguimiento y Métricas de ECR', singular: 'Seguimiento ECR' },
    ecr_table_view: { title: 'Tabla de Control ECR', singular: 'Control ECR' },
    indicadores_ecm_view: { title: 'Indicadores ECM', singular: 'Indicador' },
    eco_form_mock_for_tutorial: { title: 'Plan de Acción (Ejemplo)', singular: 'Plan de Acción' },
    flujograma: { title: 'Flujograma de Procesos', singular: 'Flujograma' },
    arboles: { title: 'Editor de Estructura de Producto', singular: 'Árbol' },
    profile: { title: 'Mi Perfil', singular: 'Mi Perfil' },
    tareas: { title: 'Gestor de Tareas', singular: 'Tarea' },
    'task-dashboard': { title: 'Dashboard de Tareas', singular: 'Dashboard de Tareas' },
    proyectos: {
        title: 'Proyectos',
        singular: 'Proyecto',
        dataKey: COLLECTIONS.PROYECTOS,
        columns: [
            { key: 'codigo', label: 'Código' },
            { key: 'nombre', label: 'Nombre' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'status', label: 'Estado' }
        ],
        fields: [
            { key: 'codigo', label: 'Código', type: 'text', required: true },
            { key: 'nombre', label: 'Nombre', type: 'text', required: true },
            { key: 'descripcion', label: 'Descripción', type: 'textarea' },
            { key: 'status', label: 'Estado', type: 'select', options: ['Activo', 'Pausado', 'Finalizado'], required: true },
        ]
    },
    productos: {
        title: 'Productos',
        singular: 'Producto',
        dataKey: COLLECTIONS.PRODUCTOS,
        columns: [
            { key: 'codigo_pieza', label: 'Código de pieza' },
            { key: 'codigo_cliente', label: 'Código de cliente' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'proceso', label: 'Proceso' },
            { key: 'aspecto', label: 'Aspecto' },
        ],
        fields: [
            { key: 'codigo_pieza', label: 'Código de pieza', type: 'text', required: true },
            { key: 'codigo_cliente', label: 'Código de cliente', type: 'text' },
            { key: 'descripcion', label: 'Descripción', type: 'textarea', required: true },
            { key: 'proceso', label: 'Proceso', type: 'select', searchKey: COLLECTIONS.PROCESOS, required: true },
            { key: 'peso', label: 'Peso (gr)', type: 'number' },
            { key: 'imagen', label: 'Imagen (URL)', type: 'text' },
            { key: 'aspecto', label: 'Aspecto', type: 'select', options: ['Sí', 'No'], required: true },
        ]
    },
    semiterminados: {
        title: 'Semiterminados',
        singular: 'Semiterminado',
        dataKey: COLLECTIONS.SEMITERMINADOS,
        columns: [
            { key: 'codigo_pieza', label: 'Código de pieza' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'proceso', label: 'Proceso' },
        ],
        fields: [
            { key: 'codigo_pieza', label: 'Código de pieza', type: 'text', required: true },
            { key: 'descripcion', label: 'Descripción', type: 'textarea', required: true },
            { key: 'lc_kd', label: 'LC / KD', type: 'select', options: ['LC', 'KD'], required: true },
            { key: 'proceso', label: 'Proceso', type: 'select', searchKey: COLLECTIONS.PROCESOS, required: true },
            { key: 'aspecto', label: 'Aspecto', type: 'select', options: ['Sí', 'No'], required: true },
            { key: 'peso_gr', label: 'Peso (gr)', type: 'number' },
            { key: 'tolerancia_gr', label: 'Tolerancia (gr)', type: 'number' },
            { key: 'imagen', label: 'Imagen (URL)', type: 'text' },
        ]
    },
    insumos: {
        title: 'Insumos',
        singular: 'Insumo',
        dataKey: COLLECTIONS.INSUMOS,
        columns: [
            { key: 'codigo_pieza', label: 'Código de pieza' },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'proveedor', label: 'Proveedor' },
            { key: 'proceso', label: 'Proceso' },
        ],
        fields: [
            { key: 'codigo_pieza', label: 'Código de pieza', type: 'text', required: true },
            { key: 'codigo_proveedor', label: 'Código de proveedor', type: 'text', required: true },
            { key: 'descripcion', label: 'Descripción', type: 'textarea', required: true },
            { key: 'lc_kd', label: 'LC / KD', type: 'select', options: ['LC', 'KD'], required: true },
            { key: 'imagen', label: 'Imagen (URL)', type: 'text' },
            { key: 'proveedor', label: 'Proveedor', type: 'select', searchKey: COLLECTIONS.PROVEEDORES, required: true },
            { key: 'proceso', label: 'Proceso', type: 'select', searchKey: COLLECTIONS.PROCESOS, required: true },
            { key: 'aspecto', label: 'Aspecto', type: 'select', options: ['Sí', 'No'], required: true },
            { key: 'unidad_medida', label: 'Unidad de Medida', type: 'select', searchKey: COLLECTIONS.UNIDADES, required: true },
        ]
    },
    clientes: { title: 'Clientes', singular: 'Cliente', dataKey: COLLECTIONS.CLIENTES, columns: [ { key: 'id', label: 'Código' }, { key: 'descripcion', label: 'Descripción' } ], fields: [ { key: 'id', label: 'Código', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción', type: 'text', required: true } ] },
    sectores: { title: 'Sectores', singular: 'Sector', dataKey: COLLECTIONS.SECTORES, columns: [ { key: 'id', label: 'Código' }, { key: 'descripcion', label: 'Descripción' } ], fields: [ { key: 'id', label: 'Código', type: 'text', required: true }, { key: 'descripcion', label: 'Descripción', type: 'text', required: true }, { key: 'icon', label: 'Icono (Lucide)', type: 'text', required: true } ] },
    proveedores: { 
        title: 'Proveedores', 
        singular: 'Proveedor', 
        dataKey: COLLECTIONS.PROVEEDORES, 
        columns: [ { key: 'id', label: 'Código' }, { key: 'descripcion', label: 'Razón Social' } ], 
        fields: [ 
            { key: 'id', label: 'Código', type: 'text', required: true }, 
            { key: 'descripcion', label: 'Razón Social', type: 'text', required: true } 
        ] 
    },
    unidades: {
        title: 'Unidades de Medida',
        singular: 'Unidad',
        dataKey: COLLECTIONS.UNIDADES,
        columns: [ { key: 'id', label: 'Abreviatura' }, { key: 'descripcion', label: 'Descripción' } ],
        fields: [
            { key: 'id', label: 'Abreviatura (ej: Kg, M, Un)', type: 'text', required: true },
            { key: 'descripcion', label: 'Descripción (ej: Kilogramos, Metros, Unidades)', type: 'text', required: true }
        ]
    },
    procesos: { 
        title: 'Procesos', 
        singular: 'Proceso', 
        dataKey: COLLECTIONS.PROCESOS, 
        columns: [ 
            { key: 'id', label: 'Código' }, 
            { key: 'descripcion', label: 'Descripción' } 
        ],
        fields: [ 
            { key: 'id', label: 'Código', type: 'text', required: true }, 
            { key: 'descripcion', label: 'Descripción', type: 'text', required: true } 
        ]
    },
    user_management: {
        title: 'Gestión de Usuarios',
        singular: 'Usuario',
        dataKey: COLLECTIONS.USUARIOS,
        columns: [
            { key: 'name', label: 'Nombre' },
            { key: 'email', label: 'Correo' },
            { key: 'role', label: 'Rol' },
            { key: 'sector', label: 'Sector' }
        ],
        fields: [
            { key: 'name', label: 'Nombre', type: 'text', readonly: true },
            { key: 'email', label: 'Correo', type: 'text', readonly: true },
            { key: 'role', label: 'Rol', type: 'select', searchKey: COLLECTIONS.ROLES, required: true },
            {
                key: 'sector',
                label: 'Sector',
                type: 'select',
                searchKey: COLLECTIONS.SECTORES, // Use searchKey to indicate where to get options
                required: true
            }
        ]
    },
    roles: {
        title: 'Roles',
        singular: 'Rol',
        dataKey: COLLECTIONS.ROLES,
        columns: [ { key: 'id', label: 'ID' }, { key: 'descripcion', label: 'Descripción' } ],
        fields: [
            { key: 'id', label: 'ID (admin, editor, lector)', type: 'text', required: true },
            { key: 'descripcion', label: 'Descripción (Administrador, Editor, Lector)', type: 'text', required: true }
        ]
    }
};

// --- Estado Global de la Aplicación ---
export let appState = {
    currentView: 'landing-page',
    currentData: [], 
    arbolActivo: null,
    currentUser: null,
    currentViewCleanup: null,
    isAppInitialized: false,
    isTutorialActive: false,
    collections: {
        // Most collections are now loaded on demand.
        // Only keep collections that are small, essential, and used globally.
        [COLLECTIONS.ROLES]: [],
        [COLLECTIONS.SECTORES]: [],
        [COLLECTIONS.NOTIFICATIONS]: [],
        [COLLECTIONS.TAREAS]: [], // For dashboard view
        [COLLECTIONS.USUARIOS]: [] // Still needed for some seeding functions
    },
    collectionsById: {
        // This will be populated on-demand or for the small collections above.
        [COLLECTIONS.ROLES]: new Map(),
        [COLLECTIONS.SECTORES]: new Map(),
        [COLLECTIONS.USUARIOS]: new Map(),
    },
    collectionCounts: {}, // New property to store KPI counts
    unsubscribeListeners: [],
    sinopticoState: null,
    sinopticoTabularState: null,
    pagination: {
        pageCursors: { 1: null }, // Store the startAfter cursor for each page
        currentPage: 1,
        totalItems: 0,
    },
    godModeState: null
};

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

const dashboardCharts = {};

// =================================================================================
// --- 3. LÓGICA DE DATOS (FIRESTORE) ---
// =================================================================================

async function startRealtimeListeners() {
    if (appState.unsubscribeListeners.length > 0) {
        stopRealtimeListeners();
    }

    const listeners = [];

    // --- Listener for the current user's profile data ---
    const userDocRef = doc(db, COLLECTIONS.USUARIOS, appState.currentUser.uid);
    const userUnsub = onSnapshot(userDocRef, (doc) => {
        if (doc.exists()) {
            const userData = doc.data();
            appState.currentUser = { ...appState.currentUser, ...userData };
            console.log("User profile updated in real-time.");
            // Re-render components that depend on user data if needed
            renderUserMenu();
        }
    }, (error) => console.error("Error listening to user profile:", error));
    listeners.push(userUnsub);

    // --- Listener for user notifications ---
    const notificationsQuery = query(
        collection(db, COLLECTIONS.NOTIFICATIONS),
        where('userId', '==', appState.currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(20)
    );
    const notificationsUnsub = onSnapshot(notificationsQuery, (snapshot) => {
        appState.collections.notifications = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        renderNotificationCenter();
    }, (error) => console.error("Error listening to notifications:", error));
    listeners.push(notificationsUnsub);

    // --- One-time fetches for small, critical collections (Roles & Sectors) ---
    // These are small and used in many places, so loading them once is efficient.
    try {
        const rolesPromise = getDocs(collection(db, COLLECTIONS.ROLES));
        const sectoresPromise = getDocs(collection(db, COLLECTIONS.SECTORES));
        const usersPromise = getDocs(collection(db, COLLECTIONS.USUARIOS));

        const [rolesSnap, sectoresSnap, usersSnap] = await Promise.all([rolesPromise, sectoresPromise, usersPromise]);

        appState.collections.roles = rolesSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        appState.collectionsById.roles = new Map(appState.collections.roles.map(r => [r.id, r]));

        appState.collections.sectores = sectoresSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        appState.collectionsById.sectores = new Map(appState.collections.sectores.map(s => [s.id, s]));

        // Fetch all users for task assignments and dashboard charts
        appState.collections.usuarios = usersSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        appState.collectionsById.usuarios = new Map(appState.collections.usuarios.map(u => [u.docId, u]));

        console.log("Roles, Sectors, and Users loaded successfully.");
    } catch (error) {
        console.error("Error fetching initial roles/sectors/users:", error);
        showToast('Error al cargar datos de configuración inicial.', 'error');
    }

    // The kpi_counts listener has been removed for efficiency.
    // KPIs are now calculated on demand in runDashboardLogic.

    // --- Listener for user's most recent tasks for the dashboard ---
    // FIX: The query with '!=' and 'orderBy' on different fields requires a composite index.
    // To avoid this, we fetch recent tasks and filter on the client.
    const tasksQuery = query(
        collection(db, COLLECTIONS.TAREAS),
        where('assigneeUid', '==', appState.currentUser.uid),
        orderBy('createdAt', 'desc'),
        limit(15) // Fetch a few more to allow for client-side filtering.
    );
    const tasksUnsub = onSnapshot(tasksQuery, (snapshot) => {
        const allRecentTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
        // Filter out completed tasks on the client and take the 5 most recent.
        appState.collections.tareas = allRecentTasks.filter(t => t.status !== 'done').slice(0, 5);

        if (appState.currentView === 'dashboard') {
            // The main dashboard logic already renders the chart once.
            // This listener will just update the task list for now.
            renderMyPendingTasksWidget(appState.collections.tareas);
        }
    }, (error) => console.error("Error listening to user tasks:", error));
    listeners.push(tasksUnsub);


    appState.unsubscribeListeners = listeners;
    appState.isAppInitialized = true;
    console.log("Optimized real-time listeners started.");

    return Promise.resolve();
}

function openAvatarSelectionModal() {
    const modalId = 'avatar-selection-modal';
    let avatarsHTML = '';
    PREDEFINED_AVATARS.forEach(avatarUrl => {
        avatarsHTML += `
            <button data-avatar-url="${avatarUrl}" class="rounded-full overflow-hidden border-2 border-transparent hover:border-blue-500 focus:border-blue-500 transition-all duration-200 w-24 h-24">
                <img src="${avatarUrl}" alt="Avatar" class="w-full h-full object-cover">
            </button>
        `;
    });

    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 modal-content">
                <div class="flex justify-between items-center p-5 border-b">
                    <h3 class="text-xl font-bold">Seleccionar un Avatar</h3>
                    <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-6">
                    <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
                        ${avatarsHTML}
                    </div>
                </div>
                 <div class="flex justify-end items-center p-4 border-t bg-gray-50">
                    <button data-action="close" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);
    modalElement.addEventListener('click', async (e) => {
        const button = e.target.closest('button');
        if (!button) return;

        const action = button.dataset.action;
        const avatarUrl = button.dataset.avatarUrl;

        if (action === 'close') {
            modalElement.remove();
        } else if (avatarUrl) {
            // This is a simplified version of handleProfileUpdate
            const user = auth.currentUser;
            const userDocRef = doc(db, COLLECTIONS.USUARIOS, user.uid);
            try {
                await updateProfile(user, { photoURL: avatarUrl });
                await updateDoc(userDocRef, { photoURL: avatarUrl });
                appState.currentUser.avatarUrl = avatarUrl;
                showToast('Avatar actualizado con éxito.', 'success');
                renderUserMenu();
                runProfileLogic();
                modalElement.remove();
            } catch (error) {
                console.error("Error updating avatar:", error);
                showToast("Error al actualizar el avatar.", "error");
            }
        }
    });
}

function stopRealtimeListeners() {
    appState.unsubscribeListeners.forEach(unsubscribe => unsubscribe());
    appState.unsubscribeListeners = [];
    console.log("All Firestore listeners stopped.");
}

// Functions moved to public/modules/shared/firestore-helpers.js


function deleteItem(docId) {
    const config = viewConfig[appState.currentView];
    if (!config || !config.dataKey) return;

    // For most items, only a super admin can delete.
    // We make exceptions for specific cases below.
    if (config.dataKey !== COLLECTIONS.USUARIOS && config.dataKey !== COLLECTIONS.PRODUCTOS) {
        if (!appState.currentUser.isSuperAdmin) {
            showToast('Solo un Super Administrador puede eliminar este tipo de registro.', 'error');
            return;
        }
    }

    if (config.dataKey === COLLECTIONS.USUARIOS) {
        const itemToDelete = appState.currentData.find(d => d.docId === docId);
        if (itemToDelete?.docId === auth.currentUser.uid) {
            showToast('No puedes deshabilitar tu propia cuenta desde aquí.', 'error');
            return;
        }
        const itemName = itemToDelete ? (itemToDelete.name || itemToDelete.email) : 'este usuario';
        showConfirmationModal(
            `Deshabilitar Usuario`,
            `¿Estás seguro de que deseas deshabilitar a "${itemName}"? El usuario ya no podrá iniciar sesión.`,
            async () => {
                try {
                    const userDocRef = doc(db, COLLECTIONS.USUARIOS, docId);
                    await updateDoc(userDocRef, { disabled: true });
                    showToast('Usuario deshabilitado con éxito.', 'success');
                    runTableLogic(); // Refresh the table
                } catch (error) {
                    console.error("Error disabling user: ", error);
                    showToast('Error al deshabilitar el usuario.', 'error');
                }
            }
        );
        return;
    }

    if (config.dataKey === COLLECTIONS.PRODUCTOS) {
        const itemToDelete = appState.currentData.find(d => d.docId === docId);
        const itemName = itemToDelete ? (itemToDelete.descripcion || itemToDelete.id) : 'este producto';
        showConfirmationModal(
            `Eliminar Producto y Huérfanos`,
            `¿Estás seguro de que deseas eliminar "${itemName}"? Esto también intentará eliminar los sub-componentes que no estén en uso por otros productos.`,
            () => {
                const firestore = { doc, getDoc, getDocs, deleteDoc, collection, query, where };
                const uiCallbacks = { showToast, runTableLogic };
                deleteProductAndOrphanedSubProducts(docId, db, firestore, COLLECTIONS, uiCallbacks);
            }
        );
        return;
    }

    const itemToDelete = appState.currentData.find(d => d.docId === docId);
    const itemName = itemToDelete ? (itemToDelete.descripcion || itemToDelete.id) : 'este elemento';
    showConfirmationModal(
        `Eliminar ${config.singular}`,
        `¿Estás seguro de que deseas eliminar "${itemName}"? Esta acción no se puede deshacer.`,
        () => {
            deleteDocument(config.dataKey, docId);
        }
    );
}

// Functions moved to public/modules/admin/admin.js

// =================================================================================
// --- 4. LÓGICA PRINCIPAL DE LA APLICACIÓN (CORE) ---
// =================================================================================

/**
 * Creates a sample ECR with 'approved' status for the interactive tutorial.
 * This ensures the tutorial can always proceed to the ECO generation step.
 * It uses a fixed ID to be idempotent.
 * @returns {Promise<string|null>} The ID of the created/verified ECR, or null on error.
 */
async function createTutorialEcr() {
    const ecrId = 'TUTORIAL-ECR-001';
    const ecrRef = doc(db, COLLECTIONS.ECR_FORMS, ecrId);

    // Always overwrite the tutorial ECR to ensure it's fresh and correct.
    // This prevents issues with stale data from previous tutorial runs.
    showToast('Preparando ECR de demostración para el tutorial...', 'info');

    const tutorialEcrData = {
        id: ecrId,
        ecr_no: ecrId,
        status: 'approved', // CRITICAL for the tutorial to work
        lastModified: new Date(),
        modifiedBy: 'tutorial_system@barack.com',
        origen_interno: true,
        proyecto: 'Proyecto Tutorial Interactivo',
        cliente: 'Cliente de Demostración',
        fecha_emision: new Date().toISOString().split('T')[0],
        codigo_barack: 'PROD-TUTORIAL',
        denominacion_producto: 'Componente de Tutorial',
        situacion_propuesta: 'Esta es la situación propuesta para el ECR del tutorial, que permite la generación de un ECO.',
        // This field is checked by the ECO form logic
        cliente_requiere_ppap: true,
        cliente_aprobacion_estado: 'aprobado',
        // Add a basic approvals structure so it looks realistic
        approvals: {
            ing_producto: { status: 'approved', user: 'Sistema', date: new Date().toISOString().split('T')[0], comment: 'Aprobado para tutorial' },
            calidad: { status: 'approved', user: 'Sistema', date: new Date().toISOString().split('T')[0], comment: 'Aprobado para tutorial' }
        }
    };

    try {
        await setDoc(ecrRef, tutorialEcrData);
        console.log(`Successfully created or updated tutorial ECR: ${ecrId}`);
        return tutorialEcrData; // Return the full object
    } catch (error) {
        console.error("Error creating tutorial ECR:", error);
        showToast('Error al preparar el ECR del tutorial.', 'error');
        return null;
    }
}

/**
 * Seeds the database with the minimum required data for the Control Panel tutorial to function correctly.
 * This function is idempotent and will not create duplicate data.
 * @returns {Promise<void>}
 */
async function seedControlPanelTutorialData() {
    const ecrId = 'TUTORIAL-ECR-001';
    const ecoId = 'TUTORIAL-ECO-001';
    const reunionId = `reunion_${new Date().toISOString().split('T')[0]}`;

    const ecrRef = doc(db, COLLECTIONS.ECR_FORMS, ecrId);
    const ecoRef = doc(db, COLLECTIONS.ECO_FORMS, ecoId);
    const reunionRef = doc(db, COLLECTIONS.REUNIONES_ECR, reunionId);

    const [ecrSnap, ecoSnap, reunionSnap] = await Promise.all([
        getDoc(ecrRef),
        getDoc(ecoRef),
        getDoc(reunionRef)
    ]);

    if (ecrSnap.exists() && ecoSnap.exists() && reunionSnap.exists()) {
        console.log('Control Panel tutorial data already seeded.');
        return; // All data exists, no need to seed.
    }

    showToast('Preparando datos de demostración para el tutorial del panel de control...', 'info');
    const batch = writeBatch(db);

    // Seed ECR if it doesn't exist
    if (!ecrSnap.exists()) {
        const tutorialEcrData = {
            id: ecrId,
            ecr_no: ecrId,
            status: 'approved',
            lastModified: new Date(),
            modifiedBy: 'tutorial_system@barack.com',
            fecha_emision: new Date().toISOString().split('T')[0],
            denominacion_producto: 'Componente de Tutorial de Panel de Control',
            approvals: {
                ing_producto: { status: 'approved', user: 'Sistema' },
                calidad: { status: 'pending', user: null },
            }
        };
        batch.set(ecrRef, tutorialEcrData);
    }

    // Seed ECO if it doesn't exist
    if (!ecoSnap.exists()) {
        const tutorialEcoData = {
            id: ecoId,
            status: 'in-progress',
            lastModified: new Date(),
            modifiedBy: 'tutorial_system@barack.com',
        };
        batch.set(ecoRef, tutorialEcoData);
    }

    // Seed Reunion if it doesn't exist for today
    if (!reunionSnap.exists()) {
        const tutorialReunionData = {
            id: reunionId,
            fecha: new Date().toISOString().split('T')[0],
            asistencia: {
                ing_manufatura: 'P',
                calidad: 'A',
                compras: 'P',
            }
        };
        batch.set(reunionRef, tutorialReunionData);
    }

    try {
        await batch.commit();
        console.log('Successfully seeded data for Control Panel tutorial.');
    } catch (error) {
        console.error('Error seeding control panel tutorial data:', error);
        showToast('Error al preparar los datos del tutorial.', 'error');
    }
}


function initializeAppListeners() {
    // Centralized navigation handler
    eventBus.on('navigate', ({ view, params }) => {
        switchView(view, params);
    });

    setupGlobalEventListeners();
}

function setupGlobalEventListeners() {
    dom.searchInput.addEventListener('input', handleSearch);
    dom.addNewButton.addEventListener('click', () => openFormModal());

    const onTutorialEnd = () => {
        appState.isTutorialActive = false;
        console.log("Tutorial finished, global clicks re-enabled.");
    };

    const startTutorial = () => {
        appState.isTutorialActive = true;
        const app = {
            switchView: (view, params) => eventBus.emit('navigate', { view, params }),
            showToast,
            openFormModal,
            appState,
            db,
            onTutorialEnd,
            createTutorialEcr // Expose the new helper function to the tutorial
        };
        tutorial(app).start();
    };

    document.getElementById('start-tutorial-btn')?.addEventListener('click', startTutorial);

    // Check if the page was loaded with the tutorial parameter and auto-start it.
    if (new URLSearchParams(window.location.search).get('tutorial') === 'true') {
        // A short delay to ensure the rest of the UI is ready
        setTimeout(startTutorial, 500);
    }

    document.getElementById('main-nav').addEventListener('click', (e) => {
        // This listener now ONLY handles dropdown toggling
        const toggle = e.target.closest('.dropdown-toggle');
        if (toggle) {
            e.preventDefault(); // Prevent view switch if clicking dropdown toggle
            const dropdown = toggle.closest('.nav-dropdown');
            // Close other open dropdowns
            document.querySelectorAll('.nav-dropdown.open').forEach(openDropdown => {
                if (openDropdown !== dropdown) {
                    openDropdown.classList.remove('open');
                }
            });
            dropdown.classList.toggle('open');
        }
    });
    
    const ecoEventDeps = {
        switchView: (view, params) => eventBus.emit('navigate', { view, params }),
        showConfirmationModal,
        showToast,
        db,
        firestore: { doc, updateDoc },
        appState,
        logic: ecoLogic,
        dom,
        lucide
    };
    const handleEcoEvent = initEcoEventListeners(ecoEventDeps);

    dom.viewContent.addEventListener('click', (e) => {
        handleViewContentActions(e);
        if (appState.currentView === 'eco' || appState.currentView === 'eco_form') {
            handleEcoEvent(e);
        }
    });

    document.addEventListener('click', handleGlobalClick);

    // --- New Help Modal Logic ---
    function setupHelpButtonListener() {
        const helpBtn = document.getElementById('help-tutorial-btn');
        const helpModal = document.getElementById('help-modal');

        if (helpBtn && helpModal) {
            const closeHelpButtons = helpModal.querySelectorAll('[data-action="close-help-modal"]');

            helpBtn.addEventListener('click', () => {
                helpModal.classList.remove('hidden');
            });

            closeHelpButtons.forEach(btn => {
                btn.addEventListener('click', () => {
                    helpModal.classList.add('hidden');
                });
            });

            // Close modal by clicking on the backdrop
            helpModal.addEventListener('click', (e) => {
                if (e.target === helpModal) {
                    helpModal.classList.add('hidden');
                }
            });
        }
    }
    window.setupHelpButtonListener = setupHelpButtonListener;
}

async function switchView(viewName, params = null) {
    if (appState.currentViewCleanup) {
        appState.currentViewCleanup();
        appState.currentViewCleanup = null;
    }
    if (appState.currentView === 'sinoptico') appState.sinopticoState = null;
    if (appState.currentView === 'sinoptico_tabular') appState.sinopticoTabularState = null;
    appState.currentView = viewName;
    const config = viewConfig[viewName];
    dom.viewTitle.textContent = config.title;

    // Hide the title for the tabular view to save space, but show it for all other views.
    if (viewName === 'sinoptico_tabular') {
        dom.viewTitle.style.display = 'none';
    } else {
        dom.viewTitle.style.display = 'block';
    }

    // Update active link styling
    document.querySelectorAll('#main-nav .nav-link').forEach(link => {
        link.classList.remove('active');
    });

    const activeLink = document.querySelector(`#main-nav [data-view="${viewName}"]`);
    if (activeLink) {
        activeLink.classList.add('active');

        // If the link is inside a dropdown, also mark the dropdown toggle as active
        const parentDropdown = activeLink.closest('.nav-dropdown');
        if (parentDropdown) {
            parentDropdown.querySelector('.dropdown-toggle').classList.add('active');
        }
    }
    
    dom.viewContent.innerHTML = '';
    dom.headerActions.style.display = 'none';
    dom.searchInput.style.display = 'none';
    
    // The `await` keyword ensures that the promise returned by each `run...Logic` function
    // resolves before moving on. This makes view transitions predictable.
    if (viewName === 'visor3d') appState.currentViewCleanup = await runVisor3dLogic(app);
    else if (viewName === 'landing-page') await runLandingPageLogic();
    else if (viewName === 'sinoptico') await runSinopticoLogic();
    else if (viewName === 'sinoptico_tabular') await runSinopticoTabularLogic();
    else if (viewName === 'flujograma') await runFlujogramaLogic();
    else if (viewName === 'arboles') await renderArbolesInitialView();
    else if (viewName === 'profile') await runProfileLogic();
    else if (viewName === 'tareas') await runTasksLogicFromModule('kanban');
    else if (viewName === 'task-dashboard') await runTasksLogicFromModule('dashboard');
    else if (viewName === 'eco' || viewName === 'eco_form') {
        const deps = { db, firestore: { collection, query, orderBy, onSnapshot, doc, getDoc, writeBatch, updateDoc }, dom, lucide, appState, showToast, switchView: (view, params) => eventBus.emit('navigate', { view, params }), shouldRequirePpapConfirmation, sendNotification, showConfirmationModal, ensureCollectionsAreLoaded };
        const unsubscribe = await handleEcoView(viewName, params, deps);
        if (unsubscribe) {
            appState.currentViewCleanup = unsubscribe;
        }
    }
    else if (viewName === 'ecr' || viewName === 'ecr_creation_hub' || viewName === 'ecr_form') {
        const deps = { db, storage, functions, appState, dom, lucide, showToast, showConfirmationModal, switchView: (view, params) => eventBus.emit('navigate', { view, params }), sendNotification };
        await handleEcrView(viewName, params, deps);
    }
    else if (['control_ecrs', 'seguimiento_ecr_eco', 'ecr_seguimiento', 'ecr_table_view', 'indicadores_ecm_view'].includes(viewName)) {
        const deps = { db, firestore: { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, setDoc, getDoc, writeBatch, limit, orderBy }, dom, lucide, appState, showToast, switchView: (view, params) => eventBus.emit('navigate', { view, params }), showConfirmationModal, checkUserPermission, showInfoModal, seedControlPanelTutorialData, newControlPanelTutorial, showDatePromptModal };
        handleControlPanelView(viewName, params, deps);
    }
    else if (viewName === 'eco_form') {
        const deps = { db, firestore: { doc, getDoc, collection, writeBatch, updateDoc }, dom, lucide, appState, showToast, switchView: (view, params) => eventBus.emit('navigate', { view, params }), shouldRequirePpapConfirmation, sendNotification, showConfirmationModal, ensureCollectionsAreLoaded };
        await renderEcoFormView(params, deps);
    }
    else if (viewName === 'eco_form_mock_for_tutorial') {
        dom.viewContent.innerHTML = `<div id="action-plan-section" class="p-8 bg-white rounded-lg shadow-lg">Este es un plan de acción de ejemplo para el tutorial.</div>`;
    }
    else if (config?.dataKey) {
        dom.headerActions.style.display = 'flex';
        dom.searchInput.style.display = 'block';
        if (checkUserPermission('create')) {
            dom.addNewButton.style.display = 'flex';
            dom.addButtonText.textContent = `Agregar ${config.singular}`;
            // Add tutorial ID for ECR view
            if (viewName === 'ecr') {
                dom.addNewButton.dataset.tutorialId = 'create-new-button';
            } else {
                delete dom.addNewButton.dataset.tutorialId;
            }
        } else {
            dom.addNewButton.style.display = 'none';
        }
        await runTableLogic();
    }
    dom.searchInput.value = '';
}

// This function has been moved to /modules/eco/eco-ui.js


// The old dashboard functions are being replaced with a new, more professional and efficient version.

// ECR-related functions have been moved to public/modules/ecr/ecr-ui.js

function handleViewContentActions(e) {
    const button = e.target.closest('button[data-action], a[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'prev-page' || action === 'next-page') {
        runTableLogic(action === 'prev-page' ? 'prev' : 'next');
        return;
    }
    
    if (action === 'export-sinoptico-pdf') return;
    e.preventDefault();
    
    const id = button.dataset.id;
    const docId = button.dataset.docId;
    const userId = button.dataset.userId;

    const actions = {
        'admin-back-to-board': () => eventBus.emit('navigate', { view: 'tareas' }),
        'generate-eco-from-ecr': async () => {
            const ecrId = button.dataset.id;
            if (!ecrId) {
                showToast('Error: No se encontró el ID del ECR.', 'error');
                return;
            }
            try {
                const ecrDocRef = doc(db, COLLECTIONS.ECR_FORMS, ecrId);
                const ecrDocSnap = await getDoc(ecrDocRef);
                if (ecrDocSnap.exists()) {
                    eventBus.emit('navigate', { view: 'eco_form', params: { ecrData: ecrDocSnap.data() } });
                } else {
                    showToast(`No se encontraron datos para el ECR: ${ecrId}`, 'error');
                }
            } catch (error) {
                console.error("Error fetching full ECR document:", error);
                showToast('Error al cargar los datos completos del ECR.', 'error');
            }
        },
        'view-ecr': () => eventBus.emit('navigate', { view: 'ecr_form', params: { ecrId: button.dataset.id } }),
        'export-ecr-pdf': () => exportEcrToPdf(button.dataset.id),
        'details': () => openDetailsModal(appState.currentData.find(d => d.id == id)),
        'edit': () => openFormModal(appState.currentData.find(d => d.id == id)),
        'delete': () => deleteItem(docId),
        'export-pdf': () => handleExport('pdf'),
        'export-excel': () => handleExport('excel'),
        'open-sector-modal': () => openSectorProcessesModal(button.dataset.sectorId),
        'open-product-search-modal-sinoptico': () => openProductSearchModalForView('sinoptico'),
        'open-product-search-modal': () => openProductSearchModalForView('arboles'),
        'volver-a-busqueda': () => {
            appState.arbolActivo = null;
            renderArbolesInitialView();
        },
        'guardar-arbol': () => guardarEstructura(button),
        'add-node': () => openComponentSearchModal(button.dataset.nodeId, button.dataset.childType),
        'edit-node-details': () => openSinopticoEditModal(button.dataset.nodeId),
        'delete-node': () => eliminarNodo(button.dataset.nodeId),
        'delete-account': handleDeleteAccount,
        'seed-database': () => {
            showConfirmationModal(
                'Limpiar y Cargar Datos',
                '¿Estás seguro? Esto borrará todos los datos (excepto usuarios) y los reemplazará con los datos de demostración.',
                seedDatabase
            );
        },
        'clear-data-only': () => {
            showConfirmationModal(
                'Borrar Solo Datos',
                '¿Estás seguro? Esto borrará todos los datos de productos, insumos, etc., pero mantendrá a todos los usuarios.',
                clearDataOnly
            );
        },
        'clear-other-users': () => {
            showConfirmationModal(
                'Borrar Otros Usuarios',
                '¿Estás seguro? Esto eliminará a TODOS los usuarios excepto al administrador principal. Esta acción es irreversible.',
                clearOtherUsers
            );
        },
        'clone-product-from-table': () => {
            const productDocId = button.dataset.docId;
            const productToClone = appState.currentData.find(p => p.docId === productDocId);
            if (productToClone) {
                const deps = {
                    db,
                    firestore: { query, collection, where, getDocs, addDoc },
                    ui: { showToast, showPromptModal },
                    appState
                };
                cloneProduct(deps, productToClone);
            } else {
                showToast('Error: No se pudo encontrar el producto para clonar.', 'error');
            }
        },
        'clone-product': () => {
            const deps = {
                db,
                firestore: { query, collection, where, getDocs, addDoc },
                ui: { showToast, showPromptModal },
                appState
            };
            cloneProduct(deps);
        },
        'view-history': () => showToast('La función de historial de cambios estará disponible próximamente.', 'info'),
    };
    
    if (actions[action]) actions[action]();
}

// =================================================================================
// --- 5. UI, COMPONENTES Y NOTIFICACIONES ---
// =================================================================================

async function showEcoHistoryModal(ecoId) {
    if (!ecoId) return;

    const modalId = `history-modal-${ecoId}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col m-4 modal-content">
                <div class="flex justify-between items-center p-5 border-b">
                    <h3 class="text-xl font-bold">Historial de Cambios para ECO: ${ecoId}</h3>
                    <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div id="history-content" class="p-6 overflow-y-auto">
                    <p class="text-center text-gray-500">Cargando historial...</p>
                </div>
                <div class="flex justify-end items-center p-4 border-t bg-gray-50">
                    <button data-action="close" type="button" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cerrar</button>
                </div>
            </div>
        </div>
    `;
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);
    const historyContent = modalElement.querySelector('#history-content');

    modalElement.addEventListener('click', e => {
        if (e.target.closest('button')?.dataset.action === 'close') {
            modalElement.remove();
        }
    });

    try {
        const historyRef = collection(db, COLLECTIONS.ECO_FORMS, ecoId, 'history');
        const q = query(historyRef, orderBy('lastModified', 'desc'));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            historyContent.innerHTML = '<p class="text-center text-gray-500">No se encontró historial para este ECO.</p>';
            return;
        }

        let historyHTML = '<div class="space-y-4">';
        querySnapshot.forEach(doc => {
            const data = doc.data();
            const date = data.lastModified?.toDate ? data.lastModified.toDate().toLocaleString('es-AR') : 'Fecha desconocida';
            historyHTML += `
                <div class="p-4 border rounded-lg bg-gray-50">
                    <p><strong>Fecha:</strong> ${date}</p>
                    <p><strong>Modificado por:</strong> ${data.modifiedBy || 'Desconocido'}</p>
                    <p><strong>Estado:</strong> ${data.status || 'N/A'}</p>
                    <details class="mt-2 text-xs">
                        <summary class="cursor-pointer">Ver datos completos (JSON)</summary>
                        <pre class="bg-gray-200 p-2 rounded mt-1 overflow-auto max-h-60"><code>${JSON.stringify(data, null, 2)}</code></pre>
                    </details>
                </div>
            `;
        });
        historyHTML += '</div>';
        historyContent.innerHTML = historyHTML;

    } catch (error) {
        console.error("Error fetching ECO history:", error);
        historyContent.innerHTML = '<p class="text-center text-red-500">Error al cargar el historial.</p>';
        showToast('Error al cargar el historial.', 'error');
    }
}

async function exportEcoToPdf(ecoId) {
    if (!ecoId) {
        showToast('No se ha proporcionado un ID de ECO para exportar.', 'error');
        return;
    }

    showToast('Iniciando exportación a PDF...', 'info');
    dom.loadingOverlay.style.display = 'flex';
    dom.loadingOverlay.querySelector('p').textContent = 'Generando PDF...';

    try {
        // 1. Fetch ECO data
        const ecoDocRef = doc(db, COLLECTIONS.ECO_FORMS, ecoId);
        const ecoDocSnap = await getDoc(ecoDocRef);

        if (!ecoDocSnap.exists()) throw new Error(`No se encontró el ECO con ID ${ecoId}`);

        const ecoData = ecoDocSnap.data();
        const logoBase64 = await getLogoBase64();

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        // --- PDF Metadata ---
        pdf.setProperties({
            title: `ECO ${ecoId}`,
            subject: `Exportación de ECO`,
            author: appState.currentUser.name,
            creator: 'Gestión PRO App'
        });

        // --- ECO Form Content ---
        const MARGIN = 15;
        const PAGE_WIDTH = pdf.internal.pageSize.getWidth();
        const PAGE_HEIGHT = pdf.internal.pageSize.getHeight();
        const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);
        let y = MARGIN;

        // --- Helper Functions ---
        const checkPageBreak = (heightNeeded) => {
            if (y + heightNeeded > PAGE_HEIGHT - MARGIN) {
                pdf.addPage();
                y = MARGIN;
            }
        };

        const calculateSectionHeight = (section, ecoData) => {
            let height = 0;
            const LINE_HEIGHT_9PT = 4;
            const LINE_HEIGHT_10PT_ITALIC = 5;
            const CHECKLIST_ITEM_HEIGHT = 7;
            const SECTION_HEADER_HEIGHT = 10;
            const SECTION_FOOTER_HEIGHT = 17;
            const SECTION_SPACING = 5;

            height += SECTION_HEADER_HEIGHT;

            if (section.checklist) {
                const checklistHeight = section.checklist.length * CHECKLIST_ITEM_HEIGHT;
                const comments = ecoData.comments?.[section.id] || '';
                const commentsWidth = CONTENT_WIDTH * 0.4 - 5;

                pdf.setFontSize(9);
                const commentLines = pdf.splitTextToSize(comments, commentsWidth);
                const commentsHeight = 10 + (commentLines.length * LINE_HEIGHT_9PT);

                height += Math.max(checklistHeight, commentsHeight);
                height += SECTION_SPACING;
                height += SECTION_FOOTER_HEIGHT;
            } else if (section.description) {
                pdf.setFontSize(10);
                const descLines = pdf.splitTextToSize(section.description, CONTENT_WIDTH);
                height += 5 + (descLines.length * LINE_HEIGHT_10PT_ITALIC);
                height += SECTION_FOOTER_HEIGHT;
            }
            return height;
        };

        // --- Drawing Logic ---
        // Header
        if (logoBase64) {
            pdf.addImage(logoBase64, 'PNG', MARGIN, y, 35, 15);
        }
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(16);
        const title = 'ECO DE PRODUCTO / PROCESO';
        const ecrText = `ECR N°: ${ecoData.id || 'N/A'}`;

        pdf.text(title, PAGE_WIDTH - MARGIN, y + 8, { align: 'right' });
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'normal');
        pdf.text(ecrText, PAGE_WIDTH - MARGIN, y + 16, { align: 'right' });
        y += 30;

        // --- Sections ---
        const formSectionsData = [ { title: 'ENG. PRODUCTO', id: 'eng_producto', checklist: [ '¿Se requiere cambio en el plano?', '¿Se requiere cambio en la especificación?', '¿Se requiere un nuevo herramental?', '¿Se requiere un nuevo dispositivo?' ] }, { title: 'CALIDAD', id: 'calidad', checklist: [ '¿Se requiere un nuevo plan de control?', '¿Se requiere un nuevo estudio de capacidad?', '¿Se requiere un nuevo R&R?', '¿Se requiere un nuevo layout?' ] }, { title: 'ENG. PROCESO', id: 'eng_proceso', checklist: [ '¿Se requiere un nuevo diagrama de flujo?', '¿Se requiere un nuevo AMEF?', '¿Se requiere un nuevo estudio de tiempos?', '¿Se requiere una nueva instrucción de trabajo?' ] }, { title: 'COMPRAS', id: 'compras', checklist: [ '¿Se requiere un nuevo proveedor?', '¿Se requiere un nuevo acuerdo de precios?', '¿Se requiere un nuevo embalaje?', '¿Se requiere un nuevo transporte?' ] }, { title: 'LOGISTICA', id: 'logistica', checklist: [ '¿Se requiere un nuevo layout de almacén?', '¿Se requiere un nuevo sistema de identificación?', '¿Se requiere un nuevo flujo de materiales?', '¿Se requiere un nuevo sistema de transporte interno?' ] }, { title: 'IMPLEMENTACIÓN', id: 'implementacion', checklist: [ '¿Se requiere actualizar el stock?', '¿Se requiere notificar al cliente?', '¿Se requiere capacitar al personal?', '¿Se requiere validar el proceso?' ] }, { title: 'APROBACIÓN FINAL', id: 'aprobacion_final', description: 'Aprobación final del ECO y cierre del proceso.', checklist: null } ];

        formSectionsData.forEach(section => {
            const sectionHeight = calculateSectionHeight(section, ecoData);
            checkPageBreak(sectionHeight);

            pdf.setFillColor(230, 230, 230);
            pdf.rect(MARGIN, y, CONTENT_WIDTH, 8, 'F');
            pdf.setFontSize(12);
            pdf.setFont('helvetica', 'bold');
            pdf.text(section.title, MARGIN + 2, y + 5.5);
            y += 10;

            if (section.checklist) {
                const checklistData = ecoData.checklists?.[section.id] || [];
                const comments = ecoData.comments?.[section.id] || '';
                const signatures = ecoData.signatures?.[section.id] || {};

                const checklistYStart = y;
                const checklistWidth = CONTENT_WIDTH * 0.6;
                const commentsWidth = CONTENT_WIDTH * 0.4 - 5;

                pdf.setFontSize(9);
                pdf.setFont('helvetica', 'normal');
                section.checklist.forEach((item, index) => {
                    const itemData = checklistData[index] || {};
                    pdf.text(item, MARGIN, y + 5);
                    pdf.rect(MARGIN + checklistWidth - 20, y + 2, 3, 3);
                    if (itemData.si) pdf.text('X', MARGIN + checklistWidth - 19, y + 4.5);
                    pdf.text('SI', MARGIN + checklistWidth - 16, y + 5);
                    pdf.rect(MARGIN + checklistWidth - 8, y + 2, 3, 3);
                    if (itemData.na) pdf.text('X', MARGIN + checklistWidth - 7, y + 4.5);
                    pdf.text('N/A', MARGIN + checklistWidth - 4, y + 5);
                    y += 7;
                });

                const checklistYEnd = y;
                y = checklistYStart;

                pdf.setFont('helvetica', 'bold');
                pdf.text('Comentarios:', MARGIN + checklistWidth + 5, y + 5);
                pdf.setFont('helvetica', 'normal');
                const commentLines = pdf.splitTextToSize(comments, commentsWidth);
                pdf.text(commentLines, MARGIN + checklistWidth + 5, y + 10);

                y = Math.max(checklistYEnd, y + 10 + commentLines.length * 4);
                y += 5;

                pdf.setDrawColor(150);
                pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
                y += 5;

                pdf.setFontSize(8);
                const sigDate = signatures.date_review || '____/____/____';
                const sigStatus = signatures.status || 'N/A';
                const sigName = signatures.name || '____________________';
                const sigVisto = signatures.visto || '____________________';

                pdf.text(`Fecha de Revisión: ${sigDate}`, MARGIN, y);
                pdf.text(`Estado:`, MARGIN + 60, y);
                pdf.circle(MARGIN + 72, y - 1, 1.5);
                pdf.text('OK', MARGIN + 74, y);
                if (sigStatus === 'ok') pdf.circle(MARGIN + 72, y - 1, 1, 'F');
                pdf.circle(MARGIN + 82, y - 1, 1.5);
                pdf.text('NOK', MARGIN + 84, y);
                if (sigStatus === 'nok') pdf.circle(MARGIN + 82, y - 1, 1, 'F');
                pdf.text(`Aprobador: ${sigName}`, MARGIN, y + 7);
                pdf.text(`Firma: ${sigVisto}`, MARGIN + 100, y + 7);
                y += 12;

            } else if (section.description) {
                pdf.setFontSize(10);
                pdf.setFont('helvetica', 'italic');
                const descLines = pdf.splitTextToSize(section.description, CONTENT_WIDTH);
                pdf.text(descLines, MARGIN, y + 5);
                y += 5 + descLines.length * 5;

                const signatures = ecoData.signatures?.[section.id] || {};
                pdf.setDrawColor(150);
                pdf.line(MARGIN, y, PAGE_WIDTH - MARGIN, y);
                y += 5;

                pdf.setFontSize(8);
                const sigDate = signatures.date_review || '____/____/____';
                const sigName = signatures.name || '____________________';
                const sigVisto = signatures.visto || '____________________';

                pdf.text(`Fecha de Revisión: ${sigDate}`, MARGIN, y);
                pdf.text(`Aprobador: ${sigName}`, MARGIN, y + 7);
                pdf.text(`Firma: ${sigVisto}`, MARGIN + 100, y + 7);
                y += 12;
            }
        });

        pdf.save(`ECO_${ecoId}.pdf`);

    } catch (error) {
        console.error("Error exporting ECO to PDF:", error);
        showToast('Error al exportar el PDF.', 'error');
    } finally {
        dom.loadingOverlay.style.display = 'none';
    }
}

async function generateFichaPdf(fichaId) {
    if (!fichaId) return;

    showToast('Generando PDF de la ficha...', 'info');
    const fichaDocRef = doc(db, 'seguimiento_ecr_eco', fichaId);
    const fichaDocSnap = await getDoc(fichaDocRef);

    if (!fichaDocSnap.exists()) {
        showToast('Error: No se encontró la ficha.', 'error');
        return;
    }

    const fichaData = fichaDocSnap.data();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const logoBase64 = await getLogoBase64();

    // --- Header ---
    if (logoBase64) {
        doc.addImage(logoBase64, 'PNG', 14, 15, 30, 12);
    }
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(`Ficha de Seguimiento: ${fichaData.n_eco_ecr}`, doc.internal.pageSize.getWidth() - 14, 22, { align: 'right' });
    doc.setLineWidth(0.5);
    doc.line(14, 30, doc.internal.pageSize.getWidth() - 14, 30);


    // --- Main data ---
    let yPos = 40;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Cliente: ${fichaData.cliente || 'N/A'}`, 14, yPos);
    doc.text(`Pedido: ${fichaData.pedido || 'N/A'}`, 14, yPos + 6);
    doc.text(`Descripción:`, 14, yPos + 12);
    const descLines = doc.splitTextToSize(fichaData.descripcion || 'N/A', 180);
    doc.text(descLines, 14, yPos + 18);
    yPos += 18 + (descLines.length * 6) + 5;


    // --- Table ---
    const head = [['Departamento', 'Comentario ECR', 'Firma', 'Comentario ECO', 'Firma']];
    const body = [];
    const DEPARTAMENTOS = [
        'ENG. PRODUCTO', 'ENG. PROCESSO PLTL', 'HSE', 'QUALIDADE / CALIDAD', 'COMPRAS',
        'QUALIDADE COMPRAS', 'TOOLING & EQUIPAMENTS', 'LOGISTICA E PC&L', 'FINANCEIRO / COSTING',
        'COMERCIAL', 'MANUTENÇÃO / MANTENIMIENTO', 'PRODUÇÃO / PRODUCCIÓN', 'QUALIDADE CLIENTE'
    ];

    DEPARTAMENTOS.forEach(depto => {
        const deptoKey = depto.replace(/[\s/&]/g, '_');
        const deptoData = fichaData.departamentos?.[deptoKey] || {};
        body.push([
            depto,
            deptoData.ecrComentario || '-',
            deptoData.ecrFirmada || 'NO',
            deptoData.ecoComentario || '-',
            deptoData.ecoFirmada || 'NO'
        ]);
    });

    doc.autoTable({
        startY: yPos,
        head: head,
        body: body,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [41, 104, 217], fontStyle: 'bold' },
        columnStyles: {
            0: { cellWidth: 35, fontStyle: 'bold' },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 12, halign: 'center' },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 12, halign: 'center' }
        }
    });

    doc.save(`Ficha_${fichaData.n_eco_ecr}.pdf`);
    showToast('PDF generado.', 'success');
}

async function exportEcrToPdf(ecrId) {
    if (!ecrId) {
        showToast('No se ha proporcionado un ID de ECR para exportar.', 'error');
        return;
    }

    showToast('Iniciando exportación de ECR a PDF...', 'info');
    dom.loadingOverlay.style.display = 'flex';
    dom.loadingOverlay.querySelector('p').textContent = 'Generando PDF de ECR...';

    // Switch to the form view temporarily to render the content
    const originalView = appState.currentView;
    await eventBus.emit('navigate', { view: 'ecr_form', params: { ecrId } });

    const formElement = document.getElementById('ecr-form');
    if (!formElement) {
        showToast('Error: No se pudo encontrar el formulario ECR para exportar.', 'error');
        dom.loadingOverlay.style.display = 'none';
        eventBus.emit('navigate', { view: originalView }); // Switch back to original view
        return;
    }

    // Robustly wait for all images inside the form to load before rendering the PDF
    await waitForImages(formElement);

    // Temporarily apply print-friendly styles
    const styleId = 'pdf-export-styles';
    const tempStyle = document.createElement('style');
    tempStyle.id = styleId;
    tempStyle.innerHTML = `
        body { background-color: #ffffff !important; }
        .form-container {
            margin: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            border: none !important;
        }
        .ecr-page {
            box-shadow: none !important;
            border: none !important;
            page-break-after: always;
            margin: 0;
            padding: 15px; /* Add some padding for the PDF */
        }
        #action-buttons-container { display: none !important; }
        .watermark { display: none !important; }
    `;
    document.head.appendChild(tempStyle);

    try {
        const opt = {
            margin: 0,
            filename: `ECR_${ecrId}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                onclone: (clonedDoc) => {
                    const clonedStyle = clonedDoc.createElement('style');
                    clonedStyle.innerHTML = tempStyle.innerHTML;
                    clonedDoc.head.appendChild(clonedStyle);
                }
            },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak: { mode: ['css'], after: '.ecr-page' }
        };

        await html2pdf().from(formElement).set(opt).save();

        showToast('ECR exportado a PDF con éxito.', 'success');

    } catch (error) {
        console.error("Error exporting ECR to PDF:", error);
        showToast('Error al exportar el PDF.', 'error');
    } finally {
        // Cleanup: remove temporary styles and switch back to the original view
        const styleElement = document.getElementById(styleId);
        if (styleElement) {
            styleElement.remove();
        }
        dom.loadingOverlay.style.display = 'none';
        eventBus.emit('navigate', { view: originalView });
    }
}

// Functions moved to public/modules/admin/admin.js

function handleGlobalClick(e) {
    if (appState.isTutorialActive) return; // Don't process global clicks if tutorial is running

    const target = e.target;

    // Generic view switcher
    const viewLink = target.closest('[data-view]');
    if (viewLink && !viewLink.closest('.dropdown-toggle')) {
        e.preventDefault();
        const viewName = viewLink.dataset.view;
        const params = viewLink.dataset.params ? JSON.parse(viewLink.dataset.params) : null;
        eventBus.emit('navigate', { view: viewName, params });

        // Close any open dropdowns after a view switch
        const openDropdown = viewLink.closest('.nav-dropdown.open');
        if (openDropdown) {
            openDropdown.classList.remove('open');
        }
        return; // Prioritize view switching
    }
    
    const godModeButton = target.closest('.god-mode-role-btn');
    if (godModeButton) {
        e.preventDefault();
        const roleToSimulate = godModeButton.dataset.godModeRole;
        handleGodModeRoleChange(roleToSimulate);
        document.getElementById('user-dropdown')?.classList.add('hidden');
        return;
    }

    const notificationLink = target.closest('[data-action="notification-click"]');
    if (notificationLink) {
        e.preventDefault();
        const { view, params, id } = notificationLink.dataset;

        // Mark as read
        const notifRef = doc(db, COLLECTIONS.NOTIFICATIONS, id);
        updateDoc(notifRef, { isRead: true });

        // Navigate
        document.getElementById('notification-dropdown')?.classList.add('hidden');
        eventBus.emit('navigate', { view, params: JSON.parse(params) });
        return;
    }

    const markAllReadBtn = target.closest('[data-action="mark-all-read"]');
    if(markAllReadBtn) {
        const batch = writeBatch(db);
        const unreadNotifs = appState.collections.notifications.filter(n => !n.isRead);
        unreadNotifs.forEach(n => {
            const notifRef = doc(db, COLLECTIONS.NOTIFICATIONS, n.docId);
            batch.update(notifRef, { isRead: true });
        });
        batch.commit().then(() => showToast('Notificaciones marcadas como leídas.', 'success'));
        return;
    }


    // Close user menu
    const userMenuButton = document.getElementById('user-menu-button');
    const userDropdown = document.getElementById('user-dropdown');
    if (userMenuButton && !userMenuButton.contains(target) && userDropdown && !userDropdown.contains(target)) {
        userDropdown.classList.add('hidden');
    }

    // Close nav dropdowns
    if (!target.closest('.nav-dropdown') && !target.closest('#tutorial-overlay')) {
        document.querySelectorAll('.nav-dropdown.open').forEach(dropdown => {
            dropdown.classList.remove('open');
        });
    }

    if (!target.closest('.dropdown-container')) {
        document.querySelectorAll('.dropdown-menu').forEach(menu => {
            menu.classList.add('hidden');
        });
    }
    
    if (!target.closest('#export-menu-container')) document.getElementById('export-dropdown')?.classList.add('hidden'); 
    if (!target.closest('#type-filter-btn')) document.getElementById('type-filter-dropdown')?.classList.add('hidden'); 
    if (!target.closest('#add-client-filter-btn')) document.getElementById('add-client-filter-dropdown')?.classList.add('hidden');
    if (!e.target.closest('#level-filter-btn') && !e.target.closest('#level-filter-dropdown')) {
        document.getElementById('level-filter-dropdown')?.classList.add('hidden');
    }
    
    if(target.closest('#user-menu-button')) { userDropdown?.classList.toggle('hidden'); }
}

// =================================================================================
// --- 6. LÓGICA DE VISTAS (DASHBOARD, TABLAS, ÁRBOLES, ETC.) ---
// =================================================================================

async function runTableLogic(direction = 'first') {
    const config = viewConfig[appState.currentView];
    if (!config || !config.dataKey) return;

    const PAGE_SIZE = 10;
    const collectionRef = collection(db, config.dataKey);

    // The main field for ordering should be consistent. 'id' is a good default.
    const baseQuery = query(collectionRef, orderBy("id"));

    let currentPage = appState.pagination.currentPage;
    if (direction === 'next') {
        currentPage++;
    } else if (direction === 'prev' && currentPage > 1) {
        currentPage--;
    } else if (direction === 'first') {
        // Reset pagination state for the new view
        appState.pagination = { pageCursors: { 1: null }, currentPage: 1, totalItems: 0 };
        currentPage = 1;
    }

    const cursor = appState.pagination.pageCursors[currentPage];
    let q;
    if (cursor) {
        q = query(baseQuery, startAfter(cursor), limit(PAGE_SIZE));
    } else {
        q = query(baseQuery, limit(PAGE_SIZE));
    }

    try {
        dom.viewContent.innerHTML = `<div class="text-center py-16 text-gray-500"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto"></i><p class="mt-2">Cargando datos...</p></div>`;
        lucide.createIcons();

        // Fetch total count only on the first load of a view for efficiency
        if (direction === 'first') {
            const countSnapshot = await getCountFromServer(query(collection(db, config.dataKey)));
            appState.pagination.totalItems = countSnapshot.data().count;
        }

        const documentSnapshots = await getDocs(q);
        const data = documentSnapshots.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

        if (documentSnapshots.empty && currentPage > 1) {
            // This can happen if the user clicks "next" on the last page.
            // We just go back one page.
            appState.pagination.currentPage = currentPage - 1;
            showToast('No hay más resultados.', 'info');
            // Re-render the last known good page.
            runTableLogic('prev');
            return;
        }

        appState.pagination.currentPage = currentPage;

        // Special filtering for users view
        if (config.dataKey === COLLECTIONS.USUARIOS) {
            appState.currentData = data.filter(user => user.disabled !== true);
        } else {
            appState.currentData = data;
        }

        renderTable(appState.currentData, config);

        // Store the cursor for the *next* page
        if (!documentSnapshots.empty) {
            const lastVisibleDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];
            appState.pagination.pageCursors[currentPage + 1] = lastVisibleDoc;
        }

    } catch (error) {
        console.error("Error fetching paginated data:", error);
        showToast("Error al cargar los datos. Puede que necesite crear un índice en Firestore.", "error");
        dom.viewContent.innerHTML = `<p class="text-red-500">Error al cargar la tabla. Verifique la consola.</p>`;
    }
}

function renderTable(data, config) {
    const PAGE_SIZE = 10; // Ensure this is consistent with runTableLogic
    const { currentPage, totalItems } = appState.pagination;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);

    let tableHTML = `<div class="bg-white p-6 rounded-xl shadow-lg animate-fade-in-up">
        <div class="flex justify-end mb-4">
            <button data-action="export-pdf" class="bg-red-500 text-white px-4 py-2 rounded-md hover:bg-red-600 flex items-center text-sm shadow-sm"><i data-lucide="file-text" class="mr-2 h-4 w-4"></i>PDF</button>
            <button data-action="export-excel" class="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center text-sm ml-2 shadow-sm"><i data-lucide="file-spreadsheet" class="mr-2 h-4 w-4"></i>Excel</button>
        </div>
        <div class="overflow-x-auto">
            <table class="w-full text-sm text-left text-gray-600">
                <thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr>`;
    config.columns.forEach(col => { tableHTML += `<th scope="col" class="px-6 py-3">${col.label}</th>`; });
    tableHTML += `<th scope="col" class="px-6 py-3 text-right">Acciones</th></tr></thead><tbody>`;
    if (data.length === 0) {
        tableHTML += `<tr><td colspan="${config.columns.length + 1}"><div class="text-center py-16 text-gray-500"><i data-lucide="search-x" class="mx-auto h-16 w-16 text-gray-300"></i><h3 class="mt-4 text-lg font-semibold">Sin resultados</h3><p class="text-sm">No hay datos para mostrar en esta vista.</p></div></td></tr>`;
    } else {
        data.forEach(item => {
            tableHTML += `<tr class="bg-white border-b hover:bg-gray-50 transition-colors duration-150">`;
            config.columns.forEach(col => {
                const value = col.format ? col.format(item[col.key]) : (item[col.key] || 'N/A');
                const titleValue = String(value).replace(/"/g, '&quot;');
                tableHTML += `<td class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap" title="${titleValue}">${value}</td>`;
            });
            const cloneButtonHTML = (config.dataKey === COLLECTIONS.PRODUCTOS && checkUserPermission('create', item))
                ? `<button data-action="clone-product-from-table" data-doc-id="${item.docId}" class="text-gray-500 hover:text-purple-600" title="Clonar"><i data-lucide="copy" class="h-5 w-5 pointer-events-none"></i></button>`
                : '';

            tableHTML += `<td class="px-6 py-4 flex items-center justify-end space-x-3">
                <button data-action="details" data-id="${item.id}" data-doc-id="${item.docId}" class="text-gray-500 hover:text-blue-600" title="Ver Detalles"><i data-lucide="info" class="h-5 w-5 pointer-events-none"></i></button>
                ${cloneButtonHTML}
                ${checkUserPermission('edit', item) ? `<button data-action="edit" data-id="${item.id}" data-doc-id="${item.docId}" class="text-gray-500 hover:text-green-600" title="Editar"><i data-lucide="edit" class="h-5 w-5 pointer-events-none"></i></button>` : ''}
                ${checkUserPermission('delete', item) ? `<button data-action="delete" data-id="${item.id}" data-doc-id="${item.docId}" class="text-gray-500 hover:text-red-600" title="Eliminar"><i data-lucide="trash-2" class="h-5 w-5 pointer-events-none"></i></button>` : ''}
            </td></tr>`;
        });
    }
    tableHTML += `</tbody></table></div>
    <div class="flex justify-between items-center pt-4">
        <button data-action="prev-page" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage <= 1 ? 'disabled' : ''}>Anterior</button>
        <span class="text-sm font-semibold text-gray-600">Página ${currentPage} de ${totalPages > 0 ? totalPages : 1}</span>
        <button data-action="next-page" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 text-sm font-semibold" ${currentPage >= totalPages ? 'disabled' : ''}>Siguiente</button>
    </div>
    </div>`;
    dom.viewContent.innerHTML = tableHTML;
    lucide.createIcons();
}

async function handleSearch() {
    const config = viewConfig[appState.currentView];
    const searchTerm = dom.searchInput.value.trim(); // No toLowerCase, Firestore is case-sensitive
    if (!searchTerm) {
        runTableLogic('first');
        return;
    }
    if (!config || !config.dataKey) {
        return;
    }
    showToast(`Buscando "${searchTerm}"...`, 'info');
    try {
        const collectionRef = collection(db, config.dataKey);
        const searchFields = config.columns.map(col => col.key);

        // Firestore 'or' queries have a limit of 30 equality clauses.
        if (searchFields.length > 30) {
            showToast('La búsqueda está limitada a los primeros 30 campos.', 'info');
            searchFields.length = 30;
        }
        
        // Build an array of `where` conditions for the `or` query.
        const whereClauses = searchFields.map(field => where(field, '==', searchTerm));

        // Add "starts-with" condition for the primary search field (usually the first column)
        const primarySearchField = searchFields[0];
        whereClauses.push(where(primarySearchField, '>=', searchTerm));
        whereClauses.push(where(primarySearchField, '<=', searchTerm + '\uf8ff'));


        const q = query(collectionRef, or(...whereClauses));

        const querySnapshot = await getDocs(q);
        const results = querySnapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

        appState.currentData = results;
        renderTable(results, config);

        const paginationControls = dom.viewContent.querySelector('.flex.justify-between.items-center.pt-4');
        if (paginationControls) {
            paginationControls.style.display = 'none';
        }

    } catch (error) {
        console.error('Error durante la búsqueda:', error);
        if (error.code === 'failed-precondition' && error.message.includes('https://console.firebase.google.com')) {
            const urlRegex = /(https:\/\/[^\s]+)/;
            const urlMatch = error.message.match(urlRegex);
            if (urlMatch) {
                const firestoreIndexUrl = urlMatch[0].replace('?create_composite=true', '');
                const toastMessage = `
                    <span>Se requiere un índice de Firestore.</span>
                    <a href="${firestoreIndexUrl}" target="_blank" class="toast-link">Crear Índice</a>
                `;
                showToast(toastMessage, 'error', 15000);
            } else {
                showToast('Error de búsqueda: Se requiere un índice compuesto en Firestore.', 'error', 5000);
            }
        } else {
             showToast('Error al realizar la búsqueda.', 'error');
        }
    }
}

function handleExport(type) {
    const config = viewConfig[appState.currentView];
    const data = appState.currentData;
    const title = config.title;

    if (type === 'pdf') {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape' });

        // Use the columns from the config for headers to match the screen
        const headers = config.columns.map(col => col.label);
        const body = data.map(item => {
            return config.columns.map(col => {
                const value = col.format ? col.format(item[col.key]) : (item[col.key] || 'N/A');
                return value;
            });
        });

        doc.autoTable({
            head: [headers],
            body: body,
            startY: 25, // Start table lower to make space for header
            styles: { fontSize: 8, cellPadding: 1.5 },
            headStyles: { fillColor: [41, 104, 217], textColor: 255, fontStyle: 'bold' },
            alternateRowStyles: { fillColor: [241, 245, 249] },
            // Let the library handle column widths automatically for a generic solution
            columnStyles: {},
            didDrawPage: (data) => {
                // Page Header
                doc.setFontSize(16);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text(title, 14, 15);

                // Page Footer
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });
            }
        });

        const fileName = `${config.dataKey}_export_${new Date().toISOString().split('T')[0]}.pdf`;
        doc.save(fileName);

    } else if (type === 'excel') {
        // Excel export can use the more detailed field list
        const excelData = data.map(item => {
            let row = {};
            config.fields.forEach(field => {
                let value = item[field.key] || '';
                // Resolve IDs to descriptions for 'select' fields with a searchKey
                if (field.type === 'select' && field.searchKey && value) {
                    const sourceCollection = appState.collectionsById[field.searchKey];
                    const relatedItem = sourceCollection?.get(value);
                    value = relatedItem ? (relatedItem.descripcion || relatedItem.name) : value; // Use 'name' as fallback for users
                }
                row[field.label] = value;
            });
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, title);
        const fileName = `${config.dataKey}_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }
    showToast(`Exportación a ${type.toUpperCase()} iniciada.`, 'success');
}

async function openFormModal(item = null) {
    const config = viewConfig[appState.currentView];
    const isEditing = item !== null;
    const modalId = `form-modal-${Date.now()}`;

    // Step 1: Identify all collections that need to be fetched for dropdowns.
    const dropdownFields = config.fields.filter(field => field.type === 'select' && field.searchKey);
    const collectionsToFetch = [...new Set(dropdownFields.map(field => field.searchKey))];

    // Step 2: Fetch all required collections concurrently.
    const fetchedCollections = {};
    try {
        if (collectionsToFetch.length > 0) {
            showToast('Cargando opciones del formulario...', 'info', 2000);
            await Promise.all(collectionsToFetch.map(async (collectionName) => {
                const querySnapshot = await getDocs(collection(db, collectionName));
                const data = querySnapshot.docs.map(d => ({ ...d.data(), docId: d.id }));
                // Sort data for user-friendly dropdowns
                data.sort((a, b) => (a.descripcion || a.name || '').localeCompare(b.descripcion || b.name || ''));
                fetchedCollections[collectionName] = data;
            }));
        }
    } catch (error) {
        console.error("Error fetching data for form dropdowns:", error);
        showToast('Error al cargar los datos para el formulario.', 'error');
        return; // Abort if data can't be loaded
    }
    
    let fieldsHTML = '';
    for (const field of config.fields) {
        const isReadonly = (isEditing && field.key === 'id') || field.readonly;
        let inputHTML = '';
        const commonClasses = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm';
        const readonlyClasses = isReadonly ? 'bg-gray-100 cursor-not-allowed' : '';
        const value = item ? (item[field.key] || '') : '';
        
        if (field.type === 'select') {
            let optionsHTML = '';
            // Use the pre-fetched data if available, otherwise use static options from config.
            const options = field.searchKey ? (fetchedCollections[field.searchKey] || []) : (field.options || []);

            if (field.searchKey) {
                options.forEach(opt => {
                    const isSelected = opt.id === value;
                    optionsHTML += `<option value="${opt.id}" ${isSelected ? 'selected' : ''}>${opt.descripcion || opt.name}</option>`;
                });
            } else { // Simple array of options
                options.forEach(opt => {
                    const optionValue = typeof opt === 'string' ? opt : opt;
                    const isSelected = optionValue === value;
                    optionsHTML += `<option value="${optionValue}" ${isSelected ? 'selected' : ''}>${opt}</option>`;
                });
            }
            inputHTML = `<select id="${field.key}" name="${field.key}" class="${commonClasses} ${readonlyClasses}" ${isReadonly ? 'disabled' : ''} ${field.required ? 'required' : ''}><option value="">Seleccionar...</option>${optionsHTML}</select>`;

        } else if (field.type === 'search-select') {
            let selectedItemName = 'Ninguno seleccionado';
            if (isEditing && value) {
                // This assumes the data for search-select is small and loaded globally (e.g., sectors, roles)
                // or that we can fetch it if necessary. For now, it relies on global state.
                const sourceDB = appState.collections[field.searchKey];
                if (sourceDB) {
                    const foundItem = sourceDB.find(dbItem => dbItem.id === value);
                    if(foundItem) selectedItemName = foundItem.descripcion;
                }
            }
            inputHTML = `<div class="flex items-center gap-2">
                <input type="text" id="${field.key}-display" value="${selectedItemName}" class="${commonClasses} bg-gray-100" readonly>
                <input type="hidden" id="${field.key}" name="${field.key}" value="${value}">
                <button type="button" data-action="open-search-modal" data-search-key="${field.searchKey}" data-field-key="${field.key}" class="bg-blue-500 text-white px-3 py-2 rounded-md hover:bg-blue-600"><i data-lucide="search" class="h-5 w-5"></i></button>
            </div>`;
        } else if (field.type === 'textarea') {
            inputHTML = `<textarea id="${field.key}" name="${field.key}" rows="3" class="${commonClasses} ${readonlyClasses}" ${field.required ? 'required' : ''} ${isReadonly ? 'readonly' : ''}>${value}</textarea>`;
        } else {
            inputHTML = `<input type="${field.type}" id="${field.key}" name="${field.key}" value="${value}" class="${commonClasses} ${readonlyClasses}" ${field.required ? 'required' : ''} ${isReadonly ? 'readonly' : ''}>`;
        }
        
        fieldsHTML += `<div class="${field.type === 'textarea' || field.type === 'search-select' || field.key === 'id' || field.type === 'select' ? 'md:col-span-2' : ''}">
            <label for="${field.type === 'search-select' ? field.key + '-display' : field.key}" class="block text-sm font-medium text-gray-700 mb-1">${field.label}</label>
            ${inputHTML}
            <p id="error-${field.key}" class="text-xs text-red-600 mt-1 h-4"></p>
        </div>`;
    }

    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-[1050] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-fade-in">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4 animate-scale-in">
            <div class="flex justify-between items-center p-5 border-b border-slate-200">
                <h3 class="text-xl font-bold text-slate-800">${isEditing ? 'Editar' : 'Agregar'} ${config.singular}</h3>
                <button data-action="close" class="text-slate-500 hover:text-slate-800 p-1 rounded-full hover:bg-slate-100 transition-colors"><i data-lucide="x" class="h-6 w-6"></i></button>
            </div>
            <form id="data-form" class="p-6 overflow-y-auto custom-scrollbar" novalidate>
                <input type="hidden" name="edit-doc-id" value="${isEditing ? item.docId : ''}">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">${fieldsHTML}</div>
            </form>
            <div class="flex justify-end items-center p-4 border-t border-slate-200 bg-slate-50 space-x-3">
                <button data-action="close" type="button" class="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300 font-semibold transition-colors">Cancelar</button>
                <button type="submit" form="data-form" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold transition-colors">Guardar</button>
            </div>
        </div>
    </div>`;
    
    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);
    config.fields.forEach(field => {
        const input = modalElement.querySelector(`[name="${field.key}"]`);
        if (input) {
            input.addEventListener('blur', () => validateField(field, input));
        }
    });
    
    modalElement.querySelector('form').addEventListener('submit', (e) => handleFormSubmit(e, config.fields, item));
    
    modalElement.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'close') {
            modalElement.remove();
        }
        else if (action === 'open-search-modal') {
            const fieldKey = button.dataset.fieldKey;
            openAssociationSearchModal(button.dataset.searchKey, (selectedItem) => {
                const fieldInput = document.getElementById(fieldKey);
                const displayInput = document.getElementById(`${fieldKey}-display`);
                if (fieldInput && displayInput) {
                    fieldInput.value = selectedItem.id;
                    displayInput.value = selectedItem.descripcion;
                    validateField({ key: fieldKey, required: true }, fieldInput);
                }
            });
        }
    });
}

async function handleFormSubmit(e, fields, item = null) {
    e.preventDefault();
    
    let isFormValid = true;
    for (const field of fields) {
        const input = e.target.querySelector(`[name="${field.key}"]`);
        if (input && !validateField(field, input)) {
            isFormValid = false;
        }
    }
    if (!isFormValid) {
        showToast('Por favor, corrija los errores en el formulario.', 'error');
        return;
    }
    const form = e.target;
    const modalElement = form.closest('.fixed');
    const formData = new FormData(form);
    const docId = formData.get('edit-doc-id');
    const newItem = {};
    const config = viewConfig[appState.currentView];
    
    for (const field of config.fields) {
        const value = formData.get(field.key);
        if (field.type === 'number') {
            newItem[field.key] = value ? parseFloat(value) : null;
        } else {
            newItem[field.key] = value;
        }
    }
    
    if (!docId) {
        newItem.createdAt = new Date();
    }
    const saveButton = form.closest('.modal-content').querySelector('button[type="submit"]');
    const originalButtonHTML = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5"></i>`;
    lucide.createIcons();

    let success = false;
    if (config.dataKey === COLLECTIONS.COVER_MASTER) {
        // Special handling for the master cover to increment revision and save history
        newItem.revision = item?.revision; // Pass current revision for incrementing
        success = await saveMasterCover(newItem);
    } else {
        success = await saveDocument(config.dataKey, newItem, docId);
    }
    
    if (success) {
        modalElement.remove();
        // For the master cover, we need to refresh its specific view
        if (config.dataKey === COLLECTIONS.COVER_MASTER) {
            runCoverMasterLogic();
        }
        // For other views, the realtime listener will handle the update.
    } else {
        // Restore button on failure
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonHTML;
    }
}

function openDetailsModal(item) {
    const config = viewConfig[appState.currentView];
    let fieldsHTML = '';
    config.fields.forEach(field => {
        let value = item[field.key] || 'N/A';
        if (field.type === 'search-select') {
            const sourceDB = appState.collections[field.searchKey];
            const foundItem = sourceDB.find(dbItem => dbItem.id === value);
            value = foundItem ? foundItem.descripcion : 'N/A';
        }
        fieldsHTML += `<div class="${field.type === 'textarea' || field.key === 'id' ? 'md:col-span-2' : ''}"><label class="block text-sm font-medium text-gray-500">${field.label}</label><div class="mt-1 text-sm text-gray-900 bg-gray-100 p-2 rounded-md border min-h-[38px] break-words">${value}</div></div>`;
    });
    
    const modalHTML = `<div id="details-modal" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4 modal-content"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">Detalles de ${config.singular}</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><div class="p-6 overflow-y-auto"><div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">${fieldsHTML}</div></div><div class="flex justify-end items-center p-4 border-t bg-gray-50"><button data-action="close" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cerrar</button></div></div></div>`;
    
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();
    document.getElementById('details-modal').addEventListener('click', e => {
        if (e.target.closest('button')?.dataset.action === 'close') document.getElementById('details-modal').remove();
    });
}

async function openAssociationSearchModal(searchKey, onSelect) {
    const titleMap = {
        [COLLECTIONS.CLIENTES]: 'Buscar Cliente',
        [COLLECTIONS.SECTORES]: 'Buscar Sector',
        [COLLECTIONS.PROCESOS]: 'Buscar Proceso',
        [COLLECTIONS.PROVEEDORES]: 'Buscar Proveedor',
        [COLLECTIONS.UNIDADES]: 'Buscar Unidad'
    };
    const title = titleMap[searchKey] || 'Buscar';
    const modalId = `assoc-search-modal-${Date.now()}`;
    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col m-4 modal-content"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">${title}</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><div class="p-6"><input type="text" id="assoc-search-term" placeholder="Buscar..." class="w-full border-gray-300 rounded-md shadow-sm"></div><div id="assoc-search-results" class="p-6 border-t overflow-y-auto flex-1"></div></div></div>`;
    
    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);
    const searchInput = modalElement.querySelector('#assoc-search-term');
    const resultsContainer = modalElement.querySelector('#assoc-search-results');

    resultsContainer.innerHTML = '<p class="text-center py-8 text-slate-500">Cargando datos...</p>';

    try {
        const querySnapshot = await getDocs(collection(db, searchKey));
        const allData = querySnapshot.docs.map(doc => ({...doc.data(), docId: doc.id}));
        allData.sort((a,b) => (a.descripcion || '').localeCompare(b.descripcion || ''));

        const renderResults = (term = '') => {
            term = term.toLowerCase();
            const filteredData = allData.filter(item =>
                (item.id && item.id.toLowerCase().includes(term)) ||
                (item.descripcion && item.descripcion.toLowerCase().includes(term))
            );
            resultsContainer.innerHTML = filteredData.length === 0
                ? `<p class="text-gray-500 text-center py-8">No hay resultados.</p>`
                : `<div class="space-y-2">${filteredData.map(item => `<button data-item-id="${item.id}" class="w-full text-left p-3 bg-gray-50 hover:bg-blue-100 rounded-md border transition"><p class="font-semibold">${item.descripcion}</p><p class="text-sm text-gray-500">${item.id}</p></button>`).join('')}</div>`;
        };

        searchInput.addEventListener('input', () => renderResults(searchInput.value));
        resultsContainer.addEventListener('click', e => {
            const button = e.target.closest('button[data-item-id]');
            if (button) {
                const selectedItem = allData.find(d => d.id === button.dataset.itemId);
                onSelect(selectedItem);
                modalElement.remove();
            }
        });

        renderResults(); // Initial render
    } catch (error) {
        console.error(`Error fetching data for ${searchKey}:`, error);
        resultsContainer.innerHTML = `<p class="text-red-500 text-center py-8">Error al cargar los datos.</p>`;
        showToast('Error al cargar datos de búsqueda.', 'error');
    }

    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
}


async function guardarEstructura(button) {
    if (!appState.arbolActivo || !button) return;
    const originalText = button.innerHTML;
    button.innerHTML = `<i data-lucide="loader" class="h-5 w-5 animate-spin"></i><span>Guardando...</span>`;
    lucide.createIcons();
    button.disabled = true;
    try {
        // Ahora, appState.arbolActivo.docId es el ID del documento en la colección 'productos'.
        const productoRef = doc(db, COLLECTIONS.PRODUCTOS, appState.arbolActivo.docId);

        // Generate the flattened list of component IDs for efficient querying
        const componentIds = flattenEstructura(appState.arbolActivo.estructura);

        await updateDoc(productoRef, {
            estructura: appState.arbolActivo.estructura,
            component_ids: componentIds, // Save the flattened list
            lastUpdated: new Date(),
            lastUpdatedBy: appState.currentUser.name
        });
        
        button.innerHTML = `<i data-lucide="check" class="h-5 w-5"></i><span>¡Guardado!</span>`;
        button.classList.remove('bg-blue-600', 'hover:bg-blue-700');
        button.classList.add('bg-green-600');
        lucide.createIcons();

        setTimeout(() => {
            button.innerHTML = originalText;
            button.classList.add('bg-blue-600', 'hover:bg-blue-700');
            button.classList.remove('bg-green-600');
            button.disabled = false;
            appState.arbolActivo = null; // Limpiamos el estado del árbol activo.
            renderArbolesInitialView(); // Volvemos a la pantalla de selección.
        }, 2000);
    } catch (error) {
        console.error("Error guardando la estructura del producto:", error);
        showToast("Error al guardar la estructura del producto.", "error");
        button.innerHTML = originalText;
        button.disabled = false;
    }
}




function renderAdminUserList() {
    const users = appState.collections.usuarios || [];
    const tasks = appState.collections.tareas || [];
    const adminId = appState.currentUser.uid;

    const userTaskStats = users
        .filter(user => user.docId !== adminId)
        .map(user => {
            const userTasks = tasks.filter(task => task.assigneeUid === user.docId);
            return {
                ...user,
                stats: {
                    todo: userTasks.filter(t => t.status === 'todo').length,
                    inprogress: userTasks.filter(t => t.status === 'inprogress').length,
                    done: userTasks.filter(t => t.status === 'done').length
                }
            };
        });

    let content = `
        <div class="bg-white p-6 rounded-xl shadow-lg animate-fade-in-up">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-2xl font-bold">Supervisión de Tareas de Usuarios</h3>
                <button data-action="admin-back-to-board" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Volver al Tablero</button>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    `;

    if (userTaskStats.length === 0) {
        content += `<p class="text-slate-500 col-span-full text-center py-12">No hay otros usuarios para supervisar.</p>`;
    } else {
        userTaskStats.forEach(user => {
            content += `
            <div class="border rounded-lg p-4 hover:shadow-md transition-shadow animate-fade-in-up">
                    <div class="flex items-center space-x-4">
                        <img src="${user.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(user.name || user.email)}`}" alt="Avatar" class="w-12 h-12 rounded-full">
                        <div>
                            <p class="font-bold text-slate-800">${user.name || user.email}</p>
                            <p class="text-sm text-slate-500">${user.email}</p>
                        </div>
                    </div>
                    <div class="mt-4 flex justify-around text-center">
                        <div>
                            <p class="text-2xl font-bold text-yellow-600">${user.stats.todo}</p>
                            <p class="text-xs text-slate-500">Por Hacer</p>
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-blue-600">${user.stats.inprogress}</p>
                            <p class="text-xs text-slate-500">En Progreso</p>
                        </div>
                        <div>
                            <p class="text-2xl font-bold text-green-600">${user.stats.done}</p>
                            <p class="text-xs text-slate-500">Completadas</p>
                        </div>
                    </div>
                    <div class="mt-4 flex gap-2">
                        <button data-action="view-user-tasks" data-user-id="${user.docId}" class="flex-1 bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Ver Tareas</button>
                        <button data-action="assign-task-to-user" data-user-id="${user.docId}" class="flex-1 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-semibold">Asignar Tarea</button>
                    </div>
                </div>
            `;
        });
    }

    content += `</div></div>`;

    dom.viewContent.innerHTML = content;
    lucide.createIcons();
}

function setupTaskFilters() {
    const filterContainer = document.getElementById('task-filters');
    filterContainer.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (button && button.dataset.filter) {
            taskState.activeFilter = button.dataset.filter;
            renderTaskFilters();
            fetchAndRenderTasks();
        }
    });
}

function renderTaskFilters() {
    const filters = [
        { key: 'engineering', label: 'Ingeniería' },
        { key: 'personal', label: 'Mis Tareas' }
    ];
    if (appState.currentUser.role === 'admin') {
        filters.push({ key: 'all', label: 'Todas' });
    }
    const filterContainer = document.getElementById('task-filters');
    filterContainer.innerHTML = filters.map(f => `
        <button data-filter="${f.key}" class="px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${taskState.activeFilter === f.key ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600 hover:bg-slate-300/50'}">
            ${f.label}
        </button>
    `).join('');
}

function fetchAndRenderTasks() {
    // Clear previous listeners
    taskState.unsubscribers.forEach(unsub => unsub());
    taskState.unsubscribers = [];

    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const user = appState.currentUser;

    // Clear board before fetching and show loading indicator
    document.querySelectorAll('.task-list').forEach(list => list.innerHTML = `<div class="p-8 text-center text-slate-500"><i data-lucide="loader" class="h-8 w-8 animate-spin mx-auto"></i><p class="mt-2">Cargando tareas...</p></div>`);
    lucide.createIcons();

    const handleError = (error) => {
        console.error("Error fetching tasks: ", error);
        let message = "Error al cargar las tareas.";
        if (error.code === 'failed-precondition') {
            message = "Error: Faltan índices en Firestore. Revise la consola para crear el índice necesario.";
        }
        showToast(message, "error", 5000);
        document.querySelectorAll('.task-list').forEach(list => list.innerHTML = `<div class="p-8 text-center text-red-500"><i data-lucide="alert-triangle" class="h-8 w-8 mx-auto"></i><p class="mt-2">Error al cargar.</p></div>`);
        lucide.createIcons();
    };

    let queryConstraints = [orderBy('createdAt', 'desc')];

    // Add base filter (personal, engineering, all)
    if (taskState.selectedUserId) {
        queryConstraints.unshift(where('assigneeUid', '==', taskState.selectedUserId));
    } else if (taskState.activeFilter === 'personal') {
        queryConstraints.unshift(or(
            where('assigneeUid', '==', user.uid),
            where('creatorUid', '==', user.uid)
        ));
    } else if (taskState.activeFilter === 'engineering') {
        queryConstraints.unshift(where('isPublic', '==', true));
    } else if (taskState.activeFilter !== 'all' || user.role !== 'admin') {
        // For admin 'all' view, no additional filter is needed.
        // For non-admin, default to public tasks if no other filter matches.
        if (taskState.activeFilter !== 'all') {
            queryConstraints.unshift(where('isPublic', '==', true));
        }
    }

    // Add priority filter
    if (taskState.priorityFilter !== 'all') {
        queryConstraints.unshift(where('priority', '==', taskState.priorityFilter));
    }

    const q = query(tasksRef, ...queryConstraints);

    const unsub = onSnapshot(q, (snapshot) => {
        let tasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

        // Apply client-side text search
        if (taskState.searchTerm) {
            tasks = tasks.filter(task =>
                task.title.toLowerCase().includes(taskState.searchTerm) ||
                (task.description && task.description.toLowerCase().includes(taskState.searchTerm))
            );
        }

        // Defer rendering to prevent race conditions as per AGENTS.md Lesson #6
        setTimeout(() => renderTasks(tasks), 0);
    }, handleError);

    taskState.unsubscribers.push(unsub);
}

function renderTasks(tasks) {
    const getEmptyColumnHTML = (status) => {
        const statusMap = { todo: 'Por Hacer', inprogress: 'En Progreso', done: 'Completada' };
        return `
            <div class="p-4 text-center text-slate-500 border-2 border-dashed border-slate-200 rounded-lg h-full flex flex-col justify-center items-center no-drag animate-fade-in">
                <i data-lucide="inbox" class="h-10 w-10 mx-auto text-slate-400"></i>
                <h4 class="mt-4 font-semibold text-slate-600">Columna Vacía</h4>
                <p class="text-sm mt-1 mb-4">No hay tareas en estado "${statusMap[status]}".</p>
                <button data-action="add-task-to-column" data-status="${status}" class="bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm py-1.5 px-3 rounded-full mx-auto flex items-center">
                    <i data-lucide="plus" class="mr-1.5 h-4 w-4"></i>Añadir Tarea
                </button>
            </div>
        `;
    };

    const tasksByStatus = { todo: [], inprogress: [], done: [] };
    tasks.forEach(task => {
        tasksByStatus[task.status || 'todo'].push(task);
    });

    document.querySelectorAll('.task-column').forEach(columnEl => {
        const status = columnEl.dataset.status;
        const taskListEl = columnEl.querySelector('.task-list');
        const columnTasks = tasksByStatus[status];

        if (columnTasks.length === 0) {
            taskListEl.innerHTML = getEmptyColumnHTML(status);
        } else {
            taskListEl.innerHTML = '';
            columnTasks.forEach(task => {
                const taskCardHTML = createTaskCard(task);
                const template = document.createElement('template');
                template.innerHTML = taskCardHTML.trim();
                const cardNode = template.content.firstChild;
                cardNode.addEventListener('click', (e) => {
                    if (e.target.closest('.task-actions')) return;
                    openTaskFormModal(task);
                });
                taskListEl.appendChild(cardNode);
            });
        }
    });

    initTasksSortable();
    lucide.createIcons();
}

function createTaskCard(task) {
    const assignee = (appState.collections.usuarios || []).find(u => u.docId === task.assigneeUid);
    const priorities = {
        low: { label: 'Baja', color: 'bg-gray-200 text-gray-800' },
        medium: { label: 'Media', color: 'bg-yellow-200 text-yellow-800' },
        high: { label: 'Alta', color: 'bg-red-200 text-red-800' }
    };
    const priority = priorities[task.priority] || priorities.medium;

    const dueDate = task.dueDate ? new Date(task.dueDate + "T00:00:00") : null;
    const today = new Date();
    today.setHours(0,0,0,0);
    const isOverdue = dueDate && dueDate < today;
    const dueDateStr = dueDate ? dueDate.toLocaleDateString('es-AR') : 'Sin fecha';
    const urgencyClass = isOverdue ? 'border-red-400 bg-red-50/50' : 'border-slate-200';
    const dateClass = isOverdue ? 'text-red-600 font-bold' : 'text-slate-500';

    const creationDate = task.createdAt?.seconds ? new Date(task.createdAt.seconds * 1000) : null;
    const creationDateStr = creationDate ? creationDate.toLocaleDateString('es-AR') : 'N/A';

    const taskTypeIcon = task.isPublic
        ? `<span title="Tarea de Ingeniería (Pública)"><i data-lucide="briefcase" class="w-4 h-4 text-slate-400"></i></span>`
        : `<span title="Tarea Privada"><i data-lucide="lock" class="w-4 h-4 text-slate-400"></i></span>`;

    // --- AUDITORÍA: Verificación de Sub-tareas y Barra de Progreso ---
    // La lógica de sub-tareas y su barra de progreso se ha verificado como correcta.
    // 1. `openTaskFormModal` permite añadir, eliminar y marcar sub-tareas como completadas.
    //    Estos cambios se gestionan en el estado local del modal y se guardan con la tarea.
    // 2. La siguiente lógica calcula correctamente el porcentaje de sub-tareas completadas.
    // 3. El `div` con la clase `bg-blue-600` se actualiza con el `width` correspondiente
    //    a este porcentaje, reflejando el progreso visualmente.
    //
    // RESULTADO: CORRECTO. Todos los campos del formulario, incluyendo sub-tareas
    // y su progreso, se reflejan correctamente en la tarjeta de la tarea.
    // -------------------------------------------------------------------------
    let subtaskProgressHTML = '';
    if (task.subtasks && task.subtasks.length > 0) {
        const totalSubtasks = task.subtasks.length;
        const completedSubtasks = task.subtasks.filter(st => st.completed).length;
        const progressPercentage = totalSubtasks > 0 ? (completedSubtasks / totalSubtasks) * 100 : 0;

        subtaskProgressHTML = `
            <div class="mt-3">
                <div class="flex justify-between items-center mb-1">
                    <span class="text-xs font-semibold text-slate-500 flex items-center">
                        <i data-lucide="check-square" class="w-3.5 h-3.5 mr-1.5"></i>
                        Sub-tareas
                    </span>
                    <span class="text-xs font-bold text-slate-600">${completedSubtasks} / ${totalSubtasks}</span>
                </div>
                <div class="w-full bg-slate-200 rounded-full h-1.5">
                    <div class="bg-blue-600 h-1.5 rounded-full transition-all duration-500" style="width: ${progressPercentage}%"></div>
                </div>
            </div>
        `;
    }
    const dragClass = checkUserPermission('edit', task) ? '' : 'no-drag';

    return `
        <div class="task-card bg-white rounded-lg p-4 shadow-sm border ${urgencyClass} cursor-pointer hover:shadow-md hover:border-blue-400 animate-fade-in-up flex flex-col gap-3 ${dragClass} transition-transform transform hover:-translate-y-1" data-task-id="${task.docId}">
            <div class="flex justify-between items-start gap-2">
                <h4 class="font-bold text-slate-800 flex-grow">${task.title}</h4>
                ${taskTypeIcon}
            </div>

            <p class="text-sm text-slate-600 break-words flex-grow">${task.description || ''}</p>

            ${subtaskProgressHTML}

            <div class="mt-auto pt-3 border-t border-slate-200/80 space-y-3">
                <div class="flex justify-between items-center text-xs text-slate-500">
                    <span class="px-2 py-0.5 rounded-full font-semibold ${priority.color}">${priority.label}</span>
                    <div class="flex items-center gap-3">
                        <span class="flex items-center gap-1.5 font-medium" title="Fecha de creación">
                            <i data-lucide="calendar-plus" class="w-3.5 h-3.5"></i> ${creationDateStr}
                        </span>
                        <span class="flex items-center gap-1.5 font-medium ${dateClass}" title="Fecha de entrega">
                            <i data-lucide="calendar-check" class="w-3.5 h-3.5"></i> ${dueDateStr}
                        </span>
                    </div>
                </div>

                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        ${assignee ? `<img src="${assignee.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(assignee.name || assignee.email)}`}" title="Asignada a: ${assignee.name || assignee.email}" class="w-6 h-6 rounded-full">` : '<div class="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center" title="No asignada"><i data-lucide="user-x" class="w-4 h-4 text-gray-500"></i></div>'}
                        <span class="text-sm text-slate-500">${assignee ? (assignee.name || assignee.email.split('@')[0]) : 'No asignada'}</span>
                    </div>
                    <div class="task-actions">
                    ${checkUserPermission('delete', task) ? `
                        <button data-action="delete-task" data-doc-id="${task.docId}" class="text-gray-400 hover:text-red-600 p-1 rounded-full" title="Eliminar tarea">
                            <i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i>
                        </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function renderSubtask(subtask) {
    const titleClass = subtask.completed ? 'line-through text-slate-500' : 'text-slate-800';
    const containerClass = subtask.completed ? 'opacity-70' : '';
    const checkboxId = `subtask-checkbox-${subtask.id}`;
    return `
        <div class="subtask-item group flex items-center gap-3 p-2 bg-slate-100 hover:bg-slate-200/70 rounded-md transition-all duration-150 ${containerClass}" data-subtask-id="${subtask.id}">
            <label for="${checkboxId}" class="flex-grow flex items-center gap-3 cursor-pointer">
                <input type="checkbox" id="${checkboxId}" name="${checkboxId}" class="subtask-checkbox h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer" ${subtask.completed ? 'checked' : ''}>
                <span class="flex-grow text-sm font-medium ${titleClass}">${subtask.title}</span>
            </label>
            <button type="button" class="subtask-delete-btn text-slate-400 hover:text-red-500 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
        </div>
    `;
}

// This function was removed as it is a duplicate and now lives in task.kanban.js

async function openTaskFormModal(task = null, defaultStatus = 'todo', defaultAssigneeUid = null, defaultDate = null) {
    const isEditing = task !== null;

    // Determine the UID to be pre-selected in the dropdown.
    let selectedUid = defaultAssigneeUid || ''; // Prioritize passed-in UID
    if (!selectedUid) { // If no default is provided, use existing logic
        if (isEditing && task.assigneeUid) {
            selectedUid = task.assigneeUid;
        } else if (!isEditing && taskState.activeFilter === 'personal') {
            // When creating a new personal task, assign it to self by default
            selectedUid = appState.currentUser.uid;
        }
    }

    const modalHTML = `
    <div id="task-form-modal" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4 modal-content">
            <div class="flex justify-between items-center p-5 border-b">
                <h3 class="text-xl font-bold">${isEditing ? 'Editar' : 'Nueva'} Tarea</h3>
                <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
            </div>
            <form id="task-form" class="p-6 overflow-y-auto" novalidate>
                <!-- Using simple block layout with margin -->
                <div class="space-y-6">
                    <input type="hidden" name="taskId" value="${isEditing ? task.docId : ''}">
                    <input type="hidden" name="status" value="${isEditing ? task.status : defaultStatus}">

                    <div>
                        <label for="task-title" class="block text-sm font-medium text-gray-700 mb-1">Título</label>
                        <input type="text" id="task-title" name="title" value="${isEditing && task.title ? task.title : ''}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required>
                    </div>

                    <div>
                        <label for="task-description" class="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
                        <textarea id="task-description" name="description" rows="4" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">${isEditing && task.description ? task.description : ''}</textarea>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label for="task-assignee" class="block text-sm font-medium text-gray-700 mb-1">Asignar a</label>
                            <select id="task-assignee" name="assigneeUid" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" data-selected-uid="${selectedUid}">
                                <option value="">Cargando...</option>
                            </select>
                        </div>
                        <div>
                            <label for="task-priority" class="block text-sm font-medium text-gray-700 mb-1">Prioridad</label>
                            <select id="task-priority" name="priority" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                                <option value="low" ${isEditing && task.priority === 'low' ? 'selected' : ''}>Baja</option>
                                <option value="medium" ${!isEditing || (isEditing && task.priority === 'medium') ? 'selected' : ''}>Media</option>
                                <option value="high" ${isEditing && task.priority === 'high' ? 'selected' : ''}>Alta</option>
                            </select>
                        </div>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label for="task-startdate" class="block text-sm font-medium text-gray-700 mb-1">Fecha de Inicio</label>
                            <input type="date" id="task-startdate" name="startDate" value="${isEditing && task.startDate ? task.startDate : (defaultDate || '')}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                        </div>
                        <div>
                            <label for="task-duedate" class="block text-sm font-medium text-gray-700 mb-1">Fecha Límite</label>
                            <input type="date" id="task-duedate" name="dueDate" value="${isEditing && task.dueDate ? task.dueDate : (defaultDate || '')}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                        </div>
                    </div>

                    <!-- Subtasks -->
                    <div class="space-y-2 pt-2">
                        <label class="block text-sm font-medium text-gray-700">Sub-tareas</label>
                        <div id="subtasks-list" class="space-y-2 max-h-48 overflow-y-auto p-2 rounded-md bg-slate-50 border"></div>
                        <div class="flex items-center gap-2">
                            <label for="new-subtask-title" class="sr-only">Añadir sub-tarea</label>
                            <input type="text" id="new-subtask-title" name="new-subtask-title" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Añadir sub-tarea y presionar Enter">
                        </div>
                    </div>

                    <!-- Comments -->
                    <div class="space-y-2 pt-4 border-t mt-4">
                        <label class="block text-sm font-medium text-gray-700">Comentarios</label>
                        <div id="task-comments-list" class="space-y-3 max-h-60 overflow-y-auto p-3 rounded-md bg-slate-50 border custom-scrollbar">
                            <p class="text-xs text-center text-slate-400 py-2">Cargando comentarios...</p>
                        </div>
                        <div class="flex items-start gap-2">
                            <textarea id="new-task-comment" placeholder="Escribe un comentario..." rows="2" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"></textarea>
                            <button type="button" id="post-comment-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold h-full">
                                <i data-lucide="send" class="w-5 h-5"></i>
                            </button>
                        </div>
                    </div>

                    ${appState.currentUser.role === 'admin' ? `
                    <div class="pt-2">
                        <label class="flex items-center space-x-3 cursor-pointer">
                            <input type="checkbox" id="task-is-public" name="isPublic" class="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" ${isEditing && task.isPublic ? 'checked' : ''}>
                            <span class="text-sm font-medium text-gray-700">Tarea Pública (Visible para todos en Ingeniería)</span>
                        </label>
                    </div>
                    ` : ''}
                </div>
            </form>
            <div class="flex justify-end items-center p-4 border-t bg-gray-50 space-x-3">
                ${isEditing ? `<button data-action="delete" class="text-red-600 font-semibold mr-auto px-4 py-2 rounded-md hover:bg-red-50">Eliminar Tarea</button>` : ''}
                <button data-action="close" type="button" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                <button type="submit" form="task-form" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Tarea</button>
            </div>
        </div>
    </div>
    `;
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();

    const modalElement = document.getElementById('task-form-modal');

    // Ensure users are loaded before populating the dropdown
    ensureCollectionsAreLoaded([COLLECTIONS.USUARIOS])
        .then(() => {
            populateTaskAssigneeDropdown();
        })
        .catch(error => {
            console.error("Failed to load users for task form:", error);
            showToast('Error al cargar la lista de usuarios.', 'error');
            const select = modalElement.querySelector('#task-assignee');
            if (select) {
                select.innerHTML = '<option value="">Error al cargar</option>';
                select.disabled = true;
            }
        });
    const subtaskListEl = modalElement.querySelector('#subtasks-list');
    const newSubtaskInput = modalElement.querySelector('#new-subtask-title');

    let currentSubtasks = isEditing && task.subtasks ? [...task.subtasks] : [];

    const rerenderSubtasks = () => {
        subtaskListEl.innerHTML = currentSubtasks.map(renderSubtask).join('') || '<p class="text-xs text-center text-slate-400 py-2">No hay sub-tareas.</p>';
        modalElement.dataset.subtasks = JSON.stringify(currentSubtasks);
        lucide.createIcons();
    };

    newSubtaskInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const title = newSubtaskInput.value.trim();
            if (title) {
                currentSubtasks.push({
                    id: `sub_${Date.now()}`,
                    title: title,
                    completed: false
                });
                newSubtaskInput.value = '';
                rerenderSubtasks();
            }
        }
    });

    subtaskListEl.addEventListener('click', e => {
        const subtaskItem = e.target.closest('.subtask-item');
        if (!subtaskItem) return;

        const subtaskId = subtaskItem.dataset.subtaskId;
        const subtask = currentSubtasks.find(st => st.id === subtaskId);

        if (e.target.matches('.subtask-checkbox')) {
            if (subtask) {
                subtask.completed = e.target.checked;
                rerenderSubtasks();
            }
        }

        if (e.target.closest('.subtask-delete-btn')) {
            if (subtask) {
                currentSubtasks = currentSubtasks.filter(st => st.id !== subtaskId);
                rerenderSubtasks();
            }
        }
    });

    rerenderSubtasks(); // Initial render

    // --- Comments Logic ---
    const commentsListEl = modalElement.querySelector('#task-comments-list');
    const newCommentInput = modalElement.querySelector('#new-task-comment');
    const postCommentBtn = modalElement.querySelector('#post-comment-btn');
    let commentsUnsubscribe = null;

    const renderTaskComments = (comments) => {
        if (!commentsListEl) return;
        if (comments.length === 0) {
            commentsListEl.innerHTML = '<p class="text-xs text-center text-slate-400 py-2">No hay comentarios todavía.</p>';
            return;
        }
        commentsListEl.innerHTML = comments.map(comment => {
            const author = (appState.collections.usuarios || []).find(u => u.docId === comment.creatorUid) || { name: 'Usuario Desconocido', photoURL: '' };
            const timestamp = comment.createdAt?.toDate ? formatTimeAgo(comment.createdAt.toDate()) : 'hace un momento';
            return `
                <div class="flex items-start gap-3">
                    <img src="${author.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(author.name)}`}" alt="Avatar" class="w-8 h-8 rounded-full mt-1">
                    <div class="flex-1 bg-white p-3 rounded-lg border">
                        <div class="flex justify-between items-center">
                            <p class="font-bold text-sm text-slate-800">${author.name}</p>
                            <p class="text-xs text-slate-400">${timestamp}</p>
                        </div>
                        <p class="text-sm text-slate-600 mt-1 whitespace-pre-wrap">${comment.text}</p>
                    </div>
                </div>
            `;
        }).join('');
        lucide.createIcons();
        // Scroll to the bottom of the comments list
        commentsListEl.scrollTop = commentsListEl.scrollHeight;
    };

    if (isEditing) {
        postCommentBtn.disabled = false;
        newCommentInput.disabled = false;
        const commentsRef = collection(db, 'tareas', task.docId, 'comments');
        const q = query(commentsRef, orderBy('createdAt', 'asc'));
        commentsUnsubscribe = onSnapshot(q, (snapshot) => {
            const comments = snapshot.docs.map(doc => doc.data());
            renderTaskComments(comments);
        });
    } else {
        renderTaskComments([]); // Show "No hay comentarios" for new tasks
        postCommentBtn.disabled = true;
        newCommentInput.disabled = true;
        newCommentInput.placeholder = 'Guarde la tarea para poder añadir comentarios.';
    }

    const postComment = async () => {
        const text = newCommentInput.value.trim();
        if (!text || !isEditing) return;

        postCommentBtn.disabled = true;
        const commentsRef = collection(db, 'tareas', task.docId, 'comments');
        try {
            await addDoc(commentsRef, {
                text: text,
                creatorUid: appState.currentUser.uid,
                createdAt: new Date()
            });
            newCommentInput.value = '';
        } catch (error) {
            console.error("Error posting comment: ", error);
            showToast('Error al publicar el comentario.', 'error');
        } finally {
            postCommentBtn.disabled = false;
        }
    };

    postCommentBtn.addEventListener('click', postComment);
    newCommentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            postComment();
        }
    });

    // Autofocus the title field for new tasks
    if (!isEditing) {
        modalElement.querySelector('#task-title').focus();
    }
    modalElement.querySelector('form').addEventListener('submit', handleTaskFormSubmit);

    modalElement.addEventListener('click', e => {
        const button = e.target.closest('button');
        if (!button) return;
        const action = button.dataset.action;
        if (action === 'close') {
            if (commentsUnsubscribe) {
                commentsUnsubscribe();
            }
            modalElement.remove();
        } else if (action === 'delete') {
            showConfirmationModal('Eliminar Tarea', '¿Estás seguro de que quieres eliminar esta tarea?', async () => {
                try {
                    if (commentsUnsubscribe) {
                        commentsUnsubscribe();
                    }
                    await deleteDoc(doc(db, COLLECTIONS.TAREAS, task.docId));
                    showToast('Tarea eliminada.', 'success');
                    modalElement.remove();
                } catch (error) {
                    showToast('No tienes permiso para eliminar esta tarea.', 'error');
                }
            });
        }
    });
}

// =================================================================================
// --- 8. LÓGICA DE ECR/ECO (MÁQUINA DE ESTADOS Y NOTIFICACIONES) ---
// =================================================================================

/**
 * Envía una notificación a un usuario.
 * Por ahora, usa 'showToast', pero está diseñado para ser extendido (ej: email).
 * @param {string} userId - El UID del usuario a notificar.
 * @param {string} message - El mensaje de la notificación.
 * @param {string} view - La vista a la que debe navegar el usuario al hacer clic.
 */
async function sendNotification(userId, message, view, params = {}) {
    if (!userId || !message || !view) {
        console.error('sendNotification called with invalid parameters:', { userId, message, view });
        return;
    }

    try {
        await addDoc(collection(db, COLLECTIONS.NOTIFICATIONS), {
            userId,
            message,
            view,
            params,
            createdAt: new Date(),
            isRead: false,
        });
    } catch (error) {
        console.error("Error sending notification:", error);
    }
}

/**
 * Registra la decisión de un departamento sobre un ECR y evalúa si el estado general del ECR debe cambiar.
 * @param {string} ecrId - El ID del ECR a modificar.
 * @param {string} departmentId - El ID del departamento que emite la decisión (ej: 'calidad').
 * @param {string} decision - La decisión tomada ('approved', 'rejected', 'stand-by').
 * @param {string} comment - Un comentario opcional sobre la decisión.
 */
async function handleTaskFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const taskId = form.querySelector('[name="taskId"]').value;
    const isEditing = !!taskId;

    const modalElement = form.closest('#task-form-modal');
    const data = {
        title: form.querySelector('[name="title"]').value,
        description: form.querySelector('[name="description"]').value,
        assigneeUid: form.querySelector('[name="assigneeUid"]').value,
        priority: form.querySelector('[name="priority"]').value,
        startDate: form.querySelector('[name="startDate"]').value,
        dueDate: form.querySelector('[name="dueDate"]').value,
        updatedAt: new Date(),
        subtasks: modalElement.dataset.subtasks ? JSON.parse(modalElement.dataset.subtasks) : []
    };

    if (!data.title) {
        showToast('El título es obligatorio.', 'error');
        return;
    }

    // --- AUDITORÍA: Verificación de visibilidad de tareas (Pública/Privada) ---
    // La siguiente lógica cumple con el requisito de la auditoría:
    // 1. Para usuarios no-administradores, la visibilidad se asigna automáticamente.
    //    - Si el filtro activo es 'engineering', la tarea se crea como PÚBLICA (`isPublic` = true).
    //    - Si el filtro es 'personal', la tarea se crea como PRIVADA (`isPublic` = false).
    // 2. Para administradores, se muestra un checkbox que les permite anular este comportamiento
    //    y elegir la visibilidad manualmente.
    //
    // RESULTADO: CORRECTO. El sistema asigna la visibilidad según el filtro activo.
    // -------------------------------------------------------------------------
    const isPublicCheckbox = form.querySelector('[name="isPublic"]');
    if (isPublicCheckbox) {
        data.isPublic = isPublicCheckbox.checked;
    } else if (!isEditing) {
        // Fallback for non-admins creating tasks.
        // When editing, non-admins won't see the checkbox, so the value remains unchanged.
        data.isPublic = taskState.activeFilter === 'engineering';
    }

    const saveButton = form.closest('.modal-content').querySelector('button[type="submit"]');
    const originalButtonHTML = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5"></i>`;
    lucide.createIcons();

    let success = false;
    try {
        if (isEditing) {
            const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
            await updateDoc(taskRef, data);
            showToast('Tarea actualizada con éxito.', 'success');
        } else {
            data.creatorUid = appState.currentUser.uid;
            data.createdAt = new Date();
            data.status = form.querySelector('[name="status"]').value || 'todo';
            await addDoc(collection(db, COLLECTIONS.TAREAS), data);
            showToast('Tarea creada con éxito.', 'success');
        }
        success = true;
        document.getElementById('task-form-modal').remove();
    } catch (error) {
        console.error('Error saving task:', error);
        showToast('Error al guardar la tarea.', 'error');
    } finally {
        if (!success) {
            saveButton.disabled = false;
            saveButton.innerHTML = originalButtonHTML;
        }
    }
}

// --- AUDITORÍA: Verificación de asignación de tareas ---
// La lógica para asignar tareas a usuarios se ha verificado como correcta.
// 1. `openTaskFormModal` prepara el dropdown `task-assignee`.
// 2. `populateTaskAssigneeDropdown` (abajo) lo llena con la lista de usuarios activos.
// 3. `handleTaskFormSubmit` recoge el `assigneeUid` seleccionado y lo guarda en Firestore.
// 4. `createTaskCard` muestra correctamente el avatar y nombre del usuario asignado.
//
// RESULTADO: CORRECTO. El campo de asignación funciona y se refleja en la tarjeta.
// -------------------------------------------------------------------------
function populateTaskAssigneeDropdown() {
    const select = document.getElementById('task-assignee');
    if (!select) return; // Modal is not open

    const users = appState.collections.usuarios || [];
    if (users.length === 0) {
        select.disabled = true; // Keep it disabled until users are loaded
        return;
    }

    select.disabled = false;
    const selectedUid = select.dataset.selectedUid;

    const userOptions = users
        .filter(u => u.disabled !== true)
        .map(u => {
            const displayName = u.name || u.email.split('@')[0];
            return `<option value="${u.docId}">${displayName}</option>`;
        }).join('');

    select.innerHTML = `<option value="">No asignada</option>${userOptions}`;

    if (selectedUid) {
        select.value = selectedUid;
    }
}


async function seedDefaultSectors() {
    const sectorsRef = collection(db, COLLECTIONS.SECTORES);
    const snapshot = await getDocs(query(sectorsRef, limit(1)));

    if (!snapshot.empty) {
        // Simple check to see if the new sectors are already there.
        // This is not foolproof but good enough for this seeding purpose.
        const firstDoc = snapshot.docs[0].data();
        if (firstDoc.id === 'calidad' && firstDoc.descripcion === 'Calidad') {
             // It seems the new sectors are already seeded.
            return;
        }
    }

    console.log("Seeding default sectors as per user request...");
    showToast('Creando sectores de la planta por defecto...', 'info');

    const defaultSectors = [
        { id: 'calidad', descripcion: 'Calidad', icon: 'award' },
        { id: 'comercial', descripcion: 'Comercial', icon: 'trending-up' },
        { id: 'compras', descripcion: 'Compras', icon: 'shopping-cart' },
        { id: 'planificacion', descripcion: 'Planificación de Producción', icon: 'calendar-clock' },
        { id: 'rrhh', descripcion: 'Recursos Humanos', icon: 'users' },
        { id: 'ingenieria', descripcion: 'Ingeniería', icon: 'pencil-ruler' },
        { id: 'produccion', descripcion: 'Producción', icon: 'factory' },
        { id: 'medio-ambiente', descripcion: 'Medio Ambiente', icon: 'leaf' },
        { id: 'logistica', descripcion: 'Logística', icon: 'truck' }
    ];

    const batch = writeBatch(db);
    defaultSectors.forEach(sector => {
        const docRef = doc(db, COLLECTIONS.SECTORES, sector.id);
        batch.set(docRef, sector);
    });

    try {
        await batch.commit();
        showToast('Sectores de la planta creados con éxito.', 'success');
        console.log('Default plant sectors created successfully.');
    } catch (error) {
        console.error("Error seeding default sectors:", error);
        showToast('Error al crear los sectores por defecto.', 'error');
    }
}

async function seedDefaultRoles() {
    const rolesRef = collection(db, COLLECTIONS.ROLES);
    const snapshot = await getDocs(query(rolesRef, limit(1)));

    if (!snapshot.empty) {
        return; // Roles already exist
    }

    console.log("No roles found. Seeding default roles...");
    showToast('Creando roles por defecto...', 'info');

    const defaultRoles = [
        { id: 'admin', descripcion: 'Administrador' },
        { id: 'editor', descripcion: 'Editor' },
        { id: 'lector', descripcion: 'Lector' }
    ];

    const batch = writeBatch(db);
    defaultRoles.forEach(role => {
        const docRef = doc(db, COLLECTIONS.ROLES, role.id);
        batch.set(docRef, role);
    });

    try {
        await batch.commit();
        showToast('Roles por defecto creados con éxito.', 'success');
        console.log('Default roles created successfully.');
    } catch (error) {
        console.error("Error seeding default roles:", error);
        showToast('Error al crear los roles por defecto.', 'error');
    }
}

async function seedMinimalTestDataForE2E() {
    console.log("TEST MODE: Seeding minimal data for E2E tests.");
    showToast('Modo de prueba E2E activado.', 'info');
    const batch = writeBatch(db);

    // 1. Create a mock user for the tests to use
    const user = {
        id: 'KTIQRzPBRcOFtBRjoFViZPSsbSq2', // Use a consistent, known UID
        name: 'Usuario de Prueba E2E',
        email: 'f.santoro@barackmercosul.com',
        role: 'admin',
        sector: 'ingenieria'
    };
    batch.set(doc(db, COLLECTIONS.USUARIOS, user.id), user);

    // 2. Create minimal required collections for UI rendering
    const roles = [{ id: 'admin', descripcion: 'Admin' }, { id: 'lector', descripcion: 'Lector' }];
    roles.forEach(r => batch.set(doc(db, COLLECTIONS.ROLES, r.id), r));

    const sectores = [{ id: 'ingenieria', descripcion: 'Ingeniería', icon: 'pencil-ruler' }];
    sectores.forEach(s => batch.set(doc(db, COLLECTIONS.SECTORES, s.id), s));

    // 3. Create just one ECR for the ECR table test
    const ecr = {
        id: 'ECR-TEST-001',
        ecr_no: 'ECR-TEST-001',
        status: 'approved',
        cliente: 'Cliente de Prueba',
        denominacion_producto: 'Componente de Prueba E2E',
        lastModified: new Date(),
        modifiedBy: user.email
    };
    batch.set(doc(db, COLLECTIONS.ECR_FORMS, ecr.id), ecr);

    // 4. Create one ECO for the corresponding test
    const eco = {
        id: 'ECO-TEST-001',
        ecr_no: 'ECR-TEST-001',
        status: 'in-progress',
        lastModified: new Date(),
        modifiedBy: user.email
    };
    batch.set(doc(db, COLLECTIONS.ECO_FORMS, eco.id), eco);

    try {
        await batch.commit();
        console.log("TEST MODE: Minimal data seeded successfully.");
    } catch (error) {
        console.error("TEST MODE: Failed to seed minimal data", error);
        showToast('Error al sembrar datos de prueba E2E.', 'error');
    }
}


onAuthStateChanged(auth, async (user) => {
    if (user) {
        const urlParams = new URLSearchParams(window.location.search);
        const isTestMode = urlParams.get('env') === 'test';

        // if (isTestMode && !window.e2eDataSeeded) {
        //     await seedMinimalTestDataForE2E();
        //     window.e2eDataSeeded = true;
        // }

        if (user.emailVerified || isTestMode) {
            const wasAlreadyLoggedIn = !!appState.currentUser;

            const loadingText = dom.loadingOverlay.querySelector('p');
            loadingText.textContent = wasAlreadyLoggedIn ? 'Recargando datos...' : 'Verificación exitosa, cargando datos...';
            dom.loadingOverlay.style.display = 'flex';

            const userDocRef = doc(db, COLLECTIONS.USUARIOS, user.uid);
            let userDocSnap = await getDoc(userDocRef);

            if (!userDocSnap.exists()) {
                showToast(`Creando perfil para usuario existente: ${user.email}`, 'info', 4000);
                const newUserDoc = {
                    id: user.uid,
                    name: user.displayName || user.email.split('@')[0],
                    email: user.email,
                    role: 'lector',
                    sector: 'Sin Asignar',
                    createdAt: new Date(),
                    photoURL: user.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(user.displayName || user.email)}`
                };
                await setDoc(userDocRef, newUserDoc);
                userDocSnap = await getDoc(userDocRef);
            }

            if (userDocSnap.exists() && userDocSnap.data().disabled) {
                await signOut(auth);
                dom.loadingOverlay.style.display = 'none';
                showToast('Tu cuenta ha sido deshabilitada por un administrador.', 'error', 5000);
                return;
            }

            const userData = userDocSnap.exists() ? userDocSnap.data() : {};

            if (user.email === 'f.santoro@barackmercosul.com' && userData.role !== 'admin') {
                showToast('Restaurando permisos de administrador...', 'info');
                await updateDoc(doc(db, COLLECTIONS.USUARIOS, user.uid), { role: 'admin', isSuperAdmin: true });
                location.reload();
                return;
            }

            appState.currentUser = {
                uid: user.uid,
                name: user.displayName || user.email.split('@')[0],
                email: user.email,
                avatarUrl: user.photoURL || `https://api.dicebear.com/8.x/identicon/svg?seed=${encodeURIComponent(user.displayName || user.email)}`,
                role: userData.role || 'lector',
                isSuperAdmin: userData.isSuperAdmin || user.uid === 'KTIQRzPBRcOFtBRjoFViZPSsbSq2',
                godModeState: (userData.isSuperAdmin || user.uid === 'KTIQRzPBRcOFtBRjoFViZPSsbSq2') ? { realRole: userData.role || 'admin', isImpersonating: false } : null
            };
            if(appState.currentUser.godModeState) {
                appState.godModeState = appState.currentUser.godModeState;
            }

            // Initialize modules that depend on appState and other core functions
            const appDependencies = { db, functions, appState, dom, showToast, showConfirmationModal, switchView: (view, params) => eventBus.emit('navigate', { view, params }), checkUserPermission, lucide, seedDatabase, clearDataOnly, clearOtherUsers };
            initSharedUI(appDependencies);
            initTasksModule(appDependencies);
            initLandingPageModule(appDependencies);
            initAdminModule({ db, firestore: { writeBatch, doc, getDocs, collection, setDoc, getDoc, query, where, limit, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, runTransaction, startAfter, or, getCountFromServer }, showToast, appState, updateNavForRole, renderUserMenu, switchView: (view, params) => eventBus.emit('navigate', { view, params }), lucide });
            initFirestoreHelpers({ db });


            if (!isTestMode) {
                if (appState.currentUser.isSuperAdmin) {
                    await seedDefaultSectors();
                    await seedDefaultRoles();
                }
                await startRealtimeListeners();
            } else {
                appState.isAppInitialized = true;
            }

            // This must happen BEFORE switchView to avoid UI flicker
            updateNavForRole();
            renderUserMenu();
            renderNotificationCenter();

            console.log("About to switch view to landing-page...");
            // This is the critical sequence: render the content, THEN hide the loading screen.
            await eventBus.emit('navigate', { view: 'landing-page' });
            console.log("navigate to 'landing-page' event emitted.");

            // FIX: Per AGENTS.md, defer UI updates to prevent race conditions with E2E tests.
            // A longer delay is used for E2E tests to ensure rendering completes before screenshotting.
            const urlParams = new URLSearchParams(window.location.search);
            const isE2ETest = urlParams.get('e2e-test') === 'true';
            const delay = isE2ETest ? 500 : 0;

            setTimeout(() => {
                dom.loadingOverlay.style.display = 'none';
                dom.authContainer.classList.add('hidden');
                dom.appView.classList.remove('hidden');

                // Path-based routing for /visor3d
                if (window.location.pathname === '/visor3d') {
                    eventBus.emit('navigate', { view: 'visor3d' });
                }

            }, delay);

            if (!wasAlreadyLoggedIn && !isTestMode) {
                showToast(`¡Bienvenido de nuevo, ${appState.currentUser.name}!`, 'success');
            }
        } else {
            dom.loadingOverlay.style.display = 'none';
            showToast('Por favor, verifica tu correo electrónico para continuar.', 'info');
            showAuthScreen('verify-email');
        }
    } else {
        // Add a small delay to prevent login screen flashing for authenticated users on refresh.
        // This gives onAuthStateChanged time to get the cached user.
        setTimeout(() => {
            // Re-check the auth state after the delay. If a user is found, do nothing.
            if (auth.currentUser) {
                return;
            }

            dom.loadingOverlay.style.display = 'none';
            const wasLoggedIn = !!appState.currentUser;
            stopRealtimeListeners();
            appState.currentUser = null;
            dom.authContainer.classList.remove('hidden');
            dom.appView.classList.add('hidden');
            updateNavForRole();
            showAuthScreen('login');
            if (wasLoggedIn) {
                showToast(`Sesión cerrada.`, 'info');
            }
        }, 200); // A 200ms delay is usually sufficient.
    }
});

// Functions moved to public/modules/shared/ui.js

document.addEventListener('DOMContentLoaded', () => {
    initAuthModule(auth, db);
    initializeAppListeners();
    lucide.createIcons();
});

// Expose for testing
if (window.location.protocol === 'file:') {
    window.runDashboardLogic = runDashboardLogic;
}

window.seedDatabase = seedDatabase;

function renderArbolesInitialView() {
    dom.viewContent.innerHTML = `<div class="flex flex-col items-center justify-center h-full bg-white rounded-xl shadow-lg p-6 text-center animate-fade-in-up"><i data-lucide="git-merge" class="h-24 w-24 text-gray-300 mb-6"></i><h3 class="text-2xl font-bold">Gestor de Árboles de Producto</h3><p class="text-gray-500 mt-2 mb-8 max-w-lg">Busque y seleccione el producto principal para cargar o crear su estructura de componentes.</p><button data-action="open-product-search-modal" class="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-lg font-semibold shadow-lg transition-transform transform hover:scale-105"><i data-lucide="search" class="inline-block mr-2 -mt-1"></i>Seleccionar Producto</button></div>`;
    lucide.createIcons();
}

function renderArbolDetalle(highlightNodeId = null) {
    const cliente = appState.collections[COLLECTIONS.CLIENTES].find(c => c.id === appState.arbolActivo.clienteId);
    let treeContentHTML = `<div id="tree-render-area" class="tree p-4 rounded-lg bg-gray-50 min-h-[200px]"></div>`;

    if(appState.arbolActivo.estructura[0]?.children.length === 0) {
        treeContentHTML += `<div class="text-center p-6 bg-blue-50 border-t border-blue-200 rounded-b-lg">
            <i data-lucide="mouse-pointer-click" class="h-10 w-10 mx-auto text-blue-400 mb-3"></i>
            <h4 class="font-semibold text-blue-800">¡Tu árbol está listo para crecer!</h4>
            <p class="text-sm text-blue-700">Comienza agregando componentes usando los botones de acción que aparecen al pasar el mouse sobre un nodo.</p>
        </div>`;
    }

    dom.viewContent.innerHTML = `<div class="bg-white rounded-xl shadow-md p-6 animate-fade-in-up"><div class="flex justify-between items-start mb-4 pb-4 border-b"><div><h3 class="text-2xl font-bold">${appState.arbolActivo.nombre}</h3><p class="text-sm text-gray-500">Cliente: <span class="font-semibold">${cliente?.descripcion || 'N/A'}</span></p></div><div class="flex space-x-2"><button data-action="volver-a-busqueda" class="bg-gray-500 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-600">Buscar Otro</button>${checkUserPermission('edit') ? `<button data-action="guardar-arbol" class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 flex items-center justify-center w-28 transition-all duration-300">Guardar</button>` : ''}</div></div>${treeContentHTML}</div>`;
    renderArbol(highlightNodeId);

    const treeArea = document.getElementById('tree-render-area');
    if (!treeArea) return;

    treeArea.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action], a[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        const nodeId = button.dataset.nodeId;

        switch(action) {
            case 'add-node':
                e.preventDefault();
                openComponentSearchModal(nodeId, button.dataset.childType);
                break;
            case 'delete-node':
                eliminarNodo(nodeId);
                break;
            case 'toggle-add-dropdown':
                const dropdownContainer = button.closest('.dropdown-container');
                const menu = dropdownContainer.querySelector('.dropdown-menu');
                document.querySelectorAll('#tree-render-area .dropdown-menu').forEach(otherMenu => {
                    if (otherMenu !== menu) otherMenu.classList.add('hidden');
                });
                menu.classList.toggle('hidden');
                break;
        }
    });

    // Delegated listeners for inline editing
    treeArea.addEventListener('blur', (e) => {
        if (e.target.matches('.node-attribute-editor')) {
            const nodeId = e.target.closest('li[data-node-id]').dataset.nodeId;
            const field = e.target.dataset.field;
            const value = e.target.textContent;

            const nodeToUpdate = findNode(nodeId, appState.arbolActivo.estructura);
            if (nodeToUpdate) {
                if (field === 'quantity') {
                    nodeToUpdate[field] = parseFloat(value) || 1;
                } else {
                    nodeToUpdate[field] = value;
                }
                showToast(`'${field}' actualizado. Guarde el árbol para conservar los cambios.`, 'info', 2000);
            }
        }
    }, true);

    treeArea.addEventListener('keydown', (e) => {
        if (e.target.matches('.node-attribute-editor')) {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.target.blur();
            } else if (e.key === 'Escape') {
                e.target.blur();
            }
        }
    }, true);


    lucide.createIcons();
}

function renderArbol(highlightNodeId = null) {
    const treeArea = document.getElementById('tree-render-area');
    if (!treeArea || !appState.arbolActivo) return;
    
    treeArea.innerHTML = '<ul>' + appState.arbolActivo.estructura.map(renderNodo).join('') + '</ul>';
    initSortable(treeArea);
    
    if(highlightNodeId) {
        const nodeElement = treeArea.querySelector(`li[data-node-id="${highlightNodeId}"] > .node-content`);
        if(nodeElement) {
            nodeElement.classList.add('highlight-new-node');
            nodeElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    lucide.createIcons();
}

export function renderNodo(nodo, checkPermissionFunc = checkUserPermission) {
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

    const nodeActions = `
        <div class="node-actions absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/50 backdrop-blur-sm rounded-full p-1 border border-slate-200 shadow-sm">
            ${addActionsDropdown}
            ${deleteButton}
        </div>
    `;

    const isDraggable = nodo.tipo !== 'producto';
    const canEdit = checkUserPermission('edit');

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
                ${(addableChildrenTypes.length > 0 && nodo.children) ? `<ul class="node-children-list pl-6">${nodo.children.map(renderNodo).join('')}</ul>` : ''}
            </li>`;
}

function initSortable(treeArea) {
    if (!checkUserPermission('edit')) {
        return; // Desactiva el drag and drop para no-administradores
    }
    const lists = treeArea.querySelectorAll('ul');
    lists.forEach(list => {
        if (list.sortable) list.sortable.destroy();

        new Sortable(list, {
            group: 'nested',
            animation: 150,
            fallbackOnBody: true,
            swapThreshold: 0.65,
            ghostClass: 'sortable-ghost',
            dragClass: 'sortable-drag',
            onStart: (evt) => {
                // Add class to all potential drop targets
                treeArea.querySelectorAll('ul').forEach(l => l.classList.add('sortable-drag-over'));
            },
            onEnd: (evt) => {
                // Clean up drop target styles
                treeArea.querySelectorAll('ul').forEach(l => l.classList.remove('sortable-drag-over'));
                handleDropEvent(evt);
            }
        });
    });
}


async function openProductSearchModal() {
    try {
        await ensureCollectionsAreLoaded([COLLECTIONS.CLIENTES, COLLECTIONS.PRODUCTOS]);
    } catch (error) {
        showToast('Error al cargar datos para la búsqueda. Intente de nuevo.', 'error');
        return;
    }

    let clientOptions = '<option value="">Todos</option>' + appState.collections[COLLECTIONS.CLIENTES].map(c => `<option value="${c.id}">${c.descripcion}</option>`).join('');
    const modalId = `prod-search-modal-${Date.now()}`;
    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4 modal-content"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">Buscar Producto Principal</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4"><div><label for="search-prod-term" class="block text-sm font-medium">Código/Descripción</label><input type="text" id="search-prod-term" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm"></div><div><label for="search-prod-client" class="block text-sm font-medium">Cliente</label><select id="search-prod-client" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">${clientOptions}</select></div></div><div id="search-prod-results" class="p-6 border-t overflow-y-auto flex-1"></div></div></div>`;
    dom.modalContainer.innerHTML = modalHTML;
    const modalElement = document.getElementById(modalId);
    const termInput = modalElement.querySelector('#search-prod-term');
    const clientSelect = modalElement.querySelector('#search-prod-client');
    const resultsContainer = modalElement.querySelector('#search-prod-results');
    const searchHandler = () => handleProductSearchInTree(termInput.value, clientSelect.value, resultsContainer);
    termInput.addEventListener('input', searchHandler);
    clientSelect.addEventListener('change', searchHandler);
    resultsContainer.addEventListener('click', e => {
        const button = e.target.closest('button[data-product-id]');
        if (button) { handleProductSelect(button.dataset.productId); modalElement.remove(); }
    });
    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
    searchHandler();
}

function handleProductSearchInTree(term, clientId, resultsContainer) {
    term = term.toLowerCase();
    let results = appState.collections[COLLECTIONS.PRODUCTOS].filter(p => (term === '' || p.id.toLowerCase().includes(term) || p.descripcion.toLowerCase().includes(term)) && (!clientId || p.clienteId === clientId));
    resultsContainer.innerHTML = results.length === 0 ? `<p class="text-center py-8">No se encontraron productos.</p>` : `<div class="space-y-1">${results.map(p => `<button data-product-id="${p.id}" class="w-full text-left p-2.5 bg-gray-50 hover:bg-blue-100 rounded-md border flex justify-between items-center"><p class="font-semibold text-blue-800">${p.descripcion} (${p.id})</p><p class="text-xs text-gray-500">${appState.collections[COLLECTIONS.CLIENTES].find(c => c.id === p.clienteId)?.descripcion || ''}</p></button>`).join('')}</div>`;
}

function openComponentSearchModal(padreId, tipoHijo) {
    const dataKey = tipoHijo === 'semiterminado' ? COLLECTIONS.SEMITERMINADOS : COLLECTIONS.INSUMOS;
    const modalId = `comp-search-modal-${Date.now()}`;
    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col m-4 modal-content"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">Seleccionar ${tipoHijo}</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><div class="p-6"><input type="text" id="search-comp-term" placeholder="Buscar..." class="w-full border-gray-300 rounded-md shadow-sm"></div><div id="search-comp-results" class="p-6 border-t overflow-y-auto flex-1"></div></div></div>`;
    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    const modalElement = document.getElementById(modalId);
    const searchInput = modalElement.querySelector('#search-comp-term');
    const resultsContainer = modalElement.querySelector('#search-comp-results');
    const searchHandler = () => renderComponentSearchResults(dataKey, searchInput.value, resultsContainer);
    searchInput.addEventListener('input', searchHandler);
    resultsContainer.addEventListener('click', e => {
        const button = e.target.closest('button[data-item-id]');
        if (button) { handleComponentSelect(padreId, button.dataset.itemId, button.dataset.itemType); modalElement.remove(); }
    });
    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
    searchHandler();
}

function renderComponentSearchResults(dataKey, term, resultsContainer) {
    term = term.toLowerCase();
    let results = appState.collections[dataKey].filter(item => Object.values(item).some(value => String(value).toLowerCase().includes(term)));
    resultsContainer.innerHTML = results.length === 0 ? `<p class="text-center py-8">No hay resultados.</p>` : `<div class="space-y-2">${results.map(item => `<button data-item-id="${item.id}" data-item-type="${dataKey.slice(0, -1)}" class="w-full text-left p-3 bg-gray-50 hover:bg-blue-100 rounded-md border"><p class="font-semibold">${item.descripcion}</p><p class="text-sm text-gray-500">${item.id}</p></button>`).join('')}</div>`;
}

// =================================================================================
// --- FUNCIONES DE MANIPULACIÓN DEL ÁRBOL ---
// =================================================================================

function findNode(id, nodes) {
    if (!nodes) return null;
    for (const nodo of nodes) {
        if (nodo.id === id) return nodo;
        if (nodo.children) { 
            const found = findNode(id, nodo.children); 
            if (found) return found; 
        }
    }
    return null;
}

function findParentNode(childId, nodes) {
    for (const node of nodes) {
        if (node.children && node.children.some(child => child.id === childId)) {
            return node;
        }
        if (node.children) {
            const found = findParentNode(childId, node.children);
            if (found) return found;
        }
    }
    return null;
}

function findNodeByRefId(refId, arbol) {
    for (const nodo of arbol) {
        if (nodo.refId === refId) return nodo;
        if (nodo.children) { const found = findNodeByRefId(refId, nodo.children); if (found) return found; }
    }
    return null;
}

function crearComponente(tipo, datos) {
    const baseComponent = {
        id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        refId: datos.id,
        tipo: tipo,
        icon: { producto: 'package', semiterminado: 'box', insumo: 'beaker' }[tipo],
        children: [],
        quantity: 1, // This now means "Cantidad por Conjunto"
        comment: ''
    };

    if (tipo === 'insumo') {
        baseComponent.consumoTeorico = 0;
        baseComponent.consumoReal = 0;
        baseComponent.unidadConsumo = '';
    }

    return baseComponent;
}

function handleComponentSelect(padreId, itemId, itemType) {
    const item = appState.collections[itemType === 'semiterminado' ? COLLECTIONS.SEMITERMINADOS : COLLECTIONS.INSUMOS].find(i => i.id === itemId);
    if (!item) return;
    let nuevoNodo;
    const addComponent = () => {
        const padre = findNode(padreId, appState.arbolActivo.estructura);
        if (padre) { 
            if (!padre.children) padre.children = [];
            nuevoNodo = crearComponente(itemType, item);
            padre.children.push(nuevoNodo); 
            renderArbolDetalle(nuevoNodo.id); 
        }
    };
    addComponent();
}

function eliminarNodo(id) {
    showConfirmationModal('Eliminar Nodo', '¿Seguro? Se eliminará este nodo y todos sus hijos.', () => {
        function findAndRemove(currentId, nodes) {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i].id === currentId) { nodes.splice(i, 1); return true; }
                if (nodes[i].children && findAndRemove(currentId, nodes[i].children)) return true;
            }
            return false;
        }
        if(findAndRemove(id, appState.arbolActivo.estructura)) {
            renderArbolDetalle();
            showToast('Nodo eliminado.', 'info');
        }
    });
}

async function loadDataForTreeView(selectedProductId) {
    const requiredCollections = [
        // We only need the selected product, not all of them.
        // The other collections are needed to resolve references in the tree.
        COLLECTIONS.SEMITERMINADOS,
        COLLECTIONS.INSUMOS,
        COLLECTIONS.CLIENTES,
        COLLECTIONS.PROVEEDORES,
        COLLECTIONS.UNIDADES,
        COLLECTIONS.PROYECTOS
    ];

    try {
        dom.loadingOverlay.style.display = 'flex';
        dom.loadingOverlay.querySelector('p').textContent = 'Cargando estructura del producto...';

        // Fetch the specific product document first.
        const productDocRef = doc(db, COLLECTIONS.PRODUCTOS, selectedProductId);
        const productSnap = await getDoc(productDocRef);

        if (!productSnap.exists()) {
            throw new Error(`Producto con ID ${selectedProductId} no encontrado.`);
        }
        const selectedProduct = { ...productSnap.data(), docId: productSnap.id };

        // Fetch all other required collections concurrently.
        const otherCollectionsData = await Promise.all(requiredCollections.map(async (collName) => {
            const querySnapshot = await getDocs(collection(db, collName));
            return { name: collName, data: querySnapshot.docs.map(d => ({ ...d.data(), docId: d.id })) };
        }));

        // Populate appState with the fetched data.
        // We replace the entire 'productos' collection with an array containing only the selected one.
        appState.collections[COLLECTIONS.PRODUCTOS] = [selectedProduct];
        appState.collectionsById[COLLECTIONS.PRODUCTOS] = new Map([[selectedProduct.id, selectedProduct]]);

        otherCollectionsData.forEach(coll => {
            appState.collections[coll.name] = coll.data;
            if (coll.data.length > 0 && coll.data[0].id) {
                appState.collectionsById[coll.name] = new Map(coll.data.map(item => [item.id, item]));
            }
        });

        return selectedProduct; // Return the fully loaded product

    } catch (error) {
        console.error("Error loading data for Tree view:", error);
        showToast('Error al cargar los datos del producto seleccionado.', 'error');
        return null;
    } finally {
        dom.loadingOverlay.style.display = 'none';
    }
}


function openProductSearchModalForView(viewType, onProductSelectCallback) {
    // Re-use the existing modal logic but adapt the callback.
    const modalId = `prod-search-modal-${viewType}-${Date.now()}`;

    const onProductSelect = async (productId) => {
        if (onProductSelectCallback) {
            onProductSelectCallback(productId);
            return;
        }

        const productData = await loadDataForTreeView(productId);
        if (!productData) {
            // If data loading fails, go back to the initial screen of the respective view.
            if (viewType === 'sinoptico') {
                runSinopticoLogic();
            } else if (viewType === 'arboles') {
                renderArbolesInitialView();
            }
            return;
        }

        if (viewType === 'sinoptico') {
            dom.viewContent.innerHTML = `<div class="animate-fade-in-up">${renderSinopticoLayout()}</div>`;
            lucide.createIcons();
            initSinoptico();
        } else if (viewType === 'arboles') {
            handleProductSelect(productId); // This function already handles loading the detail view
        }
    };

    // This part is similar to the original openProductSearchModal
    let clientOptions = '<option value="">Todos</option>';
    if (appState.collections[COLLECTIONS.CLIENTES] && appState.collections[COLLECTIONS.CLIENTES].length > 0) {
        clientOptions += appState.collections[COLLECTIONS.CLIENTES].map(c => `<option value="${c.id}">${c.descripcion}</option>`).join('');
    }

    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4 modal-content"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">Buscar Producto Principal</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4"><div><label for="search-prod-term" class="block text-sm font-medium">Código/Descripción</label><input type="text" id="search-prod-term" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm"></div><div><label for="search-prod-client" class="block text-sm font-medium">Cliente</label><select id="search-prod-client" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">${clientOptions}</select></div></div><div id="search-prod-results" class="p-6 border-t overflow-y-auto flex-1"></div></div></div>`;

    dom.modalContainer.innerHTML = modalHTML;
    const modalElement = document.getElementById(modalId);
    const termInput = modalElement.querySelector('#search-prod-term');
    const clientSelect = modalElement.querySelector('#search-prod-client');
    const resultsContainer = modalElement.querySelector('#search-prod-results');

    const searchHandler = async () => {
        const term = termInput.value.toLowerCase();
        const clientId = clientSelect.value;

        // Efficiently fetch only products for the search list
        const productsRef = collection(db, COLLECTIONS.PRODUCTOS);
        const q = query(productsRef, orderBy('id'));
        const querySnapshot = await getDocs(q);
        const allProducts = querySnapshot.docs.map(doc => ({...doc.data(), docId: doc.id}));

        let results = allProducts.filter(p =>
            (term === '' || p.id.toLowerCase().includes(term) || p.descripcion.toLowerCase().includes(term)) &&
            (!clientId || p.clienteId === clientId)
        );

        resultsContainer.innerHTML = results.length === 0
            ? `<p class="text-center py-8">No se encontraron productos.</p>`
            : `<div class="space-y-1">${results.map(p => {
                const client = appState.collectionsById[COLLECTIONS.CLIENTES]?.get(p.clienteId);
                return `<button data-product-id="${p.docId}" class="w-full text-left p-2.5 bg-gray-50 hover:bg-blue-100 rounded-md border flex justify-between items-center">
                    <p class="font-semibold text-blue-800">${p.descripcion} (${p.id})</p>
                    <p class="text-xs text-gray-500">${client?.descripcion || ''}</p>
                </button>`;
            }).join('')}</div>`;
    };

    termInput.addEventListener('input', searchHandler);
    clientSelect.addEventListener('change', searchHandler);
    resultsContainer.addEventListener('click', e => {
        const button = e.target.closest('button[data-product-id]');
        if (button) {
            onProductSelect(button.dataset.productId);
            modalElement.remove();
        }
    });
    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());

    searchHandler(); // Initial render
}


// =================================================================================
// --- LÓGICA DE VISTA SINÓPTICA ---
// =================================================================================

function renderCaratula(producto, cliente) {
    const container = document.getElementById('caratula-container');
    if (!container) return;

    if (producto && cliente) {
        const createdAt = producto.createdAt ? new Date(producto.createdAt.seconds * 1000).toLocaleDateString('es-AR') : 'N/A';
        const proyecto = appState.collectionsById[COLLECTIONS.PROYECTOS]?.get(producto.proyectoId);

        const createEditableField = (label, value, fieldName, placeholder = 'N/A') => {
            const val = value || '';
            return `
                <div class="caratula-field group cursor-pointer" data-field="${fieldName}" data-value="${val}">
                    <p class="font-bold opacity-80 uppercase flex items-center">${label}
                        <i data-lucide="pencil" class="w-3 h-3 ml-2 opacity-0 group-hover:opacity-50 transition-opacity"></i>
                    </p>
                    <div class="value-display min-h-[1em]">${val || `<span class="italic opacity-50">${placeholder}</span>`}</div>
                    <div class="edit-controls hidden">
                        <input type="text" class="bg-slate-800 border-b-2 border-slate-400 focus:outline-none w-full text-white" value="${val}">
                    </div>
                </div>
            `;
        };

        container.innerHTML = `
        <div class="bg-white rounded-xl shadow-lg animate-fade-in-up overflow-hidden">
            <h3 class="text-center font-bold text-xl py-3 bg-blue-600 text-white">COMPOSICIÓN DE PIEZAS</h3>
            <div class="flex">
                <div class="w-1/3 bg-white flex items-center justify-center p-4 border-r border-slate-200">
                    <img src="barack_logo.png" alt="Logo" class="max-h-20">
                </div>
                <div class="w-2/3 bg-[#44546A] text-white p-4 flex items-center" id="caratula-fields-container">
                    <div class="grid grid-cols-2 gap-x-6 gap-y-4 text-sm w-full">
                        <div><p class="font-bold opacity-80 uppercase">PRODUCTO</p><p>${producto.descripcion || 'N/A'}</p></div>
                        <div><p class="font-bold opacity-80 uppercase">NÚMERO DE PIEZA</p><p>${producto.id || 'N/A'}</p></div>
                        <div><p class="font-bold opacity-80 uppercase">VERSIÓN</p><p>${producto.version || 'N/A'}</p></div>
                        <div><p class="font-bold opacity-80 uppercase">PROYECTO</p><p>${proyecto?.nombre || 'N/A'}</p></div>
                        <div><p class="font-bold opacity-80 uppercase">FECHA DE CREACIÓN</p><p>${createdAt}</p></div>
                        ${createEditableField('FECHA DE REVISIÓN', producto.fechaRevision, 'fechaRevision', 'YYYY-MM-DD')}
                        ${createEditableField('REALIZÓ', producto.lastUpdatedBy, 'lastUpdatedBy', 'N/A')}
                        ${createEditableField('APROBÓ', producto.aprobadoPor, 'aprobadoPor', 'N/A')}
                    </div>
                </div>
            </div>
        </div>`;

    } else {
        container.innerHTML = `
            <div class="bg-white p-6 rounded-xl shadow-lg text-center animate-fade-in border border-slate-200">
                <p class="text-slate-500 flex items-center justify-center">
                    <i data-lucide="info" class="inline-block mr-3 h-5 w-5 text-slate-400"></i>
                    <span>La información del producto y cliente aparecerá aquí cuando selecciones un elemento del árbol.</span>
                </p>
            </div>`;
    }
    lucide.createIcons();
}

function openSinopticoEditModal(nodeId) {
    let activeProductDocId;
    switch (appState.currentView) {
        case 'arboles':
            activeProductDocId = appState.arbolActivo?.docId;
            break;
        case 'sinoptico_tabular':
            activeProductDocId = appState.sinopticoTabularState?.selectedProduct?.docId;
            break;
        case 'sinoptico':
            activeProductDocId = appState.sinopticoState?.activeTreeDocId;
            break;
        default:
            activeProductDocId = null;
    }

    if (!activeProductDocId) {
        showToast('Error: No hay un producto activo seleccionado.', 'error');
        return;
    }

    const product = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.docId === activeProductDocId);
    if (!product) {
        showToast('Error: Producto no encontrado en la colección.', 'error');
        return;
    }
    const node = findNode(nodeId, product.estructura);
    if (!node) return;

    const itemData = appState.collectionsById[node.tipo + 's']?.get(node.refId);
    const modalId = `sinoptico-edit-modal-${Date.now()}`;
    let modalHTML = '';

    if (node.tipo === 'insumo') {
        modalHTML = `
            <div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
                <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col m-4 modal-content">
                    <div class="flex justify-between items-center p-5 border-b">
                        <h3 class="text-xl font-bold">Editar Insumo: ${itemData.descripcion}</h3>
                        <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                    </div>
                    <form id="sinoptico-edit-form" class="p-6 overflow-y-auto space-y-6" novalidate>
                        <input type="hidden" name="nodeId" value="${nodeId}">

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label for="quantity" class="block text-sm font-medium text-gray-700 mb-1">Cantidad por Conjunto</label>
                                <input type="number" id="quantity" name="quantity" value="${node.quantity ?? 1}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" step="any" min="0">
                            </div>
                            <div>
                                <label for="unidadConsumo" class="block text-sm font-medium text-gray-700 mb-1">Unidad de Consumo</label>
                                <input type="text" id="unidadConsumo" name="unidadConsumo" value="${node.unidadConsumo || ''}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Ej: cm², kg, m">
                            </div>
                        </div>

                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                             <div>
                                <label for="consumoTeorico" class="block text-sm font-medium text-gray-700 mb-1">Consumo Teórico (por unidad)</label>
                                <input type="number" id="consumoTeorico" name="consumoTeorico" value="${node.consumoTeorico || 0}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" step="any" min="0">
                            </div>
                            <div>
                                <label for="consumoReal" class="block text-sm font-medium text-gray-700 mb-1">Consumo Real (por unidad)</label>
                                <input type="number" id="consumoReal" name="consumoReal" value="${node.consumoReal || 0}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" step="any" min="0">
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-4">
                            <div class="bg-gray-50 p-4 rounded-lg border">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Valor Neto (Teórico)</label>
                                <p id="valor-neto-display" class="text-lg font-bold text-blue-600">0</p>
                            </div>
                            <div class="bg-gray-50 p-4 rounded-lg border">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Valor con Merma (Real)</label>
                                <p id="valor-con-merma-display" class="text-lg font-bold text-blue-600">0</p>
                            </div>
                        </div>

                        <div>
                            <label for="sinoptico-comment" class="block text-sm font-medium text-gray-700 mb-1">Comentario</label>
                            <textarea id="sinoptico-comment" name="comment" rows="3" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" maxlength="140">${node.comment || ''}</textarea>
                        </div>
                    </form>
                    <div class="flex justify-end items-center p-4 border-t bg-gray-50 space-x-3">
                        <button data-action="close" type="button" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                        <button type="submit" form="sinoptico-edit-form" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        `;
    } else {
        // Fallback for non-insumo types (original modal)
        modalHTML = `
            <div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
                <div class="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col m-4 modal-content">
                    <div class="flex justify-between items-center p-5 border-b">
                        <h3 class="text-xl font-bold">Editar: ${itemData.descripcion}</h3>
                        <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                    </div>
                    <form id="sinoptico-edit-form" class="p-6 overflow-y-auto space-y-4" novalidate>
                        <input type="hidden" name="nodeId" value="${nodeId}">
                        <div>
                            <label for="sinoptico-quantity" class="block text-sm font-medium text-gray-700 mb-1">Cantidad</label>
                            <input type="number" id="sinoptico-quantity" name="quantity" value="${node.quantity ?? 1}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" step="any" min="0">
                        </div>
                        <div>
                            <label for="sinoptico-comment" class="block text-sm font-medium text-gray-700 mb-1">Comentario</label>
                            <textarea id="sinoptico-comment" name="comment" rows="3" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" maxlength="140">${node.comment || ''}</textarea>
                        </div>
                    </form>
                    <div class="flex justify-end items-center p-4 border-t bg-gray-50 space-x-3">
                        <button data-action="close" type="button" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button>
                        <button type="submit" form="sinoptico-edit-form" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        `;
    }

    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);

    if (node.tipo === 'insumo') {
        const consumoTeoricoInput = modalElement.querySelector('#consumoTeorico');
        const consumoRealInput = modalElement.querySelector('#consumoReal');
        const valorNetoDisplay = modalElement.querySelector('#valor-neto-display');
        const valorConMermaDisplay = modalElement.querySelector('#valor-con-merma-display');

        const updateValoresDisplay = () => {
            const teorico = parseFloat(consumoTeoricoInput.value) || 0;
            const real = parseFloat(consumoRealInput.value) || 0;
            if (valorNetoDisplay) {
                valorNetoDisplay.textContent = teorico.toLocaleString('es-AR');
            }
            if (valorConMermaDisplay) {
                valorConMermaDisplay.textContent = real.toLocaleString('es-AR');
            }
        };

        consumoTeoricoInput.addEventListener('input', updateValoresDisplay);
        consumoRealInput.addEventListener('input', updateValoresDisplay);
        updateValoresDisplay(); // Initial calculation
    }

    modalElement.querySelector('form').addEventListener('submit', handleSinopticoFormSubmit);
    modalElement.addEventListener('click', e => {
        if (e.target.closest('button')?.dataset.action === 'close') {
            modalElement.remove();
        }
    });
}

async function handleSinopticoFormSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const nodeId = form.querySelector('[name="nodeId"]').value;

    let activeProductDocId;
    switch (appState.currentView) {
        case 'arboles': activeProductDocId = appState.arbolActivo?.docId; break;
        case 'sinoptico_tabular': activeProductDocId = appState.sinopticoTabularState?.selectedProduct?.docId; break;
        case 'sinoptico': activeProductDocId = appState.sinopticoState?.activeTreeDocId; break;
        default: activeProductDocId = null;
    }

    if (!activeProductDocId) {
        showToast('Error: No se pudo encontrar el producto activo.', 'error');
        return;
    }
    const product = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.docId === activeProductDocId);
    if (!product) {
        showToast('Error: Producto no encontrado en la colección.', 'error');
        return;
    }
    const nodeToUpdate = findNode(nodeId, product.estructura);

    if (nodeToUpdate) {
        // Update common fields
        nodeToUpdate.quantity = parseFloat(form.querySelector('[name="quantity"]').value) || 0;
        const commentEl = form.querySelector('[name="comment"]');
        if (commentEl) nodeToUpdate.comment = commentEl.value;

        // Update insumo-specific fields
        if (nodeToUpdate.tipo === 'insumo') {
            nodeToUpdate.unidadConsumo = form.querySelector('[name="unidadConsumo"]').value;
            nodeToUpdate.consumoTeorico = parseFloat(form.querySelector('[name="consumoTeorico"]').value) || 0;
            nodeToUpdate.consumoReal = parseFloat(form.querySelector('[name="consumoReal"]').value) || 0;
        }

        const saveButton = form.closest('.modal-content').querySelector('button[type="submit"]');
        saveButton.disabled = true;
        saveButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5"></i>`;
        lucide.createIcons();

        try {
            const productRef = doc(db, COLLECTIONS.PRODUCTOS, product.docId);
            await updateDoc(productRef, { estructura: product.estructura });
            showToast('Componente actualizado.', 'success');

            document.getElementById(form.closest('.fixed').id).remove();

            switch (appState.currentView) {
                case 'arboles':
                    renderArbolDetalle(nodeId);
                    break;
                case 'sinoptico_tabular':
                     if(appState.sinopticoTabularState.selectedProduct && appState.sinopticoTabularState.selectedProduct.docId === product.docId) {
                        appState.sinopticoTabularState.selectedProduct.estructura = product.estructura;
                    }
                    runSinopticoTabularLogic();
                    break;
                case 'sinoptico':
                    renderTree();
                    renderDetailView(nodeId);
                    break;
            }
        } catch (error) {
            console.error("Error saving sinoptico node:", error);
            showToast('Error al guardar los cambios.', 'error');
            saveButton.disabled = false;
            saveButton.innerHTML = `Guardar Cambios`;
        }
    }
}

function runSinopticoLogic() {
    // This view is now on-demand. First, show a selection screen.
    dom.viewContent.innerHTML = `<div class="flex flex-col items-center justify-center h-full bg-white rounded-xl shadow-lg p-6 text-center animate-fade-in-up">
        <i data-lucide="network" class="h-24 w-24 text-gray-300 mb-6"></i>
        <h3 class="text-2xl font-bold">Vista Sinóptica</h3>
        <p class="text-gray-500 mt-2 mb-8 max-w-lg">Para comenzar, busque y seleccione un producto para ver su estructura completa en modo de solo lectura.</p>
        <button data-action="open-product-search-modal-sinoptico" class="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-lg font-semibold shadow-lg transition-transform transform hover:scale-105">
            <i data-lucide="search" class="inline-block mr-2 -mt-1"></i>Seleccionar Producto
        </button>
    </div>`;
    lucide.createIcons();

    // The rest of the logic (initSinoptico, etc.) will be triggered by a click handler
    // that first loads the necessary data.
}


function renderTabularTable(data) {
    const state = appState.sinopticoTabularState;
    const selectedProduct = state.selectedProduct;

    if (data.length === 0) return `<p class="text-slate-500 p-4 text-center">La estructura de este producto está vacía o los filtros no arrojaron resultados.</p>`;

    const headers = [
        "Nivel", "Descripción", "Version", "Part Number", "Image", "Pieces/Vh [u.]", "Process", "LC Site / KD", "Aspect", "Material",
        "Total Weight (Calculated) [g]", "Color", "Raw Material", "Raw Material Supplier", "Net Consumption",
        "Consumption with Scrap", "UoM (Unit of Measure)", "Comments", "Acciones"
    ];

    let tableHTML = `<table class="w-full text-sm text-left text-gray-600 modern-bom-table">`;
    tableHTML += `<thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr>`;
    headers.forEach(h => tableHTML += `<th scope="col" class="px-4 py-3 align-middle whitespace-nowrap">${h}</th>`);
    tableHTML += `</tr></thead><tbody>`;

    data.forEach(rowData => {
        const { node, item, level, isLast, lineage } = rowData;
        const NA = '<span class="text-slate-400">-</span>';

        let prefix = lineage.map(parentIsNotLast => parentIsNotLast ? '│&nbsp;&nbsp;&nbsp;&nbsp;' : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;').join('');
        if (level > 0)  prefix += isLast ? '└─ ' : '├─ ';

        const descripcion = `<span class="font-mono font-medium">${prefix}</span><span class="font-semibold">${item.descripcion || item.nombre || ''}</span>`;
        const nivel = node.originalLevel;
        const version = item.version || NA;
        const partNumber = item.codigo_pieza || NA;
        const image = item.imagen ? `<img src="${item.imagen}" class="h-10 w-10 object-cover rounded-md border" alt="Component image">` : NA;

        const piecesPerVh = selectedProduct.piezas_por_vehiculo || NA;
        const color = selectedProduct.color || NA;

        let proceso = NA;
        if (item.proceso) {
            const procesoData = appState.collectionsById[COLLECTIONS.PROCESOS]?.get(item.proceso);
            proceso = procesoData ? procesoData.descripcion : item.proceso;
        }

        const lcKd = item.lc_kd || NA;
        const aspecto = item.aspecto || NA;

        let material = NA;
        if (node.tipo === 'producto' && selectedProduct.material_separar) {
            material = 'Ver sub-componentes';
        } else if (node.tipo === 'semiterminado') {
            material = item.materiales_componentes || NA;
        } else if (node.tipo === 'insumo') {
            material = item.material || NA;
        }

        const weight = item.peso_gr || NA;

        let rawMaterial = NA;
        let rawMaterialSupplier = NA;
        let netConsumption = NA;
        let consumptionWithScrap = NA;
        let uom = NA;

        if (node.tipo === 'insumo') {
            rawMaterial = item.codigo_materia_prima || NA;
            if (item.proveedor_materia_prima) {
                const provMP = appState.collectionsById[COLLECTIONS.PROVEEDORES]?.get(item.proveedor_materia_prima);
                rawMaterialSupplier = provMP ? provMP.descripcion : item.proveedor_materia_prima;
            }
            netConsumption = node.consumoTeorico ?? NA;
            consumptionWithScrap = node.consumoReal ?? NA;
            if (item.unidad_medida) {
                const unidadData = appState.collectionsById[COLLECTIONS.UNIDADES]?.get(item.unidad_medida);
                uom = unidadData ? unidadData.id : item.unidad_medida;
            }
        }

        const comments = node.comment || NA;
        const actionsHTML = checkUserPermission('edit') ? `<button data-action="edit-tabular-node" data-node-id="${node.id}" class="p-1 text-blue-600 hover:bg-blue-100 rounded-md" title="Editar"><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i></button>` : '';

        tableHTML += `<tr class="bg-white border-b hover:bg-gray-100" data-node-id="${node.id}">
            <td class="px-4 py-2 text-center align-middle">${nivel}</td>
            <td class="px-4 py-2 align-middle" style="min-width: 300px;">${descripcion}</td>
            <td class="px-4 py-2 text-center align-middle">${version}</td>
            <td class="px-4 py-2 text-center align-middle">${partNumber}</td>
            <td class="px-4 py-2 text-center align-middle">${image}</td>
            <td class="px-4 py-2 text-center align-middle">${piecesPerVh}</td>
            <td class="px-4 py-2 text-center align-middle">${proceso}</td>
            <td class="px-4 py-2 text-center align-middle">${lcKd}</td>
            <td class="px-4 py-2 text-center align-middle">${aspecto}</td>
            <td class="px-4 py-2 text-center align-middle">${material}</td>
            <td class="px-4 py-2 text-right align-middle">${weight}</td>
            <td class="px-4 py-2 text-center align-middle">${color}</td>
            <td class="px-4 py-2 text-center align-middle">${rawMaterial}</td>
            <td class="px-4 py-2 text-center align-middle">${rawMaterialSupplier}</td>
            <td class="px-4 py-2 text-right align-middle">${netConsumption}</td>
            <td class="px-4 py-2 text-right align-middle">${consumptionWithScrap}</td>
            <td class="px-4 py-2 text-center align-middle">${uom}</td>
            <td class="px-4 py-2 align-middle" style="min-width: 150px;">${comments}</td>
            <td class="px-4 py-2 text-center align-middle">${actionsHTML}</td>
        </tr>`;
    });
    tableHTML += `</tbody></table>`;
    return tableHTML;
}

export function runSinopticoTabularLogic() {
    // Initialize state for the view
    if (!appState.sinopticoTabularState) {
        appState.sinopticoTabularState = {
            selectedProduct: null,
            activeFilters: {
                niveles: null, // Initialize to null to indicate no filter is active yet
                material: ''
            }
        };
    }

    const state = appState.sinopticoTabularState;

    // --- RENDER FUNCTIONS ---

    const renderReportView = () => {
        const product = state.selectedProduct;
        if (!product) {
            renderInitialView();
            return;
        }

        // The user wants a header section. Let's build it here.
        const headerHTML = `
            <div class="report-header bg-white p-4 mb-4 rounded-lg shadow-md border flex justify-between items-center">
                <div class="flex items-center gap-4">
                    <img src="/barack_logo.png" alt="Logo" class="h-12">
                    <div>
                        <h2 class="text-xl font-bold text-slate-800">PART COMPOSITION - BOM</h2>
                        <p class="text-sm text-slate-500">${product.descripcion || ''}</p>
                    </div>
                </div>
                <div class="text-sm text-slate-600 grid grid-cols-2 gap-x-4 gap-y-1">
                    <strong class="text-right">Issue Date:</strong>
                    <input type="date" value="${new Date().toISOString().split('T')[0]}" class="p-1 border rounded-md bg-white">

                    <strong class="text-right">Prepared by:</strong>
                    <span>${appState.currentUser?.name || 'N/A'}</span>

                    <strong class="text-right">Version:</strong>
                    <span>${product.version || '1.0'}</span>
                </div>
            </div>
        `;


        const getOriginalMaxDepth = (nodes, level = 0) => {
            if (!nodes || nodes.length === 0) return level > 0 ? level - 1 : 0;
            let max = level;
            for (const node of nodes) {
                const depth = getOriginalMaxDepth(node.children, level + 1);
                if (depth > max) max = depth;
            }
            return max;
        };

        const flattenedData = getFlattenedData(product, state.activeFilters);
        const tableHTML = renderTabularTable(flattenedData);

        const maxLevel = getOriginalMaxDepth(product.estructura);
        let levelFilterOptionsHTML = '';
        for (let i = 0; i <= maxLevel; i++) {
            const isChecked = !state.activeFilters.niveles.size || state.activeFilters.niveles.has(i.toString());
            levelFilterOptionsHTML += `
                <label class="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-md cursor-pointer">
                    <input type="checkbox" data-level="${i}" class="level-filter-cb h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" ${isChecked ? 'checked' : ''}>
                    <span class="text-sm">Nivel ${i}</span>
                </label>
            `;
        }

        dom.viewContent.innerHTML = `<div class="animate-fade-in-up">
            ${headerHTML}
            <div class="bg-white p-6 rounded-xl shadow-lg">
                <div class="flex flex-wrap items-center justify-between gap-4 mb-4">
                    <div><h3 class="text-xl font-bold text-slate-800">Detalle de: ${product.descripcion}</h3><p class="text-sm text-slate-500">${product.id}</p></div>
                    <div class="flex items-center gap-2">
                        <div class="relative">
                            <button id="level-filter-btn" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded-md text-sm font-semibold hover:bg-slate-50 flex items-center gap-2">
                                <i data-lucide="filter" class="h-4 w-4"></i>Filtrar por Nivel<i data-lucide="chevron-down" class="h-4 w-4 ml-1"></i>
                            </button>
                            <div id="level-filter-dropdown" class="absolute z-10 right-0 mt-2 w-48 bg-white border rounded-lg shadow-xl hidden p-2 dropdown-menu">
                                ${levelFilterOptionsHTML}
                                <div class="border-t my-2"></div>
                                <button data-action="apply-tabular-filters" class="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Aplicar</button>
                            </div>
                        </div>
                        <div class="border-l pl-2 flex items-center gap-2">
                             <input type="text" id="material-filter-input" placeholder="Buscar por material..." class="border-slate-300 rounded-md shadow-sm text-sm p-2">
                             <button data-action="apply-tabular-filters" class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700">Buscar</button>
                        </div>
                        <button data-action="select-another-product-tabular" class="bg-gray-500 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-600 flex items-center">
                            <i data-lucide="search" class="mr-2 h-4 w-4"></i>Seleccionar Otro
                        </button>
                        <button data-action="export-sinoptico-tabular-pdf" class="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-red-700 flex items-center">
                            <i data-lucide="file-text" class="mr-2 h-4 w-4"></i>Exportar a PDF
                        </button>
                    </div>
                </div>
                <div id="sinoptico-tabular-container" class="mt-6 overflow-x-auto">${tableHTML}</div>
            </div>
        </div>`;

        lucide.createIcons();
    };

    // --- Event Handlers ---
    const handleViewClick = async (e) => {
        const button = e.target.closest('button[data-action]');

        // Handle dropdown toggle separately to prevent it from closing immediately
        if (e.target.closest('#level-filter-btn')) {
            const dropdown = document.getElementById('level-filter-dropdown');
            if (dropdown) dropdown.classList.toggle('hidden');
            return;
        }

        if (!button) return;

        const action = button.dataset.action;

        switch (action) {
            case 'open-product-search-modal-tabular':
                await openProductSearchModal();
                break;
            case 'select-another-product-tabular':
                state.selectedProduct = null;
                state.activeFilters.niveles.clear();
                renderInitialView();
                break;
            case 'edit-tabular-node':
                openSinopticoEditModal(button.dataset.nodeId);
                break;
            case 'apply-tabular-filters':
                const levelDropdown = document.getElementById('level-filter-dropdown');
                const selectedLevels = new Set();
                if (levelDropdown) {
                    levelDropdown.querySelectorAll('.level-filter-cb:checked').forEach(cb => {
                        selectedLevels.add(cb.dataset.level);
                    });
                    const allLevelsCount = levelDropdown.querySelectorAll('.level-filter-cb').length;
                    if (allLevelsCount > 0 && selectedLevels.size === allLevelsCount) {
                        state.activeFilters.niveles.clear();
                    } else {
                        state.activeFilters.niveles = selectedLevels;
                    }
                    levelDropdown.classList.add('hidden');
                }

                const materialInput = document.getElementById('material-filter-input');
                state.activeFilters.material = materialInput ? materialInput.value : '';

                const tableContainer = document.getElementById('sinoptico-tabular-container');
                if (tableContainer) {
                    const savedScrollY = window.scrollY;
                    tableContainer.innerHTML = `<div class="flex items-center justify-center p-16 text-slate-500"><i data-lucide="loader" class="animate-spin h-8 w-8 mr-3"></i><span>Aplicando filtros...</span></div>`;
                    lucide.createIcons();

                    const processDataPromise = new Promise(resolve => {
                        const product = state.selectedProduct;
                        const flattenedData = getFlattenedData(product, state.activeFilters);
                        const newTableHTML = renderTabularTable(flattenedData);
                        resolve(newTableHTML);
                    });

                    Promise.all([new Promise(res => setTimeout(res, 300)), processDataPromise]).then(([_, newTableHTML]) => {
                        tableContainer.innerHTML = newTableHTML;
                        lucide.createIcons();
                        window.scrollTo(0, savedScrollY);
                    });
                }
                break;
            case 'export-sinoptico-tabular-pdf':
                exportSinopticoTabularToPdf();
                break;
        }
    };

    // --- PRODUCT SELECTION ---
    const openProductSearchModal = async () => {
        try {
            await ensureCollectionsAreLoaded([COLLECTIONS.CLIENTES, COLLECTIONS.PRODUCTOS]);
        } catch (error) {
            showToast('Error al cargar datos para la búsqueda. Intente de nuevo.', 'error');
            return;
        }

        // Defensive check to ensure collections are populated before use
        if (!appState.collections[COLLECTIONS.CLIENTES] || !appState.collections[COLLECTIONS.PRODUCTOS]) {
            showToast('Error: No se pudieron cargar los datos necesarios. Por favor, recargue la página.', 'error');
            return;
        }

        let clientOptions = '<option value="">Todos</option>' + appState.collections[COLLECTIONS.CLIENTES].map(c => `<option value="${c.id}">${c.descripcion}</option>`).join('');
        const modalId = `prod-search-modal-tabular-${Date.now()}`;
        const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4 modal-content"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">Buscar Producto Principal</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4"><div><label for="search-prod-term" class="block text-sm font-medium">Código/Descripción</label><input type="text" id="search-prod-term" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm"></div><div><label for="search-prod-client" class="block text-sm font-medium">Cliente</label><select id="search-prod-client" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">${clientOptions}</select></div></div><div id="search-prod-results" class="p-6 border-t overflow-y-auto flex-1"></div></div></div>`;

        dom.modalContainer.innerHTML = modalHTML;
        const modalElement = document.getElementById(modalId);
        const termInput = modalElement.querySelector('#search-prod-term');
        const clientSelect = modalElement.querySelector('#search-prod-client');
        const resultsContainer = modalElement.querySelector('#search-prod-results');

        const searchHandler = () => {
            const term = termInput.value.toLowerCase();
            const clientId = clientSelect.value;
            let results = appState.collections[COLLECTIONS.PRODUCTOS].filter(p => (term === '' || p.id.toLowerCase().includes(term) || p.descripcion.toLowerCase().includes(term)) && (!clientId || p.clienteId === clientId));
            resultsContainer.innerHTML = results.length === 0 ? `<p class="text-center py-8">No se encontraron productos.</p>` : `<div class="space-y-1">${results.map(p => `<button data-product-id="${p.id}" class="w-full text-left p-2.5 bg-gray-50 hover:bg-blue-100 rounded-md border flex justify-between items-center"><p class="font-semibold text-blue-800">${p.descripcion} (${p.id})</p><p class="text-xs text-gray-500">${appState.collections[COLLECTIONS.CLIENTES].find(c => c.id === p.clienteId)?.descripcion || ''}</p></button>`).join('')}</div>`;
        };

        termInput.addEventListener('input', searchHandler);
        clientSelect.addEventListener('change', searchHandler);
        resultsContainer.addEventListener('click', e => {
            const button = e.target.closest('button[data-product-id]');
            if (button) {
                handleProductSelect(button.dataset.productId);
                modalElement.remove();
            }
        });
        modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
        searchHandler();
    };

    const handleProductSelect = async (productId) => {
        try {
            // Ensure all collections needed for the Bill of Materials are loaded
            await ensureCollectionsAreLoaded([
                COLLECTIONS.SEMITERMINADOS,
                COLLECTIONS.INSUMOS,
                COLLECTIONS.PROCESOS,
                COLLECTIONS.PROVEEDORES,
                COLLECTIONS.UNIDADES
            ]);

            // Fetch the full product document to ensure 'estructura' is present
            const productDoc = await getDoc(doc(db, COLLECTIONS.PRODUCTOS, productId));

            if (productDoc.exists()) {
                const producto = { ...productDoc.data(), docId: productDoc.id };
                state.selectedProduct = producto;

                // Also update the local collections cache for consistency,
                // replacing the potentially partial data with the full document.
                const productIndex = appState.collections[COLLECTIONS.PRODUCTOS].findIndex(p => p.id === productId);
                if (productIndex !== -1) {
                    appState.collections[COLLECTIONS.PRODUCTOS][productIndex] = producto;
                } else {
                    appState.collections[COLLECTIONS.PRODUCTOS].push(producto);
                }

                renderReportView();
            } else {
                showToast("Error: Producto no encontrado en la base de datos.", "error");
                renderInitialView();
            }
        } catch (error) {
            console.error("Error loading data for tabular report:", error);
            showToast('Error al cargar los datos necesarios para el reporte.', 'error');
            renderInitialView();
        }
    };

    const renderInitialView = () => {
        dom.viewContent.innerHTML = `<div class="flex flex-col items-center justify-center h-full bg-white rounded-xl shadow-lg p-6 text-center animate-fade-in-up">
            <i data-lucide="file-search-2" class="h-24 w-24 text-gray-300 mb-6"></i>
            <h3 class="text-2xl font-bold">Reporte de Estructura de Producto (Tabular)</h3>
            <p class="text-gray-500 mt-2 mb-8 max-w-lg">Para comenzar, busque y seleccione el producto principal que desea consultar.</p>
            <button data-action="open-product-search-modal-tabular" class="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-lg font-semibold shadow-lg transition-transform transform hover:scale-105">
                <i data-lucide="search" class="inline-block mr-2 -mt-1"></i>Seleccionar Producto
            </button>
        </div>`;
        lucide.createIcons();
    };

    // --- MAIN LOGIC & CLEANUP ---
    if (state.selectedProduct) {
        renderReportView();
    } else {
        renderInitialView();
    }

    const caratulaFieldsHandler = (e) => {
        const fieldContainer = e.target.closest('.editable-field');
        if (fieldContainer && !fieldContainer.classList.contains('is-editing')) {
            fieldContainer.classList.add('is-editing');
            const valueDisplay = fieldContainer.querySelector('.value-display');
            const editControls = fieldContainer.querySelector('.edit-controls');
            const input = editControls.querySelector('input');

            valueDisplay.classList.add('hidden');
            editControls.classList.remove('hidden');
            input.focus();
            input.select();

            const saveField = async () => {
                const newValue = input.value;
                const fieldName = fieldContainer.dataset.field;

                if (newValue !== fieldContainer.dataset.value) {
                    const productRef = doc(db, COLLECTIONS.PRODUCTOS, state.selectedProduct.docId);
                    try {
                        await updateDoc(productRef, { [fieldName]: newValue });
                        showToast('Campo actualizado.', 'success');
                        state.selectedProduct[fieldName] = newValue;
                        renderReportView();
                    } catch (error) {
                        showToast('Error al guardar.', 'error');
                        fieldContainer.classList.remove('is-editing');
                        valueDisplay.classList.remove('hidden');
                        editControls.classList.add('hidden');
                    }
                } else {
                    fieldContainer.classList.remove('is-editing');
                    valueDisplay.classList.remove('hidden');
                    editControls.classList.add('hidden');
                }
            };

            input.addEventListener('blur', saveField, { once: true });
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') input.blur();
                if (e.key === 'Escape') {
                    input.removeEventListener('blur', saveField);
                    fieldContainer.classList.remove('is-editing');
                    valueDisplay.classList.remove('hidden');
                    editControls.classList.add('hidden');
                }
            });
        }
    };

    dom.viewContent.addEventListener('click', handleViewClick);
    dom.viewContent.addEventListener('click', handleCaratulaClick);

    appState.currentViewCleanup = () => {
        dom.viewContent.removeEventListener('click', handleViewClick);
        dom.viewContent.removeEventListener('click', handleCaratulaClick);
        appState.sinopticoTabularState = null;
    };
}

export async function exportSinopticoTabularToPdf() {
    const state = appState.sinopticoTabularState;
    if (!state || !state.selectedProduct) {
        showToast('No hay producto seleccionado para exportar.', 'error');
        return;
    }
    const product = state.selectedProduct;
    const client = appState.collectionsById[COLLECTIONS.CLIENTES].get(product.clienteId);

    showToast('Generando PDF de estructura...', 'info');
    dom.loadingOverlay.style.display = 'flex';
    dom.loadingOverlay.querySelector('p').textContent = 'Procesando datos...';

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4'); // Landscape mode
        const logoBase64 = await getLogoBase64();

        const addPageNumbers = () => {
            const pageCount = doc.internal.getNumberOfPages();
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(150);
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                const text = `Página ${i} de ${pageCount}`;
                const textWidth = doc.getStringUnitWidth(text) * doc.internal.getFontSize() / doc.internal.scaleFactor;
                doc.text(text, doc.internal.pageSize.width - 15 - textWidth, doc.internal.pageSize.height - 10);

                const generatedText = `Generado el ${new Date().toLocaleDateString('es-AR')} por ${appState.currentUser.name}`;
                doc.text(generatedText, 15, doc.internal.pageSize.height - 10);
            }
        };

        // --- Cover Page ---
        if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', doc.internal.pageSize.width / 2 - 30, 40, 60, 25);
        }
        doc.setFontSize(28);
        doc.setFont('helvetica', 'bold');
        doc.text('Reporte de Estructura de Producto', doc.internal.pageSize.width / 2, 90, { align: 'center' });

        doc.setFontSize(16);
        doc.setFont('helvetica', 'normal');
        doc.text(`Producto: ${product.descripcion}`, doc.internal.pageSize.width / 2, 120, { align: 'center' });
        doc.text(`Código: ${product.id}`, doc.internal.pageSize.width / 2, 128, { align: 'center' });
        doc.text(`Cliente: ${client?.descripcion || 'N/A'}`, doc.internal.pageSize.width / 2, 136, { align: 'center' });

        // --- Data Table Page ---
        doc.addPage();
        dom.loadingOverlay.querySelector('p').textContent = 'Generando tabla...';

        const flattenedData = getFlattenedData(product, state.activeFilters);
        const { head, body: bodyObjects } = prepareDataForPdfAutoTable(flattenedData, appState.collectionsById, product);

        // FIX: Convert array of objects to array of arrays to respect the `head` order.
        const columnOrder = ['descripcion', 'nivel', 'codigo', 'cantidad', 'comentarios'];
        const bodyAsArrays = bodyObjects.map(obj => columnOrder.map(key => obj[key] !== undefined ? obj[key] : ''));

        doc.autoTable({
            head: head,
            body: bodyAsArrays,
            startY: 20,
            theme: 'grid',
            styles: {
                fontSize: 7,
                cellPadding: 1.5,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: [41, 104, 217],
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { cellWidth: 60 }, // Descripcion
                1: { cellWidth: 10, halign: 'center' }, // Nivel
                2: { cellWidth: 15, halign: 'center' }, // LC/KD
                3: { cellWidth: 20, halign: 'center' }, // Código
                4: { cellWidth: 15, halign: 'center' }, // Versión
                // ... add other column widths if needed
            },
            didDrawPage: (data) => {
                if (logoBase64) {
                    doc.addImage(logoBase64, 'PNG', 15, 8, 20, 8);
                }
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text('Estructura de Producto', doc.internal.pageSize.width - 15, 15, { align: 'right' });
            }
        });

        addPageNumbers();
        doc.save(`Estructura_${product.id}.pdf`);
        showToast('PDF generado con éxito.', 'success');

    } catch (error) {
        console.error("Error al generar PDF con jsPDF:", error);
        showToast(`Error al generar el PDF: ${error.message}`, 'error');
    } finally {
        dom.loadingOverlay.style.display = 'none';
    }
}

function handleCaratulaClick(e) {
    const fieldContainer = e.target.closest('.caratula-field');
    if (fieldContainer && !fieldContainer.classList.contains('is-editing')) {
        const currentlyEditing = document.querySelector('.caratula-field.is-editing');
        if (currentlyEditing) {
            // Si ya hay otro campo editándose, lo cerramos (sin guardar)
            const valueDisplay = currentlyEditing.querySelector('.value-display');
            const editControls = currentlyEditing.querySelector('.edit-controls');
            valueDisplay.classList.remove('hidden');
            editControls.classList.add('hidden');
            currentlyEditing.classList.remove('is-editing');
        }

        fieldContainer.classList.add('is-editing');
        const valueDisplay = fieldContainer.querySelector('.value-display');
        const editControls = fieldContainer.querySelector('.edit-controls');
        const input = editControls.querySelector('input');

        valueDisplay.classList.add('hidden');
        editControls.classList.remove('hidden');
        input.focus();
        input.select();

        const saveField = async () => {
            const newValue = input.value;
            const fieldName = fieldContainer.dataset.field;
            const originalValue = fieldContainer.dataset.value;

            fieldContainer.classList.remove('is-editing');
            valueDisplay.classList.remove('hidden');
            editControls.classList.add('hidden');

            if (newValue !== originalValue) {
                const activeProductDocId = appState.sinopticoState?.activeTreeDocId || appState.sinopticoTabularState?.selectedProduct?.docId;
                if (!activeProductDocId) return;

                const productRef = doc(db, COLLECTIONS.PRODUCTOS, activeProductDocId);
                try {
                    await updateDoc(productRef, { [fieldName]: newValue });
                    showToast('Campo de carátula actualizado.', 'success');

                    // Actualizar estado local y re-renderizar la vista actual
                    if(appState.currentView === 'sinoptico') {
                        const product = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.docId === activeProductDocId);
                        product[fieldName] = newValue;
                        renderDetailView(appState.sinopticoState.activeElementId);
                    } else if (appState.currentView === 'sinoptico_tabular') {
                        appState.sinopticoTabularState.selectedProduct[fieldName] = newValue;
                        const { renderReportView } = runSinopticoTabularLogic; // Re-run to get access to inner function
                        if(renderReportView) renderReportView();
                    }
                } catch (error) {
                    showToast('Error al guardar el campo.', 'error');
                    console.error("Error updating caratula field:", error);
                }
            }
        };

        input.addEventListener('blur', saveField, { once: true });
        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') input.blur();
            if (e.key === 'Escape') {
                input.removeEventListener('blur', saveField);
                input.value = fieldContainer.dataset.value; // Revert value
                fieldContainer.classList.remove('is-editing');
                valueDisplay.classList.remove('hidden');
                editControls.classList.add('hidden');
            }
        });
    }
}


function runFlujogramaLogic() {
    const flujogramaState = {
        selectedProduct: null,
    };

    const renderInitialView = () => {
        dom.viewContent.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full bg-white rounded-xl shadow-lg p-6 text-center animate-fade-in-up">
                <i data-lucide="git-branch-plus" class="h-24 w-24 text-gray-300 mb-6"></i>
                <h3 class="text-2xl font-bold">Flujograma de Procesos</h3>
                <p class="text-gray-500 mt-2 mb-8 max-w-lg">
                    Seleccione un producto para generar automáticamente un flujograma visual de su proceso de fabricación,
                    inspirado en los sistemas de la industria automotriz.
                </p>
                <button data-action="open-product-search-modal-flujograma" class="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 text-lg font-semibold shadow-lg transition-transform transform hover:scale-105">
                    <i data-lucide="search" class="inline-block mr-2 -mt-1"></i>Seleccionar Producto
                </button>
            </div>
        `;
        lucide.createIcons();
    };

    const renderFlujogramaView = () => {
        const product = flujogramaState.selectedProduct;
        if (!product) {
            renderInitialView();
            return;
        }

        const mermaidDefinition = generateMermaidDefinition(product.estructura);

        dom.viewContent.innerHTML = `
            <div class="animate-fade-in-up">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-2xl font-bold">Flujograma para: ${product.descripcion}</h3>
                    <button data-action="select-another-product-flujograma" class="bg-gray-500 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-600">
                        Seleccionar Otro Producto
                    </button>
                </div>
                <div id="flujograma-container" class="bg-white p-6 rounded-xl shadow-lg overflow-x-auto text-center">
                    <div class="mermaid">
                        ${mermaidDefinition}
                    </div>
                </div>
            </div>
        `;
        mermaid.init(undefined, dom.viewContent.querySelectorAll('.mermaid'));
    };

    const generateMermaidDefinition = (nodes) => {
        if (!nodes || nodes.length === 0) return 'graph TD; A["Estructura Vacía"];';

        let definition = 'graph TD;\n';
        definition += '    classDef producto fill:#e0f2fe,stroke:#3b82f6,stroke-width:2px,font-weight:bold;\n';
        definition += '    classDef semiterminado fill:#dcfce7,stroke:#16a34a,stroke-width:2px;\n';
        definition += '    classDef insumo fill:#f1f5f9,stroke:#64748b,stroke-width:2px;\n\n';

        const nodeDefinitions = new Set();
        const connections = [];

        function traverse(node, parentId) {
            const item = appState.collectionsById[node.tipo + 's']?.get(node.refId);
            if (!item) return;

            // Define el nodo si no ha sido definido antes
            if (!nodeDefinitions.has(node.id)) {
                const nodeLabel = `${item.descripcion}<br><small>(${item.id})</small>`;
                nodeDefinitions.add(node.id);
                definition += `    ${node.id}("${nodeLabel}"):::${node.tipo};\n`;
            }

            // Añade la conexión desde el padre
            if (parentId) {
                connections.push(`    ${parentId} --> ${node.id};`);
            }

            // Recorre los hijos
            if (node.children && node.children.length > 0) {
                node.children.forEach(child => traverse(child, node.id));
            }
        }

        nodes.forEach(rootNode => traverse(rootNode, null));

        definition += '\n' + connections.join('\n');
        return definition;
    };

    const handleProductSelect = async (productId) => {
        const productData = await loadDataForTreeView(productId);
        if (productData) {
            flujogramaState.selectedProduct = productData;
            renderFlujogramaView();
        } else {
            showToast('No se pudo cargar la información del producto.', 'error');
        }
    };

    dom.viewContent.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;
        if (action === 'open-product-search-modal-flujograma') {
            openProductSearchModalForView('flujograma', handleProductSelect);
        } else if (action === 'select-another-product-flujograma') {
            flujogramaState.selectedProduct = null;
            renderInitialView();
        }
    });

    renderInitialView();
}

function renderSinopticoLayout() {
    return `
        <div id="caratula-container" class="mb-6"></div>
        <div id="sinoptico-layout-container">
            <div id="sinoptico-main-view" class="overflow-y-auto custom-scrollbar bg-white p-6 rounded-xl shadow-lg">
                <div class="flex flex-col md:flex-row gap-4 mb-4">
                    <div class="relative flex-grow">
                        <i data-lucide="search" class="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i>
                        <input type="text" id="sinoptico-search-input" placeholder="Buscar en el árbol..." class="w-full pl-12 pr-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div class="flex gap-4">
                        <div class="relative">
                            <button id="type-filter-btn" class="flex items-center gap-2 w-full h-full px-4 py-3 bg-white border border-slate-300 rounded-lg text-sm font-medium hover:bg-slate-50 shadow-sm">
                                <i data-lucide="filter" class="w-4 h-4"></i><span>Filtrar Tipo</span><i data-lucide="chevron-down" class="w-4 h-4 ml-auto"></i>
                            </button>
                            <div id="type-filter-dropdown" class="absolute z-10 right-0 mt-2 w-56 bg-white border rounded-lg shadow-xl hidden p-2 dropdown-menu">
                                <label class="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-md cursor-pointer"><input type="checkbox" data-type="producto" class="type-filter-cb" checked><span>Producto</span></label>
                                <label class="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-md cursor-pointer"><input type="checkbox" data-type="semiterminado" class="type-filter-cb" checked><span>Semiterminado</span></label>
                                <label class="flex items-center gap-3 p-2 hover:bg-slate-100 rounded-md cursor-pointer"><input type="checkbox" data-type="insumo" class="type-filter-cb" checked><span>Insumo</span></label>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-3 mb-4 p-2 bg-slate-50 rounded-lg">
                    <span class="text-sm font-semibold text-slate-600 flex-shrink-0">Filtros de Cliente:</span>
                    <div id="active-filters-bar" class="flex flex-wrap gap-2"></div>
                    <div class="relative ml-auto">
                        <button id="add-client-filter-btn" class="flex items-center justify-center w-8 h-8 bg-slate-200 rounded-full hover:bg-slate-300"><i data-lucide="plus" class="w-4 h-4"></i></button>
                        <div id="add-client-filter-dropdown" class="absolute z-10 right-0 mt-2 w-64 bg-white border rounded-lg shadow-xl hidden dropdown-menu"></div>
                    </div>
                </div>
                <ul id="sinoptico-tree-container" class="sinoptico-tree-container"></ul>
            </div>
            <div id="sinoptico-details-container">
                <aside id="sinoptico-details-panel">
                    <div id="detail-container" class="sinoptico-sidebar-sticky">
                        <div class="flex flex-col items-center justify-center h-full text-center bg-white rounded-xl shadow-lg p-8">
                            <i data-lucide="layout-grid" class="w-16 h-16 text-slate-300 mb-4"></i>
                            <h2 class="text-xl font-bold">Seleccione un elemento</h2>
                            <p class="text-slate-500 mt-2">Haga clic en un ítem del árbol para ver sus detalles.</p>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    `;
}

function initSinoptico() {
    if (appState.currentViewCleanup) {
        appState.currentViewCleanup();
    }
    if (!appState.sinopticoState) {
        appState.sinopticoState = {
            activeElementId: null,
            activeTreeDocId: null,
            activeFilters: { clients: new Set(), types: new Set(['producto', 'semiterminado', 'insumo']) },
            expandedNodes: new Set()
        };
    }
    const searchInput = document.getElementById('sinoptico-search-input');
    const typeFilterCheckboxes = document.querySelectorAll('.type-filter-cb');
    
    function renderFullUI() {
        renderTree();
        renderActiveFilters();
        populateAddClientFilterDropdown();
    }
    
    function renderTree() {
        const treeContainer = document.getElementById('sinoptico-tree-container');
        if (!treeContainer) return;
        const searchTerm = searchInput.value.toLowerCase();
        treeContainer.innerHTML = '';

        const treesToRender = appState.collections[COLLECTIONS.PRODUCTOS].filter(producto => {
            if (!producto.estructura || producto.estructura.length === 0) return false;
            // Si hay filtros de cliente activos, aplicarlos. Si no, mostrar todos.
            if (appState.sinopticoState.activeFilters.clients.size > 0 && !appState.sinopticoState.activeFilters.clients.has(producto.clienteId)) return false;
            return producto.estructura.some(rootNode => itemOrDescendantsMatch(rootNode, searchTerm));
        });
        if (treesToRender.length === 0) {
            treeContainer.innerHTML = `<div class="text-center text-slate-500 p-8">
                <i data-lucide="search-x" class="w-12 h-12 mx-auto text-slate-300"></i>
                <p class="mt-4 font-medium">No se encontraron resultados.</p>
                <p class="text-sm">Intente con otro filtro o término de búsqueda.</p>
            </div>`;
            lucide.createIcons();
            return;
        }
        const productsByClient = new Map();
        treesToRender.forEach(arbol => {
            if (!productsByClient.has(arbol.clienteId)) {
                productsByClient.set(arbol.clienteId, []);
            }
            productsByClient.get(arbol.clienteId).push(arbol.estructura[0]);
        });
        productsByClient.forEach((productos, clienteId) => {
            const client = appState.collectionsById[COLLECTIONS.CLIENTES].get(clienteId);
            const clientLi = document.createElement('li');
            clientLi.className = 'sinoptico-tree-item';
            clientLi.innerHTML = `<div class="flex items-center p-2 font-bold text-slate-600"><i data-lucide="building-2" class="w-5 h-5 mr-3 text-slate-500 flex-shrink-0"></i><span>${client?.descripcion || 'Cliente Desconocido'}</span></div>`;
            
            const ul = document.createElement('ul');
            productos.forEach((productNode, index) => {
                const isLast = index === productos.length - 1;
                const productElement = buildAndFilterNode(productNode, searchTerm, isLast);
                if (productElement) {
                    ul.appendChild(productElement);
                }
            });
            if (ul.hasChildNodes()) {
                clientLi.appendChild(ul);
                treeContainer.appendChild(clientLi);
            }
        });
        lucide.createIcons();
    }
    
    function buildAndFilterNode(node, searchTerm, isLast) {
        if (!itemOrDescendantsMatch(node, searchTerm) || !appState.sinopticoState.activeFilters.types.has(node.tipo)) {
            return null;
        }
        const li = createTreeItemElement(node, isLast);
        const children = node.children || [];
        if (children.length > 0 && appState.sinopticoState.expandedNodes.has(node.id)) {
            const childrenContainer = document.createElement('ul');
            const visibleChildren = children.filter(child => itemOrDescendantsMatch(child, searchTerm));
            visibleChildren.forEach((childNode, index) => {
                const isChildLast = index === visibleChildren.length - 1;
                const renderedChildNode = buildAndFilterNode(childNode, searchTerm, isChildLast);
                if (renderedChildNode) childrenContainer.appendChild(renderedChildNode);
            });
            if (li && childrenContainer.hasChildNodes()) li.appendChild(childrenContainer);
        }
        return li;
    }
    
    function createTreeItemElement(node, isLast) {
        const collectionName = node.tipo + 's';
        const item = appState.collectionsById[collectionName]?.get(node.refId);
        if (!item) return null;
    
        const li = document.createElement('li');
        li.className = 'sinoptico-tree-item';
        li.dataset.id = node.id;
        li.dataset.refId = node.refId;
        li.dataset.type = node.tipo;
        if (appState.sinopticoState.expandedNodes.has(node.id)) li.classList.add('expanded');
        if (isLast) li.classList.add('is-last');
        
        const hasChildren = node.children?.length > 0;
        const iconMap = { producto: 'package', semiterminado: 'box', insumo: 'beaker' };
        
        const div = document.createElement('div');
        div.className = 'sinoptico-tree-item-content flex items-center p-2 cursor-pointer hover:bg-slate-100 rounded-lg min-h-[2.75rem]';
        div.setAttribute('data-type', node.tipo);
        if (node.id === appState.sinopticoState.activeElementId) div.classList.add('active');
        
        div.innerHTML = `
            <span class="flex items-center justify-center w-5 h-5 mr-1 flex-shrink-0">
                ${hasChildren ? '<i data-lucide="chevron-right" class="w-5 h-5 text-slate-400 toggle-expand"></i>' : ''}
            </span>
            <i data-lucide="${iconMap[node.tipo]}" class="w-5 h-5 mr-3 text-blue-600 flex-shrink-0"></i>
            <span class="flex-grow truncate select-none" title="${item.descripcion}">${item.descripcion}</span>
            <span class="text-xs text-slate-400 font-mono ml-2 select-none">${item.id}</span>
        `;
    
        li.appendChild(div);
        return li;
    }
    function itemOrDescendantsMatch(node, searchTerm) {
        const collectionName = node.tipo + 's';
        const item = appState.collectionsById[collectionName]?.get(node.refId);
        if (!item) return false;
        if (!searchTerm) return true;
        const itemText = `${item.descripcion} ${item.id}`.toLowerCase();
        if (itemText.includes(searchTerm)) return true;
        return (node.children || []).some(childNode => itemOrDescendantsMatch(childNode, searchTerm));
    }
    
    function renderActiveFilters() {
        const activeFiltersBar = document.getElementById('active-filters-bar');
        if (!activeFiltersBar) return;
        activeFiltersBar.innerHTML = appState.sinopticoState.activeFilters.clients.size === 0
            ? `<span class="text-xs text-slate-500 italic">Ningún cliente seleccionado</span>`
            : [...appState.sinopticoState.activeFilters.clients].map(clientId => {
                const client = appState.collectionsById[COLLECTIONS.CLIENTES].get(clientId);
                return client ? `<div class="flex items-center gap-2 bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full animate-fade-in"><span>${client.descripcion}</span><button data-id="${clientId}" class="remove-filter-btn p-0.5 hover:bg-blue-200 rounded-full"><i data-lucide="x" class="w-3.5 h-3.5 pointer-events-none"></i></button></div>` : '';
            }).join('');
        lucide.createIcons();
    }
    
    function populateAddClientFilterDropdown() {
        const dropdown = document.getElementById('add-client-filter-dropdown');
        if(!dropdown) return;
        const availableClients = appState.collections[COLLECTIONS.CLIENTES].filter(client => !appState.sinopticoState.activeFilters.clients.has(client.id));
        dropdown.innerHTML = availableClients.length === 0
            ? `<span class="block px-4 py-2 text-sm text-slate-500">No hay más clientes.</span>`
            : availableClients.map(client => `<a href="#" data-id="${client.id}" class="block px-4 py-2 text-sm hover:bg-slate-100">${client.descripcion}</a>`).join('');
    }
    function renderDetailView(componentId) {
        const detailContainer = document.getElementById('detail-container');
        if (!detailContainer) return;

        let targetNode = null;
        let parentNode = null;
        let activeTree = null;

        // Find the active product tree based on the selected component
        if (componentId) {
            for (const producto of appState.collections[COLLECTIONS.PRODUCTOS]) {
                if (!producto.estructura) continue; // Skip products without a tree
                targetNode = findNode(componentId, producto.estructura);
                if (targetNode) {
                    activeTree = producto;
                    appState.sinopticoState.activeTreeDocId = producto.docId;
                    // We need to find the parent within the same structure
                    parentNode = findParentNode(componentId, producto.estructura);
                    break;
                }
            }
        }
        
        // Render the "Carátula" based on the found tree
        if (activeTree) {
            const producto = appState.collectionsById[COLLECTIONS.PRODUCTOS].get(activeTree.productoPrincipalId);
            const cliente = appState.collectionsById[COLLECTIONS.CLIENTES].get(activeTree.clienteId);
            renderCaratula(producto, cliente);
        } else {
            renderCaratula(null, null);
        }

        // If no component is selected or found, show placeholder in details
        if (!componentId || !targetNode) {
            detailContainer.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-center bg-white rounded-xl shadow-lg p-8">
                <i data-lucide="layout-grid" class="w-16 h-16 text-slate-300 mb-4"></i>
                <h2 class="text-xl font-bold">Seleccione un elemento</h2>
                <p class="text-slate-500 mt-2">Haga clic en un ítem del árbol para ver sus detalles.</p>
            </div>`;
            lucide.createIcons();
            return;
        }
    
        const collectionName = targetNode.tipo + 's';
        const item = appState.collectionsById[collectionName]?.get(targetNode.refId);
        if (!item) { return; }
    
        const iconMap = { producto: 'package', semiterminado: 'box', insumo: 'beaker' };
        const name = item.descripcion;
        let content = `<div class="bg-white rounded-xl shadow-lg p-6 h-full overflow-y-auto custom-scrollbar animate-fade-in">
            <div class="flex items-start mb-6 pb-4 border-b">
                <div class="w-14 h-14 flex-shrink-0 mr-4 bg-blue-600 rounded-lg flex items-center justify-center shadow-md">
                    <i data-lucide="${iconMap[targetNode.tipo]}" class="w-8 h-8 text-white"></i>
                </div>
                <div>
                    <p class="text-sm font-bold uppercase text-blue-600">${targetNode.tipo}</p>
                    <h2 class="text-2xl font-bold leading-tight">${name}</h2>
                    <p class="text-sm font-semibold text-slate-500">${item.id}</p>
                </div>
            </div>`;
    
        if (targetNode.tipo === 'producto') {
            content += `<div class="mb-4">
                <button data-action="export-product-pdf" class="w-full bg-red-500 text-white px-4 py-2.5 rounded-md hover:bg-red-600 flex items-center justify-center text-sm font-semibold shadow-sm">
                    <i data-lucide="file-text" class="mr-2 h-4 w-4"></i>Exportar Sinóptico a PDF
                </button>
            </div>`;
        } else {
            // Botón para abrir el modal de edición
        if (checkUserPermission('edit')) {
            content += `<div class="mb-4">
                <button data-action="open-sinoptico-edit-modal" data-node-id="${targetNode.id}" class="w-full bg-blue-600 text-white px-4 py-2.5 rounded-md hover:bg-blue-700 flex items-center justify-center text-sm font-semibold shadow-sm">
                    <i data-lucide="pencil" class="mr-2 h-4 w-4"></i>Editar Cantidad y Comentario
                </button>
            </div>`;
        }
        }
    
        const createSection = (title) => `<h3 class="sinoptico-detail-section-header">${title}</h3>`;
        const createRow = (icon, label, value) => !value && value !== 0 ? '' : `<div class="flex items-start py-3 border-b border-slate-100"><i data-lucide="${icon}" class="w-5 h-5 text-slate-400 mt-1 mr-4 flex-shrink-0"></i><div><p class="text-sm text-slate-500">${label}</p><p class="font-semibold">${value}</p></div></div>`;
        
        content += createSection('Contexto en el Árbol');
    
        if (parentNode) {
            const parentItem = appState.collectionsById[parentNode.tipo + 's']?.get(parentNode.refId);
            if (parentItem) {
                 content += createRow('arrow-up', 'Padre', parentItem.descripcion);
            }
        }
    
        if (targetNode.tipo !== 'producto') {
            const unidadData = appState.collectionsById[COLLECTIONS.UNIDADES].get(item.unidadMedidaId);
            const unidadLabel = unidadData ? `(${unidadData.id})` : '';
            const quantityValue = targetNode.quantity;
            const isQuantitySet = quantityValue !== null && quantityValue !== undefined;
            const quantityDisplay = isQuantitySet ? quantityValue : '<span class="text-red-500 italic">Sin asignar</span>';
            content += createRow('package-plus', `Cantidad Requerida ${unidadLabel}`, quantityDisplay);
            content += createRow('message-square', 'Comentario', targetNode.comment || '<span class="text-slate-400 italic">Sin comentario</span>');
        }
    
        if (targetNode.children && targetNode.children.length > 0) {
            content += `<p class="text-sm font-semibold text-slate-600 mt-4 mb-2">Componentes Hijos (${targetNode.children.length})</p><div class="space-y-2">`;
            targetNode.children.forEach(child => {
                const childItem = appState.collectionsById[child.tipo + 's']?.get(child.refId);
                if (childItem) {
                    content += `<button data-navigate-to="${child.id}" class="w-full text-left p-3 bg-slate-50 hover:bg-slate-100 rounded-md border flex items-center text-sm"><i data-lucide="${iconMap[child.tipo]}" class="w-4 h-4 mr-3 text-slate-500"></i><p class="font-semibold flex-grow">${childItem.descripcion}</p></button>`;
                }
            });
            content += `</div>`;
        }
    
        content += createSection('Detalles del Componente Maestro');
    
        switch (targetNode.tipo) {
            case 'producto':
                const client = appState.collectionsById[COLLECTIONS.CLIENTES].get(item.clienteId);
                const procesoProd = appState.collectionsById[COLLECTIONS.PROCESOS]?.get(item.proceso);
                content += createRow('building-2', 'Cliente', client?.descripcion);
                content += createRow('hash', 'Código Cliente', item.codigo_cliente);
                if(procesoProd) content += createRow('cpu', 'Proceso', procesoProd.descripcion);
                content += createRow('tag', 'Versión', item.version);
                content += createRow('car', 'Piezas por Vehículo', item.pzas_vh);
                content += createRow('scale', 'Peso', item.peso_gr ? `${item.peso_gr} gr` : null);
                content += createRow('move-3d', 'Dimensiones (X*Y*Z)', item.dimensiones_xyz);
                break;
            case 'semiterminado':
                const tiempoCiclo = item.tiempo_ciclo_seg ? `${item.tiempo_ciclo_seg} seg` : null;
                const peso = item.peso_gr ? `${item.peso_gr} gr` : null;
                const tolerancia = item.tolerancia_peso_gr ? `± ${item.tolerancia_peso_gr} gr` : null;
                const procesoSemi = appState.collectionsById[COLLECTIONS.PROCESOS]?.get(item.proceso);
                if(procesoSemi) content += createRow('cpu', 'Proceso', procesoSemi.descripcion);
                content += createRow('timer', 'Tiempo Ciclo', tiempoCiclo);
                content += createRow('scale', 'Peso', peso);
                content += createRow('plus-minus', 'Tolerancia de Peso', tolerancia);
                content += createRow('move-3d', 'Dimensiones (X*Y*Z)', item.dimensiones_xyz);
                content += createRow('binary', 'Materiales', item.materiales_componentes);
                content += createRow('globe-2', 'Sourcing', item.sourcing);
                break;
            case 'insumo':
                const proveedor = appState.collectionsById[COLLECTIONS.PROVEEDORES].get(item.proveedorId);
                const unidad = appState.collectionsById[COLLECTIONS.UNIDADES].get(item.unidadMedidaId);
                const procesoInsumo = appState.collectionsById[COLLECTIONS.PROCESOS]?.get(item.proceso);
                if(procesoInsumo) content += createRow('cpu', 'Proceso', procesoInsumo.descripcion);
                content += createRow('truck', 'Proveedor', proveedor?.descripcion);
                content += createRow('layers-3', 'Material', item.material);
                content += createRow('ruler', 'Unidad Medida', unidad?.descripcion);
                content += createRow('dollar-sign', 'Costo', typeof item.costo === 'number' ? `$${item.costo.toFixed(2)} por ${unidad?.id || 'Unidad'}` : 'N/A');
                content += createRow('archive', 'Stock Mínimo', item.stock_minimo);
                content += createRow('globe-2', 'Sourcing', item.sourcing);
                content += createRow('message-square', 'Observaciones', item.observaciones);
                break;
        }
        content += `</div>`;
        detailContainer.innerHTML = content;
        lucide.createIcons();
    }
    


async function exportProductTreePdf(productNode) {
    showToast('Iniciando exportación a PDF...', 'info');

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const logoBase64 = await getLogoBase64();

    const PAGE_MARGIN = 15;
    const PAGE_WIDTH = doc.internal.pageSize.width;
    const PAGE_HEIGHT = doc.internal.pageSize.height;
    const FONT_SIZES = { H1: 16, H2: 10, BODY: 8, HEADER_TABLE: 8, FOOTER: 8 };
    const BASE_ROW_HEIGHT = 7;
    const LINE_SPACING = 4;
    const INDENT_WIDTH = 5;
    const LINE_COLOR = '#CCCCCC';
    const HEADER_BG_COLOR = '#44546A';
    const TEXT_COLOR = '#2d3748';
    const TITLE_COLOR = '#2563eb';
    const TYPE_COLORS = {
        producto: '#3b82f6', semiterminado: '#16a34a', insumo: '#64748b'
    };

    let cursorY = 0;

    const flattenedData = [];
    function flattenTree(node, level, parentLineage = []) {
        const item = appState.collectionsById[node.tipo + 's']?.get(node.refId);
        if (!item) return;

        flattenedData.push({ node, item, level, lineage: parentLineage });

        if (node.children && node.children.length > 0) {
            const visibleChildren = node.children.filter(child => appState.collectionsById[child.tipo + 's']?.get(child.refId));
            visibleChildren.forEach((child, index) => {
                const isLast = index === visibleChildren.length - 1;
                flattenTree(child, level + 1, [...parentLineage, !isLast]);
            });
        }
    }
    flattenTree(productNode, 0);

    async function drawPageHeader() {
        const productItem = appState.collectionsById[COLLECTIONS.PRODUCTOS].get(productNode.refId);
        const clientItem = appState.collectionsById[COLLECTIONS.CLIENTES].get(productItem.clienteId);

        if (logoBase64) {
            doc.addImage(logoBase64, 'PNG', PAGE_MARGIN, 12, 40, 15);
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(FONT_SIZES.H1);
        doc.setTextColor(TITLE_COLOR);
        doc.text('Sinóptico de Producto', PAGE_WIDTH - PAGE_MARGIN, 18, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(FONT_SIZES.H2);
        doc.setTextColor(TEXT_COLOR);
        doc.text(`Producto: ${productItem.descripcion} (${productItem.id})`, PAGE_WIDTH - PAGE_MARGIN, 25, { align: 'right' });
        doc.text(`Cliente: ${clientItem?.descripcion || 'N/A'}`, PAGE_WIDTH - PAGE_MARGIN, 30, { align: 'right' });

        cursorY = 40;
    }

    function drawTableHeaders() {
        doc.setFillColor(HEADER_BG_COLOR);
        doc.rect(PAGE_MARGIN, cursorY, PAGE_WIDTH - (PAGE_MARGIN * 2), BASE_ROW_HEIGHT, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(FONT_SIZES.HEADER_TABLE);
        doc.setTextColor('#FFFFFF');

        const headers = ['Componente', 'Tipo', 'Aspecto', 'Cantidad', 'Código'];
        const colX = [PAGE_MARGIN + 2, 110, 135, 150, 170];
        headers.forEach((header, i) => {
            doc.text(header, colX[i], cursorY + BASE_ROW_HEIGHT / 2, { baseline: 'middle' });
        });

        cursorY += BASE_ROW_HEIGHT;
    }

    function drawRow(data) {
        const { item, node, level, lineage } = data;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(FONT_SIZES.BODY);

        const descriptionX = PAGE_MARGIN + (level * INDENT_WIDTH) + 3;
        const descriptionMaxWidth = 108 - descriptionX;
        const descriptionLines = doc.splitTextToSize(item.descripcion, descriptionMaxWidth);
        const rowHeight = Math.max(BASE_ROW_HEIGHT, descriptionLines.length * LINE_SPACING + 2);

        if (cursorY + rowHeight > PAGE_HEIGHT - (PAGE_MARGIN + 10)) {
            return false;
        }

        doc.setTextColor(TEXT_COLOR);
        if (node.tipo === 'producto') doc.setFont('helvetica', 'bold');

        const textY = cursorY + rowHeight / 2;

        doc.setDrawColor(LINE_COLOR);
        const parentX = PAGE_MARGIN + ((level - 1) * INDENT_WIDTH);
        lineage.forEach((continues, i) => {
            const currentParentX = PAGE_MARGIN + (i * INDENT_WIDTH);
            if (continues) {
                doc.line(currentParentX, cursorY, currentParentX, cursorY + rowHeight);
            }
        });

        if (level > 0) {
            const isLast = !lineage[level-1];
            doc.line(parentX, textY, descriptionX - 3, textY);
            if (!isLast) {
                 doc.line(parentX, cursorY, parentX, cursorY + rowHeight);
            } else {
                 doc.line(parentX, cursorY, parentX, textY);
            }
        }

        doc.setFillColor(TYPE_COLORS[node.tipo] || '#000000');
        doc.circle(descriptionX - 2.5, textY, 1.2, 'F');

        doc.text(descriptionLines, descriptionX, cursorY + 3.5);
        doc.text(node.tipo.charAt(0).toUpperCase() + node.tipo.slice(1), 110, textY, { baseline: 'middle' });

        const aspecto = item.aspecto || 'N/A';
        doc.text(aspecto, 135, textY, { baseline: 'middle' });

        const unitData = appState.collectionsById[COLLECTIONS.UNIDADES].get(item.unidadMedidaId);
        const unit = unitData ? unitData.id : 'Un';
        const quantityValue = node.quantity;
        const isQuantitySet = quantityValue !== null && quantityValue !== undefined;
        const quantityText = isQuantitySet ? `${quantityValue} ${unit}` : '---';
        doc.text(node.tipo !== 'producto' ? quantityText : '', 150, textY, { baseline: 'middle' });

        doc.text(item.id, 170, textY, { baseline: 'middle' });

        cursorY += rowHeight;
        return true;
    }

    function drawPageFooter(pageNumber, pageCount) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(FONT_SIZES.FOOTER);
        doc.setTextColor(TEXT_COLOR);
        const date = new Date().toLocaleDateString('es-AR');
        doc.text(`Generado el ${date}`, PAGE_MARGIN, PAGE_HEIGHT - 10);
        doc.text(`Página ${pageNumber} de ${pageCount}`, PAGE_WIDTH - PAGE_MARGIN, PAGE_HEIGHT - 10, { align: 'right' });
    }

    await drawPageHeader();
    drawTableHeaders();

    for (const data of flattenedData) {
        const rowDrawn = drawRow(data);
        if (!rowDrawn) {
            doc.addPage();
            await drawPageHeader();
            drawTableHeaders();
            drawRow(data);
        }
    }

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        drawPageFooter(i, pageCount);
    }

    doc.save(`Sinoptico_Grafico_${productNode.refId.replace(/\s+/g, '_')}.pdf`);
    showToast('PDF con árbol gráfico generado con éxito.', 'success');
}
    
    const handleSinopticoClick = async (e) => {
        const target = e.target;
        const button = target.closest('button[data-action]');

        if (button) {
            const action = button.dataset.action;
            if (action === 'open-sinoptico-edit-modal') {
                openSinopticoEditModal(button.dataset.nodeId);
                return;
            }
        }
        
        if (target.closest('#sinoptico-toggle-details')) {
            document.getElementById('sinoptico-main-view').classList.toggle('expanded');
            document.getElementById('sinoptico-details-container').classList.toggle('hidden');
            return;
        }
    
        const exportBtn = target.closest('button[data-action="export-product-pdf"]');
        if (exportBtn) {
            const activeProduct = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.docId === appState.sinopticoState.activeTreeDocId);
            if (activeProduct && activeProduct.estructura) {
                const activeNode = findNode(appState.sinopticoState.activeElementId, activeProduct.estructura);
                if (activeNode && activeNode.tipo === 'producto') {
                    await exportProductTreePdf(activeNode);
                }
            }
            return;
        }
        
        const treeItem = target.closest('.sinoptico-tree-item');
        if (treeItem) {
            const componentId = treeItem.dataset.id;
            
            if (target.closest('.toggle-expand')) {
                if (appState.sinopticoState.expandedNodes.has(componentId)) {
                    appState.sinopticoState.expandedNodes.delete(componentId);
                } else {
                    appState.sinopticoState.expandedNodes.add(componentId);
                }
            } else if (target.closest('.sinoptico-tree-item-content')) {
                if (appState.sinopticoState.activeElementId === componentId) {
                    appState.sinopticoState.activeElementId = null;
                    renderDetailView(null);
                } else {
                    appState.sinopticoState.activeElementId = componentId;
                    renderDetailView(componentId);
                }
            }
            renderTree();
        }
        
        const detailItem = target.closest('button[data-navigate-to]');
        if(detailItem) {
            const navigateToId = detailItem.dataset.navigateTo;
            appState.sinopticoState.activeElementId = navigateToId;
            const productForParent = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.docId === appState.sinopticoState.activeTreeDocId);
            if (productForParent && productForParent.estructura) {
                const parentNode = findParentNode(navigateToId, productForParent.estructura);
                if(parentNode && !appState.sinopticoState.expandedNodes.has(parentNode.id)){
                    appState.sinopticoState.expandedNodes.add(parentNode.id);
                }
            }
            
            renderTree();
            renderDetailView(navigateToId);
            const elementInTree = document.querySelector(`.sinoptico-tree-item[data-id="${navigateToId}"]`);
            elementInTree?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    
        if(target.closest('#type-filter-btn')) { e.stopPropagation(); document.getElementById('type-filter-dropdown').classList.toggle('hidden'); }
        if(target.closest('#add-client-filter-btn')) { e.stopPropagation(); populateAddClientFilterDropdown(); document.getElementById('add-client-filter-dropdown').classList.toggle('hidden'); }
        
        const addClientLink = target.closest('#add-client-filter-dropdown a');
        if (addClientLink) { e.preventDefault(); appState.sinopticoState.activeFilters.clients.add(addClientLink.dataset.id); document.getElementById('add-client-filter-dropdown').classList.add('hidden'); renderFullUI(); }
        
        const removeFilterBtn = target.closest('.remove-filter-btn');
        if (removeFilterBtn) { appState.sinopticoState.activeFilters.clients.delete(removeFilterBtn.dataset.id); renderFullUI(); }
        
        const exportPdfLink = target.closest('a[data-action="export-sinoptico-pdf"]');
        if (exportPdfLink) { 
            e.preventDefault();
            exportSinopticoPdf(appState.sinopticoState.activeFilters); 
        }
    };
    
    dom.viewContent.addEventListener('click', handleSinopticoClick);
    dom.viewContent.addEventListener('click', handleCaratulaClick);
    
    const searchHandler = () => {
        const searchTerm = searchInput.value.toLowerCase();
        if (searchTerm) {
            appState.collections[COLLECTIONS.PRODUCTOS].forEach(producto => {
                if (!producto.estructura) return; // Omitir productos sin estructura
                function findAndExpand(node, parents) {
                    const item = appState.collectionsById[node.tipo + 's']?.get(node.refId);
                    if (!item) return;

                    const newParents = [...parents, node.id];
                    const itemText = `${item.descripcion} ${item.id}`.toLowerCase();
                    if (itemText.includes(searchTerm)) {
                        newParents.forEach(pId => appState.sinopticoState.expandedNodes.add(pId));
                    }
                    if (node.children) node.children.forEach(child => findAndExpand(child, newParents));
                }
                producto.estructura.forEach(rootNode => findAndExpand(rootNode, []));
            });
        }
        renderTree();
    };
    searchInput.addEventListener('input', searchHandler);
    
    typeFilterCheckboxes.forEach(cb => { cb.addEventListener('change', () => { if (cb.checked) appState.sinopticoState.activeFilters.types.add(cb.dataset.type); else appState.sinopticoState.activeFilters.types.delete(cb.dataset.type); renderTree(); }); });
    
    appState.currentViewCleanup = () => {
        dom.viewContent.removeEventListener('click', handleSinopticoClick);
        searchInput.removeEventListener('input', searchHandler);
    };
    
    renderFullUI();
}

function exportSinopticoPdf(activeFilters) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    let cursor = { y: 20 };
    const pageHeight = doc.internal.pageSize.height;
    const marginBottom = 20;
    const lineSpacing = 6;
    const leftMargin = 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.text("Reporte de Estructura de Productos", leftMargin, cursor.y);
    cursor.y += lineSpacing * 2;
    const treesToRender = appState.collections[COLLECTIONS.PRODUCTOS].filter(producto => {
        return producto.hasOwnProperty('estructura') && (activeFilters.clients.size === 0 || activeFilters.clients.has(producto.clienteId));
    });
    if (treesToRender.length === 0) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(12);
        doc.text("No hay datos para mostrar con los filtros actuales.", leftMargin, cursor.y);
        doc.save("reporte_sinoptico_vacio.pdf");
        return;
    }
    const checkPageBreak = () => {
        if (cursor.y > pageHeight - marginBottom) {
            doc.addPage();
            cursor.y = 20;
        }
    };
    function traverse(node, prefix, isLast) {
        const collectionName = node.tipo + 's';
        const item = appState.collectionsById[collectionName]?.get(node.refId);
        if (!item || !activeFilters.types.has(node.tipo)) return;
        checkPageBreak();
        
        const isQuantitySet = node.quantity !== null && node.quantity !== undefined;
        const quantityText = node.tipo !== 'producto' ? ` [x${isQuantitySet ? node.quantity : '---'}]` : '';
        const linePrefix = prefix + (isLast ? '`-- ' : '|-- ');
        const line = `${linePrefix}${item.descripcion}${quantityText}`;
        const code = `(${node.refId})`;

        doc.setFont('courier', 'normal');
        doc.setFontSize(10);
        doc.text(line, leftMargin, cursor.y);
        doc.setFont('courier', 'italic');
        doc.setTextColor(100);
        doc.text(code, doc.internal.pageSize.width - leftMargin - doc.getTextWidth(code), cursor.y);
        doc.setTextColor(0);
        cursor.y += lineSpacing;
        if (node.children && node.children.length > 0) {
            const newPrefix = prefix + (isLast ? '    ' : '|   ');
            const visibleChildren = node.children.filter(child => {
                const childItem = appState.collectionsById[child.tipo + 's']?.get(child.refId);
                return childItem && activeFilters.types.has(child.tipo);
            });
            visibleChildren.forEach((child, index) => {
                traverse(child, newPrefix, index === visibleChildren.length - 1);
            });
        }
    }
    treesToRender.forEach(arbol => {
        checkPageBreak();
        const client = appState.collectionsById[COLLECTIONS.CLIENTES].get(arbol.clienteId);
        if (client && activeFilters.types.has('cliente')) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(12);
            doc.text(`CLIENTE: ${client.descripcion}`, leftMargin, cursor.y);
            cursor.y += lineSpacing * 1.5;
        }
        arbol.estructura.forEach((rootNode, index) => {
            traverse(rootNode, '', index === arbol.estructura.length - 1);
        });
        cursor.y += lineSpacing;
    });
    doc.save("reporte_sinoptico.pdf");
    showToast('Reporte PDF del árbol generado.', 'success');
}

// =================================================================================
// --- LÓGICA DE CLONACIÓN Y MODALES ESPECIALES ---
// =================================================================================

/**
 * Recursively traverses a node tree and assigns new, unique IDs to each node.
 * This function is exported for testing purposes.
 * @param {Array} nodes - The array of root nodes of the structure to process.
 * @returns {void} - The function modifies the nodes in place.
 */
// Global counter to ensure uniqueness across rapid function calls.
let regenerateNodeIdsCounter = 0;


function showDatePromptModal(title, message) {
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

function showPromptModal(title, message) {
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

// =================================================================================
// --- LÓGICA DE PERFIL DE USUARIO ---
// =================================================================================

function runProfileLogic() {
    const user = appState.currentUser;
    if (!user) return;

    const roleBadges = {
        admin: '<span class="bg-red-100 text-red-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full">Administrador</span>',
        editor: '<span class="bg-blue-100 text-blue-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full">Editor</span>',
        lector: '<span class="bg-gray-100 text-gray-800 text-xs font-medium mr-2 px-2.5 py-0.5 rounded-full">Lector</span>'
    };

    dom.viewContent.innerHTML = `<div class="max-w-4xl mx-auto space-y-8 animate-fade-in-up">
        <!-- Profile Header -->
        <div class="bg-white p-8 rounded-xl shadow-lg flex flex-col sm:flex-row items-center space-y-4 sm:space-y-0 sm:space-x-6">
            <div class="relative group">
                <img src="${user.avatarUrl}" alt="Avatar" class="w-24 h-24 rounded-full border-4 border-slate-200 object-cover">
                <button id="change-avatar-btn" class="absolute inset-0 bg-black bg-opacity-50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <i data-lucide="camera" class="w-8 h-8 text-white"></i>
                </button>
            </div>
            <div class="text-center sm:text-left">
                <div class="flex items-center justify-center sm:justify-start">
                    <h3 id="display-name" class="text-3xl font-bold text-slate-800">${user.name}</h3>
                    <button id="edit-name-btn" class="ml-2 text-slate-400 hover:text-slate-600"><i data-lucide="pencil" class="w-5 h-5"></i></button>
                </div>
                <p class="text-slate-500">${user.email}</p>
                <div class="mt-2">${roleBadges[user.role] || ''}</div>
            </div>
        </div>

        <!-- General Settings -->
        <div class="bg-white p-8 rounded-xl shadow-lg">
            <h4 class="text-xl font-bold text-slate-800 border-b pb-4 mb-6">Configuración General</h4>
            <form id="profile-settings-form" class="space-y-4 max-w-md">
                <div>
                    <label for="profile-name" class="block text-sm font-medium text-gray-700 mb-1">Nombre para mostrar</label>
                    <input type="text" id="profile-name" value="${user.name}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                </div>
                <div>
                    <label for="profile-avatar" class="block text-sm font-medium text-gray-700 mb-1">URL de la foto de perfil</label>
                    <input type="url" id="profile-avatar" value="${user.avatarUrl}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                </div>
                <div class="pt-2"><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Perfil</button></div>
            </form>
        </div>

        <!-- Password Change -->
        <div class="bg-white p-8 rounded-xl shadow-lg">
            <h4 class="text-xl font-bold text-slate-800 border-b pb-4 mb-6">Cambiar Contraseña</h4>
            <form id="change-password-form" class="space-y-4 max-w-md">
                <div><label for="current-password" class="block text-sm font-medium text-gray-700 mb-1">Contraseña Actual</label><input type="password" id="current-password" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required></div>
                <div><label for="new-password" class="block text-sm font-medium text-gray-700 mb-1">Nueva Contraseña</label><input type="password" id="new-password" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required></div>
                <div><label for="confirm-password" class="block text-sm font-medium text-gray-700 mb-1">Confirmar Nueva Contraseña</label><input type="password" id="confirm-password" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required></div>
                <div class="pt-2"><button type="submit" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Cambios</button></div>
            </form>
        </div>

        <!-- Danger Zone -->
        <div class="bg-white p-8 rounded-xl shadow-lg border-2 border-red-200">
            <h4 class="text-xl font-bold text-red-700 border-b border-red-200 pb-4 mb-6">Zona de Peligro</h4>
            <div class="flex items-center justify-between">
                <div><p class="font-semibold">Eliminar esta cuenta</p><p class="text-sm text-slate-500">Una vez que elimine su cuenta, no hay vuelta atrás. Por favor, esté seguro.</p></div>
                <button data-action="delete-account" class="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 font-semibold flex-shrink-0">Eliminar Cuenta</button>
            </div>
        </div>
    </div>`;
    lucide.createIcons();

    document.getElementById('change-password-form').addEventListener('submit', handleChangePassword);
    document.getElementById('profile-settings-form').addEventListener('submit', handleProfileUpdate);

    // Quick edit buttons
    document.getElementById('edit-name-btn').addEventListener('click', () => {
        document.getElementById('profile-name').focus();
    });
    document.getElementById('change-avatar-btn').addEventListener('click', openAvatarSelectionModal);
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const newName = document.getElementById('profile-name').value;
    const newAvatarUrl = document.getElementById('profile-avatar').value;

    const user = auth.currentUser;
    const userDocRef = doc(db, COLLECTIONS.USUARIOS, user.uid);

    try {
        // Update Firebase Auth profile
        await updateProfile(user, {
            displayName: newName,
            photoURL: newAvatarUrl
        });

        // Update Firestore user document
        await updateDoc(userDocRef, {
            name: newName,
            photoURL: newAvatarUrl
        });

        // Update local app state
        appState.currentUser.name = newName;
        appState.currentUser.avatarUrl = newAvatarUrl;

        showToast('Perfil actualizado con éxito.', 'success');
        renderUserMenu(); // Refresh the user menu in the navbar
        runProfileLogic(); // Re-render the profile page with new data

    } catch (error) {
        console.error("Error updating profile:", error);
        showToast("Error al actualizar el perfil.", "error");
    }
}

async function handleChangePassword(e) {
    e.preventDefault();
    const currentPass = document.getElementById('current-password').value;
    const newPass = document.getElementById('new-password').value;
    const confirmPass = document.getElementById('confirm-password').value;
    if (newPass !== confirmPass) {
        showToast('Las nuevas contraseñas no coinciden.', 'error');
        return;
    }
    try {
        const user = auth.currentUser;
        const credential = EmailAuthProvider.credential(user.email, currentPass);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPass);
        showToast('Contraseña cambiada exitosamente.', 'success');
        e.target.reset();
    } catch (error) {
        console.error("Error changing password:", error);
        showToast("Error al cambiar la contraseña. Verifique su contraseña actual.", "error");
    }
}

function handleDeleteAccount() {
    const title = "Confirmación Extrema Requerida";
    const message = `Esta acción es irreversible. Se eliminarán todos sus datos. Para confirmar, escriba "ELIMINAR" en el campo de abajo.`;
    
    const modalId = `delete-account-modal`;
    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
        <div class="bg-white rounded-lg shadow-xl w-full max-w-md m-4 modal-content">
            <div class="p-6 text-center"><i data-lucide="alert-triangle" class="h-12 w-12 mx-auto text-red-500 mb-4"></i><h3 class="text-xl font-bold mb-2">${title}</h3><p class="text-gray-600 mb-4">${message}</p><input type="text" id="delete-confirm-input" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Escriba ELIMINAR aquí"></div>
            <div class="flex justify-center items-center p-4 border-t bg-gray-50 space-x-4"><button data-action="cancel" class="bg-gray-200 text-gray-800 px-6 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button><button id="confirm-delete-btn" class="bg-red-600 text-white px-6 py-2 rounded-md font-semibold opacity-50 cursor-not-allowed" disabled>Confirmar Eliminación</button></div>
        </div></div>`;
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);
    const confirmInput = document.getElementById('delete-confirm-input');
    const confirmButton = document.getElementById('confirm-delete-btn');
    confirmInput.addEventListener('input', () => {
        const isConfirmed = confirmInput.value === 'ELIMINAR';
        confirmButton.disabled = !isConfirmed;
        confirmButton.classList.toggle('opacity-50', !isConfirmed);
        confirmButton.classList.toggle('cursor-not-allowed', !isConfirmed);
    });
    modalElement.addEventListener('click', async e => {
        const action = e.target.closest('button')?.dataset.action;
        if (action === 'cancel') modalElement.remove();
        else if (e.target.id === 'confirm-delete-btn' && !confirmButton.disabled) {
            try {
                await deleteUser(auth.currentUser);
                modalElement.remove();
            } catch (error) {
                console.error("Error deleting user:", error);
                showToast("Error al eliminar la cuenta. Es posible que deba iniciar sesión nuevamente.", "error");
            }
        }
    });
}
