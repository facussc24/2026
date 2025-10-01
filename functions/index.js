const functions = require("firebase-functions/v1");
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

exports.saveFormWithValidation = functions
  .runWith({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] })
  .https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // 1. Manual Authentication
      const idToken = req.headers.authorization?.split('Bearer ')[1];
      if (!idToken) {
        return res.status(401).json({
          error: { status: 'UNAUTHENTICATED', message: 'The function must be called while authenticated.' }
        });
      }
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const userEmail = decodedToken.email || 'Unknown';

      // 2. Data Parsing (from req.body.data for callable compatibility)
      const { formType, formData } = req.body.data;
      if (!formType || !formData) {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'The function must be called with "formType" and "formData" arguments.' }
        });
      }

      // --- ECR Validation ---
      if (formType === 'ecr') {
        const requiredFields = [
            { key: 'denominacion_producto', label: 'Denominación del Producto' },
            { key: 'situacion_existente', label: 'Situación Existente' },
            { key: 'situacion_propuesta', label: 'Situación Propuesta' }
        ];

        for (const field of requiredFields) {
            if (!formData[field.key] || formData[field.key].trim() === '') {
              return res.status(400).json({
                error: { status: 'INVALID_ARGUMENT', message: `El campo "${field.label}" no puede estar vacío.` }
              });
            }
        }
      }

      // --- ECO Validation ---
      else if (formType === 'eco') {
        if (!formData['ecr_no'] || formData['ecr_no'].trim() === '') {
          return res.status(400).json({
            error: { status: 'INVALID_ARGUMENT', message: 'El campo "ECR N°" no puede estar vacío.' }
          });
        }
        // Add safety checks for comments and checklists
        const hasComments = formData.comments && Object.values(formData.comments).some(comment => comment && comment.trim() !== '');
        const hasChecklists = formData.checklists && Object.values(formData.checklists).some(section =>
            section && section.some(item => item && (item.si || item.na))
        );

        if (!hasComments && !hasChecklists) {
          return res.status(400).json({
            error: { status: 'INVALID_ARGUMENT', message: 'El formulario ECO está vacío. Agregue al menos un comentario o marque una opción en el checklist.' }
          });
        }
      } else {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'El "formType" debe ser "ecr" o "eco".' }
        });
      }

      // --- Firestore Write Logic ---
      const db = admin.firestore();
      const collectionName = formType === 'ecr' ? 'ecr_forms' : 'eco_forms';

      // ECR number is now generated client-side.
      // The function now assumes the 'id' field is always present.
      const docId = formData.id;
      if (!docId) {
        return res.status(400).json({
          error: { status: 'INVALID_ARGUMENT', message: 'The document ID is missing from the form data.' }
        });
      }

      const docRef = db.collection(collectionName).doc(docId);
      const historyRef = docRef.collection('history');

      const dataToSave = {
          ...formData,
          lastModified: new Date(),
          modifiedBy: userEmail,
          serverValidated: true
      };

      const docSnap = await docRef.get();
      const oldData = docSnap.exists ? docSnap.data() : null;

      const batch = db.batch();
      batch.set(docRef, dataToSave, { merge: true });

      const historyDocRef = historyRef.doc();
      batch.set(historyDocRef, dataToSave);

      await batch.commit();

      // --- Email Notification Logic ---
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
                html: `
                  <p>Hola,</p>
                  <p>El estado de tu <strong>${formType.toUpperCase()} ${docId}</strong> ha cambiado de <strong>${oldStatus || 'N/A'}</strong> a <strong>${newStatus}</strong>.</p>
                  <p>Puedes ver los detalles en la aplicación.</p>
                  <p>Saludos,<br>El equipo de Gestión PRO</p>
                `
              };
              await transporter.sendMail(mailOptions);
              console.log(`Email sent to ${email} for ${formType.toUpperCase()} ${docId} status change.`);
            }
          } catch (error) {
            console.error(`Failed to send email for ${formType.toUpperCase()} ${docId}:`, error);
          }
        }
      }

      // 3. Manual Response Formatting
      return res.status(200).json({
        data: { success: true, message: `${formType.toUpperCase()} guardado con éxito.` }
      });

    } catch (error) {
      console.error(`Error in saveFormWithValidation for ${req.body?.data?.formType}:`, error);
      // Handle auth errors specifically
      if (error.code === 'auth/id-token-expired' || error.code === 'auth/argument-error') {
        return res.status(401).json({
          error: { status: 'UNAUTHENTICATED', message: 'Authentication token is invalid or expired.' }
        });
      }
      // Generic internal error for all other cases
      return res.status(500).json({
        error: { status: 'INTERNAL', message: `An internal error occurred while saving the form.` }
      });
    }
  });
});

