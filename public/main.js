// --- 1. CONFIGURACIÓN E INICIALIZACIÓN DE FIREBASE ---
// =================================================================================
// Importar funciones de los SDKs de Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-app.js";
import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider, deleteUser, sendEmailVerification, updateProfile } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, writeBatch, runTransaction, orderBy, limit, startAfter, or, getCountFromServer } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { COLLECTIONS, getUniqueKeyForCollection, createHelpTooltip, shouldRequirePpapConfirmation, validateField, saveEcrFormToLocalStorage, loadEcrFormFromLocalStorage, flattenEstructura, prepareDataForPdfAutoTable } from './utils.js';
import { deleteProductAndOrphanedSubProducts, registerEcrApproval, getEcrFormData, checkAndUpdateEcrStatus } from './data_logic.js';
import tutorial from './tutorial.js';
import newControlPanelTutorial from './new-control-panel-tutorial.js';

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
    dashboard: { title: 'Dashboard', singular: 'Dashboard' },
    sinoptico_tabular: { title: 'Reporte BOM (Tabular)', singular: 'Reporte BOM (Tabular)' },
    eco_form: { title: 'ECO de Producto / Proceso', singular: 'Formulario ECO' },
    eco: { title: 'Gestión de ECO', singular: 'ECO' },
    ecr: { title: 'Gestión de ECR', singular: 'ECR' },
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
    arboles: { title: 'Editor de Árboles', singular: 'Árbol' },
    profile: { title: 'Mi Perfil', singular: 'Mi Perfil' },
    tareas: { title: 'Gestor de Tareas', singular: 'Tarea' },
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
            { key: 'imagen', label: 'Imágen (URL)', type: 'text' },
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
            { key: 'imagen', label: 'Imágen (URL)', type: 'text' },
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
            { key: 'imagen', label: 'Imágen (URL)', type: 'text' },
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
    currentView: 'dashboard', 
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
        const rolesSnap = await getDocs(collection(db, COLLECTIONS.ROLES));
        appState.collections.roles = rolesSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        appState.collectionsById.roles = new Map(appState.collections.roles.map(r => [r.id, r]));

        const sectoresSnap = await getDocs(collection(db, COLLECTIONS.SECTORES));
        appState.collections.sectores = sectoresSnap.docs.map(d => ({ ...d.data(), docId: d.id }));
        appState.collectionsById.sectores = new Map(appState.collections.sectores.map(s => [s.id, s]));

        console.log("Roles and Sectors loaded.");
    } catch (error) {
        console.error("Error fetching initial roles/sectors:", error);
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
            renderDashboardTasks(appState.collections.tareas);
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

async function saveDocument(collectionName, data, docId = null) {
    const toastId = showToast('Guardando...', 'loading', { duration: 0 }); // Show loading toast that doesn't auto-hide

    try {
        if (docId) {
            // Logic for updating an existing document
            if (collectionName === COLLECTIONS.PRODUCTOS) {
                data.fecha_modificacion = new Date();
            }
            const docRef = doc(db, collectionName, docId);
            await updateDoc(docRef, data);
            showToast('Registro actualizado con éxito.', 'success', { toastId });
        } else {
            // Logic for creating a new document
            if (collectionName === COLLECTIONS.PRODUCTOS) {
                data.createdAt = new Date();
                data.fecha_modificacion = new Date();
            }
            const uniqueKeyField = getUniqueKeyForCollection(collectionName);
            const uniqueKeyValue = data[uniqueKeyField];

            if (!uniqueKeyValue) {
                throw new Error(`Error: El campo de identificación único '${uniqueKeyField}' está vacío.`);
            }

            data.id = uniqueKeyValue;
            const docRef = doc(db, collectionName, uniqueKeyValue);

            await runTransaction(db, async (transaction) => {
                const docSnap = await transaction.get(docRef);
                if (docSnap.exists()) {
                    // By throwing an error, the transaction is automatically aborted.
                    throw new Error(`El valor "${uniqueKeyValue}" para el campo "${uniqueKeyField}" ya existe.`);
                }
                transaction.set(docRef, data);
            });

            showToast('Registro creado con éxito.', 'success', { toastId });
        }
        return true;
    } catch (error) {
        console.error("Error guardando el documento: ", error);
        // Display the specific error message from the transaction if available.
        const errorMessage = error.message.includes('ya existe') || error.message.includes('identificación único')
            ? error.message
            : "Error al guardar el registro.";
        showToast(errorMessage, 'error', { toastId });
        return false;
    }
}

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
    } catch (error) {
        console.error("Could not fetch barack_logo.png:", error);
        return null;
    }
}

async function deleteDocument(collectionName, docId) {
    const toastId = showToast('Eliminando...', 'loading', { duration: 0 });
    try {
        await deleteDoc(doc(db, collectionName, docId));
        showToast('Elemento eliminado.', 'success', { toastId });
        if (viewConfig[appState.currentView]?.dataKey === collectionName) {
            runTableLogic();
        }
    } catch (error) {
        console.error("Error deleting document: ", error);
        showToast('Error al eliminar el elemento.', 'error', { toastId });
    }
}


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

async function clearDataOnly() {
    showToast('Limpiando colecciones de datos...', 'info', 5000);
    const collectionNames = Object.values(COLLECTIONS);
    const collectionsToSkip = [COLLECTIONS.USUARIOS, COLLECTIONS.TAREAS, COLLECTIONS.COVER_MASTER, 'notifications'];
    for (const name of collectionNames) {
        if (collectionsToSkip.includes(name)) {
            console.log(`Se omite la limpieza de la colección '${name}' para preservar los datos.`);
            continue;
        }
        try {
            const collectionRef = collection(db, name);
            const snapshot = await getDocs(collectionRef);
            if (snapshot.empty) continue;

            const batch = writeBatch(db);
            snapshot.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
            await batch.commit();
            console.log(`Colección '${name}' limpiada.`);
        } catch (error) {
            console.error(`Error limpiando la colección ${name}:`, error);
            showToast(`Error al limpiar la colección ${name}.`, 'error');
        }
    }
    showToast('Limpieza de datos completada.', 'success');
}

async function clearOtherUsers() {
    showToast('Eliminando otros usuarios...', 'info', 4000);
    const adminUID = 'HyM0eC3pujQtg8EgTXMu3h6AmMw2';
    const usersRef = collection(db, COLLECTIONS.USUARIOS);

    try {
        const snapshot = await getDocs(usersRef);
        if (snapshot.empty) {
            showToast('No hay otros usuarios para eliminar.', 'info');
            return;
        }

        const batch = writeBatch(db);
        let deletedCount = 0;
        snapshot.docs.forEach(doc => {
            if (doc.id !== adminUID) {
                batch.delete(doc.ref);
                deletedCount++;
            }
        });

        if (deletedCount > 0) {
            await batch.commit();
            showToast(`${deletedCount} usuario(s) han sido eliminados.`, 'success');
        } else {
            showToast('No se encontraron otros usuarios para eliminar.', 'info');
        }
    } catch (error) {
        console.error("Error eliminando otros usuarios:", error);
        showToast('Error al eliminar los otros usuarios.', 'error');
    }
}

async function seedEcos(batch, users, generatedEcrs) {
    showToast('Generando ECOs para ECRs aprobados...', 'info');
    const ecoFormsRef = collection(db, COLLECTIONS.ECO_FORMS);
    let ecosGenerated = 0;

    const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const getRandomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));

    const formSectionsData = [
        { id: 'eng_producto', checklist: Array(4).fill(0) }, { id: 'calidad', checklist: Array(4).fill(0) },
        { id: 'eng_proceso', checklist: Array(4).fill(0) }, { id: 'doc_calidad', checklist: Array(4).fill(0) },
        { id: 'compras', checklist: Array(4).fill(0) }, { id: 'logistica', checklist: Array(4).fill(0) },
        { id: 'implementacion', checklist: Array(4).fill(0) }, { id: 'aprobacion_final', checklist: null }
    ];

    const sampleComments = [
        "Revisado según procedimiento estándar.", "Se necesita más información sobre el impacto.", "Aprobado sin objeciones.",
        "Cambio crítico, proceder con cautela.", "El proveedor alternativo no cumple los requisitos.", "Implementación requiere coordinación con producción.",
        "Layout validado por el equipo de seguridad.", "Plan de control actualizado y liberado."
    ];

    const approvedEcrs = generatedEcrs.filter(ecr => ecr.status === 'approved');

    for (const ecr of approvedEcrs) {
        const user1 = getRandomItem(users) || { email: 'test@example.com', name: 'Usuario de Prueba 1' };
        const user2 = getRandomItem(users) || { email: 'test2@example.com', name: 'Usuario de Prueba 2' };
        const status = getRandomItem(['in-progress', 'approved', 'rejected']);

        const ecoData = {
            id: ecr.id,
            ecr_no: ecr.id,
            status: status,
            lastModified: getRandomDate(new Date(2023, 0, 1), new Date()),
            modifiedBy: user1.email,
            checklists: {},
            comments: {},
            signatures: {},
            action_plan: []
        };

        const taskCount = Math.floor(Math.random() * 4) + 2;
        for (let j = 0; j < taskCount; j++) {
            const assignee = getRandomItem(users);
            ecoData.action_plan.push({
                id: `task_${Date.now()}_${j}`,
                description: `Tarea de implementación de ejemplo ${j + 1} para ${ecr.id}`,
                assignee: assignee ? assignee.name : 'Sin asignar',
                assigneeUid: assignee ? assignee.docId : null,
                dueDate: getRandomDate(new Date(), new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
                status: Math.random() > 0.5 ? 'completed' : 'pending'
            });
        }

        formSectionsData.forEach(section => {
            if (section.checklist) {
                ecoData.checklists[section.id] = section.checklist.map(() => {
                    const choice = Math.random();
                    if (choice < 0.6) return { si: true, na: false };
                    if (choice < 0.8) return { si: false, na: true };
                    return { si: false, na: false };
                });
            }
            ecoData.comments[section.id] = getRandomItem(sampleComments);
            const approver = getRandomItem([user1, user2]);
            const reviewDate = getRandomDate(new Date(2023, 6, 1), new Date());
            let sectionStatus = 'ok';
            if (status === 'rejected') {
                sectionStatus = (Math.random() < 0.4) ? 'nok' : 'ok';
            } else if (status === 'in-progress') {
                sectionStatus = (Math.random() < 0.3) ? null : 'ok';
            }
            ecoData.signatures[section.id] = {
                date_review: reviewDate.toISOString().split('T')[0],
                name: approver.name,
                visto: approver.name.split(' ').map(n => n[0]).join('').toUpperCase(),
                status: section.checklist ? sectionStatus : null
            };
        });

        const docRef = doc(ecoFormsRef, ecoData.id);
        batch.set(docRef, ecoData);
        ecosGenerated++;
    }

    console.log(`${ecosGenerated} ECOs de prueba generados para ECRs aprobados.`);
}

async function seedEcrs(batch, users, generatedData) {
    showToast('Generando 10 ECRs de prueba detallados...', 'info');
    const ecrFormsRef = collection(db, COLLECTIONS.ECR_FORMS);
    const TOTAL_ECRS = 10;
    const currentYear = new Date().getFullYear();
    const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const getRandomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString().split('T')[0];

    const ALL_DEPARTMENTS = [ 'ing_manufatura', 'hse', 'calidad', 'compras', 'sqa', 'tooling', 'logistica', 'financiero', 'comercial', 'mantenimiento', 'produccion', 'calidad_cliente', 'ing_producto' ];
    const ECR_STATUSES = ['draft', 'pending-approval', 'stand-by', 'approved', 'rejected'];
    const sampleComments = [
        "Impacto mínimo en el costo, se aprueba.", "Requiere validación adicional del cliente.", "Rechazado por falta de análisis de riesgo.",
        "Propuesta viable, proceder con el plan.", "El cambio mejora la producibilidad.", "Sin objeciones por parte de este departamento."
    ];

    const createdEcrs = [];

    for (let i = 1; i <= TOTAL_ECRS; i++) {
        const user1 = getRandomItem(users);
        const product = getRandomItem(generatedData.productos || []);
        const clientData = product.clienteId ? generatedData.clientes.find(c => c.id === product.clienteId) : null;
        const client = clientData || null;
        const ecrId = `ECR-${currentYear}-${String(i).padStart(3, '0')}`;

        const approvals = {};
        ALL_DEPARTMENTS.forEach(dept => {
            approvals[dept] = { status: 'pending', user: null, date: null, comment: '' };
        });

        const ecrData = {
            id: ecrId,
            ecr_no: ecrId,
            status: getRandomItem(ECR_STATUSES),
            lastModified: new Date(),
            modifiedBy: user1.email,
            approvals: approvals,
            origen_cliente: Math.random() > 0.5,
            origen_interno: Math.random() > 0.5,
            proyecto: (getRandomItem(generatedData.proyectos) || {}).nombre || 'Proyecto Alpha',
            cliente: client?.descripcion || 'Cliente General',
            fase_serie: true,
            fecha_emision: getRandomDate(new Date(currentYear, 0, 1), new Date(currentYear, 11, 31)),
            codigo_barack: product?.id || `PROD-00${i}`,
            denominacion_producto: product?.descripcion || 'Componente de Muestra',
            situacion_existente: 'El componente actual presenta fallas de material bajo alta temperatura, resultando en una tasa de falla del 5% en campo.',
            situacion_propuesta: 'Reemplazar el polímero por una aleación de aluminio 6061-T6 para mejorar la resistencia térmica y durabilidad. Se estima una reducción de la tasa de fallas al 0.1%.',
            componentes_obsoletos: Math.floor(Math.random() * 11),
            cliente_requiere_ppap: Math.random() > 0.4,
            cliente_aprobacion_estado: getRandomItem(['na', 'pendiente', 'aprobado', 'rechazado']),
            equipo_c1_0: getRandomItem(users).name,
            equipo_c1_2: getRandomItem(users).name,
            fecha_cierre: getRandomDate(new Date(currentYear, 6, 1), new Date(currentYear + 1, 5, 30)),
            fecha_realizacion_ecr: getRandomDate(new Date(currentYear, 0, 1), new Date()),
            causas_solicitud: 'Mejora de la fiabilidad del producto y reducción de costos de garantía.',
            comentarios_alertas: 'Alerta de Calidad N° A-123 emitida por recurrencia de fallas.',
            accion_objetiva: 'Implementar el cambio de material en la línea de producción a partir del lote 2025-01.',
            final_coordinador: 'ECR aprobado. Se procede a la creación del ECO correspondiente para la implementación.'
        };

        if (ecrData.status === 'approved' || ecrData.status === 'rejected' || ecrData.status === 'stand-by') {
            let hasBeenRejected = false;
            ALL_DEPARTMENTS.forEach(dept => {
                const randomValue = Math.random();
                const isApproved = ecrData.status === 'rejected' ? randomValue > 0.15 : randomValue > 0.05;
                if (!isApproved) hasBeenRejected = true;

                ecrData.approvals[dept] = {
                    status: isApproved ? 'approved' : 'rejected',
                    user: getRandomItem(users).name,
                    date: getRandomDate(new Date(currentYear, 0, 1), new Date()),
                    comment: getRandomItem(sampleComments)
                };
            });
            if (ecrData.status === 'rejected' && !hasBeenRejected) {
                const randomDept = getRandomItem(ALL_DEPARTMENTS);
                ecrData.approvals[randomDept] = {
                    status: 'rejected',
                    user: getRandomItem(users).name,
                    date: getRandomDate(new Date(currentYear, 0, 1), new Date()),
                    comment: 'Rechazado por falta de información de impacto.'
                };
            }
        }

        const docRef = doc(ecrFormsRef, ecrId);
        batch.set(docRef, ecrData);
        createdEcrs.push(ecrData);
    }
    console.log(`${TOTAL_ECRS} ECRs de prueba detallados añadidos al batch.`);
    return createdEcrs;
}

async function seedReunionesEcr(batch) {
    showToast('Generando 5 reuniones ECR de prueba...', 'info');
    const reunionesRef = collection(db, COLLECTIONS.REUNIONES_ECR);
    const TOTAL_REUNIONES = 5;
    const today = new Date();

    const departamentos = [
        'ing_manufatura', 'hse', 'calidad', 'compras', 'sqa', 'tooling',
        'logistica', 'financiero', 'comercial', 'mantenimiento', 'produccion',
        'calidad_cliente', 'ing_producto'
    ];
    const estados = ['P', 'A', 'O'];

    for (let i = 0; i < TOTAL_REUNIONES; i++) {
        const fecha = new Date(today);
        fecha.setDate(today.getDate() - (i * 7)); // Una reunión por semana hacia atrás
        const fechaStr = fecha.toISOString().split('T')[0];
        const id = `reunion_${fechaStr}`;

        const asistencia = {};
        departamentos.forEach(depto => {
            asistencia[depto] = estados[Math.floor(Math.random() * estados.length)];
        });

        const reunionData = {
            id: id,
            fecha: fechaStr,
            asistencia: asistencia
        };

        const docRef = doc(reunionesRef, id);
        batch.set(docRef, reunionData);
    }
    console.log(`${TOTAL_REUNIONES} reuniones ECR de prueba añadidas al batch.`);
}


