import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';

console.log('Generando archivo de versión...');

try {
  // Obtener el hash corto del último commit
  const hash = execSync('git rev-parse --short HEAD').toString().trim();

  // Obtener el mensaje completo del último commit
  const message = execSync('git log -1 --pretty=%B').toString().trim();

  const versionInfo = {
    hash,
    message,
    date: new Date().toISOString(),
  };

  const publicDir = resolve(process.cwd(), 'public');

  // Asegurarse de que el directorio public existe
  if (!existsSync(publicDir)) {
    mkdirSync(publicDir, { recursive: true });
  }

  const filePath = resolve(publicDir, 'version.json');

  writeFileSync(filePath, JSON.stringify(versionInfo, null, 2));

  console.log(`Archivo de versión creado exitosamente en ${filePath}`);
  console.log(`   - Hash: ${hash}`);
  console.log(`   - Mensaje: "${message}"`);

} catch (error) {
  console.error('Error al generar el archivo de versión.');
  console.error('Asegúrate de que estás en un repositorio de Git y que tienes commits.');
  console.error(error);
  process.exit(1);
}