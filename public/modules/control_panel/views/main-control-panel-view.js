import { appState, dom } from "../../../main.js";
import { getFirestore, collection, getDocs, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/9.15.0/firebase-functions.js";
import { showToast } from "../../shared/ui.js";
import { eventBus } from "../../../utils.js";


export async function renderMainControlPanelView(deps) {
    const { db } = deps;
    const functions = getFunctions();
    const getTaskSummaryWithAI = httpsCallable(functions, 'getTaskSummaryWithAI');
    const generateEcrWithAI = httpsCallable(functions, 'generateEcrWithAI');

    dom.viewContent.innerHTML = `
        <div class="p-8 bg-gray-50 min-h-screen animate-fade-in">
            <div class="max-w-7xl mx-auto">
                <div class="mb-8">
                    <h1 class="text-3xl font-bold text-gray-800">Centro de Control de Ingeniería</h1>
                    <p class="text-gray-500 mt-1">Una vista unificada para ECR, ECO y perspectivas de IA.</p>
                </div>

                <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <!-- Columna principal -->
                    <div class="lg:col-span-2 space-y-8">
                        <!-- Acciones Rápidas -->
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h2 class="text-xl font-bold text-gray-700 mb-4">Acciones Rápidas</h2>
                            <div id="quick-actions-content">
                                <p class="text-sm text-gray-600 mb-2">Describe el cambio que necesitas. La IA generará un borrador del ECR para que lo revises.</p>
                                <textarea id="ai-ecr-braindump" class="w-full p-2 border rounded-md" rows="4" placeholder="Ej: Necesitamos cambiar el proveedor del tornillo M5 del ensamblaje principal por uno de acero inoxidable para mejorar la resistencia a la corrosión..."></textarea>
                                <button id="generate-ecr-btn" class="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">Generar ECR con IA</button>
                            </div>
                        </div>

                        <!-- Tabla de Seguimiento Unificada -->
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h2 class="text-xl font-bold text-gray-700 mb-4">Seguimiento Unificado de Cambios</h2>
                            <div class="overflow-x-auto">
                                <table class="w-full text-sm text-left text-gray-500">
                                    <thead class="text-xs text-gray-700 uppercase bg-gray-50">
                                        <tr>
                                            <th scope="col" class="px-6 py-3">ID</th>
                                            <th scope="col" class="px-6 py-3">Tipo</th>
                                            <th scope="col" class="px-6 py-3">Descripción / Título</th>
                                            <th scope="col" class="px-6 py-3">Estado</th>
                                            <th scope="col" class="px-6 py-3">Progreso</th>
                                        </tr>
                                    </thead>
                                    <tbody id="unified-tracking-table">
                                        <!-- Las filas se insertarán aquí -->
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <!-- Columna lateral -->
                    <div class="space-y-8">
                        <!-- Perspectivas de IA -->
                        <div class="bg-white p-6 rounded-lg shadow-md">
                            <h2 class="text-xl font-bold text-gray-700 mb-4">Perspectivas de IA</h2>
                            <div id="ai-insights-content">
                                 <p class="text-sm text-gray-600 mb-2">Obtén un resumen de las tareas y cambios en curso.</p>
                                <input type="text" id="ai-summary-prompt" class="w-full p-2 border rounded-md" placeholder="Ej: ¿Cuáles son los mayores riesgos?">
                                <button id="get-ai-summary-btn" class="mt-2 bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700">Obtener Resumen</button>
                                <div id="ai-summary-result" class="mt-4 text-sm text-gray-700 bg-gray-100 p-4 rounded-md hidden"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    const generateEcrBtn = document.getElementById('generate-ecr-btn');
    const aiEcrBraindump = document.getElementById('ai-ecr-braindump');

    generateEcrBtn.addEventListener('click', async () => {
        const braindump = aiEcrBraindump.value;
        if (!braindump) {
            showToast("Por favor, describe el cambio que necesitas.", "error");
            return;
        }

        generateEcrBtn.disabled = true;
        generateEcrBtn.textContent = 'Generando...';

        try {
            const result = await generateEcrWithAI({ braindump });
            const ecrData = result.data.ecrData;
            eventBus.emit('navigate', { view: 'ecr_form', params: { ecrData, isNew: true } });
        } catch (error) {
            console.error("Error generating ECR with AI:", error);
            showToast("Error al generar el ECR con IA.", "error");
        } finally {
            generateEcrBtn.disabled = false;
            generateEcrBtn.textContent = 'Generar ECR con IA';
        }
    });

    const getAiSummaryBtn = document.getElementById('get-ai-summary-btn');
    const aiSummaryPrompt = document.getElementById('ai-summary-prompt');
    const aiSummaryResult = document.getElementById('ai-summary-result');

    getAiSummaryBtn.addEventListener('click', async () => {
        const prompt = aiSummaryPrompt.value;
        getAiSummaryBtn.disabled = true;
        getAiSummaryBtn.textContent = 'Pensando...';
        aiSummaryResult.classList.add('hidden');

        try {
            const ecrQuery = query(collection(db, "ecr_forms"), orderBy("lastModified", "desc"), limit(10));
            const ecoQuery = query(collection(db, "eco_forms"), orderBy("lastModified", "desc"), limit(10));

            const [ecrSnapshot, ecoSnapshot] = await Promise.all([getDocs(ecrQuery), getDocs(ecoQuery)]);

            const ecrs = ecrSnapshot.docs.map(doc => doc.data());
            const ecos = ecoSnapshot.docs.map(doc => doc.data());

            const context = { ecrs, ecos };
            const result = await getTaskSummaryWithAI({ prompt, context });

            aiSummaryResult.textContent = result.data.summary;
            aiSummaryResult.classList.remove('hidden');

        } catch (error) {
            console.error("Error getting AI summary:", error);
            showToast("Error al obtener el resumen de la IA.", "error");
        } finally {
            getAiSummaryBtn.disabled = false;
            getAiSummaryBtn.textContent = 'Obtener Resumen';
        }
    });

    // Cargar y mostrar los datos de la tabla
    loadAndRenderUnifiedTable(db);
}

async function loadAndRenderUnifiedTable(db) {
    const tableBody = document.getElementById('unified-tracking-table');
    tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-8">Cargando datos...</td></tr>';

    try {
        const ecrQuery = query(collection(db, "ecr_forms"), orderBy("lastModified", "desc"), limit(10));
        const ecoQuery = query(collection(db, "eco_forms"), orderBy("lastModified", "desc"), limit(10));

        const [ecrSnapshot, ecoSnapshot] = await Promise.all([getDocs(ecrQuery), getDocs(ecoQuery)]);

        const ecrs = ecrSnapshot.docs.map(doc => ({ ...doc.data(), type: 'ECR', docId: doc.id }));
        const ecos = ecoSnapshot.docs.map(doc => ({ ...doc.data(), type: 'ECO', docId: doc.id }));

        const combinedData = [...ecrs, ...ecos].sort((a, b) => {
            const dateA = a.lastModified?.toDate ? a.lastModified.toDate() : new Date(0);
            const dateB = b.lastModified?.toDate ? b.lastModified.toDate() : new Date(0);
            return dateB - dateA;
        });

        if (combinedData.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-8">No se encontraron ECRs ni ECOs.</td></tr>';
            return;
        }

        tableBody.innerHTML = combinedData.map(item => {
            const id = item.id || item.ecr_no;
            const description = item.denominacion_producto || item.titulo_eco || 'N/A';
            const status = item.status || 'N/A';

            let progress = 0;
            if (item.type === 'ECO' && item.action_plan) {
                const totalTasks = item.action_plan.length;
                const completedTasks = item.action_plan.filter(task => task.completed).length;
                progress = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
            }

            return `
                <tr class="bg-white border-b hover:bg-gray-50">
                    <td class="px-6 py-4 font-medium text-gray-900 whitespace-nowrap">${id}</td>
                    <td class="px-6 py-4">${item.type}</td>
                    <td class="px-6 py-4">${description}</td>
                    <td class="px-6 py-4">${status}</td>
                    <td class="px-6 py-4">
                        ${item.type === 'ECO' ? `
                            <div class="w-full bg-gray-200 rounded-full h-2.5">
                                <div class="bg-blue-600 h-2.5 rounded-full" style="width: ${progress}%"></div>
                            </div>
                        ` : 'N/A'}
                    </td>
                </tr>
            `;
        }).join('');

    } catch (error) {
        console.error("Error loading unified tracking table:", error);
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center p-8 text-red-500">Error al cargar los datos.</td></tr>';
    }
}