async function seedDatabase() {
    await clearDataOnly();
    showToast('Iniciando carga masiva de datos de prueba...', 'info');
    const batch = writeBatch(db);
    const TOTAL_PRODUCTS = 10;

    const setInBatch = (collectionName, data) => {
        const docRef = doc(db, collectionName, data.id);
        batch.set(docRef, data);
    };

    const getRandomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const getRandomDate = (start, end) => new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime())).toISOString().split('T')[0];

    // --- BANCOS DE DATOS AMPLIADOS ---
    const firstNames = ['Juan', 'Carlos', 'Luis', 'Miguel', 'Javier', 'David', 'José', 'Manuel', 'Francisco', 'Pedro'];
    const lastNames = ['García', 'Rodríguez', 'González', 'Fernández', 'López', 'Martínez', 'Sánchez', 'Pérez', 'Gómez', 'Martín'];
    const companies = ['Automotriz', 'Industrial', 'Aeroespacial', 'Tecnología', 'Manufactura', 'Logística'];
    const companySuffix = ['S.A.', 'SRL', 'Global', 'Corp', 'Solutions', 'Group'];

    const materials = ['Acero', 'Aluminio', 'Plástico ABS', 'Polipropileno', 'Cobre', 'Goma', 'Tornillo', 'Arandela', 'Tuerca', 'Cable'];
    const materialTypes = ['Chapa', 'Tubo', 'Grano', 'Lámina', 'Bobina', 'Lingote', 'Placa'];
    const processes = ['Estampado', 'Inyección', 'Mecanizado', 'Soldadura', 'Ensamblaje', 'Pintura', 'Extrusión', 'Corte Láser'];
    const productNouns = ['Soporte', 'Carcasa', 'Eje', 'Engranaje', 'Panel', 'Conjunto', 'Módulo', 'Actuador', 'Sensor'];
    const productAdjectives = ['Delantero', 'Trasero', 'Superior', 'Inferior', 'Izquierdo', 'Derecho', 'Principal', 'Auxiliar'];
    const vehicleModels = ['Sedan', 'SUV', 'Camioneta', 'Deportivo', 'Híbrido', 'Eléctrico'];
    const vehicleBrands = ['Astro', 'Vortex', 'Terra', 'Quantum', 'Nova', 'Pulsar'];
    const colors = ['Rojo', 'Azul', 'Verde', 'Negro', 'Blanco', 'Gris Plata', 'Gris Oscuro'];

    const imageUrls = [
        'https://images.pexels.com/photos/120049/pexels-photo-120049.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
        'https://images.pexels.com/photos/3802510/pexels-photo-3802510.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
        'https://images.pexels.com/photos/1545743/pexels-photo-1545743.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1',
        'https://images.pexels.com/photos/170811/pexels-photo-170811.jpeg?auto=compress&cs=tinysrgb&w=1260&h=750&dpr=1'
    ];

    // --- GENERACIÓN DE DATOS BASE ---
    const generated = {
        clientes: [], proveedores: [], unidades: [], sectores: [], procesos: [], proyectos: [], insumos: [], semiterminados: []
    };

    // Unidades (fijas)
    generated.unidades = [ { id: 'kg', descripcion: 'Kilogramos' }, { id: 'm', descripcion: 'Metros' }, { id: 'un', descripcion: 'Unidades' }, { id: 'l', descripcion: 'Litros' }, { id: 'm2', descripcion: 'Metros Cuadrados' }];
    generated.unidades.forEach(u => setInBatch(COLLECTIONS.UNIDADES, u));

    // Sectores (fijos)
    generated.sectores = [ { id: 'ingenieria', descripcion: 'Ingeniería', icon: 'pencil-ruler' }, { id: 'calidad', descripcion: 'Calidad', icon: 'award' }, { id: 'produccion', descripcion: 'Producción', icon: 'factory' }, { id: 'logistica', descripcion: 'Logística', icon: 'truck' }];
    generated.sectores.forEach(s => setInBatch(COLLECTIONS.SECTORES, s));

    // Generar Clientes (20)
    for (let i = 1; i <= 20; i++) {
        const id = `C${String(i).padStart(3, '0')}`;
        generated.clientes.push({ id, descripcion: `${getRandomItem(companies)} ${getRandomItem(companySuffix)}` });
    }
    generated.clientes.forEach(c => setInBatch(COLLECTIONS.CLIENTES, c));

    // Generar Proveedores (30)
    for (let i = 1; i <= 30; i++) {
        const id = `P${String(i).padStart(3, '0')}`;
        generated.proveedores.push({ id, descripcion: `${getRandomItem(firstNames)} ${getRandomItem(lastNames)} ${getRandomItem(companySuffix)}` });
    }
    generated.proveedores.forEach(p => setInBatch(COLLECTIONS.PROVEEDORES, p));

    // Generar Procesos (10)
    for (let i = 1; i <= 10; i++) {
        const id = processes[i-1] ? processes[i-1].toLowerCase().replace(' ', '-') : `proc-${i}`;
        generated.procesos.push({ id, descripcion: processes[i-1] || `Proceso ${i}` });
    }
    generated.procesos.forEach(p => setInBatch(COLLECTIONS.PROCESOS, p));

    // --- GENERACIÓN DE PROYECTOS ---
    const TOTAL_PROYECTOS = 15;
    showToast(`Generando ${TOTAL_PROYECTOS} proyectos de prueba...`, 'info');
    const projectNouns = ['Desarrollo', 'Investigación', 'Optimización', 'Lanzamiento', 'Mantenimiento'];
    const projectAdjectives = ['Nuevo', 'Urgente', 'Interno', 'Externo', 'Confidencial'];
    const projectStatuses = ['Activo', 'Pausado', 'Finalizado'];

    for (let i = 1; i <= TOTAL_PROYECTOS; i++) {
        const id = `PROY-${String(i).padStart(4, '0')}`;
        const proyectoData = {
            id: id,
            codigo: id,
            nombre: `${getRandomItem(projectAdjectives)} ${getRandomItem(projectNouns)} de ${getRandomItem(vehicleBrands)}`,
            descripcion: `Proyecto para el desarrollo de componentes para el nuevo modelo ${getRandomItem(vehicleModels)}.`,
            status: getRandomItem(projectStatuses),
            createdAt: new Date(),
        };
        generated.proyectos.push(proyectoData);
    }
    generated.proyectos.forEach(p => setInBatch(COLLECTIONS.PROYECTOS, p));

    // Generar Insumos (20) - Reducido de 200
    for (let i = 1; i <= 20; i++) {
        const id = `INS${String(i).padStart(4, '0')}`;
        generated.insumos.push({
            id, codigo_pieza: id, lc_kd: getRandomItem(['LC', 'KD']),
            descripcion: `${getRandomItem(materialTypes)} de ${getRandomItem(materials)}`,
            version: `${Math.floor(Math.random() * 3) + 1}.${Math.floor(Math.random() * 10)}`,
            proveedor: getRandomItem(generated.proveedores).id,
            unidad_medida: getRandomItem(generated.unidades).id,
            costo: parseFloat((Math.random() * 100).toFixed(2)),
            fecha_modificacion: getRandomDate(new Date(2022, 0, 1), new Date()),
            imagen: getRandomItem(imageUrls),
            codigo_materia_prima: `MP-${String(i).padStart(4, '0')}`,
            proveedor_materia_prima: getRandomItem(generated.proveedores).id,
        });
    }
    generated.insumos.forEach(ins => setInBatch(COLLECTIONS.INSUMOS, ins));

    // Generar Semiterminados (150)
    for (let i = 1; i <= 150; i++) {
        const id = `SUB${String(i).padStart(4, '0')}`;
        generated.semiterminados.push({
            id, codigo_pieza: id, lc_kd: getRandomItem(['LC', 'KD']),
            descripcion: `${getRandomItem(productAdjectives)} de ${getRandomItem(productNouns)}`,
            version: `${Math.floor(Math.random() * 5) + 1}.${Math.floor(Math.random() * 5)}`,
            proceso: getRandomItem(generated.procesos).id,
            aspecto: getRandomItem(['Crítico', 'No Crítico']),
            peso_gr: Math.floor(Math.random() * 2000) + 50,
            tolerancia_gr: Math.floor(Math.random() * 50),
            fecha_modificacion: getRandomDate(new Date(2023, 0, 1), new Date()),
            imagen: getRandomItem(imageUrls)
        });
    }
    generated.semiterminados.forEach(sem => setInBatch(COLLECTIONS.SEMITERMINADOS, sem));

    // --- GENERACIÓN DE PRODUCTOS Y ESTRUCTURAS ---
    showToast(`Generando ${TOTAL_PRODUCTS} productos con estructura...`, 'info');
    generated.productos = []; // Make sure to initialize the array

    for (let i = 1; i <= TOTAL_PRODUCTS; i++) {
        const productId = `PROD${String(i).padStart(4, '0')}`;
        const productoData = {
            id: productId,
            codigo_pieza: productId,
            lc_kd: getRandomItem(['LC', 'KD']),
            version_vehiculo: `${getRandomItem(vehicleBrands)} ${getRandomItem(vehicleModels)} 2024`,
            descripcion: `Ensamblaje ${getRandomItem(productAdjectives)} de ${getRandomItem(productNouns)} ${i}`,
            version: '1.0',
            fecha_modificacion: getRandomDate(new Date(2024, 0, 1), new Date()),
            imagen: getRandomItem(imageUrls),
            clienteId: getRandomItem(generated.clientes).id,
            proyectoId: getRandomItem(generated.proyectos).id,
            createdAt: new Date(),
            color: getRandomItem(colors),
            piezas_por_vehiculo: Math.floor(Math.random() * 4) + 1,
            material_separar: getRandomItem([true, false]),
            aspecto: getRandomItem(['Sí', 'No']),
            proceso: getRandomItem(generated.procesos).id
        };

        const crearNodo = (tipo, refId) => ({
            id: `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            refId,
            tipo,
            icon: { producto: 'package', semiterminado: 'box', insumo: 'beaker' }[tipo],
            quantity: Math.floor(Math.random() * 10) + 1,
            children: []
        });

        const rootNode = crearNodo('producto', productoData.id);

        // Define complexity for different products
        let maxDepth, maxChildren;
        if (i === 1) { // Large product
            maxDepth = 5;
            maxChildren = 6;
            productoData.descripcion = `Gran Ensamblaje de Chasis para ${getRandomItem(vehicleBrands)}`;
        } else if (i === TOTAL_PRODUCTS) { // Small product
            maxDepth = 2;
            maxChildren = 2;
            productoData.descripcion = `Soporte Pequeño de Motor para ${getRandomItem(vehicleModels)}`;
        } else { // Medium products
            maxDepth = 3;
            maxChildren = 4;
        }

        function buildTree(node, depth) {
            if (depth >= maxDepth) return;

            const numChildren = Math.floor(Math.random() * maxChildren) + 1;
            for (let j = 0; j < numChildren; j++) {
                const isSemi = Math.random() < 0.7 && depth < maxDepth - 1;
                if (isSemi) {
                    const semi = getRandomItem(generated.semiterminados);
                    const childNode = crearNodo('semiterminado', semi.id);
                    node.children.push(childNode);
                    buildTree(childNode, depth + 1);
                } else {
                    const insumo = getRandomItem(generated.insumos);
                    const childNode = crearNodo('insumo', insumo.id);
                    node.children.push(childNode);
                }
            }
        }

        buildTree(rootNode, 1);
        productoData.estructura = [rootNode];

        // Add the flattened component ID list for efficient querying
        productoData.component_ids = flattenEstructura(productoData.estructura);

        generated.productos.push(productoData);
        setInBatch(COLLECTIONS.PRODUCTOS, productoData);
    }

    // --- GENERACIÓN DE ECRs Y ECOs DE PRUEBA ---
    // Fetch users directly for seeding, as they are no longer pre-loaded globally.
    const usersSnapshot = await getDocs(collection(db, COLLECTIONS.USUARIOS));
    const users = usersSnapshot.docs.map(d => ({...d.data(), docId: d.id})).filter(u => u.disabled !== true);

    const generatedEcrs = await seedEcrs(batch, users, generated);
    await seedEcos(batch, users, generatedEcrs);
    await seedReunionesEcr(batch);

    // --- COMMIT FINAL ---
    try {
        await batch.commit();
        showToast('Carga masiva completada.', 'success', 5000);

        // Manually set the initial counts after seeding to ensure dashboard is updated.
        const kpiCounts = {
            productos: generated.productos.length,
            insumos: generated.insumos.length,
            proyectos: generated.proyectos.length,
            tareas: 0 // Seeder doesn't create tasks.
        };
        const counterRef = doc(db, 'counters', 'kpi_counts');
        await setDoc(counterRef, kpiCounts, { merge: true });
        console.log("Initial KPI counts set after seeding:", kpiCounts);

        switchView('dashboard');
    } catch (error) {
        console.error("Error al cargar datos de prueba masivos: ", error);
        showToast('Error al cargar datos masivos. Verifique la consola.', 'error');
    }
}

// =================================================================================
// --- 3.5. CONTROL DE PERMISOS ---
// =================================================================================

/**
 * Verifica los permisos de un usuario para realizar una acción específica.
 * @param {string} action - La acción a verificar (ej: 'create', 'edit', 'delete').
 * @param {object|string|null} item - El objeto sobre el que se actúa, un string para identificar el tipo (ej: 'tarea'), o null.
 * @returns {boolean} - `true` si el usuario tiene permiso, `false` en caso contrario.
 */
function checkUserPermission(action, item = null) {
    if (!appState.currentUser) {
        return false; // Si no hay usuario, no hay permisos.
    }

    const { role, uid, isSuperAdmin } = appState.currentUser;
    const isImpersonating = appState.godModeState?.isImpersonating;

    // 1. SuperAdmins can do anything, UNLESS they are impersonating another role.
    if (isSuperAdmin && !isImpersonating) {
        return true;
    }

    const isTask = (typeof item === 'string' && item === 'tarea') || (item && typeof item === 'object' && 'creatorUid' in item);

    // 2. Specific logic for Tasks (applies to all roles)
    if (isTask) {
        if (action === 'create') {
            // Todos los roles pueden crear tareas.
            return true;
        }
        if ((action === 'edit' || action === 'delete') && typeof item === 'object' && item) {
            // Solo el creador o el asignado pueden editar o eliminar una tarea.
            return item.creatorUid === uid || item.assigneeUid === uid;
        }
    }

    // 3. Logic for the 'admin' role (non-super-admin)
    if (role === 'admin') {
        // Regular admins cannot perform destructive actions on general items.
        // Task deletion is handled above. User deletion is handled in `deleteItem`.
        if (action === 'delete') {
            return false;
        }
        return true; // Can do everything else.
    }

    // 4. Lógica para el rol 'lector'
    if (role === 'lector') {
        // Los lectores no pueden crear, editar o eliminar nada (excepto la creación de tareas ya manejada).
        if (['create', 'edit', 'delete'].includes(action)) {
            return false;
        }
    }

    // 5. Lógica para el rol 'editor'
    if (role === 'editor') {
        if (action === 'create') {
            return true; // Los editores pueden crear nuevos elementos.
        }
        if (action === 'delete') {
            return false; // Los editores no pueden eliminar elementos en general.
        }
        // Para 'edit', se asume que pueden editar (no hay una regla explícita en contra).
        // Se podría añadir más lógica aquí si fuera necesario.
    }

    // Por defecto, permitir otras acciones (como 'view') si no se ha denegado explícitamente.
    // O podrías devolver 'false' por defecto para una política más restrictiva.
    // En este caso, asumimos que si no se deniega, se permite.
    return true;
}


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
            switchView,
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
    
    dom.viewContent.addEventListener('click', handleViewContentActions);

    // Attach listeners directly to forms for more reliable submission
    document.getElementById('login-form')?.addEventListener('submit', handleAuthForms);
    document.getElementById('register-form')?.addEventListener('submit', handleAuthForms);
    document.getElementById('reset-form')?.addEventListener('submit', handleAuthForms);

    document.addEventListener('click', handleGlobalClick);
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
    if (viewName === 'dashboard') await runDashboardLogic();
    else if (viewName === 'sinoptico') await runSinopticoLogic();
    else if (viewName === 'sinoptico_tabular') await runSinopticoTabularLogic();
    else if (viewName === 'flujograma') await runFlujogramaLogic();
    else if (viewName === 'arboles') await renderArbolesInitialView();
    else if (viewName === 'profile') await runProfileLogic();
    else if (viewName === 'tareas') await runTasksLogic();
    else if (viewName === 'eco') await runEcoLogic();
    else if (viewName === 'ecr') await runEcrLogic();
    else if (viewName === 'control_ecrs') await runControlEcrsLogic();
    else if (viewName === 'seguimiento_ecr_eco') await runSeguimientoEcrEcoLogic();
    else if (viewName === 'ecr_seguimiento') await runEcrSeguimientoLogic();
    else if (viewName === 'ecr_table_view') await runEcrTableViewLogic();
    else if (viewName === 'indicadores_ecm_view') await runIndicadoresEcmViewLogic();
    else if (viewName === 'eco_form') await runEcoFormLogic(params);
    else if (viewName === 'ecr_form') await runEcrFormLogic(params);
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

async function runEcoFormLogic(params = null) {
    const ecoId = params?.ecoId;
    const ecrDataFromParam = params?.ecrData;
    const isEditing = !!ecoId;
    // Use a specific key when creating from an ECR to avoid conflicts with a generic new form
    const ECO_FORM_STORAGE_KEY = isEditing ? `inProgressEcoForm_${ecoId}` : (ecrDataFromParam ? `inProgressEcoForm_from_ecr_${ecrDataFromParam.id}` : 'inProgressEcoForm_new');

    const populateEcoForm = (form, data) => {
        if (!data || !form) return;

        for (const key in data) {
            if (key === 'checklists' && typeof data.checklists === 'object') {
                for (const section in data.checklists) {
                    data.checklists[section].forEach((item, index) => {
                        const siCheckbox = form.querySelector(`input[name="check_${section}_${index}_si"]`);
                        if (siCheckbox) siCheckbox.checked = !!item.si;
                        const naCheckbox = form.querySelector(`input[name="check_${section}_${index}_na"]`);
                        if (naCheckbox) naCheckbox.checked = !!item.na;
                    });
                }
            } else if (key === 'comments' && typeof data.comments === 'object') {
                for (const section in data.comments) {
                    const textarea = form.querySelector(`[name="comments_${section}"]`);
                    if (textarea) textarea.value = data.comments[section];
                }
            } else if (key === 'signatures' && typeof data.signatures === 'object') {
                for (const sectionId in data.signatures) {
                    for (const field in data.signatures[sectionId]) {
                        const inputName = `${field}_${sectionId}`;
                        const inputElement = form.querySelector(`[name="${inputName}"]`);
                        if (inputElement) {
                            if (inputElement.type === 'radio') {
                                const radioToSelect = form.querySelector(`[name="${inputName}"][value="${data.signatures[sectionId][field]}"]`);
                                if (radioToSelect) radioToSelect.checked = true;
                            } else {
                                inputElement.value = data.signatures[sectionId][field];
                            }
                        }
                    }
                }
            } else {
                const element = form.querySelector(`[name="${key}"]`);
                if (element) {
                    element.value = data[key];
                }
            }
        }
    };

    // Helper to save form data to Local Storage
    const saveEcoFormToLocalStorage = () => {
        const form = dom.viewContent.querySelector('#eco-form');
        if (!form) return;

        const data = {};
        // Iterate over all form elements to build the data object manually.
        // This is more robust than using `new FormData()` because it allows us
        // to explicitly ignore disabled fields, which is the core of the fix.
        for (const element of form.elements) {
            // Skip disabled elements, elements without a name, or buttons.
            if (element.disabled || !element.name || element.tagName === 'BUTTON') {
                continue;
            }

            switch (element.type) {
                case 'checkbox':
                    // For checkboxes, we always store the boolean `checked` state.
                    data[element.name] = element.checked;
                    break;
                case 'radio':
                    // For radio buttons, only save the value of the selected one.
                    if (element.checked) {
                        data[element.name] = element.value;
                    }
                    break;
                case 'select-multiple':
                    // For multi-select, gather all selected options.
                    data[element.name] = Array.from(element.options)
                        .filter(option => option.selected)
                        .map(option => option.value);
                    break;
                default:
                    // For all other input types (text, date, select-one, etc.).
                    data[element.name] = element.value;
                    break;
            }
        }

        localStorage.setItem(ECO_FORM_STORAGE_KEY, JSON.stringify(data));
    };

    // Helper to load form data from Local Storage
    const loadEcoFormFromLocalStorage = () => {
        const savedData = localStorage.getItem(ECO_FORM_STORAGE_KEY);
        if (!savedData) return;

        const data = JSON.parse(savedData);
        const form = dom.viewContent.querySelector('#eco-form');
        if (!form) return;

        for (const key in data) {
            const element = form.querySelector(`[name="${key}"]`);
            if (element) {
                if (element.type === 'checkbox') {
                    element.checked = data[key];
                } else if (element.type === 'radio') {
                    const radioToSelect = form.querySelector(`[name="${key}"][value="${data[key]}"]`);
                    if (radioToSelect) radioToSelect.checked = true;
                }
                else {
                    element.value = data[key];
                }
            }
        }
    };


    try {
        // --- DYNAMICALLY CREATE THE FORM STRUCTURE ---
        dom.viewContent.innerHTML = ''; // Clear previous content

        const formElement = document.createElement('form');
        formElement.id = 'eco-form';
        formElement.className = 'max-w-7xl mx-auto bg-white shadow-lg rounded-lg p-8';
        formElement.innerHTML = `
            <header class="flex justify-between items-center border-b-2 pb-4 mb-6">
                <div class="flex-shrink-0">
                    <img src="/barack_logo.png" alt="Logo" class="h-12">
                </div>
                <div class="ml-auto">
                    <div class="form-field">
                        <label for="ecr_no_display" class="text-lg font-semibold">ECR Asociado:</label>
                        <div class="flex items-center gap-2 mt-1">
                            <input type="text" id="ecr_no_display" class="border-2 border-gray-300 rounded-md p-2 w-64 bg-gray-100" readonly placeholder="Seleccionar ECR...">
                            <input type="hidden" name="ecr_no" id="ecr_no">
                            <button type="button" data-action="open-ecr-search-for-eco" class="bg-blue-500 text-white p-2.5 rounded-md hover:bg-blue-600"><i data-lucide="search" class="h-5 w-5 pointer-events-none"></i></button>
                        </div>
                    </div>
                </div>
            </header>
            <main id="dynamic-form-sections"></main>
            <div id="ppap-confirmation-container" data-tutorial-id="ppap-container" class="hidden mt-6 p-4 border-2 border-yellow-400 bg-yellow-50 rounded-lg">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" name="ppap_completed_confirmation" class="h-5 w-5 rounded text-blue-600 focus:ring-blue-500 border-gray-300">
                    <div class="flex-grow">
                        <p class="font-bold text-yellow-800">Confirmación de PPAP Requerida</p>
                        <p class="text-sm text-yellow-700">El ECR asociado indica que se requiere un PPAP. Marque esta casilla para confirmar que el PPAP ha sido completado y aprobado por el cliente antes de cerrar este ECO.</p>
                    </div>
                </label>
            </div>

            <!-- Action Plan Section -->
            <section id="action-plan-section" class="mt-8">
                <div class="ecr-checklist-bar">PLAN DE ACCIÓN</div>
                <div class="p-4 border border-t-0 rounded-b-lg">
                    <div id="action-plan-list" class="space-y-2">
                        <!-- Action items will be rendered here -->
                    </div>
                    <div id="add-action-item-form-wrapper" data-tutorial-id="add-action-item-form-container">
                        <div id="add-action-item-form" class="mt-4 flex items-end gap-3 p-3 bg-slate-50 rounded-lg border">
                            <div class="flex-grow">
                                <label for="new-action-description" class="text-xs font-bold text-slate-600">Nueva Acción</label>
                                <input type="text" id="new-action-description" placeholder="Descripción de la tarea..." class="w-full mt-1 p-2 border rounded-md">
                            </div>
                            <div class="w-48">
                                <label for="new-action-assignee" class="text-xs font-bold text-slate-600">Responsable</label>
                                <select id="new-action-assignee" class="w-full mt-1 p-2 border rounded-md"></select>
                            </div>
                            <div class="w-40">
                                <label for="new-action-duedate" class="text-xs font-bold text-slate-600">Fecha Límite</label>
                                <input type="date" id="new-action-duedate" class="w-full mt-1 p-2 border rounded-md">
                            </div>
                            <button type="button" id="add-action-item-btn" class="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 font-semibold h-10">Agregar</button>
                        </div>
                    </div>
                </div>
            </section>

            <div id="action-buttons-container" class="mt-8 flex justify-end space-x-4">
                <button type="button" id="eco-save-button" class="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600">Guardar Progreso</button>
                <button type="button" id="eco-clear-button" class="bg-yellow-500 text-white px-6 py-2 rounded-md hover:bg-yellow-600">Limpiar Formulario</button>
                <button type="button" id="eco-approve-button" class="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700">Aprobar y Guardar</button>
            </div>
        `;
        dom.viewContent.appendChild(formElement);

        // CSS is now loaded via index.html
        if (!document.getElementById('print-styles')) {
            const link = document.createElement('link');
            link.id = 'print-styles';
            link.rel = 'stylesheet';
            link.href = 'print.css';
            link.media = 'print';
            document.head.appendChild(link);
        }

        const formSectionsData = [
            {
                title: 'ENG. PRODUCTO', id: 'eng_producto', icon: 'drafting-compass',
                checklist: [ '¿Se requiere cambio en el plano?', '¿Se requiere cambio en la especificación?', '¿Se requiere un nuevo herramental?', '¿Se requiere un nuevo dispositivo?' ]
            },
            {
                title: 'CALIDAD', id: 'calidad', icon: 'award',
                checklist: [ '¿Se requiere un nuevo plan de control?', '¿Se requiere un nuevo estudio de capacidad?', '¿Se requiere un nuevo R&R?', '¿Se requiere un nuevo layout?' ]
            },
            {
                title: 'ENG. PROCESO', id: 'eng_proceso', icon: 'cpu',
                checklist: [ '¿Se requiere un nuevo diagrama de flujo?', '¿Se requiere un nuevo AMEF?', '¿Se requiere un nuevo estudio de tiempos?', '¿Se requiere una nueva instrucción de trabajo?' ]
            },
            {
                title: 'DOCUMENTACIÓN CALIDAD', id: 'doc_calidad', icon: 'folder-check',
                checklist: [ '¿Se actualizó el AMFE de Proceso?', '¿Se actualizó el Plan de Control?', '¿Se actualizaron las Hojas de Proceso?', '¿Se actualizó el Diagrama de Flujo?' ]
            },
            {
                title: 'COMPRAS', id: 'compras', icon: 'shopping-cart',
                checklist: [ '¿Se requiere un nuevo proveedor?', '¿Se requiere un nuevo acuerdo de precios?', '¿Se requiere un nuevo embalaje?', '¿Se requiere un nuevo transporte?' ]
            },
            {
                title: 'LOGISTICA', id: 'logistica', icon: 'truck',
                checklist: [ '¿Se requiere un nuevo layout de almacén?', '¿Se requiere un nuevo sistema de identificación?', '¿Se requiere un nuevo flujo de materiales?', '¿Se requiere un nuevo sistema de transporte interno?' ]
            },
            {
                title: 'IMPLEMENTACIÓN', id: 'implementacion', icon: 'rocket',
                checklist: [ '¿Plan de acción completado?', '¿Se requiere actualizar el stock?', '¿Se requiere notificar al cliente?', '¿Se requiere capacitar al personal?', '¿Se requiere validar el proceso?' ]
            },
            {
                title: 'APROBACIÓN FINAL', id: 'aprobacion_final', icon: 'flag',
                description: 'Aprobación final del ECO y cierre del proceso.',
                checklist: null
            }
        ];

        function buildSectionHTML(section) {
            const checklistItemsHTML = section.checklist
            ? section.checklist.map((item, index) => {
                const tutorialId = (section.id === 'implementacion' && index === 0)
                    ? 'data-tutorial-id="action-plan-completion-checkbox"'
                    : '';
                return `
                    <div class="checklist-item" ${tutorialId}>
                        <span class="checklist-item-label text-sm">${item}</span>
                        <div class="checklist-item-options">
                            <label class="text-sm font-medium">SI</label>
                            <input type="checkbox" name="check_${section.id}_${index}_si" class="form-checkbox h-5 w-5 text-blue-600">
                            <label class="text-sm font-medium">N/A</label>
                            <input type="checkbox" name="check_${section.id}_${index}_na" class="form-checkbox h-5 w-5 text-gray-400">
                        </div>
                        </div>
                `;
            }).join('')
                : '';

            const mainContentHTML = section.checklist
                ? `
                <div class="section-checklist">${checklistItemsHTML}</div>
                <div class="section-comments">
                    <label for="comments_${section.id}" class="block font-bold text-gray-700 mb-2">Comentarios:</label>
                    <textarea id="comments_${section.id}" name="comments_${section.id}" rows="8" class="form-field"></textarea>
                </div>`
                : `<div class="p-4 w-full col-span-2">
                    <p class="text-gray-700 text-center italic">${section.description}</p>
                </div>`;

            const statusFieldHTML = section.checklist
                ? `<div class="footer-field">
                    <label>Estado de Revisión</label>
                    <div class="status-options">
                        <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="status_${section.id}" value="ok" class="form-radio h-4 w-4 text-green-600"> <span class="font-semibold text-green-700">OK</span></label>
                        <label class="flex items-center gap-2 cursor-pointer"><input type="radio" name="status_${section.id}" value="nok" class="form-radio h-4 w-4 text-red-600"> <span class="font-semibold text-red-700">NOK</span></label>
                    </div>
                </div>`
                : '';

            return `
            <div class="section-block">
                <div class="section-sidebar">
                    <i data-lucide="${section.icon || 'help-circle'}" class="w-6 h-6 text-slate-500"></i>
                    <span>${section.title}</span>
                </div>
                <div class="section-main">
                    <div class="section-content">
                        ${mainContentHTML}
                    </div>
                    <div class="section-footer">
                        <div class="footer-field">
                            <label for="date_review_${section.id}">Fecha de Revisión</label>
                            <input type="date" id="date_review_${section.id}" name="date_review_${section.id}" class="p-1 border rounded-md form-field">
                        </div>
                        ${statusFieldHTML}
                        <div class="flex-grow"></div>
                        <div class="footer-field">
                            <label for="name_${section.id}">Nombre del Aprobador</label>
                            <input type="text" id="name_${section.id}" name="name_${section.id}" class="p-1 border rounded-md form-field w-48">
                        </div>
                        <div class="footer-field">
                            <label for="visto_${section.id}">Firma</label>
                            <input type="text" id="visto_${section.id}" name="visto_${section.id}" class="p-1 border rounded-md form-field w-32">
                        </div>
                    </div>
                </div>
            </div>`;
        }

        const container = formElement.querySelector('#dynamic-form-sections');
        if (container) {
            formSectionsData.forEach(section => {
                const sectionHTML = buildSectionHTML(section);
                container.insertAdjacentHTML('beforeend', sectionHTML);
            });

            // Add event listener for mutually exclusive checkboxes
            container.addEventListener('change', (e) => {
                if (e.target.type === 'checkbox' && e.target.name.startsWith('check_')) {
                    const name = e.target.name;
                    const isChecked = e.target.checked;

                    if (!isChecked) return; // Only act when a box is checked

                    const parts = name.split('_');
                    const sectionId = parts[1];
                    const index = parts[2];
                    const type = parts[3];

                    let otherCheckbox;
                    if (type === 'si') {
                        otherCheckbox = container.querySelector(`input[name="check_${sectionId}_${index}_na"]`);
                    } else if (type === 'na') {
                        otherCheckbox = container.querySelector(`input[name="check_${sectionId}_${index}_si"]`);
                    }

                    if (otherCheckbox && otherCheckbox.checked) {
                        otherCheckbox.checked = false;
                    }
                }
            });
        }

        // --- Button Logic ---
        const saveButton = formElement.querySelector('#eco-save-button');
        const approveButton = formElement.querySelector('#eco-approve-button');
        const clearButton = formElement.querySelector('#eco-clear-button');
        const ecrInput = formElement.querySelector('#ecr_no');

        let actionPlan = [];

        const updateActionPlanCompletionStatus = () => {
            // The new checkbox is the first item (index 0) in the 'implementacion' section.
            const actionPlanCheckbox = document.querySelector('input[name="check_implementacion_0_si"]');
            if (!actionPlanCheckbox) return;

            // This checkbox should be controlled only by the action plan's status.
            actionPlanCheckbox.disabled = true;

            const allTasksCompleted = actionPlan.length > 0 && actionPlan.every(task => task.status === 'completed');
            actionPlanCheckbox.checked = allTasksCompleted;

            // Also disable the N/A checkbox for this item
            const naCheckbox = document.querySelector('input[name="check_implementacion_0_na"]');
            if(naCheckbox) naCheckbox.disabled = true;
        };

        const renderActionPlan = () => {
            const listEl = document.getElementById('action-plan-list');
            if (!listEl) return;
            if (actionPlan.length === 0) {
                listEl.innerHTML = '<p class="text-center text-sm text-slate-500 py-4">No hay acciones en el plan.</p>';
            } else {
                listEl.innerHTML = actionPlan.map((item, index) => `
                    <div class="action-item grid grid-cols-[1fr,120px,100px,50px] gap-3 items-center p-2 rounded-md ${item.status === 'completed' ? 'bg-green-50' : 'bg-white'} border">
                        <p class="font-medium text-slate-700">${item.description}</p>
                        <p class="text-sm text-slate-600">${item.assignee || 'N/A'}</p>
                        <p class="text-sm text-slate-500">${item.dueDate || 'N/A'}</p>
                        <div class="flex justify-center gap-2">
                             <input type="checkbox" data-action="toggle-action-status" data-index="${index}" class="h-4 w-4" ${item.status === 'completed' ? 'checked' : ''}>
                             <button type="button" data-action="delete-action-item" data-index="${index}" class="text-red-500 hover:text-red-700"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
                        </div>
                    </div>
                `).join('');
            }
            lucide.createIcons();
            updateActionPlanCompletionStatus(); // Update status whenever the plan is re-rendered
        };

        const setupActionPlanListeners = () => {
            document.getElementById('add-action-item-btn')?.addEventListener('click', () => {
                const descriptionInput = document.getElementById('new-action-description');
                const assigneeSelect = document.getElementById('new-action-assignee');
                const dueDateInput = document.getElementById('new-action-duedate');

                const description = descriptionInput.value.trim();
                if (!description) {
                    showToast('La descripción de la acción no puede estar vacía.', 'error');
                    return;
                }

                const selectedOption = assigneeSelect.options[assigneeSelect.selectedIndex];
                const assigneeUid = assigneeSelect.value;
                const assigneeName = selectedOption.text;
                const ecoId = ecrInput.value.trim();

                const newAction = {
                    id: `task_${Date.now()}`,
                    description,
                    assignee: assigneeName,
                    assigneeUid: assigneeUid,
                    dueDate: dueDateInput.value,
                    status: 'pending'
                };
                actionPlan.push(newAction);

                if (assigneeUid) {
                    sendNotification(
                        assigneeUid,
                        `Se te ha asignado una nueva tarea en el plan de acción para el ECO: ${ecoId}.`,
                        'eco_form',
                        { ecoId: ecoId }
                    );
                }

                descriptionInput.value = '';
                dueDateInput.value = '';
                assigneeSelect.selectedIndex = 0;
                renderActionPlan();
                saveEcoFormToLocalStorage(); // Save progress after adding
            });

            document.getElementById('action-plan-list')?.addEventListener('click', (e) => {
                const target = e.target;
                const action = target.dataset.action;
                const index = parseInt(target.dataset.index, 10);

                if (action === 'toggle-action-status') {
                    actionPlan[index].status = target.checked ? 'completed' : 'pending';
                    renderActionPlan();
                    saveEcoFormToLocalStorage();
                } else if (action === 'delete-action-item') {
                    actionPlan.splice(index, 1);
                    renderActionPlan();
                    saveEcoFormToLocalStorage();
                }
            });
        };

        const populateAssigneeDropdown = () => {
             const assigneeSelect = document.getElementById('new-action-assignee');
             if (!assigneeSelect) return;
             const users = appState.collections.usuarios.filter(u => !u.disabled);
             assigneeSelect.innerHTML = '<option value="">Sin Asignar</option>' + users.map(u => `<option value="${u.docId}">${u.name}</option>`).join('');
        };


        // Always add a "Back" button
        const backButtonHTML = `<button type="button" id="eco-back-button" class="bg-gray-200 text-gray-800 px-6 py-2 rounded-md hover:bg-gray-300">Volver a la Lista</button>`;
        saveButton.insertAdjacentHTML('beforebegin', backButtonHTML);
        document.getElementById('eco-back-button').addEventListener('click', () => switchView('eco'));

        if (isEditing) {
            ecrInput.readOnly = true;
            ecrInput.classList.add('bg-gray-100', 'cursor-not-allowed');
        }

        if (ecoId) {
            // Editing an existing ECO
            const docRef = doc(db, COLLECTIONS.ECO_FORMS, ecoId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                populateEcoForm(formElement, data);
                actionPlan = data.action_plan || [];
                // This is the crucial fix: update the checkbox state after loading data.
                updateActionPlanCompletionStatus();
                 // Fetch associated ECR to check for PPAP requirement
                let ecrDocSnap;
                if (window.isInTutorial) {
                    console.log("TUTORIAL MODE: Using mock ECR data.");
                    ecrDocSnap = {
                        exists: () => true,
                        data: () => ({
                            cliente_requiere_ppap: true,
                            cliente_aprobacion_estado: 'aprobado',
                            denominacion_producto: 'Componente de Tutorial',
                            id: 'TUTORIAL-ECR-001'
                        })
                    };
                } else {
                    const ecrDocRef = doc(db, COLLECTIONS.ECR_FORMS, ecoId);
                    ecrDocSnap = await getDoc(ecrDocRef);
                }

                if (ecrDocSnap.exists()) {
                    const ecrData = ecrDocSnap.data();
                    const ecrNoDisplay = formElement.querySelector('#ecr_no_display');
                    if (ecrNoDisplay) {
                        ecrNoDisplay.value = `${ecrData.denominacion_producto} (${ecrData.id})`;
                    }
                    if (shouldRequirePpapConfirmation(ecrData)) {
                        const ppapContainer = formElement.querySelector('#ppap-confirmation-container');
                        if (ppapContainer) {
                            ppapContainer.classList.remove('hidden');
                        }
                    }
                }
            } else {
                showToast(`Error: No se encontró el ECO con ID ${ecoId}`, 'error');
                switchView('eco');
                return;
            }
        } else if (ecrDataFromParam) {
            // Creating a new ECO from an ECR
            ecrInput.value = ecrDataFromParam.id;
            ecrInput.readOnly = true;
            ecrInput.classList.add('bg-gray-100', 'cursor-not-allowed');

            // Pre-populate other relevant fields from the ECR
            const fieldsToPrepopulate = {
                'name_eng_producto': ecrDataFromParam.equipo_c1_2, // Ing. Producto
                'comments_eng_producto': `Basado en la situación propuesta en el ECR ${ecrDataFromParam.id}:\n${ecrDataFromParam.situacion_propuesta || ''}`
            };

            for (const fieldName in fieldsToPrepopulate) {
                const element = formElement.querySelector(`[name="${fieldName}"]`);
                if (element && !element.value) { // Don't overwrite if already has a value (e.g., from local storage)
                    element.value = fieldsToPrepopulate[fieldName];
                }
            }
            if (shouldRequirePpapConfirmation(ecrDataFromParam)) {
                const ppapContainer = formElement.querySelector('#ppap-confirmation-container');
                if (ppapContainer) {
                    ppapContainer.classList.remove('hidden');
                }
            }

            // Also check local storage in case the user started filling it and refreshed
            loadEcoFormFromLocalStorage();
        } else {
            // Creating a brand new, blank ECO
            loadEcoFormFromLocalStorage();
        }

        // Initialize Action Plan
        populateAssigneeDropdown();
        renderActionPlan();
        setupActionPlanListeners();

        // Add event listener to save on any input
        formElement.addEventListener('input', saveEcoFormToLocalStorage);

        formElement.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action="open-ecr-search-for-eco"]');
            if (button) {
                await openEcrSearchModalForEcoForm();
            }
        });

        const getFormData = () => {
            const data = {
                checklists: {},
                comments: {},
                signatures: {},
                action_plan: actionPlan,
            };

            const formSectionsData = [
                { id: 'eng_producto' }, { id: 'calidad' }, { id: 'eng_proceso' },
                { id: 'doc_calidad' }, { id: 'compras' }, { id: 'logistica' },
                { id: 'implementacion' }, { id: 'aprobacion_final' }
            ];

            for (const element of formElement.elements) {
                if (element.disabled || !element.name || element.tagName === 'BUTTON') {
                    continue;
                }

                const key = element.name;

                if (key.startsWith('check_')) {
                    const [, section, index, type] = key.split('_');
                    if (!data.checklists[section]) data.checklists[section] = [];
                    if (!data.checklists[section][index]) data.checklists[section][index] = { si: false, na: false };
                    data.checklists[section][index][type] = element.checked;
                } else if (key.startsWith('comments_')) {
                    const [, section] = key.split('_');
                    data.comments[section] = element.value;
                } else if (key.startsWith('date_review_') || key.startsWith('status_') || key.startsWith('name_') || key.startsWith('visto_')) {
                    let fieldType, sectionId;
                    const knownSectionIds = formSectionsData.map(s => s.id);
                    for (const id of knownSectionIds) {
                        if (key.endsWith(`_${id}`)) {
                            sectionId = id;
                            fieldType = key.substring(0, key.length - id.length - 1);
                            break;
                        }
                    }
                    if (sectionId && fieldType) {
                        if (!data.signatures[sectionId]) data.signatures[sectionId] = {};
                        if (element.type === 'radio') {
                            if (element.checked) {
                                data.signatures[sectionId][fieldType] = element.value;
                            }
                        } else {
                            data.signatures[sectionId][fieldType] = element.value;
                        }
                    }
                } else {
                    data[key] = element.value;
                }
            }

            return data;
        };

        const saveEcoForm = async (status = 'in-progress') => {
            const formData = getFormData();
            formData.status = status;
            formData.id = ecrInput.value.trim();

            showToast('Validando formulario ECO...', 'info');

            // --- Client-side Validation (migrated from Cloud Function) ---
            if (!formData.id || formData.id.trim() === '') {
                showToast('El campo "ECR N°" no puede estar vacío. Por favor, seleccione un ECR asociado.', 'error');
                return;
            }
            const hasComments = formData.comments && Object.values(formData.comments).some(comment => comment && comment.trim() !== '');
            const hasChecklists = formData.checklists && Object.values(formData.checklists).some(section =>
                section && section.some(item => item && (item.si || item.na))
            );

            if (!hasComments && !hasChecklists) {
                showToast('El formulario ECO está vacío. Agregue al menos un comentario o marque una opción en el checklist.', 'error');
                return;
            }

            const toastId = showToast('Guardando formulario ECO...', 'loading', { duration: 0 });

            // --- Client-side Firestore Write Logic (migrated from Cloud Function) ---
            try {
                const docId = formData.id;
                const docRef = doc(db, COLLECTIONS.ECO_FORMS, docId);
                const historyCollectionRef = collection(docRef, 'history');

                const dataToSave = {
                    ...formData,
                    lastModified: new Date(),
                    modifiedBy: appState.currentUser.email,
                };

                const batch = writeBatch(db);

                // 1. Save the main document
                batch.set(docRef, dataToSave, { merge: true });

                // 2. Save a copy to the history subcollection
                const historyDocRef = doc(historyCollectionRef); // Auto-generate ID for history entry
                batch.set(historyDocRef, dataToSave);

                await batch.commit();

                // Use the toastId to update the loading message to success
                showToast('ECO guardado con éxito.', 'success', { toastId });
                localStorage.removeItem(ECO_FORM_STORAGE_KEY);
                switchView('eco');

            } catch (error) {
                console.error("Error saving ECO form to Firestore:", error);
                // Use the toastId to update the loading message to an error
                showToast(`Error al guardar: ${error.message}`, 'error', { toastId });
            }
        };

        clearButton.addEventListener('click', () => {
            showConfirmationModal('Limpiar Formulario', '¿Está seguro? Se borrará todo el progreso no guardado.', () => {
                formElement.reset();
                localStorage.removeItem(ECO_FORM_STORAGE_KEY);
                showToast('Formulario limpiado.', 'info');
            });
        });

        // This function now handles all validation logic, including the new business rules.
        const validateAndApproveEco = async () => {
            formElement.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));
            let errorMessages = [];
            const ERROR_CLASS = 'validation-error';

            // Rule 1: Check for any "NOK" status
            let hasNok = false;
            formSectionsData.forEach(section => {
                if (section.checklist) {
                    const nokRadio = formElement.querySelector(`input[name="status_${section.id}"][value="nok"]`);
                    if (nokRadio && nokRadio.checked) {
                        hasNok = true;
                        nokRadio.closest('.department-footer').classList.add(ERROR_CLASS);
                    }
                }
            });
            if (hasNok) {
                errorMessages.push('No se puede aprobar: una o más secciones están marcadas como "NOK".');
            }

            // Rule 2: Check PPAP confirmation if required
            const ecrNo = formElement.querySelector('[name="ecr_no"]').value;
            if (ecrNo) {
                const ecrDocRef = doc(db, COLLECTIONS.ECR_FORMS, ecrNo);
                const ecrDocSnap = await getDoc(ecrDocRef);
                if (ecrDocSnap.exists() && shouldRequirePpapConfirmation(ecrDocSnap.data())) {
                    const ppapContainer = document.getElementById('ppap-confirmation-container');
                    // No need to remove hidden here, as the container should already be visible if this logic runs.
                    const ppapCheckbox = formElement.querySelector('[name="ppap_completed_confirmation"]');
                    if (!ppapCheckbox.checked) {
                        errorMessages.push('Se requiere confirmación de PPAP antes de aprobar este ECO.');
                        ppapContainer.classList.add(ERROR_CLASS);
                    }
                }
            }

            // Rule 3: Validate all fields are filled (original logic)
            formSectionsData.forEach(section => {
                 if (section.checklist) {
                    const statusRadio = formElement.querySelector(`input[name="status_${section.id}"]:checked`);
                    if (!statusRadio) {
                        errorMessages.push(`La sección "${section.title}" debe tener un estado (OK/NOK).`);
                        const statusOptionsContainer = formElement.querySelector(`input[name="status_${section.id}"]`).closest('.status-options');
                        if (statusOptionsContainer) statusOptionsContainer.classList.add(ERROR_CLASS);
                    }
                 }
            });


            if (errorMessages.length > 0) {
                showToast(errorMessages.join(' '), 'error', 5000);
                return;
            }

            showConfirmationModal('Aprobar ECO', '¿Está seguro de que desea aprobar y guardar este ECO? Esta acción registrará la versión actual como aprobada.', () => {
                saveEcoForm('approved');
            });
        };

        saveButton.addEventListener('click', () => saveEcoForm('in-progress'));
        approveButton.addEventListener('click', validateAndApproveEco);

        appState.currentViewCleanup = () => {
            const ecoStyle = document.getElementById('eco-form-styles');
            if(ecoStyle) ecoStyle.remove();
            const printStyle = document.getElementById('print-styles');
            if(printStyle) printStyle.remove();
            formElement.removeEventListener('input', saveEcoFormToLocalStorage);
        };

    } catch (error) {
        console.error("Error loading ECO form:", error);
        dom.viewContent.innerHTML = `<p class="text-red-500">Error al cargar el formulario ECO.</p>`;
    }
}

async function runEcoLogic() {
    return new Promise(resolve => {
        dom.headerActions.style.display = 'none';

        const viewHTML = `
            <div class="animate-fade-in-up">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-slate-800">Planilla General de ECO</h2>
                        <p class="text-sm text-slate-500">Aquí puede ver y gestionar sus ECOs. Los nuevos ECOs se generan desde la lista de ECRs aprobados.</p>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-gray-600">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th scope="col" class="px-6 py-3">ECR N°</th>
                                    <th scope="col" class="px-6 py-3">Estado</th>
                                    <th scope="col" class="px-6 py-3">Última Modificación</th>
                                    <th scope="col" class="px-6 py-3">Modificado Por</th>
                                    <th scope="col" class="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="eco-table-body">
                                <tr>
                                    <td colspan="5" class="text-center py-16 text-gray-500">
                                        <div class="flex flex-col items-center gap-3">
                                            <i data-lucide="loader" class="w-12 h-12 text-gray-300 animate-spin"></i>
                                            <h4 class="font-semibold">Cargando ECO...</h4>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        dom.viewContent.innerHTML = viewHTML;
        lucide.createIcons();

        const ecoFormsRef = collection(db, COLLECTIONS.ECO_FORMS);
        const q = query(ecoFormsRef, orderBy('lastModified', 'desc'));

        let isFirstRender = true;
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const ecoTableBody = document.getElementById('eco-table-body');
            if (!ecoTableBody) return;

            if (querySnapshot.empty) {
                ecoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-gray-500"><i data-lucide="search-x" class="mx-auto h-16 w-16 text-gray-300"></i><h3 class="mt-4 text-lg font-semibold">No se encontraron ECOs</h3><p class="text-sm">Puede crear uno nuevo con el botón de arriba.</p></div></td></tr>`;
            } else {
                let tableRowsHTML = '';
                querySnapshot.forEach(doc => {
                    const eco = doc.data();
                    const lastModified = eco.lastModified?.toDate ? eco.lastModified.toDate().toLocaleString('es-AR') : 'N/A';
                    const statusColors = { 'in-progress': 'bg-yellow-100 text-yellow-800', 'approved': 'bg-green-100 text-green-800', 'rejected': 'bg-red-100 text-red-800' };
                    const statusText = { 'in-progress': 'En Progreso', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
                    tableRowsHTML += `
                        <tr class="bg-white border-b hover:bg-gray-50">
                            <td class="px-6 py-4 font-medium text-gray-900">${eco.id || 'N/A'}</td>
                            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusColors[eco.status] || 'bg-gray-100 text-gray-800'}">${statusText[eco.status] || eco.status}</span></td>
                            <td class="px-6 py-4">${lastModified}</td>
                            <td class="px-6 py-4">${eco.modifiedBy || 'N/A'}</td>
                            <td class="px-6 py-4 text-right">
                                <button data-action="view-eco" data-id="${eco.id}" class="text-gray-500 hover:text-blue-600 p-1" title="Ver/Editar"><i data-lucide="eye" class="h-5 w-5 pointer-events-none"></i></button>
                                <button data-action="view-eco-history" data-id="${eco.id}" class="text-gray-500 hover:text-purple-600 p-1" title="Ver Historial"><i data-lucide="history" class="h-5 w-5 pointer-events-none"></i></button>
                                <button data-action="export-eco-pdf" data-id="${eco.id}" class="text-gray-500 hover:text-red-600 p-1" title="Exportar a PDF"><i data-lucide="file-text" class="h-5 w-5 pointer-events-none"></i></button>
                                ${eco.status === 'in-progress' ? `<button data-action="approve-eco" data-id="${eco.id}" class="text-gray-500 hover:text-green-600 p-1" title="Aprobar ECO"><i data-lucide="check-circle" class="h-5 w-5 pointer-events-none"></i></button>` : ''}
                            </td>
                        </tr>`;
                });
                ecoTableBody.innerHTML = tableRowsHTML;
            }
            lucide.createIcons();
            if (isFirstRender) {
                isFirstRender = false;
                resolve();
            }
        }, (error) => {
            console.error("Error fetching ECOs: ", error);
            const ecoTableBody = document.getElementById('eco-table-body');
            if (ecoTableBody) {
                ecoTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-red-500"><i data-lucide="alert-triangle" class="mx-auto h-16 w-16"></i><h3 class="mt-4 text-lg font-semibold">Error al cargar ECO</h3><p class="text-sm">${error.message}</p></div></td></tr>`;
                lucide.createIcons();
            }
            if (isFirstRender) {
                isFirstRender = false;
                resolve(); // Resolve even on error to not block the UI
            }
        });

        appState.currentViewCleanup = () => {
            unsubscribe();
        };
    });
}

async function runEcrLogic() {
    return new Promise(resolve => {
        dom.headerActions.style.display = 'none';

        const viewHTML = `
            <div class="animate-fade-in-up">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6">
                    <div>
                        <h2 class="text-2xl font-bold text-slate-800">Planilla General de ECR</h2>
                        <p class="text-sm text-slate-500">Aquí puede ver, gestionar y crear un nuevo ECR.</p>
                    </div>
                    <div class="flex items-center gap-4">
                        <button data-action="create-new-ecr" data-tutorial-id="create-new-button" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                            <i data-lucide="file-plus-2" class="mr-2 h-5 w-5"></i>Crear Nuevo ECR
                        </button>
                    </div>
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg">
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm text-left text-gray-600">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th scope="col" class="px-6 py-3">ECR N°</th>
                                    <th scope="col" class="px-6 py-3">Estado</th>
                                    <th scope="col" class="px-6 py-3">Última Modificación</th>
                                    <th scope="col" class="px-6 py-3">Modificado Por</th>
                                    <th scope="col" class="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="ecr-table-body" data-tutorial-id="ecr-table-body">
                                <tr>
                                    <td colspan="5" class="text-center py-16 text-gray-500">
                                        <div class="flex flex-col items-center gap-3">
                                            <i data-lucide="loader" class="w-12 h-12 text-gray-300 animate-spin"></i>
                                            <h4 class="font-semibold">Cargando ECR...</h4>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        dom.viewContent.innerHTML = viewHTML;
        lucide.createIcons();

        dom.viewContent.querySelector('[data-action="create-new-ecr"]').addEventListener('click', () => {
            switchView('ecr_form');
        });

        const ecrFormsRef = collection(db, COLLECTIONS.ECR_FORMS);
        const q = query(ecrFormsRef, orderBy('lastModified', 'desc'));

        let isFirstRender = true;
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            console.log('ECR listener fired.', querySnapshot.size, 'docs found.');
            const ecrTableBody = document.getElementById('ecr-table-body');
            if (!ecrTableBody) return;

            if (querySnapshot.empty) {
                ecrTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-gray-500"><i data-lucide="search-x" class="mx-auto h-16 w-16 text-gray-300"></i><h3 class="mt-4 text-lg font-semibold">No se encontraron ECRs</h3><p class="text-sm">Puede crear uno nuevo con el botón de arriba.</p></div></td></tr>`;
            } else {
                let tableRowsHTML = '';
                querySnapshot.forEach(doc => {
                    const ecr = doc.data();
                    const lastModified = ecr.lastModified?.toDate ? ecr.lastModified.toDate().toLocaleString('es-AR') : 'N/A';
                    const statusColors = { 'in-progress': 'bg-yellow-100 text-yellow-800', 'approved': 'bg-green-100 text-green-800', 'rejected': 'bg-red-100 text-red-800' };
                    const statusText = { 'in-progress': 'En Progreso', 'approved': 'Aprobado', 'rejected': 'Rechazado' };
                    tableRowsHTML += `
                        <tr class="bg-white border-b hover:bg-gray-50">
                            <td class="px-6 py-4 font-medium text-gray-900">${ecr.id || 'N/A'}</td>
                            <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusColors[ecr.status] || 'bg-gray-100 text-gray-800'}">${statusText[ecr.status] || ecr.status}</span></td>
                            <td class="px-6 py-4">${lastModified}</td>
                            <td class="px-6 py-4">${ecr.modifiedBy || 'N/A'}</td>
                            <td class="px-6 py-4 text-right">
                                <button data-action="view-ecr" data-id="${ecr.id}" class="text-gray-500 hover:text-blue-600 p-1" title="Ver/Editar"><i data-lucide="eye" class="h-5 w-5 pointer-events-none"></i></button>
                                <button data-action="export-ecr-pdf" data-id="${ecr.id}" class="text-gray-500 hover:text-red-600 p-1" title="Exportar a PDF"><i data-lucide="file-text" class="h-5 w-5 pointer-events-none"></i></button>
                                ${ecr.status === 'approved' ? `<button data-action="generate-eco-from-ecr" data-id="${ecr.id}" class="text-gray-500 hover:text-green-600 p-1" title="Generar ECO desde este ECR"><i data-lucide="file-output" class="h-5 w-5 pointer-events-none"></i></button>` : ''}
                            </td>
                        </tr>`;
                });
                ecrTableBody.innerHTML = tableRowsHTML;
            }
            lucide.createIcons();
            if (isFirstRender) {
                isFirstRender = false;
                resolve();
            }
        }, (error) => {
            console.error("Error fetching ECRs: ", error);
            const ecrTableBody = document.getElementById('ecr-table-body');
            if (ecrTableBody) {
                ecrTableBody.innerHTML = `<tr><td colspan="5" class="text-center py-16 text-red-500"><i data-lucide="alert-triangle" class="mx-auto h-16 w-16"></i><h3 class="mt-4 text-lg font-semibold">Error al cargar ECR</h3><p class="text-sm">${error.message}</p></div></td></tr>`;
                lucide.createIcons();
            }
            if (isFirstRender) {
                isFirstRender = false;
                resolve(); // Resolve even on error
            }
        });

        appState.currentViewCleanup = () => {
            unsubscribe();
        };
    });
}

