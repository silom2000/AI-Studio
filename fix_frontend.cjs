const fs = require('fs');
let code = fs.readFileSync('src/DocuCraftTab.tsx', 'utf8');

code = code.replace(
    /const res = await window\.electronAPI\.docucraftGenerateScript\(\{\s*topic,\s*targetDurationMinutes,\s*stylePreset,\s*customStyleDesc,\s*language,\s*aiModel\s*\}\);/s,
    `const res = await window.electronAPI.docucraftGenerateScript({
        topic,
        projectFolder: script?.projectFolder,
        targetDurationMinutes,
        stylePreset,
        customStyleDesc,
        language,
        aiModel
      });`
);

fs.writeFileSync('src/DocuCraftTab.tsx', code);
console.log("Frontend done.");
