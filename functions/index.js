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

// =================================================================================
// --- AI AGENT ARCHITECTURE ---
// =================================================================================

/**
 * A stateful, multi-turn AI agent that can reason and use tools to accomplish complex project management goals.
 * It uses a ReAct (Reasoning and Acting) loop to iteratively think, act, and observe until the user's request is fulfilled.
 */
exports.aiProjectAgent = functions.runWith({timeoutSeconds: 540, memory: '1GB'}).https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { userPrompt, tasks, currentDate } = data;

    const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
    const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const toolDefinitions = [
        {
            id: 'create_task',
            description: 'Creates a new task with a title, description, and due date.',
            parameters: {
                title: 'string',
                description: 'string (optional)',
                dueDate: 'string (YYYY-MM-DD, optional)'
            }
        },
        {
            id: 'find_task',
            description: 'Finds an existing task by its title or keywords to get its ID.',
            parameters: { query: 'string' }
        },
        {
            id: 'create_dependency',
            description: 'Creates a dependency between two tasks. The first task will be blocked until the second one is complete.',
            parameters: {
                dependent_task_id: 'string',
                prerequisite_task_id: 'string'
            }
        },
         {
            id: 'finish',
            description: 'Call this when you have a complete plan and all tasks and dependencies have been created.',
            parameters: {}
        }
    ];

    const systemPrompt = `
        You are an autonomous project management agent. Your goal is to fulfill the user's request by thinking step-by-step and using the tools at your disposal.

        **CRITICAL RULE:** Your entire thought process (the "thought" field) MUST be in Spanish.

        **Cycle:**
        1. **Thought:** Analyze the user's request and your conversation history. Decide on the next immediate action to take. Your thoughts must be in Spanish.
        2. **Action:** Choose a tool from the available tools list and provide the necessary parameters in JSON format.
        3. **Observation:** You will be given the result of your action.
        4. **Repeat:** Continue this cycle until the user's request is fully completed.

        **Context:**
        - Today's Date: ${currentDate}
        - Existing Tasks: ${JSON.stringify(tasks.map(t => ({id: t.docId, title: t.title, status: t.status})), null, 2)}

        **Available Tools:**
        ${JSON.stringify(toolDefinitions, null, 2)}

        **Output Format:**
        Your response MUST be a single, valid JSON object containing two keys: "thought" and "tool_code".
        "tool_code" must be a JSON object with "tool_id" and "parameters".
        Example:
        {
          "thought": "I need to create the first task for the user.",
          "tool_code": {
            "tool_id": "create_task",
            "parameters": {
              "title": "Investigar sobre marketing"
            }
          }
        }

        When you are completely finished, use the "finish" tool.
        {
          "thought": "I have created all the necessary tasks and their dependencies. My work is done.",
          "tool_code": { "tool_id": "finish", "parameters": {} }
        }
    `;

    let conversationHistory = [{ role: 'user', parts: [{ text: `User Request: "${userPrompt}"` }] }];
    let executionPlan = [];
    let thinkingSteps = [];

    for (let i = 0; i < 10; i++) { // Max 10 turns to prevent infinite loops
        const prompt = `${systemPrompt}\n\n**Conversation History:**\n${JSON.stringify(conversationHistory, null, 2)}`;
        const result = await generativeModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
        const responseText = result.response.candidates[0].content.parts[0].text;
        const jsonMatch = responseText.match(/{[\s\S]*}/);

        if (!jsonMatch) {
            throw new Error("Agent did not return valid JSON.");
        }

        const agentResponse = JSON.parse(jsonMatch[0]);
        const { thought, tool_code } = agentResponse;

        thinkingSteps.push({ thought, tool_code: tool_code.tool_id });

        if (tool_code.tool_id === 'finish') {
            break; // Agent has finished its work
        }

        // --- Tool Execution ---
        let toolResult = '';
        try {
            switch (tool_code.tool_id) {
                case 'create_task':
                    const tempId = `temp_${Date.now()}`;
                    executionPlan.push({ action: "CREATE", docId: tempId, task: tool_code.parameters });
                    // Add the new task to the context for the next turn
                    tasks.push({ docId: tempId, title: tool_code.parameters.title, status: 'todo' });
                    toolResult = `OK. Task created with temporary ID: ${tempId}.`;
                    break;
                case 'find_task':
                    const query = tool_code.parameters.query.toLowerCase();
                    // Search in reverse to find the most recently created task first.
                    const reversedTasks = [...tasks].reverse();
                    const foundTask = reversedTasks.find(t => t.title.toLowerCase().includes(query));
                    toolResult = foundTask ? `OK. Found task with ID: ${foundTask.docId}` : `Error: Task not found for query: "${tool_code.parameters.query}"`;
                    break;
                case 'create_dependency':
                    const { dependent_task_id, prerequisite_task_id } = tool_code.parameters;
                    executionPlan.push({ action: "UPDATE", docId: dependent_task_id, updates: { dependsOn: [prerequisite_task_id], blocked: true } });
                    executionPlan.push({ action: "UPDATE", docId: prerequisite_task_id, updates: { blocks: [dependent_task_id] } });
                    toolResult = `OK. Dependency created: ${dependent_task_id} now depends on ${prerequisite_task_id}.`;
                    break;
                default:
                    toolResult = `Error: Unknown tool "${tool_code.tool_id}".`;
            }
        } catch (e) {
            toolResult = `Error executing tool: ${e.message}`;
        }

        conversationHistory.push({ role: 'model', parts: [{ text: JSON.stringify(agentResponse, null, 2) }] });
        conversationHistory.push({ role: 'user', parts: [{ text: `Observation: ${toolResult}` }] });
    }

    const finalThoughtProcess = thinkingSteps.map((step, i) => `${i + 1}. **Pensamiento:** ${step.thought}\n   - **Acción:** ${step.tool_code}`).join('\n\n');

    return {
        thinkingSteps: thinkingSteps.map(s => s.thought),
        thoughtProcess: `### Proceso de Pensamiento del Agente:\n\n${finalThoughtProcess}`,
        executionPlan,
        userPrompt
    };
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
 * Executes a multi-step plan generated by the AI assistant.
 * It uses a two-pass approach to handle dependencies with temporary IDs.
 * 1. First Pass: Creates all new tasks and maps their temporary IDs to real Firestore document IDs.
 * 2. Second Pass: Applies all updates (like dependencies) using the ID map to reference the correct documents.
 */