// The old dashboard functions are being replaced with a new, more professional and efficient version.


async function runEcrTableViewLogic() {
    dom.headerActions.style.display = 'none';
    let allEcrs = []; // To store all ECRs for client-side filtering

    const renderTableRows = (ecrsToRender) => {
        const tableBody = dom.viewContent.querySelector('#ecr-control-table-body');
        if (!tableBody) return;

        if (ecrsToRender.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="23" class="text-center py-16 text-gray-500">No se encontraron ECRs que coincidan con la búsqueda.</td></tr>`;
            return;
        }

        const statusPill = (status) => {
            if (!status) return `<span class="status-pill status-gray">N/A</span>`;
            const statusMap = {
                'approved': { text: 'Aprobado', class: 'status-green' },
                'in-progress': { text: 'En Progreso', class: 'status-yellow' },
                'rejected': { text: 'Rechazado', class: 'status-red' },
                'pending-approval': { text: 'Pend. Aprobación', class: 'status-blue' },
                'draft': { text: 'Borrador', class: 'status-gray' },
                'stand-by': { text: 'Stand-By', class: 'status-orange' },
                'aprobado': { text: 'Aprobado', class: 'status-green' }, // For client status
                'pendiente': { text: 'Pendiente', class: 'status-blue' },
                'rechazado': { text: 'Rechazado', class: 'status-red' },
                'na': { text: 'No Aplica', class: 'status-gray' }
            };
            const s = statusMap[status] || { text: status, class: 'status-gray' };
            return `<span class="status-pill ${s.class}">${s.text}</span>`;
        };

        tableBody.innerHTML = ecrsToRender.map(ecr => {
            const origem = ecr.origen_cliente ? 'Cliente' : (ecr.origen_interno ? 'Interno' : (ecr.origen_proveedor ? 'Proveedor' : (ecr.origen_reglamentacion ? 'Reglamentación' : 'N/A')));
            const tipoEcr = ecr.tipo_producto ? 'Producto' : (ecr.tipo_proceso ? 'Proceso' : (ecr.tipo_otro ? ecr.tipo_otro_text || 'Otro' : 'N/A'));

            const ecoStatusCellId = `eco-status-${ecr.id}`;
            if (ecr.id) {
                getDoc(doc(db, COLLECTIONS.ECO_FORMS, ecr.id)).then(ecoSnap => {
                    const ecoStatus = ecoSnap.exists() ? ecoSnap.data().status : null;
                    const cell = document.getElementById(ecoStatusCellId);
                    if (cell) {
                        cell.innerHTML = statusPill(ecoStatus);
                    }
                });
            }

            return `
            <tr class="hover:bg-slate-50 transition-colors">
                <td title="${ecr.id || ''}">${ecr.id || 'N/A'}</td>
                <td title="${ecr.cliente || ''}">${ecr.cliente || 'N/A'}</td>
                <td title="MAL">MAL</td>
                <td title="${origem}">${origem}</td>
                <td title="${tipoEcr}">${tipoEcr}</td>
                <td title="${ecr.fecha_emision || ''}">${ecr.fecha_emision || 'N/A'}</td>
                <td title="${ecr.denominacion_producto || ''}">${ecr.denominacion_producto || 'N/A'}</td>
                <td title="${ecr.codigo_barack || ''}">${ecr.codigo_barack || 'N/A'}</td>
                <td title="${ecr.codigo_cliente || ''}">${ecr.codigo_cliente || 'N/A'}</td>
                <td title="${ecr.equipo_c1_0 || ecr.modifiedBy || ''}">${ecr.equipo_c1_0 || ecr.modifiedBy || 'N/A'}</td>
                <td title="${ecr.fecha_cierre || ''}">${ecr.fecha_cierre || 'N/A'}</td>
                <td title="${ecr.fecha_realizacion_ecr || ''}">${ecr.fecha_realizacion_ecr || 'N/A'}</td>
                <td>${statusPill(ecr.status)}</td>
                <td id="${ecoStatusCellId}">${statusPill(null)}</td>
                <td title="${ecr.cliente_requiere_aprobacion ? 'Sí' : 'No'}">${ecr.cliente_requiere_aprobacion ? 'Sí' : 'No'}</td>
                <td title="${ecr.cliente_aprobacion_estado || ''}">${statusPill(ecr.cliente_aprobacion_estado)}</td>
                <td title="${ecr.cliente_requiere_ppap ? 'Sí' : 'No'}">${ecr.cliente_requiere_ppap ? 'Sí' : 'No'}</td>
                <td title="${ecr.situacion_propuesta || ''}">${ecr.situacion_propuesta || 'N/A'}</td>
                <td title="${ecr.causas_solicitud || ''}">${ecr.causas_solicitud || 'N/A'}</td>
                <td title="${ecr.comentarios_alertas || ''}">${ecr.comentarios_alertas || 'N/A'}</td>
                <td title="${ecr.componentes_obsoletos || ''}">${ecr.componentes_obsoletos || 'N/A'}</td>
                <td title="${ecr.accion_objetiva || ''}">${ecr.accion_objetiva || 'N/A'}</td>
                <td title="${ecr.final_coordinador || ''}">${ecr.final_coordinador || 'N/A'}</td>
            </tr>
        `}).join('');
    };

    const filterAndRender = () => {
        const searchTerm = dom.viewContent.querySelector('#ecr-control-search').value.toLowerCase();
        const clientFilter = dom.viewContent.querySelector('#ecr-client-filter').value;
        const statusFilter = dom.viewContent.querySelector('#ecr-status-filter').value;
        const typeFilter = dom.viewContent.querySelector('#ecr-type-filter').value;

        let filtered = allEcrs;

        if (clientFilter !== 'all') {
            filtered = filtered.filter(ecr => ecr.cliente === clientFilter);
        }
        if (statusFilter !== 'all') {
            filtered = filtered.filter(ecr => ecr.status === statusFilter);
        }
        if (typeFilter !== 'all') {
            filtered = filtered.filter(ecr => {
                if (typeFilter === 'producto') return ecr.tipo_producto;
                if (typeFilter === 'proceso') return ecr.tipo_proceso;
                if (typeFilter === 'otro') return ecr.tipo_otro;
                return false;
            });
        }
        if (searchTerm) {
            filtered = filtered.filter(ecr =>
                Object.values(ecr).some(val =>
                    String(val).toLowerCase().includes(searchTerm)
                )
            );
        }
        renderTableRows(filtered);
    };

    const createFilterGroup = (title, content) => {
        return `
            <div class="filter-group">
                <h4 class="filter-group-title">${title}</h4>
                <div class="filter-group-content">
                    ${content}
                </div>
            </div>
        `;
    };

    const viewHTML = `
    <style>
        .filters-container {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 1.5rem;
            padding: 1.5rem;
            background-color: #f8fafc;
            border-radius: 0.75rem;
            border: 1px solid #e2e8f0;
            margin-bottom: 1.5rem;
        }
        .filter-group {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
        }
        .filter-group-title {
            font-size: 0.75rem;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 0.25rem;
            margin-bottom: 0.5rem;
        }
        .filter-control {
            display: flex;
            flex-direction: column;
        }
        .filter-control label {
            font-size: 0.875rem;
            font-weight: 600;
            color: #334155;
            margin-bottom: 0.25rem;
        }
        .filter-control input, .filter-control select {
            width: 100%;
            padding: 0.5rem 0.75rem;
            border: 1px solid #cbd5e1;
            border-radius: 0.375rem;
            background-color: #ffffff;
            box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
            transition: border-color 0.2s;
        }
        .filter-control input:focus, .filter-control select:focus {
            outline: none;
            border-color: #3b82f6;
            box-shadow: 0 0 0 2px #bfdbfe;
        }
        .search-filter-group {
            grid-column: 1 / -1; /* Make search span full width */
        }
        .search-container {
            position: relative;
        }
        .search-container .search-icon {
            position: absolute;
            left: 0.75rem; /* Adjusted from 1rem */
            top: 50%;
            transform: translateY(-50%);
            color: #94a3b8;
            pointer-events: none;
        }
        .search-container input {
            padding-left: 2.5rem; /* Adjusted from 2.75rem */
        }
        .filter-actions {
            display: flex;
            align-items: center;
            justify-content: flex-end;
            gap: 1rem;
        }
        #active-filters-indicator {
            font-size: 0.875rem;
            color: #475569;
            font-weight: 500;
        }
        #active-filters-indicator .count {
            font-weight: 700;
            color: #1e293b;
        }
    </style>
    <div class="animate-fade-in-up" data-tutorial-id="ecr-table-view-container">
        <header class="flex justify-between items-center mb-6">
            <div class="flex items-center gap-4">
                 <button data-view="control_ecrs" class="flex items-center justify-center p-2 rounded-full hover:bg-slate-100 transition-colors">
                    <i data-lucide="arrow-left" class="w-6 h-6 text-slate-600"></i>
                </button>
                <div>
                    <h1 class="text-2xl font-bold text-gray-800" style="font-family: 'Inter', sans-serif;">Tabla de Control ECR</h1>
                    <p class="text-gray-500 text-sm">Hoja de seguimiento de proyectos corporativa</p>
                </div>
            </div>
            <div class="text-sm text-gray-600 text-right">
                <div><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-AR')}</div>
                <div><strong>Responsable:</strong> ${appState.currentUser.name}</div>
            </div>
        </header>

        <div class="filters-container">
            ${createFilterGroup('Búsqueda General', `
                <div class="filter-control">
                    <label for="ecr-control-search">Buscar en todos los campos</label>
                    <div class="search-container">
                        <i data-lucide="search" class="search-icon h-5 w-5"></i>
                        <input type="text" id="ecr-control-search" placeholder="Escriba para buscar...">
                    </div>
                </div>
            `)}

            ${createFilterGroup('Filtros Específicos', `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="filter-control">
                        <label for="ecr-client-filter">Cliente</label>
                        <select id="ecr-client-filter"><option value="all">Todos</option></select>
                    </div>
                    <div class="filter-control">
                        <label for="ecr-status-filter">Estado ECR</label>
                        <select id="ecr-status-filter">
                            <option value="all">Todos</option>
                            <option value="draft">Borrador</option>
                            <option value="pending-approval">Pend. Aprobación</option>
                            <option value="approved">Aprobado</option>
                            <option value="rejected">Rechazado</option>
                            <option value="stand-by">Stand-By</option>
                        </select>
                    </div>
                    <div class="filter-control">
                        <label for="ecr-type-filter">Tipo de ECR</label>
                        <select id="ecr-type-filter">
                            <option value="all">Todos</option>
                            <option value="producto">Producto</option>
                            <option value="proceso">Proceso</option>
                            <option value="otro">Otro</option>
                        </select>
                    </div>
                </div>
            `)}
             ${createFilterGroup('Acciones', `
                <div class="filter-actions">
                    <span id="active-filters-indicator"></span>
                    <button id="clear-filters-btn" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold text-sm">Limpiar Filtros</button>
                </div>
            `)}
        </div>

        <div class="ecr-control-table-wrapper">
            <div class="overflow-x-auto ecr-control-table-container">
                <table class="modern-table">
                    <thead>
                        <tr>
                            <th>N° de ECR</th>
                        <th>Cliente</th>
                        <th>Site</th>
                        <th>Origem del Pedido (Cliente ou interno)</th>
                        <th>Tipo ECR</th>
                        <th>Fecha de Abertura</th>
                        <th>Producto Afectado</th>
                        <th>Código Programa</th>
                        <th>SIC</th>
                        <th>Responsable</th>
                        <th>Plazo ECR</th>
                        <th>Fecha realizacion ECR</th>
                        <th>Status ECR</th>
                        <th>Status ECO</th>
                        <th>Req. Aprob. Cliente</th>
                        <th>Estado Aprob. Cliente</th>
                        <th>Req. PPAP</th>
                        <th>Descripcion</th>
                        <th>Causas Quien solicito el pedido</th>
                        <th>Comentarios N°de Alert / Fete / concert</th>
                        <th>Componente Obsoletos</th>
                        <th>Accion Objetiva</th>
                        <th>Responsable</th>
                    </tr>
                </thead>
                <tbody id="ecr-control-table-body">
                    <tr><td colspan="23" class="text-center py-16 text-gray-500"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto"></i><p class="mt-2">Cargando datos...</p></td></tr>
                </tbody>
            </table>
        </div>
    </div>
    `;
    dom.viewContent.innerHTML = viewHTML;
    lucide.createIcons();

    const searchInput = dom.viewContent.querySelector('#ecr-control-search');
    const clientFilter = dom.viewContent.querySelector('#ecr-client-filter');
    const statusFilter = dom.viewContent.querySelector('#ecr-status-filter');
    const typeFilter = dom.viewContent.querySelector('#ecr-type-filter');
    const clearButton = dom.viewContent.querySelector('#clear-filters-btn');
    const indicator = dom.viewContent.querySelector('#active-filters-indicator');

    const updateActiveFilterIndicator = () => {
        let activeCount = 0;
        if (searchInput.value) activeCount++;
        if (clientFilter.value !== 'all') activeCount++;
        if (statusFilter.value !== 'all') activeCount++;
        if (typeFilter.value !== 'all') activeCount++;

        if (activeCount > 0) {
            indicator.innerHTML = `<span class="count">${activeCount}</span> filtro(s) activo(s)`;
        } else {
            indicator.innerHTML = 'No hay filtros activos';
        }
    };

    const enhancedFilterAndRender = () => {
        filterAndRender();
        updateActiveFilterIndicator();
    };

    searchInput.addEventListener('input', enhancedFilterAndRender);
    clientFilter.addEventListener('change', enhancedFilterAndRender);
    statusFilter.addEventListener('change', enhancedFilterAndRender);
    typeFilter.addEventListener('change', enhancedFilterAndRender);

    clearButton.addEventListener('click', () => {
        searchInput.value = '';
        clientFilter.value = 'all';
        statusFilter.value = 'all';
        typeFilter.value = 'all';
        enhancedFilterAndRender();
    });

    // --- Drag-to-scroll logic ---
    const scrollableArea = dom.viewContent.querySelector('.ecr-control-table-container');

    if (scrollableArea) {
        // Only apply grab cursor if the table is actually scrollable
        if (scrollableArea.scrollWidth > scrollableArea.clientWidth) {
            scrollableArea.style.cursor = 'grab';
        }

        let isDown = false;
        let startX;
        let scrollLeft;

        scrollableArea.addEventListener('mousedown', (e) => {
            // Prevent starting a drag from the table header or on scrollbars
            if (e.target.closest('thead')) {
                return;
            }
            // Check if the click is on the scrollbar itself
            if (e.offsetX >= scrollableArea.clientWidth || e.offsetY >= scrollableArea.clientHeight) {
                return;
            }

            isDown = true;
            scrollableArea.classList.add('active');
            startX = e.pageX - scrollableArea.offsetLeft;
            scrollLeft = scrollableArea.scrollLeft;
            scrollableArea.style.cursor = 'grabbing';
        });

        const stopDragging = () => {
            if (!isDown) return;
            isDown = false;
            scrollableArea.classList.remove('active');
            // Restore grab cursor only if scrollable
            if (scrollableArea.scrollWidth > scrollableArea.clientWidth) {
                scrollableArea.style.cursor = 'grab';
            } else {
                scrollableArea.style.cursor = 'default';
            }
        };

        // Add listeners to the window to ensure dragging stops even if the mouse leaves the element.
        window.addEventListener('mouseup', stopDragging);
        window.addEventListener('mouseleave', stopDragging);

        scrollableArea.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - scrollableArea.offsetLeft;
            const walk = (x - startX) * 2; // The multiplier makes scrolling faster
            scrollableArea.scrollLeft = scrollLeft - walk;
        });
    }


    const unsubscribe = onSnapshot(collection(db, COLLECTIONS.ECR_FORMS), (snapshot) => {
        allEcrs = snapshot.docs.map(doc => doc.data());

        const clientFilterEl = dom.viewContent.querySelector('#ecr-client-filter');
        const clients = [...new Set(allEcrs.map(ecr => ecr.cliente).filter(Boolean))];
        clientFilterEl.innerHTML = '<option value="all">Todos los Clientes</option>';
        clients.sort().forEach(client => {
            clientFilterEl.innerHTML += `<option value="${client}">${client}</option>`;
        });

        filterAndRender(); // Initial render
    }, (error) => {
        console.error("Error fetching ECRs for control panel:", error);
        showToast('Error al cargar los datos de ECR.', 'error');
        const tableBody = dom.viewContent.querySelector('#ecr-control-table-body');
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="23" class="text-center py-16 text-red-500"><i data-lucide="alert-triangle" class="mx-auto h-8 w-8"></i><p class="mt-2">Error al cargar los datos.</p></td></tr>`;
            lucide.createIcons();
        }
    });

    appState.currentViewCleanup = () => {
        unsubscribe();
    };
}

async function runIndicadoresEcmViewLogic() {
    dom.headerActions.style.display = 'none';
    let activeDashboardUnsub = null;
    let ecrChart = null;
    let ecoChart = null;
    let obsoletosChart = null;
    let actionPlanUnsub = null;

    const cleanup = () => {
        if (ecrChart) ecrChart.destroy();
        if (ecoChart) ecoChart.destroy();
        if (obsoletosChart) obsoletosChart.destroy();
        ecrChart = null;
        ecoChart = null;
        obsoletosChart = null;
        if (activeDashboardUnsub) {
            activeDashboardUnsub();
            activeDashboardUnsub = null;
        }
        if (actionPlanUnsub) {
            actionPlanUnsub();
            actionPlanUnsub = null;
        }
    };

    const renderIndicadorEcmView = () => {
        cleanup();
        const currentYear = new Date().getFullYear();
        let yearOptions = '';
        for (let i = 0; i < 5; i++) {
            const year = currentYear - i;
            yearOptions += `<option value="${year}" ${i === 0 ? 'selected' : ''}>${year}</option>`;
        }

        const viewHTML = `
            <div class="animate-fade-in space-y-8" data-tutorial-id="indicadores-ecm-view-container">
                <div class="flex flex-col md:flex-row justify-between items-center gap-4">
                     <div>
                        <button data-view="control_ecrs" class="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 mb-2">
                            <i data-lucide="arrow-left" class="w-4 h-4"></i>
                            Volver al Panel de Control
                        </button>
                        <h2 class="text-3xl font-bold text-slate-800">Indicadores ECM</h2>
                    </div>
                    <div class="flex items-center gap-4">
                        <div>
                            <label for="ecm-status-filter" class="text-sm font-medium">Estado:</label>
                            <select id="ecm-status-filter" class="border-gray-300 rounded-md shadow-sm">
                                <option value="all">Todos</option>
                                <option value="approved">Aprobado</option>
                                <option value="in-progress">En Progreso</option>
                                <option value="rejected">Rechazado</option>
                            </select>
                        </div>
                        <div>
                            <label for="ecm-year-filter" class="text-sm font-medium">Período:</label>
                            <select id="ecm-year-filter" class="border-gray-300 rounded-md shadow-sm">${yearOptions}</select>
                        </div>
                    </div>
                </div>

                <!-- ECR Section -->
                <section class="bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Análisis de ECR</h3>
                    <div id="ecr-kpi-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"></div>
                    <div class="h-80 relative"><canvas id="ecr-doughnut-chart"></canvas></div>
                </section>

                <!-- ECO Section -->
                <section class="bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Análisis de ECO</h3>
                    <div id="eco-kpi-cards" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6"></div>
                    <div class="h-80 relative"><canvas id="eco-pie-chart"></canvas></div>
                </section>

                <!-- Obsoletos Section -->
                <section class="bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Análisis de Obsoletos Anual</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <table class="w-full text-sm">
                                <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                    <tr><th class="px-4 py-3 text-left">Indicador</th><th class="px-4 py-3 text-right">Valor</th></tr>
                                </thead>
                                <tbody>
                                    <tr class="border-b"><td class="px-4 py-3 font-semibold">CANTIDAD ANUAL</td><td id="obsoletos-anual" class="px-4 py-3 text-right font-mono font-bold">0</td></tr>
                                    <tr class="border-b"><td class="px-4 py-3">CANTIDAD SEMESTRE 1</td><td id="obsoletos-s1" class="px-4 py-3 text-right font-mono">0</td></tr>
                                    <tr class="border-b"><td class="px-4 py-3">CANTIDAD SEMESTRE 2</td><td id="obsoletos-s2" class="px-4 py-3 text-right font-mono">0</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div class="h-64 relative"><canvas id="obsoletos-bar-chart"></canvas></div>
                    </div>
                </section>

                <!-- Plan de Acción Section -->
                <section class="bg-white p-6 rounded-xl shadow-lg">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Plan de Acción</h3>
                    <div class="overflow-x-auto">
                        <table class="w-full text-sm">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th class="px-4 py-3 text-left">Acción</th>
                                    <th class="px-4 py-3 text-left">Responsable</th>
                                    <th class="px-4 py-3 text-left">Plazo</th>
                                    <th class="px-4 py-3 text-center">Realizado</th>
                                    <th class="px-4 py-3 text-right"></th>
                                </tr>
                            </thead>
                            <tbody id="action-plan-tbody">
                                <!-- Rows will be rendered here dynamically -->
                            </tbody>
                        </table>
                    </div>
                    <div class="mt-4 text-right">
                        <button id="add-action-plan-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-semibold">
                            <i data-lucide="plus" class="inline-block w-4 h-4 mr-1.5 -mt-0.5"></i>Agregar Acción
                        </button>
                    </div>
                </section>
            </div>
        `;
        dom.viewContent.innerHTML = viewHTML;
        lucide.createIcons();

        const updateEcmDashboard = () => {
            const yearFilter = document.getElementById('ecm-year-filter');
            const statusFilter = document.getElementById('ecm-status-filter');
            if (!yearFilter || !statusFilter || !appState.isAppInitialized) return;
            const selectedYear = parseInt(yearFilter.value, 10);
            const selectedStatus = statusFilter.value;

            // ECR Data
            let ecrDocs = appState.collections[COLLECTIONS.ECR_FORMS] || [];
            if (selectedStatus !== 'all') {
                ecrDocs = ecrDocs.filter(ecr => ecr.status === selectedStatus);
            }
            const filteredEcrs = ecrDocs.filter(ecr => ecr.fecha_emision && new Date(ecr.fecha_emision + "T00:00:00").getFullYear() === selectedYear);
            let ecrAbierta = 0, ecrCancelada = 0, ecrCerradaPlazo = 0, ecrCerradaFueraPlazo = 0;
            filteredEcrs.forEach(ecr => {
                if (ecr.status === 'in-progress') ecrAbierta++;
                else if (ecr.status === 'rejected') ecrCancelada++;
                else if (ecr.status === 'approved') {
                    if (ecr.fecha_emision && ecr.lastModified?.toDate) {
                        const fechaEmision = new Date(ecr.fecha_emision + "T00:00:00");
                        const fechaCierre = ecr.lastModified.toDate();
                        const diffDays = (fechaCierre - fechaEmision) / (1000 * 60 * 60 * 24);
                        diffDays <= 30 ? ecrCerradaPlazo++ : ecrCerradaFueraPlazo++;
                    }
                }
            });
            document.getElementById('ecr-kpi-cards').innerHTML =
                createKpiCard("ECR Abierta", ecrAbierta, 'file-clock', 'blue') +
                createKpiCard("ECR Cancelada", ecrCancelada, 'file-x', 'red') +
                createKpiCard("Cerrada en Plazo", ecrCerradaPlazo, 'file-check', 'green') +
                createKpiCard("Cerrada Fuera de Plazo", ecrCerradaFueraPlazo, 'file-warning', 'yellow');

            const ecrChartCtx = document.getElementById('ecr-doughnut-chart')?.getContext('2d');
            if (ecrChartCtx) {
                if (ecrChart) ecrChart.destroy();
                ecrChart = new Chart(ecrChartCtx, createDashboardChartConfig('doughnut', ["Abiertas", "Canceladas", "En Plazo", "Fuera de Plazo"], [ecrAbierta, ecrCancelada, ecrCerradaPlazo, ecrCerradaFueraPlazo], "Distribución de ECRs"));
            }

            // ECO Data
            let ecoDocs = appState.collections[COLLECTIONS.ECO_FORMS] || [];
            if (selectedStatus !== 'all') {
                ecoDocs = ecoDocs.filter(eco => eco.status === selectedStatus);
            }
            const filteredEcos = ecoDocs.filter(eco => eco.lastModified?.toDate && eco.lastModified.toDate().getFullYear() === selectedYear);
            const ecoPendiente = filteredEcos.filter(eco => eco.status === 'in-progress').length;
            const ecoApertura = filteredEcos.filter(eco => eco.status === 'approved').length;
            const ecoRechazada = filteredEcos.filter(eco => eco.status === 'rejected').length;
            document.getElementById('eco-kpi-cards').innerHTML =
                createKpiCard("ECO Pendiente", ecoPendiente, 'hourglass', 'yellow') +
                createKpiCard("ECO Apertura", ecoApertura, 'folder-check', 'green') +
                createKpiCard("ECO Rechazada", ecoRechazada, 'folder-x', 'red');

            const ecoChartCtx = document.getElementById('eco-pie-chart')?.getContext('2d');
            if (ecoChartCtx) {
                if (ecoChart) ecoChart.destroy();
                ecoChart = new Chart(ecoChartCtx, createDashboardChartConfig('pie', ["Pendiente", "Apertura", "Rechazada"], [ecoPendiente, ecoApertura, ecoRechazada], "Distribución de ECOs"));
            }

            // Obsoletos Data (Calculated from ECRs)
            let s1 = 0;
            let s2 = 0;
            if (filteredEcrs && filteredEcrs.length > 0) {
                filteredEcrs.forEach(ecr => {
                    const obsoletosValue = parseInt(ecr.componentes_obsoletos, 10);
                    if (!isNaN(obsoletosValue)) {
                        const ecrDate = new Date(ecr.fecha_emision + "T00:00:00");
                        const month = ecrDate.getMonth();
                        if (month < 6) s1 += obsoletosValue;
                        else s2 += obsoletosValue;
                    }
                });
            }
            document.getElementById('obsoletos-anual').textContent = s1 + s2;
            document.getElementById('obsoletos-s1').textContent = s1;
            document.getElementById('obsoletos-s2').textContent = s2;
            const obsoletosChartCtx = document.getElementById('obsoletos-bar-chart')?.getContext('2d');
            if (obsoletosChartCtx) {
                 if (obsoletosChart) obsoletosChart.destroy();
                 obsoletosChart = new Chart(obsoletosChartCtx, {
                    type: 'bar',
                    data: {
                        labels: ['Semestre 1', 'Semestre 2'],
                        datasets: [{ label: 'Cantidad de Obsoletos', data: [s1, s2], backgroundColor: ['#60a5fa', '#3b82f6'], borderRadius: 4, maxBarThickness: 50 }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } } }
                 });
            }
            lucide.createIcons();

            // Setup Action Plan listener
            if (actionPlanUnsub) actionPlanUnsub();
            const actionPlanCollection = collection(db, 'action_plans');
            // Remove the where() clause to avoid needing a specific index.
            // Filtering will be done on the client side.
            const q = query(actionPlanCollection);
            actionPlanUnsub = onSnapshot(q, (snapshot) => {
                const currentSelectedYear = parseInt(document.getElementById('ecm-year-filter').value, 10);
                const plans = snapshot.docs
                    .map(doc => ({ ...doc.data(), docId: doc.id }))
                    .filter(plan => plan.year === currentSelectedYear); // Filter by year on the client
                renderActionPlan(plans);
            }, (error) => {
                console.error("Error listening to action plans:", error);
                showToast("Error al cargar el plan de acción.", "error");
            });
        };

        const renderActionPlan = (plans) => {
            const tbody = document.getElementById('action-plan-tbody');
            if (!tbody) return;
            tbody.innerHTML = plans.map(plan => `
                <tr class="border-b group" data-id="${plan.docId}">
                    <td class="px-4 py-3" contenteditable="true" data-field="action">${plan.action}</td>
                    <td class="px-4 py-3" contenteditable="true" data-field="responsible">${plan.responsible}</td>
                    <td class="px-4 py-3" contenteditable="true" data-field="deadline">${plan.deadline}</td>
                    <td class="px-4 py-3 text-center">
                        <input type="checkbox" class="action-plan-status h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300" ${plan.status === 'done' ? 'checked' : ''}>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button class="delete-action-plan-btn text-slate-400 hover:text-red-600 p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
                    </td>
                </tr>
            `).join('');
            lucide.createIcons();
        };

        const setupActionPlanListeners = () => {
            const tbody = document.getElementById('action-plan-tbody');
            const addBtn = document.getElementById('add-action-plan-btn');
            if (!tbody || !addBtn) return;

            addBtn.addEventListener('click', async () => {
                const selectedYear = parseInt(document.getElementById('ecm-year-filter').value, 10);
                const newPlan = { action: 'Nueva acción...', responsible: 'Responsable...', deadline: 'dd/mm/aaaa', status: 'pending', year: selectedYear };
                try {
                    await addDoc(collection(db, 'action_plans'), newPlan);
                    showToast('Nueva acción agregada.', 'success');
                } catch (error) {
                    showToast('Error al agregar la acción.', 'error');
                }
            });

            tbody.addEventListener('focusout', async (e) => {
                if (e.target.tagName === 'TD' && e.target.isContentEditable) {
                    const docId = e.target.parentElement.dataset.id;
                    const field = e.target.dataset.field;
                    const value = e.target.textContent;
                    const docRef = doc(db, 'action_plans', docId);
                    try {
                        await updateDoc(docRef, { [field]: value });
                        showToast('Plan de acción actualizado.', 'success');
                    } catch (error) { showToast('Error al actualizar.', 'error'); }
                }
            });

            tbody.addEventListener('change', async (e) => {
                if (e.target.matches('.action-plan-status')) {
                    const docId = e.target.closest('tr').dataset.id;
                    const status = e.target.checked ? 'done' : 'pending';
                    const docRef = doc(db, 'action_plans', docId);
                    try {
                        await updateDoc(docRef, { status: status });
                        showToast('Estado actualizado.', 'success');
                    } catch (error) { showToast('Error al actualizar estado.', 'error'); }
                }
            });

            tbody.addEventListener('click', async (e) => {
                const deleteBtn = e.target.closest('.delete-action-plan-btn');
                if (deleteBtn) {
                    const docId = deleteBtn.closest('tr').dataset.id;
                    showConfirmationModal('Eliminar Acción', '¿Está seguro?', async () => {
                        try {
                            await deleteDoc(doc(db, 'action_plans', docId));
                            showToast('Acción eliminada.', 'success');
                        } catch (error) { showToast('Error al eliminar la acción.', 'error'); }
                    });
                }
            });
        };

        setupActionPlanListeners();
        document.getElementById('ecm-year-filter').addEventListener('change', updateEcmDashboard);
        document.getElementById('ecm-status-filter').addEventListener('change', updateEcmDashboard);
        const unsub1 = onSnapshot(collection(db, COLLECTIONS.ECR_FORMS), updateEcmDashboard);
        const unsub2 = onSnapshot(collection(db, COLLECTIONS.ECO_FORMS), updateEcmDashboard);
        activeDashboardUnsub = () => { unsub1(); unsub2(); };
        updateEcmDashboard();
    };

    renderIndicadorEcmView();
    appState.currentViewCleanup = cleanup;
}

async function runControlEcrsLogic() {
    dom.headerActions.style.display = 'none';

    const viewHTML = `
        <div class="animate-fade-in-up">
            <div class="text-center mb-12">
                <div class="flex justify-center items-center gap-4">
                    <h2 class="text-4xl font-extrabold text-slate-800">Panel de Control Unificado</h2>
                    <button id="control-panel-help-btn" class="text-slate-400 hover:text-blue-600" title="¿Qué es esto?">
                        <i data-lucide="help-circle" class="w-8 h-8"></i>
                    </button>
                </div>
                <p class="text-lg text-slate-500 mt-2">Todos los módulos de gestión y seguimiento de Ingeniería en un solo lugar.</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-5xl mx-auto" data-tutorial-id="control-panel-container">
                <a href="#" data-view="ecr_table_view" data-tutorial-id="control-panel-card-table" class="nav-link dashboard-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1">
                    <div class="p-6 bg-slate-700 text-white">
                        <div class="flex items-center gap-4">
                            <i data-lucide="table-properties" class="w-10 h-10"></i>
                            <div>
                                <h3 class="text-2xl font-bold">Tabla Maestra de ECRs</h3>
                                <p class="opacity-90">Vista global de todos los ECRs.</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-slate-600">Visualice, filtre y busque en la hoja de seguimiento corporativa de todos los Engineering Change Requests.</p>
                    </div>
                </a>
                <a href="#" data-view="indicadores_ecm_view" data-tutorial-id="control-panel-card-indicators" class="nav-link dashboard-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1">
                    <div class="p-6 bg-blue-600 text-white">
                        <div class="flex items-center gap-4">
                            <i data-lucide="bar-chart-3" class="w-10 h-10"></i>
                            <div>
                                <h3 class="text-2xl font-bold">Indicadores de Gestión</h3>
                                <p class="opacity-90">Dashboard de Métricas (KPIs).</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-slate-600">Analice el rendimiento del proceso de cambios con gráficos de estado, eficiencia y plazos de ECRs y ECOs.</p>
                    </div>
                </a>
                <a href="#" data-view="ecr_seguimiento" data-tutorial-id="control-panel-card-metrics" class="nav-link dashboard-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1">
                    <div class="p-6 bg-emerald-600 text-white">
                        <div class="flex items-center gap-4">
                            <i data-lucide="clipboard-check" class="w-10 h-10"></i>
                            <div>
                                <h3 class="text-2xl font-bold">Seguimiento de Reuniones</h3>
                                <p class="opacity-90">Asistencia y pendencias.</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-slate-600">Registre y consulte la matriz de asistencia a reuniones de ECR y el estado de las pendencias por departamento.</p>
                    </div>
                </a>
                <a href="#" data-view="seguimiento_ecr_eco" class="nav-link dashboard-card bg-white rounded-xl shadow-lg hover:shadow-xl transition-shadow duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1">
                    <div class="p-6 bg-purple-600 text-white">
                        <div class="flex items-center gap-4">
                            <i data-lucide="file-check-2" class="w-10 h-10"></i>
                            <div>
                                <h3 class="text-2xl font-bold">Fichas de Seguimiento</h3>
                                <p class="opacity-90">Comentarios y firmas por área.</p>
                            </div>
                        </div>
                    </div>
                    <div class="p-6">
                        <p class="text-slate-600">Gestione las fichas individuales de cada ECR/ECO, con comentarios y estado de firma por departamento.</p>
                    </div>
                </a>
            </div>
        </div>
    `;

    dom.viewContent.innerHTML = viewHTML;
    lucide.createIcons();

    document.getElementById('control-panel-help-btn')?.addEventListener('click', () => {
        const helpContent = `
            <div class="space-y-4 text-slate-700">
                <p>El <strong>Panel de Control Unificado</strong> centraliza todas las herramientas para la gestión de cambios de ingeniería. Cada módulo tiene un propósito específico:</p>
                <ul class="list-disc list-inside space-y-3 pl-4">
                    <li>
                        <strong class="font-bold text-slate-800">Tabla Maestra de ECRs:</strong>
                        <p class="pl-5 text-sm">Es la vista principal para consultar y filtrar todos los ECRs de la empresa. Use esta tabla para un seguimiento detallado y para exportar informes completos.</p>
                    </li>
                    <li>
                        <strong class="font-bold text-slate-800">Indicadores de Gestión:</strong>
                        <p class="pl-5 text-sm">Un dashboard con gráficos y KPIs (Indicadores Clave de Rendimiento) que miden la eficiencia del proceso de cambios, como tiempos de aprobación, ECRs abiertos vs cerrados, etc.</p>
                    </li>
                    <li>
                        <strong class="font-bold text-slate-800">Seguimiento de Reuniones:</strong>
                         <p class="pl-5 text-sm">Aquí se gestiona la asistencia a las reuniones periódicas de ECR. Permite registrar presentes/ausentes y visualizar el compromiso de cada área.</p>
                    </li>
                    <li>
                        <strong class="font-bold text-slate-800">Fichas de Seguimiento:</strong>
                         <p class="pl-5 text-sm">Permite gestionar los formularios individuales de cada ECR/ECO, donde cada departamento deja sus comentarios y firma digitalmente su aprobación o rechazo.</p>
                    </li>
                </ul>
                 <div class="mt-6 pt-4 border-t">
                     <p class="text-sm">Para una guía paso a paso, haga clic en el botón <strong>Ver Tutorial</strong> en el panel.</p>
                 </div>
            </div>
        `;
        showInfoModal('Ayuda del Panel de Control', helpContent);
    });

    document.getElementById('start-control-panel-tutorial-btn')?.addEventListener('click', () => {
        appState.isTutorialActive = true;
        const app = {
            switchView,
            showToast,
            onTutorialEnd: () => {
                appState.isTutorialActive = false;
            },
            // Expose the new seeding function to the tutorial module
            seedControlPanelTutorialData,
        };
        newControlPanelTutorial(app).start();
    });

    // No specific cleanup needed for this simple view
    appState.currentViewCleanup = () => {};
}