exports.sendTaskAssignmentEmail = functions
  .runWith({ secrets: ["EMAIL_USER", "EMAIL_PASS", "EMAIL_HOST", "EMAIL_PORT"] })
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
          html: `
            <p>Hola,</p>
            <p>Se te ha asignado una nueva tarea: <strong>${task.title}</strong>.</p>
            <p><strong>Descripción:</strong> ${task.description || 'N/A'}</p>
            <p><strong>Fecha de Vencimiento:</strong> ${task.dueDate || 'N/A'}</p>
            <p>Puedes ver los detalles en la aplicación.</p>
            <p>Saludos,<br>El equipo de Gestión PRO</p>
          `
        };
        await transporter.sendMail(mailOptions);
        console.log(`Assignment email sent to ${email} for task ${context.params.taskId}.`);
      }
      return null;
    } catch (error) {
      console.error(`Failed to send assignment email for task ${context.params.taskId}:`, error);
      return null;
    }
  });

// --------------------------------------------------------------------------------
// DEPRECATED AI FUNCTIONS
// These functions have been consolidated into the more robust `getAIAssistantPlan`
// and `executeTaskModificationPlan` functions. They are kept here for reference
// but should not be used in new development.
// --------------------------------------------------------------------------------
/*
exports.organizeTaskWithAI = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    // ... (implementation removed for brevity)
});

exports.analyzeWeeklyTasks = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    // ... (implementation removed for brevity)
});

exports.refineWeeklyPlan = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    // ... (implementation removed for brevity)
});

exports.executeWeeklyPlan = functions.https.onCall(async (data, context) => {
    // ... (implementation removed for brevity)
});
*/

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

/**
 * Interprets a user's natural language prompt to generate a structured plan for task modifications.
 * This function is the "brain" of the AI assistant. It can understand creating, updating, and marking tasks as done.
 * It also generates a human-readable "thought process" in Markdown.
 */
