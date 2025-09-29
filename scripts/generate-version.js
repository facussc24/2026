import { execSync } from 'child_process';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';

console.log('Generando archivo de versión desde package.json...');

try {
  // Obtener el hash corto del último commit
  const hash = execSync('git rev-parse --short HEAD').toString().trim();

  // Leer la versión y las notas de la versión desde package.json
  const packageJsonPath = resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const { version, releaseNotes } = packageJson;

  if (!version || !releaseNotes) {
    throw new Error('La versión o las notas de la versión no están definidas en package.json.');
  }

  const versionInfo = {
    hash,
    version,
    message: releaseNotes,
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
  console.log(`   - Versión: ${version}`);
  console.log(`   - Hash: ${hash}`);
  console.log(`   - Mensaje: "${releaseNotes}"`);

} catch (error) {
  console.error('Error al generar el archivo de versión.');
  console.error(error);
  process.exit(1);
}