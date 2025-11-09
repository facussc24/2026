# Guía de Configuración de Firebase - AMFE/FMEA

## ¡Bienvenido a la versión Firebase de AMFE!

Esta aplicación ahora usa Firebase Firestore en lugar de un servidor Node.js. Sigue esta guía paso a paso para configurar tu proyecto.

---

## Paso 1: Crear Proyecto Firebase

### 1.1 Ir a Firebase Console
1. Ve a: https://console.firebase.google.com/
2. Haz clic en **"Agregar proyecto"** o **"Add project"**

### 1.2 Configurar el proyecto
1. **Nombre del proyecto**: Escribe un nombre (ej: "amfe-2026")
2. **Google Analytics**: Puedes deshabilitarlo si no lo necesitas
3. Haz clic en **"Crear proyecto"**
4. Espera a que se cree (toma unos segundos)

---

## Paso 2: Configurar Firestore Database

### 2.1 Crear la base de datos
1. En el menú lateral, ve a **"Firestore Database"**
2. Haz clic en **"Crear base de datos"** o **"Create database"**

### 2.2 Modo de seguridad
Elige **"Comenzar en modo de prueba"** o **"Start in test mode"**
- Esto permite leer/escribir sin autenticación por 30 días
- Más adelante configuraremos reglas de seguridad

### 2.3 Ubicación
Elige la ubicación más cercana a tus usuarios (ej: "us-central" para América)

---

## Paso 3: Obtener Credenciales de Firebase

### 3.1 Registrar la aplicación web
1. En la página principal del proyecto, haz clic en el ícono **Web** (</>)
2. **Nombre de la app**: "AMFE Web App" (o el que prefieras)
3. **NO** marques "Firebase Hosting" por ahora
4. Haz clic en **"Registrar app"**

### 3.2 Copiar la configuración
Verás algo como esto:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

**¡GUARDA ESTA INFORMACIÓN!** La necesitarás en el siguiente paso.

---

## Paso 4: Configurar tu Aplicación

### 4.1 Abrir el archivo de configuración
Abre el archivo: `public/firebase-config.js`

### 4.2 Reemplazar las credenciales
Reemplaza estos valores con los de TU proyecto Firebase:

```javascript
const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI",              // ← Copia tu apiKey
  authDomain: "TU_PROJECT_ID.firebaseapp.com",  // ← Copia tu authDomain
  projectId: "TU_PROJECT_ID",              // ← Copia tu projectId
  storageBucket: "TU_PROJECT_ID.appspot.com",   // ← Copia tu storageBucket
  messagingSenderId: "TU_SENDER_ID",       // ← Copia tu messagingSenderId
  appId: "TU_APP_ID"                       // ← Copia tu appId
};
```

### 4.3 Guardar el archivo
Guarda los cambios en `public/firebase-config.js`

---

## Paso 5: Ejecutar la Aplicación

### 5.1 Instalar dependencias (primera vez)
```bash
npm install
```

### 5.2 Iniciar servidor local
```bash
npm run serve
```

### 5.3 Abrir en el navegador
Ve a: http://localhost:3000/home.html

---

## Paso 6: Probar la Aplicación

### 6.1 Crear un AMFE de prueba
1. Haz clic en **"Nuevo AMFE"**
2. Llena algunos campos
3. Haz clic en **"Guardar AMFE"**

### 6.2 Verificar en Firebase
1. Ve a Firebase Console
2. Abre **Firestore Database**
3. Deberías ver una colección llamada **"amfes"**
4. Dentro, verás tu documento guardado

**¡Si ves tu documento, la configuración fue exitosa!** 🎉

---

## Paso 7: Configurar Reglas de Seguridad (Importante)

### 7.1 ¿Por qué es importante?
El modo de prueba expira en 30 días y permite acceso público. Necesitas reglas permanentes.

### 7.2 Opción 1: Acceso público (sin login)
Si todos pueden ver y editar todos los AMFEs:

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

