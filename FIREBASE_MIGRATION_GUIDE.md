# Guía de Migración a Firebase

## Resumen

Esta guía describe cómo migrar la aplicación AMFE/FMEA de un backend Node.js con almacenamiento en archivos JSON a Firebase (Firestore y Firebase Hosting).

## Estado Actual

### Arquitectura Actual
- **Backend**: Node.js + Express
- **Almacenamiento**: Archivos JSON locales (`data/docs.json` y `data/amfes/`)
- **Frontend**: HTML/CSS/JavaScript vanilla
- **Servidor estático**: Express sirve archivos desde `/public`

### Estructura de Datos
```javascript
// Metadatos de documentos (docs.json)
[
  {
    id: "doc1234567890",
    name: "Nombre del AMFE",
    lastModified: "2024-01-01T00:00:00.000Z"
  }
]

// Contenido de documento individual (data/amfes/doc1234567890.json)
{
  general: { orgName, tema, numeroAmfe, ... },
  items: [ ... ],
  selected: { itemId, stepId, elementId }
}
```

## Migración a Firebase

### 1. Configuración de Firebase

#### 1.1 Crear Proyecto Firebase
1. Ir a [Firebase Console](https://console.firebase.google.com/)
2. Crear nuevo proyecto
3. Habilitar Firestore Database
4. Habilitar Firebase Hosting (opcional)
5. Habilitar Authentication (recomendado para multi-usuario)

#### 1.2 Instalar Firebase CLI
```bash
npm install -g firebase-tools
firebase login
firebase init
```

#### 1.3 Agregar Firebase al proyecto
```bash
npm install firebase
```

### 2. Cambios Requeridos en el Código

#### 2.1 Configuración de Firebase (nuevo archivo)

Crear `public/firebase-config.js`:
```javascript
// Configuración de Firebase - Reemplazar con tus credenciales
const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto-id",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
```

#### 2.2 Modificar script.js

**Reemplazar funciones de API REST con Firestore:**

```javascript
// ANTES (REST API)
async function loadAllDocs() {
  const res = await fetch('/api/docs');
  return await res.json();
}

// DESPUÉS (Firestore)
async function loadAllDocs() {
  const snapshot = await db.collection('amfes').get();
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
}
```

```javascript
// ANTES: Crear documento
async function createDoc(name) {
  const res = await fetch('/api/docs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  return await res.json();
}

// DESPUÉS: Firestore
async function createDoc(name) {
  const docRef = await db.collection('amfes').add({
    name: name || 'Nuevo AMFE',
    lastModified: firebase.firestore.FieldValue.serverTimestamp(),
    content: {
      general: { /* ... */ },
      items: [],
      selected: { itemId: null, stepId: null, elementId: null }
    }
  });
  return { id: docRef.id, name };
}
```

```javascript
// ANTES: Obtener documento
async function loadDoc(id) {
  const res = await fetch(`/api/docs/${id}`);
  return await res.json();
}

// DESPUÉS: Firestore
async function loadDoc(id) {
  const doc = await db.collection('amfes').doc(id).get();
  if (!doc.exists) {
    throw new Error('Documento no encontrado');
  }
  return doc.data().content;
}
```

```javascript
// ANTES: Actualizar documento
async function updateDoc(id, name, content) {
  const res = await fetch(`/api/docs/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, content })
  });
  return await res.json();
}

// DESPUÉS: Firestore
async function updateDoc(id, name, content) {
  await db.collection('amfes').doc(id).update({
    name,
    content,
    lastModified: firebase.firestore.FieldValue.serverTimestamp()
  });
  return { id, name };
}
```

```javascript
// ANTES: Eliminar documento
async function deleteDoc(id) {
  const res = await fetch(`/api/docs/${id}`, {
    method: 'DELETE'
  });
  return await res.json();
}

// DESPUÉS: Firestore
async function deleteDoc(id) {
  await db.collection('amfes').doc(id).delete();
  return { success: true };
}
```

#### 2.3 Actualizar index.html y home.html

Agregar scripts de Firebase antes de `script.js`:

```html
<!-- Firebase SDKs -->
<script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-firestore-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-auth-compat.js"></script>

<!-- Firebase configuration -->
<script src="firebase-config.js"></script>

<!-- Application script -->
<script src="script.js"></script>
```

### 3. Estructura de Firestore

#### 3.1 Colección Principal: `amfes`

```
amfes/
  {docId}/
    - name: string
    - lastModified: timestamp
    - createdBy: string (userId si hay auth)
    - content: object
      - general: object
      - items: array
      - selected: object
      - controlHeader: object
```

#### 3.2 Reglas de Seguridad (Firestore Rules)

**Sin autenticación (para pruebas):**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /amfes/{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Con autenticación (recomendado):**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /amfes/{docId} {
      // Solo usuarios autenticados pueden leer/escribir
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      // Solo el creador puede editar/eliminar
      allow update, delete: if request.auth != null 
        && resource.data.createdBy == request.auth.uid;
    }
  }
}
```