exports.getAIAssistantPlan = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { userPrompt, tasks, currentDate } = data;
    if (!userPrompt || typeof userPrompt !== "string" || userPrompt.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a non-empty 'userPrompt' argument.");
    }
    if (!tasks || !Array.isArray(tasks)) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a 'tasks' (array) argument.");
    }
    if (!currentDate || !/^\d{4}-\d{2}-\d{2}$/.test(currentDate)) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a valid 'currentDate' (YYYY-MM-DD).");
    }

    const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
    const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const tasksForPrompt = tasks.map(t => ({
        docId: t.docId,
        title: t.title,
        status: t.status,
        dueDate: t.dueDate,
    }));

    const prompt = `
      Eres un asistente experto en gestión de proyectos. Tu misión es analizar la petición de un usuario y su lista de tareas para generar dos cosas:
      1.  Un "proceso de pensamiento" en formato Markdown que explique tu razonamiento.
      2.  Un "plan de ejecución" en formato JSON que contenga las acciones concretas a realizar.

      **Contexto:**
      - La fecha de hoy es ${currentDate}. Utiliza esta fecha como referencia para cualquier cálculo de fechas relativas (ej: "mañana", "ayer", "próximo lunes").
      - Tareas Actuales del Usuario:
      \`\`\`json
      ${JSON.stringify(tasksForPrompt, null, 2)}
      \`\`\`

      **Petición del Usuario:**
      "${userPrompt}"

      **PROCESO DE ANÁLISIS (SEGUIR ESTRICTAMENTE):**

      **1. Identificar Intenciones Clave:**
         - Lee la petición para identificar las acciones principales: CREAR, ACTUALIZAR, COMPLETAR.

      **2. Mapear Tareas Existentes:**
         - Para intenciones de ACTUALIZAR o COMPLETAR, busca la tarea correspondiente en la lista de "Tareas Actuales" usando el título como identificador principal. Sé flexible con pequeñas variaciones en el texto.

      **3. Generar Pasos de Pensamiento (thinkingSteps):**
         - Crea un array de strings concisos que narren tu proceso de razonamiento.
         - Ejemplo: \`["Analizando petición...", "Intención: CREAR tarea.", "Detalles extraídos para 'Reunión Cliente X'.", "Intención: COMPLETAR tarea.", "Tarea 'revisar planos' identificada.", "Plan de ejecución formulado."]\`

      **4. Generar Proceso de Pensamiento (thoughtProcess):**
         - Escribe un resumen en Markdown de lo que entendiste y planeas hacer. Usa listas con viñetas y negritas para claridad.

      **5. Generar Plan de Ejecución (executionPlan):**
         - Construye un array de objetos de acción.
         - **Para CREAR:** \`{ "action": "CREATE", "task": { "title": "...", "description": "...", "dueDate": "YYYY-MM-DD" or null } }\`
         - **Para ACTUALIZAR:** \`{ "action": "UPDATE", "docId": "...", "updates": { "fieldName": "newValue" }, "originalTitle": "..." }\`
         - **Para COMPLETAR:** \`{ "action": "UPDATE", "docId": "...", "updates": { "status": "done" }, "originalTitle": "..." }\`

      **Formato de Salida (REGLA CRÍTICA):**
      - Tu respuesta DEBE ser un único bloque de código JSON, sin texto introductorio ni explicaciones.
      - El JSON debe tener TRES claves a nivel raíz: \`thinkingSteps\` (array de strings), \`thoughtProcess\` (string con Markdown), y \`executionPlan\` (array de acciones JSON).
      - La respuesta debe empezar con \`{\` y terminar con \`}\`. NO uses bloques de código markdown como \`\`\`json.

      **EJEMPLO COMPLETO:**
      - **Petición:** "crea una tarea para la reunión con el cliente X mañana y marca como lista la de revisar los planos"
      - **Salida Esperada:**
        {
          "thinkingSteps": ["Analizando petición...", "Detectada intención de CREAR.", "Detectada intención de COMPLETAR.", "Mapeando 'revisar planos' a docId 'abc-123'.", "Plan generado."],
          "thoughtProcess": "### Plan de Acción\\nOk, entendido. Esto es lo que haré:\\n*   **Crear** una nueva tarea: *Reunión con cliente X* para mañana.\\n*   **Marcar como completada** la tarea: *Revisar planos del nuevo ensamblaje*.",
          "executionPlan": [
            {
              "action": "CREATE",
              "task": {
                "title": "Reunión con cliente X",
                "description": "Preparar y asistir a la reunión con el cliente X.",
                "dueDate": "${new Date(new Date(currentDate).setDate(new Date(currentDate).getDate() + 1)).toISOString().split('T')[0]}"
              }
            },
            {
              "action": "UPDATE",
              "docId": "ID_DE_LA_TAREA_DE_PLANOS",
              "updates": { "status": "done" },
              "originalTitle": "Revisar planos del nuevo ensamblaje"
            }
          ]
        }
    `;

    try {
        const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates[0].content.parts[0].text;

        // More robust JSON extraction: handles optional markdown code blocks and leading/trailing whitespace.
        const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```|({[\s\S]*})/);
        if (!jsonMatch) {
            console.error("No valid JSON block found in AI response. Raw response:", responseText);
            throw new Error("No se encontró un bloque JSON válido en la respuesta de la IA.");
        }
        // The actual JSON content is in capture group 1 (for ```json) or 2 (for raw {}).
        const cleanedText = jsonMatch[1] || jsonMatch[2];

        const plan = JSON.parse(cleanedText);

        // Add userPrompt to the plan for the frontend to use
        plan.userPrompt = userPrompt;

        if (!plan.thoughtProcess || !plan.executionPlan || !plan.thinkingSteps) {
            throw new Error("La respuesta de la IA no contiene 'thoughtProcess', 'executionPlan' o 'thinkingSteps'.");
        }
        return plan;
    } catch (error) {
        console.error("Error en getAIAssistantPlan:", error, "Raw response:", error.responseText);
        throw new functions.https.HttpsError("internal", `Error al procesar la petición con la IA: ${error.message}`);
    }
});


/**
 * Executes a structured plan from the AI assistant to modify tasks in Firestore.
 * This function is safer as it only performs actions defined in the pre-approved plan.
 */
