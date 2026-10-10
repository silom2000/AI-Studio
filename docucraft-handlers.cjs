const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const axios = require('axios');
const { execSync, spawn } = require('child_process');
const { dialog } = require('electron');

const ai = require('./ai-client.cjs');

// Directories for DocuCraft
const DOCUCRAFT_DIRS = {
    base: path.join(__dirname, 'DocuCraft'),
    projects: path.join(__dirname, 'DocuCraft', 'Projects'),
    audio: path.join(__dirname, 'DocuCraft', 'Audio'),
    images: path.join(__dirname, 'DocuCraft', 'Images'),
    videos: path.join(__dirname, 'DocuCraft', 'Videos'),
    temp: path.join(__dirname, 'DocuCraft', 'Temp'),
    output: path.join(__dirname, 'DocuCraft', 'FinalOutput'),
};

// Ensure base directories exist
Object.values(DOCUCRAFT_DIRS).forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const LANG_CONFIG = {
    French: { code: 'fr', name: 'French' },
    English: { code: 'en', name: 'English' },
    Russian: { code: 'ru', name: 'Russian' },
    German: { code: 'de', name: 'German' },
    Spanish: { code: 'es', name: 'Spanish' },
    fr: { code: 'fr', name: 'French' },
    en: { code: 'en', name: 'English' },
    ru: { code: 'ru', name: 'Russian' },
    de: { code: 'de', name: 'German' },
    es: { code: 'es', name: 'Spanish' },
};

const STYLE_PROMPTS = {
    vintage_botanical: '19th century vintage botanical engraving, copperplate etching, Pierre-Joseph Redouté aesthetic, fine ink cross-hatching, weathered aged parchment paper texture, hand-tinted watercolor accents in muted sage green and ochre, detailed scientific flora and fauna, antique encyclopedia illustration, museum archive quality, highly detailed',
    historical_manuscript: 'Medieval illuminated manuscript, ancient cartography, antique parchment with stained deckled edges, sepia calligraphy, Renaissance compass rose, hand-drawn navigational sea chart, gold leaf embellishments, historical chronicle aesthetic, archival artifact, intricate vintage detail',
    science_blueprints: 'Technical cyanotype architectural blueprint, Leonardo da Vinci anatomical sketchbook, exploded view technical schematic, white ink drafting lines on deep cobalt blue blueprint paper, microscopic cross-section, precise geometrical annotations and dimension markings, high technical fidelity, academic engraving',
    dark_mystery: 'Dark archival noir investigation, classified vintage dossier, high-contrast monochrome with amber tone, desaturated forensic photograph, typewriter text clippings, magnifying glass forensic perspective, shadowy moody lighting, vintage microfilm aesthetic, dramatic cinematic tension',
    custom: 'Cinematic documentary visual, museum archival quality, authentic atmospheric lighting, 8k resolution, richly detailed',
};

/**
 * Robust JSON extraction and repair for LLM responses
 */
function cleanAndParseJSON(raw) {
    if (!raw || typeof raw !== 'string') throw new Error('Empty AI response');
    let str = raw.trim();

    // 1. Remove Markdown code blocks
    str = str.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();

    // 2. Try direct JSON.parse
    try {
        return JSON.parse(str);
    } catch (e) {}

    // 3. Find outermost JSON object or array
    const firstBrace = str.indexOf('{');
    const firstBracket = str.indexOf('[');
    let startIdx = -1;
    let endIdx = -1;

    if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
        startIdx = firstBrace;
        endIdx = str.lastIndexOf('}');
    } else if (firstBracket !== -1) {
        startIdx = firstBracket;
        endIdx = str.lastIndexOf(']');
    }

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
        let candidate = str.substring(startIdx, endIdx + 1).trim();
        try {
            return JSON.parse(candidate);
        } catch (e) {}

        candidate = candidate.replace(/,\s*([\}\]])/g, '$1');
        try {
            return JSON.parse(candidate);
        } catch (e) {}
    }

    throw new Error('Could not parse structural JSON from AI response');
}


/**
 * Voice generation helper (VoiceAPI / ElevenLabs)
 */
async function docuCraftGenerateVoice(text, language, outputDir, filenameHint = null, ttsService = 'voiceapi') {
    const voiceId = process.env.DOCUCRAFT_VOICE_ID || process.env.SURVIVE_VOICE_ID || process.env.STORY_VOICE_ID || process.env.TEST_VOICE_ID;
    if (!voiceId) throw new Error('[DocuCraft Voice] Set DOCUCRAFT_VOICE_ID, SURVIVE_VOICE_ID, or STORY_VOICE_ID in .env');

    let filename = filenameHint;
    if (!filename) {
        const hash = crypto.createHash('md5').update(text).digest('hex').substring(0, 12);
        filename = `voice_${hash}.mp3`;
    }
    const dir = outputDir || DOCUCRAFT_DIRS.audio;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const outputPath = path.join(dir, filename);

    // Cache check
    if (fs.existsSync(outputPath)) {
        const stat = fs.statSync(outputPath);
        if (stat.size > 1000) {
            const fd = fs.openSync(outputPath, 'r');
            const hdr = Buffer.alloc(4);
            fs.readSync(fd, hdr, 0, 4, 0);
            fs.closeSync(fd);
            const isID3  = hdr[0] === 0x49 && hdr[1] === 0x44 && hdr[2] === 0x33;
            const isSync = hdr[0] === 0xFF && (hdr[1] & 0xE0) === 0xE0;
            if (isID3 || isSync) {
                console.log(`[DocuCraft Voice] Using cached: ${outputPath} (${stat.size}B)`);
                return outputPath;
            }
            try { fs.unlinkSync(outputPath); } catch (_) {}
        }
    }

    if (ttsService === 'elevenlabs') {
        const el11Key = process.env.ElevenLabs_API;
        if (!el11Key) throw new Error('[Voice] ElevenLabs_API key not set in .env');
        return await ai.synthesizeDirectElevenLabs(text, voiceId, outputPath);
    }

    const apiKey = process.env.VOICEAPI_KEY;
    if (!apiKey) throw new Error('[DocuCraft Voice] VOICEAPI_KEY not set in .env');

    const templateId = process.env.UUID;
    if (!templateId) throw new Error('[DocuCraft Voice] UUID not set for Lumean Template');

    const LUMEAN_BASE = 'https://api.lumean.app/api/public';
    const headers = {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
    };

    const taskBody = {
        template_id: templateId,
        input_text: text
    };

    let cr;
    try {
        console.log(`[DocuCraft Voice] POST /orders template=${templateId} text=${text.length}ch`);
        cr = await axios.post(`${LUMEAN_BASE}/orders`, taskBody, { headers });
    } catch (err) {
        if (err.response && err.response.status === 402) {
            throw new Error('Недостаточно средств на балансе VoiceAPI (Ошибка 402).');
        }
        if (err.response && err.response.status === 403) {
            throw new Error('Ошибка 403: У API-ключа нет нужных прав (orders.write).');
        }
        throw err;
    }

    const orderId = cr.data && cr.data.data && cr.data.data.id;
    if (!orderId) throw new Error('[DocuCraft Voice] No order id in response');

    let finalOrder = null;
    for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 2000));
        const sr = await axios.get(`${LUMEAN_BASE}/orders/${orderId}`, { headers });
        const t = sr.data.data;
        const st = ((t.status || '')).toLowerCase();
        if (st === 'failed' || st === 'cancelled') {
            throw new Error('[DocuCraft Voice] Task failed: ' + JSON.stringify(t).slice(0, 200));
        }
        if (st === 'completed' || st === 'partially_completed') {
            finalOrder = t;
            break;
        }
    }

    if (!finalOrder) throw new Error('[DocuCraft Voice] Task timeout after 2 minutes');

    const resultItem = finalOrder.result.files[0];
    const resultPath = typeof resultItem === 'string' ? resultItem : resultItem.path;
    const urlRes = await axios.post(`${LUMEAN_BASE}/storage/url`, { path: resultPath }, { headers });
    const downloadUrl = urlRes.data.data.url;

    const ar = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const buf = Buffer.from(ar.data);
    if (buf.length < 100) throw new Error(`[DocuCraft Voice] Result audio too small: ${buf.length}B`);

    fs.writeFileSync(outputPath, buf);
    console.log(`[DocuCraft Voice] Saved: ${outputPath} (${buf.length}B)`);
    return outputPath;
}

/**
 * Get media file duration via ffprobe in seconds
 */
function getMediaDuration(filePath) {
    try {
        const out = execSync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
            { timeout: 10000 }
        ).toString().trim();
        const dur = parseFloat(out);
        return isNaN(dur) ? 6 : dur;
    } catch (e) {
        console.warn(`[DocuCraft] ffprobe failed for ${filePath}: ${e.message}`);
        return 6;
    }
}

/**
 * Format seconds into MM:SS or HH:MM:SS
 */
function formatTimecode(totalSeconds) {
    const sec = Math.floor(totalSeconds % 60);
    const min = Math.floor((totalSeconds / 60) % 60);
    const hr = Math.floor(totalSeconds / 3600);
    const pad = (n) => String(n).padStart(2, '0');
    if (hr > 0) return `${pad(hr)}:${pad(min)}:${pad(sec)}`;
    return `${pad(min)}:${pad(sec)}`;
}

/**
 * Automatically reconcile manifest scenes with generated files on disk
 * (recovers illustrations in Images/, voiceovers in Audio/, videos in Videos/ & Renders/)
 */
function syncManifestWithDiskFiles(script, projectDir) {
    if (!script || !script.chapters || !projectDir || !fs.existsSync(projectDir)) {
        return script;
    }

    const imagesDir = path.join(projectDir, 'Images');
    const videosDir = path.join(projectDir, 'Videos');
    const audioDir = path.join(projectDir, 'Audio');
    const rendersDir = path.join(projectDir, 'Renders');

    const imageFiles = fs.existsSync(imagesDir) ? fs.readdirSync(imagesDir) : [];
    const videoFiles = fs.existsSync(videosDir) ? fs.readdirSync(videosDir) : [];
    const audioFiles = fs.existsSync(audioDir) ? fs.readdirSync(audioDir) : [];
    const renderFiles = fs.existsSync(rendersDir) ? fs.readdirSync(rendersDir) : [];

    let overallIndex = 0;
    script.chapters.forEach(chap => {
        (chap.scenes || []).forEach(sc => {
            overallIndex++;

            // 1. Audio reconciliation
            const expectedAudio = `${sc.id}_voice.mp3`;
            if (audioFiles.includes(expectedAudio)) {
                const audPath = path.join(audioDir, expectedAudio);
                const currentAudPath = sc.audioUrl ? sc.audioUrl.replace('media:///', '').split('?')[0] : null;
                if (!currentAudPath || !fs.existsSync(currentAudPath)) {
                    const mtime = fs.statSync(audPath).mtimeMs;
                    sc.audioUrl = `media:///${audPath.replace(/\\/g, '/')}?t=${mtime}`;
                }
                if (!sc.audioDuration || sc.audioDuration <= 0) {
                    sc.audioDuration = getMediaDuration(audPath);
                }
            }

            // 2. Image reconciliation
            let imgExists = false;
            if (sc.imageUrl) {
                const currentImgPath = sc.imageUrl.replace('media:///', '').split('?')[0];
                if (fs.existsSync(currentImgPath)) {
                    imgExists = true;
                }
            }

            if (!imgExists) {
                const prefix = `scene_${overallIndex}_`;
                const exact = `scene_${overallIndex}.jpg`;
                const idPrefix = `${sc.id}_`;
                const candidates = imageFiles.filter(f =>
                    (f.startsWith(prefix) || f === exact || f.startsWith(idPrefix) || f.includes(`_${sc.id}_`)) &&
                    (f.toLowerCase().endsWith('.jpg') || f.toLowerCase().endsWith('.jpeg') || f.toLowerCase().endsWith('.png') || f.toLowerCase().endsWith('.webp'))
                );

                if (candidates.length > 0) {
                    candidates.sort((a, b) => {
                        const mtimeA = fs.statSync(path.join(imagesDir, a)).mtimeMs;
                        const mtimeB = fs.statSync(path.join(imagesDir, b)).mtimeMs;
                        return mtimeB - mtimeA;
                    });
                    const best = candidates[0];
                    const fullImgPath = path.join(imagesDir, best);
                    const mtime = fs.statSync(fullImgPath).mtimeMs;
                    sc.imageUrl = `media:///${fullImgPath.replace(/\\/g, '/')}?t=${mtime}`;
                }
            }

            // 3. Video reconciliation
            let vidExists = false;
            if (sc.videoUrl) {
                const currentVidPath = sc.videoUrl.replace('media:///', '').split('?')[0];
                if (fs.existsSync(currentVidPath)) {
                    vidExists = true;
                }
            }

            if (!vidExists && sc.isAnimated) {
                const vidCandidates = videoFiles.filter(f =>
                    (f.includes(sc.id) || f.startsWith(`scene_${overallIndex}_`)) && f.toLowerCase().endsWith('.mp4')
                );
                if (vidCandidates.length > 0) {
                    vidCandidates.sort((a, b) => {
                        const mtimeA = fs.statSync(path.join(videosDir, a)).mtimeMs;
                        const mtimeB = fs.statSync(path.join(videosDir, b)).mtimeMs;
                        return mtimeB - mtimeA;
                    });
                    const fullVidPath = path.join(videosDir, vidCandidates[0]);
                    const mtime = fs.statSync(fullVidPath).mtimeMs;
                    sc.videoUrl = `media:///${fullVidPath.replace(/\\/g, '/')}?t=${mtime}`;
                } else {
                    const renderCandidates = renderFiles.filter(f =>
                        f.includes(sc.id) && f.toLowerCase().endsWith('.mp4')
                    );
                    if (renderCandidates.length > 0) {
                        const fullVidPath = path.join(rendersDir, renderCandidates[0]);
                        const mtime = fs.statSync(fullVidPath).mtimeMs;
                        sc.videoUrl = `media:///${fullVidPath.replace(/\\/g, '/')}?t=${mtime}`;
                    }
                }
            }
        });
    });

    // Check final documentary
    const finalDocPath = path.join(projectDir, 'final_documentary.mp4');
    if (fs.existsSync(finalDocPath)) {
        const curFinal = script.finalVideoUrl ? script.finalVideoUrl.replace('media:///', '').split('?')[0] : null;
        if (!curFinal || !fs.existsSync(curFinal)) {
            const mtime = fs.statSync(finalDocPath).mtimeMs;
            script.finalVideoUrl = `media:///${finalDocPath.replace(/\\/g, '/')}?t=${mtime}`;
        }
    }

    return script;
}

/**
 * Merge script state with existing on-disk manifest to preserve generated media
 */
function mergeScriptWithDisk(incomingScript, projectDir) {
    if (!incomingScript || !projectDir) return incomingScript;
    const manifestPath = path.join(projectDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) return incomingScript;

    try {
        const diskData = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        if (!diskData || !diskData.chapters) return incomingScript;

        const diskSceneMap = new Map();
        (diskData.chapters || []).forEach(chap => {
            (chap.scenes || []).forEach(sc => {
                if (sc.id) diskSceneMap.set(sc.id, sc);
            });
        });

        (incomingScript.chapters || []).forEach(chap => {
            (chap.scenes || []).forEach(sc => {
                const diskSc = diskSceneMap.get(sc.id);
                if (diskSc) {
                    if (!sc.imageUrl && diskSc.imageUrl) sc.imageUrl = diskSc.imageUrl;
                    if (!sc.audioUrl && diskSc.audioUrl) sc.audioUrl = diskSc.audioUrl;
                    if (!sc.videoUrl && diskSc.videoUrl) sc.videoUrl = diskSc.videoUrl;
                    if ((!sc.audioDuration || sc.audioDuration <= 0) && diskSc.audioDuration) {
                        sc.audioDuration = diskSc.audioDuration;
                    }
                }
            });
        });

        if (!incomingScript.finalVideoUrl && diskData.finalVideoUrl) {
            incomingScript.finalVideoUrl = diskData.finalVideoUrl;
        }
        if (!incomingScript.youtubeChapters && diskData.youtubeChapters) {
            incomingScript.youtubeChapters = diskData.youtubeChapters;
        }
        if (!incomingScript.totalDurationSeconds && diskData.totalDurationSeconds) {
            incomingScript.totalDurationSeconds = diskData.totalDurationSeconds;
        }
    } catch (_) {}

    return incomingScript;
}


