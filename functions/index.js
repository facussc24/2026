const functions = require("firebase-functions");
const admin = require("firebase-admin");
const {VertexAI} = require("@google-cloud/vertexai");
const cors = require('cors')({origin: true});
const axios = require("axios");
const nodemailer = require('nodemailer');

if (admin.apps.length === 0) {
    admin.initializeApp();
}

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

exports.getNextEcrNumber = functions.https.onCall(async (data, context) => {
  // Ensure the user is authenticated.
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated.",
    );
  }

  const db = admin.firestore();
  const counterRef = db.collection("counters").doc("ecr_counter");

  try {
    const newEcrNumber = await db.runTransaction(async (transaction) => {
      const counterSnap = await transaction.get(counterRef);
      const currentYear = new Date().getFullYear();
      let nextNumber = 1;

      if (counterSnap.exists) {
        const counterData = counterSnap.data();
        if (counterData.year === currentYear) {
          nextNumber = (counterData.count || 0) + 1;
        }
      }

      transaction.set(
          counterRef,
          {count: nextNumber, year: currentYear},
          {merge: true},
      );

      return `ECR-${currentYear}-${String(nextNumber).padStart(3, "0")}`;
    });

    return {ecrNumber: newEcrNumber};
  } catch (error) {
    console.error("Error generating ECR number:", error);
    throw new functions.https.HttpsError(
        "internal",
        "An error occurred while generating the ECR number.",
    );
  }
});

// CORRECTED SYNTAX
exports.saveFormWithValidation = functions.runWith({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] })
  .https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({ error: { status: 'UNAUTHENTICATED', message: 'The function must be called while authenticated.' } });
      }
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userEmail = decodedToken.email || 'Unknown';
      const { formType, formData } = req.body.data;
      if (!formType || !formData) {
        return res.status(400).json({ error: { status: 'INVALID_ARGUMENT', message: 'The function must be called with "formType" and "formData" arguments.' } });
      }
      // ... Validation logic ...
      const db = admin.firestore();
      const collectionName = formType === 'ecr' ? 'ecr_forms' : 'eco_forms';
      const docId = formData.id;
      if (!docId) {
        return res.status(400).json({ error: { status: 'INVALID_ARGUMENT', message: 'The document ID is missing from the form data.' } });
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
            const userRecord = await admin.auth().getUser(creatorUid);
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
            console.error(`Failed to send email for ${formType.toUpperCase()} ${docId}:`, error);
          }
        }
      }
      return res.status(200).json({ data: { success: true, message: `${formType.toUpperCase()} guardado con éxito.` } });
    } catch (error) {
      console.error(`Error in saveFormWithValidation for ${req.body?.data?.formType}:`, error);
      if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        return res.status(401).json({ error: { status: 'UNAUTHENTICATED', message: 'Authentication token is invalid or expired.' } });
      }
      return res.status(500).json({ error: { status: 'INTERNAL', message: `An internal error occurred while saving the form.` } });
    }
  });
});

// CORRECTED SYNTAX
exports.sendTaskAssignmentEmail = functions.runWith({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] })
  .firestore.document('tareas/{taskId}')
  .onCreate(async (snap, context) => {
    const task = snap.data();
    const assigneeUid = task.assigneeUid;
    if (!assigneeUid) {
      console.log(`Task ${context.params.taskId} created without an assignee.`);
      return null;
    }
    try {
      const userRecord = await admin.auth().getUser(assigneeUid);
      const email = userRecord.email;
      if (email) {
        const mailOptions = {
          from: `"Gestión PRO" <${process.env.EMAIL_USER}>`,
          to: email,
          subject: `Nueva Tarea Asignada: ${task.title}`,
          html: `<p>Hola,</p><p>Se te ha asignado una nueva tarea: <strong>${task.title}</strong>.</p><p><strong>Descripción:</strong> ${task.description || 'N/A'}</p><p><strong>Fecha de Vencimiento:</strong> ${task.dueDate || 'N/A'}</p><p>Puedes ver los detalles en la aplicación.</p><p>Saludos,<br>El equipo de Gestión PRO</p>`
        };
        await transporter.sendMail(mailOptions);
      }
      return null;
    } catch (error) {
      console.error(`Failed to send assignment email for task ${context.params.taskId}:`, error);
      return null;
    }
  });

