import { describe, test, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

function getJsFiles(rootDir, skipDirs = new Set()) {
    const entries = fs.readdirSync(rootDir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const entryPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            if (skipDirs.has(entry.name)) {
                continue;
            }
            files.push(...getJsFiles(entryPath, skipDirs));
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            files.push(entryPath);
        }
    }

    return files;
}

describe('Legacy module guards', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const directoriesToScan = [
        path.join(projectRoot, 'public'),
        path.join(projectRoot, 'functions')
    ];

    const skipDirectoryNames = new Set(['archived']);

    const filesToInspect = directoriesToScan
        .filter(fs.existsSync)
        .flatMap((dir) => getJsFiles(dir, skipDirectoryNames));

    test('does not contain references to removed views or legacy cleanup functions', () => {
        const forbiddenPatterns = [
            { token: 'clearVisor3dModels', description: 'Legacy visor3d cleanup function' },
            { token: 'COLLECTIONS.MODELOS', description: 'Removed MODELOS collection constant' },
            { token: 'visor3d', description: 'Removed 3D viewer modules' },
        ];

        const matches = [];

        for (const file of filesToInspect) {
            const contents = fs.readFileSync(file, 'utf8');

            for (const pattern of forbiddenPatterns) {
                if (contents.includes(pattern.token)) {
                    matches.push({ file: path.relative(projectRoot, file), token: pattern.token, description: pattern.description });
                }
            }
        }

        expect(matches).toEqual([]);
    });
});