exports.executeTaskModificationPlan = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { plan } = data;
    if (!plan || !Array.isArray(plan)) {
        throw new functions.https.HttpsError("invalid-argument", "Se requiere un 'plan' (array) no vacío.");
    }

    const db = admin.firestore();
    const batch = db.batch();
    const tasksRef = db.collection('tareas');
    const userUid = context.auth.uid;
    const summary = { created: 0, updated: 0, failed: 0 };

    plan.forEach(item => {
        try {
            if (item.action === 'CREATE' && item.task) {
                const newTaskRef = tasksRef.doc();
                batch.set(newTaskRef, {
                    title: item.task.title || "Tarea sin título",
                    description: item.task.description || "",
                    dueDate: item.task.dueDate || null, // Allow null
                    plannedDate: item.task.dueDate || null, // Default planned to due date
                    creatorUid: userUid,
                    assigneeUid: userUid,
                    status: 'todo',
                    priority: 'medium',
                    effort: 'medium',
                    tags: [],
                    isArchived: false,
                    createdAt: new Date(),
                    updatedAt: new Date(),
                });
                summary.created++;
            } else if (item.action === 'UPDATE' && item.docId && item.updates) {
                const taskRef = tasksRef.doc(item.docId);
                batch.update(taskRef, { ...item.updates, updatedAt: new Date() });
                summary.updated++;
            }
        } catch(e) {
            console.error("Error processing plan item:", item, e);
            summary.failed++;
        }
    });

    if (summary.created === 0 && summary.updated === 0) {
        // If all items failed or the plan was empty, don't commit.
        if (summary.failed > 0) {
             throw new functions.https.HttpsError("invalid-argument", "El plan contenía acciones inválidas.");
        }
        return { success: false, message: "El plan no contenía acciones para ejecutar." };
    }


    try {
        await batch.commit();
        const messageParts = [];
        if (summary.created > 0) messageParts.push(`${summary.created} tarea(s) creada(s)`);
        if (summary.updated > 0) messageParts.push(`${summary.updated} tarea(s) actualizada(s)`);
        return { success: true, message: `Plan aplicado: ${messageParts.join(', ')}.` };
    } catch (error) {
        console.error("Error aplicando el plan de modificación de tareas:", error);
        throw new functions.https.HttpsError("internal", "Ocurrió un error al guardar los cambios en la base de datos.");
    }
});

exports.analyzePlanSanity = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { plan, tasks } = data;
    if (!plan || !tasks || !Array.isArray(plan) || !Array.isArray(tasks)) {
        throw new functions.https.HttpsError("invalid-argument", "Se requiere 'plan' (array) y 'tasks' (array).");
    }

    const suggestions = [];
    const effortCost = { high: 5, medium: 3, low: 1 };
    const dailyEffort = {};
    const dailyTaskCount = {};
    const tasksById = new Map(tasks.map(t => [t.docId, t]));

    // Calculate daily effort and task count from the plan
    plan.forEach(item => {
        if (item.updates && item.updates.plannedDate) {
            const task = tasksById.get(item.docId);
            if (task) {
                const date = item.updates.plannedDate;
                const effort = effortCost[task.effort] || 3; // Default to medium
                dailyEffort[date] = (dailyEffort[date] || 0) + effort;
                dailyTaskCount[date] = (dailyTaskCount[date] || 0) + 1;
            }
        }
    });

    // Check for overloaded days (by effort and by task count)
    for (const date in dailyEffort) {
        const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric' });
        if (dailyEffort[date] > 8) {
            suggestions.push(`El día ${formattedDate} parece sobrecargado en esfuerzo. Considera mover alguna tarea para balancear la semana.`);
        }
        if (dailyTaskCount[date] > 4) {
             suggestions.push(`El día ${formattedDate} tiene muchas tareas (${dailyTaskCount[date]}). Considera distribuir el trabajo para evitar el multitasking excesivo.`);
        }
    }

    // Check for tasks planned after their due date
    plan.forEach(item => {
        if (item.updates && item.updates.plannedDate) {
            const task = tasksById.get(item.docId);
            if (task && task.dueDate && item.updates.plannedDate > task.dueDate) {
                suggestions.push(`La tarea "${task.title}" está planificada después de su fecha de vencimiento. Considera adelantarla.`);
            }
        }
    });

    return { suggestions };
});


/**
 * Scheduled function to delete archived tasks older than 6 months.
 * Runs every day at 3:00 AM (Argentina time).
 */
exports.deleteOldArchivedTasks = functions.pubsub.schedule("every day 03:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    console.log("Running scheduled task: Deleting old archived tasks...");

    const db = admin.firestore();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const tasksRef = db.collection("tareas");
    const q = query(tasksRef,
        where('isArchived', '==', true),
        where('completedAt', '<', sixMonthsAgo)
    );

    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) {
            console.log("No old archived tasks to delete.");
            return null;
        }

        const batch = db.batch();
        querySnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });

        await batch.commit();
        console.log(`Successfully deleted ${querySnapshot.size} old archived tasks.`);
        return null;
    } catch (error) {
        console.error("Error deleting old archived tasks:", error);
        return null;
    }
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