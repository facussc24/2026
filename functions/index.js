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

exports.organizeTaskWithAI = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const text = data.text;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a non-empty 'text' argument.");
    }

    try {
        // Inicializa Vertex AI con la configuración del proyecto y la ubicación.
        const vertexAI = new VertexAI({
            project: process.env.GCLOUD_PROJECT,
            location: "us-central1",
        });

        // Selecciona el modelo generativo.
        const generativeModel = vertexAI.getGenerativeModel({
            model: "gemini-2.0-flash",
        });

        const currentDate = new Date().toISOString().split("T")[0];

        const prompt = `
        Analiza el siguiente texto de un usuario. Tu objetivo es identificar si el texto describe una o varias tareas gestionables.

        **Contexto Clave:** La fecha de hoy es ${currentDate}. Todas las fechas relativas (como "mañana" o "próxima semana") deben calcularse a partir de esta fecha.

        Texto del usuario: "${text}"

        **Instrucciones Estrictas:**
        1.  **Detección de Tareas:** Identifica si el texto representa una única acción o múltiples acciones distintas. Si son distintas (ej: "revisar planos y llamar a proveedor"), crea un objeto de tarea para cada una. Si es una acción con pasos, trátalo como una sola tarea con subtareas.
        2.  **Estructura de Tarea (JSON):** Para cada tarea, genera un objeto JSON con estos campos EXACTOS:
            *   \\\`title\\\`: Título conciso (máx 10 palabras).
            *   \\\`description\\\`: Resumen corto del objetivo.
            *   \\\`subtasks\\\`: Array de strings con subtareas accionables. Si no hay, \\\`[]\\\`.
            *   \\\`tags\\\`: Array de strings con palabras clave relevantes (1-3 palabras por tag). Si no hay, \\\`[]\\\`.
            *   \\\`priority\\\`: 'high', 'medium', o 'low'.
            *   \\\`startDate\\\`: 'YYYY-MM-DD' o \\\`null\\\`.
            *   \\\`dueDate\\\`: 'YYYY-MM-DD' o \\\`null\\\`.
            *   \\\`assignee\\\`: Nombre de la persona o \\\`null\\\`.
            *   \\\`isPublic\\\`: \\\`true\\\` (equipo/proyecto) o \\\`false\\\` (personal).
            *   \\\`project\\\`: Nombre del proyecto o \\\`null\\\`.
        3.  **Generación de Tags:** Analiza el texto para extraer conceptos, tecnologías, nombres de proyectos o temas clave. Conviértelos en tags cortos, en minúsculas y sin caracteres especiales. Por ejemplo, "Arreglar bug en login de app Android" podría generar tags como ["bugfix", "login", "android"].
        4.  **Corrección de Texto:** Corrige la gramática y ortografía en \\\`title\\\` y \\\`description\\\` para mayor claridad.

        **Formato de Salida - REGLA CRÍTICA:**
        Tu respuesta DEBE ser ÚNICAMENTE un objeto JSON. Este objeto debe contener una clave "tasks", cuyo valor es un array de los objetos de tarea que creaste.
        NO incluyas absolutamente NADA más en tu respuesta. Ni texto introductorio, ni explicaciones, ni bloques de código markdown (como \\\`\\\`\\\`json).
        La respuesta debe empezar con \\\`{\\\` y terminar con \\\`}\\\`.

        **Ejemplo de respuesta VÁLIDA:**
        {"tasks":[{"title":"Revisar planos del chasis","description":"Revisar los planos detallados del nuevo chasis para el modelo 2024.","subtasks":[],"tags":["diseño","chasis","planos","2024"],"priority":"high","startDate":null,"dueDate":null,"assignee":null,"isPublic":true,"project":"Chasis-2024"},{"title":"Llamar a proveedor de acero","description":"Llamar al proveedor para confirmar la fecha de entrega del acero.","subtasks":[],"tags":["proveedores","acero","logística"],"priority":"medium","startDate":null,"dueDate":null,"assignee":"Marcos","isPublic":true,"project":"Chasis-2024"}]}

        **Ejemplo de respuesta INVÁLIDA:**
        \\\`\\\`\\\`json
        {"tasks": [...]}
        \\\`\\\`\\\`
      `;

        // Genera el contenido usando el SDK de Vertex AI.
        const result = await generativeModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        // Extrae el texto de la respuesta.
        const responseText = result.response.candidates[0].content.parts[0].text;

        // Extrae el bloque JSON de la respuesta.
        const jsonMatch = responseText.match(/{[\s\S]*}/);
        if (!jsonMatch) {
            console.error("No valid JSON block found in AI response. Raw response:", responseText);
            throw new Error("No se encontró un bloque JSON válido en la respuesta de la IA.");
        }

        const parsedData = JSON.parse(jsonMatch[0]);

        // Valida la estructura de la respuesta.
        if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.tasks)) {
            throw new Error("La respuesta de la IA no es un JSON válido o no contiene un array de tareas.");
        }

        // Asegura que cada tarea tenga un array de 'tags' válido.
        parsedData.tasks.forEach(task => {
            if (!Array.isArray(task.tags)) {
                task.tags = [];
            }
        });

        return parsedData;

    } catch (error) {
        console.error("Error en organizeTaskWithAI con Vertex AI:", error);
        // Hyper-detailed logging for final diagnosis
        throw new functions.https.HttpsError(
            "internal",
            `Vertex AI Full Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
        );
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
            taskId: t.docId,
            title: t.title,
            priority: t.priority,
            effort: t.effort,
            dueDate: t.dueDate,
            description: t.description ? t.description.substring(0, 100) : undefined,
            creatorUid: t.creatorUid,
        }));

        const prompt = `
        Actúa como "El Planificador Lógico", un asistente de IA ultra-preciso para ${userName}. Tu única función es analizar una lista de tareas y generar un plan de trabajo para la semana siguiendo un conjunto de reglas inflexibles. No tienes permitido desviarte de estas reglas.

        **DATOS DE ENTRADA:**
        - Fecha Actual: ${new Date().toISOString().split('T')[0]}.
        - Semana de Planificación: De Lunes ${weekDates[0]} a Viernes ${weekDates[4]}.
        - Horizonte de Planificación: Solo se considerarán tareas que venzan antes del ${planningHorizonEndDate.toISOString().split('T')[0]}.

        **REGLAS DE PLANIFICACIÓN (NO NEGOCIABLES):**
        1.  **EXCLUSIÓN DE FIN DE SEMANA:** Está terminantemente prohibido asignar una \`plannedDate\` a un Sábado o Domingo.
        2.  **FILTRADO DE TAREAS:** Tu plan SÓLO debe incluir tareas que cumplan una de estas condiciones:
            a) Tareas con \`dueDate\` anterior a la fecha actual (vencidas).
            b) Tareas sin \`dueDate\` (valor nulo).
            c) Tareas con \`dueDate\` dentro del horizonte de planificación.
            **Cualquier otra tarea debe ser ignorada en el plan JSON y mencionada en la sección "Tareas a Futuro".**
        3.  **JERARQUÍA DE PRIORIZACIÓN (SEGUIR EN ESTE ORDEN ESTRICTO):**
            a) **PRIORIDAD 1 (VENCIDAS):** Todas las tareas vencidas DEBEN ser asignadas al Lunes (${weekDates[0]}). Sin excepción.
            b) **PRIORIDAD 2 (FECHA LÍMITE):** La \`dueDate\` es el factor decisivo. Una tarea que vence esta semana tiene prioridad absoluta sobre cualquier otra tarea que no venza esta semana, sin importar el campo \`priority\`. Organiza las tareas para que se completen antes de su \`dueDate\`.
            c) **PRIORIDAD 3 (BALANCE DE CARGA):** Después de aplicar las reglas anteriores, balancea la carga. **Regla de Oro: NUNCA más de UNA (1) tarea con \`effort: 'high'\` por día.** Usa las tareas de esfuerzo 'medium' y 'low' para rellenar los días de manera equitativa.

        **LISTA DE TAREAS A ANALIZAR:**
        \`\`\`json
        ${JSON.stringify(tasksForPrompt, null, 2)}
        \`\`\`

        **FORMATO DE SALIDA (DOS PARTES OBLIGATORIAS):**

        **PARTE 1: EL PLAN (JSON)**
        Genera un objeto JSON que contenga una única clave "plan". El valor debe ser un array de objetos. Cada objeto debe tener esta estructura exacta: \`{ "taskId": "ID_DE_LA_TAREA", "plannedDate": "YYYY-MM-DD" }\`. Si ninguna tarea es planificada, el array debe estar vacío.

        **PARTE 2: EL ANÁLISIS (MARKDOWN)**
        Inserta este separador exacto en una nueva línea después del JSON: \`---JSON_PLAN_SEPARATOR---\`
        Luego, escribe un análisis conciso en Markdown con estas secciones:
        *   \`### 💡 Estrategia Aplicada\`: Describe cómo aplicaste las reglas ("Se priorizaron X tareas vencidas para el lunes. Se balanceó la carga para no exceder una tarea de alto esfuerzo diaria...").
        *   \`### 🎯 Foco de la Semana\`: Lista las 2-3 tareas más críticas del plan.
        *   \`### ⚠️ Riesgos Identificados\`: Menciona si una tarea de alto esfuerzo está muy cerca de su fecha límite.
        *   \`### 🗓️ Tareas Fuera de Horizonte\`: Lista las tareas que ignoraste porque su fecha de vencimiento es muy lejana.

        **REGLA FINAL:** Tu respuesta debe ser únicamente el JSON, el separador y el Markdown. No agregues saludos, explicaciones adicionales ni bloques de código markdown (\`\`\`json).
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

exports.createTaskFromText = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { text } = data;
    if (!text || typeof text !== 'string') {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with a 'text' argument.");
    }

    const { uid } = context.auth;

    try {
        const vertexAI = new VertexAI({ project: process.env.GCLOUD_PROJECT, location: "us-central1" });
        const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const currentDate = new Date().toISOString().split('T')[0];
        const prompt = `
        Analiza el siguiente texto de un usuario y conviértelo en un objeto de tarea JSON.
        Texto: "${text}"
        Fecha de hoy: ${currentDate}.

        Extrae los siguientes campos:
        - title: Un título corto y conciso.
        - description: Una descripción más detallada si está disponible.
        - dueDate: La fecha de vencimiento en formato YYYY-MM-DD. Calcula fechas relativas como "mañana" o "próximo lunes". Si no se menciona fecha, déjalo como null.
        - priority: Estima la prioridad ('high', 'medium', 'low') basado en palabras como "urgente", "importante", etc. Por defecto es 'medium'.

        Tu respuesta DEBE SER ÚNICAMENTE un objeto JSON válido, sin texto adicional ni markdown.
        Ejemplo de respuesta:
        {
          "title": "Llamar a Juan",
          "description": "Discutir la revisión de los planos.",
          "dueDate": "${new Date(Date.now() + 86400000).toISOString().split('T')[0]}",
          "priority": "medium"
        }
        `;

        const result = await generativeModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const responseText = result.response.candidates[0].content.parts[0].text;
        const taskData = JSON.parse(responseText.trim());

        const newTask = {
            ...taskData,
            creatorUid: uid,
            assigneeUid: uid, // Assign to self by default
            status: 'todo',
            createdAt: new Date(),
            updatedAt: new Date(),
            isPublic: false, // Private by default
            search_keywords: taskData.title.toLowerCase().split(' ').filter(w => w.length > 2)
        };

        await admin.firestore().collection('tareas').add(newTask);

        return { success: true, message: "Tarea creada con IA exitosamente." };

    } catch (error) {
        console.error("Error en createTaskFromText con Vertex AI:", error);
        throw new functions.https.HttpsError("internal", "Error al procesar la tarea con IA.");
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