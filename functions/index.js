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
        // If the counter is for the current year, increment it.
        // Otherwise, reset it for the new year.
        if (counterData.year === currentYear) {
          nextNumber = (counterData.count || 0) + 1;
        }
      }

      // Update the counter in the transaction.
      transaction.set(
          counterRef,
          {count: nextNumber, year: currentYear},
          {merge: true},
      );

      // Return the formatted ECR number.
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
        const vertexAI = new VertexAI({
            project: process.env.GCLOUD_PROJECT,
            location: "us-central1",
        });

        const generativeModel = vertexAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const user = await admin.auth().getUser(context.auth.uid);
        const userName = user.displayName || user.email;

        // --- Improved Date Logic ---
        const today = new Date();
        const dayOfWeek = today.getUTCDay(); // Sunday = 0, Saturday = 6

        let effectiveOffset = weekOffset || 0;
        // If it's Saturday or Sunday and the user is viewing the current week, plan for the next week.
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
        - **Regla de Planificación Principal:** Solo debes incluir en el plan las siguientes tareas:
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
        1.  **Filtra y Distribuye:** De la lista de tareas, selecciona solo las que cumplen la "Regla de Planificación Principal". Asigna a cada una una nueva fecha de vencimiento (\`newDueDate\`) dentro de la semana de planificación (${weekDates[0]} a ${weekDates[4]}).
        2.  **Prioriza Inteligentemente:**
            - **Lunes/Martes (Máxima Urgencia):** Asigna aquí las tareas vencidas y las de prioridad 'high' que vencen esta semana. Despeja los bloqueos primero.
            - **Miércoles/Jueves (Foco Principal):** Asigna las tareas de prioridad 'medium' y las tareas importantes sin fecha.
            - **Viernes (Cierre de Semana):** Asigna tareas de prioridad 'low' o aquellas que son menos urgentes.
        3.  **Equilibrio de Carga:** No sobrecargues un solo día. Distribuye el trabajo de manera lógica y realista a lo largo de los 5 días.
        4.  **Formato de Salida JSON:** Genera un objeto JSON con una única clave "plan". El valor debe ser un array de objetos, cada uno con la forma: \`{ "taskId": "ID_DE_LA_TAREA", "newDueDate": "YYYY-MM-DD" }\`. Si ninguna tarea cumple los criterios, devuelve un array vacío: \`{ "plan": [] }\`.

        **PARTE 2: El Análisis (Markdown)**
        1.  **Separador:** Después del bloque JSON, inserta este separador exacto en su propia línea: \`---JSON_PLAN_SEPARATOR---\`
        2.  **Análisis Detallado:** Debajo del separador, escribe un análisis en formato Markdown con las siguientes secciones:
            *   \`### 💡 Estrategia de Planificación\`: Explica brevemente tu lógica (ej: "He priorizado las tareas vencidas para el lunes para despejar bloqueos y he distribuido las de media prioridad a mitad de semana...").
            *   \`### 🎯 Foco de la Semana\`: Lista 2-3 tareas del plan que consideras más críticas.
            *   \`### ⚠️ Puntos de Atención\`: Menciona cualquier riesgo, como una alta concentración de tareas de alta prioridad o tareas sin fecha que necesitan más definición.
            *   \`### 🗓️ Tareas a Futuro\`: Si ignoraste tareas porque su vencimiento es lejano, menciónalas brevemente aquí para que el usuario no las olvide.

        **Formato Final de Respuesta (Regla Inquebrantable):**
        Tu respuesta DEBE ser el bloque JSON, seguido del separador, y luego el análisis en Markdown. No incluyas texto introductorio, ni explicaciones adicionales, ni bloques de código markdown (\`\`\`json\`). La respuesta debe empezar con \`{\` y terminar con el texto del análisis.
        `;

        const result = await generativeModel.generateContent({ contents: [{ role: "user", parts: [{ text: prompt }] }] });
        let responseText = result.response.candidates[0].content.parts[0].text;

        // Clean the response to remove potential markdown wrappers.
        responseText = responseText.replace(/^```json\s*/, '').replace(/```\s*$/, '');

        const separator = '---JSON_PLAN_SEPARATOR---';
        const parts = responseText.split(separator);

        if (parts.length < 2) {
            console.error("AI response did not contain the separator:", responseText);
            throw new Error("La respuesta de la IA no contiene el separador requerido. No se pudo analizar el plan.");
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
        throw new functions.https.HttpsError(
            "internal",
            `Ocurrió un error al analizar las tareas con IA. Error: ${error.message}`
        );
    }
});

