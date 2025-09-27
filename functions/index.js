const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { getStorage } = require("firebase-admin/storage");

// v2 Function Imports
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");

// v1 for logging (optional, can be replaced with console.log)
const functions = require("firebase-functions");

const { VertexAI } = require("@google-cloud/vertexai");
const cors = require('cors')({origin: true});
const axios = require("axios");
const nodemailer = require('nodemailer');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

// Set global options for all functions if needed, e.g., region.
setGlobalOptions({ region: "us-central1" });

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// --- Refactored Functions using v2 API ---

exports.getNextEcrNumber = onCall((request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
  }
  const db = getFirestore();
  const counterRef = db.collection("counters").doc("ecr_counter");
  try {
    const newEcrNumber = db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const currentYear = new Date().getFullYear();
      let nextNumber = 1;
      if (counterSnap.exists) {
        const counterData = counterSnap.data();
        if (counterData.year === currentYear) {
          nextNumber = (counterData.count || 0) + 1;
        }
      }
      transaction.set(counterRef, {count: nextNumber, year: currentYear}, {merge: true});
      return `ECR-${currentYear}-${String(nextNumber).padStart(3, "0")}`;
    });
    return {ecrNumber: newEcrNumber};
  } catch (error) {
    functions.logger.error("Error generating ECR number:", error);
    throw new HttpsError("internal", "An error occurred while generating the ECR number.");
  }
});

exports.saveFormWithValidation = onRequest({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] }, (req, res) => {
  cors(req, res, async () => {
    try {
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({ error: { status: 'UNAUTHENTICATED', message: 'The function must be called while authenticated.' } });
      }
      const decodedToken = await getAuth().verifyIdToken(idToken);
      const userEmail = decodedToken.email || 'Unknown';
      const { formType, formData } = req.body.data;
      if (!formType || !formData) {
        return res.status(400).json({ error: { status: 'INVALID_ARGUMENT', message: 'The function must be called with "formType" and "formData" arguments.' } });
      }
      // ... (rest of the validation logic remains the same)
      const db = getFirestore();
      const collectionName = formType === 'ecr' ? 'ecr_forms' : 'eco_forms';
      const docId = formData.id;
      if (!docId) {
        return res.status(400).json({ error: { status: 'INVALID_ARGUMENT', message: 'The document ID is missing from the form data.' }});
      }
      const docRef = db.collection(collectionName).doc(docId);
      const historyRef = docRef.collection('history');
      const dataToSave = { ...formData, lastModified: new Date(), modifiedBy: userEmail, serverValidated: true };
      const docSnap = await docRef.get();
      const oldData = docSnap.exists ? docSnap.data() : null;
      const batch = db.batch();
      batch.set(docRef, dataToSave, { merge: true });
      const historyDocRef = historyRef.doc();
      batch.set(historyDocRef, dataToSave);
      await batch.commit();

      const newStatus = dataToSave.status;
      const oldStatus = oldData ? oldData.status : null;
      if (newStatus && newStatus !== oldStatus) {
        const creatorUid = dataToSave.creatorUid;
        if (creatorUid) {
          try {
            const userRecord = await getAuth().getUser(creatorUid);
            const email = userRecord.email;
            if (email) {
              const mailOptions = {
                from: `"Gestión PRO" <${process.env.EMAIL_USER}>`,
                to: email,
                subject: `Actualización de Estado: ${formType.toUpperCase()} ${docId}`,
                html: `<p>Hola,</p><p>El estado de tu <strong>${formType.toUpperCase()} ${docId}</strong> ha cambiado de <strong>${oldStatus || 'N/A'}</strong> a <strong>${newStatus}</strong>.</p><p>Puedes ver los detalles en la aplicación.</p><p>Saludos,<br>El equipo de Gestión PRO</p>`
              };
              await transporter.sendMail(mailOptions);
            }
          } catch (error) {
            functions.logger.error(`Failed to send email for ${formType.toUpperCase()} ${docId}:`, error);
          }
        }
      }
      return res.status(200).json({ data: { success: true, message: `${formType.toUpperCase()} guardado con éxito.` } });
    } catch (error) {
      functions.logger.error(`Error in saveFormWithValidation for ${req.body?.data?.formType}:`, error);
      if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        return res.status(401).json({ error: { status: 'UNAUTHENTICATED', message: 'Authentication token is invalid or expired.' } });
      }
      return res.status(500).json({ error: { status: 'INTERNAL', message: 'An internal error occurred while saving the form.' } });
    }
  });
});

