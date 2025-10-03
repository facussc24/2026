const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
const {VertexAI} = require("@google-cloud/vertexai");
const cors = require('cors')({origin: true});
const axios = require("axios");
const nodemailer = require('nodemailer');
const crypto = require("crypto");

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
 * Generates a consistent SHA-256 hash for a given user prompt and task list.
 * This is used as a key for caching AI-generated plans to reduce costs and improve latency.
 * @param {string} userPrompt The user's text prompt.
 * @param {Array<object>} tasks The user's list of tasks.
 * @returns {string} A SHA-256 hash string.
 */
const generateRequestHash = (userPrompt, tasks) => {
    const taskSignature = tasks
        .map(t => `${t.docId}:${t.status}:${t.plannedDate}`)
        .sort()
        .join(',');
    const data = `${userPrompt}|${taskSignature}`;
    return crypto.createHash('sha256').update(data).digest('hex');
};

exports.startAIAgentJob = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { userPrompt, tasks } = data;
    if (!userPrompt || !tasks) {
        throw new functions.https.HttpsError("invalid-argument", "The 'userPrompt' and 'tasks' are required.");
    }

    const db = admin.firestore();

    // Fetch all users to provide as context to the AI for assignments.
    const usersSnapshot = await db.collection('usuarios').get();
    const allUsers = usersSnapshot.docs.map(doc => {
        const data = doc.data() || {}; // Handle cases where data might be missing
        const nombre = data.nombre || ''; // Default to empty string if missing
        const email = data.email || '';   // Default to empty string if missing
        return { id: doc.id, nombre, email };
    });
    const requestHash = generateRequestHash(userPrompt, tasks);
    const cacheRef = db.collection('ai_plan_cache').doc(requestHash);
    const cachedPlan = await cacheRef.get();

    const jobRef = db.collection('ai_agent_jobs').doc();

    // Cache Hit: If a plan exists, create a pre-completed job.
    if (cachedPlan.exists) {
        const { executionPlan, summary } = cachedPlan.data();
        const jobData = {
            status: 'COMPLETED', // Instantly completed
            userPrompt,
            tasks,
            creatorUid: context.auth.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            executionPlan,
            summary,
            thoughtProcess: `### Plan de la IA (desde caché)\n\n${summary}`,
            isFromCache: true,
        };
        await jobRef.set(jobData);
        return { jobId: jobRef.id, isFromCache: true };
    }

    // Cache Miss: Create a pending job to be processed by the AI.
    const jobData = {
        status: 'PENDING',
        userPrompt,
        tasks,
        allUsers,
        creatorUid: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        currentDate: new Date().toISOString().split('T')[0],
        conversationHistory: [],
        thinkingSteps: [],
        executionPlan: [],
        summary: '',
        requestHash, // Store hash for later caching
    };

    await jobRef.set(jobData);

    return { jobId: jobRef.id, isFromCache: false };
});