exports.getTaskSummaryWithAI = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { tasks, question } = data;
    if (!tasks || !Array.isArray(tasks) || !question) {
        throw new functions.https.HttpsError("invalid-argument", "The function must be called with 'tasks' (array) and 'question' (string) arguments.");
    }

    const questionMap = {
        summary: "Genera un resumen conciso del estado general de las tareas. Indica cuántas hay en cada estado (Por Hacer, En Progreso, Completadas) y cualquier observación general.",
        urgent: "Identifica las 3 tareas más urgentes. Basa tu criterio en la combinación de su fecha de vencimiento (dueDate) y su prioridad (priority). Menciona por qué cada una es urgente.",
        at_risk: "Analiza las tareas y detecta cuáles están en riesgo de no completarse a tiempo. Considera tareas con alta prioridad y fechas de vencimiento cercanas que no estén 'En Progreso', o tareas que lleven mucho tiempo sin actualizarse.",
        blocked: "Revisa los títulos, descripciones y comentarios de las tareas para identificar si alguna está bloqueada. Busca frases como 'bloqueado por', 'esperando a', 'no puedo continuar hasta', etc. Si no encuentras ninguna, indícalo explícitamente."
    };

    const fullQuestion = questionMap[question];
    if (!fullQuestion) {
        throw new functions.https.HttpsError("invalid-argument", "The 'question' provided is not a valid one.");
    }

    try {
        const vertexAI = new VertexAI({
            project: process.env.GCLOUD_PROJECT,
            location: "us-central1",
        });

        const generativeModel = vertexAI.getGenerativeModel({
            model: "gemini-2.0-flash",
        });

        const tasksForPrompt = tasks.map(t => ({
            title: t.title,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
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

        **Pregunta del usuario:**
        "${fullQuestion}"

        **Instrucciones de formato para tu respuesta:**
        - Responde en español.
        - Usa un lenguaje claro y directo.
        - Utiliza viñetas (markdown) para listar los puntos clave.
        - Si una tarea es relevante, menciónala usando **negrita** para el título.
        - Tu respuesta debe ser solo el texto del análisis, sin saludos ni despedidas. No envuelvas tu respuesta en JSON o markdown.
      `;

        const result = await generativeModel.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
        });

        const responseText = result.response.candidates[0].content.parts[0].text;

        return { summary: responseText };

    } catch (error) {
        console.error("Error en getTaskSummaryWithAI con Vertex AI:", error);
        // Hyper-detailed logging for final diagnosis
        throw new functions.https.HttpsError(
            "internal",
            `Vertex AI Full Error: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`
        );
    }
});

exports.enviarRecordatoriosDeVencimiento = functions.runWith({ secrets: ["TELEGRAM_TOKEN"] }).pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires")
  .onRun(async (context) => {
    console.log("Ejecutando la revisión de recordatorios de vencimiento de tareas.");

    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    if (!TELEGRAM_TOKEN) {
        console.error("El token de Telegram no está configurado.");
        return null;
    }

    const db = admin.firestore();
    const tasksRef = db.collection("tareas");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    try {
      // Busca tareas no completadas que venzan mañana.
      const snapshot = await tasksRef
        .where("status", "!=", "done")
        .where("dueDate", "==", tomorrowStr)
        .get();

      if (snapshot.empty) {
        console.log("No se encontraron tareas que venzan mañana.");
        return null;
      }

      for (const doc of snapshot.docs) {
        const task = doc.data();
        const assigneeUid = task.assigneeUid;

        if (!assigneeUid) {
          console.log(`La tarea ${task.title} no tiene un asignado.`);
          continue;
        }

        const userDoc = await db.collection('usuarios').doc(assigneeUid).get();
        if (!userDoc.exists) {
          console.log(`No se encontró el documento de usuario para UID ${assigneeUid}.`);
          continue;
        }

        const userData = userDoc.data();
        const telegramChatId = userData.telegramChatId;
        const notificationPrefs = userData.telegramNotifications || {};

        // La preferencia 'onDueDateReminder' se guarda desde el frontend,
        // por lo que solo se envían recordatorios si no fue deshabilitada.
        if (telegramChatId && notificationPrefs.onDueDateReminder !== false) {
          const mensaje = `🔔 *Recordatorio de Vencimiento* 🔔\n\nLa tarea "*${task.title}*" vence mañana, ${task.dueDate}.`;
          const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

          try {
            await axios.post(url, {
              chat_id: telegramChatId,
              text: mensaje,
              parse_mode: "Markdown",
            });
            console.log(`Recordatorio de vencimiento enviado al usuario ${assigneeUid} para la tarea ${doc.id}`);
          } catch (error) {
            console.error(`Error al enviar mensaje de Telegram al usuario ${assigneeUid}:`, error.response ? error.response.data : error.message);
          }
        } else {
            console.log(`El usuario ${assigneeUid} no tiene activados los recordatorios de vencimiento o no tiene chat ID.`);
        }
      }
      return null;
    } catch (error) {
      console.error("Error al procesar los recordatorios de vencimiento de tareas:", error);
      return null;
    }
  });

exports.sendTaskNotification = functions
  .runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .firestore.document('tareas/{taskId}')
  .onWrite(async (change, context) => {
    const beforeData = change.before.exists ? change.before.data() : null;
    const afterData = change.after.exists ? change.after.data() : null;

    if (!afterData) {
      console.log(`Task ${context.params.taskId} deleted. No notification sent.`);
      return null;
    }

    const taskId = context.params.taskId;
    let message = null;
    let targetUid = null;

    const wasJustCreated = !beforeData && afterData;
    const statusChanged = beforeData && afterData.status !== beforeData.status;

    // Notification for New Task Assignment
    if (wasJustCreated && afterData.assigneeUid) {
        targetUid = afterData.assigneeUid;
        const creator = await admin.auth().getUser(afterData.creatorUid);
        message = `🔔 *Nueva Tarea Asignada*\n\n*Tarea:* ${afterData.title}\n*Asignada por:* ${creator.displayName || creator.email}`;
    }
    // Notification for Task Status Change
    else if (statusChanged && afterData.creatorUid) {
        targetUid = afterData.creatorUid;
        const assignee = afterData.assigneeUid ? await admin.auth().getUser(afterData.assigneeUid) : null;
        const assigneeName = assignee ? (assignee.displayName || assignee.email) : 'Nadie';
        message = `✅ *Actualización de Tarea*\n\nLa tarea *${afterData.title}* que creaste ha cambiado su estado a *${afterData.status}* por ${assigneeName}.`;
    }

    if (!message || !targetUid) {
      console.log(`No notification condition met for task ${taskId}.`);
      return null;
    }

    try {
      const userDoc = await admin.firestore().collection('usuarios').doc(targetUid).get();
      if (!userDoc.exists) {
        console.log(`User document for UID ${targetUid} not found.`);
        return null;
      }

      const userData = userDoc.data();
      const telegramChatId = userData.telegramChatId;

      if (!telegramChatId) {
        console.log(`User ${targetUid} has not configured their Telegram Chat ID.`);
        return null;
      }

      const notificationPrefs = userData.telegramNotifications || {};
      if (wasJustCreated && notificationPrefs.onAssignment === false) {
          console.log(`User ${targetUid} has disabled 'onAssignment' notifications.`);
          return null;
      }
      if (statusChanged && notificationPrefs.onStatusChange === false) {
          console.log(`User ${targetUid} has disabled 'onStatusChange' notifications.`);
          return null;
      }

      const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

      await axios.post(url, {
        chat_id: telegramChatId,
        text: message,
        parse_mode: 'Markdown'
      });

      console.log(`Telegram notification sent to user ${targetUid} for task ${taskId}.`);
      return null;

    } catch (error) {
      console.error(`Failed to send Telegram notification for task ${taskId}:`, error);
      if (error.response) {
        console.error('Telegram API Error:', error.response.data);
      }
      return null;
    }
  });

exports.sendTestTelegramMessage = functions
  .runWith({ secrets: ["TELEGRAM_TOKEN"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "The function must be called while authenticated."
      );
    }
    const uid = context.auth.uid;

    try {
      const userDoc = await admin.firestore().collection("usuarios").doc(uid).get();
      if (!userDoc.exists) {
        throw new functions.https.HttpsError("not-found", "User document not found.");
      }
      const telegramChatId = userDoc.data().telegramChatId;

      if (!telegramChatId) {
        throw new functions.https.HttpsError(
          "failed-precondition",
          "El Chat ID de Telegram no está configurado para este usuario."
        );
      }

      const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
      const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
      const message = "¡Hola! 👋 Esta es una prueba de notificación de Telegram desde Gestión PRO. ¡La configuración funciona!";

      await axios.post(url, {
        chat_id: telegramChatId,
        text: message,
        parse_mode: "Markdown",
      });

      console.log(`Test message sent to user ${uid} at chat ID ${telegramChatId}`);
      return { success: true, message: "Mensaje de prueba enviado con éxito." };

    } catch (error) {
      console.error(`Error sending test message to user ${uid}:`, error);
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      throw new functions.https.HttpsError(
        "internal",
        "Ocurrió un error inesperado al enviar el mensaje de prueba."
      );
    }
  });

exports.updateCollectionCounts = functions.firestore
  .document('{collectionId}/{docId}')
  .onWrite(async (change, context) => {
    const collectionId = context.params.collectionId;
    const collectionsToCount = ['productos', 'insumos', 'proyectos', 'tareas'];

    if (!collectionsToCount.includes(collectionId)) {
        return null;
    }

    const db = admin.firestore();
    const collectionRef = db.collection(collectionId);
    const snapshot = await collectionRef.count().get();
    const count = snapshot.data().count;

    const counterRef = db.collection('counters').doc('kpi_counts');

    console.log(`Updating count for ${collectionId} to ${count}`);

    return counterRef.set({
        [collectionId]: count
    }, { merge: true });
});

exports.listModels = functions.https.onCall(async (data, context) => {
  const bucket = admin.storage().bucket();
  const directory = '/'; // List from the root directory

  try {
    const [files] = await bucket.getFiles({ prefix: directory });
    const glbFiles = files.filter((file) => file.name.endsWith(".glb"));

    const signedUrls = await Promise.all(
      glbFiles.map(async (file) => {
        const [url] = await file.getSignedUrl({
          action: "read",
          expires: Date.now() + 1000 * 60 * 60 * 2, // 2 hours
        });
        return {
          name: file.name.replace(".glb", ""),
          url: url,
        };
      })
    );

    return { models: signedUrls };
  } catch (error) {
    console.error("Error listing models from Firebase Storage:", error);
    throw new functions.https.HttpsError(
      "internal",
      "No se pudieron listar los modelos.",
      error.message
    );
  }
});

exports.enviarRecordatoriosDiarios = functions.pubsub.schedule("every day 09:00")
  .timeZone("America/Argentina/Buenos_Aires") // Ajusta a tu zona horaria
  .onRun(async (context) => {
    console.log("Ejecutando la revisión de recordatorios diarios.");

    const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
    const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

    if (!TELEGRAM_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log("Telegram token or chat ID not set.");
        return null;
    }

    const db = admin.firestore();
    const recordatoriosRef = db.collection("recordatorios");

    // Obtenemos la fecha de hoy para comparar
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0); // Inicio del día

    const manana = new Date(hoy);
    manana.setDate(hoy.getDate() + 1); // Fin del día (inicio de mañana)

    try {
      // Buscamos recordatorios cuya fecha de vencimiento sea hoy
      const snapshot = await recordatoriosRef
        .where("fechaVencimiento", ">=", hoy)
        .where("fechaVencimiento", "<", manana)
        .get();

      if (snapshot.empty) {
        console.log("No se encontraron recordatorios para hoy.");
        return null;
      }

      // Para cada recordatorio encontrado, enviamos un mensaje
      for (const doc of snapshot.docs) {
        const recordatorio = doc.data();
        const mensaje = `🔔 ¡Recordatorio! Hoy vence: ${recordatorio.descripcion}`;

        const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
        await axios.post(url, {
          chat_id: TELEGRAM_CHAT_ID,
          text: mensaje,
        });
        console.log(`Mensaje enviado para: ${recordatorio.descripcion}`);
      }

      return null;

    } catch (error) {
      console.error("Error al procesar recordatorios:", error);
      return null;
    }
  });
