#!/bin/bash

# Este script facilita el inicio del servidor AMFE sin necesidad de ejecutar
# manualmente npm install y npm start. Comprueba la existencia del comando
# 'npm' e instala las dependencias si es necesario antes de arrancar
# el servidor.  Puede ejecutarse con: ./run_server.sh

set -e

echo "Instalando dependencias..."
npm install

echo "Iniciando el servidor..."
npm start &
PID=$!
sleep 1
echo "Servidor iniciado. Abra su navegador en http://localhost:3000/home.html"
wait $PID