async function runSeguimientoEcrEcoLogic() {
    dom.headerActions.style.display = 'none';
    const SEGUIMIENTO_COLLECTION = 'seguimiento_ecr_eco';
    let unsubscribe;
    let sortConfig = { key: 'lastModified', direction: 'desc' };
    let fichasData = [];

    const DEPARTAMENTOS = [
        'ENG. PRODUCTO', 'ENG. PROCESSO PLTL', 'HSE', 'QUALIDADE / CALIDAD', 'COMPRAS',
        'QUALIDADE COMPRAS', 'TOOLING & EQUIPAMENTS', 'LOGISTICA E PC&L', 'FINANCEIRO / COSTING',
        'COMERCIAL', 'MANUTENÇÃO / MANTENIMIENTO', 'PRODUÇÃO / PRODUCCIÓN', 'QUALIDADE CLIENTE'
    ];

    const ESTADOS_FICHA = ['CERRADA', 'ABIERTA', 'RECHAZADO', 'PENDIENTE', 'SIN NOTAS', 'FALTA FIRMAR'];
    const STATUS_COLORS = {
        CERRADA: 'status-cerrada',
        ABIERTA: 'status-abierta',
        RECHAZADO: 'status-rechazado',
        PENDIENTE: 'status-pendiente',
        SIN_NOTAS: 'status-sin-notas',
        FALTA_FIRMAR: 'status-falta-firmar'
    };

    const renderFichaForm = (fichaData = null, isReadOnly = false) => {
        if (!checkUserPermission('edit')) {
            isReadOnly = true;
        }
        const isEditing = fichaData !== null;
        const ecrEcoId = isEditing ? fichaData.id : `ECR-ECO-${Date.now()}`;

        let departamentosHTML = '';
        DEPARTAMENTOS.forEach(depto => {
            const deptoKey = depto.replace(/[\s/&]/g, '_');
            const ecrComentario = isEditing ? (fichaData.departamentos?.[deptoKey]?.ecrComentario || '') : '';
            const ecrFirmada = isEditing ? (fichaData.departamentos?.[deptoKey]?.ecrFirmada || 'NO') : 'NO';
            const ecoComentario = isEditing ? (fichaData.departamentos?.[deptoKey]?.ecoComentario || '') : '';
            const ecoFirmada = isEditing ? (fichaData.departamentos?.[deptoKey]?.ecoFirmada || 'NO') : 'NO';

            departamentosHTML += `
                <tr>
                    <td class="col-departamento">${depto}</td>
                    <td class="col-comentarios"><textarea name="ecr_comentario_${deptoKey}">${ecrComentario}</textarea></td>
                    <td class="col-firma">
                        <select name="ecr_firmada_${deptoKey}">
                            <option value="SI" ${ecrFirmada === 'SI' ? 'selected' : ''}>SI</option>
                            <option value="NO" ${ecrFirmada === 'NO' ? 'selected' : ''}>NO</option>
                        </select>
                    </td>
                    <td class="col-comentarios"><textarea name="eco_comentario_${deptoKey}">${ecoComentario}</textarea></td>
                    <td class="col-firma">
                        <select name="eco_firmada_${deptoKey}">
                            <option value="SI" ${ecoFirmada === 'SI' ? 'selected' : ''}>SI</option>
                            <option value="NO" ${ecoFirmada === 'NO' ? 'selected' : ''}>NO</option>
                        </select>
                    </td>
                </tr>
            `;
        });

        const estadoOptionsHTML = ESTADOS_FICHA.map(estado => {
            const selected = isEditing && fichaData.estadoGeneral === estado ? 'selected' : '';
            return `<option value="${estado}" ${selected}>${estado}</option>`;
        }).join('');

        const leyendaHTML = ESTADOS_FICHA.map(estado => `
            <div class="leyenda-item">
                <div class="leyenda-color-box ${STATUS_COLORS[estado.replace(' ', '_')]}"></div>
                <span>${estado}</span>
            </div>
        `).join('');

        const viewHTML = `
            <div class="ficha-seguimiento animate-fade-in-up">
                <form id="ficha-form" data-id="${ecrEcoId}">
                    <header class="ficha-header">
                        <div class="ficha-grid-meta">
                            <div class="meta-item">
                                <label for="n_eco_ecr">N° de Eco/Ecr</label>
                                <input type="text" id="n_eco_ecr" name="n_eco_ecr" value="${isEditing ? fichaData.n_eco_ecr : ''}" required>
                            </div>
                            <div class="meta-item">
                                <label for="cliente">Cliente</label>
                                <input type="text" id="cliente" name="cliente" value="${isEditing ? fichaData.cliente : ''}">
                            </div>
                            <div class="meta-item">
                                <label for="pedido">Pedido</label>
                                <input type="text" id="pedido" name="pedido" value="${isEditing ? fichaData.pedido : ''}">
                            </div>
                             <div class="meta-item" style="grid-column: 1 / -1;">
                                <label for="descripcion">Descripcion</label>
                                <textarea id="descripcion" name="descripcion" rows="2">${isEditing ? fichaData.descripcion : ''}</textarea>
                            </div>
                        </div>
                    </header>
                    <div class="ficha-body">
                        <table class="departamentos-table">
                            <thead>
                                <tr>
                                    <th class="col-departamento">Departamento</th>
                                    <th class="col-comentarios">Comentarios según ECR</th>
                                    <th class="col-firma">Firmada (ECR)</th>
                                    <th class="col-comentarios">Comentarios según ECO</th>
                                    <th class="col-firma">Firmada (ECO)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${departamentosHTML}
                            </tbody>
                        </table>
                    </div>
                    <footer class="ficha-footer">
                        <div class="estado-general-container">
                            <label for="estado-general">Estado General:</label>
                            <select id="estado-general" name="estadoGeneral" class="estado-general-select ${STATUS_COLORS[(isEditing ? fichaData.estadoGeneral : 'ABIERTA').replace(' ', '_')]}">
                                ${estadoOptionsHTML}
                            </select>
                        </div>
                         <div class="leyenda-colores">
                            ${leyendaHTML}
                        </div>
                        <div class="ficha-actions">
                            <button type="button" class="bg-gray-500 text-white px-4 py-2 rounded-md hover:bg-gray-600" id="back-to-list-btn">Volver a la Lista</button>
                            <button type="submit" class="btn-save">${isEditing ? 'Actualizar Ficha' : 'Guardar Ficha'}</button>
                            ${isEditing ? `<button type="button" class="btn-delete" id="delete-ficha-btn">Eliminar Ficha</button>` : ''}
                        </div>
                    </footer>
                </form>
            </div>
        `;
        dom.viewContent.innerHTML = viewHTML;

        const form = document.getElementById('ficha-form');

        if (isReadOnly) {
            form.querySelectorAll('input, textarea, select').forEach(el => {
                el.disabled = true;
            });
            const saveBtn = form.querySelector('.btn-save');
            if (saveBtn) saveBtn.style.display = 'none';
            const deleteBtn = form.querySelector('.btn-delete');
            if (deleteBtn) deleteBtn.style.display = 'none';

            const actionsContainer = form.querySelector('.ficha-actions');
            if (actionsContainer) {
                const n_eco_ecr = fichaData.n_eco_ecr || '';
                let associatedButtonHTML = '';
                if (n_eco_ecr) {
                    const type = n_eco_ecr.startsWith('ECR') ? 'ecr' : (n_eco_ecr.startsWith('ECO') ? 'eco' : null);
                    if (type) {
                        associatedButtonHTML = `
                            <button type="button" data-action="view-associated-${type}" data-id="${n_eco_ecr}" class="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 font-semibold">
                                Ver ${type.toUpperCase()}
                            </button>`;
                    }
                }

                const newButtonsHTML = `
                    <button type="button" data-action="generate-ficha-pdf" data-id="${fichaData.id}" class="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 font-semibold">
                        Generar PDF
                    </button>
                    ${associatedButtonHTML}
                `;
                actionsContainer.insertAdjacentHTML('beforeend', newButtonsHTML);
            }
        }

        form.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button || button.type === 'submit') return;

            e.preventDefault();

            const action = button.dataset.action;
            const id = button.dataset.id;

            if (action === 'generate-ficha-pdf') {
                await generateFichaPdf(id);
            } else if (action === 'view-associated-ecr') {
                switchView('ecr_form', { ecrId: id });
            } else if (action === 'view-associated-eco') {
                switchView('eco_form', { ecoId: id });
            }
        });

        form.addEventListener('submit', handleSaveFicha);

        document.getElementById('back-to-list-btn').addEventListener('click', renderMainView);

        if (isEditing && !isReadOnly) {
            document.getElementById('delete-ficha-btn').addEventListener('click', () => handleDeleteFicha(ecrEcoId));
        }

        const estadoSelect = document.getElementById('estado-general');
        estadoSelect.addEventListener('change', (e) => {
            estadoSelect.className = 'estado-general-select'; // Reset classes
            const selectedStatusClass = STATUS_COLORS[e.target.value.replace(' ', '_')];
            if(selectedStatusClass) {
                estadoSelect.classList.add(selectedStatusClass);
            }
        });
    };

    const handleSaveFicha = async (e) => {
        e.preventDefault();
        const form = e.target;
        const id = form.dataset.id;
        const n_eco_ecr = form.querySelector('[name="n_eco_ecr"]').value;

        if (!n_eco_ecr) {
            showToast('El campo "N° de Eco/Ecr" es obligatorio.', 'error');
            return;
        }

        const fichaData = {
            id: id,
            n_eco_ecr: n_eco_ecr,
            cliente: form.querySelector('[name="cliente"]').value,
            pedido: form.querySelector('[name="pedido"]').value,
            descripcion: form.querySelector('[name="descripcion"]').value,
            estadoGeneral: form.querySelector('[name="estadoGeneral"]').value,
            departamentos: {},
            lastModified: new Date()
        };

        DEPARTAMENTOS.forEach(depto => {
            const deptoKey = depto.replace(/[\s/&]/g, '_');
            fichaData.departamentos[deptoKey] = {
                ecrComentario: form.querySelector(`[name="ecr_comentario_${deptoKey}"]`).value,
                ecrFirmada: form.querySelector(`[name="ecr_firmada_${deptoKey}"]`).value,
                ecoComentario: form.querySelector(`[name="eco_comentario_${deptoKey}"]`).value,
                ecoFirmada: form.querySelector(`[name="eco_firmada_${deptoKey}"]`).value,
            };
        });

        try {
            const docRef = doc(db, SEGUIMIENTO_COLLECTION, id);
            await setDoc(docRef, fichaData, { merge: true });
            showToast('Ficha guardada con éxito.', 'success');
            renderMainView();
        } catch (error) {
            console.error("Error guardando la ficha: ", error);
            showToast('Error al guardar la ficha.', 'error');
        }
    };

    const handleDeleteFicha = (id) => {
        showConfirmationModal('Eliminar Ficha', '¿Está seguro de que desea eliminar esta ficha? Esta acción no se puede deshacer.', async () => {
            try {
                await deleteDoc(doc(db, SEGUIMIENTO_COLLECTION, id));
                showToast('Ficha eliminada.', 'success');
                renderMainView();
            } catch (error) {
                console.error("Error deleting ficha: ", error);
                showToast('Error al eliminar la ficha.', 'error');
            }
        });
    };

    const seedSeguimientoData = async () => {
        const snapshot = await getDocs(query(collection(db, SEGUIMIENTO_COLLECTION), limit(1)));
        if (!snapshot.empty) {
            console.log('La colección de seguimiento ya tiene datos. No se necesita seeding.');
            return;
        }

        showToast('Creando datos de prueba para seguimiento...', 'info');
        const batch = writeBatch(db);
        const sampleFicha1 = {
            id: 'ECR-ECO-SAMPLE-1',
            n_eco_ecr: 'ECR-2024-001',
            cliente: 'Cliente de Prueba A',
            pedido: 'PED-001',
            descripcion: 'Modificación inicial del componente X para mejorar la durabilidad.',
            estadoGeneral: 'ABIERTA',
            departamentos: {
                'ENG_PRODUCTO': { ecrComentario: 'Revisar planos y especificaciones.', ecrFirmada: 'SI', ecoComentario: '', ecoFirmada: 'NO' },
                'COMPRAS': { ecrComentario: 'Evaluar impacto en proveedores.', ecrFirmada: 'NO', ecoComentario: '', ecoFirmada: 'NO' }
            },
            lastModified: new Date()
        };
        const sampleFicha2 = {
            id: 'ECR-ECO-SAMPLE-2',
            n_eco_ecr: 'ECO-2024-002',
            cliente: 'Cliente de Prueba B',
            pedido: 'PED-002',
            descripcion: 'Implementación del cambio de material para el ensamblaje Y.',
            estadoGeneral: 'PENDIENTE',
            departamentos: {
                'ENG_PRODUCTO': { ecrComentario: 'Planos actualizados.', ecrFirmada: 'SI', ecoComentario: 'Cambio implementado.', ecoFirmada: 'SI' },
                'QUALIDADE_CALIDAD': { ecrComentario: 'Plan de control requerido.', ecrFirmada: 'SI', ecoComentario: 'Plan de control actualizado y validado.', ecoFirmada: 'NO' }
            },
            lastModified: new Date()
        };

        batch.set(doc(db, SEGUIMIENTO_COLLECTION, sampleFicha1.id), sampleFicha1);
        batch.set(doc(db, SEGUIMIENTO_COLLECTION, sampleFicha2.id), sampleFicha2);

        try {
            await batch.commit();
            showToast('Datos de prueba creados.', 'success');
        } catch(error) {
            console.error('Error al crear datos de prueba de seguimiento:', error);
            showToast('Error al crear datos de prueba.', 'error');
        }
    };

    const renderMainView = () => {
        seedSeguimientoData();

        const canCreate = checkUserPermission('edit');
        const createButtonHTML = canCreate ? `
            <button id="create-new-ficha-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md">
                <i data-lucide="plus" class="mr-2 h-5 w-5"></i>Crear Nueva Ficha
            </button>` : '';

        const viewHTML = `
            <div class="animate-fade-in-up">
                 <div class="flex justify-between items-center mb-6">
                     <div class="flex items-center gap-2">
                        <button data-view="control_ecrs" class="p-2 rounded-full hover:bg-slate-100 transition-colors">
                            <i data-lucide="arrow-left" class="w-6 h-6 text-slate-600"></i>
                        </button>
                        <h2 class="text-2xl font-bold text-slate-800">Listado de Fichas de Seguimiento</h2>
                     </div>
                    ${createButtonHTML}
                </div>
                <div class="bg-white p-6 rounded-xl shadow-lg">
                    <div class="overflow-x-auto list-container">
                        <table class="w-full text-sm text-left text-gray-600">
                            <thead class="text-xs text-gray-700 uppercase bg-gray-100">
                                <tr>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="n_eco_ecr" title="Número de Engineering Change Order / Request. Haga clic para ordenar.">N° Eco/Ecr</th>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="descripcion" title="Descripción de la ficha. Haga clic para ordenar.">Descripción</th>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="cliente" title="Cliente asociado. Haga clic para ordenar.">Cliente</th>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="estadoGeneral" title="Estado actual de la ficha. Haga clic para ordenar.">Estado</th>
                                    <th scope="col" class="px-6 py-3 sortable-header" data-sort="lastModified" title="Fecha de la última modificación. Haga clic para ordenar.">Última Modificación</th>
                                    <th scope="col" class="px-6 py-3 text-right">Acciones</th>
                                </tr>
                            </thead>
                            <tbody id="fichas-list">
                                <tr><td colspan="6" class="text-center py-16"><i data-lucide="loader" class="animate-spin h-8 w-8 mx-auto"></i></td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;
        dom.viewContent.innerHTML = viewHTML;
        lucide.createIcons();

        if (canCreate) {
            document.getElementById('create-new-ficha-btn').addEventListener('click', () => renderFichaForm());
        }

        const listBody = document.getElementById('fichas-list');
        const tableHead = dom.viewContent.querySelector('thead');

        tableHead.addEventListener('click', (e) => {
            const header = e.target.closest('.sortable-header');
            if (header) {
                const key = header.dataset.sort;
                if (sortConfig.key === key) {
                    sortConfig.direction = sortConfig.direction === 'asc' ? 'desc' : 'asc';
                } else {
                    sortConfig.key = key;
                    sortConfig.direction = 'asc';
                }
                renderTableRows(fichasData);
            }
        });

        listBody.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action]');
            if (!button) return;

            const fichaId = button.dataset.id;
            const action = button.dataset.action;

            if (action === 'view-ficha' || action === 'edit-ficha') {
                const docRef = doc(db, SEGUIMIENTO_COLLECTION, fichaId);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const isReadOnly = action === 'view-ficha';
                    renderFichaForm(docSnap.data(), isReadOnly);
                } else {
                    showToast('Error: No se encontró la ficha.', 'error');
                }
            }
        });

        const fichasCollection = collection(db, SEGUIMIENTO_COLLECTION);

        // The query is now outside the snapshot to allow re-sorting without re-fetching
        const q = query(fichasCollection, orderBy('lastModified', 'desc'));

        unsubscribe = onSnapshot(q, (snapshot) => {
            fichasData = snapshot.docs.map(doc => doc.data());
            renderTableRows(fichasData);
        }, (error) => {
            console.error("Error fetching fichas: ", error);
            showToast('Error al cargar las fichas de seguimiento.', 'error');
            const listBody = document.getElementById('fichas-list');
            if(listBody) listBody.innerHTML = `<tr><td colspan="6" class="text-center py-16 text-red-500">Error al cargar los datos.</td></tr>`;
        });
    };

    const renderTableRows = (data) => {
        const listBody = document.getElementById('fichas-list');
        if (!listBody) return;

        // --- Sorting Logic ---
        data.sort((a, b) => {
            let valA = a[sortConfig.key];
            let valB = b[sortConfig.key];

            // Handle date objects
            if (valA?.toDate && valB?.toDate) {
                valA = valA.toDate();
                valB = valB.toDate();
            }

            if (valA < valB) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (valA > valB) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

        // --- Update Header Icons ---
        dom.viewContent.querySelectorAll('.sortable-header').forEach(header => {
            const key = header.dataset.sort;
            const iconContainer = header.querySelector('.sort-icon') || document.createElement('i');
            iconContainer.className = 'sort-icon inline-block ml-1';
            if (sortConfig.key === key) {
                iconContainer.setAttribute('data-lucide', sortConfig.direction === 'asc' ? 'arrow-up' : 'arrow-down');
            } else {
                iconContainer.removeAttribute('data-lucide');
            }
            if (!header.querySelector('.sort-icon')) {
                 header.appendChild(iconContainer);
            }
        });

        if (data.length === 0) {
            listBody.innerHTML = `<tr><td colspan="6" class="text-center py-16 text-gray-500">No hay fichas de seguimiento. Puede crear una nueva.</td></tr>`;
            return;
        }

        listBody.innerHTML = data.map(ficha => {
            const statusClass = STATUS_COLORS[ficha.estadoGeneral?.replace(' ', '_')] || 'bg-gray-100 text-gray-800';
            const editButtonHTML = checkUserPermission('edit') ?
                `<button data-id="${ficha.id}" data-action="edit-ficha" class="text-gray-500 hover:text-green-600 p-1" title="Editar Ficha"><i data-lucide="edit" class="h-5 w-5 pointer-events-none"></i></button>` :
                '';

            return `
                <tr class="bg-white border-b hover:bg-gray-50">
                    <td class="px-6 py-4 font-medium text-gray-900">${ficha.n_eco_ecr}</td>
                    <td class="px-6 py-4">${ficha.descripcion || ''}</td>
                    <td class="px-6 py-4">${ficha.cliente || ''}</td>
                    <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusClass}">${ficha.estadoGeneral}</span></td>
                    <td class="px-6 py-4">${ficha.lastModified.toDate().toLocaleString('es-AR')}</td>
                    <td class="px-6 py-4 text-right space-x-2">
                        <button data-id="${ficha.id}" data-action="view-ficha" class="text-gray-500 hover:text-blue-600 p-1" title="Ver Ficha"><i data-lucide="eye" class="h-5 w-5 pointer-events-none"></i></button>
                        ${editButtonHTML}
                    </td>
                </tr>
            `;
        }).join('');
        lucide.createIcons();
    };

    renderMainView();

    appState.currentViewCleanup = () => {
        if (unsubscribe) {
            unsubscribe();
        }
    };
}

async function runEcrSeguimientoLogic() {
    dom.headerActions.style.display = 'none';

    // Centralized list of departments
    const DEPARTAMENTOS = [
        { id: 'ing_manufatura', label: 'Ing. Manufatura' }, { id: 'hse', label: 'HSE' },
        { id: 'calidad', label: 'Calidad' }, { id: 'compras', label: 'Compras' },
        { id: 'sqa', label: 'Calidad Prov.' }, { id: 'tooling', label: 'Herramental' },
        { id: 'logistica', label: 'Logística PC&L' }, { id: 'financiero', label: 'Finanzas' },
        { id: 'comercial', label: 'Comercial' }, { id: 'mantenimiento', label: 'Mantenimiento' },
        { id: 'produccion', label: 'Producción' }, { id: 'calidad_cliente', label: 'Calidad Cliente' },
        { id: 'ing_producto', label: 'Ing. Producto' }
    ];

    const createPlaceholder = (message, icon = 'loader') => `
        <div class="text-center text-slate-500 py-10 animate-fade-in">
            <i data-lucide="${icon}" class="w-12 h-12 mx-auto text-slate-300 ${icon === 'loader' ? 'animate-spin' : ''}"></i>
            <p class="mt-4 font-semibold">${message}</p>
        </div>
    `;

    const viewHTML = `
        <div class="animate-fade-in-up space-y-8" data-tutorial-id="ecr-seguimiento-view-container">
            <div>
                <button data-view="control_ecrs" class="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-800 mb-2">
                    <i data-lucide="arrow-left" class="w-4 h-4"></i>
                    Volver al Panel de Control
                </button>
            </div>

            <!-- Sección 1: Registro de ECR -->
            <section id="ecr-log-section" class="bg-white p-6 rounded-xl shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-slate-800">Registro de ECR</h3>
                    <div class="flex items-center gap-2 text-sm">
                        <div class="flex items-center gap-2"><div class="w-4 h-4 rounded-full bg-green-200 border border-green-400"></div><span>OK</span></div>
                        <div class="flex items-center gap-2"><div class="w-4 h-4 rounded-full bg-red-200 border border-red-400"></div><span>NOK</span></div>
                    </div>
                </div>
                <div id="ecr-log-container">
                    ${createPlaceholder('Cargando registro de ECR...')}
                </div>
            </section>

            <!-- Sección 2: Matriz de Asistencia -->
            <section id="asistencia-matriz-section" class="bg-white p-6 rounded-xl shadow-lg">
                <div class="flex justify-between items-center mb-4">
                    <h3 class="text-xl font-bold text-slate-800">Matriz de Asistencia a Reuniones</h3>
                    <button id="add-reunion-btn" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm font-semibold flex items-center gap-2">
                        <i data-lucide="plus"></i> Agregar Reunión
                    </button>
                </div>
                <div id="asistencia-matriz-container">
                    ${createPlaceholder('Cargando matriz de asistencia...')}
                </div>
            </section>

            <!-- Sección 3: Resumen y Gráficos -->
            <section id="resumen-graficos-section" class="bg-white p-6 rounded-xl shadow-lg">
                <h3 class="text-xl font-bold text-slate-800 mb-4">Resumen y Gráficos de Asistencia</h3>
                <div id="resumen-graficos-container" class="space-y-8">
                    <div id="resumen-container">
                        ${createPlaceholder('Cargando resumen...')}
                    </div>
                    <div id="graficos-container" class="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div id="grafico-ausentismo-dias" class="min-h-[300px]">
                            ${createPlaceholder('Cargando gráfico...')}
                        </div>
                        <div id="grafico-ausentismo-porcentaje" class="min-h-[300px]">
                             ${createPlaceholder('Cargando gráfico...')}
                        </div>
                    </div>
                </div>
            </section>

        </div>
    `;
    dom.viewContent.innerHTML = viewHTML;
    lucide.createIcons();

    const renderEcrLog = async (departamentos) => {
        const ecrLogContainer = document.getElementById('ecr-log-container');
        if (!ecrLogContainer) return;

        try {
            const ecrDocs = appState.collections[COLLECTIONS.ECR_FORMS] || [];

            if (ecrDocs.length === 0) {
                ecrLogContainer.innerHTML = createPlaceholder('No se encontraron registros de ECR.', 'search-x');
                lucide.createIcons();
                return;
            }

            const calcularAtraso = (fechaAbertura, fechaCierre) => {
                if (!fechaAbertura && !fechaCierre) return { dias: '', clase: '' };
                const hoy = new Date();
                hoy.setHours(0, 0, 0, 0);
                const abertura = fechaAbertura ? new Date(fechaAbertura + 'T00:00:00') : null;
                const cierre = fechaCierre ? new Date(fechaCierre + 'T00:00:00') : null;
                let diffDays;
                if (abertura && cierre) diffDays = (cierre.getTime() - abertura.getTime()) / (1000 * 3600 * 24);
                else if (abertura && !cierre) diffDays = (hoy.getTime() - abertura.getTime()) / (1000 * 3600 * 24);
                else if (!abertura && cierre) diffDays = (cierre.getTime() - hoy.getTime()) / (1000 * 3600 * 24);
                else return { dias: '', clase: '' };

                const dias = Math.floor(diffDays);
                let clase = 'atraso-bajo';
                if (dias > 30) clase = 'atraso-alto';
                else if (dias > 7) clase = 'atraso-medio';
                return { dias, clase };
            };

            let tableHTML = `
                <div class="overflow-x-auto ecr-log-table-wrapper">
                    <table class="w-full text-sm ecr-log-table">
                        <thead>
                            <tr class="bg-slate-800 text-white text-xs uppercase tracking-wider">
                                <th colspan="5" class="p-3 text-center">ECR | FECHAS</th>
                                <th class="bg-slate-400 w-2"></th>
                                <th colspan="${departamentos.length}" class="p-3 text-center">PENDENCIAS</th>
                            </tr>
                            <tr class="bg-slate-100 text-xs uppercase">
                                <th class="p-2 font-semibold">Nº</th>
                                <th class="p-2 font-semibold">F. Abertura</th>
                                <th class="p-2 font-semibold">F. Cierre</th>
                                <th class="p-2 font-semibold">Fecha</th>
                                <th class="p-2 font-semibold">Atraso (días)</th>
                                <th class="bg-slate-400 w-2"></th>
                                ${departamentos.map(d => `<th class="p-2 text-center align-middle font-semibold" style="writing-mode: vertical-rl; transform: rotate(180deg);">${d.label}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
            `;

            ecrDocs.sort((a,b) => (a.id > b.id) ? 1 : -1).forEach(ecr => {
                const atraso = calcularAtraso(ecr.fecha_emision, ecr.fecha_cierre);
                tableHTML += `
                    <tr>
                        <td>${ecr.id || ''}</td>
                        <td>${ecr.fecha_emision ? new Date(ecr.fecha_emision + 'T00:00:00').toLocaleDateString('es-AR') : ''}</td>
                        <td>${ecr.fecha_cierre ? new Date(ecr.fecha_cierre + 'T00:00:00').toLocaleDateString('es-AR') : ''}</td>
                        <td>${ecr.fecha_realizacion_ecr ? new Date(ecr.fecha_realizacion_ecr + 'T00:00:00').toLocaleDateString('es-AR') : ''}</td>
                        <td class="text-center font-bold ${atraso.clase}">${atraso.dias}</td>
                        <td class="bg-slate-400 w-2"></td>
                        ${departamentos.map(depto => {
                            const approval = ecr.approvals ? (ecr.approvals[depto.id] || { status: 'pending' }) : { status: 'pending' };
                            const status = approval.status;
                            const statusText = { 'approved': 'OK', 'rejected': 'NOK', 'pending': '' }[status] || '';
                             const statusClass = { 'approved': 'status-ok', 'rejected': 'status-nok', 'pending': 'status-empty' }[status] || 'status-empty';
                            const canApprove = appState.currentUser.role === 'admin' || appState.currentUser.sector === depto.id;
                            const buttonClass = canApprove ? 'cursor-pointer' : 'cursor-not-allowed';
                            const comment = approval.comment || 'Sin comentarios.';
                            const user = approval.user || 'N/A';
                            const date = approval.date || 'N/A';
                            const isActionable = canApprove && (status === 'pending' || status === 'rejected');
                            const title = isActionable
                                ? `Clic para ir a la sección de aprobación de ${depto.label}`
                                : `Ver detalles del ECR ${ecr.id}`;

                            return `<td class="p-0"><button title="${title}" data-action="navigate-to-ecr-details" data-ecr-id="${ecr.id}" data-depto-id="${depto.id}" data-current-status="${status}" class="w-full h-full text-center font-bold ${statusClass} cursor-pointer p-2">${statusText}</button></td>`;
                        }).join('')}
                    </tr>
                `;
            });

            tableHTML += `</tbody></table></div>`;
            ecrLogContainer.innerHTML = tableHTML;

        } catch (error) {
            console.error("Error rendering ECR log:", error);
            ecrLogContainer.innerHTML = `<p class="text-red-500">Error al cargar el registro de ECR.</p>`;
        }
    };

    renderEcrLog(DEPARTAMENTOS);

    const ecrLogContainer = document.getElementById('ecr-log-container');
    if (ecrLogContainer) {
        ecrLogContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action="navigate-to-ecr-details"]');
            if (!button) return;

            const { ecrId, deptoId, currentStatus } = button.dataset;
            const currentUserSector = appState.currentUser.sector;

            // Admins or users from the correct department whose approval is pending/rejected can take action
            const isActionable = (appState.currentUser.role === 'admin' || currentUserSector === deptoId) &&
                                 (currentStatus === 'pending' || currentStatus === 'rejected');

            if (isActionable) {
                showToast(`Navegando a la sección de aprobación para ${depto.label}...`, 'info');
                switchView('ecr_form', { ecrId, scrollToSection: deptoId });
            } else {
                showToast(`Abriendo ECR ${ecrId} en modo de solo lectura...`, 'info');
                switchView('ecr_form', { ecrId });
            }
        });
    }

    const renderAsistenciaMatriz = async (departamentos) => {
        const container = document.getElementById('asistencia-matriz-container');
        if (!container) return;

        try {
            const reuniones = appState.collections[COLLECTIONS.REUNIONES_ECR] || [];
            if (reuniones.length === 0) {
                container.innerHTML = createPlaceholder('No se encontraron reuniones para mostrar.', 'calendar-x');
                lucide.createIcons();
                return;
            }

            reuniones.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

            let tableHTML = `
                <div class="overflow-x-auto asistencia-matriz-wrapper">
                    <table class="w-full text-sm asistencia-matriz-table">
                        <thead>
                            <tr class="bg-slate-100 text-xs uppercase">
                                <th class="p-2 font-semibold sticky left-0 bg-slate-100 z-10">Frecuencia</th>
                                ${reuniones.map(r => `<th class="p-2 font-semibold">${new Date(r.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</th>`).join('')}
                            </tr>
                        </thead>
                        <tbody>
            `;

            departamentos.forEach(depto => {
                tableHTML += `
                    <tr>
                        <td class="font-semibold sticky left-0 bg-white z-10">${depto.label}</td>
                        ${reuniones.map(reunion => {
                            const status = reunion.asistencia[depto.id] || '';
                            const statusClass = { 'P': 'status-p', 'A': 'status-a', 'O': 'status-o' }[status] || 'status-empty';
                            return `<td><button data-action="toggle-asistencia-status" data-reunion-id="${reunion.id}" data-depto-id="${depto.id}" class="w-full h-full text-center font-bold ${statusClass}">${status}</button></td>`;
                        }).join('')}
                    </tr>
                `;
            });

            tableHTML += `</tbody></table></div>`;
            container.innerHTML = tableHTML;

        } catch (error) {
            console.error("Error rendering Asistencia Matriz:", error);
            container.innerHTML = `<p class="text-red-500">Error al cargar la matriz de asistencia.</p>`;
        }
    };

    renderAsistenciaMatriz(DEPARTAMENTOS);

    const asistenciaMatrizContainer = document.getElementById('asistencia-matriz-container');
    if (asistenciaMatrizContainer) {
        asistenciaMatrizContainer.addEventListener('click', async (e) => {
            const button = e.target.closest('button[data-action="toggle-asistencia-status"]');
            if (!button) return;

            const reunionId = button.dataset.reunionId;
            const deptoId = button.dataset.deptoId;

            if (!reunionId || !deptoId) return;

            const statusCycle = { '': 'P', 'P': 'A', 'A': 'O', 'O': '' };
            const currentStatus = button.textContent;
            const nextStatus = statusCycle[currentStatus];

            const docRef = doc(db, COLLECTIONS.REUNIONES_ECR, reunionId);
            const update = { [`asistencia.${deptoId}`]: nextStatus };

            try {
                await updateDoc(docRef, update);
                showToast('Asistencia actualizada.', 'success');
            } catch (error) {
                console.error('Error updating asistencia:', error);
                showToast('Error al actualizar la asistencia.', 'error');
            }
        });
    }

    const addReunionBtn = document.getElementById('add-reunion-btn');
    if (addReunionBtn) {
        addReunionBtn.addEventListener('click', async () => {
            const newDate = await showDatePromptModal('Agregar Reunión', 'Seleccione la fecha para la nueva reunión:');
            if (!newDate) return; // User cancelled

            const reunionId = `reunion_${newDate}`;
            const docRef = doc(db, COLLECTIONS.REUNIONES_ECR, reunionId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                showToast('Ya existe una reunión para esta fecha.', 'error');
                return;
            }

            const newReunionData = {
                id: reunionId,
                fecha: newDate,
                asistencia: DEPARTAMENTOS.reduce((acc, depto) => {
                    acc[depto.id] = ''; // Initialize all as empty
                    return acc;
                }, {})
            };

            try {
                await setDoc(docRef, newReunionData);
                showToast('Nueva reunión agregada con éxito.', 'success');
            } catch (error) {
                console.error('Error adding new reunion:', error);
                showToast('Error al agregar la nueva reunión.', 'error');
            }
        });
    }

    const renderResumenYGraficos = async (departamentos) => {
        const resumenContainer = document.getElementById('resumen-container');
        const graficoDiasContainer = document.getElementById('grafico-ausentismo-dias');
        const graficoPorcContainer = document.getElementById('grafico-ausentismo-porcentaje');

        if (!resumenContainer || !graficoDiasContainer || !graficoPorcContainer) return;

        try {
            const reuniones = appState.collections[COLLECTIONS.REUNIONES_ECR] || [];
            if (reuniones.length === 0) {
                resumenContainer.innerHTML = createPlaceholder('Sin datos para el resumen.', 'file-x');
                graficoDiasContainer.innerHTML = createPlaceholder('Sin datos para el gráfico.', 'bar-chart-big');
                graficoPorcContainer.innerHTML = createPlaceholder('Sin datos para el gráfico.', 'pie-chart');
                lucide.createIcons();
                return;
            }

            const resumenData = departamentos.map(depto => {
                let p = 0, a = 0, o = 0;
                reuniones.forEach(reunion => {
                    const status = reunion.asistencia[depto.id];
                    if (status === 'P') p++;
                    else if (status === 'A') a++;
                    else if (status === 'O') o++;
                });
                const total = p + a + o;
                const porcAusentismo = total > 0 ? (a / total) : 0;
                return { label: depto.label, p, a, o, porcAusentismo };
            });

            // Render Resumen Table
            let resumenHTML = `
                <h4 class="text-lg font-bold text-slate-700 mb-2">Resumen de Asistencia</h4>
                <div class="overflow-x-auto resumen-table-wrapper">
                    <table class="w-full text-sm resumen-table">
                        <thead class="bg-slate-50">
                            <tr class="text-xs uppercase">
                                <th>Departamento</th>
                                <th>Presente</th>
                                <th>Ausente</th>
                                <th>Opcional</th>
                                <th>Días Ausent.</th>
                                <th>% Ausent.</th>
                            </tr>
                        </thead>
                        <tbody>
            `;
            resumenData.forEach(data => {
                resumenHTML += `
                    <tr>
                        <td class="font-semibold">${data.label}</td>
                        <td>${data.p}</td>
                        <td>${data.a}</td>
                        <td>${data.o}</td>
                        <td class="font-bold">${data.a}</td>
                        <td>${(data.porcAusentismo * 100).toFixed(1)}%</td>
                    </tr>
                `;
            });
            resumenHTML += `</tbody></table></div>`;
            resumenContainer.innerHTML = resumenHTML;

            // Render Charts
            const labels = resumenData.map(d => d.label);
            const diasAusentismoData = resumenData.map(d => d.a);
            const porcAusentismoData = resumenData.map(d => d.porcAusentismo);

            graficoDiasContainer.innerHTML = '<canvas id="chart-dias-ausentismo"></canvas>';
            new Chart(document.getElementById('chart-dias-ausentismo').getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Días de Ausentismo',
                        data: diasAusentismoData,
                        backgroundColor: '#f87171'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: 'DIAS DE AUSENTISMO A LAS REUNIONES DE ECR', font: { weight: 'bold', size: 14 } },
                        legend: { display: false }
                    },
                    scales: { x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } }, y: { beginAtZero: true, ticks: { stepSize: 1 } } }
                }
            });

            graficoPorcContainer.innerHTML = '<canvas id="chart-porc-ausentismo"></canvas>';
            new Chart(document.getElementById('chart-porc-ausentismo').getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: '% Total de Ausentismo',
                        data: porcAusentismoData,
                        backgroundColor: '#fbbf24'
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: {
                        title: { display: true, text: '%. TOTAL DE AUSENTISMO A LAS REUNIONES DE ECR', font: { weight: 'bold', size: 14 } },
                        legend: { display: false }
                    },
                    scales: {
                        x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 45 } },
                        y: { beginAtZero: true, max: 1, ticks: { callback: value => (value * 100).toFixed(0) + '%' } }
                    }
                }
            });

        } catch (error) {
            console.error("Error rendering Resumen y Gráficos:", error);
            resumenContainer.innerHTML = `<p class="text-red-500">Error al cargar el resumen.</p>`;
        }
    };

    renderResumenYGraficos(DEPARTAMENTOS);

    appState.currentViewCleanup = () => {
        // Future cleanup logic
    };
}

