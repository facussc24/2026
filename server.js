const express = require('express');
const path = require('path');

const app = express();

// Servir archivos estáticos desde la carpeta public
app.use(express.static(path.join(__dirname, 'public')));

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor AMFE escuchando en http://localhost:${PORT}`);
});