exports.organizeTaskWithAI = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { text } = data;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a non-empty 'text' argument.");
    }
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
        3.  **Generación de Tags:** Analiza el texto para extraer conceptos, tecnologías, nombres de proyectos o temas clave. Conviértelos en tags cortos, en minúsculas y sin caracteres especiales.
        4.  **Corrección de Texto:** Corrige la gramática y ortografía en \`title\` y \`description\` para mayor claridad.
        **Formato de Salida - REGLA CRÍTICA:**
        Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON. Este objeto debe contener una clave "tasks", cuyo valor es un array de los objetos de tarea que creaste.
        NO incluyas absolutamente NADA más en tu respuesta.
        La respuesta debe empezar con \`{\` y terminar con \`}\`.
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
        console.error("Error en organizeTaskWithAI con Vertex AI:", error);
        throw new functions.https.HttpsError("internal", `Vertex AI Full Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`);
    }
});

exports.analyzeWeeklyTasks = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { tasks, weekOffset } = data;
    if (!tasks || !Array.isArray(tasks)) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a 'tasks' (array) argument.");
    }
    try {
        const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
        const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });
        const user = await admin.auth().getUser(context.auth.uid);
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
            taskId: t.docId, title: t.title, priority: t.priority, dueDate: t.dueDate,
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
            1. Tareas que ya están vencidas (su \`dueDate\` es anterior a hoy).
            2. Tareas sin fecha de vencimiento (\`dueDate\` es nulo).
            3. Tareas cuya fecha de vencimiento sea anterior al ${planningHorizonEndDate.toISOString().split('T')[0]}.
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
            *   \`### 💡 Estrategia de Planificación\`: Explica brevemente tu lógica.
            *   \`### 🎯 Foco de la Semana\`: Lista 2-3 tareas del plan que consideras más críticas.
            *   \`### ⚠️ Puntos de Atención\`: Menciona cualquier riesgo.
            *   \`### 🗓️ Tareas a Futuro\`: Si ignoraste tareas, menciónalas aquí.
        **Formato Final de Respuesta (Regla Inquebrantable):**
        Tu respuesta DEBE ser el bloque JSON, seguido del separador, y luego el análisis en Markdown. No incluyas texto introductorio ni bloques de código markdown.
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
             throw new Error("La parte JSON de la respuesta de la IA no es válida o no contiene un array 'plan'.");
        }
        return { plan: planData.plan, analysis: analysisPart };
    } catch (error) {
        console.error("Error en analyzeWeeklyTasks con Vertex AI:", error);
        throw new functions.https.HttpsError("internal", `Ocurrió un error al analizar las tareas con IA. Error: ${error.message}`);
    }
});

exports.getTaskSummaryWithAI = functions.https.onCall(async (data, context) => {
    // ... function logic
});

// CORRECTED SYNTAX
exports.enviarRecordatoriosDeVencimiento = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    // ... function logic
  });

// CORRECTED SYNTAX
exports.sendTaskNotification = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .firestore.document('tareas/{taskId}')
  .onWrite(async (change, context) => {
    // ... function logic
  });

// CORRECTED SYNTAX
exports.sendTestTelegramMessage = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .https.onCall(async (data, context) => {
    // ... function logic
  });

exports.updateCollectionCounts = functions.firestore
  .document('{collectionId}/{docId}')
  .onWrite(async (change, context) => {
    // ... function logic
});

exports.listModels = functions.https.onCall(async (data, context) => {
    // ... function logic
});

exports.enviarRecordatoriosDiarios = functions.pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    // ... function logic
  });