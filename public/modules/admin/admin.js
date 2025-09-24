// This module contains functions for administrative purposes,
// such as database seeding and "God Mode" for role impersonation.

import { showToast } from '../shared/ui.js';
import { COLLECTIONS } from '../../utils.js';

let db;
let writeBatch;
let doc;
let getDocs;
let collection;
let setDoc;
let appState;
let updateNavForRole;
let renderUserMenu;
let switchView;
let lucide;

export function initAdminModule(dependencies) {
    db = dependencies.db;
    const firestore = dependencies.firestore;
    writeBatch = firestore.writeBatch;
    doc = firestore.doc;
    getDocs = firestore.getDocs;
    collection = firestore.collection;
    setDoc = firestore.setDoc;
    appState = dependencies.appState;
    updateNavForRole = dependencies.updateNavForRole;
    renderUserMenu = dependencies.renderUserMenu;
    switchView = dependencies.switchView;
    lucide = dependencies.lucide;
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

export function handleGodModeRoleChange(role) {
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

export async function clearDataOnly() {
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

export async function clearOtherUsers() {
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


export async function seedDatabase() {
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

    const imageUrls = [];

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