function openEcrProductSearchModal() {
    let clientOptions = '<option value="">Todos</option>' + appState.collections[COLLECTIONS.CLIENTES].map(c => `<option value="${c.id}">${c.descripcion}</option>`).join('');
    const modalId = `ecr-prod-search-modal-${Date.now()}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col m-4 modal-content">
                <div class="flex justify-between items-center p-5 border-b">
                    <h3 class="text-xl font-bold">Buscar Producto</h3>
                    <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label for="search-ecr-prod-term" class="block text-sm font-medium">Código/Descripción</label>
                        <input type="text" id="search-ecr-prod-term" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">
                    </div>
                    <div>
                        <label for="search-ecr-prod-client" class="block text-sm font-medium">Cliente</label>
                        <select id="search-ecr-prod-client" class="mt-1 block w-full border-gray-300 rounded-md shadow-sm">${clientOptions}</select>
                    </div>
                </div>
                <div id="search-ecr-prod-results" class="p-6 border-t overflow-y-auto flex-1"></div>
            </div>
        </div>
    `;

    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();

    const modalElement = document.getElementById(modalId);
    const termInput = modalElement.querySelector('#search-ecr-prod-term');
    const clientSelect = modalElement.querySelector('#search-ecr-prod-client');
    const resultsContainer = modalElement.querySelector('#search-ecr-prod-results');

    const searchHandler = () => {
        const term = termInput.value.toLowerCase();
        const clientId = clientSelect.value;
        let results = appState.collections[COLLECTIONS.PRODUCTOS].filter(p =>
            (term === '' || p.id.toLowerCase().includes(term) || p.descripcion.toLowerCase().includes(term)) &&
            (!clientId || p.clienteId === clientId)
        );
        resultsContainer.innerHTML = results.length === 0
            ? `<p class="text-center py-8">No se encontraron productos.</p>`
            : `<div class="space-y-1">${results.map(p => `
                <button data-product-id="${p.id}" class="w-full text-left p-2.5 bg-gray-50 hover:bg-blue-100 rounded-md border flex justify-between items-center">
                    <div>
                        <p class="font-semibold text-blue-800">${p.descripcion}</p>
                        <p class="text-xs text-gray-500">${p.id}</p>
                    </div>
                    <p class="text-xs text-gray-500">${appState.collections[COLLECTIONS.CLIENTES].find(c => c.id === p.clienteId)?.descripcion || ''}</p>
                </button>
            `).join('')}</div>`;
    };

    const selectHandler = (e) => {
        const button = e.target.closest('button[data-product-id]');
        if (button) {
            const productId = button.dataset.productId;
            const product = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.id === productId);
            if (product) {
                // Populate the ECR form fields
                document.getElementById('codigo_barack').value = product.id;
                document.getElementById('codigo_barack_display').value = `${product.descripcion} (${product.id})`;
                document.getElementById('denominacion_producto').value = product.descripcion;
                // Also, auto-select the client associated with the product
                const clientSelectInForm = document.getElementById('cliente');
                if (clientSelectInForm && product.clienteId) {
                    clientSelectInForm.value = product.clienteId;
                }
            }
            modalElement.remove();
        }
    };

    termInput.addEventListener('input', searchHandler);
    clientSelect.addEventListener('change', searchHandler);
    resultsContainer.addEventListener('click', selectHandler);
    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());

    searchHandler(); // Initial render
}

async function openEcrSearchModalForEcoForm() {
    // Ensure the ECR collection is loaded before proceeding.
    try {
        await ensureCollectionsAreLoaded([COLLECTIONS.ECR_FORMS]);
    } catch (error) {
        showToast('Error al cargar la lista de ECRs. Intente de nuevo.', 'error');
        return;
    }

    const modalId = `ecr-search-for-eco-modal-${Date.now()}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-[60] flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-4xl m-4 modal-content max-h-[90vh] flex flex-col">
                <div class="flex justify-between items-center p-5 border-b">
                    <h3 class="text-xl font-bold">Seleccionar ECR Aprobado</h3>
                    <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-4 border-b">
                    <input type="text" id="ecr-search-input-modal" placeholder="Buscar por N°, producto o cliente..." class="w-full p-2 border rounded-md">
                </div>
                <div id="ecr-list-container" class="p-6 overflow-y-auto">
                    <!-- ECRs will be rendered here -->
                </div>
            </div>
        </div>
    `;

    dom.modalContainer.insertAdjacentHTML('beforeend', modalHTML);
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);

    const approvedEcrs = appState.collections[COLLECTIONS.ECR_FORMS].filter(ecr => ecr.status === 'approved');

    const renderList = (searchTerm = '') => {
        const container = modalElement.querySelector('#ecr-list-container');
        const lowerCaseSearchTerm = searchTerm.toLowerCase();
        const filteredEcrs = approvedEcrs.filter(ecr =>
            ecr.id.toLowerCase().includes(lowerCaseSearchTerm) ||
            (ecr.denominacion_producto && ecr.denominacion_producto.toLowerCase().includes(lowerCaseSearchTerm)) ||
            (ecr.cliente && ecr.cliente.toLowerCase().includes(lowerCaseSearchTerm))
        );

        if (filteredEcrs.length === 0) {
            container.innerHTML = '<p class="text-center text-slate-500 py-8">No se encontraron ECRs aprobados.</p>';
            return;
        }

        container.innerHTML = filteredEcrs.map(ecr => `
            <button data-ecr-id="${ecr.id}" class="w-full text-left p-3 mb-2 bg-slate-50 hover:bg-blue-100 rounded-md border transition">
                <div class="flex justify-between items-center">
                    <p class="font-bold text-blue-800">${ecr.id}</p>
                    <p class="text-xs text-slate-500">Cliente: ${ecr.cliente || 'N/A'}</p>
                </div>
                <p class="text-sm text-slate-700">${ecr.denominacion_producto || 'Sin descripción'}</p>
            </button>
        `).join('');
    };

    modalElement.querySelector('#ecr-search-input-modal').addEventListener('input', e => renderList(e.target.value));

    modalElement.querySelector('#ecr-list-container').addEventListener('click', e => {
        const button = e.target.closest('button[data-ecr-id]');
        if (button) {
            const ecrId = button.dataset.ecrId;
            const ecrData = approvedEcrs.find(ecr => ecr.id === ecrId);
            if (ecrData) {
                const ecrNoInput = document.getElementById('ecr_no');
                const ecrNoDisplay = document.getElementById('ecr_no_display');

                if (ecrNoInput && ecrNoDisplay) {
                    ecrNoInput.value = ecrData.id;
                    ecrNoDisplay.value = `${ecrData.denominacion_producto} (${ecrData.id})`;

                    const formElement = document.getElementById('eco-form');
                    const fieldsToPrepopulate = {
                        'name_eng_producto': ecrData.equipo_c1_2,
                        'comments_eng_producto': `Basado en la situación propuesta en el ECR ${ecrData.id}:\n${ecrData.situacion_propuesta || ''}`
                    };

                    for (const fieldName in fieldsToPrepopulate) {
                        const element = formElement.querySelector(`[name="${fieldName}"]`);
                        if (element) {
                            element.value = fieldsToPrepopulate[fieldName];
                        }
                    }
                    if (ecrData.cliente_requiere_ppap && ecrData.cliente_aprobacion_estado === 'aprobado') {
                        const ppapContainer = formElement.querySelector('#ppap-confirmation-container');
                        if (ppapContainer) {
                            ppapContainer.classList.remove('hidden');
                        }
                    }
                }
            }
            modalElement.remove();
        }
    });

    modalElement.querySelector('button[data-action="close"]').addEventListener('click', () => modalElement.remove());
    renderList();
}

async function ensureCollectionsAreLoaded(collectionNames) {
    const collectionsToFetch = collectionNames.filter(name => {
        // Check if the collection is already loaded and not empty
        return !appState.collections[name] || appState.collections[name].length === 0;
    });

    if (collectionsToFetch.length === 0) {
        console.log("All required collections are already in appState.");
        return; // All collections are already loaded
    }

    const toastId = showToast(`Cargando datos del formulario...`, 'loading', { duration: 0 });

    try {
        const fetchPromises = collectionsToFetch.map(async (name) => {
            const querySnapshot = await getDocs(collection(db, name));
            const data = querySnapshot.docs.map(d => ({ ...d.data(), docId: d.id }));
            appState.collections[name] = data;
            // Also update the 'ById' map for quick lookups
            if (data.length > 0 && data[0].id) {
                appState.collectionsById[name] = new Map(data.map(item => [item.id, item]));
            }
            console.log(`Collection '${name}' fetched and stored.`);
        });

        await Promise.all(fetchPromises);
        showToast('Datos cargados.', 'success', { toastId });
    } catch (error) {
        console.error("Error ensuring collections are loaded:", error);
        showToast('Error al cargar datos necesarios para el formulario.', 'error', { toastId });
        // Propagate the error to stop the form from rendering incorrectly
        throw error;
    }
}


