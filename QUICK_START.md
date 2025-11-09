# 🔥 QUICK START - Configuración Firebase

## Lo que necesitas hacer AHORA:

### 1️⃣ Crear Proyecto Firebase (5 minutos)
Ve a: https://console.firebase.google.com/
- Haz clic en "Agregar proyecto"
- Nombre: elige uno (ej: "amfe-2026")
- No necesitas Google Analytics
- Haz clic en "Crear proyecto"

### 2️⃣ Activar Firestore (2 minutos)
En tu proyecto:
- Menú lateral → "Firestore Database"
- "Crear base de datos"
- Selecciona "Comenzar en modo de prueba"
- Ubicación: elige la más cercana
- Haz clic en "Habilitar"

### 3️⃣ Obtener Credenciales (1 minuto)
- En la página principal del proyecto, haz clic en el ícono Web (</>)
- Nombre de la app: "AMFE Web"
- NO marques Firebase Hosting
- Copia el objeto `firebaseConfig` que aparece

Se verá así:
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "tu-proyecto-123.firebaseapp.com",
  projectId: "tu-proyecto-123",
  storageBucket: "tu-proyecto-123.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

### 4️⃣ Editar Archivo de Configuración (30 segundos)

**Abre:** `public/firebase-config.js`

**Reemplaza esto:**
```javascript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY_HERE",              // ← Aquí
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

**Con tus valores reales** (los que copiaste en el paso 3)

### 5️⃣ Ejecutar la Aplicación (1 minuto)

```bash
npm install
npm run serve
```

Abre: http://localhost:3000/home.html

### 6️⃣ Probar

- Haz clic en "Nuevo AMFE"
- Llena algunos campos
- Haz clic en "Guardar AMFE"
- Ve a Firebase Console → Firestore Database
- ¡Deberías ver tu documento guardado!

## ✅ Si ves tu documento en Firebase = ¡TODO FUNCIONA!

---

## 🚨 ¿Problemas?

### Error: "Firebase is not defined"
→ Revisa que `firebase-config.js` esté bien escrito

### Error: "Permission denied"
→ En Firebase Console, ve a Firestore Database → Reglas
→ Asegúrate de estar en modo de prueba (allow read, write: if true)

### No se guardan los datos
→ Revisa la consola del navegador (F12)
→ Verifica que las credenciales en `firebase-config.js` sean correctas

---

## 📚 Documentación Completa

Ver **FIREBASE_SETUP.md** para la guía completa con más detalles.

## 🎯 ¡Eso es todo!

Con estos 6 pasos tu aplicación AMFE estará funcionando en la nube con Firebase.

**Ventajas:**
- Sin servidor que mantener
- Acceso desde cualquier lugar
- Backup automático
- Gratis para uso normal (hasta 50K lecturas por día)
