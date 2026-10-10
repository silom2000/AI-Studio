const fs = require('fs');
let code = fs.readFileSync('docucraft-handlers.cjs', 'utf8');

code = code.replace(
    /const \{\s*topic,\s*targetDurationMinutes/s,
    "const {\n            topic,\n            projectFolder,\n            targetDurationMinutes"
);

code = code.replace(
    /const timestamp = Date\.now\(\);\s*const safeTopic = [^\n]+\s*const folderName = `DocuCraft_\$\{safeTopic\}_\$\{timestamp\}`;\s*const projectDir = path\.join\(DOCUCRAFT_DIRS\.projects, folderName\);\s*fs\.mkdirSync\(projectDir, \{ recursive: true \}\);/s,
    `let folderName = projectFolder;
        let projectDir;
        if (folderName) {
            projectDir = path.join(DOCUCRAFT_DIRS.projects, folderName);
            if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
        } else {
            const timestamp = Date.now();
            const safeTopic = (topic || 'documentary').replace(/[^a-z0-9_-]/gi, '_').substring(0, 24);
            folderName = \\\`DocuCraft_\${safeTopic}_\${timestamp}\\\`;
            projectDir = path.join(DOCUCRAFT_DIRS.projects, folderName);
            fs.mkdirSync(projectDir, { recursive: true });
        }`
);

code = code.replace(
    /createdAt: fs\.statSync\(mPath\)\.mtimeMs,/s,
    "createdAt: data.createdAt || fs.statSync(mPath).mtimeMs,"
);

code = code.replace(
    /scriptData\.projectFolder = folderName;/s,
    "scriptData.projectFolder = folderName;\n        scriptData.createdAt = scriptData.createdAt || Date.now();"
);

fs.writeFileSync('docucraft-handlers.cjs', code);
console.log("Done.");
