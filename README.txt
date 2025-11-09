Instrucciones para ejecutar la aplicación AMFE Multiusuario
==========================================================

Esta versión de la aplicación AMFE/Plan de Control funciona como un pequeño
servidor web para que varias personas puedan acceder al mismo conjunto de
documentos AMFE desde distintos navegadores.  Está basada en Node.js y Express.

Requisitos previos
------------------

1. Debe tener instalado **Node.js** (versión 14 o superior).  Puede descargarlo
   desde https://nodejs.org/.

Cómo instalar y ejecutar
-----------------------

1. Descomprima el archivo ZIP y abra una terminal en la carpeta
   `amfe_multiserver_app`.
2. Ejecute el siguiente comando para instalar las dependencias:

       npm install

3. Inicie el servidor con:

       npm start

   Esto levantará un servidor en `http://localhost:3000` y mostrará en la
   terminal un mensaje indicando que está escuchando.
4. Abra su navegador web y navegue a la siguiente URL para iniciar la
   aplicación:

       http://localhost:3000/home.html

Desde la página de inicio podrá crear nuevos AMFEs, renombrarlos, borrarlos y
acceder a cada uno para editarlos.  Los datos se almacenan en archivos JSON
en la carpeta `data` para que sean compartidos por todos los usuarios que se
conecten al servidor.

Sugerencia para Windows
-----------------------

Si prefiere no usar la línea de comandos cada vez, puede crear un archivo
`start.bat` con el siguiente contenido en la misma carpeta y hacer doble clic
para iniciar el servidor:

    @echo off
    npm install
    npm start

Para Linux/Mac, puede ejecutar el script `run_server.sh` incluido en la
carpeta raíz para arrancar el servidor automáticamente. Asegúrese de
darle permisos de ejecución (`chmod +x run_server.sh`), luego ejecute:

    ./run_server.sh

El script instalará las dependencias con `npm install` y arrancará
`npm start`, mostrando una notificación para que abra el navegador en
http://localhost:3000/home.html.