exports.aiAgentJobRunner = functions.runWith({timeoutSeconds: 120}).firestore.document('ai_agent_jobs/{jobId}')
    .onCreate(async (snap, context) => {
        const jobRef = snap.ref;
        const jobData = snap.data();
        let { userPrompt, tasks, allUsers, currentDate, conversationHistory, executionPlan, thinkingSteps, summary } = jobData;

        try {
            await jobRef.update({ status: 'RUNNING' });

            // AI Model Configuration: Using gemini-2.5-flash-lite for cost-efficiency.
            const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
            const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });

            const toolDefinitions = [
                // Tool definitions remain the same
                 {
                    "id": "create_task",
                    "description": "Creates a new task. You MUST determine the best `plannedDate` by analyzing the user's current schedule. Only set a `dueDate` if a specific deadline is mentioned. Can be assigned to a user by providing their email.",
                    "parameters": {
                        "title": "string",
                        "description": "string (optional)",
                        "plannedDate": "string (YYYY-MM-DD)",
                        "dueDate": "string (YYYY-MM-DD, optional)",
                        "assigneeEmail": "string (optional)"
                    }
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
                    id: 'delete_task',
                    description: 'Deletes an existing task using its ID.',
                    parameters: {
                        task_id: 'string'
                    }
                },
                {
                    id: 'complete_task',
                    description: "Marks an existing task as 'done' using its ID.",
                    parameters: {
                        task_id: 'string'
                    }
                },
                {
                    id: 'update_task',
                    description: 'Updates properties of an existing task. Use this to change the plannedDate, title, description, assignee, or other attributes.',
                    parameters: {
                        task_id: 'string',
                        updates: 'object' // Can include assigneeEmail
                    }
                },
                {
                    id: 'bulk_update_tasks',
                    description: 'Updates multiple tasks in a single operation. Provide a list of task IDs and the corresponding updates for each.',
                    parameters: {
                        updates: 'array'
                    }
                },
                 {
                    id: 'review_and_summarize_plan',
                    description: 'Review the created tasks and dependencies and provide a brief, high-level summary in Spanish of the plan you have constructed. This should be your final step before using the "finish" tool.',
                    parameters: {
                        summary: 'string'
                    }
                },
                {
                    id: 'find_tasks',
                    description: 'Finds tasks based on a property filter. Supports suffixes for advanced queries: `_lte` (less/equal), `_gte` (greater/equal), `_ne` (not equal). Example: `{"dueDate_lte": "2024-10-03", "status_ne": "done"}` finds all overdue, unfinished tasks. Returns a JSON object like `{\\"tasks\\": [...]}`.',
                    parameters: {
                        filter: 'object'
                    }
                },
                 {
                    id: 'answer_question',
                    description: 'Use this tool to provide a direct, final answer to a user\'s question. This should be used when the user is asking for information, not for creating or modifying tasks. The provided answer will be shown directly to the user.',
                    parameters: {
                        answer: 'string'
                    }
                },
                {
                    id: 'finish',
                    description: 'Call this when you have a complete plan and all tasks and dependencies have been created.',
                    parameters: {}
                }
            ];

            /*
             * AI System Prompt (Cost-Optimized)
             * This prompt is designed to be efficient, reducing token count while maintaining core functionality.
             * Key principles:
             * - Autonomous project management: Deconstructs complex requests into actionable steps.
             * - Proactive & intelligent scheduling: Assigns `plannedDate` to all tasks, balancing workload over 3 weeks.
             * - Efficient tool usage: Employs `bulk_update_tasks` for multiple updates.
             * - Strict output format: Enforces JSON output with "thought" (in Spanish) and "tool_code".
             */
            const systemPrompt = `
                You are an autonomous project management agent. Your goal is to fulfill the user's request by thinking step-by-step (in Spanish) and using tools.

                **Core Directives:**
                1.  **Analyze User Intent:** First, determine if the user is asking a question (e.g., "how many tasks...", "which tasks are...") or issuing a command (e.g., "create a task...", "reorganize my week").
                2.  **If it's a Question:**
                    *   Think about the question and analyze the provided task data to find the answer.
                    *   Use the \`answer_question\` tool to provide a direct, concise answer in Spanish.
                    *   Do not use any other tools. Your job is to answer, then finish.
                3.  **If it's a Command:**
                    *   Proceed with the project management workflow below.
                    *   **Assign Tasks:** If the user specifies an assignee, use their email in the \`assigneeEmail\` parameter. If no user is mentioned, do not assign it.
                    *   **Always Think in Spanish:** The "thought" field MUST be in Spanish.
                    *   **Schedule Everything:** Proactively assign a \`plannedDate\` to ALL new tasks. Only use \`dueDate\` for explicit deadlines.
                    *   **Balance Workload:** Analyze the user's schedule (3-week view) and distribute tasks to avoid overloading any day.
                    *   **Break Down Projects:** Deconstruct large requests (e.g., "Launch feature") into smaller, concrete sub-tasks.
                    *   **Summarize Before Finishing:** Before using "finish", you MUST use "review_and_summarize_plan" to provide a high-level summary of your plan in Spanish.

                **Execution Cycle & Tool Interaction Example:**
                1. **Thought:** The user wants to find all overdue tasks that are not yet done. I will use the \`find_tasks\` tool with advanced filters. Today's date is ${currentDate}.
                2. **Action:** Call \`find_tasks\` with \`dueDate_lte\` for "less than or equal to" today, and \`status_ne\` for "not equal to" done. Example: \`{ "tool_id": "find_tasks", "parameters": { "filter": { "dueDate_lte": "${currentDate}", "status_ne": "done" } } }\`
                3. **Observation:** You will receive a JSON string like: \`{\\"tasks\\": [{\\"id\\": \\"id1\\", \\"title\\": \\"Task 1\\"}, {\\"id\\": \\"id2\\", \\"title\\": \\"Task 2\\"}]}\`.
                4. **Thought:** I have the IDs of the overdue tasks. Now I will use \`bulk_update_tasks\` to reschedule them.
                5. **Action:** Call the next tool with the extracted IDs. Example: \`{ "tool_id": "bulk_update_tasks", "parameters": { "updates": [ { "task_id": "id1", "updates": { "plannedDate": "..." } }, { "task_id": "id2", "updates": { "plannedDate": "..." } } ] } }\`
                6. **Repeat:** Continue until the request is complete, then call "finish" or "answer_question".

                **Context:**
                - Today's Date: ${currentDate}
                - Existing Tasks: ${JSON.stringify(tasks.map(t => ({id: t.docId, title: t.title, status: t.status, plannedDate: t.plannedDate, dueDate: t.dueDate})), null, 2)}
                - Available Users for Assignment: ${JSON.stringify(allUsers, null, 2)}
                - Company Glossary: AMFE implies a multi-step process (analysis, team, docs, review, implementation).

                **Available Tools:**
                ${JSON.stringify(toolDefinitions, null, 2)}

                **Output Format:**
                Respond with a single, valid JSON object: { "thought": "...", "tool_code": { "tool_id": "...", "parameters": {...} } }
            `;

            if (conversationHistory.length === 0) {
                 conversationHistory.push({ role: 'user', parts: [{ text: `User Request: "${userPrompt}"` }] });
            }


            for (let i = 0; i < 10; i++) { // Main agent loop
                let agentResponse;
                let lastError = null;

                // Inner loop for retrying the model call on JSON parsing errors
                for (let attempt = 0; attempt < 3; attempt++) {
                    try {
                        let prompt = `${systemPrompt}\n\n**Conversation History:**\n${JSON.stringify(conversationHistory, null, 2)}`;
                        if (attempt > 0) {
                            prompt += `\n\n**Previous Attempt Failed:** Your last response was not valid JSON. Please ensure your entire response is a single, valid JSON object as requested in the system prompt.`;
                        }

                        const result = await generativeModel.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
                        const responseText = result.response.candidates[0].content.parts[0].text;
                        const jsonMatch = responseText.match(/{[\s\S]*}/);

                        if (!jsonMatch) {
                            throw new Error("Response did not contain a JSON object.");
                        }

                        agentResponse = JSON.parse(jsonMatch[0]);
                        lastError = null; // Clear error on success
                        break; // Exit retry loop on success
                    } catch (e) {
                        lastError = e;
                        console.warn(`Attempt ${attempt + 1} failed: ${e.message}`);
                        if (attempt === 2) {
                             throw new Error(`Agent did not return valid JSON after 3 attempts. Last error: ${lastError.message}`);
                        }
                    }
                }

                const { thought: rawThought, tool_code: rawToolCode } = agentResponse;

                // Default to 'finish' to ensure the loop terminates gracefully on malformed responses.
                const tool_code = rawToolCode || { tool_id: 'finish', parameters: {} };

                // Provide a more contextual default thought if it's missing.
                const thought = rawThought || (tool_code.tool_id === 'finish'
                    ? 'Plan execution has been completed.'
                    : `Preparing to execute tool: ${tool_code.tool_id}.`);

                thinkingSteps.push({ thought, tool_code: tool_code.tool_id });
                await jobRef.update({ thinkingSteps: admin.firestore.FieldValue.arrayUnion({ thought, tool_code: tool_code.tool_id, timestamp: new Date() }) });


                if (tool_code.tool_id === 'finish' || tool_code.tool_id === 'answer_question') {
                    if (tool_code.tool_id === 'answer_question') {
                        summary = tool_code.parameters.answer; // Capture the answer
                    }
                    break;
                }

                let toolResult = '';
                try {
                    // Tool execution logic remains the same
                    switch (tool_code.tool_id) {
                        case 'review_and_summarize_plan':
                            summary = tool_code.parameters.summary;
                            toolResult = `OK. Plan summarized.`;
                            break;
                        case 'create_task':
                            const tempId = `temp_${Date.now()}`;
                            const taskPayload = tool_code.parameters;

                            // The AI is now responsible for providing this, so we don't default it here.
                            // if (!taskPayload.plannedDate) {
                            //     taskPayload.plannedDate = currentDate;
                            // }

                            executionPlan.push({ action: "CREATE", docId: tempId, task: taskPayload });
                            tasks.push({
                                docId: tempId,
                                title: taskPayload.title,
                                status: 'todo',
                                plannedDate: taskPayload.plannedDate
                            });
                            toolResult = `OK. Task created with temporary ID: ${tempId}.`;
                            break;
                        case 'create_dependency':
                            const { dependent_task_id, prerequisite_task_id } = tool_code.parameters;
                            executionPlan.push({ action: "UPDATE", docId: dependent_task_id, updates: { dependsOn: [prerequisite_task_id], blocked: true } });
                            executionPlan.push({ action: "UPDATE", docId: prerequisite_task_id, updates: { blocks: [dependent_task_id] } });
                            toolResult = `OK. Dependency created: ${dependent_task_id} now depends on ${prerequisite_task_id}.`;
                            break;
                        case 'delete_task':
                            const { task_id } = tool_code.parameters;
                            const taskIndexToDelete = tasks.findIndex(t => t.docId === task_id);
                            if (taskIndexToDelete > -1) {
                                const taskToDelete = tasks[taskIndexToDelete];
                                executionPlan.push({
                                    action: "DELETE",
                                    docId: task_id,
                                    originalTitle: taskToDelete.title
                                });
                                tasks.splice(taskIndexToDelete, 1);
                                toolResult = `OK. Task "${taskToDelete.title}" marked for deletion and removed from context.`;
                            } else {
                                toolResult = `Error: Task with ID "${task_id}" not found.`;
                            }
                            break;
                        case 'update_task':
                            const { task_id: update_task_id, updates } = tool_code.parameters;
                            const taskToUpdate = tasks.find(t => t.docId === update_task_id);
                            if (taskToUpdate) {
                                executionPlan.push({ action: "UPDATE", docId: update_task_id, updates: updates });
                                toolResult = `OK. Task "${taskToUpdate.title}" marked for update.`;
                            } else {
                                toolResult = `Error: Task with ID "${update_task_id}" not found for update.`;
                            }
                            break;
                        case 'bulk_update_tasks':
                            const { updates: bulk_updates } = tool_code.parameters;
                            let updated_count = 0;
                            let not_found_ids = [];
                            for (const item of bulk_updates) {
                                const taskToUpdate = tasks.find(t => t.docId === item.task_id);
                                if (taskToUpdate) {
                                    executionPlan.push({ action: "UPDATE", docId: item.task_id, updates: item.updates });
                                    updated_count++;
                                } else {
                                    not_found_ids.push(item.task_id);
                                }
                            }
                            toolResult = `OK. Marked ${updated_count} tasks for update.`;
                            if(not_found_ids.length > 0) {
                                toolResult += ` Could not find tasks with IDs: ${not_found_ids.join(', ')}.`;
                            }
                            break;
                        case 'complete_task':
                            const { task_id: complete_task_id } = tool_code.parameters;
                            const taskToComplete = tasks.find(t => t.docId === complete_task_id);
                            if (taskToComplete) {
                                executionPlan.push({ action: "UPDATE", docId: complete_task_id, updates: { status: 'done' }, originalTitle: taskToComplete.title });
                                toolResult = `OK. Task "${taskToComplete.title}" marked as complete.`;
                            } else {
                                toolResult = `Error: Task with ID "${complete_task_id}" not found to mark as complete.`;
                            }
                            break;
                        case 'find_tasks': {
                            const { filter } = tool_code.parameters;
                            const filterKeys = Object.keys(filter);
                            const foundTasks = tasks.filter(t => {
                                return filterKeys.every(key => {
                                    const filterValue = filter[key];
                                    if (key.endsWith('_lte')) {
                                        const field = key.replace('_lte', '');
                                        return t[field] && t[field] <= filterValue;
                                    }
                                    if (key.endsWith('_gte')) {
                                        const field = key.replace('_gte', '');
                                        return t[field] && t[field] >= filterValue;
                                    }
                                    if (key.endsWith('_ne')) {
                                        const field = key.replace('_ne', '');
                                        return t[field] !== filterValue;
                                    }
                                    if (key === 'title') {
                                        return t.title.toLowerCase().includes(filterValue.toLowerCase());
                                    }
                                    if (key === 'plannedDate' && filterValue === null) {
                                        return !t.plannedDate;
                                    }
                                    return t[key] === filterValue;
                                });
                            });

                            if (foundTasks.length > 0) {
                                const taskInfo = foundTasks.map(t => ({ id: t.docId, title: t.title, status: t.status, plannedDate: t.plannedDate, dueDate: t.dueDate }));
                                toolResult = JSON.stringify({ tasks: taskInfo });
                            } else {
                                toolResult = `Error: No tasks found for the given filter.`;
                            }
                            break;
                        }
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

            let finalThoughtProcessDisplay;
            if (summary) {
                // If a summary exists, check if it came from an answer or a plan summary.
                const lastTool = thinkingSteps[thinkingSteps.length - 1]?.tool_code;
                if (lastTool === 'answer_question') {
                    finalThoughtProcessDisplay = `### Respuesta de la IA:\n\n${summary}`;
                } else {
                    finalThoughtProcessDisplay = `### Resumen del Plan de la IA:\n\n${summary}`;
                }
            } else {
                finalThoughtProcessDisplay = `### Proceso de Pensamiento del Agente:\n\n${finalThoughtProcess}`;
            }

            await jobRef.update({
                status: 'COMPLETED',
                thoughtProcess: finalThoughtProcessDisplay,
                executionPlan,
                summary,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // After a successful run, save the plan to the cache if it's not from there already.
            if (jobData.requestHash) {
                const db = admin.firestore();
                const cacheRef = db.collection('ai_plan_cache').doc(jobData.requestHash);
                await cacheRef.set({
                    executionPlan,
                    summary,
                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }

        } catch (error) {
            console.error("Error running AI agent job:", error);
            await jobRef.update({
                status: 'ERROR',
                error: error.message,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
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
        if (item.action === 'UPDATE' && item.updates && item.updates.plannedDate) {
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
        if (item.action === 'UPDATE' && item.updates && item.updates.plannedDate) {
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
// Helper function to create the initial progress document for a plan execution
const createExecutionProgressDocument = async (db, jobId, plan) => {
    const progressRef = db.collection('plan_executions').doc(jobId);
    const progressSteps = plan.map((action, index) => ({
        id: index,
        description: `Executing: ${action.action} on ${action.originalTitle || action.docId || ''}`,
        status: 'PENDING'
    }));

    await progressRef.set({
        status: 'RUNNING',
        steps: progressSteps,
        startedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return progressRef;
};

exports.executeTaskModificationPlan = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { plan, jobId } = data; // Expect an optional jobId
    if (!plan || !Array.isArray(plan)) {
        throw new functions.https.HttpsError("invalid-argument", "The 'plan' must be an array of actions.");
    }

    const db = admin.firestore();
    const batch = db.batch();
    const tempIdToRealIdMap = new Map();
    let progressRef = null;
    let progressSteps = [];

    // If a jobId is provided, set up the progress tracking document.
    if (jobId) {
        progressSteps = plan.map((action, index) => {
            let description = `Acción: ${action.action}`;
            if (action.originalTitle) {
                description = `"${action.originalTitle}"`;
            } else if (action.task && action.task.title) {
                description = `"${action.task.title}"`;
            }
            return { id: index, description, status: 'PENDING', action: action.action };
        });

        progressRef = db.collection('plan_executions').doc(jobId);
        await progressRef.set({
            status: 'RUNNING',
            steps: progressSteps,
            startedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    }

    const updateProgress = async (index, status, error = null) => {
        if (!progressRef) return;
        const updatePayload = {
            [`steps.${index}.status`]: status
        };
        if (error) {
            updatePayload[`steps.${index}.error`] = error;
        }
        await progressRef.update(updatePayload);
    };

    try {
        // --- Pre-process plan to resolve assignee emails to UIDs ---
        const emailToUidCache = new Map();
        const emailsToFetch = new Set();
        plan.forEach(action => {
            if (action.action === 'CREATE' && action.task.assigneeEmail) {
                emailsToFetch.add(action.task.assigneeEmail);
            } else if (action.action === 'UPDATE' && action.updates.assigneeEmail) {
                emailsToFetch.add(action.updates.assigneeEmail);
            }
        });

        if (emailsToFetch.size > 0) {
            const usersQuery = await db.collection('usuarios').where('email', 'in', Array.from(emailsToFetch)).get();
            usersQuery.forEach(doc => {
                emailToUidCache.set(doc.data().email, doc.id);
            });
        }

        // --- First Pass: Create new tasks and map IDs ---
        for (let i = 0; i < plan.length; i++) {
            const action = plan[i];
            if (action.action === 'CREATE') {
                const newTaskRef = db.collection('tareas').doc();
                const taskData = {
                    ...action.task,
                    creatorUid: context.auth.uid,
                    createdAt: new Date(),
                    status: 'todo'
                };

                if (taskData.assigneeEmail) {
                    const assigneeUid = emailToUidCache.get(taskData.assigneeEmail);
                    if (assigneeUid) {
                        taskData.assigneeUid = assigneeUid;
                    }
                    delete taskData.assigneeEmail; // Clean up property
                }

                batch.set(newTaskRef, taskData);
                tempIdToRealIdMap.set(action.docId, newTaskRef.id);
                await updateProgress(i, 'COMPLETED');
            }
        }

        // --- Second Pass: Apply updates, deletions, and dependencies ---
        for (let i = 0; i < plan.length; i++) {
            const action = plan[i];
            if (action.action === 'UPDATE') {
                const realDocId = tempIdToRealIdMap.get(action.docId) || action.docId;
                const taskRef = db.collection('tareas').doc(realDocId);
                const resolvedUpdates = {...action.updates}; // Make a copy to modify

                if (resolvedUpdates.assigneeEmail) {
                    const assigneeUid = emailToUidCache.get(resolvedUpdates.assigneeEmail);
                    if (assigneeUid) {
                        resolvedUpdates.assigneeUid = assigneeUid;
                    }
                    delete resolvedUpdates.assigneeEmail; // Clean up property
                }

                const finalUpdates = {};
                for (const key in resolvedUpdates) {
                    const value = resolvedUpdates[key];
                    if (key === 'dependsOn' || key === 'blocks') {
                        const resolvedIds = value.map(id => tempIdToRealIdMap.get(id) || id);
                        finalUpdates[key] = admin.firestore.FieldValue.arrayUnion(...resolvedIds);
                    } else {
                        finalUpdates[key] = value;
                    }
                }
                batch.update(taskRef, finalUpdates);
                await updateProgress(i, 'COMPLETED');
            } else if (action.action === 'DELETE') {
                const taskRef = db.collection('tareas').doc(action.docId);
                batch.delete(taskRef);
                await updateProgress(i, 'COMPLETED');
            }
        }

        await batch.commit();

        if (progressRef) {
            await progressRef.update({
                status: 'COMPLETED',
                finishedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        return { success: true, message: "Plan ejecutado con éxito." };

    } catch (error) {
        console.error("Error executing task modification plan:", error);
        if (progressRef) {
            await progressRef.update({
                status: 'ERROR',
                error: error.message,
                finishedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
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