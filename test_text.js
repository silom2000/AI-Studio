const { spawn } = require('child_process');
const fs = require('fs');

async function addYoutubeTextToImage(inputPath, outputPath, text) {
    return new Promise((resolve, reject) => {
        const tempTextPath = outputPath + '.txt';
        fs.writeFileSync(tempTextPath, text.trim().toUpperCase(), 'utf-8');
        
        // Escape paths for FFmpeg filter
        const escapedTextFile = tempTextPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '$1\\:');
        
        // YouTube style: Huge Impact font, Yellow/White color, heavy black border, slight drop shadow, bottom centered
        const drawtext = `drawtext=fontfile='C\\:/Windows/Fonts/impact.ttf':textfile='${escapedTextFile}':fontcolor=yellow:fontsize=160:x='(w-tw)/2':y='h-th-80':bordercolor=black:borderw=8:shadowcolor=black@0.8:shadowx=6:shadowy=6`;
        
        const proc = spawn('ffmpeg', [
            '-y',
            '-i', inputPath,
            '-vf', drawtext,
            '-frames:v', '1',
            '-q:v', '2',
            outputPath
        ]);
        
        proc.on('close', code => {
            fs.unlinkSync(tempTextPath);
            if (code === 0) resolve();
            else reject(new Error('ffmpeg text overlay failed'));
        });
        proc.on('error', reject);
    });
}