### 7.3 Opción 2: Con autenticación (recomendado)
Si quieres que solo usuarios con cuenta puedan usar la app:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /amfes/{docId} {
      // Solo usuarios autenticados
      allow read: if request.auth != null;
      allow create: if request.auth != null;
      // Solo el creador puede editar/eliminar
      allow update, delete: if request.auth != null 
        && resource.data.createdBy == request.auth.uid;
    }
  }
}
```

### 7.4 Aplicar las reglas
1. En Firebase Console, ve a **Firestore Database**
2. Haz clic en la pestaña **"Reglas"** o **"Rules"**
3. Copia y pega las reglas que elegiste
4. Haz clic en **"Publicar"** o **"Publish"**

---

## Paso 8: (Opcional) Deploy con Firebase Hosting

### 8.1 Instalar Firebase CLI
```bash
npm install -g firebase-tools
```

### 8.2 Login
```bash
firebase login
```

### 8.3 Inicializar hosting
```bash
firebase init hosting
```

Configuración:
- **Public directory**: `public`
- **Single-page app**: `No`
- **Automatic builds**: `No`

### 8.4 Hacer deploy
```bash
firebase deploy --only hosting
```

Tu app estará disponible en: `https://tu-proyecto.web.app`

---

## Solución de Problemas

### Error: "Firebase is not defined"
**Solución**: Verifica que los scripts de Firebase estén cargando antes que `firebase-config.js`

### Error: "Permission denied"
**Solución**: 
1. Verifica las reglas de Firestore
2. Asegúrate de estar en modo de prueba o tener las reglas correctas

### Error al cargar documentos
**Solución**: 
1. Abre la consola del navegador (F12)
2. Verifica si hay errores de red
3. Verifica que las credenciales en `firebase-config.js` sean correctas

### La app no se conecta
**Solución**:
1. Verifica tu conexión a internet
2. Verifica que el proyecto Firebase esté activo
3. Revisa la consola del navegador para más detalles

---

## Estructura de Datos en Firestore

Tu base de datos tendrá esta estructura:

```
amfes (colección)
  ├── doc1234567890 (documento)
  │   ├── name: "Mi AMFE"
  │   ├── lastModified: timestamp
  │   └── content: {
  │         general: {...},
  │         items: [...],
  │         controlHeader: {...}
  │       }
  │
  └── doc0987654321 (documento)
      ├── name: "Otro AMFE"
      └── ...
```

---

## Límites del Plan Gratuito (Spark)

Firebase tiene un plan gratuito generoso:

- ✅ **Almacenamiento**: 1 GB
- ✅ **Lecturas**: 50,000 por día
- ✅ **Escrituras**: 20,000 por día
- ✅ **Eliminaciones**: 20,000 por día

Para uso normal con 1-10 usuarios, el plan gratuito es **más que suficiente**.

---

## Diferencias con la Versión Anterior (Node.js)

### ✅ Ventajas
- ✓ No necesitas servidor Node.js
- ✓ Escalabilidad automática
- ✓ Backup automático
- ✓ Acceso desde cualquier lugar
- ✓ Hosting gratuito
- ✓ Sincronización en tiempo real posible

### ⚠️ Consideraciones
- Requiere conexión a internet
- Dependes de Firebase (servicio externo)
- Los datos están en la nube de Google

---

## Próximos Pasos Opcionales

### 1. Agregar Autenticación
Si quieres que los usuarios tengan cuentas:
- Habilita Authentication en Firebase Console
- Agrega login con email/password o Google

### 2. Configurar Dominio Personalizado
Si tienes un dominio (ej: amfe.miempresa.com):
- Ve a Hosting en Firebase Console
- Agrega dominio personalizado

### 3. Habilitar Modo Offline
Firebase puede trabajar offline:
```javascript
firebase.firestore().enablePersistence()
  .catch((err) => {
    if (err.code == 'failed-precondition') {
      // Múltiples pestañas abiertas
    } else if (err.code == 'unimplemented') {
      // Navegador no soporta
    }
  });
```

---

## Soporte y Ayuda

### Documentación oficial
- Firebase: https://firebase.google.com/docs
- Firestore: https://firebase.google.com/docs/firestore

### Problemas comunes
Revisa la consola del navegador (F12 → Console) para ver errores específicos.

---

## ¡Listo!

Tu aplicación AMFE ahora está usando Firebase. 

**Ventajas principales:**
- ✅ No necesitas mantener un servidor
- ✅ Escalabilidad automática
- ✅ Backup automático
- ✅ Acceso desde cualquier lugar con internet

**¡Disfruta de tu nueva aplicación AMFE en la nube!** 🚀
