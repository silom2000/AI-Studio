const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { request } = require('undici');
const axios = require('axios'); // For VoiceAPI

// Import G-Labs handlers for proxying Image and Video generation
const { generateImageViaGLabs, generateVideoViaGLabs } = require('./glabs-handlers.cjs');

class AntigravityClient {
    constructor() {
        console.log('[AiClient] Initialized Antigravity Unified Client');
    }

    // =========================================================================
    // 1. CHAT / TEXT GENERATION
    // =========================================================================
    _extractChatContent(data) {
        const content = data?.choices?.[0]?.message?.content;

        if (typeof content === 'string') {
            return content.trim();
        }

        // Some OpenAI-compatible providers return an array of text blocks.
        if (Array.isArray(content)) {
            return content
                .map(part => typeof part === 'string' ? part : part?.text)
                .filter(part => typeof part === 'string' && part.trim())
                .join('\n')
                .trim();
        }

        return '';
    }

    async chat(messages, jsonMode = false, forcedProvider = null) {
        const providers = [];

        // 1. Groq (Fast and High Quality)
        if (process.env.GROQ_API_KEY) {
            providers.push({
                id: 'groq',
                url: 'https://api.groq.com/openai/v1/chat/completions',
                key: process.env.GROQ_API_KEY,
                model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'
            });
        }

        // 2. Qwen
        if (process.env.QWEN_API_KEY) {
            providers.push({
                id: 'qwen',
                url: process.env.QWEN_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
                key: process.env.QWEN_API_KEY,
                model: process.env.QWEN_MODEL || 'qwen/qwen3.5-397b-a17b'
            });
        }

        // 3. Kimi
        if (process.env.KIMI_API_KEY) {
            providers.push({
                id: 'kimi',
                url: process.env.KIMI_API_URL || 'https://integrate.api.nvidia.com/v1/chat/completions',
                key: process.env.KIMI_API_KEY,
                model: process.env.KIMI_MODEL || 'moonshotai/kimi-k2.5'
            });
        }

        // 4. Mimo
        if (process.env.MIMO_API_KEY) {
            providers.push({
                id: 'mimo',
                url: process.env.MIMO_API_URL || 'https://api.xiaomimimo.com/v1/chat/completions',
                key: process.env.MIMO_API_KEY,
                model: process.env.MIMO_MODEL || 'mimo-v2.5-pro',
                isMimo: true
            });
        }

        // 5. Custom Local Proxy
        if (process.env.CUSTOM_AI_URL) {
            const customModels = (process.env.CUSTOM_AI_MODEL || 'claude-sonnet-4-6')
                .split(',')
                .map(m => m.trim())
                .filter(Boolean);
            for (const m of customModels) {
                providers.push({
                    id: 'custom',
                    url: process.env.CUSTOM_AI_URL,
                    key: process.env.CUSTOM_AI_API_KEY,
                    model: m
                });
            }
        }

        // 6. OMNIROUTE (Claude via local router)
        if (process.env.OMNIROUTE_API_URL) {
            providers.push({
                id: 'omniroute',
                url: process.env.OMNIROUTE_API_URL,
                key: process.env.OMNIROUTE_API_KEY,
                model: process.env.OMNIROUTE_MODEL || 'antigravity/claude-sonnet-4-6'
            });
        }

        // 7. Pollinations Fallback
        providers.push({
            id: 'pollinations',
            url: process.env.POLLINATIONS_API_URL || 'https://gen.pollinations.ai/v1/chat/completions',
            key: process.env.POLLINATIONS_API_KEY,
            model: process.env.POLLINATIONS_MODEL || 'openai-large'
        });

        // Ensure "json" is present in messages if jsonMode is requested (prevent Azure/Pollinations/Groq 400 error)
        let effectiveMessages = messages;
        if (jsonMode && Array.isArray(messages)) {
            const hasJsonWord = messages.some(m => {
                if (!m || !m.content) return false;
                if (typeof m.content === 'string') return /json/i.test(m.content);
                if (Array.isArray(m.content)) return m.content.some(c => c && typeof c.text === 'string' && /json/i.test(c.text));
                return false;
            });
            if (!hasJsonWord) {
                effectiveMessages = [
                    { role: 'system', content: 'Respond with a valid JSON object only.' },
                    ...messages
                ];
            }
        }

        const defaultProvider = forcedProvider || process.env.DEFAULT_AI_PROVIDER || 'custom';
        providers.sort((a, b) => {
            if (a.id === defaultProvider && b.id !== defaultProvider) return -1;
            if (b.id === defaultProvider && a.id !== defaultProvider) return 1;
            return 0;
        });

        let lastError = null;
        let proxyDisabled = false;

        for (const p of providers) {
            if (p.id === 'custom' && proxyDisabled) continue;

            for (let attempt = 1; attempt <= 2; attempt++) {
                try {
                    console.log(`[AiClient:Chat] Trying provider=${p.id} model=${p.model} at ${p.url} (attempt ${attempt})`);
                    const reqBody = { 
                        model: p.model, 
                        messages: effectiveMessages,
                        max_tokens: 4096 // Needed for large image inputs
                    };
                    // Attempt 1 sends response_format if jsonMode is true; if provider rejects it, attempt 2 runs without response_format
                    if (jsonMode && attempt === 1) reqBody.response_format = { type: 'json_object' };

                    const headers = { 'Content-Type': 'application/json' };
                    if (p.key) {
                        if (p.isMimo) {
                            headers['api-key'] = p.key;
                        } else {
                            headers['Authorization'] = `Bearer ${p.key}`;
                        }
                    }

                    const res = await fetch(p.url, {
                        method: 'POST',
                        headers,
                        body: JSON.stringify(reqBody)
                    });

                    const text = await res.text();
                    if (res.ok) {
                        const data = JSON.parse(text);
                        const content = this._extractChatContent(data);

                        if (content) {
                            return content;
                        }

                        const choice = data?.choices?.[0];
                        const finishReason = choice?.finish_reason || 'unknown';
                        const refusal = choice?.message?.refusal || 'none';
                        lastError = new Error(
                            `${p.id}/${p.model} returned an empty response ` +
                            `(finish_reason=${finishReason}, refusal=${refusal})`
                        );
                        console.warn(`[AiClient:Chat] ${lastError.message}. Retrying/falling back...`);
                        // A 200 response with empty content is not a successful completion.
                        // Continue to attempt 2 (without response_format), then next provider.
                        continue;
                    }
                    
                    const statusCode = res.status;
                    console.warn(`[AiClient:Chat] provider=${p.id} model=${p.model} failed with ${statusCode}: ${text.substring(0, 100)}`);
                    
                    if (statusCode === 503 && text.includes('Proxy service is currently disabled')) {
                         console.warn(`[AiClient:Chat] Local Proxy is disabled, skipping remaining local models!`);
                         proxyDisabled = true;
                         break;
                    }
                    if (statusCode === 402) {
                         console.warn(`[AiClient:Chat] Insufficient balance for ${p.id}, skipping remaining attempts.`);
                         break;
                    }
                } catch (e) {
                    console.error(`[AiClient:Chat] Error with provider=${p.id} model=${p.model}: ${e.message}`);
                    lastError = e;
                }
                if (!proxyDisabled && attempt < 2) await new Promise(r => setTimeout(r, 1000));
            }
        }
        throw lastError || new Error('All models exhausted or failed');
    }