exports.executeTaskModificationPlan = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { plan } = data;
    if (!plan || !Array.isArray(plan)) {
        throw new functions.https.HttpsError("invalid-argument", "The 'plan' must be an array of actions.");
    }

    const db = admin.firestore();
    const batch = db.batch();
    const tempIdToRealIdMap = new Map();

    // --- First Pass: Create new tasks and map IDs ---
    for (const action of plan) {
        if (action.action === 'CREATE') {
            const newTaskRef = db.collection('tareas').doc(); // Auto-generate new ID
            const taskData = {
                ...action.task,
                creatorUid: context.auth.uid,
                createdAt: new Date(),
                status: 'todo' // Default status
            };
            batch.set(newTaskRef, taskData);
            tempIdToRealIdMap.set(action.docId, newTaskRef.id);
        }
    }

    // --- Second Pass: Apply updates and dependencies ---
    for (const action of plan) {
        if (action.action === 'UPDATE') {
            // Resolve the temporary ID to a real ID
            const realDocId = tempIdToRealIdMap.get(action.docId) || action.docId;
            const taskRef = db.collection('tareas').doc(realDocId);

            // Resolve any temporary IDs within the update payload
            const resolvedUpdates = {};
            for (const key in action.updates) {
                const value = action.updates[key];
                if (key === 'dependsOn' || key === 'blocks') {
                    // Use arrayUnion for dependency fields to prevent overwriting existing arrays
                    const resolvedIds = value.map(id => tempIdToRealIdMap.get(id) || id);
                    resolvedUpdates[key] = admin.firestore.FieldValue.arrayUnion(...resolvedIds);
                } else {
                    resolvedUpdates[key] = value;
                }
            }

            batch.update(taskRef, resolvedUpdates);
        }
    }

    try {
        await batch.commit();
        return { success: true, message: "Plan ejecutado con éxito." };
    } catch (error) {
        console.error("Error executing task modification plan:", error);
        throw new functions.https.HttpsError("internal", "Ocurrió un error al ejecutar el plan.", error.message);
    }
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