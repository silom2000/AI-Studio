'use strict';
/**
 * Quick fix: download product #7 image from Amazon and save as prod_7.jpg
 * Run from AISTUDIO folder:  node fix_prod7_image.cjs
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const ASIN = 'B09K58K13V';
const DEST = path.resolve(__dirname, '..', 'amazon', 'img', 'prod_7.jpg');

async function main() {
    console.log(`Fetching Amazon.fr product page for ASIN ${ASIN}...`);

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
    };

    // Step 1: Get product page HTML to extract the main image URL
    let imageUrl = null;
    try {
        const resp = await axios.get(`https://www.amazon.fr/dp/${ASIN}`, {
            headers,
            timeout: 15000,
        });
        const html = resp.data;

        // Try multiple patterns to find the main image
        const patterns = [
            /"hiRes"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/,
            /"large"\s*:\s*"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/,
            /data-old-hires="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/,
            /src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+_SL1500_[^"]+)"/,
            /src="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/,
        ];

        for (const pat of patterns) {
            const m = html.match(pat);
            if (m) {
                imageUrl = m[1].replace(/\\u002F/g, '/');
                // Upgrade to high-res
                imageUrl = imageUrl.replace(/\._[A-Z0-9_,]+_\./i, '._AC_SL1500_.');
                break;
            }
        }
    } catch (e) {
        console.error('Could not fetch product page:', e.message);
    }

    if (!imageUrl) {
        // Fallback: try common Amazon image pattern
        console.log('Could not extract from page HTML, trying DuckDuckGo fallback...');
        try {
            const ddg = await axios.get(`https://html.duckduckgo.com/html/?q=site:amazon.fr/dp/${ASIN}`, {
                headers: { 'User-Agent': headers['User-Agent'] },
                timeout: 10000,
            });
            const m = ddg.data.match(/https:\/\/m\.media-amazon\.com\/images\/I\/([^"&\s]+)/);
            if (m) {
                imageUrl = `https://m.media-amazon.com/images/I/${m[1]}`;
                imageUrl = imageUrl.replace(/\._[A-Z0-9_,]+_\./i, '._AC_SL1500_.');
            }
        } catch (_) {}
    }

    if (!imageUrl) {
        console.error('❌ Could not find product image URL. Please save the image manually as:');
        console.error(`   ${DEST}`);
        process.exit(1);
    }

    console.log(`Found image: ${imageUrl}`);
    console.log(`Downloading to ${DEST}...`);

    const imgResp = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 15000,
        headers: { 'User-Agent': headers['User-Agent'] },
    });

    const dir = path.dirname(DEST);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DEST, Buffer.from(imgResp.data));

    const sizeKB = Math.round(imgResp.data.byteLength / 1024);
    console.log(`✅ Saved prod_7.jpg (${sizeKB} KB) → ${DEST}`);
    console.log('Now run upload.ps1 to push to GitHub.');
}

main().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
});