### 4. Hosting en Firebase

#### 4.1 Configurar Firebase Hosting

```bash
firebase init hosting
```

Seleccionar:
- Public directory: `public`
- Configure as single-page app: No
- Set up automatic builds: No

#### 4.2 Archivo firebase.json

```json
{
  "hosting": {
    "public": "public",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/",
        "destination": "/home.html"
      }
    ]
  },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  }
}
```

#### 4.3 Deploy

```bash
firebase deploy
```

### 5. Autenticación (Opcional pero Recomendado)

#### 5.1 Habilitar Métodos de Autenticación

En Firebase Console:
1. Authentication → Sign-in method
2. Habilitar Email/Password o Google

#### 5.2 Agregar Login al Frontend

Crear `public/login.html`:
```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Login - AMFE</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="login-container">
    <h1>Iniciar Sesión</h1>
    <input type="email" id="email" placeholder="Email">
    <input type="password" id="password" placeholder="Contraseña">
    <button id="login-btn">Iniciar Sesión</button>
    <button id="register-btn">Registrarse</button>
  </div>
  
  <script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/9.x.x/firebase-auth-compat.js"></script>
  <script src="firebase-config.js"></script>
  <script>
    const auth = firebase.auth();
    
    document.getElementById('login-btn').addEventListener('click', async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      try {
        await auth.signInWithEmailAndPassword(email, password);
        window.location.href = 'home.html';
      } catch (error) {
        alert('Error: ' + error.message);
      }
    });
    
    document.getElementById('register-btn').addEventListener('click', async () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      try {
        await auth.createUserWithEmailAndPassword(email, password);
        window.location.href = 'home.html';
      } catch (error) {
        alert('Error: ' + error.message);
      }
    });
  </script>
</body>
</html>
```

Agregar verificación de autenticación en `home.html` y `index.html`:
```javascript
firebase.auth().onAuthStateChanged(user => {
  if (!user) {
    window.location.href = 'login.html';
  }
});
```

### 6. Migración de Datos Existentes

Para migrar datos existentes de JSON a Firestore:

```javascript
// Script de migración (ejecutar con Node.js)
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

// Inicializar Firebase Admin SDK
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateData() {
  // Leer docs.json
  const docsData = JSON.parse(fs.readFileSync('./data/docs.json', 'utf8'));
  
  for (const doc of docsData) {
    // Leer contenido del documento
    const contentPath = path.join('./data/amfes', `${doc.id}.json`);
    const content = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
    
    // Guardar en Firestore
    await db.collection('amfes').doc(doc.id).set({
      name: doc.name,
      lastModified: new Date(doc.lastModified),
      content: content
    });
    
    console.log(`Migrado: ${doc.name}`);
  }
  
  console.log('Migración completada');
}

migrateData();
```

### 7. Ventajas de Firebase

1. **Escalabilidad automática**: No requiere gestión de servidor
2. **Sincronización en tiempo real**: Múltiples usuarios pueden trabajar simultáneamente
3. **Offline support**: Funciona sin conexión y sincroniza al reconectar
4. **Hosting gratuito**: Incluye SSL automático
5. **Autenticación integrada**: Gestión de usuarios simplificada
6. **Backup automático**: Firebase maneja los backups

### 8. Costos

Firebase tiene un plan gratuito (Spark) que incluye:
- 1 GB de almacenamiento
- 10 GB/mes de transferencia
- 50,000 lecturas/día
- 20,000 escrituras/día

Para aplicaciones pequeñas/medianas, el plan gratuito es suficiente.

### 9. Resumen de Archivos a Modificar

| Archivo | Cambios Requeridos |
|---------|-------------------|
| `public/index.html` | Agregar scripts Firebase |
| `public/home.html` | Agregar scripts Firebase |
| `public/script.js` | Reemplazar fetch API con Firestore |
| `public/firebase-config.js` | Nuevo archivo con configuración |
| `public/login.html` | Nuevo archivo (opcional) |
| `firebase.json` | Nuevo archivo de configuración |
| `firestore.rules` | Nuevo archivo con reglas de seguridad |
| `server.js` | ❌ Ya no necesario |
| `package.json` | Actualizar dependencias |

### 10. Testing

Antes de hacer el deploy completo:
1. Crear proyecto de prueba en Firebase
2. Probar todas las funciones (crear, leer, actualizar, eliminar)
3. Verificar funcionamiento offline
4. Probar con múltiples usuarios
5. Verificar reglas de seguridad

## Conclusión

La migración a Firebase simplifica significativamente la infraestructura y mejora la escalabilidad. El mayor cambio es reemplazar las llamadas REST API por métodos de Firestore, pero la lógica de negocio permanece igual.
