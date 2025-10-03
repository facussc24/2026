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
exports.startAIAgentJob = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }
    const { userPrompt, tasks } = data;
    if (!userPrompt || !tasks) {
        throw new functions.https.HttpsError("invalid-argument", "The 'userPrompt' and 'tasks' are required.");
    }

    const db = admin.firestore();
    const jobRef = db.collection('ai_agent_jobs').doc();

    const jobData = {
        status: 'PENDING',
        userPrompt,
        tasks,
        creatorUid: context.auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        currentDate: new Date().toISOString().split('T')[0],
        conversationHistory: [],
        thinkingSteps: [],
        executionPlan: [],
        summary: ''
    };

    await jobRef.set(jobData);

    return { jobId: jobRef.id };
});


exports.aiAgentJobRunner = functions.runWith({timeoutSeconds: 120}).firestore.document('ai_agent_jobs/{jobId}')
    .onCreate(async (snap, context) => {
        const jobRef = snap.ref;
        const jobData = snap.data();
        let { userPrompt, tasks, currentDate, conversationHistory, executionPlan, thinkingSteps, summary } = jobData;

        try {
            await jobRef.update({ status: 'RUNNING' });

            const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
            const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.5-flash" });

            const toolDefinitions = [
                // Tool definitions remain the same
                 {
                    "id": "create_task",
                    "description": "Creates a new task. You MUST determine the best `plannedDate` by analyzing the user's current schedule. Only set a `dueDate` if a specific deadline is mentioned.",
                    "parameters": {
                        "title": "string",
                        "description": "string (optional)",
                        "plannedDate": "string (YYYY-MM-DD)",
                        "dueDate": "string (YYYY-MM-DD, optional)"
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
                    description: 'Updates properties of an existing task. Use this to change the plannedDate, title, description, or other attributes.',
                    parameters: {
                        task_id: 'string',
                        updates: 'object'
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
                    description: 'Finds a list of tasks based on a property filter. Use this to find all tasks that are unscheduled (\\`"plannedDate\\": null\\`), have a specific status, or match a title.',
                    parameters: {
                        filter: 'object'
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

                **CRITICAL RULES:**
                1.  Your entire thought process (the "thought" field) MUST be in Spanish.
                2.  **\`plannedDate\` vs. \`dueDate\`:** You MUST understand the difference. \`plannedDate\` is the date you schedule the task on. \`dueDate\` is a final deadline. You are responsible for setting a \`plannedDate\` for ALL tasks. Only set a \`dueDate\` if the user explicitly mentions a deadline.
                3.  **Proactive Scheduling (Default Behavior):** For ANY new task or any existing task that needs a date, you MUST proactively find the best day to schedule it. NEVER assign tasks without a \`plannedDate\`. Your primary goal is to intelligently place tasks on the user's calendar.
                4.  **Workload Balancing:** When scheduling, you MUST analyze the user's workload for the current week and the next two (3 weeks total). Distribute new tasks to avoid overloading any single day. You MUST explain your distribution strategy in your 'thought' process.
                5.  **Self-Correction:** If a tool returns an error, you MUST NOT stop. In your next "Thought", acknowledge the error and decide on a new course of action.
                6.  **Tool Efficiency:** To modify multiple tasks at once (e.g., assigning dates to all unscheduled tasks), you MUST use the more efficient \`bulk_update_tasks\` tool.
                7.  **Intelligent Rescheduling:** When asked to reschedule a specific day, identify all tasks planned for that day. Then, analyze the user's workload for the next 3 weeks to find less busy days. Finally, use \`update_task\` to move tasks from the overloaded day to less busy ones, explaining your reasoning in your 'thought' process.

                **Project Breakdown Strategy:**
                1.  **Identify High-Level Goals:** If a user request sounds like a multi-step project (e.g., "Launch new feature," "Organize event," "Prepare quarterly report"), you MUST NOT create a single task for it.
                2.  **Deconstruct into Sub-Tasks:** Your primary responsibility is to break down that project into smaller, concrete, actionable sub-tasks. Think about what steps are logically required. For example, "Launch new feature" could become "1. Design UI mockups," "2. Develop backend logic," "3. Write unit tests," "4. Deploy to staging," "5. Final user testing."
                3.  **Sequential Creation:** Use the \\\`create_task\\\` tool repeatedly for each sub-task you've identified.
                4.  **Smart Scheduling:** As you create sub-tasks, intelligently schedule them by distributing them over appropriate \\\`plannedDate\\\`s.
                5.  **Summarize:** Once all sub-tasks for the project are created, use the \\\`review_and_summarize_plan\\\` tool to present the complete, broken-down plan to the user.

                **Cycle:**
                1. **Thought:** Analyze the user's request, the current task list, and your conversation history. Decide on the next immediate action to take based on your scheduling and project breakdown strategies. Your thoughts must be in Spanish.
                2. **Action:** Choose a tool from the available tools list and provide the necessary parameters in JSON format.
                3. **Observation:** You will be given the result of your action.
                4. **Repeat:** Continue this cycle until the user's request is fully completed.

                **Context:**
                - Today's Date: ${currentDate}
                - Existing Tasks: ${JSON.stringify(tasks.map(t => ({id: t.docId, title: t.title, status: t.status, plannedDate: t.plannedDate})), null, 2)}

                **Company Glossary:**
                - **AMFE (Análisis de Modo y Efecto de Falla):** A systematic, proactive method for evaluating a process to identify where and how it might fail and to assess the relative impact of different failures, in order to identify the parts of the process that are most in need of change. When a user asks to start an AMFE process, it implies a series of structured tasks: analysis, team formation, documentation, review, and implementation of countermeasures.

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

                **Final Step:**
                Before you use the "finish" tool, you MUST use the "review_and_summarize_plan" tool. Provide a concise, natural language summary in Spanish of the plan you've created.

                Example of final steps:
                {
                  "thought": "He creado todas las tareas y dependencias. Ahora voy a revisar y resumir el plan.",
                  "tool_code": {
                    "tool_id": "review_and_summarize_plan",
                    "parameters": {
                      "summary": "He creado un plan de 3 pasos para lanzar la campaña, comenzando por la investigación, seguido por la redacción del contenido y finalizando con la publicación."
                    }
                  }
                }
                // Then, on the next turn:
                {
                  "thought": "He resumido el plan. Mi trabajo está completo.",
                  "tool_code": { "tool_id": "finish", "parameters": {} }
                }
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


                if (tool_code.tool_id === 'finish') {
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
                        case 'find_tasks':
                            const { filter } = tool_code.parameters;
                            const filterKeys = Object.keys(filter);
                            const foundTasks = tasks.filter(t => {
                                return filterKeys.every(key => {
                                    if (key === 'title') {
                                        return t.title.toLowerCase().includes(filter[key].toLowerCase());
                                    }
                                    if (key === 'plannedDate' && filter[key] === null) {
                                        return !t.plannedDate;
                                    }
                                    return t[key] === filter[key];
                                });
                            });
                            const foundIds = foundTasks.map(t => t.docId);
                            if (foundTasks.length > 0) {
                                toolResult = `OK. Found ${foundTasks.length} tasks with IDs: ${foundIds.join(', ')}. The titles are: ${foundTasks.map(t => t.title).join(', ')}`;
                            } else {
                                toolResult = `Error: No tasks found for the given filter.`;
                            }
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
            const finalThoughtProcessDisplay = summary ?
                `### Resumen del Plan de la IA:\n\n${summary}` :
                `### Proceso de Pensamiento del Agente:\n\n${finalThoughtProcess}`;

            await jobRef.update({
                status: 'COMPLETED',
                thoughtProcess: finalThoughtProcessDisplay,
                executionPlan,
                summary,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

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
                const resolvedUpdates = {};
                for (const key in action.updates) {
                    const value = action.updates[key];
                    if (key === 'dependsOn' || key === 'blocks') {
                        const resolvedIds = value.map(id => tempIdToRealIdMap.get(id) || id);
                        resolvedUpdates[key] = admin.firestore.FieldValue.arrayUnion(...resolvedIds);
                    } else {
                        resolvedUpdates[key] = value;
                    }
                }
                batch.update(taskRef, resolvedUpdates);
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