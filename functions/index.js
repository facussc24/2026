const functions = require("firebase-functions");
const admin = require("firebase-admin");
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

exports.organizeTaskWithAI = functions
  .runWith({ secrets: ["GEMINI_API_KEY"] })
  .https.onCall(async (data, context) => {
    // Guardian 1: Log de entrada
    console.log("--- organizeTaskWithAI: Inicio de ejecución ---");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Contexto de autenticación (UID):", context.auth ? context.auth.uid : "No autenticado");
    console.log("Datos de entrada (data.text):", JSON.stringify(data.text));

    if (!context.auth) {
      console.error("Error: Intento de llamada no autenticado.");
      throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const text = data.text;
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      console.error("Error: El argumento 'text' está ausente o es inválido.", { text });
      throw new functions.https.HttpsError("invalid-argument", "The function must be called with a non-empty 'text' argument.");
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      const model = "gemini-pro";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const prompt = `
        Analiza el siguiente texto de un usuario. Tu objetivo principal es identificar si el texto describe una única tarea o múltiples tareas distintas que deberían gestionarse por separado.

        Texto del usuario: "${text}"

        Sigue estas instrucciones:
        1.  **Análisis de Tareas Múltiples**: Si el texto contiene varias acciones claramente separables (por ejemplo, "Revisar los planos del chasis y luego llamar al proveedor para confirmar la entrega del material"), debes crear un objeto de tarea separado para cada acción. Si el texto describe una sola acción con varios pasos, trátalo como una única tarea con subtareas.
        2.  **Estructuración de Cada Tarea**: Para cada tarea identificada (sea una o varias), crea un objeto JSON con la siguiente estructura:
            *   **title**: Un título conciso y claro (máximo 10 palabras).
            *   **description**: Un resumen corto (2-3 frases) del objetivo de la tarea.
            *   **subtasks**: Una lista de subtareas cortas y accionables (si aplica).
            *   **priority**: 'high' (urgente), 'medium' (normal), o 'low' (sin prisa).
            *   **startDate**: Fecha de inicio en formato 'YYYY-MM-DD' si se menciona, si no, null.
            *   **dueDate**: Fecha límite en formato 'YYYY-MM-DD' si se menciona, si no, null.
            *   **assignee**: Nombre de la persona a asignar si se menciona, si no, null.
            *   **isPublic**: 'true' si es una tarea de equipo/ingeniería/proyecto, 'false' si es personal.
            *   **project**: Nombre del proyecto si se menciona, si no, null.
        3.  **Corrección de Texto**: En los títulos y descripciones, corrige errores ortográficos y gramaticales obvios para mayor claridad. Mantén acrónimos o jerga técnica (ej. 'AMFE') si no estás seguro.

        **Formato de Salida OBLIGATORIO**:
        Tu respuesta DEBE ser un único objeto JSON que contenga una sola clave: "tasks". El valor de "tasks" debe ser un ARRAY de los objetos de tarea que has creado. NO incluyas el JSON dentro de un bloque de código markdown.

        **Ejemplo 1 (Una sola tarea con subtareas)**:
        Texto: 'necesito organizar reunion con Marcelo Nieve para el AMFE para el proximo lunes'
        Salida:
        {
          "tasks": [
            {
              "title": "Organizar reunión para AMFE",
              "description": "Organizar una reunión con Marcelo Nieve para discutir el Análisis de Modos y Efectos de Falla (AMFE).",
              "subtasks": ["Agendar reunión con Marcelo Nieve", "Preparar agenda para la reunión de AMFE"],
              "priority": "medium",
              "startDate": null,
              "dueDate": "2025-09-30",
              "assignee": "Marcelo Nieve",
              "isPublic": true,
              "project": null
            }
          ]
        }

        **Ejemplo 2 (Múltiples tareas separadas)**:
        Texto: 'Revisar los planos del chasis esta tarde y mañana llamar al proveedor ACME para confirmar la entrega del material.'
        Salida:
        {
          "tasks": [
            {
              "title": "Revisar planos del chasis",
              "description": "Revisar los planos técnicos del componente del chasis para verificar las últimas modificaciones.",
              "subtasks": [],
              "priority": "medium",
              "startDate": null,
              "dueDate": "2025-09-25",
              "assignee": null,
              "isPublic": true,
              "project": null
            },
            {
              "title": "Confirmar entrega con proveedor ACME",
              "description": "Llamar al proveedor ACME para confirmar la fecha y hora de entrega del material solicitado.",
              "subtasks": ["Obtener número de orden de compra", "Llamar a ACME"],
              "priority": "medium",
              "startDate": "2025-09-26",
              "dueDate": "2025-09-26",
              "assignee": null,
              "isPublic": true,
              "project": null
            }
          ]
        }
      `;

      const requestBody = {
        contents: [{
          parts: [{
            text: prompt,
          }],
        }],
      };

      // Guardian 2: Log de lo que se envía a la IA
      console.log("--- organizeTaskWithAI: Enviando a Gemini API ---");
      console.log("URL:", url);
      console.log("Prompt (primeros 200 caracteres):", prompt.substring(0, 200) + "...");

      const apiResponse = await axios.post(url, requestBody);

      // Guardian 3: Log de la respuesta cruda de la IA
      console.log("--- organizeTaskWithAI: Respuesta recibida de Gemini API ---");
      console.log("Status:", apiResponse.status);
      console.log("Response Data:", JSON.stringify(apiResponse.data, null, 2));

      if (!apiResponse.data || !apiResponse.data.candidates || !apiResponse.data.candidates[0] || !apiResponse.data.candidates[0].content || !apiResponse.data.candidates[0].content.parts || !apiResponse.data.candidates[0].content.parts[0]) {
          console.error("Error: La respuesta de la IA no tiene la estructura esperada.", apiResponse.data);
          throw new Error("La respuesta de la IA tiene un formato inesperado o está vacía.");
      }

      const responseText = apiResponse.data.candidates[0].content.parts[0].text;
      console.log("Texto extraído de la respuesta:", responseText);

      let parsedData;
      try {
          // Guardian 4: Intento de parseo
          const jsonMatch = responseText.match(/{[\s\S]*}/);
          if (!jsonMatch) {
              console.error("No se encontró un bloque JSON válido en la respuesta de la IA. Respuesta cruda:", responseText);
              throw new Error("No se encontró un bloque JSON válido en la respuesta de la IA.");
          }

          const jsonString = jsonMatch[0];
          console.log("JSON String a parsear:", jsonString);

          parsedData = JSON.parse(jsonString);
          console.log("--- organizeTaskWithAI: JSON parseado con éxito ---", JSON.stringify(parsedData, null, 2));

      } catch (jsonError) {
          console.error("--- organizeTaskWithAI: Fallo al parsear JSON ---");
          console.error("Error de parseo:", jsonError.message);
          console.error("Texto que falló el parseo:", responseText);
          throw new Error(`La respuesta de la IA no es un JSON válido. ${jsonError.message}`);
      }

      // Guardian 5: Validación de la estructura del JSON
      if (!parsedData || typeof parsedData !== 'object' || !Array.isArray(parsedData.tasks)) {
          console.error("--- organizeTaskWithAI: Error de validación de estructura ---");
          console.error("El JSON parseado no tiene la clave 'tasks' o no es un array.", parsedData);
          throw new Error("La respuesta de la IA no contiene un array de tareas ('tasks').");
      }

      if (parsedData.tasks.length === 0) {
        console.log("--- organizeTaskWithAI: La IA devolvió un array de tareas vacío ---");
      }

      console.log("--- organizeTaskWithAI: Ejecución exitosa ---");
      return parsedData;

    } catch (error) {
      console.error("--- Detailed Error in organizeTaskWithAI ---");
      console.error("Timestamp:", new Date().toISOString());
      console.error("Input Text:", text.substring(0, 100) + "...");

      if (error.response) {
        console.error("Gemini API Response Error Status:", error.response.status);
        console.error("Gemini API Response Data:", JSON.stringify(error.response.data, null, 2));
      } else if (error.request) {
        console.error("Gemini API No Response Received:", error.request);
      } else {
        console.error("Error message:", error.message);
      }

      console.error("Full Error Object:", JSON.stringify(error, null, 2));
      console.error("--- End of Detailed Error ---");

      throw new functions.https.HttpsError(
        "internal",
        error.message || "Ocurrió un error al procesar la solicitud con la IA.",
        "Check the function logs for more details."
      );
    }
  });

exports.getTaskSummaryWithAI = functions
  .runWith({ secrets: ["GEMINI_API_KEY"] })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "The function must be called while authenticated.");
    }

    const { tasks, question } = data;
    if (!tasks || !Array.isArray(tasks) || !question) {
      throw new functions.https.HttpsError("invalid-argument", "The function must be called with 'tasks' (array) and 'question' (string) arguments.");
    }

    // To make the prompt more robust, we map the simple question key to a full, descriptive question.
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
      const apiKey = process.env.GEMINI_API_KEY;
      const model = "gemini-pro";
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      // We are sending a subset of task data to avoid sending too much information
      const tasksForPrompt = tasks.map(t => ({
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate,
          description: t.description ? t.description.substring(0, 100) : undefined // Limit description length
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

      const requestBody = {
        contents: [{
          parts: [{ text: prompt }],
        }],
      };

      const apiResponse = await axios.post(url, requestBody);

      const responseText = apiResponse.data.candidates[0].content.parts[0].text;

      return { summary: responseText };

    } catch (error) {
      console.error("Error calling Gemini API for task summary:", error.response ? error.response.data : error.message);
      throw new functions.https.HttpsError(
        "internal",
        "Ocurrió un error al generar el resumen con la IA.",
        error.message
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