exports.sendTaskAssignmentEmail = onDocumentCreated({
    document: 'tareas/{taskId}',
    secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"],
}, async (event) => {
    const snap = event.data;
    if (!snap) {
        functions.logger.log("No data associated with the event");
        return;
    }
    const task = snap.data();
    const assigneeUid = task.assigneeUid;

    if (!assigneeUid) {
      functions.logger.log(`Task ${event.params.taskId} created without an assignee.`);
      return;
    }

    try {
      const userRecord = await getAuth().getUser(assigneeUid);
      const email = userRecord.email;
      if (email) {
        const mailOptions = {
          from: `"Gestión PRO" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: `Nueva Tarea Asignada: ${task.title}`,
          html: `<p>Hola,</p><p>Se te ha asignado una nueva tarea: <strong>${task.title}</strong>.</p><p><strong>Descripción:</strong> ${task.description || 'N/A'}</p><p><strong>Fecha de Vencimiento:</strong> ${task.dueDate || 'N/A'}</p><p>Puedes ver los detalles en la aplicación.</p><p>Saludos,<br>El equipo de Gestión PRO</p>`
        };
        await transporter.sendMail(mailOptions);
        functions.logger.log(`Assignment email sent to ${email} for task ${event.params.taskId}.`);
      }
    } catch (error) {
      functions.logger.error(`Failed to send assignment email for task ${event.params.taskId}:`, error);
    }
});

exports.organizeTaskWithAI = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { text } = request.data;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new HttpsError("invalid-argument", "The function must be called with a non-empty 'text' argument.");
    }
    // ... (rest of the AI logic remains the same)
    try {
        const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
        const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const currentDate = new Date().toISOString().split("T")[0];
        const prompt = `
        Analiza el siguiente texto de un usuario. Tu objetivo es identificar si el texto describe una o varias tareas gestionables.

        **Contexto Clave:** La fecha de hoy es ${currentDate}. Todas las fechas relativas (como "mañana" o "próxima semana") deben calcularse a partir de esta fecha.

        Texto del usuario: "${text}"

        **Instrucciones Estrictas:**
        1.  **Detección de Tareas:** Identifica si el texto representa una única acción o múltiples acciones distintas. Si son distintas (ej: "revisar planos y llamar a proveedor"), crea un objeto de tarea para cada una. Si es una acción con pasos, trátalo como una sola tarea con subtareas.
        2.  **Estructura de Tarea (JSON):** Para cada tarea, genera un objeto JSON con estos campos EXACTOS:
            *   \`title\`: Título conciso (máx 10 palabras).
            *   \`description\`: Resumen corto del objetivo.
            *   \`subtasks\`: Array de strings con subtareas accionables. Si no hay, \`[]\`.
            *   \`tags\`: Array de strings con palabras clave relevantes (1-3 palabras por tag). Si no hay, \`[]\`.
            *   \`priority\`: 'high', 'medium', o 'low'.
            *   \`startDate\`: 'YYYY-MM-DD' o \`null\`.
            *   \`dueDate\`: 'YYYY-MM-DD' o \`null\`.
            *   \`assignee\`: Nombre de la persona o \`null\`.
            *   \`isPublic\`: \`true\` (equipo/proyecto) o \`false\` (personal).
            *   \`project\`: Nombre del proyecto o \`null\`.
        3.  **Generación de Tags:** Analiza el texto para extraer conceptos, tecnologías, nombres de proyectos o temas clave. Conviértelos en tags cortos, en minúsculas y sin caracteres especiales. Por ejemplo, "Arreglar bug en login de app Android" podría generar tags como ["bugfix", "login", "android"].
        4.  **Corrección de Texto:** Corrige la gramática y ortografía en \`title\` y \`description\` para mayor claridad.

        **Formato de Salida - REGLA CRÍTICA:**
        Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON. Este objeto debe contener una clave "tasks", cuyo valor es un array de los objetos de tarea que creaste.
        NO incluyas absolutamente NADA más en tu respuesta. Ni texto introductorio, ni explicaciones, ni bloques de código markdown (como \`\`\`json).
        La respuesta debe empezar con \`{\` y terminar con \`}\`.

        **Ejemplo de respuesta VÁLIDA:**
        {"tasks":[{"title":"Revisar planos del chasis","description":"Revisar los planos detallados del nuevo chasis para el modelo 2024.","subtasks":[],"tags":["diseño","chasis","planos","2024"],"priority":"high","startDate":null,"dueDate":null,"assignee":null,"isPublic":true,"project":"Chasis-2024"},{"title":"Llamar a proveedor de acero","description":"Llamar al proveedor para confirmar la fecha de entrega del acero.","subtasks":[],"tags":["proveedores","acero","logística"],"priority":"medium","startDate":null,"dueDate":null,"assignee":"Marcos","isPublic":true,"project":"Chasis-2024"}]}

        **Ejemplo de respuesta INVÁLIDA:**
        \`\`\`json
        {"tasks": [...]}
        \`\`\`
      `;
        const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates[0].content.parts[0].text;
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        if (!jsonMatch) {
            throw new Error("No se encontró un bloque JSON válido en la respuesta de la IA.");
        }
        const parsedData = JSON.parse(jsonMatch[0]);
        if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.tasks)) {
            throw new Error("La respuesta de la IA no es un JSON válido o no contiene un array de tareas.");
        }
        parsedData.tasks.forEach(task => { if (!Array.isArray(task.tags)) { task.tags = []; } });
        return parsedData;
    } catch (error) {
        functions.logger.error("Error in organizeTaskWithAI with Vertex AI:", error);
        throw new HttpsError("internal", `Vertex AI Full Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    }
});

exports.analyzeWeeklyTasks = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { tasks, weekOffset } = request.data;
    if (!tasks || !Array.isArray(tasks)) {
        throw new HttpsError("invalid-argument", "The function must be called with a 'tasks' (array) argument.");
    }
    try {
        const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
        const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const user = await getAuth().getUser(request.auth.uid);
        const userName = user.displayName || user.email;

        const today = new Date();
        const dayOfWeek = today.getUTCDay();

        let effectiveOffset = weekOffset || 0;
        if ((dayOfWeek === 6 || dayOfWeek === 0) && effectiveOffset === 0) {
            effectiveOffset = 1;
        }

        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + (effectiveOffset * 7));

        const targetDayOfWeek = targetDate.getDay();
        const diffToMonday = targetDayOfWeek === 0 ? -6 : 1 - targetDayOfWeek;
        const monday = new Date(targetDate);
        monday.setDate(targetDate.getDate() + diffToMonday);

        const weekDates = Array.from({ length: 5 }).map((_, i) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            return date.toISOString().split('T')[0];
        });

        const planningHorizonEndDate = new Date(weekDates[4]);
        planningHorizonEndDate.setDate(planningHorizonEndDate.getDate() + 14);


        const tasksForPrompt = tasks.map(t => ({
            taskId: t.docId,
            title: t.title,
            priority: t.priority,
            dueDate: t.dueDate,
            description: t.description ? t.description.substring(0, 100) : undefined,
            creatorUid: t.creatorUid,
        }));

        const prompt = `
        Actúa como un Asistente de Productividad experto y estratégico para ${userName}. Tu misión es analizar una lista de tareas y proponer un plan de trabajo realista y optimizado para la semana, junto con un análisis inteligente.

        **Contexto Clave:**
        - La fecha de hoy es: ${new Date().toISOString().split('T')[0]}.
        - La semana a planificar es del ${weekDates[0]} al ${weekDates[4]}.
        - La fecha de vencimiento original (\`dueDate\`) es la fecha LÍMITE y no debe ser modificada.
        - Tu tarea es proponer una fecha de EJECUCIÓN (\`plannedDate\`) para cada tarea relevante.

        **Regla de Planificación Principal:** Solo debes incluir en el plan las siguientes tareas:
            1.  Tareas que ya están vencidas (su \`dueDate\` es anterior a hoy).
            2.  Tareas sin fecha de vencimiento (\`dueDate\` es nulo).
            3.  Tareas cuya fecha de vencimiento sea anterior al ${planningHorizonEndDate.toISOString().split('T')[0]}.
        - **Ignora el resto:** Las tareas con fecha de vencimiento posterior a la del horizonte de planificación deben ser ignoradas y NO incluidas en el plan JSON.

        **Tareas para Analizar (formato JSON):**
        \`\`\`json
        ${JSON.stringify(tasksForPrompt, null, 2)}
        \`\`\`

        **Tu Tarea (Respuesta en 2 Partes Estrictas):**

        **PARTE 1: El Plan (JSON)**
        1.  **Filtra y Distribuye:** De la lista de tareas, selecciona solo las que cumplen la "Regla de Planificación Principal". Asigna a cada una una fecha de ejecución sugerida (\`plannedDate\`) dentro de la semana de planificación (${weekDates[0]} a ${weekDates[4]}).
        2.  **Prioriza Inteligentemente (usando \`dueDate\` como referencia):**
            - **Lunes/Martes (Máxima Urgencia):** Asigna aquí las tareas vencidas y las de prioridad 'high' que vencen esta semana.
            - **Miércoles/Jueves (Foco Principal):** Asigna las tareas de prioridad 'medium' y las importantes sin fecha.
            - **Viernes (Cierre de Semana):** Asigna tareas de prioridad 'low' o menos urgentes.
        3.  **Equilibrio de Carga:** No sobrecargues un solo día. Distribuye el trabajo de manera lógica.
        4.  **Formato de Salida JSON:** Genera un objeto JSON con una única clave "plan". El valor debe ser un array de objetos, cada uno con la forma: \`{ "taskId": "ID_DE_LA_TAREA", "plannedDate": "YYYY-MM-DD" }\`. Si ninguna tarea cumple los criterios, devuelve un array vacío: \`{ "plan": [] }\`.

        **PARTE 2: El Análisis (Markdown)**
        1.  **Separador:** Después del bloque JSON, inserta este separador exacto en su propia línea: \`---JSON_PLAN_SEPARATOR---\`
        2.  **Análisis Detallado:** Debajo del separador, escribe un análisis en formato Markdown con las siguientes secciones:
            *   \`### 💡 Estrategia de Planificación\`: Explica brevemente tu lógica (ej: "He planificado las tareas vencidas para el lunes para que puedas resolverlas antes de su fecha límite...").
            *   \`### 🎯 Foco de la Semana\`: Lista 2-3 tareas del plan que consideras más críticas.
            *   \`### ⚠️ Puntos de Atención\`: Menciona cualquier riesgo, como tareas cuya fecha de ejecución planeada está muy cerca de su fecha límite.
            *   \`### 🗓️ Tareas a Futuro\`: Si ignoraste tareas porque su vencimiento es lejano, menciónalas brevemente aquí para que el usuario no las olvide.

        **Formato Final de Respuesta (Regla Inquebrantable):**
        Tu respuesta DEBE ser el bloque JSON, seguido del separador, y luego el análisis en Markdown. No incluyas texto introductorio, ni explicaciones adicionales, ni bloques de código markdown (\`\`\`json\`). La respuesta debe empezar con \`{\` y terminar con el texto del análisis.
        `;
        const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        let responseText = result.response.candidates[0].content.parts[0].text;
        responseText = responseText.replace(/^```json\s*/, '').replace(/```\s*$/, '');
        const separator = '---JSON_PLAN_SEPARATOR---';
        const parts = responseText.split(separator);
        if (parts.length < 2) {
            throw new Error("La respuesta de la IA no contiene el separador requerido.");
        }
        const jsonPart = parts[0].trim();
        const analysisPart = parts[1].trim();
        const planData = JSON.parse(jsonPart);
        if (!planData || !Array.isArray(planData.plan)) {
             throw new Error("La parte JSON de la respuesta de la IA no es válida.");
        }
        return { plan: planData.plan, analysis: analysisPart };
    } catch (error) {
        functions.logger.error("Error en analyzeWeeklyTasks con Vertex AI:", error);
        throw new HttpsError("internal", `Ocurrió un error al analizar las tareas con IA. Error: ${error.message}`);
    }
});

exports.getTaskSummaryWithAI = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { tasks, question } = request.data;
    if (!tasks || !Array.isArray(tasks) || !question) {
        throw new HttpsError("invalid-argument", "The function must be called with 'tasks' (array) and 'question' (string) arguments.");
    }
    const questionMap = {
        summary: "Genera un resumen conciso del estado general de las tareas. Indica cuántas hay en cada estado (Por Hacer, En Progreso, Completadas) y cualquier observación general.",
        urgent: "Identifica las 3 tareas más urgentes. Basa tu criterio en la combinación de su fecha de vencimiento (dueDate) y su prioridad (priority). Menciona por qué cada una es urgente.",
        at_risk: "Analiza las tareas y detecta cuáles están en riesgo de no completarse a tiempo. Considera tareas con alta prioridad y fechas de vencimiento cercanas que no estén 'En Progreso', o tareas que lleven mucho tiempo sin actualizarse.",
        blocked: "Revisa los títulos, descripciones y comentarios de las tareas para identificar si alguna está bloqueada. Busca frases como 'bloqueado por', 'esperando a', 'no puedo continuar hasta', etc. Si no encuentras ninguna, indícalo explícitamente."
    };
    const fullQuestion = questionMap[question];
    if (!fullQuestion) {
        throw new HttpsError("invalid-argument", "The 'question' provided is not a valid one.");
    }
    try {
        const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
        const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const tasksForPrompt = tasks.map(t => ({
            title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate,
            description: t.description ? t.description.substring(0, 100) : undefined
        }));
        const prompt = `
        Eres un asistente de gestión de proyectos experto y muy conciso. Tu tarea es analizar una lista de tareas en formato JSON y responder a una pregunta específica sobre ellas.
        **Contexto:**
        - Hoy es ${new Date().toLocaleDateString('es-AR')}.
        - Las tareas se encuentran en el siguiente arreglo JSON:
        \`\`\`json
        ${JSON.stringify(tasksForPrompt, null, 2)}
        \`\`\`
        **Pregunta del usuario:** "${fullQuestion}"
        **Instrucciones de formato para tu respuesta:**
        - Responde en español. - Usa un lenguaje claro y directo. - Utiliza viñetas (markdown) para listar los puntos clave.
        - Si una tarea es relevante, menciónala usando **negrita** para el título.
        - Tu respuesta debe ser solo el texto del análisis, sin saludos ni despedidas. No envuelvas tu respuesta en JSON o markdown.
      `;
        const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates[0].content.parts[0].text;
        return { summary: responseText };
    } catch (error) {
        functions.logger.error("Error en getTaskSummaryWithAI con Vertex AI:", error);
        throw new HttpsError("internal", `Vertex AI Full Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    }
});

exports.enviarRecordatoriosDeVencimiento = onSchedule({
    schedule: "every day 09:00",
    timeZone: "America/Argentina/Buenos_Aires",
    secrets: ["TELEGRAM_TOKEN"],
}, async (event) => {
    functions.logger.log("Ejecutando la revisión de recordatorios de vencimiento de tareas.");
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) {
        functions.logger.error("El token de Telegram no está configurado.");
        return;
    }
    const db = getFirestore();
    const tasksRef = db.collection("tareas");
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    try {
        const snapshot = await tasksRef.where("status", "!=", "done").where("dueDate", "==", tomorrowStr).get();
        if (snapshot.empty) {
            functions.logger.log("No se encontraron tareas que venzan mañana.");
            return;
        }
        for (const doc of snapshot.docs) {
            const task = doc.data();
            const assigneeUid = task.assigneeUid;
            if (!assigneeUid) continue;
            const userDoc = await db.collection('usuarios').doc(assigneeUid).get();
            if (!userDoc.exists) continue;
            const userData = userDoc.data();
            const telegramChatId = userData.telegramChatId;
            const notificationPrefs = userData.telegramNotifications || {};
            if (telegramChatId && notificationPrefs.onDueDateReminder !== false) {
                const mensaje = `🔔 *Recordatorio de Vencimiento* 🔔\n\nLa tarea "*${task.title}*" vence mañana, ${task.dueDate}.`;
                const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
                try {
                    await axios.post(url, { chat_id: telegramChatId, text: mensaje, parse_mode: "Markdown" });
                } catch (error) {
                    functions.logger.error(`Error al enviar mensaje de Telegram al usuario ${assigneeUid}:`, error.response ? error.response.data : error.message);
                }
            }
        }
    } catch (error) {
        functions.logger.error("Error al procesar los recordatorios de vencimiento de tareas:", error);
    }
});

exports.sendTaskNotification = onDocumentWritten({
    document: 'tareas/{taskId}',
    secrets: ["TELEGRAM_TOKEN"],
}, async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!afterData) {
      functions.logger.log(`Task ${event.params.taskId} deleted. No notification sent.`);
      return;
    }

    let message = null;
    let targetUid = null;
    const wasJustCreated = !beforeData && afterData;
    const statusChanged = beforeData && afterData.status !== beforeData.status;

    if (wasJustCreated && afterData.assigneeUid) {
        targetUid = afterData.assigneeUid;
        const creator = await getAuth().getUser(afterData.creatorUid);
        message = `🔔 *Nueva Tarea Asignada*\n\n*Tarea:* ${afterData.title}\n*Asignada por:* ${creator.displayName || creator.email}`;
    } else if (statusChanged && afterData.creatorUid) {
        targetUid = afterData.creatorUid;
        const assignee = afterData.assigneeUid ? await getAuth().getUser(afterData.assigneeUid) : null;
        const assigneeName = assignee ? (assignee.displayName || assignee.email) : 'Nadie';
        message = `✅ *Actualización de Tarea*\n\nLa tarea *${afterData.title}* que creaste ha cambiado su estado a *${afterData.status}* por ${assigneeName}.`;
    }

    if (!message || !targetUid) {
      return;
    }

    try {
      const userDoc = await getFirestore().collection('usuarios').doc(targetUid).get();
      if (!userDoc.exists) return;
      const userData = userDoc.data();
      const telegramChatId = userData.telegramChatId;
      if (!telegramChatId) return;
      const notificationPrefs = userData.telegramNotifications || {};
      if ((wasJustCreated && notificationPrefs.onAssignment === false) || (statusChanged && notificationPrefs.onStatusChange === false)) {
          return;
      }
      const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
      await axios.post(url, { chat_id: telegramChatId, text: message, parse_mode: 'Markdown' });
    } catch (error) {
      functions.logger.error(`Failed to send Telegram notification for task ${event.params.taskId}:`, error);
    }
});

exports.sendTestTelegramMessage = onCall({ secrets: ["TELEGRAM_TOKEN"] }, async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const uid = request.auth.uid;
    try {
        const userDoc = await getFirestore().collection("usuarios").doc(uid).get();
        if (!userDoc.exists) throw new HttpsError("not-found", "User document not found.");
        const telegramChatId = userDoc.data().telegramChatId;
        if (!telegramChatId) throw new HttpsError("failed-precondition", "El Chat ID de Telegram no está configurado.");
        const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        const message = "¡Hola! 👋 Esta es una prueba de notificación de Telegram desde Gestión PRO. ¡La configuración funciona!";
        await axios.post(url, { chat_id: telegramChatId, text: message, parse_mode: "Markdown" });
        return { success: true, message: "Mensaje de prueba enviado con éxito." };
    } catch (error) {
        functions.logger.error(`Error sending test message to user ${uid}:`, error);
        if (error instanceof HttpsError) { throw error; }
        throw new HttpsError("internal", "Ocurrió un error inesperado.");
    }
});

exports.updateCollectionCounts = onDocumentWritten("productos/{docId}", async (event) => {
    const db = getFirestore();
    const count = (await db.collection('productos').count().get()).data().count;
    return db.collection('counters').doc('kpi_counts').set({ productos: count }, { merge: true });
});
// Repeat for 'insumos', 'proyectos', 'tareas'

exports.listModels = onCall(async (request) => {
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: '/' });
    const glbFiles = files.filter((file) => file.name.endsWith(".glb"));
    const signedUrls = await Promise.all(
      glbFiles.map(async (file) => {
        const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + 1000 * 60 * 60 * 2 });
        return { name: file.name.replace(".glb", ""), url: url };
      })
    );
    return { models: signedUrls };
});

exports.enviarRecordatoriosDiarios = onSchedule({
    schedule: "every day 09:00",
    timeZone: "America/Argentina/Buenos_Aires"
}, async (event) => {
    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) return;
    const db = getFirestore();
    const recordatoriosRef = db.collection("recordatorios");
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1);
    try {
        const snapshot = await recordatoriosRef.where("fechaVencimiento", ">=", hoy).where("fechaVencimiento", "<", manana).get();
        if (snapshot.empty) return;
        for (const doc of snapshot.docs) {
            const recordatorio = doc.data();
            const mensaje = `🔔 ¡Recordatorio! Hoy vence: ${recordatorio.descripcion}`;
            const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
            await axios.post(url, { chat_id: TELEGRAM_CHAT_ID, text: mensaje });
        }
    } catch (error) {
        functions.logger.error("Error al procesar recordatorios:", error);
    }
});