// ─────────────────────────────────────────────────────────────────────────────
// Free Archival & Stock B-Roll Retrieval System (Wikimedia, Pexels, Archive.org)
// ─────────────────────────────────────────────────────────────────────────────

const cleanHtml = (str) => {
    if (!str || typeof str !== 'string') return '';
    return str
        .replace(/<[^>]*>/g, '')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim();
};

const searchWikimediaCommons = async (query, { mediaType = 'all', page = 1, perPage = 18 } = {}) => {
    const cleanQuery = (query || '').replace(/[^\w\sЀ-ӿÀ-ɏ]/gi, ' ').trim();
    if (!cleanQuery) return [];

    const userAgent = 'DocuCraftBot/1.0 (https://aistudio.local; contact@aistudio.local)';
    const words = cleanQuery.split(/\s+/).filter(w => w.length >= 3);
    const longest = words.slice().sort((a, b) => b.length - a.length);

    const queryCandidates = [];
    if (mediaType === 'video') {
        queryCandidates.push(`filetype:video ${cleanQuery}`);
        if (longest.length >= 2) {
            queryCandidates.push(`filetype:video (${longest.slice(0, 2).join(' OR ')})`);
        }
        if (longest.length >= 1) {
            queryCandidates.push(`filetype:video ${longest[0]}`);
        }
        queryCandidates.push(cleanQuery);
    } else if (mediaType === 'image') {
        queryCandidates.push(`filetype:bitmap ${cleanQuery}`);
        if (longest.length >= 2) {
            queryCandidates.push(`filetype:bitmap (${longest.slice(0, 2).join(' OR ')})`);
        }
        queryCandidates.push(cleanQuery);
    } else {
        queryCandidates.push(`filetype:video ${cleanQuery}`);
        queryCandidates.push(cleanQuery);
        if (longest.length >= 2) {
            queryCandidates.push(`(${longest.slice(0, 2).join(' OR ')})`);
        }
    }

    let pages = {};
    for (const q of queryCandidates) {
        try {
            const res = await axios.get('https://commons.wikimedia.org/w/api.php', {
                params: {
                    action: 'query',
                    format: 'json',
                    generator: 'search',
                    gsrsearch: q,
                    gsrnamespace: 6,
                    gsrlimit: perPage,
                    gsroffset: (page - 1) * perPage,
                    prop: 'imageinfo|info',
                    iiprop: 'url|size|mime|extmetadata|mediatype',
                    iiurlwidth: 640
                },
                headers: { 'User-Agent': userAgent },
                timeout: 12000
            });
            const p = res.data?.query?.pages || {};
            if (Object.keys(p).length > 0) {
                pages = p;
                break;
            }
        } catch (err) {
            console.warn('[DocuCraft: Wikimedia] Cascade attempt failed for "' + q + '":', err.message);
        }
    }

    const results = [];
    for (const key of Object.keys(pages)) {
        const item = pages[key];
        const ii = item.imageinfo?.[0];
        if (!ii || !ii.url) continue;

        const isVid = ii.mediatype === 'VIDEO' || (ii.mime && ii.mime.startsWith('video/'));
        if (mediaType === 'video' && !isVid) continue;
        if (mediaType === 'image' && isVid) continue;
        if (ii.mime && (ii.mime.includes('pdf') || ii.mime.includes('audio') || ii.mime.includes('djvu') || ii.mime.includes('svg'))) continue;

        const extMeta = ii.extmetadata || {};
        const title = (item.title || '').replace(/^File:/i, '').replace(/\.[a-z0-9]+$/i, '');
        const artist = cleanHtml(extMeta.Artist?.value || extMeta.Credit?.value || '');
        const license = cleanHtml(extMeta.LicenseShortName?.value || extMeta.UsageTerms?.value || 'CC / Public Domain');

        let thumb = ii.thumburl || ii.url;
        let preview = ii.url;
        let duration = 0;

        if (isVid) {
            duration = parseFloat(extMeta.DateTimeOriginal?.value || extMeta.PlaytimeSeconds?.value || '0') || 0;
            if (!thumb || thumb.endsWith('.webm') || thumb.endsWith('.ogv')) {
                thumb = ii.thumburl || '';
            }
        }

        results.push({
            id: `wiki_${item.pageid || Math.random().toString(36).slice(2, 8)}`,
            source: 'wikimedia',
            sourceName: 'Wikimedia Commons',
            title: title || 'Archive Media',
            mediaType: isVid ? 'video' : 'image',
            mime: ii.mime,
            thumbnailUrl: thumb,
            previewUrl: preview,
            downloadUrl: ii.url,
            width: ii.width,
            height: ii.height,
            duration,
            creator: artist || 'Wikimedia Contributor',
            license: license,
            sourcePageUrl: item.canonicalurl || (item.title ? `https://commons.wikimedia.org/wiki/${encodeURIComponent(item.title)}` : '')
        });
    }

    return results;
};

const searchArchiveOrg = async (query, { page = 1, perPage = 8 } = {}) => {
    const cleanQuery = (query || '').replace(/[^\w\s]/gi, ' ').trim();
    if (!cleanQuery) return [];

    const searchUrl = `https://archive.org/advancedsearch.php?q=(${encodeURIComponent(cleanQuery)})+AND+mediatype:movies+AND+(collection:prelinger+OR+collection:home_movies)&fl[]=identifier,title,description,downloads,item_size&sort[]=-downloads&rows=${perPage}&page=${page}&output=json`;

    try {
        const res = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'DocuCraftBot/1.0 (https://aistudio.local)' },
            timeout: 12000
        });

        const docs = res.data?.response?.docs || [];
        const results = [];

        for (const doc of docs) {
            const id = doc.identifier;
            if (!id) continue;

            const thumb = `https://archive.org/services/img/${id}`;
            const metaRes = await axios.get(`https://archive.org/metadata/${id}`, { timeout: 8000 }).catch(() => null);
            if (!metaRes || !metaRes.data || !metaRes.data.files) continue;

            const files = metaRes.data.files;
            const mp4s = files.filter(f => f.name && f.name.toLowerCase().endsWith('.mp4') && f.format && !f.name.toLowerCase().includes('512kb'));
            const chosen = mp4s.find(f => parseInt(f.size || '0', 10) < 150 * 1024 * 1024) || mp4s[0];

            if (chosen && chosen.name) {
                const downloadUrl = `https://archive.org/download/${id}/${encodeURIComponent(chosen.name)}`;
                const duration = parseFloat(chosen.length || '0') || 0;

                results.push({
                    id: `ia_${id}`,
                    source: 'archive_org',
                    sourceName: 'Internet Archive (Prelinger)',
                    title: doc.title || id,
                    mediaType: 'video',
                    mime: 'video/mp4',
                    thumbnailUrl: thumb,
                    previewUrl: downloadUrl,
                    downloadUrl: downloadUrl,
                    duration,
                    creator: 'Prelinger Archives / Internet Archive',
                    license: 'Public Domain / Free Archival',
                    sourcePageUrl: `https://archive.org/details/${id}`
                });
            }
        }

        return results;
    } catch (err) {
        console.warn('[DocuCraft: Archive.org] Search error:', err.message);
        return [];
    }
};

const searchPexels = async (query, { mediaType = 'all', page = 1, perPage = 18, apiKey } = {}) => {
    const key = apiKey || process.env.PEXELS_API_KEY;
    if (!key) return [];

    const headers = { Authorization: key };
    const results = [];

    if (mediaType === 'all' || mediaType === 'video') {
        try {
            const res = await axios.get('https://api.pexels.com/videos/search', {
                params: { query, page, per_page: mediaType === 'video' ? perPage : Math.ceil(perPage / 2) },
                headers,
                timeout: 10000
            });
            const videos = res.data?.videos || [];
            for (const v of videos) {
                const files = v.video_files || [];
                const chosen = files.find(f => f.quality === 'hd' && f.width >= 1280) || files[0];
                if (chosen && chosen.link) {
                    results.push({
                        id: `pexels_v_${v.id}`,
                        source: 'pexels',
                        sourceName: 'Pexels',
                        title: `Pexels: ${query} (#${v.id})`,
                        mediaType: 'video',
                        mime: chosen.file_type || 'video/mp4',
                        thumbnailUrl: v.image,
                        previewUrl: chosen.link,
                        downloadUrl: chosen.link,
                        width: chosen.width || v.width,
                        height: chosen.height || v.height,
                        duration: v.duration || 0,
                        creator: v.user?.name || 'Pexels Videographer',
                        license: 'Pexels License (Free Commercial Use, No attribution required)',
                        sourcePageUrl: v.url
                    });
                }
            }
        } catch (err) {
            console.warn('[DocuCraft: Pexels] Video search failed:', err.message);
        }
    }

    if (mediaType === 'all' || mediaType === 'image') {
        try {
            const res = await axios.get('https://api.pexels.com/v1/search', {
                params: { query, page, per_page: mediaType === 'image' ? perPage : Math.floor(perPage / 2) },
                headers,
                timeout: 10000
            });
            const photos = res.data?.photos || [];
            for (const p of photos) {
                const downloadUrl = p.src?.original || p.src?.large2x || p.src?.large;
                results.push({
                    id: `pexels_i_${p.id}`,
                    source: 'pexels',
                    sourceName: 'Pexels',
                    title: p.alt || `Pexels Photo #${p.id}`,
                    mediaType: 'image',
                    mime: 'image/jpeg',
                    thumbnailUrl: p.src?.medium || p.src?.small,
                    previewUrl: p.src?.large || p.src?.medium,
                    downloadUrl,
                    width: p.width,
                    height: p.height,
                    duration: 0,
                    creator: p.photographer || 'Pexels Photographer',
                    license: 'Pexels License (Free Commercial Use, No attribution required)',
                    sourcePageUrl: p.url
                });
            }
        } catch (err) {
            console.warn('[DocuCraft: Pexels] Image search failed:', err.message);
        }
    }

    return results;
};

async function downloadAndNormalizeStockMedia({ downloadUrl, mediaType, sceneId, projectDir, onProgress = () => {} }) {
    const isVideo = mediaType === 'video';
    const tempDir = path.join(projectDir, 'Temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const targetDir = isVideo ? path.join(projectDir, 'Videos') : path.join(projectDir, 'Images');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    onProgress('downloading_stock', 15);

    const tempExt = isVideo ? '.tmp.mp4' : '.tmp.jpg';
    const tempFile = path.join(tempDir, `stock_${sceneId}_${Date.now()}${tempExt}`);
    const writer = fs.createWriteStream(tempFile);

    const response = await axios({
        url: downloadUrl,
        method: 'GET',
        responseType: 'stream',
        headers: {
            'User-Agent': 'DocuCraftBot/1.0 (https://aistudio.local; contact@aistudio.local)'
        },
        timeout: 90000
    });

    const totalBytes = parseInt(response.headers['content-length'] || '0', 10);
    let downloadedBytes = 0;

    response.data.on('data', chunk => {
        downloadedBytes += chunk.length;
        if (totalBytes > 0) {
            const pct = 15 + Math.round((downloadedBytes / totalBytes) * 45);
            onProgress('downloading_stock', pct);
        }
    });

    await new Promise((resolve, reject) => {
        response.data.pipe(writer);
        writer.on('finish', resolve);
        writer.on('error', reject);
    });

    onProgress('normalizing_media', 65);

    let finalPath = '';
    let finalUrl = '';
    let finalDuration = 0;

    if (isVideo) {
        finalPath = path.join(targetDir, `scene_${sceneId}_broll.mp4`);

        let hasAudio = false;
        try {
            const probeOut = execSync(
                `ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${tempFile}"`,
                { timeout: 5000 }
            ).toString().trim();
            hasAudio = probeOut.length > 0;
        } catch (_) {}

        const filter = "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,fps=30";
        let ffmpegCmd = '';
        if (hasAudio) {
            ffmpegCmd = `ffmpeg -y -i "${tempFile}" -t 60 -vf "${filter}" -c:v h264_nvenc -preset p4 -cq 20 -c:a aac -b:a 192k -ar 44100 -ac 2 -movflags +faststart "${finalPath}"`;
        } else {
            ffmpegCmd = `ffmpeg -y -i "${tempFile}" -f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -t 60 -vf "${filter}" -c:v h264_nvenc -preset p4 -cq 20 -c:a aac -b:a 192k -shortest -movflags +faststart "${finalPath}"`;
        }

        try {
            execSync(ffmpegCmd, { timeout: 120000 });
        } catch (ffErr) {
            console.error('[DocuCraft] FFmpeg stock video normalization failed:', ffErr.message);
            fs.copyFileSync(tempFile, finalPath);
        }

        finalDuration = getMediaDuration(finalPath);
        finalUrl = `media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    } else {
        finalPath = path.join(targetDir, `scene_${sceneId}_stock.jpg`);
        const filter = "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2";
        try {
            execSync(`ffmpeg -y -i "${tempFile}" -vf "${filter}" -q:v 2 "${finalPath}"`, { timeout: 25000 });
        } catch (_) {
            fs.copyFileSync(tempFile, finalPath);
        }
        finalUrl = `media:///${finalPath.replace(/\\/g, '/')}?t=${Date.now()}`;
    }

    try { if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile); } catch (_) {}

    return { finalPath, finalUrl, finalDuration, isVideo };
}


/**
 * Register all DocuCraft IPC handlers
 */