    // =========================================================================
    // 2. AUDIO TRANSCRIPTION / STT
    // =========================================================================
    _getAudioDuration(audioPath) {
        try {
            const out = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`, {
                stdio: ['pipe', 'pipe', 'ignore'],
                encoding: 'utf8'
            });
            const dur = parseFloat(out.trim());
            if (!isNaN(dur) && dur > 0) return dur;
        } catch (e) {
            // ignore
        }
        return 0;
    }

    _normalizeSttResult(data, audioPath) {
        if (!data) {
            throw new Error('STT response is empty');
        }

        // 1. Extract text from various response shapes
        let fullText = '';
        if (typeof data === 'string') {
            fullText = data;
        } else if (data.text) {
            fullText = data.text;
        } else if (data.transcript) {
            fullText = data.transcript;
        } else if (data.result) {
            fullText = typeof data.result === 'string' ? data.result : (data.result.text || '');
        } else if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
            fullText = data.candidates[0].content.parts[0].text;
        }

        // 2. Direct words array
        if (Array.isArray(data.words) && data.words.length > 0) {
            const words = data.words.map(w => ({
                start: parseFloat(w.start ?? w.startTime ?? 0) || 0,
                end: parseFloat(w.end ?? w.endTime ?? 0) || 0,
                word: String(w.word ?? w.text ?? '').trim()
            })).filter(w => w.word.length > 0);

            if (words.length > 0) {
                return {
                    text: fullText || words.map(w => w.word).join(' '),
                    words
                };
            }
        }

        // 3. Segments array (e.g. from Whisper / Whisper-like APIs)
        if (Array.isArray(data.segments) && data.segments.length > 0) {
            const words = [];
            const textParts = [];

            for (const seg of data.segments) {
                const segText = (seg.text || '').trim();
                if (segText) textParts.push(segText);

                if (Array.isArray(seg.words) && seg.words.length > 0) {
                    for (const w of seg.words) {
                        const wordStr = String(w.word ?? w.text ?? '').trim();
                        if (wordStr) {
                            words.push({
                                start: parseFloat(w.start ?? w.startTime ?? seg.start ?? 0) || 0,
                                end: parseFloat(w.end ?? w.endTime ?? seg.end ?? 0) || 0,
                                word: wordStr
                            });
                        }
                    }
                } else if (segText) {
                    // Interpolate words within segment boundaries
                    const segStart = parseFloat(seg.start ?? 0) || 0;
                    const segEnd = parseFloat(seg.end ?? segStart + 1) || (segStart + 1);
                    const segWords = segText.split(/\s+/).filter(Boolean);
                    const segDuration = Math.max(0.1, segEnd - segStart);
                    const wordDuration = segDuration / segWords.length;

                    for (let i = 0; i < segWords.length; i++) {
                        const wStart = segStart + i * wordDuration;
                        const wEnd = segStart + (i + 0.95) * wordDuration;
                        words.push({
                            start: parseFloat(wStart.toFixed(2)),
                            end: parseFloat(wEnd.toFixed(2)),
                            word: segWords[i]
                        });
                    }
                }
            }

            if (words.length > 0) {
                return {
                    text: fullText || textParts.join(' '),
                    words
                };
            }
        }

        // 4. Fallback: Flat text without timestamps -> Synthesize word timestamps
        const trimmedText = (fullText || '').trim();
        if (!trimmedText) {
            throw new Error('STT response contains no transcribed text');
        }

        let audioDuration = this._getAudioDuration(audioPath);
        const rawWords = trimmedText.split(/\s+/).filter(Boolean);
        if (rawWords.length === 0) {
            throw new Error('STT response contains no words');
        }

        if (audioDuration <= 0) {
            audioDuration = rawWords.length * 0.35; // approx 0.35s per word fallback
        }

        // Split text by sentence/clause boundaries to simulate natural pauses
        const sentences = trimmedText.split(/(?<=[.!?\n])\s+/).filter(Boolean);
        const words = [];

        if (sentences.length > 1) {
            const totalWords = rawWords.length;
            const pauseTime = Math.min(0.6, (audioDuration * 0.1) / Math.max(1, sentences.length - 1));
            const totalPauseTime = pauseTime * (sentences.length - 1);
            const effectiveSpeechDuration = Math.max(0.5, audioDuration - totalPauseTime);

            let currentTime = 0;
            for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
                const sText = sentences[sIdx].trim();
                const sWords = sText.split(/\s+/).filter(Boolean);
                if (sWords.length === 0) continue;

                const sDuration = (sWords.length / totalWords) * effectiveSpeechDuration;
                const wDuration = sDuration / sWords.length;

                for (let i = 0; i < sWords.length; i++) {
                    const wStart = currentTime + i * wDuration;
                    const wEnd = currentTime + (i + 0.95) * wDuration;
                    words.push({
                        start: parseFloat(wStart.toFixed(2)),
                        end: parseFloat(wEnd.toFixed(2)),
                        word: sWords[i]
                    });
                }

                currentTime += sDuration;
                if (sIdx < sentences.length - 1) {
                    currentTime += pauseTime;
                }
            }
        } else {
            const wDuration = audioDuration / rawWords.length;
            for (let i = 0; i < rawWords.length; i++) {
                const wStart = i * wDuration;
                const wEnd = (i + 0.95) * wDuration;
                words.push({
                    start: parseFloat(wStart.toFixed(2)),
                    end: parseFloat(wEnd.toFixed(2)),
                    word: rawWords[i]
                });
            }
        }

        console.log(`[AiClient:STT] Synthesized timestamps for ${words.length} words over ${audioDuration.toFixed(2)}s`);
        return {
            text: trimmedText,
            words
        };
    }

    async _transcribeAudioGroq(audioPath) {
        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) throw new Error('[AiClient:STT] GROQ_API_KEY not set');

        const sttModel = process.env.GROQ_STT_MODEL || 'whisper-large-v3';
        const audioBuffer = fs.readFileSync(audioPath);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
            audioBuffer,
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${sttModel}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\nword\r\n`),
            Buffer.from(`--${boundary}--\r\n`)
        ]);

        console.log(`[AiClient:STT] Sending audio to Groq Whisper (${sttModel})...`);
        const { statusCode, body: resBody } = await request('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Authorization': `Bearer ${apiKey}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body,
            headersTimeout: 120000,
            bodyTimeout: 120000
        });

        const rawText = await resBody.text();
        if (statusCode !== 200) {
            throw new Error(`Groq Whisper failed (${statusCode}): ${rawText.substring(0, 200)}`);
        }

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            throw new Error(`Groq Whisper response is not valid JSON: ${rawText.substring(0, 200)}`);
        }

        const normalized = this._normalizeSttResult(data, audioPath);
        console.log(`[AiClient:STT] Groq Whisper complete: ${normalized.words.length} words`);
        return normalized;
    }

    async _transcribeAudioGemini(audioPath, model) {
        const audioBuffer = fs.readFileSync(audioPath);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
            audioBuffer,
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${model}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="timestamp_granularities[]"\r\n\r\nword\r\n`),
            Buffer.from(`--${boundary}--\r\n`)
        ]);

        const apiKey = process.env.CUSTOM_AI_API_KEY || process.env.GEMINI_API_KEY || 'dummy-key';
        const customBaseUrl = (process.env.CUSTOM_AI_URL || 'http://171.22.174.246:8045/v1').replace(/\/chat\/completions\/?$/, '');
        const sttUrl = `${customBaseUrl}/audio/transcriptions`;
        console.log(`[AiClient:STT] Sending audio to Custom STT at ${sttUrl} (model: ${model})...`);
        const { statusCode, body: resBody } = await request(sttUrl, {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Authorization': `Bearer ${apiKey}`
            },
            body,
            headersTimeout: 180000,
            bodyTimeout: 180000
        });

        const rawText = await resBody.text();
        if (statusCode !== 200) {
            throw new Error(`Custom Transcription failed (${statusCode}): ${rawText.substring(0, 200)}`);
        }

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            // If the server returned plain text directly
            data = { text: rawText };
        }

        const normalized = this._normalizeSttResult(data, audioPath);
        console.log(`[AiClient:STT] Custom Transcription complete: ${normalized.words.length} words`);
        return normalized;
    }

    async _transcribeAudioPollinations(audioPath) {
        const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
        const sttModel = process.env.POLLINATIONS_STT_MODEL || 'scribe';
        const audioBuffer = fs.readFileSync(audioPath);
        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const body = Buffer.concat([
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
            audioBuffer,
            Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n${sttModel}\r\n`),
            Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
            Buffer.from(`--${boundary}--\r\n`)
        ]);

        console.log(`[AiClient:STT] Sending audio to Pollinations (${sttModel}) for transcription...`);
        const { statusCode, body: resBody } = await request('https://gen.pollinations.ai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
            },
            body,
            headersTimeout: 180000,
            bodyTimeout: 180000
        });

        const rawText = await resBody.text();
        if (statusCode !== 200) {
            throw new Error(`Pollinations Transcription failed (${statusCode}): ${rawText.substring(0, 200)}`);
        }

        let data;
        try {
            data = JSON.parse(rawText);
        } catch (parseErr) {
            data = { text: rawText };
        }

        const normalized = this._normalizeSttResult(data, audioPath);
        console.log(`[AiClient:STT] Pollinations Transcription complete: ${normalized.words.length} words`);
        return normalized;
    }

    async transcribe(audioPath, retries = 3) {
        // ── Priority 1: Groq Whisper (whisper-large-v3, fastest + most accurate) ──
        if (process.env.GROQ_API_KEY) {
            for (let attempt = 1; attempt <= retries; attempt++) {
                try {
                    if (attempt > 1) {
                        console.log(`[AiClient:STT] Groq: Waiting 3s before retry attempt ${attempt}...`);
                        await new Promise(r => setTimeout(r, 3000));
                    }
                    return await this._transcribeAudioGroq(audioPath);
                } catch (e) {
                    console.error(`[AiClient:STT] Groq attempt ${attempt} failed: ${e.message}`);
                    // 403 = permanent (no STT access on this plan/region) — skip retries
                    if (e.message.includes('403')) {
                        console.warn('[AiClient:STT] Groq returned 403 (no STT access), skipping to Custom STT...');
                        break;
                    }
                    if (attempt === retries) console.warn('[AiClient:STT] Groq exhausted, falling back to Custom STT...');
                }
            }
        }

        // ── Priority 2: Custom local proxy (Gemini) ──────────────────────────────
        const customSttModel = process.env.CUSTOM_STT_MODEL || 'gemini-2.5-flash';
        let customLastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`[AiClient:STT] Custom STT: Waiting 2s before retry attempt ${attempt}...`);
                    await new Promise(r => setTimeout(r, 2000));
                }
                return await this._transcribeAudioGemini(audioPath, customSttModel);
            } catch (e) {
                console.error(`[AiClient:STT] Custom STT attempt ${attempt} failed: ${e.message}`);
                customLastError = e;
            }
        }

        console.warn('[AiClient:STT] Custom STT failed 3 times. Falling back to Pollinations...');

        // ── Priority 3: Pollinations (last resort) ───────────────────────────────
        let pollLastError = null;
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`[AiClient:STT] Pollinations STT: Waiting 6s before retry attempt ${attempt}...`);
                    await new Promise(r => setTimeout(r, 6000));
                }
                return await this._transcribeAudioPollinations(audioPath);
            } catch (e) {
                console.error(`[AiClient:STT] Pollinations STT attempt ${attempt} failed: ${e.message}`);
                pollLastError = e;
            }
        }

        throw new Error(`All STT providers failed. Last error: ${pollLastError?.message}`);
    }

    // =========================================================================
    // 3. VOICE SYNTHESIS / TTS
    // =========================================================================
    async _synthesizeDirectElevenLabs(text, voiceId, outputPath, options = {}) {
        const apiKey = process.env.ElevenLabs_API;
        if (!apiKey) throw new Error('[AiClient:Voice] ElevenLabs_API key not set');

        console.log(`[AiClient:Voice] Direct ElevenLabs TTS: voice=${voiceId} text=${text.length}chars`);
        
        const response = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
            {
                text: text,
                model_id: options.model_id || 'eleven_multilingual_v2',
                voice_settings: {
                    stability: options.stability ?? 0.85,
                    similarity_boost: options.similarity_boost ?? 0.75,
                    style: options.style ?? 0.0,
                    use_speaker_boost: options.use_speaker_boost !== false
                }
            },
            {
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json'
                },
                responseType: 'arraybuffer'
            }
        );

        const buf = Buffer.from(response.data);
        if (buf.length < 100) throw new Error(`[AiClient:Voice] Direct ElevenLabs result too small: ${buf.length}B`);
        
        const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
        const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
        if (!isID3 && !isSync) {
            throw new Error(`[AiClient:Voice] Direct ElevenLabs returned invalid audio buffer`);
        }

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, buf);
        console.log(`[AiClient:Voice] Direct ElevenLabs Saved: ${outputPath} (${buf.length}B)`);
        return outputPath;
    }

    async _synthesizeCsv666Speech(text, voiceId, outputPath, options = {}) {
        if (process.env.ElevenLabs_API) {
            return await this._synthesizeDirectElevenLabs(text, voiceId, outputPath, options);
        }
        const apiKey = process.env.VOICEAPI_KEY || process.env.VOICE_AI_KEY;
        const templateId = process.env.UUID;
        if (!apiKey) throw new Error('[AiClient:Voice] VOICEAPI_KEY not set');
        if (!templateId) throw new Error('[AiClient:Voice] UUID not set for Lumean Template');

        const LUMEAN_BASE = 'https://api.lumean.app/api/public';
        const hdrs = {
            'X-API-KEY': apiKey,
            'Content-Type': 'application/json'
        };

        const body = {
            template_id: templateId,
            input_text: text
        };

        console.log(`[AiClient:Voice] POST /orders template=${templateId} text=${text.length}chars`);
        const cr = await axios.post(`${LUMEAN_BASE}/orders`, body, { headers: hdrs });
        const orderId = cr.data && cr.data.data && cr.data.data.id;
        if (!orderId) throw new Error('[AiClient:Voice] No order id: ' + JSON.stringify(cr.data).slice(0, 200));
        console.log(`[AiClient:Voice] order_id=${orderId}`);

        let finalOrder = null;
        for (let n = 0; n < 60; n++) {
            await new Promise(r => setTimeout(r, 2000));
            const sr = await axios.get(`${LUMEAN_BASE}/orders/${orderId}`, { headers: hdrs });
            const st = ((sr.data.data.status || '')).toLowerCase();
            console.log(`[AiClient:Voice] order=${orderId} status=${st} (${n+1}/60)`);
            if (st === 'failed' || st === 'cancelled') throw new Error('[AiClient:Voice] Task failed: ' + JSON.stringify(sr.data).slice(0, 200));

            if (st === 'completed' || st === 'partially_completed') {
                finalOrder = sr.data.data;
                console.log(`[AiClient:Voice] Status "${st}" — downloading result`);
                break;
            }
        }
        
        if (!finalOrder) throw new Error(`[AiClient:Voice] Timeout: order ${orderId}`);

        const resultItem = finalOrder.result.files[0];
        const resultPath = typeof resultItem === 'string' ? resultItem : resultItem.path;
        
        const urlRes = await axios.post(`${LUMEAN_BASE}/storage/url`, { path: resultPath }, { headers: hdrs });
        const downloadUrl = urlRes.data.data.url;

        const ar = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        const buf = Buffer.from(ar.data);
        if (buf.length < 100) throw new Error(`[AiClient:Voice] Too small: ${buf.length}B`);
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(outputPath, buf);
        console.log(`[AiClient:Voice] Saved: ${outputPath} (${buf.length}B)`);
        return outputPath;
    }

    async synthesizeVoice(text, language = 'en', voice = 'aeb88254-a426-47da-a7d4-f182195f9fab', model = 'csv666', customDir = null) {
        let activeVoice = voice;
        if (language.toLowerCase() === 'russian' || language.toLowerCase() === 'ru') {
            activeVoice = 'aeb88254-a426-47da-a7d4-f182195f9fab'; // "Alex_Ru"
        } else {
            activeVoice = 'eb21f806-58d1-46db-b346-24ea6540d0eb'; // "french" (multilingual template)
        }
        
        // Use a generic outputPath if not provided (customDir param handling legacy)
        // Actually, customDir in previous usage was meant to be outputPath directly in many cases.
        // Wait, synthesizeUnifiedSpeech signature was: (input, language, voice, model, customDir) 
        // But `synthesizeCsv666Speech` expects (text, voiceId, outputPath, options)
        // Let's preserve exactly how it was in skeleton-handlers.cjs:
        // `return await synthesizeCsv666Speech(input, activeVoice, language, customDir);`
        // So `language` was actually passed as `outputPath` to `synthesizeCsv666Speech` in some strange cases?
        // Wait, in `skeleton-handlers.cjs`:
        // const synthesizeUnifiedSpeech = async (input, language = 'en', voice = 'aeb88254-a426-47da-a7d4-f182195f9fab', model = 'csv666', customDir = null) => {
        // ...
        //     return await synthesizeCsv666Speech(input, activeVoice, language, customDir);
        // }
        // Ah! `language` parameter in `synthesizeUnifiedSpeech` was actually passed to `outputPath` in `synthesizeCsv666Speech`. That's a huge bug/quirk in the original code.
        // Let's look at `synthesizeCsv666Speech` signature: `async function synthesizeCsv666Speech(text, voiceId, outputPath, options = {})`
        // Yes, `language` is passed as `outputPath`! 
        // Oh, wait, in previous searches I saw:
        // `await synthesizeUnifiedSpeech(text, outputPath, activeVoice);`
        // So the consumer actually passed:
        // arg1: text
        // arg2: outputPath
        // arg3: activeVoice
        // So `language` was effectively `outputPath`.
        // Let's normalize it here to avoid breaking everything, but give it a clear signature.
        let outputPath = language; 
        return await this._synthesizeCsv666Speech(text, activeVoice, outputPath, customDir || {});
    }

    async synthesizeDirectElevenLabs(text, voiceId, outputPath, options = {}) {
        return await this._synthesizeDirectElevenLabs(text, voiceId, outputPath, options);
    }

    // =========================================================================
    // 4. GEMINI VIDEO PROCESSING (NATIVE FILE API)
    // =========================================================================
    _getGeminiKey(isUpload = false) {
        const rawKey = process.env.GEMINI_API_KEY || '';
        const keys = rawKey.split(',').map(k => k.trim()).filter(k => k);
        if (keys.length === 0) throw new Error("GEMINI_API_KEY is missing in .env");
        
        if (isUpload || !this._activeGeminiKey) {
            this._activeGeminiKey = keys[Math.floor(Math.random() * keys.length)];
            console.log(`[AiClient:Gemini] Selected API key (...${this._activeGeminiKey.slice(-4)}) from ${keys.length} available key(s).`);
        }
        return this._activeGeminiKey;
    }
    
    _getGeminiBaseUrl() {
        let url = (process.env.CUSTOM_GEMINI_URL || 'https://generativelanguage.googleapis.com').trim();
        if (url.endsWith('/')) url = url.slice(0, -1);
        if (url.endsWith('/v1beta')) url = url.slice(0, -7);
        return url;
    }

    async uploadVideoToGemini(filePath) {
        const apiKey = this._getGeminiKey(true);

        const stats = fs.statSync(filePath);
        const numBytes = stats.size;
        const baseUrl = this._getGeminiBaseUrl();
        console.log(`[AiClient:Gemini] Initiating upload for ${filePath} (${(numBytes/1024/1024).toFixed(2)} MB) to ${baseUrl}...`);

        const headers = {
            'X-Goog-Upload-Protocol': 'resumable',
            'X-Goog-Upload-Command': 'start',
            'X-Goog-Upload-Header-Content-Length': numBytes.toString(),
            'X-Goog-Upload-Header-Content-Type': 'video/mp4',
            'Content-Type': 'application/json'
        };
        
        if (!baseUrl.includes('googleapis.com')) {
            headers['Authorization'] = `Bearer ${process.env.CUSTOM_AI_API_KEY || apiKey}`;
            headers['x-goog-api-key'] = apiKey;
        }

        const initRes = await fetch(`${baseUrl}/upload/v1beta/files?key=${apiKey}`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({ file: { display_name: path.basename(filePath) } })
        });
        
        if (!initRes.ok) throw new Error("Init fail: " + await initRes.text());
        const uploadUrl = initRes.headers.get('x-goog-upload-url');
        
        console.log(`[AiClient:Gemini] Uploading data to Google...`);
        const fileBuffer = fs.readFileSync(filePath);
        const uploadRes = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                'X-Goog-Upload-Command': 'upload, finalize',
                'X-Goog-Upload-Offset': '0',
                'Content-Length': numBytes.toString(),
                'Content-Type': 'video/mp4'
            },
            body: fileBuffer
        });
        
        if (!uploadRes.ok) throw new Error("Upload fail: " + await uploadRes.text());
        const uploadData = await uploadRes.json();
        console.log(`[AiClient:Gemini] Upload complete! File URI: ${uploadData.file.uri}`);
        return { fileUri: uploadData.file.uri, fileName: uploadData.file.name };
    }

    async waitForGeminiProcessing(fileName) {
        const apiKey = this._getGeminiKey();
        const baseUrl = this._getGeminiBaseUrl();
        console.log(`[AiClient:Gemini] Waiting for Google/Proxy to process the video...`);
        while (true) {
            const res = await fetch(`${baseUrl}/v1beta/${fileName}?key=${apiKey}`);
            const data = await res.json();
            if (data.state === 'ACTIVE') return;
            if (data.state === 'FAILED') throw new Error("Video processing failed on Google servers");
            await new Promise(r => setTimeout(r, 3000));
        }
    }

    async generateVideoPromptWithGemini(fileUri, promptText) {
        const apiKey = this._getGeminiKey();
        const videoModel = process.env.GEMINI_VIDEO_MODEL || 'gemini-2.0-flash';
        console.log(`[AiClient:Gemini] Analyzing video segment with ${videoModel}...`);

        const payload = {
            contents: [{
                parts: [
                    { fileData: { mimeType: 'video/mp4', fileUri: fileUri } },
                    { text: promptText }
                ]
            }],
            generationConfig: {
                responseMimeType: "application/json"
            }
        };

        let retries = 5;
        const baseUrl = this._getGeminiBaseUrl();

        for (let attempt = 1; attempt <= retries; attempt++) {
            const res = await fetch(`${baseUrl}/v1beta/models/${videoModel}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            
            if (res.ok) {
                return data.candidates[0].content.parts[0].text;
            }
            
            if (res.status === 429) {
                if (attempt < retries) {
                    console.warn(`[AiClient:Gemini] Rate limit 429 hit. Waiting 15 seconds before retry ${attempt}/${retries}...`);
                    await new Promise(r => setTimeout(r, 15000));
                    continue;
                }
            }
            
            throw new Error(`Analyze fail (${res.status}): ` + JSON.stringify(data));
        }
    }

    // =========================================================================
    // 5. IMAGE GENERATION (Proxy to G-Labs)
    // =========================================================================
    async generateImage(options) {
        return await generateImageViaGLabs(options);
    }

    // =========================================================================
    // 5. VIDEO GENERATION (Proxy to G-Labs)
    // =========================================================================
    async generateVideo(options) {
        return await generateVideoViaGLabs(options);
    }
}

module.exports = new AntigravityClient();