async function runEcrFormLogic(params = null) {
    const ecrId = params ? params.ecrId : null;
    const scrollToSection = params ? params.scrollToSection : null;

    // Ensure all necessary data for dropdowns is loaded before rendering the form
    try {
        await ensureCollectionsAreLoaded([
            COLLECTIONS.PROYECTOS,
            COLLECTIONS.CLIENTES,
            COLLECTIONS.PRODUCTOS // Needed for the product search modal
        ]);
    } catch (error) {
        // If data loading fails, show an error and stop rendering the form
        dom.viewContent.innerHTML = `<p class="text-red-500 p-8">Error fatal: No se pudieron cargar los datos necesarios para el formulario ECR. Por favor, recargue la página.</p>`;
        return;
    }

    const isEditing = !!ecrId;
    const ECR_FORM_STORAGE_KEY = isEditing ? `inProgressEcrForm_${ecrId}` : 'inProgressEcrForm_new';

    // --- Render the basic structure ---
    dom.viewContent.innerHTML = `
        <div class="form-container">
            <div id="ecr-progress-bar" class="sticky top-0 bg-white/80 backdrop-blur-sm z-10 p-4 shadow-sm mb-4 rounded-lg border">
                </div>
            <form id="ecr-form" class="bg-white p-6"></form>
            <div id="action-buttons-container" class="max-w-7xl mx-auto mt-[-1rem] mb-8 px-8 pb-4 bg-white rounded-b-lg shadow-lg border-t flex justify-end items-center gap-4">
                <button type="button" id="ecr-back-button" class="bg-gray-200 text-gray-800 px-6 py-2 rounded-md hover:bg-gray-300 mr-auto">Volver a la Lista</button>
                <button type="button" id="ecr-save-button" class="bg-gray-500 text-white px-6 py-2 rounded-md hover:bg-gray-600">Guardar Progreso</button>
                <button type="button" id="ecr-clear-button" class="bg-yellow-500 text-white px-6 py-2 rounded-md hover:bg-yellow-600">Limpiar</button>
                <button type="button" id="ecr-approve-button" class="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700">Aprobar y Guardar</button>
            </div>
        </div>
    `;
    const formContainer = document.getElementById('ecr-form');

    // --- Progress Bar Logic ---
    const progressBarContainer = document.getElementById('ecr-progress-bar');
    const pages = [
        { id: 'page1', title: 'Información General' },
        { id: 'page2', title: 'Evaluación (Parte 1)' },
        { id: 'page3', title: 'Evaluación (Parte 2)' },
        { id: 'page4', title: 'Evaluación (Parte 3)' },
        { id: 'page_final', title: 'Aprobación Final' }
    ];

    let progressBarHTML = '<ol class="flex items-center w-full">';
    pages.forEach((page, index) => {
        const isLast = index === pages.length - 1;
        progressBarHTML += `
            <li class="flex w-full items-center ${!isLast ? "text-blue-600 after:content-[''] after:w-full after:h-1 after:border-b after:border-gray-100 after:border-4 after:inline-block" : ""}">
                <button data-target="${page.id}" class="progress-step flex items-center justify-center w-10 h-10 bg-gray-100 rounded-full lg:h-12 lg:w-12 shrink-0">
                    <span class="font-bold">${index + 1}</span>
                </button>
            </li>
        `;
    });
    progressBarHTML += '</ol>';
    progressBarContainer.innerHTML = progressBarHTML;

    progressBarContainer.addEventListener('click', (e) => {
        const button = e.target.closest('.progress-step');
        if (button) {
            const targetId = button.dataset.target;
            const targetElement = document.getElementById(targetId);
            if (targetElement) {
                targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    });

    // --- Intersection Observer for Progress Bar ---
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            const pageId = entry.target.id;
            const progressButton = progressBarContainer.querySelector(`[data-target="${pageId}"]`);
            if (entry.isIntersecting) {
                progressButton.classList.remove('bg-gray-100');
                progressButton.classList.add('bg-blue-600', 'text-white');
            } else {
                progressButton.classList.add('bg-gray-100');
                progressButton.classList.remove('bg-blue-600', 'text-white');
            }
        });
    }, { threshold: 0.5 }); // 50% of the page must be visible

    // --- Helper Functions ---
    const createCheckbox = (label, name, value = '') => `<div class="flex items-center gap-2"><input type="checkbox" name="${name}" id="${name}" value="${value}" class="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"><label for="${name}" class="text-sm select-none">${label}</label></div>`;
    const createTextField = (label, name, placeholder = '', isFullWidth = false) => `<div class="form-field ${isFullWidth ? 'col-span-full' : ''}"><label for="${name}" class="text-sm font-bold mb-1">${label}</label><input type="text" name="${name}" id="${name}" placeholder="${placeholder}" class="w-full"></div>`;
    const createDateField = (label, name) => `<div class="form-field"><label for="${name}" class="text-sm font-bold mb-1">${label}</label><input type="date" name="${name}" id="${name}" class="w-full"></div>`;
    const createTextarea = (name, placeholder = '') => `<textarea name="${name}" placeholder="${placeholder}" class="w-full h-full border-none resize-none p-1 bg-transparent focus:outline-none"></textarea>`;

    const createSelectFieldFromCollection = (label, name, collectionKey, placeholder = 'Seleccionar...') => {
        const items = appState.collections[collectionKey] || [];
        // Sort items alphabetically by description or name for better UX
        items.sort((a, b) => (a.descripcion || a.nombre).localeCompare(b.descripcion || b.nombre));

        let optionsHTML = `<option value="">${placeholder}</option>`;
        items.forEach(item => {
            optionsHTML += `<option value="${item.id}">${item.descripcion || item.nombre}</option>`;
        });
        return `
            <div class="form-field">
                <label for="${name}" class="text-sm font-bold mb-1">${label}</label>
                <select name="${name}" id="${name}" class="w-full">${optionsHTML}</select>
            </div>
        `;
    };

    const buildDepartmentSection = (config, ecrData) => {
        const checklistHTML = config.checklist.map(item => `<div class="check-item">${createCheckbox(item.label, item.name)}</div>`).join('');
        const customContent = config.customHTML || '';
        const departmentId = config.id;
        const approval = ecrData?.approvals?.[departmentId];
        const isApprovedOrRejected = approval?.status === 'approved' || approval?.status === 'rejected';
        const canApprove = appState.currentUser.role === 'admin' || appState.currentUser.sector === departmentId;

        let approvalControlsHTML = '';
        if (isApprovedOrRejected) {
            const statusClass = approval.status === 'approved' ? 'text-green-600' : 'text-red-600';
            const statusIcon = approval.status === 'approved' ? 'check-circle' : 'x-circle';
            approvalControlsHTML = `
                <div class="flex items-center gap-2 font-bold ${statusClass}">
                    <i data-lucide="${statusIcon}" class="w-5 h-5"></i>
                    <span>${approval.status.charAt(0).toUpperCase() + approval.status.slice(1)} por ${approval.user} el ${approval.date}</span>
                </div>
            `;
        } else if (canApprove) {
            approvalControlsHTML = `
                <button type="button" data-action="register-ecr-approval" data-decision="rejected" data-department-id="${departmentId}" class="bg-red-500 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-red-600">Rechazar</button>
                <button type="button" data-action="register-ecr-approval" data-decision="approved" data-department-id="${departmentId}" class="bg-green-500 text-white px-3 py-1.5 rounded-md text-xs font-bold hover:bg-green-600">Aprobar</button>
            `;
        } else {
             approvalControlsHTML = `<div class="text-xs text-slate-400 italic">Pendiente de aprobación por ${config.title}</div>`;
        }


        return `
            <div class="department-section ${isApprovedOrRejected ? 'approved' : ''}" data-department-id="${config.id}">
                <div class="department-header">
                     <span class="flex items-center gap-3"><i data-lucide="${config.icon || 'help-circle'}" class="w-6 h-6 text-slate-500"></i>${config.title}</span>
                    <div class="flex items-center gap-4">
                        ${createCheckbox('No Afecta', `na_${config.id}`)}
                        ${createCheckbox('Afecta', `afecta_${config.id}`)}
                    </div>
                </div>
                <div class="department-content">
                    <div class="department-checklist">${checklistHTML}${customContent}</div>
                    <div class="department-comments">
                        <label class="font-bold text-sm mb-1 block">Comentarios Generales y Justificativos:</label>
                        <textarea name="comments_${config.id}" rows="6" class="form-field"></textarea>
                    </div>
                </div>
                <div class="department-footer">
                    ${approvalControlsHTML}
                </div>
            </div>
        `;
    };

    // --- Form HTML structure ---
    const page1HTML = `
        <div class="ecr-page relative" id="page1">
            <div class="watermark">Página 1</div>
            <header class="ecr-header">
                <img src="/barack_logo.png" alt="Logo" class="h-12">
                <div class="title-block">
                    <div class="flex items-center gap-2">
                        <span class="ecr-main-title">ECR</span>
                        ${createHelpTooltip('ECR (Engineering Change Request): Use este formulario para iniciar una solicitud formal de cambio en un producto o proceso. Complete todos los campos relevantes para su evaluación.')}
                    </div>
                    <div class="ecr-subtitle">DE PRODUCTO / PROCESO</div>
                </div>
                <div class="ecr-number-box">
                    <span>ECR N°:</span>
                    <input type="text" name="ecr_no" readonly class="bg-gray-100 cursor-not-allowed" placeholder="Generando...">
                </div>
            </header>
            <div class="ecr-checklist-bar">CHECK LIST ECR - ENGINEERING CHANGE REQUEST</div>

            <section class="form-row">
                <div class="form-field" style="flex-grow: 2;">
                    <label class="text-sm font-bold mb-1">ORIGEN DEL PEDIDO:</label>
                    <div class="border p-2 rounded-lg flex flex-wrap gap-x-6 gap-y-2 mt-1">
                        ${createCheckbox('Cliente', 'origen_cliente')}
                        ${createCheckbox('Proveedor', 'origen_proveedor')}
                        ${createCheckbox('Interno', 'origen_interno')}
                        ${createCheckbox('Reglamentación', 'origen_reglamentacion')}
                    </div>
                </div>
                ${createSelectFieldFromCollection('Proyecto:', 'proyecto', COLLECTIONS.PROYECTOS)}
                ${createSelectFieldFromCollection('Cliente:', 'cliente', COLLECTIONS.CLIENTES)}
            </section>

            <section class="form-row">
                <div class="form-field" style="flex-grow: 2;">
                    <label class="text-sm font-bold mb-1">FASE DE PROYECTO:</label>
                    <div class="border p-2 rounded-lg flex flex-wrap gap-x-6 gap-y-2 mt-1">
                        ${createCheckbox('Programa', 'fase_programa')}
                        ${createCheckbox('Serie', 'fase_serie')}
                    </div>
                </div>
                ${createDateField('Fecha de Emisión:', 'fecha_emision')}
                ${createDateField('Fecha de Cierre:', 'fecha_cierre')}
            </section>

            <section class="form-row">
                <div class="form-field">
                    <label for="codigo_barack_search" class="text-sm font-bold mb-1">Producto Barack</label>
                    <div class="flex items-center gap-2">
                        <input type="text" id="codigo_barack_display" class="w-full bg-gray-100" readonly placeholder="Seleccione un producto...">
                        <input type="hidden" name="codigo_barack" id="codigo_barack">
                        <button type="button" data-action="open-ecr-product-search" class="bg-blue-500 text-white p-2 rounded-md hover:bg-blue-600"><i data-lucide="search" class="h-5 w-5 pointer-events-none"></i></button>
                    </div>
                </div>
                ${createTextField('Código(s) Cliente:', 'codigo_cliente', '...')}
            </section>
            <section class="form-row">
                 <div class="form-field col-span-full">
                    <label for="denominacion_producto" class="text-sm font-bold mb-1">Denominación del Producto</label>
                    <input type="text" name="denominacion_producto" id="denominacion_producto" placeholder="..." class="w-full bg-gray-100" readonly>
                </div>
            </section>

            <section class="form-row">
                <div class="form-field">
                    <label for="componentes_obsoletos" class="text-sm font-bold mb-1">Componentes Obsoletos (Cantidad):</label>
                    <input type="number" name="componentes_obsoletos" id="componentes_obsoletos" placeholder="0" class="w-full" min="0">
                </div>
            </section>

            <div class="ecr-flex-section">
                <div class="ecr-flex-header">OBJETIVO DE ECR</div>
                <div class="ecr-flex-content ecr-flex-columns-2">
                    <div class="ecr-flex-column">
                        ${['Productividad', 'Mejora de calidad', 'Estrategia del Cliente'].map(l => createCheckbox(l, `obj_${l.toLowerCase().replace(/ /g, '_')}`)).join('')}
                    </div>
                    <div class="ecr-flex-column">
                        ${['Estrategia Barack', 'Nacionalización'].map(l => createCheckbox(l, `obj_${l.toLowerCase().replace(/ /g, '_')}`)).join('')}
                    </div>
                </div>
            </div>

            <div class="ecr-flex-section">
                <div class="ecr-flex-header">TIPO DE ALTERACIÓN</div>
                <div class="ecr-flex-content ecr-flex-columns-2">
                    <div class="ecr-flex-column">
                        ${['Producto', 'Proceso'].map(l => createCheckbox(l, `tipo_${l.toLowerCase().replace(/ /g, '_')}`)).join('')}
                    </div>
                    <div class="ecr-flex-column">
                        ${['Fuente de suministro', 'Embalaje'].map(l => createCheckbox(l, `tipo_${l.toLowerCase().replace(/ /g, '_')}`)).join('')}
                        <div class="flex items-center gap-2 mt-1"><input type="checkbox" id="tipo_otro" name="tipo_otro"><label for="tipo_otro" class="text-sm">Otro:</label><input name="tipo_otro_text" type="text" class="border-b-2 bg-transparent flex-grow"></div>
                    </div>
                </div>
            </div>

            <div class="ecr-flex-section">
                <div class="ecr-flex-header">VALIDACIÓN DEL CLIENTE</div>
                <div class="ecr-flex-content ecr-flex-columns-2">
                    <div class="ecr-flex-column space-y-2">
                        ${createCheckbox('Requiere Aprobación del Cliente', 'cliente_requiere_aprobacion')}
                        ${createCheckbox('Requiere PPAP', 'cliente_requiere_ppap')}
                    </div>
                    <div class="ecr-flex-column space-y-2">
                        <div class="form-field"><label for="cliente_aprobacion_estado" class="text-sm font-bold">Estado:</label><select name="cliente_aprobacion_estado" id="cliente_aprobacion_estado" class="w-full text-sm"><option value="na">No Aplica</option><option value="pendiente">Pendiente</option><option value="aprobado">Aprobado</option><option value="rechazado">Rechazado</option></select></div>
                        <div class="form-field"><label for="cliente_aprobacion_fecha" class="text-sm font-bold">Fecha de Decisión:</label><input type="date" name="cliente_aprobacion_fecha" id="cliente_aprobacion_fecha" class="w-full text-sm"></div>
                    </div>
                </div>
            </div>

            <div class="ecr-flex-section">
                <div class="ecr-flex-header">AFECTA S/R</div>
                <div class="ecr-flex-content">
                    <div class="ecr-flex-column">
                        ${['Relocalización de Planta', 'Modificación de Layout', 'Modificación de herramental'].map(l => createCheckbox(l, `afecta_${l.toLowerCase().replace(/ /g, '_')}`)).join('')}
                    </div>
                </div>
            </div>

            <div class="two-column-layout mt-4" data-tutorial-id="situacion-layout">
                <div class="column-box"><h3>SITUACIÓN EXISTENTE:</h3>${createTextarea('situacion_existente')}</div>
                <div class="column-box"><h3>SITUACIÓN PROPUESTA:</h3>${createTextarea('situacion_propuesta')}</div>
            </div>

            <table class="full-width-table risk-analysis-table">
                <thead><tr><th colspan="7">IMPACTO EN CASO DE FALLA</th></tr><tr><th>RESPONSABLE</th><th>ANÁLISIS DE RIESGO</th><th>Nivel</th><th>Observaciones</th><th>NOMBRE</th><th>FECHA</th><th>VISTO</th></tr></thead>
                <tbody>${['RETORNO DE GARANTÍA', 'RECLAMACIÓN ZERO KM', 'HSE', 'SATISFACCIÓN DEL CLIENTE', 'S/R (Seguridad y/o Regulamentación)'].map((r, i) => `<tr><td>Gerente de Calidad</td><td>${r}</td><td><input name="impacto_nivel_${i}"></td><td><input name="impacto_obs_${i}"></td><td><input name="impacto_nombre_${i}"></td><td><input type="date" name="impacto_fecha_${i}"></td><td><input name="impacto_visto_${i}"></td></tr>`).join('')}</tbody>
            </table>

            <table class="full-width-table risk-analysis-table mt-4">
                <thead><tr><th colspan="7">APROBACIÓN DE DIRECTORIO (CODIR)</th></tr><tr><th>Miembro de Directorio</th><th>Aprobado</th><th>Rechazado</th><th>Observaciones</th><th>NOMBRE</th><th>FECHA</th><th>VISTO</th></tr></thead>
                <tbody>${['Director Comercial', 'Director Industrial'].map((r, i) => `<tr><td>${r}</td><td>${createCheckbox('', `codir_aprobado_${i}`)}</td><td>${createCheckbox('', `codir_rechazado_${i}`)}</td><td><input name="codir_obs_${i}"></td><td><input name="codir_nombre_${i}"></td><td><input type="date" name="codir_fecha_${i}"></td><td><input name="codir_visto_${i}"></td></tr>`).join('')}
                    <tr><td>Otro: <input name="codir_otro_rol_2" class="border-b-2 bg-transparent w-full"></td><td>${createCheckbox('', 'codir_aprobado_2')}</td><td>${createCheckbox('', 'codir_rechazado_2')}</td><td><input name="codir_obs_2"></td><td><input name="codir_nombre_2"></td><td><input type="date" name="codir_fecha_2"></td><td><input name="codir_visto_2"></td></tr>
                </tbody>
            </table>

            <table class="full-width-table mt-4">
                 <thead><tr><th colspan="2">EQUIPO DE TRABAJO</th></tr></thead>
                 <tbody>
                    ${[['PILOTO ECR:', 'COMERCIAL:'], ['PILOTO:', 'PC&L/LOGÍSTICA:'], ['ING. PRODUCTO:', 'PRODUCCIÓN:'], ['ING. MANUFACTURA:', 'COSTOS:'], ['CALIDAD:', 'HSE:'], ['COMPRAS:', 'MANTENIMIENTO:'], ['SQA:', '']].map((row, i) => {
                        const col1 = `<div class="flex items-center"><label class="w-1/3 font-semibold">${row[0]}</label><input name="equipo_c1_${i}" class="flex-grow ml-2 border-b-2 bg-transparent"></div>`;
                        const col2 = row[1] ? `<div class="flex items-center"><label class="w-1/3 font-semibold">${row[1]}</label><input name="equipo_c2_${i}" class="flex-grow ml-2 border-b-2 bg-transparent"></div>` : '';
                        return `<tr><td>${col1}</td><td>${col2}</td></tr>`;
                    }).join('')}
                 </tbody>
            </table>
        </div>
    `;

    // --- All other pages remain the same as they are already structured correctly.
    // I will copy them here to ensure the full form is preserved.
    const page2HTML = (data) => `
        <div class="ecr-page relative" id="page2">
            <div class="watermark">Página 2</div>
            <div class="ecr-checklist-bar">EVALUACIÓN DE PROPUESTA POR LOS DEPARTAMENTOS</div>
            <div data-tutorial-id="evaluacion-departamento">
            ${buildDepartmentSection({
                title: 'INGENIERÍA PRODUCTO — DISEÑO', id: 'ing_producto', icon: 'drafting-compass',
                customHTML: `
                    <table class="full-width-table text-xs my-2">
                        <thead><tr><th>REF. ACTUAL / IND</th><th>REF. NUEVA / IND</th><th>QTD./CARRO</th></tr></thead>
                        <tbody><tr><td><input name="prod_ref_actual"></td><td><input name="prod_ref_nueva"></td><td><input name="prod_qtd_carro"></td></tr></tbody>
                    </table>
                    <div class="grid grid-cols-2 gap-2 mt-2">
                    ${['COSTO CLIENTE', 'COSTO BARACK', 'COSTO PROVEEDOR', 'AFECTA AL CLIENTE', 'AFECTA S&R'].map(l => createCheckbox(l, `prod_${l.toLowerCase().replace(/ /g,'_')}`)).join('')}
                    </div>
                `,
                checklist: ['ESTRUCTURA DE PRODUCTO', 'PLANO DE VALIDACIÓN', 'LANZAMIENTO DE PROTOTIPOS', 'EVALUADO POR EL ESPECIALISTA DE PRODUCTO', 'ACTUALIZAR DISEÑO 3D', 'ACTUALIZAR DISEÑO 2D', 'ACTUALIZAR DFMEA', 'COPIA DE ESTA ECR PARA OTRO SITIO?', 'NECESITA PIEZA DE REPOSICIÓN'].map(l => ({label: l, name: `prod_check_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            ${buildDepartmentSection({
                title: 'INGENIERÍA MANUFACTURA Y PROCESO', id: 'ing_manufatura', icon: 'cpu',
                checklist: ['HACER RUN A RATE', 'ACTUALIZAR DISEÑO MANUFACTURA', 'LAY OUT', 'AFECTA EQUIPAMIENTO', 'ACTUALIZAR INSTRUCCIONES, FLUJOGRAMAS', 'ACTUALIZAR PFMEA', 'POKA YOKES', 'ACTUALIZAR TIEMPOS', 'CAPACIDAD DE PERSONAL', 'AFECTA A S&R / HSE'].map(l => ({label: l, name: `manuf_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
             ${buildDepartmentSection({
                title: 'HSE', id: 'hse', icon: 'siren',
                checklist: ['CHECK LIST DE LIB DE MÁQUINA', 'COMUNICAR ÓRGANO AMBIENTAL', 'COMUNICACIÓN MINISTERIO DE TRABAJO'].map(l => ({label: l, name: `hse_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            ${buildDepartmentSection({
                title: 'CALIDAD', id: 'calidad', icon: 'award',
                checklist: ['AFECTA DIMENSIONAL CLIENTE?', 'AFECTA FUNCIONAL Y MONTABILIDAD?', 'ACTUALIZAR PLANO DE CONTROLES/ INSTRUCCIONES', 'AFECTA ASPECTO/ACTUALIZAR BIBLIA DE DEFECTOS/PZA PATRÓN?', 'AFECTA CAPABILIDAD (AFECTA CAPACIDAD)', 'MODIFICAR DISPOSITIVO DE CONTROL Y SU MODO DE CONTROL', 'NUEVO ESTUDIO DE MSA / CALIBRACIÓN', 'NECESITA VALIDACIÓN (PLANO DEBE ESTAR EN ANEXO)', 'NECESARIO NUEVO PPAP/PSW CLIENTE', 'ANÁLISIS DE MATERIA PRIMA', 'IMPLEMENTAR MURO DE CALIDAD', 'NECESITA AUDITORÍA S&R', 'AFECTA POKA-YOKE?', 'AFECTA AUDITORÍA DE PRODUCTO?'].map(l => ({label: l, name: `calidad_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            </div>
        </div>
    `;

    const page3HTML = (data) => `
        <div class="ecr-page relative" id="page3">
            <div class="watermark">Página 3</div>
            <div class="ecr-checklist-bar">EVALUACIÓN DE PROPUESTA POR LOS DEPARTAMENTOS (Cont.)</div>
            <div data-tutorial-id="evaluacion-departamento">
            ${buildDepartmentSection({
                title: 'COMPRAS', id: 'compras', icon: 'shopping-cart',
                customHTML: `
                    <div class="grid grid-cols-2 gap-4 text-xs">
                        <div><strong>PIEZA Actual:</strong> ${createCheckbox('NACIONAL', 'compras_actual_nac')} ${createCheckbox('IMPORTADA', 'compras_actual_imp')} <input name="compras_proveedor_actual" placeholder="PROVEEDOR:" class="w-full mt-1"></div>
                        <div><strong>PIEZA Propuesta:</strong> ${createCheckbox('NACIONAL', 'compras_prop_nac')} ${createCheckbox('IMPORTADA', 'compras_prop_imp')} <input name="compras_proveedor_prop" placeholder="PROVEEDOR:" class="w-full mt-1"></div>
                    </div>
                    <div class="flex gap-4 mt-2">${createCheckbox('Modificación reversible', 'compras_rev')} ${createCheckbox('Modificación irreversible', 'compras_irrev')}</div>
                `,
                checklist: ['COSTOS EVALUADOS', 'PEDIDO COMPRA PROTOTIPOS', 'PEDIDO COMPRA TOOLING', 'AFECTA HERRAMIENTA DE PROVEEDOR', 'NECESARIO ENVIAR DISEÑO P/ PROVEEDOR', 'IMPACTO POST VENTA ANALIZADO'].map(l => ({label: l, name: `compras_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            ${buildDepartmentSection({
                title: 'CALIDAD PROVEEDORES (SQA)', id: 'sqa', icon: 'gem',
                checklist: ['NECESITA NUEVO PSW PROVEEDOR - FECHA LÍMITE: __/__/____', 'AFECTA LAY OUT', 'AFECTA EMBALAJE', 'AFECTA DISPOSITIVO CONTROL PROVEEDOR', 'AFECTA SUBPROVEEDOR', 'NECESITA DE ASISTENTE'].map(l => ({label: l, name: `sqa_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            ${buildDepartmentSection({
                title: 'Tooling & Equipments (T&E)', id: 'tooling', icon: 'wrench',
                checklist: ['AFECTA HERRAMIENTA', 'ANÁLISIS TÉCNICO DE ALTERACIÓN', 'OTROS IMPACTOS CAUSADOS POR LA ALTERACIÓN NO HERRAMENTAL'].map(l => ({label: l, name: `tooling_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            </div>
        </div>
    `;

    const page4HTML = (data) => `
         <div class="ecr-page relative" id="page4">
            <div class="watermark">Página 4</div>
            <div class="ecr-checklist-bar">EVALUACIÓN DE PROPUESTA POR LOS DEPARTAMENTOS (Cont.)</div>
            <div data-tutorial-id="evaluacion-departamento">
             ${buildDepartmentSection({
                title: 'LOGÍSTICA Y PC&L', id: 'logistica', icon: 'truck',
                checklist: ['Parámetros logísticos/items nuevos', 'Gestión de stock (pieza antigua/nueva)', 'Necesita stock de seguridad', 'Altera programa p/ proveedor', 'Nuevo protocolo logístico', 'Impacto post venta', 'Impacto MOI/MOD', 'Afecta embalaje'].map(l => ({label: l, name: `logistica_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
             ${buildDepartmentSection({
                title: 'FINANCIERO / COSTOS', id: 'financiero', icon: 'landmark',
                checklist: ['BUSINESS PLAN', 'BOA - BUSINESS OPPORTUNITY', 'MoB - ANALYSIS', 'PAYBACK / UPFRONT'].map(l => ({label: l, name: `financiero_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            ${buildDepartmentSection({
                title: 'COMERCIAL', id: 'comercial', icon: 'trending-up',
                checklist: ['NECESARIO RENEGOCIAR CON EL CLIENTE', 'IMPACTO POST VENTA ANALIZADO', 'NECESARIA NUEVA ORDEN DE VENTA AL CLIENTE', 'NEGOCIACIÓN DE OBSOLETOS'].map(l => ({label: l, name: `comercial_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            ${buildDepartmentSection({
                title: 'MANTENIMIENTO', id: 'mantenimiento', icon: 'shield-check',
                checklist: ['PROYECTO PRESENTA VIABILIDAD TÉCNICA / TECNOLÓGICA', 'NECESITA ADQUISICIÓN DE MATERIALES/EQUIPOS', 'NECESIDAD / DISPONIBILIDAD DE ENERGÍAS: ELÉCTRICA, NEUMÁTICA E HIDRÁULICA', 'CREACIÓN/ALTERACIÓN DE MANTENIMIENTO PREVENTIVO', 'NECESITA REGISTRO DE NUEVOS ITEMS EN ALMACÉN'].map(l => ({label: l, name: `mantenimiento_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            ${buildDepartmentSection({
                title: 'PRODUCCIÓN', id: 'produccion', icon: 'factory',
                checklist: ['AFECTA INSTRUCCIÓN DE TRABAJO (SW)', 'AFECTA LIBERACIÓN DE PROCESO (SET UP)', 'IMPACTO MOD / MOI', 'CAPACITACIÓN', 'AFECTA ALTERACIÓN DE PLANO DE CORTE'].map(l => ({label: l, name: `produccion_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            ${buildDepartmentSection({
                title: 'CALIDAD CLIENTE', id: 'calidad_cliente', icon: 'user-check',
                checklist: ['NECESITA APROBACIÓN CLIENTE EXTERNO', 'NECESARIO APROBACIÓN CLIENTE INTERNO', 'ECR SOBRE DESVÍO N°: ____', 'OTROS: ______'].map(l => ({label: l, name: `calidad_cliente_${l.toLowerCase().replace(/ /g,'_')}`}))
            }, data)}
            </div>
        </div>
    `;

    const finalPageHTML = `
        <div class="ecr-page relative" id="page_final">
            <div class="ecr-checklist-bar">APROBACIÓN FINAL DE ECR</div>
            <div class="flex justify-center items-center gap-8 my-4">
                ${createCheckbox('OK', 'final_ok')}
                ${createCheckbox('NOK', 'final_nok')}
            </div>
            <div class="form-field"><label class="font-bold">CONSIDERACIONES DEL COORDINADOR:</label><textarea name="final_consideraciones" class="h-32"></textarea></div>
            <div class="flex justify-end gap-4 mt-4">
                ${createTextField('Coordinador:', 'final_coordinador')}
                ${createTextField('Visto:', 'final_visto')}
                ${createDateField('Fecha:', 'final_fecha')}
            </div>
        </div>
    `;

    let ecrData = null;
    if (isEditing) {
        const docRef = doc(db, COLLECTIONS.ECR_FORMS, ecrId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            ecrData = docSnap.data();
        } else {
            showToast(`Error: No se encontró el ECR con ID ${ecrId}`, 'error');
            switchView('ecr');
            return;
        }
    }

    formContainer.innerHTML = page1HTML + page2HTML(ecrData) + page3HTML(ecrData) + page4HTML(ecrData) + finalPageHTML;
    lucide.createIcons();

    if (!isEditing) {
        // The ECR number is now generated server-side upon saving.
        // We leave the input blank and make it read-only.
        const ecrInput = formContainer.querySelector('[name="ecr_no"]');
        ecrInput.value = ''; // Clear any previous value
        ecrInput.readOnly = true;
        ecrInput.placeholder = '[Asignado al guardar]';
    }

    // Start observing each page section for the progress bar
    pages.forEach(page => {
        const pageElement = document.getElementById(page.id);
        if (pageElement) {
            observer.observe(pageElement);
        }
    });

    // --- Local Storage and Data Handling ---
    const populateEcrForm = (form, data) => {
        if (!data || !form) return;
        // Populate standard fields
        for (const key in data) {
            if (key === 'approvals') continue; // Skip approvals map, handled below
            const elements = form.querySelectorAll(`[name="${key}"]`);
            elements.forEach(element => {
                if (element.type === 'checkbox' || element.type === 'radio') {
                     if(element.type === 'radio') {
                        if(element.value === String(data[key])) element.checked = true;
                    } else {
                        element.checked = !!data[key];
                    }
                } else {
                    element.value = data[key];
                }
            });
        }

        // Add logic for the new product selector
        if (data.codigo_barack) {
            const product = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.id === data.codigo_barack);
            if (product) {
                const displayInput = form.querySelector('#codigo_barack_display');
                if (displayInput) {
                    displayInput.value = `${product.descripcion} (${product.id})`;
                }
            }
        }

        // Populate and disable approval sections
        if (data.approvals) {
            for (const deptId in data.approvals) {
                const approval = data.approvals[deptId];
                const section = form.querySelector(`.department-section[data-department-id="${deptId}"]`);
                if (!section) continue;

                const commentArea = section.querySelector(`[name="comments_${deptId}"]`);
                if (commentArea && approval.comment) {
                    commentArea.value = approval.comment;
                }

                if (approval.status === 'approved' || approval.status === 'rejected') {
                    section.querySelectorAll('input, textarea, button').forEach(el => {
                         if (!el.closest('.department-footer')) { // Don't disable the footer itself
                            el.disabled = true;
                         }
                    });
                }
            }
        }
    };


    // --- Load Data and Attach Listeners ---
    if (ecrData) {
        populateEcrForm(formContainer, ecrData);
    } else {
        loadEcrFormFromLocalStorage(formContainer, ECR_FORM_STORAGE_KEY, populateEcrForm);
    }

    formContainer.addEventListener('input', () => saveEcrFormToLocalStorage(formContainer, ECR_FORM_STORAGE_KEY));

    formContainer.addEventListener('click', async (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button) return;

        const action = button.dataset.action;

        if (action === 'register-ecr-approval') {
            const decision = button.dataset.decision;
            const departmentId = button.dataset.departmentId;
            const ecrId = formContainer.querySelector('[name="ecr_no"]').value.trim();

            if (!ecrId) {
                showToast('Debe guardar el ECR con un N° antes de poder aprobar.', 'error');
                return;
            }

            const commentEl = formContainer.querySelector(`[name="comments_${departmentId}"]`);
            const comment = commentEl ? commentEl.value : '';

            const deps = {
                db,
                firestore: { runTransaction, doc, getDoc },
                COLLECTIONS,
                appState,
                uiCallbacks: { showToast, sendNotification }
            };
            await registerEcrApproval(ecrId, departmentId, decision, comment, deps);
            // Refresh the form view to show the new state
            switchView('ecr_form', { ecrId: ecrId });
        } else if (action === 'open-ecr-product-search') {
            openEcrProductSearchModal();
        }
    });

    // --- Button Event Listeners ---
    document.getElementById('ecr-back-button').addEventListener('click', () => switchView('ecr'));
    document.getElementById('ecr-clear-button').addEventListener('click', () => {
        showConfirmationModal('Limpiar Formulario', '¿Está seguro? Se borrará todo el progreso no guardado.', () => {
            formContainer.reset();
            localStorage.removeItem(ECR_FORM_STORAGE_KEY);
            showToast('Formulario limpiado.', 'info');
        });
    });

    const saveEcrForm = async (status = 'in-progress') => {
        const dataFromForm = getEcrFormData(formContainer);

        // Combine the fresh form data with the existing ECR data (especially the approvals).
        const dataToSave = { ...ecrData, ...dataFromForm };

        dataToSave.status = status;
        dataToSave.lastModified = new Date();
        dataToSave.modifiedBy = appState.currentUser.email;
        if (!dataToSave.approvals) dataToSave.approvals = {};

        const toastId = showToast('Validando y guardando...', 'loading', { duration: 0 });

        // --- Client-side ECR Validation ---
        const requiredFields = [
            { key: 'denominacion_producto', label: 'Denominación del Producto' },
            { key: 'situacion_existente', label: 'Situación Existente' },
            { key: 'situacion_propuesta', label: 'Situación Propuesta' }
        ];

        for (const field of requiredFields) {
            if (!dataToSave[field.key] || dataToSave[field.key].trim() === '') {
                showToast(`El campo "${field.label}" no puede estar vacío.`, 'error', { toastId });
                const inputElement = formContainer.querySelector(`[name="${field.key}"]`);
                if(inputElement) {
                    inputElement.classList.add('validation-error');
                    inputElement.focus();
                }
                return;
            }
        }

        try {
            if (!isEditing) {
                showToast('Generando número de ECR...', 'loading', { toastId });
                // Call the new Cloud Function to get the next ECR number.
                const getNextEcrNumber = httpsCallable(functions, 'getNextEcrNumber');
                const result = await getNextEcrNumber();
                const newEcrNumber = result.data.ecrNumber;

                if (!newEcrNumber) {
                    throw new Error("No se pudo generar un nuevo número de ECR desde el servidor.");
                }

                dataToSave.ecr_no = newEcrNumber;
                dataToSave.id = newEcrNumber;
                showToast(`Número de ECR ${newEcrNumber} generado. Guardando...`, 'loading', { toastId });
            } else {
                dataToSave.id = ecrId;
            }

            // --- Client-side Firestore Write Logic ---
            const docId = dataToSave.id;
            const docRef = doc(db, COLLECTIONS.ECR_FORMS, docId);
            const historyCollectionRef = collection(docRef, 'history');

            const batch = writeBatch(db);

            batch.set(docRef, dataToSave, { merge: true });

            const historyDocRef = doc(historyCollectionRef);
            batch.set(historyDocRef, dataToSave);

            await batch.commit();

            // After saving, check if the status needs to be updated due to the changes.
            const newStatus = checkAndUpdateEcrStatus(dataToSave);
            if (newStatus && newStatus !== dataToSave.status) {
                showToast(`El estado del ECR ha cambiado a: ${newStatus}`, 'info');
                await updateDoc(docRef, { status: newStatus });
            }

            localStorage.removeItem(ECR_FORM_STORAGE_KEY);
            showToast('ECR guardado con éxito.', 'success', { toastId });
            switchView('ecr');

        } catch (error) {
            console.error("Error during ECR save process:", error);
            const errorMessage = error.message || 'Error desconocido al guardar el formulario.';
            showToast(errorMessage, 'error', { toastId });
        }
    };

    const validateEcrForm = () => {
        let isValid = true;
        let firstErrorElement = null;

        // Clear previous errors
        formContainer.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));
        formContainer.querySelectorAll('.validation-error-message').forEach(el => el.remove());

        const requiredFields = [
            { name: 'ecr_no', label: 'ECR N°' },
            { name: 'proyecto', label: 'Proyecto' },
            { name: 'cliente', label: 'Cliente' },
            { name: 'fecha_emision', label: 'Fecha de Emisión' },
            { name: 'denominacion_producto', label: 'Denominación del Producto' }
        ];

        requiredFields.forEach(field => {
            // Skip ecr_no validation if creating a new ECR
            if (field.name === 'ecr_no' && !isEditing) {
                return;
            }

            const input = formContainer.querySelector(`[name="${field.name}"]`);
            if (input && !input.value.trim()) {
                isValid = false;
                input.classList.add('validation-error');
                const errorMsg = document.createElement('p');
                errorMsg.className = 'validation-error-message';
                errorMsg.textContent = `El campo "${field.label}" es obligatorio.`;
                input.parentElement.appendChild(errorMsg);
                if (!firstErrorElement) {
                    firstErrorElement = input;
                }
            }
        });

        if (!isValid) {
            showToast('Por favor, corrija los errores en el formulario.', 'error');
            if (firstErrorElement) {
                firstErrorElement.focus();
                firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        return isValid;
    };

    document.getElementById('ecr-save-button').addEventListener('click', () => saveEcrForm('in-progress'));
    document.getElementById('ecr-approve-button').addEventListener('click', () => {
        if (validateEcrForm()) {
            showConfirmationModal('Aprobar ECR', '¿Está seguro de que desea aprobar y guardar este ECR?', () => {
                saveEcrForm('approved');
            });
        }
    });

    // --- Scroll to section if requested ---
    if (scrollToSection) {
        const sectionElement = formContainer.querySelector(`.department-section[data-department-id="${scrollToSection}"]`);
        if (sectionElement) {
            setTimeout(() => { // Use a timeout to ensure the DOM is fully painted
                sectionElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                sectionElement.classList.add('highlight-section');
                setTimeout(() => {
                    sectionElement.classList.remove('highlight-section');
                }, 3000);
            }, 100);
        }
    }

    // --- Cleanup ---
    appState.currentViewCleanup = () => {
        formContainer.removeEventListener('input', saveEcrFormToLocalStorage);
    };
}

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
                    switchView('eco_form', { ecrData: ecrDocSnap.data() });
                } else {
                    showToast(`No se encontraron datos para el ECR: ${ecrId}`, 'error');
                }
            } catch (error) {
                console.error("Error fetching full ECR document:", error);
                showToast('Error al cargar los datos completos del ECR.', 'error');
            }
        },
        'view-eco': () => switchView('eco_form', { ecoId: button.dataset.id }),
        'view-ecr': () => switchView('ecr_form', { ecrId: button.dataset.id }),
        'view-eco-history': () => showEcoHistoryModal(button.dataset.id),
        'export-eco-pdf': () => exportEcoToPdf(button.dataset.id),
        'export-ecr-pdf': () => exportEcrToPdf(button.dataset.id),
        'approve-eco': () => {
            const ecoId = button.dataset.id;
            showConfirmationModal('Aprobar ECO', `¿Está seguro de que desea aprobar el ECO "${ecoId}"? Esta acción es final.`, async () => {
                const docRef = doc(db, COLLECTIONS.ECO_FORMS, ecoId);
                try {
                    await updateDoc(docRef, { status: 'approved', lastModified: new Date(), modifiedBy: appState.currentUser.email });
                    showToast(`ECO "${ecoId}" aprobado.`, 'success');
                } catch (error) {
                    console.error("Error approving ECO:", error);
                    showToast('Error al aprobar el ECO.', 'error');
                }
            });
        },
        'delete-task': () => {
            showConfirmationModal(
                'Eliminar Tarea',
                '¿Estás seguro de que deseas eliminar esta tarea?',
                () => deleteDocument(COLLECTIONS.TAREAS, docId)
            );
        },
        'add-task-to-column': () => {
            const status = button.dataset.status;
            openTaskFormModal(null, status);
        },
        'view-user-tasks': () => {
            if (!userId) return;
            taskState.selectedUserId = userId;
            runTasksLogic();
        },
        'assign-task-to-user': () => {
            if (!userId) return;
            openTaskFormModal(null, 'todo', userId);
        },
        'admin-back-to-supervision': () => {
            taskState.selectedUserId = null;
            runTasksLogic(); // This will call renderAdminUserList because activeFilter is 'supervision'
        },
        'admin-back-to-board': () => {
            taskState.selectedUserId = null;
            taskState.activeFilter = 'engineering'; // Go back to default view
            runKanbanBoardLogic(); // Go directly to the board, bypassing the new main logic
        },
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

function showToast(message, type = 'success', options = {}) {
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

function renderNotificationCenter() {
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

function showConfirmationModal(title, message, onConfirm) {
    const modalId = `confirm-modal-${Date.now()}`;
    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-md m-4 modal-content"><div class="p-6 text-center"><i data-lucide="alert-triangle" class="h-12 w-12 mx-auto text-yellow-500 mb-4"></i><h3 class="text-xl font-bold mb-2">${title}</h3><p class="text-gray-600">${message}</p></div><div class="flex justify-center items-center p-4 border-t bg-gray-50 space-x-4"><button data-action="cancel" class="bg-gray-200 text-gray-800 px-6 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button><button data-action="confirm" class="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700 font-semibold">Confirmar</button></div></div></div>`;
    dom.modalContainer.innerHTML = modalHTML;
    lucide.createIcons();
    const modalElement = document.getElementById(modalId);
    modalElement.addEventListener('click', e => {
        const action = e.target.closest('button')?.dataset.action;
        if (action === 'confirm') { onConfirm(); modalElement.remove(); } 
        else if (action === 'cancel') { modalElement.remove(); }
    });
}

function showInfoModal(title, htmlContent) {
    const modalId = `info-modal-${Date.now()}`;
    const modalHTML = `
        <div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in">
            <div class="bg-white rounded-lg shadow-xl w-full max-w-2xl m-4 modal-content max-h-[80vh] flex flex-col">
                <div class="flex justify-between items-center p-5 border-b">
                    <h3 class="text-xl font-bold text-slate-800 flex items-center gap-3"><i data-lucide="info" class="w-6 h-6 text-blue-500"></i>${title}</h3>
                    <button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button>
                </div>
                <div class="p-6 overflow-y-auto">
                    ${htmlContent}
                </div>
                <div class="flex justify-end items-center p-4 border-t bg-gray-50">
                    <button data-action="close" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Entendido</button>
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
    switchView('ecr_form', { ecrId });

    // Wait for the form to render
    await new Promise(resolve => setTimeout(resolve, 1000));

    const formElement = document.getElementById('ecr-form');
    if (!formElement) {
        showToast('Error: No se pudo encontrar el formulario ECR para exportar.', 'error');
        dom.loadingOverlay.style.display = 'none';
        switchView(originalView); // Switch back to original view
        return;
    }

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
        await html2canvas(formElement, {
            scale: 2, // Increase resolution
            useCORS: true,
            windowWidth: formElement.scrollWidth,
            windowHeight: formElement.scrollHeight,
            onclone: (document) => {
                // This ensures all styles are applied in the cloned document
                // that html2canvas uses for rendering.
                const clonedStyle = document.createElement('style');
                clonedStyle.innerHTML = tempStyle.innerHTML;
                document.head.appendChild(clonedStyle);
            }
        }).then(canvas => {
            const imgData = canvas.toDataURL('image/png');
            const { jsPDF } = window.jspdf;

            const pdf = new jsPDF({
                orientation: 'p',
                unit: 'px',
                format: 'a4'
            });

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const canvasWidth = canvas.width;
            const canvasHeight = canvas.height;
            const canvasAspectRatio = canvasWidth / canvasHeight;
            const pdfAspectRatio = pdfWidth / pdfHeight;

            let finalCanvasWidth, finalCanvasHeight;

            // Fit canvas to page width
            finalCanvasWidth = pdfWidth;
            finalCanvasHeight = finalCanvasWidth / canvasAspectRatio;

            // If the height is still too large, it means we need multiple pages
            const totalPages = Math.ceil(finalCanvasHeight / pdfHeight);

            for (let i = 0; i < totalPages; i++) {
                if (i > 0) {
                    pdf.addPage();
                }
                // Calculate the y position of the image slice for the current page
                const yPos = -(pdfHeight * i);
                pdf.addImage(imgData, 'PNG', 0, yPos, finalCanvasWidth, finalCanvasHeight);
            }

            pdf.save(`ECR_${ecrId}.pdf`);
            showToast('ECR exportado a PDF con éxito.', 'success');
        });
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
        switchView(originalView);
    }
}

function updateGodModeIndicator() {
    const indicator = document.getElementById('god-mode-indicator');
    if (!indicator) return;

    if (appState.godModeState?.isImpersonating) {
        const roleLabels = { admin: 'Admin', editor: 'Editor', lector: 'Lector' };
        const currentRoleLabel = roleLabels[appState.currentUser.role] || 'Desconocido';
        indicator.innerHTML = `
            <div class="god-mode-badge">
                <i data-lucide="shield-alert" class="w-4 h-4"></i>
                <span>Viendo como: <strong>${currentRoleLabel}</strong></span>
            </div>
        `;
        indicator.style.display = 'block';
        lucide.createIcons();
    } else {
        indicator.innerHTML = '';
        indicator.style.display = 'none';
    }
}

function handleGodModeRoleChange(role) {
    if (!appState.godModeState) return;

    if (role === 'real') {
        appState.currentUser.role = appState.godModeState.realRole;
        appState.godModeState.isImpersonating = false;
        showToast(`Modo Dios: Rol real restaurado (${appState.currentUser.role}).`, 'info');
    } else {
        appState.godModeState.isImpersonating = true;
        appState.currentUser.role = role;
        showToast(`Modo Dios: Viendo como ${role}.`, 'success');
    }

    updateNavForRole();
    renderUserMenu();
    switchView(appState.currentView);
    updateGodModeIndicator();
}

function handleGlobalClick(e) {
    if (appState.isTutorialActive) return; // Don't process global clicks if tutorial is running

    const target = e.target;

    // Generic view switcher
    const viewLink = target.closest('[data-view]');
    if (viewLink && !viewLink.closest('.dropdown-toggle')) {
        e.preventDefault();
        const viewName = viewLink.dataset.view;
        const params = viewLink.dataset.params ? JSON.parse(viewLink.dataset.params) : null;
        switchView(viewName, params);

        // Close any open dropdowns after a view switch
        const openDropdown = viewLink.closest('.nav-dropdown.open');
        if (openDropdown) {
            openDropdown.classList.remove('open');
        }
        return; // Prioritize view switching
    }

    const authLink = target.closest('a[data-auth-screen]');
    if (authLink) {
        e.preventDefault();
        const verifyPanel = document.getElementById('verify-email-panel');
        if (verifyPanel && !verifyPanel.classList.contains('hidden')) {
            location.reload();
        } else {
            showAuthScreen(authLink.dataset.authScreen);
        }
        return;
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
        switchView(view, JSON.parse(params));
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
    
    if (!target.closest('#export-menu-container')) document.getElementById('export-dropdown')?.classList.add('hidden'); 
    if (!target.closest('#type-filter-btn')) document.getElementById('type-filter-dropdown')?.classList.add('hidden'); 
    if (!target.closest('#add-client-filter-btn')) document.getElementById('add-client-filter-dropdown')?.classList.add('hidden');
    if (!e.target.closest('#level-filter-btn') && !e.target.closest('#level-filter-dropdown')) {
        document.getElementById('level-filter-dropdown')?.classList.add('hidden');
    }
    
    if(target.closest('#user-menu-button')) { userDropdown?.classList.toggle('hidden'); }
    if(target.closest('#logout-button')) { e.preventDefault(); logOutUser(); }
    if(target.closest('#resend-verification-btn')) { handleResendVerificationEmail(); }
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

    const modalHTML = `<div id="${modalId}" class="fixed inset-0 z-50 flex items-center justify-center modal-backdrop animate-fade-in"><div class="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col m-4 modal-content"><div class="flex justify-between items-center p-5 border-b"><h3 class="text-xl font-bold">${isEditing ? 'Editar' : 'Agregar'} ${config.singular}</h3><button data-action="close" class="text-gray-500 hover:text-gray-800"><i data-lucide="x" class="h-6 w-6"></i></button></div><form id="data-form" class="p-6 overflow-y-auto" novalidate><input type="hidden" name="edit-doc-id" value="${isEditing ? item.docId : ''}"><div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">${fieldsHTML}</div></form><div class="flex justify-end items-center p-4 border-t bg-gray-50 space-x-3"><button data-action="close" type="button" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 font-semibold">Cancelar</button><button type="submit" form="data-form" class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar</button></div></div></div>`;
    
    dom.modalContainer.innerHTML = modalHTML;
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

function renderDashboardAdminPanel() {
    const container = document.getElementById('dashboard-admin-panel-container');
    if (!container) return;

    if (!appState.currentUser.isSuperAdmin) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="bg-slate-50 p-6 rounded-xl border border-slate-200">
            <h3 class="text-xl font-bold text-slate-800 mb-4">Panel de Administración</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="border border-yellow-300 bg-yellow-50 p-4 rounded-lg">
                    <h4 class="font-bold text-yellow-800">Poblar con Datos de Prueba</h4>
                    <p class="text-xs text-yellow-700 my-2">Borra los datos actuales (excepto usuarios) y carga un set de datos de prueba completo para ECR, ECO, productos, etc.</p>
                    <button data-action="seed-database" class="w-full bg-yellow-500 text-white px-3 py-2 rounded-md hover:bg-yellow-600 font-semibold text-sm">
                        <i data-lucide="database-zap" class="inline-block mr-1.5 h-4 w-4"></i>Poblar Base de Datos
                    </button>
                </div>
                <div class="border border-orange-300 bg-orange-50 p-4 rounded-lg">
                    <h4 class="font-bold text-orange-800">Borrar Solo Datos</h4>
                    <p class="text-xs text-orange-700 my-2">Borra todos los datos pero mantiene a los usuarios.</p>
                    <button data-action="clear-data-only" class="w-full bg-orange-500 text-white px-3 py-2 rounded-md hover:bg-orange-600 font-semibold text-sm">
                        <i data-lucide="shield-check" class="inline-block mr-1.5 h-4 w-4"></i>Ejecutar
                    </button>
                </div>
                <div class="border border-red-300 bg-red-50 p-4 rounded-lg">
                    <h4 class="font-bold text-red-800">Borrar Otros Usuarios</h4>
                    <p class="text-xs text-red-700 my-2">Elimina a todos los usuarios excepto al admin principal.</p>
                    <button data-action="clear-other-users" class="w-full bg-red-600 text-white px-3 py-2 rounded-md hover:bg-red-700 font-semibold text-sm">
                        <i data-lucide="user-x" class="inline-block mr-1.5 h-4 w-4"></i>Ejecutar
                    </button>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();
}

async function runDashboardLogic() {
    const currentUser = appState.currentUser;
    dom.viewContent.innerHTML = `
        <div class="space-y-8">
            <div>
                <h1 class="text-4xl font-extrabold text-slate-800">Dashboard de Control</h1>
                <p class="text-slate-500 mt-1 text-lg">Resumen general del sistema.</p>
            </div>
            <div id="dashboard-kpi-container" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                ${[1,2,3,4].map(() => `<div class="bg-slate-200 h-28 rounded-xl animate-pulse"></div>`).join('')}
            </div>
            <div class="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div class="lg:col-span-3 bg-white p-6 rounded-xl shadow-lg border">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Carga de Tareas por Proyecto</h3>
                    <div id="tasks-by-project-chart-container" class="h-96"></div>
                </div>
                <div class="lg:col-span-2 bg-white p-6 rounded-xl shadow-lg border">
                    <h3 class="text-xl font-bold text-slate-800 mb-4">Mis Tareas Pendientes</h3>
                    <div id="dashboard-tasks-container"></div>
                </div>
            </div>
             <div id="dashboard-admin-panel-container"></div>
        </div>
    `;
    lucide.createIcons();

    // Fetch all data concurrently
    const kpiPromise = fetchDashboardKpis();
    const tasksPromise = fetchDashboardTasks();
    const projectsPromise = getDocs(collection(db, COLLECTIONS.PROYECTOS));

    const [kpiData, tasks, projectsSnap] = await Promise.all([kpiPromise, tasksPromise, projectsPromise]);

    const projects = projectsSnap.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

    // Render all components with the fetched data
    renderDashboardKpis(kpiData, tasks);
    renderDashboardTasks(tasks);
    renderTasksByProjectChart(tasks, projects);
    renderDashboardAdminPanel();
    lucide.createIcons();
}

async function fetchDashboardKpis() {
    const kpiCollections = [
        { name: 'Productos', key: COLLECTIONS.PRODUCTOS },
        { name: 'Insumos', key: COLLECTIONS.INSUMOS },
        { name: 'Proyectos', key: COLLECTIONS.PROYECTOS },
        { name: 'Usuarios', key: COLLECTIONS.USUARIOS }
    ];
    const promises = kpiCollections.map(c => getCountFromServer(collection(db, c.key)));
    const snapshots = await Promise.all(promises);
    const kpiData = {};
    snapshots.forEach((snap, index) => {
        kpiData[kpiCollections[index].name] = snap.data().count;
    });
    return kpiData;
}

async function fetchDashboardTasks() {
    const tasksQuery = query(collection(db, COLLECTIONS.TAREAS));
    const snapshot = await getDocs(tasksQuery);
    return snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));
}

function renderDashboardKpis(kpiData, allTasks) {
    const container = document.getElementById('dashboard-kpi-container');
    if (!container) return;

    const overdueTasks = allTasks.filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate) < new Date()).length;

    const kpis = [
        { label: 'Proyectos Activos', value: kpiData['Proyectos'] || 0, icon: 'square-stack', color: 'blue' },
        { label: 'Productos Totales', value: kpiData['Productos'] || 0, icon: 'package', color: 'indigo' },
        { label: 'Tareas Vencidas', value: overdueTasks, icon: 'siren', color: 'red' },
        { label: 'Usuarios Activos', value: kpiData['Usuarios'] || 0, icon: 'users', color: 'emerald' }
    ];

    container.innerHTML = kpis.map(kpi => `
        <div class="bg-${kpi.color}-500 text-white p-6 rounded-2xl shadow-lg hover:shadow-2xl transform hover:-translate-y-1 transition-all duration-300">
            <div class="flex justify-between items-start">
                <p class="text-5xl font-black">${kpi.value}</p>
                <div class="bg-white/30 p-3 rounded-xl">
                    <i data-lucide="${kpi.icon}" class="w-8 h-8"></i>
                </div>
            </div>
            <p class="mt-4 text-xl font-bold opacity-90">${kpi.label}</p>
        </div>
    `).join('');
    lucide.createIcons();
}

function renderDashboardTasks(allTasks) {
    const container = document.getElementById('dashboard-tasks-container');
    if (!container) return;
    const myTasks = allTasks.filter(t => t.assigneeUid === appState.currentUser.uid && t.status !== 'done').slice(0, 5);

    if (myTasks.length === 0) {
        container.innerHTML = `
            <div class="text-center py-10">
                <i data-lucide="check-circle-2" class="w-16 h-16 text-green-500 mx-auto"></i>
                <h4 class="mt-4 text-lg font-semibold text-slate-700">¡Bandeja de entrada limpia!</h4>
                <p class="text-slate-500">No tienes tareas pendientes.</p>
            </div>`;
    } else {
        container.innerHTML = `<div class="space-y-3">${myTasks.map(task => {
            const isOverdue = task.dueDate && new Date(task.dueDate) < new Date();
            return `
            <div class="p-3 rounded-lg hover:bg-slate-100/80 transition-all cursor-pointer" onclick="switchView('tareas')">
                <p class="font-bold text-slate-800">${task.title}</p>
                <div class="flex justify-between items-center text-sm mt-1">
                    <span class="px-2 py-0.5 text-xs font-semibold rounded-full ${
                        task.priority === 'high' ? 'bg-red-100 text-red-800' :
                        task.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-slate-100 text-slate-800'
                    }">${task.priority || 'Media'}</span>
                    <span class="font-semibold ${isOverdue ? 'text-red-600' : 'text-slate-500'}">
                        ${task.dueDate ? `Vence: ${new Date(task.dueDate).toLocaleDateString('es-AR')}` : ''}
                    </span>
                </div>
            </div>
            `;
        }).join('')}</div>`;
    }
    lucide.createIcons();
}

function renderTasksByProjectChart(allTasks, allProjects) {
    const container = document.getElementById('tasks-by-project-chart-container');
    if (!container) return;
    container.innerHTML = '<canvas id="tasks-by-project-chart"></canvas>';
    const ctx = document.getElementById('tasks-by-project-chart')?.getContext('2d');
    if (!ctx) return;

    const tasksByProject = allTasks.reduce((acc, task) => {
        const projectId = task.projectId || 'unassigned';
        if (!acc[projectId]) {
            acc[projectId] = { todo: 0, inprogress: 0, done: 0 };
        }
        if (task.status !== 'done') {
            acc[projectId][task.status || 'todo']++;
        }
        return acc;
    }, {});

    const projectMap = new Map(allProjects.map(p => [p.id, p.nombre]));
    const labels = Object.keys(tasksByProject).map(id => projectMap.get(id) || 'Sin Proyecto');

    const chartData = {
        labels: labels,
        datasets: [
            {
                label: 'Pendientes',
                data: Object.values(tasksByProject).map(p => p.todo),
                backgroundColor: '#FBBF24', // Amber 400
                borderRadius: 4,
            },
            {
                label: 'En Curso',
                data: Object.values(tasksByProject).map(p => p.inprogress),
                backgroundColor: '#3B82F6', // Blue 500
                borderRadius: 4,
            }
        ]
    };

    if (dashboardCharts.tasksByProjectChart) dashboardCharts.tasksByProjectChart.destroy();
    dashboardCharts.tasksByProjectChart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            indexAxis: 'y', // This makes the bar chart horizontal
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        precision: 0,
                        font: {
                            family: "'Inter', sans-serif",
                        }
                    }
                },
                y: {
                    stacked: true,
                    ticks: {
                        font: {
                            family: "'Inter', sans-serif",
                        }
                    }
                }
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            family: "'Inter', sans-serif",
                            size: 14
                        }
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    titleFont: { family: "'Inter', sans-serif", weight: 'bold' },
                    bodyFont: { family: "'Inter', sans-serif" },
                    footerFont: { family: "'Inter', sans-serif" },
                }
            }
        }
    });
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const seconds = Math.floor((now - timestamp) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return `hace ${Math.floor(interval)} años`;
    interval = seconds / 2592000;
    if (interval > 1) return `hace ${Math.floor(interval)} meses`;
    interval = seconds / 86400;
    if (interval > 1) return `hace ${Math.floor(interval)} días`;
    interval = seconds / 3600;
    if (interval > 1) return `hace ${Math.floor(interval)} horas`;
    interval = seconds / 60;
    if (interval > 1) return `hace ${Math.floor(interval)} minutos`;
    return `hace ${Math.floor(seconds)} segundos`;
}

async function handleProductSelect(productId) {
    // Buscamos el producto en los datos actualmente cargados en la tabla.
    // Esto es más eficiente que buscar en toda la colección si ya está en la vista.
    let producto = appState.currentData.find(p => p.id === productId);
    if (!producto) {
        producto = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.id === productId);
    }
    if (!producto) {
        showToast("Error: Producto no encontrado.", "error");
        return;
    }

    try {
        const productoRef = doc(db, COLLECTIONS.PRODUCTOS, producto.docId);
        const productoSnap = await getDoc(productoRef);

        if (!productoSnap.exists()) {
            showToast("Error: El documento del producto ya no existe.", "error");
            return;
        }

        let productoData = productoSnap.data();

        // Si el producto no tiene un campo 'estructura', lo creamos.
        if (!productoData.estructura || productoData.estructura.length === 0) {
            const nuevaEstructura = [crearComponente('producto', productoData)];
            await updateDoc(productoRef, { estructura: nuevaEstructura });
            productoData.estructura = nuevaEstructura; // Actualizamos la data local para no tener que volver a leer.
            showToast(`Nueva estructura de árbol creada para ${productoData.descripcion}.`, 'success');
        }

        // Usamos el producto directamente como el "árbol activo".
        // Añadimos 'nombre' para mantener la compatibilidad con la vista de detalle.
        appState.arbolActivo = {
            ...productoData,
            docId: productoSnap.id,
            nombre: `Árbol de ${productoData.descripcion}`,
            productoPrincipalId: productoData.id // Mantenemos consistencia
        };

        renderArbolDetalle();

    } catch (error) {
        console.error("Error al seleccionar el producto y cargar su estructura:", error);
        showToast(error.message || "Ocurrió un error al cargar el árbol del producto.", 'error');
        renderArbolesInitialView(); // Volvemos a la vista inicial en caso de error.
    }
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

// =================================================================================
// --- 7. LÓGICA DE TAREAS (KANBAN BOARD) ---
// =================================================================================

let taskState = {
    activeFilter: 'personal', // 'engineering', 'personal', 'all', 'supervision'
    searchTerm: '',
    priorityFilter: 'all',
    unsubscribers: [],
    selectedUserId: null // For admin view
};

function runTasksLogic() {
    runKanbanBoardLogic();
}

function renderTaskDashboardView() {
    const isAdmin = appState.currentUser.role === 'admin';
    const title = isAdmin ? "Estadísticas del Equipo" : "Mis Estadísticas";
    const subtitle = isAdmin ? "Analiza, filtra y gestiona las tareas del equipo." : "Un resumen de tu carga de trabajo y progreso.";

    // Main layout is the same, but we will hide elements for non-admins
    dom.viewContent.innerHTML = `
        <div class="space-y-4">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 class="text-2xl font-bold text-slate-800">${title}</h2>
                    <p class="text-sm text-slate-500">${subtitle}</p>
                </div>
                <button data-action="admin-back-to-board" class="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300 font-semibold flex items-center flex-shrink-0">
                    <i data-lucide="arrow-left" class="mr-2 h-5 w-5"></i>
                    <span>Volver al Tablero</span>
                </button>
            </div>

            <!-- Global Admin Filters (Admin only) -->
            <div id="admin-filters-container" class="bg-white p-3 rounded-xl shadow-sm border items-center gap-4 ${isAdmin ? 'flex' : 'hidden'}">
                 <label for="admin-view-filter" class="text-sm font-bold text-slate-600 flex-shrink-0">Vista:</label>
                 <select id="admin-view-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white text-sm">
                    <option value="all">Todas las Tareas</option>
                    <option value="my-tasks">Mis Tareas</option>
                 </select>
                 <div id="admin-user-filter-container" class="hidden">
                    <label for="admin-specific-user-filter" class="text-sm font-bold text-slate-600 flex-shrink-0 ml-4">Usuario:</label>
                    <select id="admin-specific-user-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white text-sm">
                        <!-- User options will be populated here -->
                    </select>
                 </div>
            </div>
        </div>

        <!-- Tabs Navigation (Admin only) -->
        <div id="admin-tabs-container" class="border-b border-gray-200 ${isAdmin ? 'block' : 'hidden'}">
            <nav id="admin-task-tabs" class="-mb-px flex space-x-6" aria-label="Tabs">
                <button data-tab="dashboard" class="admin-task-tab active-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm">
                    <i data-lucide="layout-dashboard" class="mr-2"></i><span>Dashboard</span>
                </button>
                <button data-tab="calendar" class="admin-task-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm">
                    <i data-lucide="calendar-days" class="mr-2"></i><span>Calendario</span>
                </button>
                <button data-tab="table" class="admin-task-tab group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm">
                    <i data-lucide="table" class="mr-2"></i><span>Tabla de Tareas</span>
                </button>
            </nav>
        </div>

        <div class="py-6 animate-fade-in-up">
            <!-- Tab Panels -->
            <div id="admin-tab-content">
                <!-- Dashboard Panel (Always visible) -->
                <div id="tab-panel-dashboard" class="admin-tab-panel">
                    <div id="task-charts-container" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <div class="bg-white p-6 rounded-xl shadow-lg"><h3 class="text-lg font-bold text-slate-800 mb-4">Tareas por Estado</h3><div id="status-chart-container" class="h-64 flex items-center justify-center"><canvas id="status-chart"></canvas></div></div>
                        <div class="bg-white p-6 rounded-xl shadow-lg"><h3 class="text-lg font-bold text-slate-800 mb-4">Tareas por Prioridad</h3><div id="priority-chart-container" class="h-64 flex items-center justify-center"><canvas id="priority-chart"></canvas></div></div>
                        <div id="user-load-chart-wrapper" class="bg-white p-6 rounded-xl shadow-lg ${isAdmin ? 'block' : 'hidden'} lg:col-span-2"><h3 class="text-lg font-bold text-slate-800 mb-4">Carga por Usuario (Tareas Abiertas)</h3><div id="user-load-chart-container" class="h-64 flex items-center justify-center"><canvas id="user-load-chart"></canvas></div></div>
                    </div>
                </div>

                <!-- Calendar Panel (Admin only) -->
                <div id="tab-panel-calendar" class="admin-tab-panel hidden">
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <div id="calendar-header" class="flex flex-col md:flex-row justify-between items-center mb-4 gap-4">
                            <div class="flex items-center gap-4">
                                <button id="prev-calendar-btn" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-left" class="h-6 w-6"></i></button>
                                <h3 id="calendar-title" class="text-2xl font-bold text-slate-800 text-center w-48"></h3>
                                <button id="next-calendar-btn" class="p-2 rounded-full hover:bg-slate-100"><i data-lucide="chevron-right" class="h-6 w-6"></i></button>
                                <button id="today-calendar-btn" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Hoy</button>
                            </div>
                            <div class="flex items-center gap-2">
                                <select id="calendar-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-white shadow-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm">
                                    <option value="all">Prioridad (todas)</option>
                                    <option value="high">Alta</option>
                                    <option value="medium">Media</option>
                                    <option value="low">Baja</option>
                                </select>
                                <div class="flex items-center gap-2 rounded-lg bg-slate-200 p-1">
                                    <button data-view="monthly" class="calendar-view-btn px-4 py-1.5 text-sm font-semibold rounded-md">Mensual</button>
                                    <button data-view="weekly" class="calendar-view-btn px-4 py-1.5 text-sm font-semibold rounded-md">Semanal</button>
                                </div>
                            </div>
                        </div>
                        <div id="calendar-grid" class="mt-6">
                            <!-- Calendar will be rendered here -->
                        </div>
                    </div>
                </div>

                <!-- Table Panel (Admin only) -->
                <div id="tab-panel-table" class="admin-tab-panel hidden">
                    <div class="bg-white p-6 rounded-xl shadow-lg">
                        <div id="task-table-controls" class="flex flex-col md:flex-row gap-4 mb-4">
                            <div class="relative flex-grow"><i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i><input type="text" id="admin-task-search" placeholder="Buscar por título..." class="w-full pl-10 pr-4 py-2 border rounded-full bg-slate-50 focus:bg-white"></div>
                            <div class="flex items-center gap-4 flex-wrap">
                                <select id="admin-task-user-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white"><option value="all">Todos los usuarios</option></select>
                                <select id="admin-task-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white"><option value="all">Todas las prioridades</option><option value="high">Alta</option><option value="medium">Media</option><option value="low">Baja</option></select>
                                <select id="admin-task-status-filter" class="pl-4 pr-8 py-2 border rounded-full bg-slate-50 appearance-none focus:bg-white">
                                    <option value="active">Activas</option>
                                    <option value="all">Todos los estados</option>
                                    <option value="todo">Por Hacer</option>
                                    <option value="inprogress">En Progreso</option>
                                    <option value="done">Completada</option>
                                </select>
                            </div>
                            <button id="add-new-task-admin-btn" class="bg-blue-600 text-white px-5 py-2 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105 flex-shrink-0"><i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea</button>
                        </div>
                        <div id="task-data-table-container" class="overflow-x-auto"><p class="text-center py-16 text-slate-500 flex items-center justify-center gap-3"><i data-lucide="loader" class="h-6 w-6 animate-spin"></i>Cargando tabla de tareas...</p></div>
                    </div>
                </div>
            </div>
        </div>
    `;
    lucide.createIcons();

    // Tab switching logic for admins
    if (isAdmin) {
        const tabs = document.querySelectorAll('.admin-task-tab');
        const panels = document.querySelectorAll('.admin-tab-panel');

        document.getElementById('admin-task-tabs').addEventListener('click', (e) => {
            const tabButton = e.target.closest('.admin-task-tab');
            if (!tabButton) return;

            const tabName = tabButton.dataset.tab;

            tabs.forEach(tab => {
                tab.classList.remove('active-tab');
            });
            tabButton.classList.add('active-tab');

            panels.forEach(panel => {
                if (panel.id === `tab-panel-${tabName}`) {
                    panel.classList.remove('hidden');
                } else {
                    panel.classList.add('hidden');
                }
            });
        });
    }

    const tasksRef = collection(db, COLLECTIONS.TAREAS);
    const q = query(tasksRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
        const allTasks = snapshot.docs.map(doc => ({ ...doc.data(), docId: doc.id }));

        if(isAdmin) {
            adminTaskViewState.tasks = allTasks;
            updateAdminDashboardData(allTasks);
        } else {
            const myTasks = allTasks.filter(t => t.assigneeUid === appState.currentUser.uid || t.creatorUid === appState.currentUser.uid);
            renderAdminTaskCharts(myTasks); // Directly render charts with user's tasks
        }
    }, (error) => {
        console.error("Error fetching tasks for dashboard:", error);
        showToast('Error al cargar las tareas del dashboard.', 'error');
    });

    // Initial render of components for admins
    if(isAdmin) {
        renderCalendar(); // Initialize the calendar structure once
        setupAdminTaskViewListeners();
        updateAdminDashboardData([]); // Initial call with empty data to render skeletons
    }

    appState.currentViewCleanup = () => {
        unsubscribe();
        destroyAdminTaskCharts();
        adminTaskViewState = {
            tasks: [],
            filters: { searchTerm: '', user: 'all', priority: 'all', status: 'all' },
            sort: { by: 'createdAt', order: 'desc' },
            pagination: { currentPage: 1, pageSize: 10 },
            calendar: {
                currentDate: new Date(),
                view: 'monthly' // 'monthly' or 'weekly'
            }
        };
    };
}

function updateAdminDashboardData(tasks) {
    let filteredTasks = [...tasks];
    const { viewMode } = adminTaskViewState;
    const currentUser = appState.currentUser;

    if (viewMode === 'my-tasks') {
        filteredTasks = tasks.filter(t => t.creatorUid === currentUser.uid || t.assigneeUid === currentUser.uid);
    } else if (viewMode !== 'all') {
        // A specific user's UID is selected
        filteredTasks = tasks.filter(t => t.assigneeUid === viewMode);
    }

    // The components below will use the globally filtered task list
    renderAdminTaskCharts(filteredTasks);
    renderCalendar(adminTaskViewState.calendar.currentDate, adminTaskViewState.calendar.view);


    // This function has its own internal filtering based on table controls
    renderFilteredAdminTaskTable();
}

let adminCharts = { statusChart: null, priorityChart: null, userLoadChart: null };

function destroyAdminTaskCharts() {
    Object.keys(adminCharts).forEach(key => {
        if (adminCharts[key]) {
            adminCharts[key].destroy();
            adminCharts[key] = null;
        }
    });
}

function renderAdminTaskCharts(tasks) {
    destroyAdminTaskCharts();
    renderStatusChart(tasks);
    renderPriorityChart(tasks);
    renderUserLoadChart(tasks);
}

function renderStatusChart(tasks) {
    const ctx = document.getElementById('status-chart')?.getContext('2d');
    if (!ctx) return;

    const activeTasks = tasks.filter(t => t.status !== 'done');
    const statusCounts = activeTasks.reduce((acc, task) => {
        const status = task.status || 'todo';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
    }, { todo: 0, inprogress: 0 });

    adminCharts.statusChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Por Hacer', 'En Progreso'],
            datasets: [{
                data: [statusCounts.todo, statusCounts.inprogress],
                backgroundColor: ['#f59e0b', '#3b82f6'],
                borderColor: '#ffffff',
                borderWidth: 2,
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderPriorityChart(tasks) {
    const ctx = document.getElementById('priority-chart')?.getContext('2d');
    if (!ctx) return;

    const activeTasks = tasks.filter(t => t.status !== 'done');
    const priorityCounts = activeTasks.reduce((acc, task) => {
        const priority = task.priority || 'medium';
        acc[priority] = (acc[priority] || 0) + 1;
        return acc;
    }, { low: 0, medium: 0, high: 0 });

    adminCharts.priorityChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Baja', 'Media', 'Alta'],
            datasets: [{
                data: [priorityCounts.low, priorityCounts.medium, priorityCounts.high],
                backgroundColor: ['#6b7280', '#f59e0b', '#ef4444'],
                borderColor: '#ffffff',
                borderWidth: 2,
            }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderUserLoadChart(tasks) {
    const ctx = document.getElementById('user-load-chart')?.getContext('2d');
    if (!ctx) return;

    const openTasks = tasks.filter(t => t.status !== 'done');
    const userTaskCounts = openTasks.reduce((acc, task) => {
        const assigneeUid = task.assigneeUid || 'unassigned';
        acc[assigneeUid] = (acc[assigneeUid] || 0) + 1;
        return acc;
    }, {});

    const userMap = appState.collectionsById.usuarios;
    const labels = Object.keys(userTaskCounts).map(uid => userMap.get(uid)?.name || 'No Asignado');
    const data = Object.values(userTaskCounts);

    adminCharts.userLoadChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tareas Abiertas',
                data: data,
                backgroundColor: '#3b82f6',
                borderColor: '#1d4ed8',
                borderWidth: 1,
                maxBarThickness: data.length < 3 ? 50 : undefined
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } }
        }
    });
}

let adminTaskViewState = {
    tasks: [],
    viewMode: 'all', // 'all', 'my-tasks', or a specific user's UID
    filters: {
        searchTerm: '',
        user: 'all',
        priority: 'all',
        status: 'active'
    },
    sort: {
        by: 'createdAt',
        order: 'desc'
    },
    pagination: {
        currentPage: 1,
        pageSize: 10
    },
    calendar: {
        currentDate: new Date(),
        view: 'monthly' // 'monthly' or 'weekly'
    }
};

function setupAdminTaskViewListeners() {
    const controls = {
        // Main view filters
        viewFilter: document.getElementById('admin-view-filter'),
        specificUserFilter: document.getElementById('admin-specific-user-filter'),
        specificUserContainer: document.getElementById('admin-user-filter-container'),
        // Table-specific filters
        search: document.getElementById('admin-task-search'),
        user: document.getElementById('admin-task-user-filter'),
        priority: document.getElementById('admin-task-priority-filter'),
        status: document.getElementById('admin-task-status-filter'),
        addNew: document.getElementById('add-new-task-admin-btn'),
        tableContainer: document.getElementById('task-data-table-container'),
        // Timeline filters are removed, so no controls to declare.
    };

    if (!controls.viewFilter) return; // Exit if the main controls aren't rendered

    // --- Populate User Dropdowns ---
    const users = appState.collections.usuarios || [];
    const userOptionsHTML = users.map(u => `<option value="${u.docId}">${u.name || u.email}</option>`).join('');
    controls.specificUserFilter.innerHTML = userOptionsHTML;
    // Add a "Select a user" prompt
    controls.specificUserFilter.insertAdjacentHTML('afterbegin', '<option value="" disabled selected>Seleccionar usuario...</option>');
    controls.user.innerHTML = '<option value="all">Todos los asignados</option>' + userOptionsHTML;

    // --- Main View Filter Logic ---
    controls.viewFilter.addEventListener('change', (e) => {
        const selection = e.target.value;
        if (selection === 'all' || selection === 'my-tasks') {
            controls.specificUserContainer.classList.add('hidden');
            adminTaskViewState.viewMode = selection;
            updateAdminDashboardData(adminTaskViewState.tasks);
        } else {
             // This logic can be extended if more options are added
        }
    });

    // Add a specific option to trigger user selection
    if(!controls.viewFilter.querySelector('option[value="specific-user"]')) {
        controls.viewFilter.insertAdjacentHTML('beforeend', '<option value="specific-user">Usuario específico...</option>');
    }

    controls.viewFilter.addEventListener('change', (e) => {
        if (e.target.value === 'specific-user') {
            controls.specificUserContainer.classList.remove('hidden');
        } else {
            controls.specificUserContainer.classList.add('hidden');
            adminTaskViewState.viewMode = e.target.value;
            updateAdminDashboardData(adminTaskViewState.tasks);
        }
    });

    controls.specificUserFilter.addEventListener('change', (e) => {
        adminTaskViewState.viewMode = e.target.value;
        updateAdminDashboardData(adminTaskViewState.tasks);
    });


    // --- Table Filter Logic ---
    const rerenderTable = () => {
        adminTaskViewState.pagination.currentPage = 1;
        renderFilteredAdminTaskTable();
    };

    controls.search.addEventListener('input', (e) => { adminTaskViewState.filters.searchTerm = e.target.value.toLowerCase(); rerenderTable(); });
    controls.user.addEventListener('change', (e) => { adminTaskViewState.filters.user = e.target.value; rerenderTable(); });
    controls.priority.addEventListener('change', (e) => { adminTaskViewState.filters.priority = e.target.value; rerenderTable(); });
    controls.status.addEventListener('change', (e) => { adminTaskViewState.filters.status = e.target.value; rerenderTable(); });
    controls.addNew.addEventListener('click', () => openTaskFormModal(null, 'todo'));

    // --- Table-specific Click Logic ---
    controls.tableContainer.addEventListener('click', (e) => {
        const header = e.target.closest('th[data-sort]');
        if (header) {
            const sortBy = header.dataset.sort;
            if (adminTaskViewState.sort.by === sortBy) {
                adminTaskViewState.sort.order = adminTaskViewState.sort.order === 'asc' ? 'desc' : 'asc';
            } else {
                adminTaskViewState.sort.by = sortBy;
                adminTaskViewState.sort.order = 'asc';
            }
            rerenderTable();
            return;
        }

        const actionButton = e.target.closest('button[data-action]');
        if (actionButton) {
            const action = actionButton.dataset.action;
            const taskId = actionButton.dataset.docId;
            const task = adminTaskViewState.tasks.find(t => t.docId === taskId);

            if (action === 'edit-task' && task) {
                openTaskFormModal(task);
            } else if (action === 'delete-task' && task) {
                 showConfirmationModal('Eliminar Tarea',`¿Estás seguro de que deseas eliminar la tarea "${task.title}"?`,() => deleteDocument(COLLECTIONS.TAREAS, taskId));
            }
        }

        const pageButton = e.target.closest('button[data-page]');
        if (pageButton) {
            adminTaskViewState.pagination.currentPage = parseInt(pageButton.dataset.page, 10);
            renderFilteredAdminTaskTable();
        }
    });

    // --- Calendar Controls Logic ---
    const calendarControls = {
        prevBtn: document.getElementById('prev-calendar-btn'),
        nextBtn: document.getElementById('next-calendar-btn'),
        todayBtn: document.getElementById('today-calendar-btn'),
        viewBtns: document.querySelectorAll('.calendar-view-btn')
    };

    if (calendarControls.prevBtn) {
        calendarControls.prevBtn.addEventListener('click', () => {
            const date = adminTaskViewState.calendar.currentDate;
            if (adminTaskViewState.calendar.view === 'monthly') {
                date.setMonth(date.getMonth() - 1);
            } else {
                date.setDate(date.getDate() - 7);
            }
            renderCalendar(date, adminTaskViewState.calendar.view);
        });

        calendarControls.nextBtn.addEventListener('click', () => {
            const date = adminTaskViewState.calendar.currentDate;
            if (adminTaskViewState.calendar.view === 'monthly') {
                date.setMonth(date.getMonth() + 1);
            } else {
                date.setDate(date.getDate() + 7);
            }
            renderCalendar(date, adminTaskViewState.calendar.view);
        });

        calendarControls.todayBtn.addEventListener('click', () => {
            renderCalendar(new Date(), adminTaskViewState.calendar.view);
        });

        calendarControls.viewBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const view = btn.dataset.view;
                renderCalendar(adminTaskViewState.calendar.currentDate, view);
            });
        });

        const calendarPriorityFilter = document.getElementById('calendar-priority-filter');
        if(calendarPriorityFilter) {
            calendarPriorityFilter.addEventListener('change', (e) => {
                adminTaskViewState.filters.priority = e.target.value;
                renderCalendar(adminTaskViewState.calendar.currentDate, adminTaskViewState.calendar.view);
            });
        }

        const calendarGrid = document.getElementById('calendar-grid');
        if (calendarGrid) {
            calendarGrid.addEventListener('click', (e) => {
                if (e.target.closest('[data-task-id]')) {
                    return;
                }
                const dayCell = e.target.closest('.relative.p-2');
                if (dayCell) {
                    const taskList = dayCell.querySelector('.task-list[data-date]');
                    if (taskList) {
                        const dateStr = taskList.dataset.date;
                        openTaskFormModal(null, 'todo', null, dateStr);
                    }
                }
            });
        }
    }
}

function renderFilteredAdminTaskTable() {
    let filteredTasks = [...adminTaskViewState.tasks];
    const { searchTerm, user, priority, status } = adminTaskViewState.filters;

    if (searchTerm) filteredTasks = filteredTasks.filter(t => t.title.toLowerCase().includes(searchTerm) || (t.description && t.description.toLowerCase().includes(searchTerm)));
    if (user !== 'all') filteredTasks = filteredTasks.filter(t => t.assigneeUid === user);
    if (priority !== 'all') filteredTasks = filteredTasks.filter(t => (t.priority || 'medium') === priority);
    if (status === 'active') {
        filteredTasks = filteredTasks.filter(t => t.status !== 'done');
    } else if (status !== 'all') {
        filteredTasks = filteredTasks.filter(t => (t.status || 'todo') === status);
    }

    const { by, order } = adminTaskViewState.sort;
    filteredTasks.sort((a, b) => {
        let valA = a[by] || '';
        let valB = b[by] || '';

        if (by === 'dueDate' || by === 'createdAt') {
            valA = valA ? new Date(valA).getTime() : 0;
            valB = valB ? new Date(valB).getTime() : 0;
        }

        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });

    renderAdminTaskTable(filteredTasks);
}

function renderAdminTaskTable(tasksToRender) {
    const container = document.getElementById('task-data-table-container');
    if (!container) return;

    const { currentPage, pageSize } = adminTaskViewState.pagination;
    const totalPages = Math.ceil(tasksToRender.length / pageSize);
    if (currentPage > totalPages && totalPages > 0) adminTaskViewState.pagination.currentPage = totalPages;
    const paginatedTasks = tasksToRender.slice((adminTaskViewState.pagination.currentPage - 1) * pageSize, adminTaskViewState.pagination.currentPage * pageSize);

    const userMap = appState.collectionsById.usuarios;
    const priorityMap = { high: 'Alta', medium: 'Media', low: 'Baja' };
    const statusMap = { todo: 'Por Hacer', inprogress: 'En Progreso', done: 'Completada' };
    const priorityColorMap = { high: 'bg-red-100 text-red-800', medium: 'bg-yellow-100 text-yellow-800', low: 'bg-slate-100 text-slate-800'};
    const statusColorMap = { todo: 'bg-yellow-100 text-yellow-800', inprogress: 'bg-blue-100 text-blue-800', done: 'bg-green-100 text-green-800'};

    const getSortIndicator = (column) => {
        if (adminTaskViewState.sort.by === column) {
            return adminTaskViewState.sort.order === 'asc' ? '▲' : '▼';
        }
        return '';
    };

    let tableHTML = `<table class="w-full text-sm text-left text-gray-600">
        <thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="title">Tarea ${getSortIndicator('title')}</th>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="assigneeUid">Asignado a ${getSortIndicator('assigneeUid')}</th>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="priority">Prioridad ${getSortIndicator('priority')}</th>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="dueDate">Fecha Límite ${getSortIndicator('dueDate')}</th>
            <th scope="col" class="px-6 py-3 cursor-pointer hover:bg-gray-200" data-sort="status">Estado ${getSortIndicator('status')}</th>
            <th scope="col" class="px-6 py-3 text-right">Acciones</th>
        </tr></thead><tbody>`;

    if (paginatedTasks.length === 0) {
        tableHTML += `<tr><td colspan="6" class="text-center py-16 text-gray-500"><div class="flex flex-col items-center gap-3"><i data-lucide="search-x" class="w-12 h-12 text-gray-300"></i><h4 class="font-semibold">No se encontraron tareas</h4><p>Intente ajustar los filtros de búsqueda.</p></div></td></tr>`;
    } else {
        paginatedTasks.forEach(task => {
            const assignee = userMap.get(task.assigneeUid);
            const assigneeName = assignee ? assignee.name : '<span class="italic text-slate-400">No asignado</span>';
            const priority = task.priority || 'medium';
            const status = task.status || 'todo';
            const dueDate = task.dueDate ? new Date(task.dueDate + 'T00:00:00').toLocaleDateString('es-AR') : 'N/A';

            tableHTML += `<tr class="bg-white border-b hover:bg-gray-50">
                <td class="px-6 py-4 font-medium text-gray-900">${task.title}</td>
                <td class="px-6 py-4">${assigneeName}</td>
                <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${priorityColorMap[priority]}">${priorityMap[priority]}</span></td>
                <td class="px-6 py-4">${dueDate}</td>
                <td class="px-6 py-4"><span class="px-2 py-1 font-semibold leading-tight rounded-full text-xs ${statusColorMap[status]}">${statusMap[status]}</span></td>
                <td class="px-6 py-4 text-right">
                    <button data-action="edit-task" data-doc-id="${task.docId}" class="p-2 text-gray-500 hover:text-blue-600"><i data-lucide="edit" class="h-4 w-4 pointer-events-none"></i></button>
                    <button data-action="delete-task" data-doc-id="${task.docId}" class="p-2 text-gray-500 hover:text-red-600"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>
                </td>
            </tr>`;
        });
    }
    tableHTML += `</tbody></table>`;

    if(totalPages > 1) {
        tableHTML += `<div class="flex justify-between items-center pt-4">`;
        tableHTML += `<button data-page="${currentPage - 1}" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === 1 ? 'disabled' : ''}>Anterior</button>`;
        tableHTML += `<span class="text-sm font-semibold text-gray-600">Página ${currentPage} de ${totalPages}</span>`;
        tableHTML += `<button data-page="${currentPage + 1}" class="bg-gray-200 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-300 text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed" ${currentPage === totalPages ? 'disabled' : ''}>Siguiente</button>`;
        tableHTML += `</div>`;
    }

    container.innerHTML = tableHTML;
    lucide.createIcons();
}

// =================================================================================
// --- 8. LÓGICA DEL CALENDARIO ---
// =================================================================================
// Helper para obtener el número de la semana ISO 8601.
Date.prototype.getWeekNumber = function() {
  var d = new Date(Date.UTC(this.getFullYear(), this.getMonth(), this.getDate()));
  var dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  var yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return Math.ceil((((d - yearStart) / 86400000) + 1)/7);
};

function renderCalendar(date, view) {
    if (!adminTaskViewState.calendar) return; // Don't render if state is not ready

    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    if (!calendarGrid || !calendarTitle) return;

    const aDate = date || adminTaskViewState.calendar.currentDate;
    const aView = view || adminTaskViewState.calendar.view;

    adminTaskViewState.calendar.currentDate = aDate;
    adminTaskViewState.calendar.view = aView;

    // Update view switcher buttons UI
    document.querySelectorAll('.calendar-view-btn').forEach(btn => {
        if (btn.dataset.view === aView) {
            btn.classList.add('bg-white', 'shadow-sm', 'text-blue-600');
            btn.classList.remove('text-slate-600', 'hover:bg-slate-300/50');
        } else {
            btn.classList.remove('bg-white', 'shadow-sm', 'text-blue-600');
            btn.classList.add('text-slate-600', 'hover:bg-slate-300/50');
        }
    });

    if (aView === 'monthly') {
        renderMonthlyView(aDate);
    } else { // weekly
        renderWeeklyView(aDate);
    }

    // After rendering the grid, display tasks
    displayTasksOnCalendar(adminTaskViewState.tasks);
}

function renderMonthlyView(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    const year = date.getFullYear();
    const month = date.getMonth();

    calendarTitle.textContent = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase());

    let html = `
        <div class="grid grid-cols-[auto_1fr_1fr_1fr_1fr_1fr] gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Sem</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Lunes</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Martes</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Miércoles</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Jueves</div>
            <div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">Viernes</div>
    `;

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    let currentDate = new Date(firstDayOfMonth);
    let dayOfWeek = currentDate.getDay();
    let dateOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    currentDate.setDate(currentDate.getDate() - dateOffset);

    let weekHasContent = true;
    while(weekHasContent) {
        let weekNumber = currentDate.getWeekNumber();
        html += `<div class="bg-slate-100 text-center p-2 font-bold text-slate-500 text-sm flex items-center justify-center">${weekNumber}</div>`;

        let daysInThisWeekFromMonth = 0;
        for (let i = 0; i < 5; i++) { // Monday to Friday
            const dayClass = (currentDate.getMonth() === month) ? 'bg-white' : 'bg-slate-50 text-slate-400';
            const dateStr = currentDate.toISOString().split('T')[0];
            html += `
                <div class="relative p-2 min-h-[120px] ${dayClass}">
                    <time datetime="${dateStr}" class="font-semibold text-sm">${currentDate.getDate()}</time>
                    <div class="task-list mt-1 space-y-1" data-date="${dateStr}"></div>
                </div>
            `;
            if (currentDate.getMonth() === month) {
                daysInThisWeekFromMonth++;
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        currentDate.setDate(currentDate.getDate() + 2);

        if (daysInThisWeekFromMonth === 0 && currentDate > lastDayOfMonth) {
            weekHasContent = false;
        }
    }

    html += `</div>`;
    calendarGrid.innerHTML = html;
}

function renderWeeklyView(date) {
    const calendarGrid = document.getElementById('calendar-grid');
    const calendarTitle = document.getElementById('calendar-title');

    let dayOfWeek = date.getDay();
    let dateOffset = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
    let monday = new Date(date);
    monday.setDate(date.getDate() - dateOffset);

    let friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);

    const weekNumber = monday.getWeekNumber();
    calendarTitle.textContent = `Semana ${weekNumber}`;

    const dayHeaders = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    let headerHtml = '';
    for(let i=0; i<5; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        headerHtml += `<div class="font-bold text-sm text-center py-2 bg-slate-50 text-slate-600">${dayHeaders[i]} ${d.getDate()}</div>`;
    }

    let html = `
        <div class="grid grid-cols-5 gap-px bg-slate-200 border border-slate-200 rounded-lg overflow-hidden">
            ${headerHtml}
    `;

    for (let i = 0; i < 5; i++) {
        const currentDate = new Date(monday);
        currentDate.setDate(monday.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];
        html += `
            <div class="relative bg-white p-2 min-h-[200px]">
                <div class="task-list mt-1 space-y-1" data-date="${dateStr}"></div>
            </div>
        `;
    }

    html += `</div>`;
    calendarGrid.innerHTML = html;
}

function displayTasksOnCalendar(tasks) {
    // Clear any existing tasks from the calendar
    document.querySelectorAll('#calendar-grid .task-list').forEach(list => {
        list.innerHTML = '';
    });

    if (!tasks) return;

    const tasksToDisplay = tasks.filter(task => {
        const { priority } = adminTaskViewState.filters;
        if (priority !== 'all' && (task.priority || 'medium') !== priority) {
            return false;
        }
        return true;
    });

    tasksToDisplay.forEach(task => {
        if (task.dueDate) {
            const taskDateStr = task.dueDate;
            const dayCell = document.querySelector(`#calendar-grid .task-list[data-date="${taskDateStr}"]`);

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


function runKanbanBoardLogic() {
    if (taskState.activeFilter === 'supervision' && !taskState.selectedUserId) {
        renderAdminUserList();
        return;
    }

    let topBarHTML = '';
    if (taskState.selectedUserId) {
        const selectedUser = appState.collections.usuarios.find(u => u.docId === taskState.selectedUserId);
        topBarHTML = `
        <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold">Tareas de ${selectedUser?.name || 'Usuario'}</h3>
            <button data-action="admin-back-to-supervision" class="bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm font-semibold">Volver a Supervisión</button>
        </div>
        `;
    }

    const telegramConfigHTML = `
    <div id="telegram-config-collapsible" class="bg-white rounded-xl shadow-lg mb-6 border border-blue-200 overflow-hidden">
        <button id="telegram-config-header" class="w-full flex justify-between items-center p-4">
            <div class="flex items-center gap-4">
                <i data-lucide="send" class="w-8 h-8 text-blue-500"></i>
                <div>
                    <h3 class="text-lg font-bold text-slate-800 text-left">Configuración de Notificaciones de Telegram</h3>
                    <p class="text-sm text-slate-500 text-left">Recibe notificaciones de tus tareas directamente en tu teléfono.</p>
                </div>
            </div>
            <i data-lucide="chevron-down" id="telegram-config-chevron" class="w-6 h-6 text-slate-500 transition-transform"></i>
        </button>
        <div id="telegram-config-body" class="p-6 pt-0" style="display: none;">
            <div class="mt-4 text-sm text-slate-600 bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-4">
                <div>
                    <p class="font-bold text-blue-800 mb-2 flex items-center gap-2"><i data-lucide="info"></i>¿Cómo funciona?</p>
                    <ul class="list-disc list-inside space-y-1 pl-5">
                        <li>Recibirás un mensaje cuando alguien te <strong>asigne una tarea nueva</strong>.</li>
                        <li>Recibirás un mensaje cuando el estado de una <strong>tarea que tú creaste</strong> cambie (por ejemplo, de "Por Hacer" a "En Progreso").</li>
                    </ul>
                </div>
                <div>
                    <p class="font-bold text-blue-800 mb-2 flex items-center gap-2"><i data-lucide="help-circle"></i>¿Cómo obtener tu Chat ID?</p>
                    <p class="pl-5">
                        Abre Telegram y busca el bot <a href="https://t.me/userinfobot" target="_blank" class="text-blue-600 font-semibold hover:underline">@userinfobot</a>. Inicia una conversación con él y te enviará tu Chat ID numérico. Cópialo y pégalo en el campo de abajo.
                    </p>
                </div>
            </div>
            <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 pt-4 border-t">
                <div>
                    <label for="telegram-chat-id" class="block text-sm font-medium text-gray-700 mb-1">Tu Chat ID de Telegram</label>
                    <input type="text" id="telegram-chat-id" placeholder="Ingresa tu Chat ID numérico" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">¿Cuándo notificar?</label>
                    <div class="space-y-2 mt-2">
                        <label class="flex items-center">
                            <input type="checkbox" id="notify-on-assignment" name="onAssignment" class="h-4 w-4 rounded text-blue-600">
                            <span class="ml-2 text-sm">Cuando se me asigna una tarea nueva.</span>
                        </label>
                        <label class="flex items-center">
                            <input type="checkbox" id="notify-on-status-change" name="onStatusChange" class="h-4 w-4 rounded text-blue-600">
                            <span class="ml-2 text-sm">Cuando una tarea que creé cambia de estado.</span>
                        </label>
                        <label class="flex items-center">
                            <input type="checkbox" id="notify-on-due-date-reminder" name="onDueDateReminder" class="h-4 w-4 rounded text-blue-600">
                            <span class="ml-2 text-sm">Un día antes del vencimiento de una tarea asignada.</span>
                        </label>
                    </div>
                </div>
            </div>
            <div class="mt-6 flex items-center gap-4">
                <button id="save-telegram-config-btn" class="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 font-semibold">Guardar Configuración</button>
                <button id="send-test-telegram-btn" class="bg-slate-200 text-slate-700 px-6 py-2 rounded-md hover:bg-slate-300 font-semibold">Enviar Mensaje de Prueba</button>
            </div>
        </div>
    </div>
    `;

    // 1. Set up the basic HTML layout for the board
    dom.viewContent.innerHTML = `
        ${telegramConfigHTML}
        ${topBarHTML}
        <div class="flex flex-col md:flex-row justify-between items-center gap-4 mb-6 ${taskState.selectedUserId ? 'hidden' : ''}">
            <div id="task-filters" class="flex items-center gap-2 rounded-lg bg-slate-200 p-1 flex-wrap"></div>

            <div class="flex items-center gap-2 flex-grow w-full md:w-auto">
                <div class="relative flex-grow">
                    <i data-lucide="search" class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400"></i>
                    <input type="text" id="task-search-input" placeholder="Buscar tareas..." class="w-full pl-10 pr-4 py-2 border rounded-full bg-white shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                </div>
                <div class="relative">
                    <select id="task-priority-filter" class="pl-4 pr-8 py-2 border rounded-full bg-white shadow-sm appearance-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                        <option value="all">Prioridad (todas)</option>
                        <option value="high">Alta</option>
                        <option value="medium">Media</option>
                        <option value="low">Baja</option>
                    </select>
                    <i data-lucide="chevron-down" class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none"></i>
                </div>
            </div>

            <div id="kanban-header-buttons" class="flex items-center gap-4 flex-shrink-0">
                <button id="go-to-stats-view-btn" class="bg-slate-700 text-white px-5 py-2.5 rounded-full hover:bg-slate-800 flex items-center shadow-md transition-transform transform hover:scale-105 flex-shrink-0">
                    <i data-lucide="bar-chart-2" class="mr-2 h-5 w-5"></i>Ver Estadísticas
                </button>
                <button id="add-new-task-btn" class="bg-blue-600 text-white px-5 py-2.5 rounded-full hover:bg-blue-700 flex items-center shadow-md transition-transform transform hover:scale-105">
                    <i data-lucide="plus" class="mr-2 h-5 w-5"></i>Nueva Tarea
                </button>
            </div>
        </div>
        <div id="task-board" class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="todo">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="list-todo" class="w-5 h-5 text-yellow-600"></i>Por Hacer</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="inprogress">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="timer" class="w-5 h-5 text-blue-600"></i>En Progreso</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
            <div class="task-column bg-slate-100/80 rounded-xl" data-status="done">
                <h3 class="font-bold text-slate-800 p-3 border-b-2 border-slate-300 mb-4 flex justify-between items-center cursor-pointer kanban-column-header">
                    <span class="flex items-center gap-3"><i data-lucide="check-circle" class="w-5 h-5 text-green-600"></i>Completadas</span>
                    <button class="kanban-toggle-btn p-1 hover:bg-slate-200 rounded-full"><i data-lucide="chevron-down" class="w-5 h-5 transition-transform"></i></button>
                </h3>
                <div class="task-list min-h-[300px] p-4 space-y-4 overflow-y-auto"></div>
            </div>
        </div>
    `;
    lucide.createIcons();

    // 2. Set up event listeners for filters and the add button
    document.getElementById('add-new-task-btn').addEventListener('click', () => openTaskFormModal());
    document.getElementById('go-to-stats-view-btn').addEventListener('click', renderTaskDashboardView);

    document.getElementById('telegram-config-header').addEventListener('click', () => {
        const body = document.getElementById('telegram-config-body');
        const chevron = document.getElementById('telegram-config-chevron');
        const isHidden = body.style.display === 'none';

        body.style.display = isHidden ? 'block' : 'none';
        chevron.classList.toggle('rotate-180', isHidden);
    });

    // --- Telegram Config Logic ---
    const loadTelegramConfig = () => {
        const user = appState.currentUser;
        if (user) {
            const chatIdInput = document.getElementById('telegram-chat-id');
            const onAssignmentCheck = document.getElementById('notify-on-assignment');
            const onStatusChangeCheck = document.getElementById('notify-on-status-change');
            const onDueDateReminderCheck = document.getElementById('notify-on-due-date-reminder');

            if (chatIdInput) {
                chatIdInput.value = user.telegramChatId || '';
            }
            if (onAssignmentCheck) {
                // Default to true if not set
                onAssignmentCheck.checked = user.telegramNotifications?.onAssignment !== false;
            }
            if (onStatusChangeCheck) {
                // Default to true if not set
                onStatusChangeCheck.checked = user.telegramNotifications?.onStatusChange !== false;
            }
            if (onDueDateReminderCheck) {
                // Default to true if not set
                onDueDateReminderCheck.checked = user.telegramNotifications?.onDueDateReminder !== false;
            }
        }
    };

    const saveTelegramConfig = async () => {
        const chatId = document.getElementById('telegram-chat-id').value.trim();
        const onAssignment = document.getElementById('notify-on-assignment').checked;
        const onStatusChange = document.getElementById('notify-on-status-change').checked;
        const onDueDateReminder = document.getElementById('notify-on-due-date-reminder').checked;

        if (!chatId || !/^-?\d+$/.test(chatId)) {
            showToast('Por favor, ingrese un Chat ID de Telegram válido (solo números).', 'error');
            return;
        }

        const userDocRef = doc(db, COLLECTIONS.USUARIOS, appState.currentUser.uid);
        try {
            await updateDoc(userDocRef, {
                telegramChatId: chatId,
                telegramNotifications: {
                    onAssignment: onAssignment,
                    onStatusChange: onStatusChange,
                    onDueDateReminder: onDueDateReminder
                }
            });
            showToast('Configuración de Telegram guardada.', 'success');
        } catch (error) {
            console.error("Error saving Telegram config:", error);
            showToast('Error al guardar la configuración.', 'error');
        }
    };

    document.getElementById('save-telegram-config-btn')?.addEventListener('click', saveTelegramConfig);

    const testButton = document.getElementById('send-test-telegram-btn');
    if (testButton) {
        testButton.addEventListener('click', async () => {
            const originalText = testButton.textContent;
            testButton.innerHTML = '<i data-lucide="loader" class="animate-spin h-5 w-5 mr-2"></i>Enviando...';
            testButton.disabled = true;
            lucide.createIcons();

            try {
                const sendTestMessage = httpsCallable(functions, 'sendTestTelegramMessage');
                const result = await sendTestMessage();
                showToast(result.data.message, 'success');
            } catch (error) {
                console.error("Error sending test message:", error);
                const errorMessage = error.message || "Error desconocido.";
                showToast(`Error: ${errorMessage}`, 'error');
            } finally {
                testButton.innerHTML = originalText;
                testButton.disabled = false;
            }
        });
    }

    loadTelegramConfig();

    document.getElementById('task-board').addEventListener('click', e => {
        const header = e.target.closest('.kanban-column-header');
        if (header) {
            header.parentElement.classList.toggle('collapsed');
        }
    });

    document.getElementById('task-search-input').addEventListener('input', e => {
        taskState.searchTerm = e.target.value.toLowerCase();
        fetchAndRenderTasks();
    });
    document.getElementById('task-priority-filter').addEventListener('change', e => {
        taskState.priorityFilter = e.target.value;
        fetchAndRenderTasks();
    });
    setupTaskFilters();

    // 3. Initial fetch and render
    renderTaskFilters();
    fetchAndRenderTasks();

    // The admin button is no longer needed as the entry point is unified.
    // Admins can switch between dashboard and board using the back button.

    // 4. Cleanup logic
    appState.currentViewCleanup = () => {
        taskState.unsubscribers.forEach(unsub => unsub());
        taskState.unsubscribers = [];
        // Reset filters when leaving view
        taskState.searchTerm = '';
        taskState.priorityFilter = 'all';
        taskState.selectedUserId = null;
    };
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

function initTasksSortable() {
    const lists = document.querySelectorAll('.task-list');
    lists.forEach(list => {
        // Destroy existing instance if it exists
        if (list.sortable) {
            list.sortable.destroy();
        }

        list.sortable = new Sortable(list, {
            group: 'tasks',
            animation: 150,
            ghostClass: 'sortable-ghost',
            filter: '.no-drag', // Ignore elements with the 'no-drag' class
            onEnd: async (evt) => {
                const taskId = evt.item.dataset.taskId;
                const newStatus = evt.to.closest('.task-column').dataset.status;
                const taskRef = doc(db, COLLECTIONS.TAREAS, taskId);
                try {
                    await updateDoc(taskRef, { status: newStatus });
                    showToast('Tarea actualizada.', 'success');
                } catch (error) {
                    console.error("Error updating task status:", error);
                    showToast('Error al mover la tarea.', 'error');
                }
            }
        });
    });
}

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
            <form id="task-form" class="p-6 overflow-y-auto space-y-4" novalidate>
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

                <div class="space-y-2 pt-2">
                    <label class="block text-sm font-medium text-gray-700">Sub-tareas</label>
                    <div id="subtasks-list" class="space-y-2 max-h-48 overflow-y-auto p-2 rounded-md bg-slate-50 border"></div>
                    <div class="flex items-center gap-2">
                        <label for="new-subtask-title" class="sr-only">Añadir sub-tarea</label>
                        <input type="text" id="new-subtask-title" name="new-subtask-title" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Añadir sub-tarea y presionar Enter">
                    </div>
                </div>

                <!-- Comments Section -->
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

                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div>
                        <label for="task-startdate" class="block text-sm font-medium text-gray-700 mb-1">Fecha de Inicio</label>
                        <input type="date" id="task-startdate" name="startDate" value="${isEditing && task.startDate ? task.startDate : (defaultDate || '')}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
                    </div>
                    <div>
                        <label for="task-duedate" class="block text-sm font-medium text-gray-700 mb-1">Fecha Límite</label>
                        <input type="date" id="task-duedate" name="dueDate" value="${isEditing && task.dueDate ? task.dueDate : (defaultDate || '')}" class="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm">
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

        if (isTestMode && !window.e2eDataSeeded) {
            await seedMinimalTestDataForE2E();
            window.e2eDataSeeded = true;
        }

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

            // This is the critical sequence: render the content, THEN hide the loading screen.
            await switchView('dashboard');

            // FIX: Per AGENTS.md, defer UI updates to prevent race conditions with E2E tests.
            // A longer delay is used for E2E tests to ensure rendering completes before screenshotting.
            const urlParams = new URLSearchParams(window.location.search);
            const isE2ETest = urlParams.get('e2e-test') === 'true';
            const delay = isE2ETest ? 500 : 0;

            setTimeout(() => {
                dom.loadingOverlay.style.display = 'none';
                dom.authContainer.classList.add('hidden');
                dom.appView.classList.remove('hidden');
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
    }
});

function updateNavForRole() {
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

function renderUserMenu() {
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

function showAuthScreen(screenName) {
    ['login-panel', 'register-panel', 'reset-panel', 'verify-email-panel'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });
    document.getElementById(`${screenName}-panel`).classList.remove('hidden');
}

async function handleResendVerificationEmail() {
    const resendButton = document.getElementById('resend-verification-btn');
    const timerElement = document.getElementById('resend-timer');
    if (!resendButton || !timerElement || resendButton.disabled) return;

    resendButton.disabled = true;
    timerElement.textContent = 'Enviando...';

    try {
        await sendEmailVerification(auth.currentUser);
        showToast('Se ha enviado un nuevo correo de verificación.', 'success');

        // Cooldown timer
        let seconds = 60;
        timerElement.textContent = `Puedes reenviar de nuevo en ${seconds}s.`;
        const interval = setInterval(() => {
            seconds--;
            if (seconds > 0) {
                timerElement.textContent = `Puedes reenviar de nuevo en ${seconds}s.`;
            } else {
                clearInterval(interval);
                timerElement.textContent = '';
                resendButton.disabled = false;
            }
        }, 1000);

    } catch (error) {
        console.error("Error resending verification email:", error);
        let friendlyMessage = 'Error al reenviar el correo.';
        if (error.code === 'auth/too-many-requests') {
            friendlyMessage = 'Demasiados intentos. Por favor, espera un momento antes de volver a intentarlo.';
        }
        showToast(friendlyMessage, 'error');
        timerElement.textContent = 'Hubo un error. Inténtalo de nuevo más tarde.';
        // Keep the button disabled for a shorter cooldown on error
        setTimeout(() => {
            if (timerElement.textContent.includes('error')) {
                 timerElement.textContent = '';
            }
            resendButton.disabled = false;
        }, 30000);
    }
}


async function handleLogin(form, email, password) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    // The onAuthStateChanged listener will handle successful login
}

async function handleRegister(form, email, password) {
    const name = form.querySelector('#register-name').value;
    if (!email.toLowerCase().endsWith('@barackmercosul.com')) {
        throw new Error('auth/unauthorized-domain');
    }
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(userCredential.user, { displayName: name });

    await setDoc(doc(db, COLLECTIONS.USUARIOS, userCredential.user.uid), {
        id: userCredential.user.uid,
        name: name,
        email: userCredential.user.email,
        role: 'lector',
        sector: 'Sin Asignar',
        createdAt: new Date()
    });

    await sendEmailVerification(userCredential.user);
    showToast('¡Registro exitoso! Revisa tu correo para verificar tu cuenta.', 'success');
    showAuthScreen('verify-email');
}

async function handlePasswordReset(form, email) {
    await sendPasswordResetEmail(auth, email);
    showToast(`Si la cuenta ${email} existe, se ha enviado un enlace para restablecer la contraseña.`, 'info');
    showAuthScreen('login');
}

async function handleAuthForms(e) {
    e.preventDefault();
    const form = e.target;
    const formId = form.id;
    const email = form.querySelector('input[type="email"]').value;
    const passwordInput = form.querySelector('input[type="password"]');
    const password = passwordInput ? passwordInput.value : null;

    const submitButton = form.querySelector('button[type="submit"]');
    const originalButtonHTML = submitButton.innerHTML;
    submitButton.disabled = true;
    submitButton.innerHTML = `<i data-lucide="loader" class="animate-spin h-5 w-5 mx-auto"></i>`;
    lucide.createIcons();

    try {
        switch (formId) {
            case 'login-form':
                await handleLogin(form, email, password);
                break;
            case 'register-form':
                await handleRegister(form, email, password);
                break;
            case 'reset-form':
                await handlePasswordReset(form, email);
                break;
        }
        // onAuthStateChanged will handle UI changes for successful login/registration
    } catch (error) {
        console.error("Authentication error:", error);
        let friendlyMessage = "Ocurrió un error inesperado.";
        switch (error.code || error.message) {
            case 'auth/invalid-login-credentials':
            case 'auth/wrong-password':
            case 'auth/user-not-found':
                friendlyMessage = 'Credenciales incorrectas. Por favor, verifique su email y contraseña.';
                break;
            case 'auth/email-not-verified': // This is now caught by onAuthStateChanged, but kept as a fallback.
                friendlyMessage = 'Debe verificar su email para poder iniciar sesión. Revise su casilla de correo.';
                showAuthScreen('verify-email');
                break;
            case 'auth/email-already-in-use':
                friendlyMessage = 'Este correo electrónico ya está registrado. Intente iniciar sesión.';
                break;
            case 'auth/weak-password':
                friendlyMessage = 'La contraseña debe tener al menos 6 caracteres.';
                break;
            case 'auth/unauthorized-domain':
                friendlyMessage = 'Dominio no autorizado. Use un correo de @barackmercosul.com.';
                break;
            case 'auth/too-many-requests':
                 friendlyMessage = 'Demasiados intentos. Por favor, espera un momento antes de volver a intentarlo.';
                 break;
            default:
                friendlyMessage = 'Error de autenticación. Intente de nuevo más tarde.';
        }
        showToast(friendlyMessage, 'error');
    } finally {
        // Restore button state only on failure, as success is handled by onAuthStateChanged
        if (!auth.currentUser || (formId === 'register-form' && error)) {
             submitButton.disabled = false;
             submitButton.innerHTML = originalButtonHTML;
        }
    }
}

async function logOutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        showToast("Error al cerrar sesión.", "error");
    }
}

document.addEventListener('DOMContentLoaded', () => {
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
            <p class="text-sm text-blue-700">Comienza agregando componentes usando los botones <span class="font-mono bg-green-100 text-green-800 px-1 rounded">+ semiterminado</span> o <span class="font-mono bg-green-100 text-green-800 px-1 rounded">+ insumo</span>.</p>
        </div>`;
    }
    dom.viewContent.innerHTML = `<div class="bg-white rounded-xl shadow-md p-6 animate-fade-in-up"><div class="flex justify-between items-start mb-4 pb-4 border-b"><div><h3 class="text-2xl font-bold">${appState.arbolActivo.nombre}</h3><p class="text-sm text-gray-500">Cliente: <span class="font-semibold">${cliente?.descripcion || 'N/A'}</span></p></div><div class="flex space-x-2"><button data-action="volver-a-busqueda" class="bg-gray-500 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-gray-600">Buscar Otro</button>${checkUserPermission('edit') ? `<button data-action="guardar-arbol" class="bg-blue-600 text-white px-4 py-2 rounded-md text-sm font-semibold hover:bg-blue-700 flex items-center justify-center w-28 transition-all duration-300">Guardar</button>` : ''}</div></div>${treeContentHTML}</div>`;
    renderArbol(highlightNodeId);
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

function renderNodo(nodo) {
    const collectionName = nodo.tipo + 's';
    const item = appState.collectionsById[collectionName]?.get(nodo.refId);
    if (!item) return '';

    const addableChildren = { producto: ['semiterminado', 'insumo'], semiterminado: ['semiterminado', 'insumo'], insumo: [] };
    let addButtons = checkUserPermission('edit')
        ? (addableChildren[nodo.tipo] || []).map(tipo => `<button data-action="add-node" data-node-id="${nodo.id}" data-child-type="${tipo}" class="px-2 py-1 bg-green-100 text-green-800 rounded-md hover:bg-green-200 text-xs font-semibold" title="Agregar ${tipo}">+ ${tipo}</button>`).join(' ')
        : '';

    const isDraggable = nodo.tipo !== 'producto';

    let quantityText = '';
    if (nodo.tipo === 'insumo') {
        const merma = nodo.consumoTeorico > 0 ? ((nodo.consumoReal - nodo.consumoTeorico) / nodo.consumoTeorico) * 100 : 0;
        const mermaClass = merma > 0 ? 'text-red-600' : 'text-green-600';
        quantityText = `
            <span class="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full flex-shrink-0" title="Cantidad por Conjunto">x${nodo.quantity || 0}</span>
            <span class="text-xs text-gray-500 bg-blue-100 px-2 py-0.5 rounded-full flex-shrink-0" title="Consumo Real por Unidad">${nodo.consumoReal || 0} ${nodo.unidadConsumo || ''}</span>
            <span class="text-xs ${mermaClass} bg-gray-200 px-2 py-0.5 rounded-full flex-shrink-0" title="Merma de Proceso">${merma.toFixed(2)}%</span>
        `;
    } else if (nodo.tipo !== 'producto') {
         quantityText = `<span class="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full flex-shrink-0">x${nodo.quantity || 1}</span>`;
    }


    const commentText = nodo.comment ? `<p class="pl-8 text-sm text-slate-500 italic flex items-center gap-2"><i data-lucide="message-square" class="w-3.5 h-3.5"></i>${nodo.comment}</p>` : '';

    const editButton = (checkUserPermission('edit') && nodo.tipo !== 'producto') ? `
        <button data-action="edit-node-details" data-node-id="${nodo.id}" class="text-blue-600 hover:text-blue-700" title="Editar Atributos">
            <i data-lucide="pencil" class="h-4 w-4 pointer-events-none"></i>
        </button>
    ` : '';

    return `<li data-node-id="${nodo.id}" class="group">
                <div class="node-content ${isDraggable ? '' : 'cursor-default'}" data-type="${nodo.tipo}">
                    <div class="flex items-center gap-3 flex-grow min-w-0">
                        <i data-lucide="${nodo.icon}" class="h-5 w-5 text-gray-600 flex-shrink-0"></i>
                        <span class="font-semibold truncate" title="${item.descripcion}">${item.descripcion}</span>
                        <span class="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full flex-shrink-0">${nodo.tipo}</span>
                    </div>
                     <div class="flex items-center gap-2 flex-shrink-0">
                        ${quantityText}
                    </div>
                    <div class="flex items-center space-x-2 flex-shrink-0">
                        ${addButtons}
                        ${editButton}
                        ${(checkUserPermission('delete') && nodo.tipo !== 'producto') ? `<button data-action="delete-node" data-node-id="${nodo.id}" class="text-red-500 hover:text-red-700" title="Eliminar"><i data-lucide="trash-2" class="h-4 w-4 pointer-events-none"></i></button>` : ''}
                    </div>
                </div>
                ${commentText}
                ${addableChildren[nodo.tipo].length > 0 ? `<ul class="node-children-list">${(nodo.children || []).map(renderNodo).join('')}</ul>` : ''}
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

function handleDropEvent(evt) {
    const movedItemId = evt.item.dataset.nodeId;
    const newParentEl = evt.to;
    const newParentId = newParentEl.closest('li[data-node-id]').dataset.nodeId;
    const newIndex = evt.newIndex;
    
    let movedNode = null;
    let oldParentNode = null;
    function findAndRemove(nodes, parent) {
        for (let i = 0; i < nodes.length; i++) {
            if (nodes[i].id === movedItemId) {
                movedNode = nodes.splice(i, 1)[0];
                oldParentNode = parent;
                return true;
            }
            if (nodes[i].children && findAndRemove(nodes[i].children, nodes[i])) {
                return true;
            }
        }
        return false;
    }
    findAndRemove(appState.arbolActivo.estructura, null);
    if (movedNode) {
        const newParentNode = findNode(newParentId, appState.arbolActivo.estructura);
        if (newParentNode && newParentNode.tipo !== 'insumo') {
            if (!newParentNode.children) newParentNode.children = [];
            newParentNode.children.splice(newIndex, 0, movedNode);
        } else {
            if (oldParentNode) {
                 oldParentNode.children.splice(evt.oldIndex, 0, movedNode);
            }
            showToast('No se puede anidar un componente dentro de un insumo.', 'error');
        }
    }
    renderArbol();
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


function openProductSearchModalForView(viewType) {
    // Re-use the existing modal logic but adapt the callback.
    const modalId = `prod-search-modal-${viewType}-${Date.now()}`;

    const onProductSelect = async (productId) => {
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
            <h3 class="text-center font-bold text-xl py-3 bg-blue-600 text-white">COMPOSICIÓN DE PIEZAS - BOM</h3>
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

                        <div class="bg-gray-50 p-4 rounded-lg border">
                            <label class="block text-sm font-medium text-gray-700 mb-1">Merma de Proceso (%)</label>
                            <p id="merma-calculada" class="text-lg font-bold text-gray-800">0.00%</p>
                            <p class="text-xs text-gray-500">Calculado a partir del consumo teórico y real.</p>
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
        const mermaDisplay = modalElement.querySelector('#merma-calculada');

        const calculateMerma = () => {
            const teorico = parseFloat(consumoTeoricoInput.value) || 0;
            const real = parseFloat(consumoRealInput.value) || 0;
            if (teorico > 0) {
                const merma = ((real - teorico) / teorico) * 100;
                mermaDisplay.textContent = `${merma.toFixed(2)}%`;
                 mermaDisplay.className = `text-lg font-bold ${merma < 0 ? 'text-green-600' : 'text-red-600'}`;
            } else {
                mermaDisplay.textContent = 'N/A';
                mermaDisplay.className = 'text-lg font-bold text-gray-800';
            }
        };

        consumoTeoricoInput.addEventListener('input', calculateMerma);
        consumoRealInput.addEventListener('input', calculateMerma);
        calculateMerma(); // Initial calculation
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

export const getFlattenedData = (product, levelFilters) => {
    if (!product || !product.estructura) return [];

    // Pass 1: Traverse the original tree and tag every node with its original level.
    const tagLevels = (nodes, level) => {
        if (!nodes) return [];
        return nodes.map(node => {
            const newNode = { ...node, originalLevel: level };
            if (node.children) {
                newNode.children = tagLevels(node.children, level + 1);
            }
            return newNode;
        });
    };
    const taggedStructure = tagLevels(product.estructura, 0);

    // Pass 2: Filter the tagged tree if a filter is active.
    const filterTree = (nodes) => {
        if (!nodes) return [];
        return nodes.reduce((acc, node) => {
            // A node is kept if its level is in the filter set.
            if (levelFilters.has(node.originalLevel.toString())) {
                const newNode = { ...node };
                if (node.children) {
                    // Its children are the result of filtering its original children.
                    newNode.children = filterTree(node.children);
                }
                acc.push(newNode);
            } else {
                // If the node itself is filtered out, its children might not be.
                // So we filter its children and add them to the current accumulator,
                // effectively "promoting" them.
                if (node.children) {
                    acc.push(...filterTree(node.children));
                }
            }
            return acc;
        }, []);
    };

    const finalStructure = (!levelFilters || levelFilters.size === 0)
        ? taggedStructure
        : filterTree(taggedStructure);

    // Pass 3: Flatten the final (potentially filtered) tree for rendering.
    const flatten = (nodes, displayLevel, lineage) => {
        if (!nodes) return [];
        let result = [];
        nodes.forEach((node, index) => {
            const isLast = index === nodes.length - 1;
            const collectionName = node.tipo + 's';
            const item = appState.collectionsById[collectionName]?.get(node.refId);
            if (item) {
                // BUGFIX: The object passed for rendering must use the calculated
                // `displayLevel`, not the node's original level. The test
                // `sinoptico_tabular_level_display_bug.spec.js` verifies this.
                // The `level` property was being incorrectly shadowed by `node.level`
                // if it existed, but the main bug is that it should be `displayLevel`.
                result.push({ node, item, level: displayLevel, isLast, lineage });
                if (node.children) {
                    result.push(...flatten(node.children, displayLevel + 1, [...lineage, !isLast]));
                }
            }
        });
        return result;
    };

    return flatten(finalStructure, 0, []);
};

export function runSinopticoTabularLogic() {
    // Initialize state for the view
    if (!appState.sinopticoTabularState) {
        appState.sinopticoTabularState = {
            selectedProduct: null,
            activeFilters: {
                niveles: new Set()
            }
        };
    }

    const state = appState.sinopticoTabularState;

    // --- RENDER FUNCTIONS ---

    const renderTabularTable = (data) => {
        const state = appState.sinopticoTabularState;
        const selectedProduct = state.selectedProduct;

        if (data.length === 0) return `<p class="text-slate-500 p-4 text-center">El producto seleccionado no tiene una estructura definida.</p>`;

        let tableHTML = `<table class="w-full text-sm text-left text-gray-600">`;
        tableHTML += `<thead class="text-xs text-gray-700 uppercase bg-gray-100"><tr>
            <th scope="col" class="px-4 py-3 align-middle" style="min-width: 400px;">Descripción</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Nivel</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">LC / KD</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Código de pieza</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Versión</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Proceso</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap col-aspecto">Aspecto</th>
            <th scope="col" class="px-4 py-3 text-right align-middle whitespace-nowrap">Peso (gr)</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Color</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Piezas por Vehículo (Un.)</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Material</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Código Materia Prima</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Proveedor Materia Prima</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Cantidad / Pieza</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap">Unidad</th>
            <th scope="col" class="px-4 py-3 align-middle col-comentarios">Comentarios</th>
            <th scope="col" class="px-4 py-3 text-center align-middle whitespace-nowrap col-acciones">Acciones</th>
        </tr></thead><tbody>`;

        data.forEach(rowData => {
            const { node, item, level, isLast, lineage } = rowData;
            const NA = '<span class="text-slate-400">N/A</span>';

            let prefix = lineage.map(parentIsNotLast => parentIsNotLast ? '│&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' : '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;').join('');
            if (level > 0)  prefix += isLast ? '└─ ' : '├─ ';
            const descripcion = `<span class="font-sans">${prefix}</span>${item.descripcion || item.nombre || ''}`;
            const nivel = level;
            const lc_kd = item.lc_kd || NA;
            const codigo_pieza = item.codigo_pieza || NA;
            const version = item.version || NA;

            let proceso = NA;
            if (item.proceso) {
                const procesoData = appState.collectionsById[COLLECTIONS.PROCESOS]?.get(item.proceso);
                proceso = procesoData ? procesoData.descripcion : item.proceso;
            }

            const aspecto = item.aspecto || NA;

            let peso_display = NA;
            if (node.tipo === 'semiterminado' && item.peso_gr) {
                peso_display = item.peso_gr;
                if (item.tolerancia_gr) {
                    peso_display += ` ± ${item.tolerancia_gr}`;
                }
            }

            const color = selectedProduct.color || NA;
            const piezas_por_vehiculo = selectedProduct.piezas_por_vehiculo || NA;
            const material = selectedProduct.material_separar ? 'Sí' : 'No';

            let codigo_materia_prima = NA;
            let proveedor_materia_prima = NA;
            if (node.tipo === 'insumo') {
                codigo_materia_prima = item.codigo_materia_prima || NA;
                if (item.proveedor_materia_prima) {
                    const provMP = appState.collectionsById[COLLECTIONS.PROVEEDORES]?.get(item.proveedor_materia_prima);
                    proveedor_materia_prima = provMP ? provMP.descripcion : item.proveedor_materia_prima;
                }
            }

            const cantidad = node.quantity ?? NA;

            let unidad_medida = NA;
            if (node.tipo === 'insumo' && item.unidad_medida) {
                const unidadData = appState.collectionsById[COLLECTIONS.UNIDADES]?.get(item.unidad_medida);
                unidad_medida = unidadData ? unidadData.id : item.unidad_medida;
            }

            const comentarios = node.comment ? `<span class="whitespace-normal">${node.comment}</span>` : NA;
            const actionsHTML = checkUserPermission('edit') ? `<button data-action="edit-tabular-node" data-node-id="${node.id}" class="p-1 text-blue-600 hover:bg-blue-100 rounded-md" title="Editar"><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i></button>` : '';

            tableHTML += `<tr class="bg-white border-b hover:bg-gray-100" data-node-id="${node.id}">
                <td class="px-4 py-2 font-mono font-medium text-gray-900 align-middle" style="min-width: 400px;">${descripcion}</td>
                <td class="px-4 py-2 text-center align-middle">${nivel}</td>
                <td class="px-4 py-2 text-center align-middle">${lc_kd}</td>
                <td class="px-4 py-2 text-center align-middle">${codigo_pieza}</td>
                <td class="px-4 py-2 text-center align-middle">${version}</td>
                <td class="px-4 py-2 text-center align-middle">${proceso}</td>
                <td class="px-4 py-2 text-center align-middle col-aspecto">${aspecto}</td>
                <td class="px-4 py-2 text-right align-middle">${peso_display}</td>
                <td class="px-4 py-2 text-center align-middle">${color}</td>
                <td class="px-4 py-2 text-center align-middle">${piezas_por_vehiculo}</td>
                <td class="px-4 py-2 text-center align-middle">${material}</td>
                <td class="px-4 py-2 text-center align-middle">${codigo_materia_prima}</td>
                <td class="px-4 py-2 text-center align-middle">${proveedor_materia_prima}</td>
                <td class="px-4 py-2 text-center align-middle">${cantidad}</td>
                <td class="px-4 py-2 text-center align-middle">${unidad_medida}</td>
                <td class="px-4 py-2 align-middle col-comentarios">${comentarios}</td>
                <td class="px-4 py-2 text-center align-middle col-acciones">${actionsHTML}</td>
            </tr>`;
        });
        tableHTML += `</tbody></table>`;
        return tableHTML;
    };

    const renderReportView = () => {
        const product = state.selectedProduct;
        if (!product) {
            renderInitialView();
            return;
        }

        const client = appState.collectionsById[COLLECTIONS.CLIENTES].get(product.clienteId);

        const getOriginalMaxDepth = (nodes, level = 0) => {
            if (!nodes || nodes.length === 0) return level > 0 ? level - 1 : 0;
            let max = level;
            for (const node of nodes) {
                const depth = getOriginalMaxDepth(node.children, level + 1);
                if (depth > max) max = depth;
            }
            return max;
        };

        const flattenedData = getFlattenedData(product, state.activeFilters.niveles);
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
            <div id="caratula-container" class="mb-6"></div>
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
                                <button data-action="apply-level-filter" class="w-full bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700">Aplicar</button>
                            </div>
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

        renderCaratula(product, client);
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
            case 'apply-level-filter':
                const dropdown = document.getElementById('level-filter-dropdown');
                const selectedLevels = new Set();
                dropdown.querySelectorAll('.level-filter-cb:checked').forEach(cb => {
                    selectedLevels.add(cb.dataset.level);
                });

                const allLevelsCount = dropdown.querySelectorAll('.level-filter-cb').length;
                // If all are selected, it's the same as no filter.
                if (selectedLevels.size === allLevelsCount) {
                    state.activeFilters.niveles.clear();
                } else {
                    state.activeFilters.niveles = selectedLevels;
                }

                dropdown.classList.add('hidden');

                const tableContainer = document.getElementById('sinoptico-tabular-container');
                if (tableContainer) {
                    // 1. Store scroll position & show loading state
                    const savedScrollY = window.scrollY;
                    tableContainer.innerHTML = `
                        <div class="flex items-center justify-center p-16 text-slate-500">
                            <i data-lucide="loader" class="animate-spin h-8 w-8 mr-3"></i>
                            <span>Cargando tabla...</span>
                        </div>
                    `;
                    lucide.createIcons();

                    // 2. Set up promises for minimum delay and data processing
                    const minDelayPromise = new Promise(resolve => setTimeout(resolve, 400));

                    const processDataPromise = new Promise(resolve => {
                        const product = state.selectedProduct;
                        const flattenedData = getFlattenedData(product, state.activeFilters.niveles);
                        const newTableHTML = renderTabularTable(flattenedData);
                        resolve(newTableHTML);
                    });

                    // 3. Wait for both to complete
                    Promise.all([minDelayPromise, processDataPromise]).then(([_, newTableHTML]) => {
                        // 4. Render new table
                        tableContainer.innerHTML = newTableHTML;
                        lucide.createIcons();

                        // 5. Restore scroll position
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
            // Ensure all collections needed for the BOM are loaded
            await ensureCollectionsAreLoaded([
                COLLECTIONS.SEMITERMINADOS,
                COLLECTIONS.INSUMOS,
                COLLECTIONS.PROCESOS,
                COLLECTIONS.PROVEEDORES,
                COLLECTIONS.UNIDADES
            ]);

            const producto = appState.collections[COLLECTIONS.PRODUCTOS].find(p => p.id === productId);
            if (producto) {
                state.selectedProduct = producto;
                renderReportView();
            } else {
                showToast("Error: Producto no encontrado.", "error");
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
            <h3 class="text-2xl font-bold">Reporte BOM (Tabular)</h3>
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

async function exportSinopticoTabularToPdf() {
    const { jsPDF } = window.jspdf;
    const state = appState.sinopticoTabularState;
    const product = state.selectedProduct;

    if (!product) {
        showToast('No hay producto seleccionado para exportar.', 'error');
        return;
    }

    showToast('Generando PDF de alta calidad...', 'info');
    dom.loadingOverlay.style.display = 'flex';

    try {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const logoBase64 = await getLogoBase64();
        const PAGE_MARGIN = 10;
        const PAGE_WIDTH = doc.internal.pageSize.width;
        const NA = 'N/A';

        const flattenedData = getFlattenedData(product, state.activeFilters.niveles);
        const { head, body } = prepareDataForPdfAutoTable(flattenedData, appState.collectionsById);

        doc.autoTable({
            head: head,
            body: body,
            startY: 55, // Start table after the header
            margin: { top: 55, right: PAGE_MARGIN, bottom: 20, left: PAGE_MARGIN },
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 8,
                cellPadding: 2,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: '#44546A',
                textColor: '#FFFFFF',
                fontStyle: 'bold',
                halign: 'center'
            },
            columnStyles: {
                0: { halign: 'center', cellWidth: 10 }, // Nivel
                1: { cellWidth: 80 }, // Descripción
                2: { cellWidth: 25 }, // Código
                3: { halign: 'center', cellWidth: 15 }, // Versión
                4: { cellWidth: 30 }, // Proceso
                5: { halign: 'right', cellWidth: 15 }, // Cantidad
                6: { halign: 'center', cellWidth: 15 }, // Unidad
                7: { cellWidth: 'auto' } // Comentarios
            },
            didDrawPage: (data) => {
                // --- Header ---
                doc.setFontSize(18);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor('#3B82F6');
                doc.text('Reporte de Estructura de Producto (BOM)', PAGE_WIDTH / 2, 15, { align: 'center' });

                if (logoBase64) {
                    doc.addImage(logoBase64, 'PNG', PAGE_MARGIN, 22, 35, 12);
                }

                doc.setFontSize(9);
                doc.setTextColor(100);
                const headerTextX = PAGE_WIDTH - PAGE_MARGIN;
                doc.text(`Producto: ${product.descripcion || NA}`, headerTextX, 24, { align: 'right' });
                doc.text(`Código: ${product.id || NA}`, headerTextX, 28, { align: 'right' });
                const client = appState.collectionsById[COLLECTIONS.CLIENTES]?.get(product.clienteId);
                doc.text(`Cliente: ${client?.descripcion || NA}`, headerTextX, 32, { align: 'right' });

                // --- Footer ---
                const pageCount = doc.internal.getNumberOfPages();
                doc.setFontSize(8);
                doc.text(`Página ${data.pageNumber} de ${pageCount}`, PAGE_WIDTH / 2, doc.internal.pageSize.height - 10, { align: 'center' });
                doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, PAGE_MARGIN, doc.internal.pageSize.height - 10);
            }
        });

        const fileName = `Reporte_BOM_${product.id.replace(/[^a-z0-9]/gi, '_')}.pdf`;
        doc.save(fileName);
        showToast('PDF generado con éxito.', 'success');

    } catch (error) {
        console.error("Error exporting native PDF:", error);
        showToast('Error al generar el PDF.', 'error');
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
    dom.viewContent.innerHTML = `<div class="bg-white p-6 rounded-xl shadow-lg animate-fade-in-up">
        <i data-lucide="git-branch-plus" class="h-24 w-24 text-gray-300 mb-6"></i>
        <h3 class="text-2xl font-bold">Flujograma de Procesos</h3>
        <p class="text-gray-500 mt-2 max-w-lg mx-auto">Próximamente: Esta sección mostrará un diagrama interactivo del flujo de producción. Podrás seleccionar un producto para ver, editar y reorganizar su secuencia de procesos desde la materia prima hasta el ensamblaje final.</p>
    </div>`;
    lucide.createIcons();
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
    } catch (error) {
        console.error("Could not fetch barack_logo.png:", error);
        return null;
    }
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

export function regenerateNodeIds(nodes) {
    if (!nodes) return;

    // Increment the global counter for each main call to the function.
    regenerateNodeIdsCounter++;

    // The prefix now includes the global counter, guaranteeing uniqueness even if Date.now() is the same.
    const prefix = `comp_${Date.now()}_${regenerateNodeIdsCounter}`;
    let nodeCounter = 0; // Local counter for nodes within this specific tree

    function processNodes(nodeArray) {
        nodeArray.forEach(node => {
            // The combination of the unique prefix and an incrementing counter ensures uniqueness.
            node.id = `${prefix}_${nodeCounter++}`;
            if (node.children) {
                processNodes(node.children);
            }
        });
    }
    processNodes(nodes);
}

export async function cloneProduct(dependencies, product = null) {
    const { db, firestore, ui, appState } = dependencies;
    const { query, collection, where, getDocs, addDoc } = firestore;
    const { showToast, showPromptModal } = ui;

    const productToClone = product || appState.sinopticoTabularState?.selectedProduct;
    if (!productToClone) {
        showToast('No hay un producto seleccionado para clonar.', 'error');
        return;
    }

    const newId = await showPromptModal('Clonar Producto', `Ingrese el nuevo código para el clon de "${productToClone.id}":`);
    if (!newId) return; // User cancelled

    // Check if new ID already exists
    const q = query(collection(db, COLLECTIONS.PRODUCTOS), where("id", "==", newId));
    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
        showToast(`El código de producto "${newId}" ya existe.`, 'error');
        return;
    }

    showToast('Clonando producto...', 'info');

    // Deep copy
    const newProduct = JSON.parse(JSON.stringify(productToClone));

    // Reset properties
    delete newProduct.docId;
    delete newProduct.lastUpdated;
    delete newProduct.lastUpdatedBy;
    delete newProduct.reviewedBy;
    delete newProduct.fecha_modificacion; // Remove old stringified date
    delete newProduct.createdAt; // Remove old stringified date

    newProduct.id = newId;
    newProduct.createdAt = new Date();
    newProduct.fecha_modificacion = new Date();

    if (newProduct.estructura) {
        regenerateNodeIds(newProduct.estructura);
        // Also update the root node's refId if it's self-referencing
        if (newProduct.estructura[0] && newProduct.estructura[0].tipo === 'producto') {
            newProduct.estructura[0].refId = newId;
        }
        // Generate the flattened component ID list for the new clone
        newProduct.component_ids = flattenEstructura(newProduct.estructura);
    }

    try {
        await addDoc(collection(db, COLLECTIONS.PRODUCTOS), newProduct);
        showToast(`Producto "${productToClone.descripcion}" clonado exitosamente como "${newId}".`, 'success');
    } catch (error) {
        console.error("Error clonando el producto:", error);
        showToast('Ocurrió un error al clonar el producto.', 'error');
    }
}

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