function registerDocuCraftHandlers(ipcMain) {
    console.log('[DocuCraft] Registering handlers...');

    const sendProgress = (event, payload) => {
        try {
            event.sender.send('docucraft-progress', payload);
        } catch (_) {}
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 1. Generate Script Manifest (LLM)
    // ─────────────────────────────────────────────────────────────────────────
    const handleGenerateScript = async (event, params) => {
        const {
            topic,
            projectFolder,
            targetDurationMinutes = 10,
            stylePreset = 'vintage_botanical',
            customStyleDesc = '',
            language = 'French',
            aiModel = 'custom'
        } = params;

        sendProgress(event, {
            step: 'script',
            status: 'Conceiving documentary structure & chapters...',
            progress: 10
        });

        const lang = LANG_CONFIG[language]?.name || language || 'French';

        // Duration configuration: dynamically calculate chapters, scenes, and word counts
        // to match the target duration accurately.
        // Speech rate: French ~130 wpm (~2.17 w/s), English ~150 wpm (~2.5 w/s)
        // Animated scenes: ~10s each (20-28 words), Static scenes: variable length
        let chaptersCount, scenesPerChapter;
        // With multi-shot static scenes (3 images per scene), scenes can be longer!
        // 10 min -> 4 chapters * 4 scenes = 16 scenes.
        if (targetDurationMinutes >= 35) {
            chaptersCount = 8; scenesPerChapter = 6;
        } else if (targetDurationMinutes >= 30) {
            chaptersCount = 7; scenesPerChapter = 6;
        } else if (targetDurationMinutes >= 25) {
            chaptersCount = 7; scenesPerChapter = 5;
        } else if (targetDurationMinutes >= 20) {
            chaptersCount = 6; scenesPerChapter = 5;
        } else if (targetDurationMinutes >= 15) {
            chaptersCount = 5; scenesPerChapter = 5;
        } else {
            chaptersCount = 4; scenesPerChapter = 4;
        }

        // Calculate word budget per scene type to hit the target duration
        const totalScenes = chaptersCount * scenesPerChapter;
        const animatedCount = Math.round(totalScenes * 0.27);
        const staticCount = totalScenes - animatedCount;
        const targetTotalSeconds = targetDurationMinutes * 60;
        const animatedSecondsEach = 10;
        const animatedTotalSeconds = animatedCount * animatedSecondsEach;

        let staticSecondsPerScene = Math.round((targetTotalSeconds - animatedTotalSeconds) / staticCount);

        // Words per second ~2.17 for French, ~2.5 for English; use 2.2 as universal avg
        const wordsPerSecond = 2.2;
        const staticWordsTarget = Math.round(staticSecondsPerScene * wordsPerSecond);
        // Force the min to be slightly lower so we have natural variance, max capped tightly
        const staticWordsMin = Math.max(35, staticWordsTarget - 10);
        const staticWordsMax = staticWordsTarget + 10;
        const animatedWordsMin = 20;
        const animatedWordsMax = 28;

        const narrativePersonas = [
            "Mystery & Enigma: Frame the topic as a grand unsolved mystery. Use curiosity gaps, cliffhangers at the end of chapters, and a tone of investigative discovery. Hook the viewer immediately by hinting at a secret.",
            "Cinematic Epic: Tell the story with sweeping, dramatic language. Focus on high stakes, monumental scale, and profound impact. Use powerful metaphors, poetic pacing, and build up to epic climaxes.",
            "Intimate & Emotional: Tell the story through the lens of human experience or micro-level survival. Focus on struggles, triumphs, and the emotional core of the subject. Use empathetic, relatable language.",
            "Scientific Wonder (Carl Sagan style): Frame the topic as a profound natural marvel. Use awe-inspiring, philosophical language that connects tiny details to the vast universe. Create a sense of existential beauty.",
            "Fast-paced Thriller: Treat the subject like an unfolding thriller. Keep sentences punchy, build tension rapidly, and reveal information in shocking or surprising twists.",
            "Philosophical & Reflective: Explore the deep philosophical implications of the topic. Ask thought-provoking rhetorical questions. Challenge the viewer's preconceptions.",
            "Investigative Journalist: Take a gritty, boots-on-the-ground approach. Focus on uncovering hidden truths, exposing secrets, and connecting the dots for the viewer with sharp, analytical language."
        ];

        // Use a hash of the topic to pick a consistent style for the same topic, or just pick randomly
        // We will pick randomly to ensure different videos have different vibes even if topics are similar
        const selectedPersona = narrativePersonas[Math.floor(Math.random() * narrativePersonas.length)];

        const baseStyle = STYLE_PROMPTS[stylePreset] || STYLE_PROMPTS.vintage_botanical;
        const effectiveStyle = stylePreset === 'custom' && customStyleDesc.trim()
            ? `${customStyleDesc.trim()}, 8k resolution, documentary archival aesthetic`
            : baseStyle;

        const systemPrompt = `You are an elite documentary director and master storyteller creating highly engaging, binge-worthy documentaries (like BBC, Netflix true crime, or Arte).

YOUR MISSION:
Create a complete, deeply engaging documentary script manifest for a ${targetDurationMinutes}-minute video.
Topic: "${topic || 'Autonomous permaculture ecosystems: secrets of living soil and companion plant guilds'}"
Language of Voiceover & Titles: ${lang}
Visual Art Style: ${stylePreset} (${effectiveStyle})

STORYTELLING DIRECTIVE (CRITICAL):
You MUST adopt the following narrative persona: "${selectedPersona}"
DO NOT write a dry Wikipedia article. Write a gripping script that hooks the viewer in the very first sentence. Maintain tension, use curiosity gaps ("but what they found was much darker..."), and make the viewer desperately want to watch until the end.

STRUCTURE REQUIREMENTS:
1. Target Chapters: exactly ${chaptersCount} chapters.
2. Scenes per Chapter: ${scenesPerChapter} scenes per chapter.
3. Total Scenes: ${chaptersCount * scenesPerChapter} scenes.
4. Voiceover Text (narration):
   - Written in natural, evocative, highly engaging ${lang}.
   - MUST sound like a masterful narrator reading a thrilling story, NOT a textbook.
   - DURATION & PACING RULES (CRITICAL — the documentary MUST fill ${targetDurationMinutes} minutes!):
     * TOTAL target narration time: ~${targetTotalSeconds} seconds across ${totalScenes} scenes.
     * For ANIMATED scenes (isAnimated = true): Narration must be CONCISE: ${animatedWordsMin}-${animatedWordsMax} words (~8-10 seconds) so spoken narration naturally matches the generative AI video length!
     * For STATIC Ken Burns scenes (isAnimated = false): Narration MUST be perfectly paced: ${staticWordsMin}-${staticWordsMax} words (~${staticSecondsPerScene} seconds each). Write rich, detailed, gripping narration!
5. Image Prompt:
   - Written in ENGLISH for AI image generators.
   - MUST integrate the visual style: "${effectiveStyle}".
   - Hyper-detailed: specifies subject, composition, textures, lighting, perspective.
6. Video Generation Prompt (Optimized for Google Veo / Omni Flash):
   - Written in ENGLISH. These models need DIRECTION, not just description.
   - Use a structured formula: [Camera & Lens] + [Subject Action/Physics] + [Context/Lighting].
   - Examples of camera directions: "Camera locked at eye level, 35mm lens, medium close-up", "smooth tracking shot following the subject", "high angle looking down, slow push-in".
   - Describe realistic weight and motion, not just "moves". (e.g., "dust motes swirl heavily in the sunbeams", "leaves rustle violently in the wind").
   - NEVER use negative words like "no people" or "don't show". Describe what IS there (e.g., "empty, quiet street").
   - Focus on cinematic, subtle 5-10 second progression.
7. isAnimated Flag:
   - Mark EXACTLY 25% to 30% of key climax/transformational scenes as true: isAnimated = true.
   - The remaining scenes must be isAnimated = false (static high-res image with Ken Burns zoom).
8. Handwritten Annotation / Callout:
   - A short, authentic field observation / note to be stamped on screen (in ${lang}).

OUTPUT FORMAT (STRICT JSON ONLY):
{
  "title": "Evocative, clickbait-level engaging Documentary Title in ${lang}",
  "synopsis": "Comprehensive summary of the gripping narrative in ${lang}",
  "stylePreset": "${stylePreset}",
  "customStyleDesc": "${customStyleDesc || ''}",
  "language": "${lang}",
  "targetDurationMinutes": ${targetDurationMinutes},
  "chapters": [
    {
      "id": "c1",
      "index": 1,
      "title": "Chapter 1 Title in ${lang} - Must be intriguing",
      "targetDuration": "02:30",
      "objective": "What hook or emotional beat this chapter delivers",
      "scenes": [
        {
          "id": "c1_s1",
          "chapterIndex": 1,
          "sceneIndex": 1,
          "title": "Scene 1 Title in ${lang}",
          "voiceoverText": "Gripping, high-tension narration in ${lang}...",
          "imagePrompt": "Detailed English prompt incorporating style: ${effectiveStyle}...",
          "videoAnimationPrompt": "Detailed English I2V camera motion...",
          "isAnimated": false,
          "videoFitMode": "drift",
          "annotation": "Intriguing field note / citation in ${lang}"
        }
      ]
    }
  ]
}`;


        console.log(`[DocuCraft] Requesting script from AI provider=${aiModel} lang=${lang} chapters=${chaptersCount}`);

        const raw = await ai.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate the full documentary manifest JSON for topic: "${topic}". Remember to output strict JSON only.` }
        ], true, aiModel);

        sendProgress(event, {
            step: 'script',
            status: 'Parsing and structuring documentary chapters...',
            progress: 75
        });

        const scriptData = cleanAndParseJSON(raw);

        // Sanitize and ensure IDs & timestamps
        let folderName = projectFolder;
        let projectDir;
        if (folderName) {
            projectDir = path.join(DOCUCRAFT_DIRS.projects, folderName);
            if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });
        } else {
            const timestamp = Date.now();
            const safeTopic = (topic || 'documentary').replace(/[^a-z0-9_-]/gi, '_').substring(0, 24);
            folderName = \`DocuCraft_${safeTopic}_${timestamp}\`;
            projectDir = path.join(DOCUCRAFT_DIRS.projects, folderName);
            fs.mkdirSync(projectDir, { recursive: true });
        }

        // Calculate cumulative YouTube chapters
        let cumulativeSeconds = 0;
        const ytChaptersLines = [];

        if (Array.isArray(scriptData.chapters)) {
            scriptData.chapters.forEach((chap, cIdx) => {
                chap.index = cIdx + 1;
                chap.id = chap.id || `c${cIdx + 1}`;
                const chapTc = formatTimecode(cumulativeSeconds);
                ytChaptersLines.push(`${chapTc} - ${chap.title || `Chapitre ${cIdx + 1}`}`);

                if (Array.isArray(chap.scenes)) {
                    chap.scenes.forEach((sc, sIdx) => {
                        sc.id = sc.id || `c${cIdx + 1}_s${sIdx + 1}`;
                        sc.chapterIndex = cIdx + 1;
                        sc.sceneIndex = sIdx + 1;
                        if (typeof sc.isAnimated !== 'boolean') {
                            sc.isAnimated = (sIdx === 0 && cIdx % 2 === 0);
                        }
                        sc.videoFitMode = sc.videoFitMode || 'drift';
                        const wordCount = (sc.voiceoverText || '').split(/\s+/).filter(Boolean).length;
                        const estSeconds = Math.max(6, Math.min(25, Math.round(wordCount / 2.2)));
                        sc.audioDuration = estSeconds;
                        cumulativeSeconds += estSeconds;
                    });
                }
            });
        }

        scriptData.projectFolder = folderName;
        scriptData.createdAt = scriptData.createdAt || Date.now();
        scriptData.createdAt = scriptData.createdAt || Date.now();
        scriptData.youtubeChapters = ytChaptersLines.join('\n');

        // Save manifest to project folder
        const manifestPath = path.join(projectDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(scriptData, null, 2), 'utf-8');

        sendProgress(event, {
            step: 'script',
            status: `Manifest created with ${scriptData.chapters?.length || 0} chapters!`,
            progress: 100
        });

        return scriptData;
    };

    ipcMain.handle('docucraft:generate-script', handleGenerateScript);
    ipcMain.handle('docucraft-generate-script', handleGenerateScript);


    // ─────────────────────────────────────────────────────────────────────────
    // 2. Generate Voiceover Audio (VoiceAPI / ElevenLabs)
    // ─────────────────────────────────────────────────────────────────────────
    const handleGenerateAudio = async (event, params) => {
        const {
            projectFolder,
            script,
            ttsService = 'voiceapi',
            sceneId = null
        } = params;

        if (!script || !script.chapters) {
            throw new Error('Script data missing');
        }

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const audioDir = path.join(projectDir, 'Audio');
        if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

        // Collect all target scenes
        const targetScenes = [];
        script.chapters.forEach(chap => {
            (chap.scenes || []).forEach(sc => {
                if (!sceneId || sc.id === sceneId) {
                    targetScenes.push(sc);
                }
            });
        });

        console.log(`[DocuCraft] Generating audio for ${targetScenes.length} scenes via ${ttsService}`);

        const total = targetScenes.length;
        for (let i = 0; i < total; i++) {
            const sc = targetScenes[i];
            const percent = Math.round(((i + 1) / total) * 100);

            sendProgress(event, {
                step: 'audio',
                status: `Generating voiceover for ${sc.title || sc.id} (${i + 1}/${total})...`,
                progress: percent,
                sceneId: sc.id
            });

            try {
                const text = sc.voiceoverText;
                if (!text || text.trim().length === 0) continue;

                const filename = `${sc.id}_voice.mp3`;
                const audioPath = await docuCraftGenerateVoice(
                    text,
                    script.language || 'French',
                    audioDir,
                    filename,
                    ttsService
                );

                const dur = getMediaDuration(audioPath);
                sc.audioUrl = `media:///${audioPath.replace(/\\/g, '/')}?t=${Date.now()}`;
                sc.audioDuration = dur;
            } catch (err) {
                console.error(`[DocuCraft] Voice failed for ${sc.id}:`, err.message);
                sc.error = err.message;
            }
        }

        // Merge with existing disk manifest and reconcile disk files
        mergeScriptWithDisk(script, projectDir);
        syncManifestWithDiskFiles(script, projectDir);

        // Save updated manifest
        const manifestPath = path.join(projectDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');

        sendProgress(event, {
            step: 'audio',
            status: 'All voiceovers generated successfully!',
            progress: 100
        });

        return script;
    };

    ipcMain.handle('docucraft:generate-audio', handleGenerateAudio);
    ipcMain.handle('docucraft-generate-audio', handleGenerateAudio);


    // ─────────────────────────────────────────────────────────────────────────
    // 3. Generate Illustrations (Google Pics / Nano Banana)
    // ─────────────────────────────────────────────────────────────────────────
    const handleGenerateImages = async (event, params) => {
        const {
            projectFolder,
            script,
            imageModel = 'nano_pics',
            sceneId = null
        } = params;

        if (!script || !script.chapters) throw new Error('Script data missing');

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const imagesDir = path.join(projectDir, 'Images');
        if (!fs.existsSync(imagesDir)) fs.mkdirSync(imagesDir, { recursive: true });

        const targetScenes = [];
        script.chapters.forEach(chap => {
            (chap.scenes || []).forEach(sc => {
                if (!sceneId || sc.id === sceneId) {
                    targetScenes.push(sc);
                }
            });
        });

        const total = targetScenes.length;
        console.log(`[DocuCraft] Generating images for ${total} scenes with model=${imageModel}`);

        let completed = 0;
        await Promise.all(targetScenes.map(async (sc, i) => {
            try {
                const basePrompt = sc.imagePrompt || sc.voiceoverText;
                const cleanModel = imageModel.replace(/^glabs-/, '');

                // Calculate estimated duration to determine how many images we need (1 per 5 seconds)
                const textForCount = sc.voiceoverText || sc.script || "";
                const wordCount = textForCount.split(/\s+/).filter(w => w.length > 0).length;
                const estDuration = wordCount / 2.2; // roughly 2.2 words per second
                // For static scenes, we want 1 image per 5 seconds of audio
                const imageCount = sc.isAnimated ? 1 : Math.max(1, Math.round(estDuration / 5));

                const promptsToRun = [];
                if (sc.isAnimated) {
                    promptsToRun.push(basePrompt);
                } else {
                    const cinematicModifiers = [
                        "extreme wide shot, establishing panoramic view, grand scale, highly detailed",
                        "medium close-up, focused on main subject, dynamic composition, dramatic lighting",
                        "macro extreme close-up detail, intricate texture, unusual angle, depth of field",
                        "low angle shot, looking up, imposing and dramatic perspective, cinematic lighting",
                        "high angle aerial shot, bird's eye view, sprawling landscape, architectural detail",
                        "over-the-shoulder shot, revealing the scene from the subject's perspective, immersive",
                        "dutch angle, tilted perspective, uneasy and atmospheric, stylized lighting",
                        "silhouette shot against bright background, high contrast, dramatic shadows"
                    ];

                    for (let pIdx = 0; pIdx < imageCount; pIdx++) {
                        const modifier = cinematicModifiers[pIdx % cinematicModifiers.length];
                        promptsToRun.push(`${basePrompt} -- ${modifier}`);
                    }
                }

                const savedPaths = [];
                await Promise.all(promptsToRun.map(async (p, pIdx) => {
                    const paths = await ai.generateImage({
                        prompt: p,
                        model: cleanModel,
                        aspectRatio: '16:9',
                        count: 1,
                        sectionDir: projectDir,
                        subFolder: 'Images',
                        sceneIndex: i + (pIdx * 1000) // Ensure unique file names
                    });
                    if (paths && paths.length > 0) {
                        savedPaths.push(paths[0]);
                    }
                }));

                if (savedPaths && savedPaths.length > 0) {
                    sc.imageUrl = `media:///${savedPaths[0].replace(/\\/g, '/')}?t=${Date.now()}`;

                    if (promptsToRun.length > 1) {
                        sc.shots = savedPaths.map((sp, idx) => ({
                            id: `${sc.id}_shot_${idx+1}`,
                            imageUrl: `media:///${sp.replace(/\\/g, '/')}?t=${Date.now()}`
                        }));
                    }
                }
            } catch (err) {
                console.error(`[DocuCraft] Image gen failed for scene ${sc.id}:`, err.message);
                sc.error = err.message;
            } finally {
                completed++;
                const percent = Math.round((completed / total) * 100);
                sendProgress(event, {
                    step: 'images',
                    status: `Illustrating scenes with ${imageModel} (${completed}/${total})...`,
                    progress: percent,
                    sceneId: sc.id
                });
            }
        }));

        // Merge with existing disk manifest and reconcile disk files
        mergeScriptWithDisk(script, projectDir);
        syncManifestWithDiskFiles(script, projectDir);

        // Save manifest
        const manifestPath = path.join(projectDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');

        sendProgress(event, {
            step: 'images',
            status: 'Illustration generation complete!',
            progress: 100
        });

        return script;
    };

    ipcMain.handle('docucraft:generate-images', handleGenerateImages);
    ipcMain.handle('docucraft-generate-images', handleGenerateImages);

    // Regenerate single image
    const handleRegenerateImage = async (event, params) => {
        const { projectFolder, sceneId, prompt, imageModel = 'nano_pics' } = params;
        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;

        console.log(`[DocuCraft] Regenerating single image: sceneId=${sceneId} model=${imageModel}`);

        const savedPaths = await ai.generateImage({
            prompt: prompt,
            model: imageModel.replace(/^glabs-/, ''),
            aspectRatio: '16:9',
            count: 1,
            sectionDir: projectDir,
            subFolder: 'Images',
            sceneIndex: Date.now() % 1000
        });

        if (!savedPaths || savedPaths.length === 0) {
            throw new Error('Image generation returned no files');
        }

        const finalUrl = `media:///${savedPaths[0].replace(/\\/g, '/')}?t=${Date.now()}`;

        // Persist to manifest if it exists
        try {
            const manifestPath = path.join(projectDir, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                const diskScript = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                let found = false;
                (diskScript.chapters || []).forEach(chap => {
                    (chap.scenes || []).forEach(sc => {
                        if (sc.id === sceneId) {
                            sc.imageUrl = finalUrl;
                            found = true;
                        }
                    });
                });
                if (found) {
                    syncManifestWithDiskFiles(diskScript, projectDir);
                    fs.writeFileSync(manifestPath, JSON.stringify(diskScript, null, 2), 'utf-8');
                }
            }
        } catch (e) {
            console.warn('[DocuCraft] Failed to update manifest after image regen:', e.message);
        }

        return { imageUrl: finalUrl, localPath: savedPaths[0] };
    };

    ipcMain.handle('docucraft:regenerate-image', handleRegenerateImage);
    ipcMain.handle('docucraft-regenerate-image', handleRegenerateImage);


    // ─────────────────────────────────────────────────────────────────────────
    // 4. Animate Key Scenes (Google Vids / Veo 3.1 / Omni Flash)
    // ─────────────────────────────────────────────────────────────────────────
    const handleGenerateVideos = async (event, params) => {
        const {
            projectFolder,
            script,
            videoModel = 'omni_vids',
            videoDuration = 9,
            sceneId = null
        } = params;

        if (!script || !script.chapters) throw new Error('Script data missing');

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const videosDir = path.join(projectDir, 'Videos');
        if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

        // Collect scenes that have isAnimated === true
        const animatedScenes = [];
        script.chapters.forEach(chap => {
            (chap.scenes || []).forEach(sc => {
                if (sc.isAnimated && (!sceneId || sc.id === sceneId)) {
                    animatedScenes.push(sc);
                }
            });
        });

        const total = animatedScenes.length;
        console.log(`[DocuCraft] Animating ${total} key scenes with model=${videoModel}`);

        let completed = 0;
        await Promise.all(animatedScenes.map(async (sc, i) => {
            try {
                // Use image as reference if available
                let referenceImages = [];
                if (sc.imageUrl) {
                    const rawImgPath = sc.imageUrl.replace('media:///', '').split('?')[0];
                    if (fs.existsSync(rawImgPath)) {
                        const ext = rawImgPath.endsWith('.png') ? 'png' : 'jpeg';
                        const b64 = fs.readFileSync(rawImgPath, { encoding: 'base64' });
                        referenceImages.push({ data: `data:image/${ext};base64,${b64}` });
                    }
                }

                let motionPrompt = sc.videoAnimationPrompt || sc.imagePrompt;

                // Veo / Omni Flash Best Practices for Image-to-Video (I2V):
                // Focus heavily on motion and physics, avoid over-describing static elements.
                if (referenceImages.length > 0) {
                    motionPrompt = `${motionPrompt}. Focus purely on smooth camera motion and realistic physics. Cinematic documentary lighting, natural movement.`;
                } else {
                    motionPrompt = `${motionPrompt}. Cinematic documentary camera motion, authentic archival grain. Camera locked and tracking smoothly.`;
                }

                const savedPath = await ai.generateVideo({
                    prompt: motionPrompt,
                    model: videoModel,
                    aspectRatio: '16:9',
                    resolution: '1080p',
                    generateAudio: false,
                    sectionDir: projectDir,
                    subFolder: 'Videos',
                    sceneIndex: i,
                    referenceImages,
                    videoLength: videoDuration
                });

                if (savedPath) {
                    sc.videoUrl = `media:///${savedPath.replace(/\\/g, '/')}?t=${Date.now()}`;
                }
            } catch (err) {
                console.error(`[DocuCraft] Video gen failed for scene ${sc.id}:`, err.message);
                sc.error = err.message;
            } finally {
                completed++;
                const percent = Math.round((completed / total) * 100);
                sendProgress(event, {
                    step: 'videos',
                    status: `Animating key scenes with ${videoModel} (${completed}/${total})...`,
                    progress: percent,
                    sceneId: sc.id
                });
            }
        }));

        // Merge with existing disk manifest and reconcile disk files
        mergeScriptWithDisk(script, projectDir);
        syncManifestWithDiskFiles(script, projectDir);

        // Save manifest
        const manifestPath = path.join(projectDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');

        sendProgress(event, {
            step: 'videos',
            status: 'Key scene animations complete!',
            progress: 100
        });

        return script;
    };

    ipcMain.handle('docucraft:generate-videos', handleGenerateVideos);
    ipcMain.handle('docucraft-generate-videos', handleGenerateVideos);

    // Regenerate single video
    const handleRegenerateVideo = async (event, params) => {
        const { projectFolder, sceneId, prompt, imageUrl, videoModel = 'omni_vids' } = params;
        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;

        console.log(`[DocuCraft] Regenerating single video: sceneId=${sceneId} model=${videoModel}`);

        let referenceImages = [];
        if (imageUrl) {
            const rawImgPath = imageUrl.replace('media:///', '').split('?')[0];
            if (fs.existsSync(rawImgPath)) {
                const ext = rawImgPath.endsWith('.png') ? 'png' : 'jpeg';
                const b64 = fs.readFileSync(rawImgPath, { encoding: 'base64' });
                referenceImages.push({ data: `data:image/${ext};base64,${b64}` });
            }
        }

        const savedPath = await ai.generateVideo({
            prompt: prompt,
            model: videoModel,
            aspectRatio: '16:9',
            resolution: '1080p',
            generateAudio: false,
            sectionDir: projectDir,
            subFolder: 'Videos',
            sceneIndex: Date.now() % 1000,
            referenceImages,
            videoLength: 9
        });

        const finalUrl = `media:///${savedPath.replace(/\\/g, '/')}?t=${Date.now()}`;

        // Persist to manifest if it exists
        try {
            const manifestPath = path.join(projectDir, 'manifest.json');
            if (fs.existsSync(manifestPath)) {
                const diskScript = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                let found = false;
                (diskScript.chapters || []).forEach(chap => {
                    (chap.scenes || []).forEach(sc => {
                        if (sc.id === sceneId) {
                            sc.videoUrl = finalUrl;
                            found = true;
                        }
                    });
                });
                if (found) {
                    syncManifestWithDiskFiles(diskScript, projectDir);
                    fs.writeFileSync(manifestPath, JSON.stringify(diskScript, null, 2), 'utf-8');
                }
            }
        } catch (e) {
            console.warn('[DocuCraft] Failed to update manifest after video regen:', e.message);
        }

        return { videoUrl: finalUrl, localPath: savedPath };
    };

    // Helper: Extract last video frame for seamless extension
    const extractLastVideoFrame = (videoPath, outputPath) => {
        const duration = getMediaDuration(videoPath);
        const seekTime = Math.max(0, duration - 0.2);
        execSync(
            `ffmpeg -ss ${seekTime.toFixed(2)} -i "${videoPath}" -vf "scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1" -frames:v 1 -update 1 -q:v 2 -y "${outputPath}"`,
            { timeout: 15000 }
        );
    };

    // Helper: Concat two video clips using FFmpeg demuxer
    const concatTwoVideos = (vid1, vid2, outputPath) => {
        return new Promise((resolve, reject) => {
            const listFile = path.join(path.dirname(outputPath), `concat_extend_${Date.now()}.txt`);
            fs.writeFileSync(listFile, `file '${vid1.replace(/\\/g, '/')}'\nfile '${vid2.replace(/\\/g, '/')}'\n`, 'utf-8');

            const hasAudio = (() => {
                try {
                    const out = execSync(`ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${vid1}"`, { timeout: 5000 }).toString().trim();
                    return out.length > 0;
                } catch (_) { return false; }
            })();

            const args = [
                '-f', 'concat', '-safe', '0',
                '-i', listFile,
                '-c:v', 'h264_nvenc', '-preset', 'p4', '-pix_fmt', 'yuv420p'
            ];
            if (hasAudio) {
                args.push('-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2');
            } else {
                args.push('-an');
            }
            args.push('-y', outputPath);

            const proc = spawn('ffmpeg', args);
            proc.on('close', code => {
                try { fs.unlinkSync(listFile); } catch (_) {}
                if (code === 0 && fs.existsSync(outputPath)) resolve(outputPath);
                else reject(new Error(`Concat two videos failed with code ${code}`));
            });
            proc.on('error', err => {
                try { fs.unlinkSync(listFile); } catch (_) {}
                reject(err);
            });
        });
    };

    // Extend video clip by generating continuation (Part 2) from last frame
    const handleExtendVideo = async (event, params) => {
        const {
            projectFolder,
            sceneId,
            videoModel = 'omni_vids'
        } = params;

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const videosDir = path.join(projectDir, 'Videos');
        if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

        const manifestPath = path.join(projectDir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) throw new Error('Project manifest not found');
        const script = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

        let targetScene = null;
        (script.chapters || []).forEach(chap => {
            (chap.scenes || []).forEach(sc => {
                if (sc.id === sceneId) targetScene = sc;
            });
        });

        if (!targetScene || !targetScene.videoUrl) {
            throw new Error(`Scene ${sceneId} does not have an existing video to extend`);
        }

        const rawVidPath = targetScene.videoUrl.replace('media:///', '').split('?')[0];
        if (!fs.existsSync(rawVidPath)) {
            throw new Error(`Existing video file not found at ${rawVidPath}`);
        }

        console.log(`[DocuCraft] Extending video for scene ${sceneId} model=${videoModel}`);

        sendProgress(event, {
            step: 'videos',
            status: `Extracting last frame of scene ${targetScene.title || sceneId}...`,
            progress: 25,
            sceneId
        });

        const lastFramePath = path.join(videosDir, `${sceneId}_lastframe_${Date.now()}.jpg`);
        extractLastVideoFrame(rawVidPath, lastFramePath);

        const lastFrameB64 = fs.readFileSync(lastFramePath, { encoding: 'base64' });
        const referenceImages = [{ data: `data:image/jpeg;base64,${lastFrameB64}` }];

        sendProgress(event, {
            step: 'videos',
            status: `Generating continuation clip (Part 2) with ${videoModel}...`,
            progress: 50,
            sceneId
        });

        const continuationPrompt = `${targetScene.videoAnimationPrompt || targetScene.imagePrompt}. Seamless continuous camera motion continuation shot, consistent archival tone, authentic lighting, smooth 1080p.`;
        const part2SavedPath = await ai.generateVideo({
            prompt: continuationPrompt,
            model: videoModel,
            aspectRatio: '16:9',
            resolution: '1080p',
            generateAudio: false,
            sectionDir: projectDir,
            subFolder: 'Videos',
            sceneIndex: Date.now() % 1000,
            referenceImages,
            videoLength: 9
        });

        if (!part2SavedPath || !fs.existsSync(part2SavedPath)) {
            throw new Error('Part 2 video generation failed');
        }

        sendProgress(event, {
            step: 'videos',
            status: `Stitching Part 1 and Part 2 together...`,
            progress: 85,
            sceneId
        });

        const extendedFinalPath = path.join(videosDir, `${sceneId}_extended_${Date.now()}.mp4`);
        await concatTwoVideos(rawVidPath, part2SavedPath, extendedFinalPath);

        try { fs.unlinkSync(lastFramePath); } catch (_) {}

        const finalUrl = `media:///${extendedFinalPath.replace(/\\/g, '/')}?t=${Date.now()}`;
        targetScene.videoUrl = finalUrl;

        syncManifestWithDiskFiles(script, projectDir);
        fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');

        sendProgress(event, {
            step: 'videos',
            status: `Scene extended successfully!`,
            progress: 100,
            sceneId
        });

        return { videoUrl: finalUrl, localPath: extendedFinalPath };
    };

    ipcMain.handle('docucraft:extend-video', handleExtendVideo);
    ipcMain.handle('docucraft-extend-video', handleExtendVideo);

    ipcMain.handle('docucraft:regenerate-video', handleRegenerateVideo);
    ipcMain.handle('docucraft-regenerate-video', handleRegenerateVideo);

    // ─────────────────────────────────────────────────────────────────────────
    // Multi-Shot Narrative Chaining: Decompose scene into 3-5 causal shots
    // ─────────────────────────────────────────────────────────────────────────
    const handleDecomposeSceneShots = async (event, params) => {
        const {
            voiceoverText = '',
            duration = 18,
            imagePrompt = '',
            stylePreset = 'vintage_botanical',
            language = 'French',
            aiModel = 'custom'
        } = params;

        const effectiveDur = Math.max(6, duration || 18);
        
        // Оптимизированная логика под Omni Flash (~8 сек) и ритм:
        // До 10 сек -> 2 плана
        // 11 - 24 сек -> 3 плана
        // Больше 24 сек -> 4 плана
        const shotCount = effectiveDur <= 10 ? 2 : (effectiveDur <= 24 ? 3 : 4);
        const targetShotDuration = +(effectiveDur / shotCount).toFixed(1);

        const systemPrompt = `You are an elite documentary storyboard director and visual pacing editor.
The narrator speaks the following voiceover in ${language} (total length: ${effectiveDur.toFixed(1)} seconds):
"${voiceoverText}"

Visual style: ${stylePreset} (${imagePrompt})

YOUR MISSION:
Decompose this scene into exactly ${shotCount} consecutive visual shots that build an addictive, continuous CAUSAL STORYTELLING CHAIN.
Instead of animating one isolated static image, each shot captures what was happening before, how the action developed, or what transformation occurred, so that:
- Last frame of Shot N leads directly into Shot N+1!
- The viewer stays completely hooked by continuous visual progression!

The 4-5 classic cinematic roles:
1. 'cause' (Initial State / Origins / Tension / Historical Context / Dry before-state)
2. 'action' (Intervention / Process / Human or Physical Action / The work begins)
3. 'transform' (Micro-transformation / Internal mechanism / Chemical or biological reaction / Underground detail)
4. 'result' (Culmination / Fruit / Macro outcome / Verdant abundance)
5. 'detail' (Macro close-up / Scientific observation)

For EACH shot, return:
- role: 'cause' | 'action' | 'transform' | 'result' | 'detail'
- roleLabel: Short expressive title in Russian or French (e.g. "Истоки / Исходное состояние", "Действие / Закладка", "Микро-процесс", "Результат / Кульминация")
- duration: number (seconds, approx ${targetShotDuration})
- prompt: English prompt for Image-to-Video AI (Veo 3.1 / Google Vids / Omni Flash). Must specify camera motion, action, and physical evolution continuing from the previous frame.

OUTPUT STRICT JSON ONLY (array of objects):
[
  {
    "id": "shot_1",
    "index": 0,
    "role": "cause",
    "roleLabel": "Исходное состояние",
    "duration": ${targetShotDuration},
    "prompt": "Authentic archival botanical style: ..."
  }
]`;

        let shots = [];
        try {
            const raw = await ai.chat([
                { role: 'system', content: systemPrompt },
                { role: 'user', content: 'Decompose this scene into consecutive cinematic shots now. Output strict JSON array only.' }
            ], true, aiModel);
            shots = cleanAndParseJSON(raw);
        } catch (e) {
            console.warn('[DocuCraft] AI decomposition failed, using heuristic template:', e.message);
        }

        if (!Array.isArray(shots) || shots.length === 0) {
            const roles = [
                { role: 'cause', label: 'Истоки / Причина', promptSuffix: 'Establishing wide shot: raw unworked condition, authentic archival detail' },
                { role: 'action', label: 'Процесс / Действие', promptSuffix: 'Medium action shot: active intervention, dynamic movement, soil work' },
                { role: 'transform', label: 'Трансформация / Микромир', promptSuffix: 'Close-up macro cross-section: internal moisture, biological transformation' },
                { role: 'result', label: 'Кульминация / Итог', promptSuffix: 'Elevated cinematic pull-back: lush flourishing result, golden sunlight' },
                { role: 'detail', label: 'Макро-деталь', promptSuffix: 'Extreme close-up detail observation: texture and organic vibrancy' }
            ];
            shots = [];
            for (let i = 0; i < shotCount; i++) {
                const r = roles[i % roles.length];
                shots.push({
                    id: `shot_${Date.now()}_${i}`,
                    index: i,
                    role: r.role,
                    roleLabel: r.label,
                    duration: targetShotDuration,
                    prompt: `${imagePrompt}. Phase ${i + 1} (${r.role}): ${r.promptSuffix}, 1080p documentary.`
                });
            }
        }

        return shots.map((s, idx) => ({
            ...s,
            id: s.id || `shot_${idx}_${Date.now()}`,
            index: idx,
            duration: +(s.duration || targetShotDuration),
            status: 'idle'
        }));
    };

    ipcMain.handle('docucraft:decompose-scene-shots', handleDecomposeSceneShots);
    ipcMain.handle('docucraft-decompose-scene-shots', handleDecomposeSceneShots);

    // ─────────────────────────────────────────────────────────────────────────
    // Multi-Shot Narrative Chaining: Sequential Last-to-First Frame Generation
    // ─────────────────────────────────────────────────────────────────────────
    const handleGenerateShotChain = async (event, params) => {
        const {
            projectFolder,
            sceneId,
            shots = [],
            videoModel = 'omni_vids',
            baseImageUrl
        } = params;

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const videosDir = path.join(projectDir, 'Videos');
        if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

        let prevLastFramePath = null;
        if (baseImageUrl) {
            const rawImg = baseImageUrl.replace('media:///', '').split('?')[0];
            if (fs.existsSync(rawImg)) prevLastFramePath = rawImg;
        }

        const totalShots = shots.length;

        for (let i = 0; i < totalShots; i++) {
            const shot = shots[i];
            const currentVid = shot.videoUrl ? shot.videoUrl.replace('media:///', '').split('?')[0] : null;

            if (currentVid && fs.existsSync(currentVid)) {
                const lastFramePath = path.join(videosDir, `${sceneId}_shot${i}_last_${Date.now()}.jpg`);
                try {
                    extractLastVideoFrame(currentVid, lastFramePath);
                    if (fs.existsSync(lastFramePath)) prevLastFramePath = lastFramePath;
                } catch (_) {}
                continue;
            }

            shot.status = 'generating';
            sendProgress(event, {
                step: 'shot_chain',
                status: `Генерация плана ${i + 1}/${totalShots}: ${shot.roleLabel || shot.role}...`,
                progress: Math.round(((i) / totalShots) * 100),
                sceneId,
                shotIndex: i
            });

            let referenceImages = [];
            if (prevLastFramePath && fs.existsSync(prevLastFramePath)) {
                try {
                    const ext = prevLastFramePath.endsWith('.png') ? 'png' : 'jpeg';
                    const b64 = fs.readFileSync(prevLastFramePath, { encoding: 'base64' });
                    referenceImages.push({ data: `data:image/${ext};base64,${b64}` });
                    console.log(`[DocuCraft] Shot ${i} (${shot.role}) using chained start frame: ${path.basename(prevLastFramePath)}`);
                } catch (e) {
                    console.warn(`[DocuCraft] Could not read reference image ${prevLastFramePath}:`, e.message);
                }
            }

            try {
                const shotLength = Math.min(9, Math.max(3, Math.round(shot.duration || 4)));
                const savedPath = await ai.generateVideo({
                    prompt: shot.prompt,
                    model: videoModel,
                    aspectRatio: '16:9',
                    resolution: '1080p',
                    generateAudio: false,
                    sectionDir: projectDir,
                    subFolder: 'Videos',
                    sceneIndex: (Date.now() + i) % 1000,
                    referenceImages,
                    videoLength: shotLength
                });

                if (savedPath && fs.existsSync(savedPath)) {
                    shot.videoUrl = `media:///${savedPath.replace(/\\/g, '/')}?t=${Date.now()}`;
                    shot.status = 'ready';
                    delete shot.error;

                    const lastFramePath = path.join(videosDir, `${sceneId}_shot${i}_last_${Date.now()}.jpg`);
                    try {
                        extractLastVideoFrame(savedPath, lastFramePath);
                        if (fs.existsSync(lastFramePath)) {
                            prevLastFramePath = lastFramePath;
                        }
                    } catch (err) {
                        console.warn(`[DocuCraft] Failed extracting last frame from shot ${i}:`, err.message);
                    }
                } else {
                    shot.status = 'error';
                    shot.error = 'No video file produced';
                }
            } catch (err) {
                console.error(`[DocuCraft] Shot ${i} failed:`, err.message);
                shot.status = 'error';
                shot.error = err.message;
            }

            if (event && event.sender) {
                event.sender.send('docucraft:shot-updated', {
                    sceneId,
                    shotIndex: i,
                    shot
                });
            }
        }

        const manifestPath = path.join(projectDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            try {
                const script = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                for (const ch of script.chapters || []) {
                    for (const sc of ch.scenes || []) {
                        if (sc.id === sceneId) {
                            sc.shots = shots;
                        }
                    }
                }
                fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');
            } catch (_) {}
        }

        sendProgress(event, {
            step: 'shot_chain',
            status: `Цепочка из ${totalShots} планов завершена!`,
            progress: 100,
            sceneId
        });

        return shots;
    };

    ipcMain.handle('docucraft:generate-shot-chain', handleGenerateShotChain);
    ipcMain.handle('docucraft-generate-shot-chain', handleGenerateShotChain);

    // ─────────────────────────────────────────────────────────────────────────
    // Multi-Shot: Generate or re-generate individual shot
    // ─────────────────────────────────────────────────────────────────────────
    const handleGenerateSingleShot = async (event, params) => {
        const {
            projectFolder,
            sceneId,
            shotIndex = 0,
            prompt,
            duration = 4,
            videoModel = 'omni_vids',
            referenceImageUrl
        } = params;

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const videosDir = path.join(projectDir, 'Videos');
        if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

        let referenceImages = [];
        if (referenceImageUrl) {
            const raw = referenceImageUrl.replace('media:///', '').split('?')[0];
            if (fs.existsSync(raw)) {
                const ext = raw.endsWith('.png') ? 'png' : 'jpeg';
                const b64 = fs.readFileSync(raw, { encoding: 'base64' });
                referenceImages.push({ data: `data:image/${ext};base64,${b64}` });
            }
        }

        const shotLength = Math.min(9, Math.max(3, Math.round(duration)));
        const savedPath = await ai.generateVideo({
            prompt: prompt,
            model: videoModel,
            aspectRatio: '16:9',
            resolution: '1080p',
            generateAudio: false,
            sectionDir: projectDir,
            subFolder: 'Videos',
            sceneIndex: (Date.now() + shotIndex) % 1000,
            referenceImages,
            videoLength: shotLength
        });

        const finalUrl = `media:///${savedPath.replace(/\\/g, '/')}?t=${Date.now()}`;
        return { videoUrl: finalUrl, localPath: savedPath };
    };

    ipcMain.handle('docucraft:generate-single-shot', handleGenerateSingleShot);
    ipcMain.handle('docucraft-generate-single-shot', handleGenerateSingleShot);


    // ─────────────────────────────────────────────────────────────────────────
    // Helper: Render individual scene into normalized 1080p 30fps MP4
    // ─────────────────────────────────────────────────────────────────────────
    const renderSceneClip = (scene, outputPath, options = {}) => {
        return new Promise((resolve, reject) => {
            const cleanups = [];
            try {
                const hasVideo = !!scene.videoUrl;
                const hasImage = !!scene.imageUrl;
                const hasAudio = !!scene.audioUrl;

                let videoPath = hasVideo ? scene.videoUrl.replace('media:///', '').split('?')[0] : null;
                let imagePath = hasImage ? scene.imageUrl.replace('media:///', '').split('?')[0] : null;
                let audioPath = hasAudio ? scene.audioUrl.replace('media:///', '').split('?')[0] : null;

                // Verify file existence
                if (videoPath && !fs.existsSync(videoPath)) videoPath = null;
                if (imagePath && !fs.existsSync(imagePath)) imagePath = null;
                if (audioPath && !fs.existsSync(audioPath)) audioPath = null;

                let duration = scene.audioDuration || 6;
                if (audioPath) {
                    try {
                        const actualDur = getMediaDuration(audioPath);
                        if (actualDur > 0) duration = actualDur;
                    } catch (err) {
                        console.warn(`[DocuCraft FFmpeg] Failed to get actual audio duration for scene ${scene.id}, using estimate.`, err.message);
                    }
                }
                duration = Math.max(3, duration);

                const isLastScene = options.isLastSceneOfDocumentary;
                const padTime = 0.5;
                if (isLastScene) {
                    duration += padTime;
                }

                const rendersDir = path.dirname(outputPath);
                if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });

                const overallIdx = options.overallIndex || 1;
                const showAnnotations = options.showAnnotations !== false;
                const showChapterTitles = options.showChapterTitles !== false;
                const fitMode = scene.videoFitMode || options.defaultFitMode || 'drift';

                // Prepare text overlays (drawtext filters)
                const drawtextFilters = [];

                if (isLastScene) {
                    drawtextFilters.push(`fade=t=out:st=${(duration - padTime).toFixed(2)}:d=${padTime}`);
                }

                // 1. Chapter Title Card (if first scene of chapter)
                if (showChapterTitles && options.isFirstSceneOfChapter && options.chapterTitle) {
                    const chapTextPath = path.join(rendersDir, `chap_${scene.id}_${Date.now()}.txt`);
                    fs.writeFileSync(chapTextPath, String(options.chapterTitle).trim(), 'utf-8');
                    cleanups.push(chapTextPath);
                    const escapedChap = chapTextPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '$1\\:');
                    drawtextFilters.push(
                        `drawtext=fontfile='C\\:/Windows/Fonts/georgia.ttf':textfile='${escapedChap}':fontcolor=0xf5deb3:fontsize=32:x='(w-tw)/2':y='65':box=1:boxcolor=0x0a0c10@0.78:boxborderw=16:enable='between(t,0.6,4.5)':alpha='if(lt(t,1.4),(t-0.6)/0.8,if(gt(t,3.8),(4.5-t)/0.7,1))'`
                    );
                }

                // 2. Archival Annotation / Figure stamp
                if (showAnnotations && scene.annotation && scene.annotation.trim()) {
                    const annotTextPath = path.join(rendersDir, `annot_${scene.id}_${Date.now()}.txt`);
                    fs.writeFileSync(annotTextPath, String(scene.annotation).trim(), 'utf-8');
                    cleanups.push(annotTextPath);
                    const escapedAnnot = annotTextPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '$1\\:');
                    const endTime = Math.max(2.5, Math.min(8.0, duration - 0.4));
                    drawtextFilters.push(
                        `drawtext=fontfile='C\\:/Windows/Fonts/georgia.ttf':textfile='${escapedAnnot}':fontcolor=0xf4ecd8:fontsize=22:x='(w-tw)/2':y='h-th-40':box=1:boxcolor=0x0c0f14@0.80:boxborderw=12:enable='between(t,1.2,${endTime.toFixed(2)})':alpha='if(lt(t,2.0),(t-1.2)/0.8,if(gt(t,${(endTime - 0.8).toFixed(2)}),(${endTime.toFixed(2)}-t)/0.8,1))'`
                    );
                }

                const args = [];

                // Multi-Shot Chaining check: if scene has multiple generated shots, assemble them seamlessly!
                const readyVideoShots = (scene.shots || [])
                    .filter(s => s && s.videoUrl)
                    .map(s => s.videoUrl.replace('media:///', '').split('?')[0])
                    .filter(p => fs.existsSync(p));

                const readyImageShots = (scene.shots || [])
                    .filter(s => s && !s.videoUrl && s.imageUrl)
                    .map(s => s.imageUrl.replace('media:///', '').split('?')[0])
                    .filter(p => fs.existsSync(p));

                if (readyVideoShots.length > 1) {
                    let totalVideoDur = 0;
                    for (const sp of readyVideoShots) {
                        try { totalVideoDur += getMediaDuration(sp); } catch(e) { totalVideoDur += 4; }
                    }

                    let speedFactor = duration / Math.max(0.1, totalVideoDur);
                    if (speedFactor > 2.0) speedFactor = 2.0; // Max slow-down
                    if (speedFactor < 0.25) speedFactor = 0.25; // Max speed-up

                    console.log(`[DocuCraft FFmpeg] Scene ${scene.id} assembling ${readyVideoShots.length} chained video shots. Auto-Retiming concatenated video: ${totalVideoDur.toFixed(2)}s -> ${duration.toFixed(2)}s (factor: ${speedFactor.toFixed(4)})`);
                    for (const sp of readyVideoShots) {
                        args.push('-i', sp);
                    }
                    if (audioPath) {
                        args.push('-i', audioPath);
                    } else {
                        args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
                    }

                    let vFilterParts = [];
                    for (let sIdx = 0; sIdx < readyVideoShots.length; sIdx++) {
                        vFilterParts.push(`[${sIdx}:v]scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[sv${sIdx}]`);
                    }
                    let concatInputs = readyVideoShots.map((_, sIdx) => `[sv${sIdx}]`).join('');
                    vFilterParts.push(`${concatInputs}concat=n=${readyVideoShots.length}:v=1:a=0,setpts=${speedFactor.toFixed(4)}*PTS,tpad=stop_mode=clone:stop=-1[v_base]`);

                    let vFilter = vFilterParts.join(';');
                    if (drawtextFilters.length > 0) {
                        vFilter += `;[v_base]${drawtextFilters.join(',')}[v]`;
                    } else {
                        vFilter = vFilter.replace('[v_base]', '[v]');
                    }

                    args.push(
                        '-filter_complex', vFilter,
                        '-map', '[v]',
                        '-map', `${readyVideoShots.length}:a`,
                        '-r', '30',
                        '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '22',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                        '-t', String(duration),
                        '-y', outputPath
                    );
                } else if (!scene.isAnimated && readyImageShots.length > 1) {
                    // NEW: Assemble multiple static images into a single dynamic scene with continuous Ken Burns
                    const shotDur = duration / readyImageShots.length;
                    const totalFrames = Math.max(1, Math.ceil(shotDur * 30));
                    console.log(`[DocuCraft FFmpeg] Scene ${scene.id} assembling ${readyImageShots.length} static images (${shotDur.toFixed(2)}s each)`);

                    for (const imgP of readyImageShots) {
                        args.push('-loop', '1', '-t', String(shotDur), '-i', imgP);
                    }
                    if (audioPath) {
                        args.push('-i', audioPath);
                    } else {
                        args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
                    }

                    let vFilterParts = [];
                    for (let sIdx = 0; sIdx < readyImageShots.length; sIdx++) {
                        const kbMode = (overallIdx + sIdx) % 5;
                        let zoomPanExpr = '';
                        switch (kbMode) {
                            case 0: zoomPanExpr = `zoompan=z='1.0+0.12*(on/${totalFrames})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`; break;
                            case 1: zoomPanExpr = `zoompan=z='1.12':d=${totalFrames}:x='(on/${totalFrames})*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`; break;
                            case 2: zoomPanExpr = `zoompan=z='1.12-0.12*(on/${totalFrames})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`; break;
                            case 3: zoomPanExpr = `zoompan=z='1.12':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='(1-(on/${totalFrames}))*(ih-ih/zoom)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`; break;
                            case 4: default: zoomPanExpr = `zoompan=z='1.04+0.08*(on/${totalFrames})':d=${totalFrames}:x='(on/${totalFrames})*(iw-iw/zoom)':y='(on/${totalFrames})*(ih-ih/zoom)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`; break;
                        }
                        vFilterParts.push(`[${sIdx}:v]scale=7680:4320:force_original_aspect_ratio=increase,crop=7680:4320,${zoomPanExpr},format=yuv420p[sv${sIdx}]`);
                    }
                    let concatInputs = readyImageShots.map((_, sIdx) => `[sv${sIdx}]`).join('');
                    vFilterParts.push(`${concatInputs}concat=n=${readyImageShots.length}:v=1:a=0[v_base]`);

                    let vFilter = vFilterParts.join(';');
                    if (drawtextFilters.length > 0) {
                        vFilter += `;[v_base]${drawtextFilters.join(',')}[v]`;
                    } else {
                        vFilter = vFilter.replace('[v_base]', '[v]');
                    }

                    args.push(
                        '-filter_complex', vFilter,
                        '-map', '[v]',
                        '-map', `${readyImageShots.length}:a`,
                        '-r', '30',
                        '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '22',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                        '-t', String(duration),
                        '-y', outputPath
                    );
                } else if (videoPath) {
                    const videoDur = getMediaDuration(videoPath);
                    console.log(`[DocuCraft FFmpeg] Scene ${scene.id} video: ${videoDur.toFixed(2)}s, audio: ${duration.toFixed(2)}s, fitMode=${fitMode}`);

                    if (fitMode === 'loop') {
                        // Continuous Loop
                        args.push('-stream_loop', '-1', '-i', videoPath);
                        if (audioPath) args.push('-i', audioPath);
                        else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
                        let vFilter = '[0:v]scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v_base]';
                        if (drawtextFilters.length > 0) vFilter += `;[v_base]${drawtextFilters.join(',')}[v]`;
                        else vFilter = vFilter.replace('[v_base]', '[v]');
                        args.push(
                            '-filter_complex', vFilter,
                            '-map', '[v]', '-map', '1:a',
                            '-r', '30',
                            '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '22',
                            '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                            '-t', String(duration), '-y', outputPath
                        );
                    } else {
                        // Smart Auto-Retiming (Drift, Slowmo, Freeze -> upgraded to Dynamic Optical Flow)
                        let speedFactor = duration / (videoDur || 4);
                        if (speedFactor > 2.0) speedFactor = 2.0; // Max slow-down
                        if (speedFactor < 0.25) speedFactor = 0.25; // Max speed-up
                        
                        console.log(`[DocuCraft FFmpeg] Scene ${scene.id} Auto-Retiming video: ${videoDur.toFixed(2)}s -> ${duration.toFixed(2)}s (factor: ${speedFactor.toFixed(4)})`);

                        args.push('-i', videoPath);
                        if (audioPath) args.push('-i', audioPath);
                        else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
                        
                        let vFilter = `[0:v]scale=1920:1080:flags=lanczos:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p,setpts=${speedFactor.toFixed(4)}*PTS,tpad=stop_mode=clone:stop=-1[v_base]`;
                        if (drawtextFilters.length > 0) vFilter += `;[v_base]${drawtextFilters.join(',')}[v]`;
                        else vFilter = vFilter.replace('[v_base]', '[v]');

                        args.push(
                            '-filter_complex', vFilter,
                            '-map', '[v]', '-map', '1:a',
                            '-r', '30',
                            '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '22',
                            '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                            '-t', String(duration), '-y', outputPath
                        );
                    }
                } else if (imagePath) {
                    // Static image: Jitter-free 8K Supersampled Ken Burns
                    const totalFrames = Math.max(1, Math.ceil(duration * 30));
                    const kbMode = overallIdx % 5;
                    let zoomPanExpr = '';

                    switch (kbMode) {
                        case 0:
                            // Slow Push-in (Center zoom 1.0 -> 1.12 evenly across full duration)
                            zoomPanExpr = `zoompan=z='1.0+0.12*(on/${totalFrames})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`;
                            break;
                        case 1:
                            // Slow Horizontal Sweep (Left to right pan)
                            zoomPanExpr = `zoompan=z='1.12':d=${totalFrames}:x='(on/${totalFrames})*(iw-iw/zoom)':y='ih/2-(ih/zoom/2)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`;
                            break;
                        case 2:
                            // Slow Pull-back (Smooth zoom-out 1.12 -> 1.00)
                            zoomPanExpr = `zoompan=z='1.12-0.12*(on/${totalFrames})':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`;
                            break;
                        case 3:
                            // Slow Vertical Tilt (Bottom to top pan)
                            zoomPanExpr = `zoompan=z='1.12':d=${totalFrames}:x='iw/2-(iw/zoom/2)':y='(1-(on/${totalFrames}))*(ih-ih/zoom)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`;
                            break;
                        case 4:
                        default:
                            // Slow Diagonal drift (Push-in 1.04 -> 1.12)
                            zoomPanExpr = `zoompan=z='1.04+0.08*(on/${totalFrames})':d=${totalFrames}:x='(on/${totalFrames})*(iw-iw/zoom)':y='(on/${totalFrames})*(ih-ih/zoom)':s=7680x4320:fps=30,scale=1920:1080:flags=lanczos`;
                            break;
                    }

                    args.push('-loop', '1', '-i', imagePath);
                    if (audioPath) args.push('-i', audioPath);
                    else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');

                    // 8K supersampling (7680x4320) completely eliminates FFmpeg subpixel integer truncation jitter
                    let vFilter = `[0:v]scale=7680:4320:force_original_aspect_ratio=increase,crop=7680:4320,${zoomPanExpr}[v_base]`;
                    if (drawtextFilters.length > 0) {
                        vFilter += `;[v_base]${drawtextFilters.join(',')},format=yuv420p[v]`;
                    } else {
                        vFilter = vFilter.replace('[v_base]', 'format=yuv420p[v]');
                    }

                    args.push(
                        '-filter_complex', vFilter,
                        '-map', '[v]',
                        '-map', '1:a',
                        '-r', '30',
                        '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '22',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                        '-t', String(duration),
                        '-y', outputPath
                    );
                } else {
                    // Fallback black card
                    args.push('-f', 'lavfi', '-i', `color=c=0x1a1a1e:s=1920x1080:r=30:d=${duration}`);
                    if (audioPath) args.push('-i', audioPath);
                    else args.push('-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo');
                    let vFilter = '[0:v]fps=30[v_base]';
                    if (drawtextFilters.length > 0) vFilter += `;[v_base]${drawtextFilters.join(',')},format=yuv420p[v]`;
                    else vFilter = vFilter.replace('[v_base]', 'format=yuv420p[v]');
                    args.push(
                        '-filter_complex', vFilter,
                        '-map', '[v]',
                        '-map', '1:a',
                        '-r', '30',
                        '-c:v', 'h264_nvenc', '-preset', 'p4',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                        '-t', String(duration),
                        '-y', outputPath
                    );
                }

                if (isLastScene) {
                    const yIndex = args.indexOf('-y');
                    if (yIndex !== -1) {
                        args.splice(yIndex, 0, '-af', `apad,afade=t=out:st=${(duration - padTime).toFixed(2)}:d=${padTime}`);
                    }
                }

                console.log(`[DocuCraft FFmpeg] Rendering scene ${scene.id} (${duration.toFixed(1)}s, mode=${fitMode}, kbIdx=${overallIdx % 5})...`);
                const ffmpegProc = spawn('ffmpeg', args);

                let stderrLog = '';
                ffmpegProc.stderr.on('data', d => {
                    stderrLog += d.toString();
                });

                ffmpegProc.on('close', code => {
                    cleanups.forEach(f => {
                        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
                    });

                    if (code === 0 && fs.existsSync(outputPath)) {
                        resolve(outputPath);
                    } else {
                        console.error(`[DocuCraft FFmpeg] Command: ffmpeg ${args.join(' ')}`);
                        console.error(`[DocuCraft FFmpeg] Scene render error for ${scene.id}:\n`, stderrLog);
                        reject(new Error(`FFmpeg failed with code ${code}`));
                    }
                });

                ffmpegProc.on('error', err => {
                    cleanups.forEach(f => {
                        try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
                    });
                    reject(err);
                });
            } catch (err) {
                cleanups.forEach(f => {
                    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch (_) {}
                });
                reject(err);
            }
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: Concatenate clips using FFmpeg concat demuxer
    // ─────────────────────────────────────────────────────────────────────────
    const concatClips = (clipPaths, outputPath) => {
        return new Promise((resolve, reject) => {
            const listFile = path.join(path.dirname(outputPath), `concat_${Date.now()}.txt`);
            const content = clipPaths.map(p => `file '${p.replace(/\\/g, '/')}'`).join('\n');
            fs.writeFileSync(listFile, content, 'utf-8');

            const ffmpegProc = spawn('ffmpeg', [
                '-f', 'concat',
                '-safe', '0',
                '-i', listFile,
                '-c:v', 'copy',
                '-c:a', 'copy',
                '-y', outputPath
            ]);

            ffmpegProc.on('close', code => {
                if (code === 0 && fs.existsSync(outputPath)) {
                    try { fs.unlinkSync(listFile); } catch (_) {}
                    resolve(outputPath);
                } else {
                    console.warn(`[DocuCraft Concat] Fast stream-copy concat failed (exit code ${code}). Falling back to unified re-encoding concat...`);
                    const fbProc = spawn('ffmpeg', [
                        '-f', 'concat',
                        '-safe', '0',
                        '-i', listFile,
                        '-r', '30',
                        '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20',
                        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                        '-y', outputPath
                    ]);
                    fbProc.on('close', fbCode => {
                        try { fs.unlinkSync(listFile); } catch (_) {}
                        if (fbCode === 0 && fs.existsSync(outputPath)) {
                            resolve(outputPath);
                        } else {
                            reject(new Error(`Concat failed with code ${fbCode}`));
                        }
                    });
                    fbProc.on('error', err => {
                        try { fs.unlinkSync(listFile); } catch (_) {}
                        reject(err);
                    });
                }
            });

            ffmpegProc.on('error', (err) => {
                try { fs.unlinkSync(listFile); } catch (_) {}
                reject(err);
            });
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: Mix ambient BGM with audio ducking
    // ─────────────────────────────────────────────────────────────────────────
    const mixAudioWithBgm = (videoPath, bgmPath, bgmVolume = 0.12, outputPath) => {
        return new Promise((resolve, reject) => {
            const vol = Math.max(0.01, Math.min(0.5, bgmVolume || 0.12));
            const videoDur = getMediaDuration(videoPath);
            const fadeOutStart = Math.max(0, videoDur - 0.5);
            
            const args = [
                '-i', videoPath,
                '-stream_loop', '-1',
                '-i', bgmPath,
                '-filter_complex',
                `[1:a]volume=${vol},aformat=sample_rates=44100:channel_layouts=stereo[bgm];[0:a]aformat=sample_rates=44100:channel_layouts=stereo[vox];[vox][bgm]amix=inputs=2:duration=first:dropout_transition=2,afade=t=out:st=${fadeOutStart.toFixed(2)}:d=0.5[aout]`,
                '-map', '0:v',
                '-map', '[aout]',
                '-c:v', 'copy',
                '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', '-ac', '2',
                '-shortest',
                '-y', outputPath
            ];

            const ffmpegProc = spawn('ffmpeg', args);
            ffmpegProc.on('close', code => {
                if (code === 0 && fs.existsSync(outputPath)) {
                    resolve(outputPath);
                } else {
                    reject(new Error(`BGM mixing failed with code ${code}`));
                }
            });
            ffmpegProc.on('error', reject);
        });
    };

    // ─────────────────────────────────────────────────────────────────────────
    // Helper: Generate comprehensive YouTube broadcast package
    // ─────────────────────────────────────────────────────────────────────────
    const generateYouTubePackage = (script, timecodesText, cumulativeDuration) => {
        const title = script.title || 'Documentary';
        const lang = (script.language || 'French').toLowerCase();
        const isFr = lang.includes('fr');
        const minutes = Math.round(cumulativeDuration / 60) || 1;

        const titleVariants = isFr ? [
            `${title} — Ce que l'histoire nous a caché`,
            `${title} | Documentaire Complet (${minutes} min)`,
            `Les Secrets de : ${title} [Enquête Complète]`,
            `${title} : Révélations & Analyse Inédite`
        ] : [
            `${title} — What History Never Told You`,
            `${title} | Full Documentary (${minutes} min)`,
            `The Secrets of: ${title} [Complete Investigation]`,
            `${title}: Uncovering The Untold Truth`
        ];

        const aiNotice = isFr
            ? "⚠️ Note de transparence : Cette production documentaire a été conçue avec l'assistance d'outils d'intelligence artificielle pour l'iconographie d'archives et la narration sonore, dans le respect des chartes d'information et des directives 2026."
            : "⚠️ Transparency Notice: This documentary was produced with the assistance of advanced generative AI tools for archival visual reconstruction and synthetic narration in compliance with content guidelines.";

        const description = isFr ?
`📺 ${title} — DOCUMENTAIRE COMPLET

${script.concept || script.title}

Dans cette grande fresque d'investigation, explorez les détails fascinants et les découvertes méconnues à travers une reconstruction visuelle d'archive inédite.

⏳ CHAPITRES ET MINUTAGE :
${timecodesText}

📚 CRÉDITS ET SOURCES :
- Recherches et synthèse documentaire
- Reconstitutions iconographiques inspirées des planches du XIXe siècle
- Sonorisation et atmosphère : Studio DocuCraft

${aiNotice}

#documentaire #histoire #science #decouverte #archive #enquete`
:
`📺 ${title} — FULL DOCUMENTARY

${script.concept || script.title}

In this investigative documentary, explore fascinating discoveries and overlooked knowledge through rich archival and visual reconstructions.

⏳ CHAPTERS & TIMESTAMPS:
${timecodesText}

📚 CREDITS & SOURCES:
- Research and historical documentation
- Iconographical reconstructions inspired by 19th-century archives
- Soundscape and ambient mastering: DocuCraft Studio

${aiNotice}

#documentary #history #science #knowledge #investigation`;

        const tags = isFr ? [
            title, 'documentaire', 'histoire', 'science', 'mystères', 'archives', 'enquete', 'permaculture', 'ingénierie', 'decouverte', 'reportage complet'
        ] : [
            title, 'documentary', 'history', 'science', 'ancient mysteries', 'archives', 'investigation', 'full documentary', 'educational'
        ];

        return {
            titleVariants,
            description,
            tags,
            chapters: timecodesText,
            durationSeconds: cumulativeDuration,
            formattedDuration: formatTimecode(cumulativeDuration),
            generatedAt: new Date().toISOString()
        };
    };

    // ─────────────────────────────────────────────────────────────────────────
    // 5. Assemble Full Documentary Video & Generate YouTube Chapters
    // ─────────────────────────────────────────────────────────────────────────
    const handleAssemble = async (event, params) => {
        const {
            projectFolder,
            script,
            bgmTrack = null,
            bgmVolume = 0.12,
            showAnnotations = true,
            showChapterTitles = true,
            defaultFitMode = 'drift'
        } = params;

        if (!script || !script.chapters) throw new Error('Script data missing');

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const rendersDir = path.join(projectDir, 'Renders');
        if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });

        // Flatten all scenes with chapter references
        const allScenes = [];
        script.chapters.forEach(chap => {
            (chap.scenes || []).forEach(sc => {
                allScenes.push({ scene: sc, chapter: chap });
            });
        });

        const total = allScenes.length;
        if (total === 0) throw new Error('No scenes found to assemble');

        console.log(`[DocuCraft] Assembling documentary: ${total} scenes across ${script.chapters.length} chapters (fitMode=${defaultFitMode}, annotations=${showAnnotations}, chapters=${showChapterTitles})`);

        sendProgress(event, {
            step: 'assemble',
            status: `Starting rendering of ${total} documentary scenes...`,
            progress: 5
        });

        const renderedClips = [];
        let cumulativeDuration = 0;
        const chapterTimecodes = [];
        let currentChapterId = null;

        for (let i = 0; i < total; i++) {
            const { scene, chapter } = allScenes[i];
            const percent = Math.round(5 + ((i + 1) / total) * 75);

            sendProgress(event, {
                step: 'assemble',
                status: `Rendering clip ${i + 1}/${total} (${scene.title || scene.id})...`,
                progress: percent,
                sceneId: scene.id
            });

            const isFirstSceneOfChapter = (chapter.scenes && chapter.scenes[0] && chapter.scenes[0].id === scene.id);

            // Mark chapter beginning
            if (chapter.id !== currentChapterId) {
                currentChapterId = chapter.id;
                const tc = formatTimecode(cumulativeDuration);
                chapterTimecodes.push(`${tc} - ${chapter.title || `Chapitre ${chapter.index}`}`);
                chapter.startTimecode = tc;
            }

            const clipPath = path.join(rendersDir, `scene_${i + 1}_${scene.id}.mp4`);
            await renderSceneClip(scene, clipPath, {
                overallIndex: i + 1,
                showAnnotations,
                showChapterTitles,
                isFirstSceneOfChapter,
                chapterTitle: chapter.title || `Chapitre ${chapter.index}`,
                defaultFitMode,
                isLastSceneOfDocumentary: (i === total - 1)
            });

            const clipDur = getMediaDuration(clipPath);
            cumulativeDuration += clipDur;
            renderedClips.push(clipPath);
        }

        // Concat all rendered scene clips
        sendProgress(event, {
            step: 'assemble',
            status: 'Concatenating all documentary scene clips...',
            progress: 85
        });

        const assembledRawPath = path.join(rendersDir, 'assembled_raw.mp4');
        await concatClips(renderedClips, assembledRawPath);

        // Mix BGM if provided
        let finalVideoPath = assembledRawPath;
        if (bgmTrack) {
            let bgmPath = bgmTrack;
            if (!path.isAbsolute(bgmPath)) {
                // Look in Music folder
                const candidate = path.join(__dirname, 'Music', bgmTrack);
                if (fs.existsSync(candidate)) bgmPath = candidate;
            }

            if (fs.existsSync(bgmPath)) {
                sendProgress(event, {
                    step: 'assemble',
                    status: 'Mixing documentary ambient background score...',
                    progress: 92
                });

                const mixedPath = path.join(projectDir, 'final_documentary.mp4');
                await mixAudioWithBgm(assembledRawPath, bgmPath, bgmVolume, mixedPath);
                finalVideoPath = mixedPath;
            }
        }

        // Format YouTube Chapters string & Full Metadata Package
        const ytChaptersText = chapterTimecodes.join('\n');
        const ytChaptersPath = path.join(projectDir, 'youtube_chapters.txt');
        fs.writeFileSync(ytChaptersPath, ytChaptersText, 'utf-8');

        const ytPackage = generateYouTubePackage(script, ytChaptersText, cumulativeDuration);
        const ytPackagePath = path.join(projectDir, 'youtube_package.json');
        fs.writeFileSync(ytPackagePath, JSON.stringify(ytPackage, null, 2), 'utf-8');

        const ytDescPath = path.join(projectDir, 'youtube_description.txt');
        fs.writeFileSync(ytDescPath, ytPackage.description, 'utf-8');

        // Update and save manifest
        script.finalVideoUrl = `media:///${finalVideoPath.replace(/\\/g, '/')}?t=${Date.now()}`;
        script.totalDurationSeconds = cumulativeDuration;
        script.youtubeChapters = ytChaptersText;
        script.youtubePackage = ytPackage;

        mergeScriptWithDisk(script, projectDir);
        syncManifestWithDiskFiles(script, projectDir);

        const manifestPath = path.join(projectDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');

        sendProgress(event, {
            step: 'assemble',
            status: `Documentary assembly complete! Total duration: ${formatTimecode(cumulativeDuration)}`,
            progress: 100
        });

        return {
            videoUrl: script.finalVideoUrl,
            youtubeChapters: ytChaptersText,
            youtubePackage: ytPackage,
            totalDuration: cumulativeDuration,
            manifest: script
        };
    };

    ipcMain.handle('docucraft:assemble', handleAssemble);
    ipcMain.handle('docucraft-assemble', handleAssemble);

    // ─────────────────────────────────────────────────────────────────────────
    // 6. Export Vertical Short (9:16) for TikTok / YouTube Shorts / Reels
    // ─────────────────────────────────────────────────────────────────────────
    const handleGenerateShort = async (event, params) => {
        const {
            projectFolder,
            script,
            sceneId
        } = params;

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;

        // Find candidate scene
        let targetScene = null;
        if (script && script.chapters) {
            for (const chap of script.chapters) {
                for (const sc of (chap.scenes || [])) {
                    if (sceneId && sc.id === sceneId) {
                        targetScene = sc;
                        break;
                    }
                    if (!sceneId && sc.isAnimated && sc.videoUrl) {
                        targetScene = sc;
                        break;
                    }
                }
                if (targetScene) break;
            }
        }

        if (!targetScene) {
            // Pick first scene with image or video
            for (const chap of (script?.chapters || [])) {
                if (chap.scenes && chap.scenes.length > 0) {
                    targetScene = chap.scenes[0];
                    break;
                }
            }
        }

        if (!targetScene) throw new Error('No scene available to render vertical short');

        sendProgress(event, {
            step: 'short',
            status: `Formatting 9:16 vertical short for scene "${targetScene.title || targetScene.id}"...`,
            progress: 30
        });

        const rendersDir = path.join(projectDir, 'Renders');
        if (!fs.existsSync(rendersDir)) fs.mkdirSync(rendersDir, { recursive: true });

        // First render standard clip if not yet rendered
        const sceneClipPath = path.join(rendersDir, `scene_${targetScene.id}.mp4`);
        if (!fs.existsSync(sceneClipPath)) {
            await renderSceneClip(targetScene, sceneClipPath);
        }

        // Convert to 1080x1920 (9:16) with vertical crop & slight zoom
        const shortOutputPath = path.join(projectDir, `short_${targetScene.id}_9x16.mp4`);

        await new Promise((resolve, reject) => {
            const ffmpegProc = spawn('ffmpeg', [
                '-i', sceneClipPath,
                '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(in_w-1080)/2:(in_h-1920)/2,setsar=1',
                '-c:v', 'h264_nvenc', '-preset', 'p4', '-cq', '20',
                '-c:a', 'copy',
                '-y', shortOutputPath
            ]);

            ffmpegProc.on('close', code => {
                if (code === 0 && fs.existsSync(shortOutputPath)) {
                    resolve(shortOutputPath);
                } else {
                    reject(new Error(`Vertical short render failed with code ${code}`));
                }
            });

            ffmpegProc.on('error', reject);
        });

        sendProgress(event, {
            step: 'short',
            status: 'Vertical short ready for YouTube Shorts / Reels!',
            progress: 100
        });

        return {
            shortUrl: `media:///${shortOutputPath.replace(/\\/g, '/')}?t=${Date.now()}`,
            sceneId: targetScene.id,
            title: targetScene.title
        };
    };

    ipcMain.handle('docucraft:generate-short', handleGenerateShort);
    ipcMain.handle('docucraft-generate-short', handleGenerateShort);

    // ─────────────────────────────────────────────────────────────────────────
    // 7. Project Management & Background Music Handlers
    // ─────────────────────────────────────────────────────────────────────────
    const handleSaveScript = async (event, { projectFolder, script }) => {
        if (!projectFolder || !script) throw new Error('Missing projectFolder or script');
        const projectDir = path.join(DOCUCRAFT_DIRS.projects, projectFolder);
        if (!fs.existsSync(projectDir)) fs.mkdirSync(projectDir, { recursive: true });

        syncManifestWithDiskFiles(script, projectDir);
        const manifestPath = path.join(projectDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');
        return { success: true, path: manifestPath };
    };

    ipcMain.handle('docucraft:save-script', handleSaveScript);
    ipcMain.handle('docucraft-save-script', handleSaveScript);

    const handleLoadProjects = async () => {
        try {
            if (!fs.existsSync(DOCUCRAFT_DIRS.projects)) return [];
            const entries = fs.readdirSync(DOCUCRAFT_DIRS.projects, { withFileTypes: true });
            const projects = [];

            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const folderName = entry.name;
                const projectDir = path.join(DOCUCRAFT_DIRS.projects, folderName);
                const mPath = path.join(projectDir, 'manifest.json');
                if (fs.existsSync(mPath)) {
                    try {
                        let data = JSON.parse(fs.readFileSync(mPath, 'utf-8'));
                        data = syncManifestWithDiskFiles(data, projectDir);
                        try {
                            fs.writeFileSync(mPath, JSON.stringify(data, null, 2), 'utf-8');
                        } catch (_) {}

                        projects.push({
                            folderName,
                            title: data.title || folderName,
                            language: data.language || 'English',
                            chaptersCount: data.chapters?.length || 0,
                            finalVideoUrl: data.finalVideoUrl || null,
                            createdAt: data.createdAt || fs.statSync(mPath).mtimeMs,
                            manifest: data
                        });
                    } catch (_) {}
                }
            }

            return projects.sort((a, b) => b.createdAt - a.createdAt);
        } catch (e) {
            console.error('[DocuCraft] Failed to load projects:', e);
            return [];
        }
    };

    ipcMain.handle('docucraft:load-projects', handleLoadProjects);
    ipcMain.handle('docucraft-load-projects', handleLoadProjects);

    const handleGetBgmTracks = async () => {
        try {
            const musicDir = path.join(__dirname, 'Music');
            if (!fs.existsSync(musicDir)) return [];
            const files = fs.readdirSync(musicDir).filter(f => f.toLowerCase().endsWith('.mp3') || f.toLowerCase().endsWith('.wav'));
            return files.map(f => ({
                id: f,
                name: f.replace(/\.(mp3|wav)$/i, '').replace(/[-_]/g, ' '),
                filename: f,
                path: path.join(musicDir, f)
            }));
        } catch (e) {
            console.error('[DocuCraft] Failed to list BGM tracks:', e);
            return [];
        }
    };

    ipcMain.handle('docucraft:get-bgm-tracks', handleGetBgmTracks);
    ipcMain.handle('docucraft-get-bgm-tracks', handleGetBgmTracks);

    // ─────────────────────────────────────────────────────────────────────────
    // 8. Custom Media Upload & Scene Management (Add / Delete)
    // ─────────────────────────────────────────────────────────────────────────
    const handleUploadCustomMedia = async (event, { projectFolder, sceneId }) => {
        try {
            const projectDir = projectFolder
                ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
                : DOCUCRAFT_DIRS.base;

            const res = await dialog.showOpenDialog({
                title: 'Select Custom Archival Image or Video',
                properties: ['openFile'],
                filters: [
                    { name: 'Supported Media', extensions: ['jpg', 'jpeg', 'png', 'webp', 'mp4', 'mov', 'webm'] },
                    { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] },
                    { name: 'Videos', extensions: ['mp4', 'mov', 'webm'] }
                ]
            });

            if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
                return { canceled: true };
            }

            const sourcePath = res.filePaths[0];
            const ext = path.extname(sourcePath).toLowerCase();
            const isVideo = ['.mp4', '.mov', '.webm'].includes(ext);
            const targetFolder = isVideo ? path.join(projectDir, 'Videos') : path.join(projectDir, 'Images');
            if (!fs.existsSync(targetFolder)) fs.mkdirSync(targetFolder, { recursive: true });

            const targetFilename = `custom_${sceneId || 'media'}_${Date.now()}${ext}`;
            const targetPath = path.join(targetFolder, targetFilename);
            fs.copyFileSync(sourcePath, targetPath);

            const mediaUrl = `media:///${targetPath.replace(/\\/g, '/')}?t=${Date.now()}`;
            return {
                canceled: false,
                mediaType: isVideo ? 'video' : 'image',
                url: mediaUrl,
                localPath: targetPath,
                filename: targetFilename
            };
        } catch (err) {
            console.error('[DocuCraft] Failed to upload custom media:', err);
            throw err;
        }
    };

    ipcMain.handle('docucraft:upload-custom-media', handleUploadCustomMedia);
    ipcMain.handle('docucraft-upload-custom-media', handleUploadCustomMedia);

    const handleAddScene = async (event, { projectFolder, script, chapterId, insertAfterSceneId }) => {
        if (!script || !script.chapters) throw new Error('Missing script');
        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;

        const chapter = script.chapters.find(c => c.id === chapterId);
        if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

        if (!chapter.scenes) chapter.scenes = [];

        const newId = `sc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const newScene = {
            id: newId,
            chapterIndex: chapter.index || 1,
            sceneIndex: chapter.scenes.length + 1,
            title: `Nouvelle Scène`,
            voiceoverText: '',
            imagePrompt: '',
            videoAnimationPrompt: '',
            annotation: '',
            isAnimated: false,
            videoFitMode: 'drift',
            imageUrl: null,
            videoUrl: null,
            audioUrl: null,
            audioDuration: 0
        };

        if (insertAfterSceneId) {
            const idx = chapter.scenes.findIndex(s => s.id === insertAfterSceneId);
            if (idx !== -1) {
                chapter.scenes.splice(idx + 1, 0, newScene);
            } else {
                chapter.scenes.push(newScene);
            }
        } else {
            chapter.scenes.push(newScene);
        }

        chapter.scenes.forEach((sc, i) => {
            sc.sceneIndex = i + 1;
            sc.index = i + 1;
        });

        const manifestPath = path.join(projectDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');

        return { success: true, script, newScene };
    };

    ipcMain.handle('docucraft:add-scene', handleAddScene);
    ipcMain.handle('docucraft-add-scene', handleAddScene);

    const handleDeleteScene = async (event, { projectFolder, script, chapterId, sceneId }) => {
        if (!script || !script.chapters) throw new Error('Missing script');
        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;

        const chapter = script.chapters.find(c => c.id === chapterId);
        if (!chapter) throw new Error(`Chapter ${chapterId} not found`);

        chapter.scenes = (chapter.scenes || []).filter(s => s.id !== sceneId);
        chapter.scenes.forEach((sc, i) => {
            sc.sceneIndex = i + 1;
            sc.index = i + 1;
        });

        const manifestPath = path.join(projectDir, 'manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(script, null, 2), 'utf-8');

        return { success: true, script };
    };

    ipcMain.handle('docucraft:delete-scene', handleDeleteScene);
    ipcMain.handle('docucraft-delete-scene', handleDeleteScene);

    // ─────────────────────────────────────────────────────────────────────────
    // Free Archival & Stock B-Roll Retrieval System (Wikimedia, Pexels, Archive.org)
    // ─────────────────────────────────────────────────────────────────────────

    const handleSearchStock = async (event, { query, source = 'all', mediaType = 'all', page = 1, perPage = 18, pexelsApiKey } = {}) => {
        if (!query || typeof query !== 'string' || !query.trim()) {
            return { results: [], totalCount: 0, pexelsConfigured: !!(process.env.PEXELS_API_KEY || pexelsApiKey) };
        }

        const effectivePexelsKey = pexelsApiKey || process.env.PEXELS_API_KEY;
        const pexelsConfigured = !!effectivePexelsKey;

        const promises = [];
        if (source === 'all' || source === 'wikimedia') {
            promises.push(searchWikimediaCommons(query, { mediaType, page, perPage }));
        }
        if (source === 'all' || source === 'archive_org') {
            if (mediaType === 'video' || mediaType === 'all') {
                promises.push(searchArchiveOrg(query, { page, perPage: Math.min(perPage, 8) }));
            }
        }
        if (source === 'all' || source === 'pexels') {
            if (pexelsConfigured) {
                promises.push(searchPexels(query, { mediaType, page, perPage, apiKey: effectivePexelsKey }));
            }
        }

        const settled = await Promise.allSettled(promises);
        let allResults = [];
        for (const s of settled) {
            if (s.status === 'fulfilled' && Array.isArray(s.value)) {
                allResults.push(...s.value);
            }
        }

        const seen = new Set();
        const deduped = [];
        for (const item of allResults) {
            const key = item.downloadUrl || item.id;
            if (!seen.has(key)) {
                seen.add(key);
                deduped.push(item);
            }
        }

        if (mediaType === 'video') {
            deduped.sort((a, b) => (a.mediaType === 'video' ? -1 : 1));
        }

        return {
            results: deduped,
            totalCount: deduped.length,
            pexelsConfigured
        };
    };

    ipcMain.handle('docucraft:search-stock', handleSearchStock);
    ipcMain.handle('docucraft-search-stock', handleSearchStock);

    const handleSelectStockMedia = async (event, { projectFolder, chapterId, sceneId, item, script }) => {
        if (!item || !item.downloadUrl) throw new Error('Invalid media item: missing downloadUrl');
        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;

        const notify = (step, progress) => {
            try {
                if (event && event.sender) {
                    event.sender.send('docucraft-progress', { step, status: `${step}...`, progress, sceneId });
                }
            } catch (_) {}
        };

        const { finalPath, finalUrl, finalDuration, isVideo } = await downloadAndNormalizeStockMedia({
            downloadUrl: item.downloadUrl,
            mediaType: item.mediaType,
            sceneId,
            projectDir,
            onProgress: notify
        });

        notify('updating_manifest', 90);

        // Update script and persist to manifest
        let updatedScene = null;
        const currentScript = script || (fs.existsSync(path.join(projectDir, 'manifest.json')) ? JSON.parse(fs.readFileSync(path.join(projectDir, 'manifest.json'), 'utf-8')) : null);

        if (currentScript && currentScript.chapters) {
            for (const chap of currentScript.chapters) {
                for (const sc of (chap.scenes || [])) {
                    if (sc.id === sceneId) {
                        if (isVideo) {
                            sc.videoUrl = finalUrl;
                            sc.isAnimated = true;
                            sc.videoFitMode = 'drift';
                            sc.videoDuration = finalDuration;
                        } else {
                            sc.imageUrl = finalUrl;
                            sc.videoUrl = null;
                            sc.isAnimated = false;
                        }
                        sc.brollMeta = {
                            source: item.source,
                            sourceName: item.sourceName,
                            title: item.title,
                            license: item.license,
                            creator: item.creator,
                            sourcePageUrl: item.sourcePageUrl,
                            selectedAt: new Date().toISOString()
                        };
                        updatedScene = sc;
                        break;
                    }
                }
                if (updatedScene) break;
            }

            const manifestPath = path.join(projectDir, 'manifest.json');
            syncManifestWithDiskFiles(currentScript, projectDir);
            fs.writeFileSync(manifestPath, JSON.stringify(currentScript, null, 2), 'utf-8');
        }

        notify('completed', 100);

        return {
            success: true,
            scene: updatedScene,
            script: currentScript,
            mediaType: item.mediaType,
            mediaUrl: finalUrl,
            localPath: finalPath
        };
    };

    ipcMain.handle('docucraft:select-stock-media', handleSelectStockMedia);
    ipcMain.handle('docucraft-select-stock-media', handleSelectStockMedia);

    // ─────────────────────────────────────────────────────────────────────────
    // YouTube Thumbnail / Cover Generation (4 variants)
    // ─────────────────────────────────────────────────────────────────────────

    const addYoutubeTextToImage = (inputPath, outputPath, text) => {
        return new Promise((resolve, reject) => {
            if (!text || text.trim() === '') {
                fs.copyFileSync(inputPath, outputPath);
                return resolve();
            }
            const tempTextPath = outputPath + '.txt';
            // Clean text and convert to uppercase for impact
            const cleanText = String(text).trim().toUpperCase();
            fs.writeFileSync(tempTextPath, cleanText, 'utf-8');

            const escapedTextFile = tempTextPath.replace(/\\/g, '/').replace(/^([a-zA-Z]):/, '$1\\:');

            // Highly clickable YouTube styling: Massive Impact font, Yellow/White text, thick black border, black drop shadow
            const drawtext = `drawtext=fontfile='C\\:/Windows/Fonts/impact.ttf':textfile='${escapedTextFile}':fontcolor=yellow:fontsize=180:x='(w-tw)/2':y='h-th-80':bordercolor=black:borderw=12:shadowcolor=black@0.9:shadowx=8:shadowy=8`;

            const proc = spawn('ffmpeg', [
                '-y',
                '-i', inputPath,
                '-vf', drawtext,
                '-frames:v', '1',
                '-q:v', '2',
                outputPath
            ]);

            proc.on('close', code => {
                try { if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath); } catch (_) {}
                if (code === 0 && fs.existsSync(outputPath)) resolve();
                else reject(new Error('ffmpeg text overlay failed'));
            });
            proc.on('error', err => {
                try { if (fs.existsSync(tempTextPath)) fs.unlinkSync(tempTextPath); } catch (_) {}
                reject(err);
            });
        });
    };

    const handleGenerateThumbnails = async (event, params) => {
        const {
            projectFolder,
            script,
            imageModel = 'nano_banana_2',
        } = params;

        if (!script) throw new Error('Script data missing');

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const thumbsDir = path.join(projectDir, 'Thumbnails');
        if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

        const title = script.title || 'Documentary';
        const lang = (script.language || 'French').toLowerCase();
        const isFr = lang.includes('fr');
        const synopsis = script.synopsis || script.title;

        sendProgress(event, {
            step: 'thumbnails',
            status: 'Generating YouTube thumbnail concepts...',
            progress: 10
        });

        const thumbSystemPrompt = `You are a YouTube thumbnail designer expert. Generate 4 completely different eye-catching YouTube video thumbnail concepts for a documentary.

Each thumbnail MUST be visually striking and designed to maximize click-through rate (CTR). Include bold, dramatic compositions.

CRITICAL: The image generator must NOT generate any text. The 'prompt' field should describe ONLY the visual scene (e.g. "dark moody shot, extreme close-up of an ancient artifact, cinematic lighting, negative space at the bottom for text").
The 'overlayText' field will be used by a separate graphics engine to draw massive bold 3D text. Make 'overlayText' a highly clickable, intriguing phrase (2-4 words maximum) in ${isFr ? 'French' : lang}. Use ALL CAPS.

Output STRICT JSON only — an array of 4 objects:
[
  {
    "style": "dramatic_reveal",
    "styleTitle": "Dramatic Reveal",
    "overlayText": "SHORT CATCHY TEXT",
    "prompt": "detailed image generation prompt in English, 16:9 aspect, bold cinematic composition, no text..."
  }
]

Styles to cover:
1. dramatic_reveal — Dark moody shot with dramatic lighting, mysterious atmosphere, negative space
2. curiosity_hook — Extreme close-up or unusual perspective that makes viewers curious
3. epic_scale — Wide panoramic or grand establishing shot showing scale and wonder
4. vintage_archive — Aged document, antique map, or historical artifact closeup`;

        const thumbUserPrompt = `Create 4 YouTube thumbnail concepts for this documentary:
Title: "${title}"
Synopsis: "${synopsis}"
Art style used in video: ${script.stylePreset || 'historical archival'}
Language for overlay text: ${isFr ? 'French' : lang}

Remember: output strict JSON array only.`;

        let thumbPrompts;
        try {
            const raw = await ai.chat([
                { role: 'system', content: thumbSystemPrompt },
                { role: 'user', content: thumbUserPrompt }
            ], true);
            thumbPrompts = cleanAndParseJSON(raw);
            if (!Array.isArray(thumbPrompts)) {
                thumbPrompts = thumbPrompts.thumbnails || thumbPrompts.concepts || Object.values(thumbPrompts)[0];
            }
        } catch (err) {
            console.error('[DocuCraft Thumbnails] LLM prompt generation failed:', err.message);
            const overlayTexts = isFr
                ? ['SECRET RÉVÉLÉ', 'INCROYABLE !', 'DÉCOUVERTE INÉDITE', 'MYSTÈRE RÉSOLU']
                : ['SECRET REVEALED', 'UNBELIEVABLE!', 'UNTOLD DISCOVERY', 'MYSTERY SOLVED'];
            thumbPrompts = [
                { style: 'dramatic_reveal', styleTitle: 'Dramatic Reveal', overlayText: overlayTexts[0], prompt: `Cinematic dramatic documentary thumbnail about "${title}", dark moody lighting, mysterious atmosphere, ancient artifacts, 16:9, ultra detailed, bold composition, YouTube thumbnail style` },
                { style: 'curiosity_hook', styleTitle: 'Curiosity Hook', overlayText: overlayTexts[1], prompt: `Extreme close-up cinematic shot for documentary "${title}", unusual dramatic perspective, warm golden lighting, intricate details, 16:9 YouTube thumbnail, high contrast` },
                { style: 'epic_scale', styleTitle: 'Epic Scale', overlayText: overlayTexts[2], prompt: `Epic wide panoramic shot for documentary "${title}", grand scale establishing view, dramatic sky, cinematic color grading, 16:9 YouTube thumbnail, awe-inspiring` },
                { style: 'vintage_archive', styleTitle: 'Vintage Archive', overlayText: overlayTexts[3], prompt: `Aged antique document closeup for documentary "${title}", historical artifact, candlelight, scholarly atmosphere, vintage patina, 16:9 YouTube thumbnail` },
            ];
        }

        sendProgress(event, {
            step: 'thumbnails',
            status: 'Rendering thumbnail images...',
            progress: 30
        });

        const cleanModel = (imageModel || 'nano_banana_2').replace(/^glabs-/, '');
        const results = [];
        let completed = 0;
        const tasks = Array.from({ length: Math.min(thumbPrompts.length, 4) }).map(async (_, i) => {
            const item = thumbPrompts[i];
            let resultItem = {
                id: i,
                style: item.style || `style_${i + 1}`,
                styleTitle: item.styleTitle || `Variant ${i + 1}`,
                overlayText: item.overlayText || '',
                prompt: item.prompt,
                imageUrl: '',
                fileName: `thumb_${i + 1}.jpg`
            };

            try {
                const savedPaths = await ai.generateImage({
                    prompt: item.prompt,
                    model: cleanModel,
                    aspectRatio: '16:9',
                    count: 1,
                    sectionDir: projectDir,
                    subFolder: 'Thumbnails',
                    sceneIndex: 200 + i,
                });

                if (savedPaths && savedPaths.length > 0 && fs.existsSync(savedPaths[0])) {
                    const rawFile = savedPaths[0];
                    const targetFile = path.join(thumbsDir, `thumb_${i + 1}.jpg`);

                    if (resultItem.overlayText) {
                        await addYoutubeTextToImage(rawFile, targetFile, resultItem.overlayText);
                    } else {
                        fs.copyFileSync(rawFile, targetFile);
                    }
                    resultItem.imageUrl = `media:///${targetFile.replace(/\\/g, '/')}?t=${Date.now()}`;
                } else {
                    resultItem.error = 'Image generation returned empty';
                }
            } catch (err) {
                console.error(`[DocuCraft Thumbnails] Image gen failed for thumb ${i + 1}:`, err.message);
                resultItem.error = err.message;
            } finally {
                completed++;
                sendProgress(event, {
                    step: 'thumbnails',
                    status: `Generating thumbnails (${completed}/4)...`,
                    progress: 30 + Math.round((completed / 4) * 60)
                });
            }
            return resultItem;
        });

        const generatedResults = await Promise.all(tasks);
        results.push(...generatedResults);

        // Sort by ID to maintain correct order since Promise.all resolves concurrently
        results.sort((a, b) => a.id - b.id);

        sendProgress(event, {
            step: 'thumbnails',
            status: `Thumbnail generation complete: ${results.filter(r => r.imageUrl).length}/4 ready`,
            progress: 100
        });

        return results;
    };

    ipcMain.handle('docucraft:generate-thumbnails', handleGenerateThumbnails);
    ipcMain.handle('docucraft-generate-thumbnails', handleGenerateThumbnails);

    // Regenerate single thumbnail
    const handleRegenerateThumbnail = async (event, params) => {
        const { projectFolder, thumbIndex, prompt, overlayText, imageModel = 'nano_banana_2' } = params;

        const projectDir = projectFolder
            ? path.join(DOCUCRAFT_DIRS.projects, projectFolder)
            : DOCUCRAFT_DIRS.base;
        const thumbsDir = path.join(projectDir, 'Thumbnails');
        if (!fs.existsSync(thumbsDir)) fs.mkdirSync(thumbsDir, { recursive: true });

        const cleanModel = (imageModel || 'nano_banana_2').replace(/^glabs-/, '');
        const savedPaths = await ai.generateImage({
            prompt,
            model: cleanModel,
            aspectRatio: '16:9',
            count: 1,
            sectionDir: projectDir,
            subFolder: 'Thumbnails',
            sceneIndex: 200 + thumbIndex,
        });

        if (!savedPaths || savedPaths.length === 0) throw new Error('Image generation failed');

        const rawFile = savedPaths[0];
        const targetFile = path.join(thumbsDir, `thumb_${thumbIndex + 1}.jpg`);

        if (overlayText) {
            await addYoutubeTextToImage(rawFile, targetFile, overlayText);
        } else {
            fs.copyFileSync(rawFile, targetFile);
        }

        const imgUrl = `media:///${targetFile.replace(/\\/g, '/')}?t=${Date.now()}`;

        return { thumbIndex, imageUrl: imgUrl, fileName: `thumb_${thumbIndex + 1}.jpg` };
    };

    ipcMain.handle('docucraft:regenerate-thumbnail', handleRegenerateThumbnail);
    ipcMain.handle('docucraft-regenerate-thumbnail', handleRegenerateThumbnail);
}

module.exports = {
    registerDocuCraftHandlers,
    searchWikimediaCommons,
    searchArchiveOrg,
    searchPexels,
    downloadAndNormalizeStockMedia
};


