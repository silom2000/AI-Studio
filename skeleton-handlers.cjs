// ============ SKELETON SHORTS вЂ” WAN V2.6 720P ============
const path = require('path');
const axios = require('axios');
const fs = require('fs');
const { pipeline } = require('stream');
const { promisify } = require('util');
const { spawn, execSync } = require('child_process');
const crypto = require('crypto');
const streamPipeline = promisify(pipeline);
const historyManager = require('./history-manager.cjs');
const { pipeline: _pipeline } = require('stream');

const ai = require('./ai-client.cjs');
const { searchWeb } = require('./search-helper.cjs');
const { extractLifehacks: lhExtract, getNext: lhGetNext, markUsed: lhMarkUsed, getStats: lhGetStats } = require('./lifehack-queue.cjs');
const amazonManager = require('./amazon-manager.cjs');
const amazonSourcing = require('./amazon-sourcing.cjs');

const LANG_NAMES = {
    // short codes
    en: 'English', fr: 'French', de: 'German', es: 'Spanish', it: 'Italian',
    ru: 'Russian', pl: 'Polish', pt: 'Portuguese', zh: 'Chinese', ja: 'Japanese',
    // full names (from StudioTab language selector)
    English: 'English', Russian: 'Russian', French: 'French', German: 'German',
    Spanish: 'Spanish', Polish: 'Polish', Italian: 'Italian', Portuguese: 'Portuguese'
};

// ———— Object Categories for diverse lifehack idea generation (NO FOOD) ————
const OBJECT_CATEGORIES = [
    // HOUSEHOLD ITEMS
    { theme: 'Household', objects: ['furniture', 'bedroom objects', 'bathroom items', 'cleaning tools', 'electrical appliances', 'doors & windows', 'pillows & blankets', 'storage items', 'lights & fans', 'laundry items'] },
    // OFFICE & WORK
    { theme: 'Office & Work', objects: ['desk objects', 'laptop & accessories', 'stationery', 'printer & scanner', 'office furniture', 'work-from-home setup', 'ID card & access card', 'files & folders', 'cable management', 'meeting room objects'] },
    // GYM & FITNESS
    { theme: 'Gym & Fitness', objects: ['gym equipment', 'dumbbells & weights', 'cardio machines', 'gym accessories', 'fitness tracking devices', 'gym lockers', 'workout clothes', 'yoga equipment', 'resistance bands', 'gym bags'] },
    // LIFE HACKS & PRODUCTIVITY
    { theme: 'Life Hacks & Productivity', objects: ['morning routines', 'organization systems', 'time-saving shortcuts', 'multitasking tricks', 'smart planning habits', 'focus techniques', 'energy management', 'sleep optimization hacks', 'stress reduction tricks', 'daily efficiency boosters'] },
    // TECH & DIGITAL
    { theme: 'Tech & Digital', objects: ['mobile apps', 'phone components', 'social media platforms', 'notifications', 'AI tools', 'gadgets', 'cables & chargers', 'gaming devices', 'smart home devices', 'digital files'] },
    // MONEY & FINANCE
    { theme: 'Money & Finance', objects: ['wallet contents', 'credit cards', 'coins & cash', 'bills & expenses', 'savings vs spending', 'investment assets', 'budget categories', 'subscription services', 'salary breakdown', 'shopping items'] },
    // SCHOOL & STUDY
    { theme: 'School & Study', objects: ['school stationery', 'books', 'exam papers', 'classroom objects', 'backpack contents', 'homework materials', 'grades & marks', 'online class tools', 'study apps', 'library books'] },
    // TRAVEL & OUTDOORS
    { theme: 'Travel & Outdoors', objects: ['luggage items', 'travel accessories', 'vehicle parts', 'road objects', 'tourist items', 'airport objects', 'train station items', 'hotel room items', 'weather elements', 'camping gear'] },
    // FUN & VIRAL
    { theme: 'Fun & Viral', objects: ['emojis', 'alphabet letters', 'numbers', 'colors', 'sounds', 'emotions', 'habits', 'daily routines', 'time periods', 'life stages'] }
];

// —— Pixar Cinematic Image Prompt Variants ———————————————————————
const PIXAR_IMAGE_VARIANTS = [
    {
        id: 'A', name: "Cozy Inventor's Workshop",
        template: (character) => `${character}, medium shot, standing proudly in a cozy warmly-lit inventor's workshop filled with wooden workbenches, blueprints on walls, glowing Edison bulbs, creative science gadgets, warm atmospheric lighting, shallow depth of field, cinematic 9:16 portrait composition`
    },
    {
        id: 'B', name: 'Smart Lifehack Kitchen',
        template: (character) => `${character}, eye-level portrait shot, inside a modern bright aesthetic kitchen with neat wooden shelves, organized pantry jars, soft golden morning sunlight filtering through the window, cheerful ambient lighting, cinematic 9:16 vertical framing`
    },
    {
        id: 'C', name: 'Creative Tech Lab & Desk',
        template: (character) => `${character}, sitting or standing at a creative colorful study desk with colorful notebooks, craft tools, warm desk lamp glow, soft bokeh background, curious and proud expression, high-end 3D CGI render`
    },
    {
        id: 'D', name: 'Direct Discovery Studio',
        template: (character) => `${character}, stylish modern discovery room with subtle chalkboard diagrams and blueprints in background, warm soft spotlight, sharp focus, energetic confident posture`
    },
    {
        id: 'E', name: 'Macro Problem Focus & Disaster Inspection',
        template: (character, problemDetail) => {
            const problem = problemDetail && problemDetail.trim().length > 10
                ? problemDetail.trim()
                : 'the physical problem or damaged area examined in sharp close-up detail';
            return `Extreme high-detail inspection shot, cinematic 9:16 vertical framing. In the sharp macro foreground: ${problem}. Just behind, standing at eye level with dramatic soft-bokeh focus: ${character} leaning forward closely, inspecting the damage with an attentive, shocked or analytical expression. Cinematic dramatic lighting, rich textures, photorealistic 3D CGI render style.`;
        }
    },
    {
        id: 'F', name: 'Cinematic Hero Close-Up',
        // ECU + Dutch tilt + venetian blind shadow drama — from 100K_PromptGuide shadow storytelling technique
        template: (character) => `${character}, extreme close-up ECU, Dutch tilt 5 degrees, face filling 70% of the 9:16 frame, dramatic shadow pattern from narrow venetian blind slats cast across her face and upper body, single hard sidelight at 90 degrees creating 2:1 light-to-shadow ratio, background completely soft black bokeh, sharp focus on eyes and expression, ultra-cinematic 3D CGI render, high contrast mood`
    },
    {
        id: 'G', name: 'Atmospheric Wide — Inventor Lab',
        // Wide shot with atmospheric depth (secret #1 from guide) + volumetric light rays
        template: (character) => `${character}, wide shot showing full environment, standing at center of a spacious warmly-lit inventor's laboratory, atmospheric haze between camera and subject adding cinematic depth, volumetric light rays streaming through a side window hitting lab surfaces, dust particles visible in the light beam, background equipment and shelves softened by aerial perspective, foreground slightly defocused glass or tube element creating depth layers, 9:16 vertical portrait, ultra-detailed 3D CGI cinematic render`
    },
    {
        id: 'H', name: 'Split Diopter — Product Focus',
        // Split diopter technique: foreground product macro + background character both sharp
        template: (character, productDetail) => {
            const product = productDetail && productDetail.trim().length > 5
                ? productDetail.trim()
                : 'a household item or cleaning product';
            return `Split focus composition, 9:16 vertical portrait: in the sharp macro foreground at bottom-left of frame — ${product}, extreme close-up revealing texture and detail. In the sharp background center-right — ${character} standing at full height, equally sharp, looking directly at the camera with a proud knowing smile. Soft out-of-focus middle zone between them creates visual depth. Warm ambient lab lighting. 3D CGI render, high-end cinematic quality.`;
        }
    },
    {
        id: 'I', name: 'Golden Hour Window — Warm Lifestyle',
        // Golden hour SSS + bokeh color theory (warm tungsten balls + cool background) from guide
        template: (character) => `${character}, medium close-up MCU, positioned near a large bright window, golden hour backlight creating warm amber subsurface scattering glow through her hair and ears, soft wrap-around fill from the left, warm tungsten bokeh balls from background practicals (Edison string lights), one subtle cool-tinted window pane reflection creating warm-subject/cool-background color contrast, catchlight is a window reflection — NOT a ring flash, atmospheric cinematic feel, 9:16 vertical portrait, 3D CGI high-end render`
    }
];

// —— Genie Character Bible (Photorealistic 3D CGI) —————————————————————————
const CHARACTER_BIBLE_GENIE_RAW = `Génie — a mature adult woman scientist in her late 20s, high-end photorealistic 3D CGI render. The character's face, hair, outfit, and all visual appearance details are defined 100% by the provided reference image — do NOT describe or invent any physical features. Expression: confident, enthusiastic, professional inventor energy. The image in reference_images shows her exact face and design — match it precisely.`;
const CHARACTER_BIBLE_GENIE = `"${CHARACTER_BIBLE_GENIE_RAW}"`;

// —— Psychology Character Bible (Pixar-style, видавший жизнь мужик-советчик) ——
const CHARACTER_BIBLE_PSYCHOLOGIST = `"High-end 3D CGI animation style. A weathered, street-smart man in his late 50s who has seen everything life has to offer. Features: deep-set eyes with a penetrating, knowing gaze that misses nothing, a broad slightly crooked nose that's been broken at least once, prominent laugh lines and stubble that suggest decades of hard-won experience, salt-and-pepper unkempt hair, a wry half-smirk that says he already knows what you're going to say. Build: stocky and solid, the kind of man you don't argue with twice. Outfit: worn leather jacket over a simple dark shirt, no tie, sleeves sometimes rolled up — looks like someone who never needed to impress anyone. He gestures directly, speaks without sugarcoating, points at the camera like he's talking to an old friend who's making the same mistake for the third time. High-end 3D CGI render, moody dramatic side-lighting, 9:16 vertical portrait aspect ratio."`;

// —— Psychology Image Variants ————————————————————————————————————
const PSYCH_IMAGE_VARIANTS = [
    {
        id: 'A', name: 'Street Corner Wisdom',
        template: (character) => `${character}, medium shot, leaning against a worn brick wall in a dimly lit urban alley, hands in jacket pockets, confident authoritative posture, atmospheric moody lighting, shallow depth of field, cinematic 9:16 portrait composition`
    },
    {
        id: 'B', name: 'Old Bar Philosopher',
        template: (character) => `${character}, eye-level portrait shot, seated at a weathered wooden bar or cafe table, one elbow resting on the surface, leaning slightly forward as if sharing a hard truth, warm amber light from above, cinematic 9:16 vertical framing`
    },
    {
        id: 'C', name: 'Direct Confrontation',
        template: (character) => `${character}, close-up shot, facing camera directly, finger pointed slightly toward viewer, intense knowing expression, dark studio background with single dramatic spotlight, no-nonsense posture`
    },
    {
        id: 'D', name: 'Rooftop Perspective',
        template: (character) => `${character}, standing on a rooftop at dusk with city lights behind, arms crossed, surveying the world below with the calm confidence of someone who has seen it all, cinematic wide-to-close composition`
    }
];

const PSYCH_IMAGE_BASE = `ultra-cinematic lighting, rich moody tones, dramatic shadows, sharp focus, photorealistic 3D render quality`;
const PIXAR_IMAGE_BASE = `high-end 3D CGI render, photorealistic lighting and materials, warm studio lighting, vibrant colors, expressive character, detailed textures`;

// —— Psychology Video Motion Variants ————————————————————————————————
const PSYCH_VIDEO_VARIANTS = [
    {
        id: 'A', name: 'The Blunt Truth-Teller',
        template: `CAMERA MOVEMENT: Very slow subtle push-in over 8 seconds. CHARACTER ACTION: He speaks directly into camera with calm authority, gesturing with a single pointed finger or open hand as if laying out facts, occasionally shaking his head slightly at human foolishness, maintaining steady eye contact throughout. Face remains centered for lip-sync.`
    },
    {
        id: 'B', name: 'The Knowing Lean',
        template: `CAMERA MOVEMENT: Stable framing, slight tilt correction. CHARACTER ACTION: He leans forward slowly as he makes his key point, one eyebrow rising, a dry half-smile forming — the look of someone who called it years ago. He speaks with unhurried confidence, pausing for effect. Face remains perfectly visible for lip-sync.`
    },
    {
        id: 'C', name: 'The Street Professor',
        template: `CAMERA MOVEMENT: Tightly framed mid-shot. CHARACTER ACTION: He counts points on his fingers with deliberate calm, gestures sideways as if pointing to invisible examples from real life, nods firmly at his own conclusions. Speaks like a man who has no time for lies. Face stays steady for clear lip-sync.`
    },
    {
        id: 'D', name: 'The Unsolicited Advice',
        template: `CAMERA MOVEMENT: Gentle slow dolly in. CHARACTER ACTION: He spreads his hands open, shrugs with the confidence of someone who's been right too many times, then looks straight at the viewer as if to say "you know I'm right." Delivers the line with a wry, unflinching gaze. Face remains visible for perfect lip-sync.`
    }
];

// —— Business Image Variants (Génie as business educator) ————————————————
const BUSINESS_IMAGE_VARIANTS = [
    {
        id: 'A', name: 'Corporate Boardroom',
        template: (character) => `${character}, medium shot, standing confidently at the head of a modern glass-walled corporate boardroom, large digital screen behind showing abstract business charts, warm golden ceiling spotlights, reflections in polished conference table, professional confident posture, cinematic 9:16 vertical framing, high-end photorealistic 3D CGI render`
    },
    {
        id: 'B', name: 'Rooftop Skyline at Golden Hour',
        template: (character) => `${character}, medium-wide shot, standing on a luxury rooftop terrace at golden hour, city skyline panorama behind with glowing skyscrapers, arms folded or one hand gesturing outward at the horizon, warm amber backlight creating dramatic rim lighting, confident visionary posture, cinematic 9:16 vertical portrait, high-end 3D CGI render`
    },
    {
        id: 'C', name: 'Creative Co-Working Space',
        template: (character) => `${character}, eye-level portrait, seated at a stylish wooden table in a cozy modern co-working café, latte and notebook visible, warm ambient lighting from Edison bulbs, bookshelves and plants in soft bokeh background, relaxed yet sharp expression, cinematic 9:16 composition, high-end 3D CGI render`
    },
    {
        id: 'D', name: 'TED-Style Presentation Stage',
        template: (character) => `${character}, wide-to-medium shot, standing center stage on a modern circular TED-style platform, dramatic red and warm stage lighting, large audience in darkened background (silhouettes), confident open-arms gesture addressing the crowd, sharp focus on character, cinematic 9:16, high-end 3D CGI render`
    },
    {
        id: 'E', name: 'Macro Money & Strategy Focus',
        template: (character, detail) => {
            const subject = detail && detail.trim().length > 10
                ? detail.trim()
                : 'stacks of Euro banknotes, a golden key on a financial blueprint, or strategic chess pieces';
            return `Extreme high-detail macro inspection shot, cinematic 9:16 vertical framing. In the sharp macro foreground: ${subject}. Just behind, standing at eye level with dramatic soft-bokeh focus: ${character} leaning in with an analytical sharp gaze, examining the strategic object with fascination. Cinematic warm lighting, rich textures, photorealistic 3D CGI render.`;
        }
    },
    {
        id: 'F', name: 'Dramatic Visionary Close-Up',
        template: (character) => `${character}, extreme close-up ECU, subtle Dutch tilt, face filling 70% of the 9:16 frame, dramatic single sidelight creating sharp shadow patterns, warm amber key light from one side, background completely soft dark bokeh, sharp focus on eyes conveying strategic brilliance and determination, ultra-cinematic 3D CGI render`
    },
    {
        id: 'G', name: 'Grand Library & Study',
        template: (character) => `${character}, wide shot showing full environment, standing in a grand elegant private library with floor-to-ceiling bookshelves, warm reading lamps, atmospheric haze and volumetric light rays through tall windows, one hand resting on an open book on a mahogany desk, scholarly confident aura, 9:16 vertical portrait, ultra-detailed 3D CGI render`
    },
    {
        id: 'H', name: 'Split Focus — Business Object',
        template: (character, objectDetail) => {
            const obj = objectDetail && objectDetail.trim().length > 5
                ? objectDetail.trim()
                : 'a miniature business model, golden scales, or architectural blueprint';
            return `Split focus composition, 9:16 vertical portrait: in the sharp macro foreground at bottom-left — ${obj}, extreme close-up revealing texture and detail. In the sharp background center-right — ${character} standing at full height, equally sharp, looking directly at the camera with a confident strategic smile. Soft out-of-focus middle zone creates depth. Warm professional lighting. Photorealistic 3D CGI render.`;
        }
    }
];

const BUSINESS_IMAGE_BASE = `high-end photorealistic 3D CGI render, warm professional lighting, cinematic depth, rich golden and amber tones, sharp focus, detailed textures`;

// —— Business Video Motion Variants ————————————————————————————————————
const BUSINESS_VIDEO_VARIANTS = [
    {
        id: 'A', name: 'The Confident Educator',
        template: `CAMERA MOVEMENT: Very subtle slow push-in over 8 seconds. CHARACTER ACTION: She speaks directly into camera with warm confident authority, using clear precise hand gestures — pointing at an invisible whiteboard, counting key points on fingers, making confident open-palm statements. Her face is centered, fully lit, mouth clearly visible throughout all 8 seconds for perfect lip-sync.`
    },
    {
        id: 'B', name: 'The Strategic Reveal',
        template: `CAMERA MOVEMENT: Stable framing with slow subtle push-in. CHARACTER ACTION: She leans forward slightly as she delivers the key business insight, one eyebrow raising, a sharp knowing smile forming — the look of someone who sees what others miss. She holds up one finger or makes a frame gesture, building suspense before the reveal. Face stays perfectly visible for lip-sync.`
    },
    {
        id: 'C', name: 'The Empathetic Advisor',
        template: `CAMERA MOVEMENT: Warm stable mid-shot. CHARACTER ACTION: She speaks with open palm gestures, warm encouraging expressions, nods empathetically as if understanding the viewer's business struggles. She then shifts to a sharper confident tone, pointing gently forward toward the viewer with an encouraging smile. Face remains centered and visible for lip-sync.`
    },
    {
        id: 'D', name: 'The Dramatic Storyteller',
        template: `CAMERA MOVEMENT: Gentle slow dolly in, building dramatic tension. CHARACTER ACTION: She uses theatrical hand gestures — sweeping motions building the metaphor, then pausing with both hands together before delivering the punchline insight. Her expression shifts from curious to triumphant as the business lesson clicks. Face stays visible for lip-sync throughout.`
    },
    {
        id: 'E', name: 'Macro Insight Inspection',
        template: `CAMERA MOVEMENT: Slow macro rack-focus from a sharp foreground business prop (golden key, chess piece, Euro banknotes, or miniature model) directly to the character behind it. CHARACTER ACTION: The scene begins tightly focused on the vivid business object in the immediate foreground. She leans into frame, points directly at the object with an analytical fascinated gesture, then looks straight at the camera with sharp knowing eyes as she delivers the key business mechanism. Face and mouth stay clearly visible for lip-sync.`
    },
    {
        id: 'F', name: 'Crash Zoom — Business Revelation',
        template: `CAMERA MOVEMENT: Rapid crash zoom in at the very start of the clip (0–1 second), then hold tight close-up for the remaining 7 seconds. The snap-zoom creates an immediate visual jolt of energy and authority. CHARACTER ACTION: She reacts to the sudden closeness with sharp confident eyes and a knowing strategic look, then settles into a direct authoritative address to the camera, counting a key point on her fingers or tapping her temple as she delivers the counter-intuitive business revelation. Face fills the upper half of the frame, mouth clearly visible for lip-sync throughout.`
    },
    {
        id: 'G', name: 'Orbit Arc — Triumphant Conclusion',
        template: `CAMERA MOVEMENT: Gentle slow arc of 20–30 degrees around the character over 8 seconds, camera staying at face level, subject remains centered in frame throughout the subtle arc. The background shifts slightly creating cinematic depth without extreme perspective changes. CHARACTER ACTION: She holds up a strategic prop or makes a decisive conclusive gesture with both hands, staying mostly front-facing to camera, wearing a wide triumphant smile and radiating proud visionary energy as she delivers the master principle. Face visible and lit at all times for clear lip-sync.`
    },
    {
        id: 'H', name: 'Parallax Depth — Editorial Authority',
        template: `CAMERA MOVEMENT: Slow lateral parallax slide over 8 seconds — camera drifts sideways so foreground elements (business books, golden scales, architectural models, glass awards) move faster than the background, creating cinematic depth separation through movement. CHARACTER ACTION: She stands still, centered in the mid-ground, speaking directly to camera with calm masterful authority. Her stable presence contrasts the moving world around her. She gestures with one hand naturally, nodding with strategic clarity. Face remains front-facing and fully lit for perfect lip-sync.`
    }
];

const TALKING_OBJECT_IMAGE_LOCK = ``;

// —— VEO Video Motion Variants ——————————————————————————————————————
const PIXAR_VIDEO_VARIANTS = [
    {
        id: 'A', name: 'The Confident Inventor',
        template: `CAMERA MOVEMENT: Very subtle, slow push-in over 8 seconds. CHARACTER ACTION: She speaks with sharp enthusiastic energy, making confident gestures with her hands, explaining the insight directly into the camera with an engaging knowing smile. Her face is centered in frame, fully lit, mouth clearly visible throughout all 8 seconds.`
    },
    {
        id: 'B', name: 'The Eureka Moment',
        template: `CAMERA MOVEMENT: Slow dramatic push-in to a close-up. CHARACTER ACTION: Her expressive eyes light up with excitement, she gestures expressively as if struck by a brilliant idea, then looks directly into the camera with a sharp knowing gaze as she reveals the secret trick. Her face stays front-facing and fully visible in the center of frame throughout all 8 seconds.`
    },
    {
        id: 'C', name: 'The Hands-on Demonstration',
        template: `CAMERA MOVEMENT: Stable mid-shot. CHARACTER ACTION: Continuing seamlessly from the reference image, she demonstrates the concept with precise, confident hand gestures and expressive open palms, then looks straight at the viewer with an encouraging assured smile. Her face is forward-facing, mouth clearly visible, centered in the upper third of the frame throughout all 8 seconds.`
    },
    {
        id: 'D', name: 'The Direct Secret Revelation',
        template: `CAMERA MOVEMENT: Gentle slow dolly. CHARACTER ACTION: She leans slightly forward toward the camera as if sharing an exclusive discovery, gesturing with calm playful confidence, maintaining steady direct eye contact with the viewer. Her face fills the upper half of the frame, fully lit and front-facing for all 8 seconds.`
    },
    {
        id: 'E', name: 'Macro Problem Inspection & Revelation',
        template: `CAMERA MOVEMENT: Slow macro rack-focus from the foreground problem directly to the character. CHARACTER ACTION: The scene begins focused closely on the vivid physical problem in the immediate foreground. She leans into frame, points directly at the issue with an urgent, analytical gesture, then looks straight up at the camera lens with wide knowing eyes, shaking her head before delivering the eye-opening warning. Face and mouth stay clearly visible for lip-sync.`
    },
    {
        id: 'F', name: 'Crash Zoom — Impact Reveal',
        // Crash zoom: rapid snap-zoom in then hold — maximum impact for hook/revelation scenes
        template: `CAMERA MOVEMENT: Rapid crash zoom in at the very start of the clip (0–1 second), then hold tight close-up for the remaining 7 seconds. The snap-zoom creates an immediate visual jolt of energy. CHARACTER ACTION: She reacts to the sudden closeness with wide expressive eyes and a sharp knowing look, then settles into a direct confident address to the camera, gesturing firmly with one hand as she delivers the key revelation. Face fills the upper half of the frame, mouth clearly visible for lip-sync throughout.`
    },
    {
        id: 'G', name: 'Subtle Arc — Triumphant Result',
        // Gentle 20-30° arc — keeps cinematic feel without causing visual artifacts in video generation
        template: `CAMERA MOVEMENT: Gentle slow arc of 20–30 degrees around the character over 8 seconds, camera staying at face level, subject remains centered in frame throughout the subtle arc. The background shifts slightly creating cinematic depth without extreme perspective changes. CHARACTER ACTION: She gestures triumphantly with open hands, presenting the validated result, staying mostly front-facing to camera, wearing a wide victorious smile and radiating proud energy. Face visible and lit at all times for clear lip-sync.`
    },
    {
        id: 'H', name: 'Parallax Depth — Editorial',
        // Parallax lateral movement: foreground moves faster than background — editorial depth
        template: `CAMERA MOVEMENT: Slow lateral parallax slide over 8 seconds — camera drifts sideways so foreground elements (lab tools, glass jars, plants) move faster than the background, creating cinematic depth separation through movement. CHARACTER ACTION: She stands still, centered in the mid-ground, speaking directly to camera with calm charismatic authority. Her stable presence contrasts the moving world around her. She gestures with one hand naturally, nodding with confident clarity. Face remains front-facing and fully lit for perfect lip-sync.`
    }
];
const PIXAR_VIDEO_STYLE = `Mood: vibrant, delightfully clever, energetic, witty, charismatic adult scientist.`;

/** Pick a variant by rotating through the array based on scene index */
function pickVariant(variants, sceneIndex) {
    return variants[sceneIndex % variants.length];
}

/** Pick N random categories + specific objects for prompt diversity */
function getRandomCategories(n = 3) {
    const shuffled = [...OBJECT_CATEGORIES].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, n);
    return picked.map(cat => {
        const objs = [...cat.objects].sort(() => Math.random() - 0.5).slice(0, 3);
        return `${cat.theme}: ${objs.join(', ')}`;
    });
}

// ------------- Phase 1: Voice API (csv666) -------------

// POLLINATIONS, STT, and VOICE LOGIC MOVED TO ai-client.cjs

async function synthesizeDirectElevenLabs(text, voiceId, outputPath, options = {}) {
    const apiKey = process.env.ElevenLabs_API;
    if (!apiKey) throw new Error('[Voice] ElevenLabs_API key not set');

    // Strip bracketed emotion tags (e.g. [direct], [excited]) so voice model doesn't speak them
    const cleanText = (text || '').replace(/\[[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim();

    console.log(`[Voice] Direct ElevenLabs TTS: voice=${voiceId} text=${cleanText.length}chars`);

    const response = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
        {
            text: cleanText,
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
    if (buf.length < 100) throw new Error(`[Voice] Direct ElevenLabs result too small: ${buf.length}B`);
    
    // Check if it's actually audio (ID3 or MPEG sync)
    const isID3  = buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33;
    const isSync = buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0;
    if (!isID3 && !isSync) {
        throw new Error(`[Voice] Direct ElevenLabs returned invalid audio buffer`);
    }

    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, buf);
    console.log(`[Voice] Direct ElevenLabs Saved: ${outputPath} (${buf.length}B)`);
    return outputPath;
}

async function synthesizeCsv666Speech(text, voiceId, outputPath, options = {}) {
    if (process.env.ElevenLabs_API) {
        return await synthesizeDirectElevenLabs(text, voiceId, outputPath, options);
    }
    const apiKey = process.env.VOICEAPI_KEY || process.env.VOICE_AI_KEY;
    if (!apiKey) throw new Error('[Voice] VOICEAPI_KEY not set');

    const templateId = process.env.UUID;
    if (!templateId) throw new Error('[Voice] UUID not set for Lumean Template');

    const LUMEAN_BASE = 'https://api.lumean.app/api/public';

    const hdrs = {
        'X-API-KEY': apiKey,
        'Content-Type': 'application/json'
    };

    const body = {
        template_id: templateId,
        input_text: text
    };

    console.log(`[Voice] POST /orders template=${templateId} text=${text.length}chars`);
    const cr = await axios.post(`${LUMEAN_BASE}/orders`, body, { headers: hdrs });
    const orderId = cr.data && cr.data.data && cr.data.data.id;
    if (!orderId) throw new Error('[Voice] No order_id: ' + JSON.stringify(cr.data).slice(0, 200));
    console.log(`[Voice] order_id=${orderId}`);

    let finalOrder = null;
    for (let n = 0; n < 60; n++) {
        await new Promise(r => setTimeout(r, 2000));
        const sr = await axios.get(`${LUMEAN_BASE}/orders/${orderId}`, { headers: hdrs });
        const st = ((sr.data.data.status || '')).toLowerCase();
        console.log(`[Voice] order=${orderId} status=${st} (${n+1}/60)`);
        
        if (st === 'failed' || st === 'cancelled') throw new Error('[Voice] Task failed: ' + JSON.stringify(sr.data).slice(0, 200));

        if (st === 'completed' || st === 'partially_completed') {
            finalOrder = sr.data.data;
            console.log(`[Voice] Status "${st}" — downloading result`);
            break;
        }
    }

    if (!finalOrder) throw new Error(`[Voice] Timeout: order ${orderId}`);

    const resultItem = finalOrder.result.files[0];
    const resultPath = typeof resultItem === 'string' ? resultItem : resultItem.path;
    const urlRes = await axios.post(`${LUMEAN_BASE}/storage/url`, { path: resultPath }, { headers: hdrs });
    const downloadUrl = urlRes.data.data.url;

    const ar = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
    const buf = Buffer.from(ar.data);
    if (buf.length < 100) throw new Error(`[Voice] Too small: ${buf.length}B`);
    
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, buf);
    console.log(`[Voice] Saved: ${outputPath} (${buf.length}B)`);
    return outputPath;
}

// ------------- Phase 2: Unified TTS (VoiceAPI) -------------
const synthesizeUnifiedSpeech = async (input, language = 'en', voice = 'aeb88254-a426-47da-a7d4-f182195f9fab', model = 'csv666', customDir = null) => {
    // Pick suitable voice based on language
    let activeVoice = voice;
    if (language.toLowerCase() === 'russian' || language.toLowerCase() === 'ru') {
        // "Alex_Ru" (Available Russian template for this key)
        activeVoice = 'aeb88254-a426-47da-a7d4-f182195f9fab';
    } else {
        // "french" (multilingual template, supports English)
        activeVoice = 'eb21f806-58d1-46db-b346-24ea6540d0eb';
    }
    
    return await synthesizeCsv666Speech(input, activeVoice, language, customDir);
};

const CHARACTER_ANCHOR = `A full-body high-end CGI animated humanoid figure rendered in a crystal-clear glass material, fully transparent outer shell revealing an ivory-white internal structural framework inside. The character's face area: two large round glowing yellow eyes with dark pupils, a friendly neutral expression, smooth rounded cranium with no surface detail. The body framework inside the glass silhouette is composed of smooth, polished ivory-colored rigid structural elements — arms, legs, torso core, joints — all anatomically proportioned but stylized for animation. Medical-illustration aesthetic: clean, modern, clinical, bright studio lighting. Style: high-end 3D CGI, physically-based rendering, 8K, cinematic quality. NOT horror, NOT scary, NOT damaged, NOT dark. ABSOLUTE RULES: NO MUSIC. STERNLY FOLLOW text for lip-sync. NO independent translations.`;

// ── TikTok Content Safety Directive ───────────────────────────────────────────
const TIKTOK_SAFETY_DIRECTIVE = `
CONTENT SAFETY RULES (MANDATORY — TikTok Community Guidelines Compliance):
- NEVER give medical advice, diagnoses, treatment recommendations, or drug/supplement suggestions.
- NEVER use the words: "health", "wellness", "diet", "lose weight", "calories", "fat loss", "skinny", "mental health", "therapy", "depression", "anxiety", "medication", "prescription", "cure", "heal", "doctor says", "research shows", "scientifically proven", "doctors don't want you to know".
- NEVER make before/after body transformation claims.
- NEVER reference controlled substances, pharmacies, or medical procedures.
- ALWAYS frame content as: clever everyday tricks, smart home lifehacks, kitchen efficiency, real household budget savings, product crash-tests — NOT health/medical advice.
- Hashtags MUST NOT include: #health #wellness #diet #weightloss #fitness #mentalhealth #medical #doctor #nutrition #cleaneating #bodygoals.
- Hashtags MUST be in French and uniquely tailored to the specific household topic, French stores, and everyday solutions (e.g. #astucedegrandmere #bonplanfrance #actionfrance #nettoyagemaison #economiesauquotidien). NEVER use repetitive generic English tags like #lifehack #diytrick.
`;

// ── Real-time trend search via Tavily / Firecrawl / Web ──────────────────────
const searchTrends = async (langName, mode, season, month, year) => {
    const searchQuery = mode === 'health'
        ? `viral tiktok genius everyday tricks productivity life optimization ${month} ${year} ${langName} trending`
        : `viral tiktok household lifehacks home diy tips ${season} ${month} ${year} ${langName} trending`;

    try {
        console.log(`[Trend Search] Searching web (Tavily/Firecrawl) for trends in ${langName} (${month} ${year})...`);
        const webResults = await searchWeb(searchQuery);
        if (webResults && webResults.length > 50) {
            return webResults;
        }
        console.warn(`[Trend Search] Web results short or empty, calling AI chat...`);
        const trendQuery = mode === 'health'
            ? `What are the top 5 trending everyday life optimization, smart productivity and genius daily tricks topics on TikTok RIGHT NOW in ${month} ${year} for ${langName}-speaking audiences? Return ONLY a short bullet list of trending topics, no explanations.`
            : `What are the top 5 trending lifehack and DIY topics on TikTok RIGHT NOW in ${month} ${year} for ${langName}-speaking audiences? Return ONLY a short bullet list of trending topics, no explanations.`;
        return await ai.chat([{ role: 'user', content: trendQuery }]);
    } catch (e) {
        console.warn(`[Trend Search] Failed: ${e.message}, falling back to seasonal context`);
        return null;
    }
};

// в”Ђв”Ђ РћС‡РёСЃС‚РєР° РїР°РїРєРё Audio РїРµСЂРµРґ РЅРѕРІРѕР№ РіРµРЅРµСЂР°С†РёРµР№ в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
function cleanupAudioDir() {
    const audioDir = path.join(__dirname, 'Audio');
    if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
        return;
    }
    try {
        const files = fs.readdirSync(audioDir);
        let removed = 0;
        for (const file of files) {
            try {
                fs.unlinkSync(path.join(audioDir, file));
                removed++;
            } catch (e) {
                console.warn(`[cleanupAudioDir] РќРµ СѓРґР°Р»РѕСЃСЊ СѓРґР°Р»РёС‚СЊ ${file}: ${e.message}`);
            }
        }
        console.log(`[cleanupAudioDir] РЈРґР°Р»РµРЅРѕ ${removed} С„Р°Р№Р»РѕРІ РёР· Audio/`);
    } catch (e) {
        console.error(`[cleanupAudioDir] РћС€РёР±РєР°: ${e.message}`);
    }
}

// в”Ђв”Ђ Preview re-encoding helper в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function reencodeForPreview(inputPath, sceneIndex) {
    const skeletonDir = path.join(__dirname, 'SkeletonShorts');
    const previewDir = path.join(skeletonDir, 'preview');
    if (!fs.existsSync(previewDir)) fs.mkdirSync(previewDir, { recursive: true });
    const previewPath = path.join(previewDir, `scene_${sceneIndex + 1}.mp4`);
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', inputPath,
            '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
            '-c:a', 'aac', '-b:a', '128k',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-y', previewPath
        ]);
        ffmpeg.on('close', code => {
            const resultPath = code === 0 ? previewPath : inputPath;
            resolve(`media:///${resultPath.replace(/\\/g, '/')}?t=${Date.now()}`);
        });
    });
}

// в”Ђв”Ђ Audio muxing helper в”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђв”Ђ
async function muxAudioIntoVideo(videoPath, audioPath, outputPath) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', [
            '-i', videoPath,
            '-i', audioPath,
            '-c:v', 'copy',
            '-c:a', 'aac', '-b:a', '128k',
            '-shortest', '-y', outputPath
        ]);
        ffmpeg.on('close', code => {
            if (code === 0) resolve(outputPath);
            else reject(new Error(`muxAudioIntoVideo failed with code ${code}`));
        });
    });
}

/**
 * Robust JSON extraction and repair for LLM responses
 */
function repairTruncatedJson(jsonStr) {
    if (!jsonStr) return null;
    let s = jsonStr.trim();
    let inString = false;
    let escaped = false;
    let openBraces = 0;
    let openBrackets = 0;

    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (c === '\\') {
            escaped = true;
            continue;
        }
        if (c === '"') {
            inString = !inString;
            continue;
        }
        if (!inString) {
            if (c === '{') openBraces++;
            else if (c === '}') openBraces = Math.max(0, openBraces - 1);
            else if (c === '[') openBrackets++;
            else if (c === ']') openBrackets = Math.max(0, openBrackets - 1);
        }
    }

    if (inString) s += '"';
    s = s.replace(/,\s*$/, '');
    while (openBrackets > 0) {
        s += ']';
        openBrackets--;
    }
    while (openBraces > 0) {
        s += '}';
        openBraces--;
    }
    return s;
}

function cleanAndParseJSON(raw) {
    if (!raw || typeof raw !== 'string') throw new Error('Empty AI response');
    let str = raw.trim();

    // 1. Remove Markdown code blocks
    str = str.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
    if (str.startsWith('```json')) str = str.slice(7).trim();
    if (str.startsWith('```')) str = str.slice(3).trim();
    if (str.endsWith('```')) str = str.slice(0, -3).trim();

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

    if (startIdx !== -1) {
        let candidate = (endIdx > startIdx) ? str.substring(startIdx, endIdx + 1).trim() : str.substring(startIdx).trim();
        try {
            return JSON.parse(candidate);
        } catch (e) {}

        // Clean trailing commas before closing braces/brackets
        candidate = candidate.replace(/,\s*([\}\]])/g, '$1');
        try {
            return JSON.parse(candidate);
        } catch (e) {}

        // Repair truncated JSON by closing open strings and structures
        const repaired = repairTruncatedJson(candidate);
        if (repaired) {
            try {
                return JSON.parse(repaired);
            } catch (e) {}
            try {
                return JSON.parse(repaired.replace(/,\s*([\}\]])/g, '$1'));
            } catch (e) {}
        }
    }

    throw new Error('Could not parse structural JSON from AI response');
}

/**
 * Sanitizes image generation prompts to eliminate automated Google / G-Labs
 * safety filter triggers (PUBLIC_ERROR_UNSAFE_GENERATION, NSFW, CHILD_SAFETY).
 * Converts domestic private rooms (bathroom, shower, vanity) to clean lab/kitchen workstations,
 * and neutralizes intimate/cosmetic/body words (aloe gel, skin, charming, etc.).
 */
function sanitizePromptForImageSafety(prompt) {
    if (!prompt || typeof prompt !== 'string') return prompt;

    let p = prompt;

    // 1. Sanitize domestic private/intimate spaces to safe laboratory / workshop / studio spaces
    //    NOTE: bare nouns (bathroom, shower, etc.) replace WITHOUT "in a" prefix to avoid double "in a ... in a ..." glitch
    p = p
        .replace(/\bin a warmly lit,? bright bathroom\b/gi, 'in a modern bright kitchen laboratory')
        .replace(/\bin (a|the) bathroom\b/gi, 'in a modern bright kitchen laboratory')
        .replace(/\bbathroom\b/gi, 'kitchen laboratory')
        .replace(/\b(restroom|washroom)\b/gi, 'clean science workshop')
        .replace(/\b(vanity counter|vanity table|vanity)\b/gi, 'clean laboratory counter')
        .replace(/\b(dressing room|powder room)\b/gi, 'creative discovery room')
        .replace(/\bin (a|the) (shower stall|shower cabin|shower)\b/gi, 'in a tiled test basin')
        .replace(/\b(shower stall|shower cabin|shower)\b/gi, 'tiled test basin')
        .replace(/\b(bathtub|tub)\b/gi, 'water testing basin')
        .replace(/\bin (a|the) (bedroom)\b/gi, 'in a studio workspace')
        .replace(/\b(bedroom|bed)\b/gi, 'studio workspace');

    // 2. Sanitize intimate / cosmetic / body trigger words that trigger automated NSFW/sexual filters
    p = p
        .replace(/\b(clear aloe gel sitting in a glass bowl|clear aloe gel|aloe vera gel|aloe gel)\b/gi, 'botanical aloe vera plant extract in a glass beaker')
        .replace(/\b(aloe vera|aloe)\b/gi, 'botanical aloe')
        .replace(/\b(bare skin|naked skin|exposed skin)\b/gi, 'complexion')
        .replace(/\b(rubbing|spreading|massaging)\s+(gel|cream|lotion|oil)\s+(on|onto)\s+skin\b/gi, 'holding a skincare applicator')
        .replace(/\b(on skin|onto skin|on the skin)\b/gi, 'for skincare testing')
        .replace(/\b(naked|nude|undressed|lingerie|underwear|bikini|swimsuit)\b/gi, 'fully clothed')
        .replace(/\b(sexy|sensual|erotic|seductive)\b/gi, 'professional')
        .replace(/\bcharming\b/gi, 'confident professional')
        .replace(/\b(glowing\s+)?(golden\s+)?heart(\s+symbol)?\b/gi, 'diagnostic icon')
        .replace(/\bwhispering\b/gi, 'speaking confidentially')
        .replace(/\bwhisper\b/gi, 'confidential address');

    // 3. Age and character safety (avoid CHILD_SAFETY or ambiguity)
    p = p
        .replace(/\bcute gestures\b/gi, 'expressive confident gestures')
        .replace(/\bcute\b/gi, 'expressive')
        .replace(/\bThe Little Genius\b/gi, 'Génie, the adult woman scientist')
        .replace(/\blittle genius\b/gi, 'adult scientist')
        .replace(/\blittle\b/gi, 'compact')
        .replace(/\bchild\b/gi, 'adult')
        .replace(/\bchildren\b/gi, 'people')
        .replace(/\bteenager\b/gi, 'adult')
        .replace(/\bteen\b/gi, 'adult')
        .replace(/\byoung woman\b/gi, 'adult woman')
        .replace(/\byoung charismatic\b/gi, 'charismatic adult')
        .replace(/\byoung adult\b/gi, 'adult professional')
        .replace(/\byoung\b/gi, 'adult')
        .replace(/\bgirl\b/gi, 'woman')
        .replace(/\bkid\b/gi, 'person')
        .replace(/\bkids\b/gi, 'people');

    // 4. Strip Pixar/cartoon style terms (triggers CHILD_SAFETY classifiers)
    p = p
        .replace(/\bPixar 3D animation style\b/gi, 'high-end 3D CGI render')
        .replace(/\bPixar style\b/gi, 'high-end 3D CGI')
        .replace(/\bPixar\b/gi, 'high-end CGI')
        .replace(/\b3D cartoon animation style\b/gi, 'high-end 3D CGI render')
        .replace(/\bcartoon animation style\b/gi, 'CGI render style')
        .replace(/\bcartoon animation\b/gi, 'CGI render')
        .replace(/\bcartoon\b/gi, 'photorealistic CGI')
        .replace(/\bbright-eyed\b/gi, 'confident')
        .replace(/\bwhimsical\b/gi, 'creative')
        .replace(/\b3D animated\b/gi, '3D CGI')
        .replace(/\banimation style\b/gi, 'CGI render style');

    // 5. Anti-miniaturization: character must NEVER stand on a surface (table, desk, counter, tray, shelf)
    const furnitureRx = 'table|desk|counter|shelf|tray|surface|platform|workbench|countertop|glass surface|glass table|sink|stove|oven|appliance|washing machine|dryer';
    const furnitureRe = new RegExp(furnitureRx, 'i');

    // 5a. "standing/stands/positioned ON furniture" → "on the floor behind"
    p = p
        .replace(new RegExp(`\\bstanding on (a |the )?(${furnitureRx})\\b`, 'gi'), 'standing on the floor behind a $2')
        .replace(new RegExp(`\\bstands on (a |the )?(${furnitureRx})\\b`, 'gi'), 'stands on the floor behind a $2')
        .replace(new RegExp(`\\bpositioned on (a |the )?(${furnitureRx})\\b`, 'gi'), 'standing on the floor behind a $2')
        .replace(new RegExp(`\\bon top of (a |the )?(${furnitureRx})\\b`, 'gi'), 'standing on the floor behind a $2')
        .replace(new RegExp(`\\batop (a |the )?(${furnitureRx})\\b`, 'gi'), 'standing on the floor behind a $2');

    // 5b. "beside/next to/near/by/in front of furniture" → inject "on the floor" for spatial anchoring
    p = p
        .replace(new RegExp(`\\b(stands|standing) (beside|next to|near|by|in front of|alongside|at) (a |the )?(kitchen )?(${furnitureRx})\\b`, 'gi'),
            '$1 on the floor $2 $3$4$5 (the $5 reaches her waist level)')
        .replace(new RegExp(`\\bbeside (a |the )?(kitchen )?(${furnitureRx})\\b`, 'gi'),
            'on the floor beside $1$2$3 (the $3 reaches her waist level)');

    // 5c. Append strict anti-miniaturization footer with explicit scale anchors
    if (!p.includes('NEVER miniaturized') && !p.includes('FULL HUMAN HEIGHT')) {
        p += ` CRITICAL SCALE: The character is a real-size adult woman (170 cm tall) with her FEET PLANTED ON THE FLOOR. The kitchen counter or table reaches her WAIST level. She is NEVER miniaturized, NEVER toy-sized, NEVER placed ON TOP of any furniture or appliance. Camera is at her EYE LEVEL.`;
    }

    // 6. Ensure adult-affirming preamble if not already present
    if (!p.includes('ADULT PERSON') && !p.includes('mature adult') && !p.includes('adult woman')) {
        p = `[Character: mature adult professional woman in her late 20s, fully adult facial features, confident professional demeanor]. ` + p;
    }

    return p;
}

// ── Multi-lingual Topic Domain Engine (Universal Expert Persona & Anti-Contamination System) ──
const DOMAIN_DEFINITIONS = {
    PSYCHOLOGY: {
        id: 'PSYCHOLOGY',
        name: 'Psychologie & Comportement Humain',
        personaTitle: 'experte en psychologie comportementale et décryptage des relations humaines',
        personaVoice: 'direct, bienveillant, perspicace et percutant, comme une amie psychologue qui décode les mécanismes invisibles sans jargon universitaire',
        studioSetting: 'cabinet chaleureux et moderne, bibliothèque élégante avec des ouvrages de sciences cognitives, éclairage doux et intimiste, fauteuil confortable, bureau en bois clair',
        visualProps: 'schéma cognitif sur carnet élégant, métaphores visuelles délicates, sablier design, miroir d\'introspection, tasse de thé fumante, tablette affichant un diagramme comportemental épuré',
        culturalAnchors: 'situations concrètes du quotidien (au bureau, en couple, en famille, dîners entre amis, messages décryptés), expressions authentiques françaises ("charge mentale", "poser ses limites", "effet miroir", "biais invisible", "relations saines")',
        forbiddenContent: 'STRICTLY FORBIDDEN: NEVER mention cleaning products (vinaigre blanc, bicarbonate, javel, calcaire, calcaire incrusté), discount stores (Action, Lidl, Castorama), hardware tools or household chores in this psychology video! Keep it 100% focused on human emotions, relationships, and mindsets.',
        hashtags: '#psychologie #relationshumaines #mentalhealth #developpementpersonnel #emotions #bienetre',
        archetypes: [
            {
                id: 'DECODEUR_PROFIL',
                name: 'Décodeur de Comportement & Signaux Invisibles',
                hookDirective: 'BEHAVIORAL SHOCK & HIDDEN SIGN HOOK: Start Scene 1 immediately with a counter-intuitive psychological tell or relationship dynamic in the first 2 seconds (e.g. "Si quelqu\'un fait ce geste précis quand vous parlez, ce n\'est pas de la timidité : c\'est un mécanisme de protection inconscient..." or "Voici la phrase anodine que 90% des personnes toxiques utilisent au début sans que vous ne remarquiez rien..."). ZERO generic greetings!',
                narrativeArc: 'Behavioral shock hook -> The invisible emotional reflex explained -> Concrete everyday example -> The psychological mechanism behind it -> Actionable boundary / mental shift to protect oneself.',
                tone: 'Perceptive, warm, sharp human behavior investigator'
            },
            {
                id: 'PIEGE_MENTAL',
                name: 'Le Piège Mental & La Libération Émotionnelle',
                hookDirective: 'COGNITIVE TRAP HOOK: Start Scene 1 by exposing a widespread subconscious trap in the first 2 seconds (e.g. "Arrêtez d\'attendre que les autres changent pour vous sentir apaisé : votre cerveau vous joue un tour redoutable..." or "Pourquoi les personnes les plus empathiques attirent toujours le même schéma relationnel ? Voici la réponse scientifique..."). ZERO generic greetings!',
                narrativeArc: 'Cognitive trap hook -> Why we fall into this loop -> The underlying psychological need (security, validation) -> The breakthrough perspective -> Practical exercise to break the loop.',
                tone: 'Empathetic, illuminating, liberating mentor'
            }
        ]
    },
    BOTANY: {
        id: 'BOTANY',
        name: 'Botanique & Soin des Plantes',
        personaTitle: 'experte passionnée en botanique, jardinage urbain et physiologie végétale',
        personaVoice: 'enthousiaste, scientifique mais ultra-accessible, généreuse et précise, expliquant le langage secret des plantes',
        studioSetting: 'véranda lumineuse ou atelier végétalisé verdoyant, étagères remplies de plantes luxuriantes (Monsteras, Ficus, Pothos), terrariums en verre, pots en terre cuite baignés de lumière naturelle',
        visualProps: 'brumisateur en laiton élégant, ciseaux de bouturage professionnels, terreau drainant, éprouvette de bouture en eau, hygromètre de sol, pots en terre cuite',
        culturalAnchors: 'jardineries françaises (Truffaut, Botanic), balcons parisiens ou jardins de ville, secrets de bouturage transmis ("bouturer dans l\'eau", "drainage des racines", "lumière indirecte")',
        forbiddenContent: 'STRICTLY FORBIDDEN: NEVER mention bleach, corrosive chemicals, Linky electricity meters, or unrelated home electronics. Keep it 100% focused on plants, roots, leaves, and green life.',
        hashtags: '#plantesvertes #botanique #urbanjungle #jardinage #conseilplante #monstera',
        archetypes: [
            {
                id: 'SOS_PLANTE',
                name: 'SOS Plante en Détresse / Sauvetage Express',
                hookDirective: 'PLANT RESCUE HOOK: Start Scene 1 with an urgent visual plant emergency in the first 2 seconds (e.g. "Si les feuilles de votre Monstera deviennent molles ou jaunes, n\'arrosez surtout pas : vous êtes en train d\'étouffer les racines !" or "Votre plante perd ses feuilles ? Voici l\'erreur fatale commise par 8 personnes sur 10..."). ZERO generic greetings!',
                narrativeArc: 'Urgent symptom hook -> The common fatal mistake -> Root diagnosis explained -> Step-by-step rescue method -> Spectacular recovery guarantee.',
                tone: 'Passionate botanist, expert plant doctor'
            },
            {
                id: 'SECRET_BOTANIQUE',
                name: 'Secret de Jardinier & Multiplication Végétale',
                hookDirective: 'BOTANICAL SECRET HOOK: Start Scene 1 with a surprising botanical multiplication or growth secret in the first 2 seconds (e.g. "Avec cette simple taille sous le nœud, vous pouvez transformer une seule branche en cinq nouvelles plantes en trois semaines..."). ZERO generic greetings!',
                narrativeArc: 'Surprising growth hook -> The cellular secret of the plant -> Precise demonstration of the technique -> Substrate and light conditions -> Lush green proliferation.',
                tone: 'Generous, curious green enthusiast, botanical mentor'
            }
        ]
    },
    HEALTH_BODY: {
        id: 'HEALTH_BODY',
        name: 'Santé, Corps & Posture',
        personaTitle: 'experte en biomécanique, ergonomie du quotidien et physiologie du mouvement',
        personaVoice: 'dynamique, rassurante, précise et pédagogue, transformant les douleurs du quotidien en mouvements libérateurs',
        studioSetting: 'espace lumineux et épuré dédié au mouvement, parquet clair, modèle anatomique stylisé ou schéma postural, tapis ergonomique, lumière douce énergisante',
        visualProps: 'schéma ergonomique de la colonne vertébrale, balle de massage en liège, coussin lombaire ergonomique, modèle articulaire souple',
        culturalAnchors: 'journées de travail au bureau ou télétravail en France, trajets en transports, ostéopathie et kinésithérapie courante ("débloquer les cervicales", "télétravail sans douleur", "soulager les lombaires")',
        forbiddenContent: 'STRICTLY FORBIDDEN: NEVER mention harsh cleaning detergents, kitchen degreasers, or discount shopping tricks. Keep it 100% focused on body alignment, posture, joints, and muscular wellbeing.',
        hashtags: '#sante #posture #maldedos #ergonomie #etirements #bienetre',
        archetypes: [
            {
                id: 'SOS_POSTURE',
                name: 'SOS Posture & Soulagement Immédiat',
                hookDirective: 'POSTURAL RELIEF HOOK: Start Scene 1 with an immediate physical relief promise in the first 2 seconds (e.g. "Si votre nuque ou vos épaules brûlent après huit heures devant l\'écran, arrêtez de vous craquer le cou : faites ce micromouvement de 30 secondes..." or "Cette mauvaise position assise compresse vos lombaires trois fois plus que la normale..."). ZERO generic greetings!',
                narrativeArc: 'Physical pain hook -> The biomechanical compression explained -> Why standard stretching sometimes worsens tension -> The exact corrective micro-movement -> Immediate decompression felt.',
                tone: 'Ergonomic specialist, caring body mechanics guide'
            }
        ]
    },
    TECH_DIGITAL: {
        id: 'TECH_DIGITAL',
        name: 'Tech, Smartphones & Astuces Digitales',
        personaTitle: 'ingénieure tech, experte en optimisation numérique, smartphones et sécurité quotidienne',
        personaVoice: 'affûtée, curieuse, ultra-technique mais limpide, décortiquant les algorithmes et les paramètres cachés',
        studioSetting: 'bureau tech moderne et épuré, écran haute résolution affichant des visualisations logiques, éclairage d\'ambiance doux, station de travail minimaliste',
        visualProps: 'smartphone haut de gamme en démonstration, tablette avec interface graphique, clé de sécurité élégante, schéma de flux réseau sur écran',
        culturalAnchors: 'opérateurs français (Orange, Free, SFR, Bouygues), forfaits mobiles, box internet, protection des données personnelles (RGPD, cybersécurité)',
        forbiddenContent: 'STRICTLY FORBIDDEN: NEVER mention laundry detergents, vinegar, or grand-mère recipes in this digital tech video. Keep it 100% focused on software, hardware, battery, and digital efficiency.',
        hashtags: '#astucestech #iphone #android #smartphone #cybersecurite #optimisation',
        archetypes: [
            {
                id: 'TECH_CACHE',
                name: 'Paramètre Caché & Optimisation Système',
                hookDirective: 'HIDDEN SETTING HOOK: Start Scene 1 with an unknown critical setting in the first 2 seconds (e.g. "Désactivez ce paramètre caché dans les réglages de votre smartphone dès maintenant : il draine votre batterie et vos données en arrière-plan..."). ZERO generic greetings!',
                narrativeArc: 'Hidden setting hook -> Why manufacturers leave it on -> Exact menu navigation -> The dramatic gain (battery, speed, privacy) -> Final verdict.',
                tone: 'Sharp tech insider, trusted digital optimizer'
            }
        ]
    },
    FINANCE_BUDGET: {
        id: 'FINANCE_BUDGET',
        name: 'Budget, Économies & Consommation',
        personaTitle: 'enquêtrice financière, experte en optimisation du budget des ménages et démasquage des frais cachés',
        personaVoice: 'pragmatique, perspicace, directe, traquant chaque centime gaspillé et révélant les marges abusives',
        studioSetting: 'bureau d\'investigation financière contemporain, tableau blanc avec graphiques de dépenses, classeurs de budget transparents, calculatrice design',
        visualProps: 'calculatrice design, billets et pièces en euros réels (20€, 10€, 2€), factures comparatives, graphiques d\'économies annuelles',
        culturalAnchors: 'fournisseurs et réalités françaises (factures EDF, compteur Linky, banques en ligne, pouvoir d\'achat en France, supermarchés)',
        forbiddenContent: 'STRICTLY FORBIDDEN: NEVER recommend illegal practices or non-existent euro banknotes (like 25€ or 15€). Use only official euro denominations.',
        hashtags: '#budget #economies #pouvoirdachat #argent #bonplanfrance #financespersonnelles',
        archetypes: [
            {
                id: 'BUDGET_FACTURES',
                name: 'Budget Maison & Économies Réelles (EDF, Linky, Prix en €)',
                hookDirective: 'FINANCIAL SHOCK & EXACT € HOOK: Start Scene 1 with a concrete shocking Euro figure within the first 2 seconds (e.g. "Cette mauvaise habitude vous coûte 140 euros par an sans que vous vous en rendiez compte..." or "Pourquoi continuer à payer ces frais bancaires invisibles quand un réglage prend deux minutes ?"). ZERO generic greetings!',
                narrativeArc: 'Financial shock hook -> The invisible money leak explained -> Exact cost comparison in € -> The smart consumer calculation -> Total annual savings in €.',
                tone: 'Pragmatic, savvy consumer advocate, direct budget optimizer'
            },
            {
                id: 'DEMASQUEUR_ARNAQUE',
                name: 'Démasqueur d\'Arnaques & Pièges Commerciaux',
                hookDirective: 'EXPOSÉ & MARKETING TRAP HOOK: Start Scene 1 immediately by exposing a commercial trap, hidden surcharge, or deceptive marketing promise within the first 2 seconds. ZERO generic greetings!',
                narrativeArc: 'Exposé hook with shocking price contrast -> How the commercial bait hooks consumers -> The breakdown unmasking the reality -> The smart alternative that costs 10x less in € -> Final consumer protection score.',
                tone: 'Sharp, fearless consumer advocate, myth-buster protecting the everyday budget'
            }
        ]
    },
    HOUSEHOLD_CLEANING: {
        id: 'HOUSEHOLD_CLEANING',
        name: 'Maison, Entretien & Astuces Pratiques',
        personaTitle: 'scientifique brillante, inventrice et enquêtrice passionnée par les secrets de la matière et de la maison',
        personaVoice: 'pétillante, scientifique, complice et hyper-énergique, passionnée par les réactions chimiques du quotidien et les astuces ingénieuses',
        studioSetting: 'laboratoire moderne chaleureux ou cuisine contemporaine avec plans de travail en bois clair, étagères de verrerie scientifique, ampoules Edison rétro',
        visualProps: 'béchers en verre transparent montrant des réactions moussantes réelles, brosse rotative compacte, flacons doseurs gradués, microfibres de test',
        culturalAnchors: 'magasins discount français (Action, Lidl, E.Leclerc), réalité de l\'eau calcaire en France, astuces de grand-mère vs méthode pro',
        forbiddenContent: 'NEVER use toxic chemical mixes (never mix bleach and acid/vinegar). Keep recipes safe and physically sound.',
        hashtags: '#actionfrance #bonplan #astucedegrandmere #calcaire #nettoyagemaison #economies',
        archetypes: [
            {
                id: 'CRASH_TEST',
                name: 'Crash-Test du Labo / Top ou Flop (Action, Lidl, Amazon)',
                hookDirective: 'CRASH-TEST & INSTANT RESULT HOOK: Start Scene 1 immediately with the test result or bold experiment claim within the first 2 seconds. ZERO generic greetings!',
                narrativeArc: 'Hook with instant result -> The test setup in lab/kitchen -> Reality vs Marketing claim -> Step-by-step experiment -> Honest verdict (Top ou Flop) + score out of 10.',
                tone: 'Curious, investigative, blunt reviewer with high standards'
            },
            {
                id: 'SOS_URGENCE',
                name: 'SOS Urgence & Problème Choc (Anti-Calcaire, Taches, Canapés, Joints)',
                hookDirective: 'CONTRARIAN WARNING / VISUAL DISASTER HOOK: Start Scene 1 with an urgent contrarian warning or extreme macro stain within the first 2 seconds. ZERO generic greetings!',
                narrativeArc: 'The visual nightmare up-close -> Why standard remedies ruin materials -> The scientific/chemical principle (reaction) -> The exact molecular or mechanical solution -> Flawless new-like transformation.',
                tone: 'Authoritative scientist, brilliant household troubleshooter'
            },
            {
                id: 'DUEL_ASTUCES',
                name: 'Duel : Astuce de Grand-Mère vs Méthode Pro / Gadget',
                hookDirective: 'BATTLE / DUEL HOOK: Start Scene 1 with a direct face-off comparison within the first 2 seconds. ZERO generic greetings!',
                narrativeArc: 'The duel setup -> Testing method A (homemade DIY) -> Limitations of method A -> Testing method B -> The ultimate winner and winning combo.',
                tone: 'Fair, playful judge, efficiency obsessed'
            }
        ]
    }
};

function detectTopicDomain(text) {
    if (!text || typeof text !== 'string') {
        return 'HOUSEHOLD_CLEANING';
    }
    const clean = text.toLowerCase();
    if (/(?:psychol|relation|manipulat|toxique|comportement|estime|confiance|angoisse|anxi[eé]t|d[eé]press|trauma|narciss|hypersens|introvert|extravert|mental|inconscient|cerveau|cogniti|empath|personnalit|timid|culpabilit|jalous|attachement|pervers|manipul|психол|отношен|манипул|токсич|самооцен|тревож|депресс|травм|нарцисс|интроверт|экстраверт|эмпат|личность|психотип|вина|ревность|привязанност|мозг|нейро)/i.test(clean)) {
        return 'PSYCHOLOGY';
    }
    if (/(?:sant[eé]|postur|ergonom|douleur|sommeil|vert[eè]bre|colonne|dos\b|cervical|lombar|muscl|articulation|respirat|fatigue|yeux|vision|alimentation|digestion|nutrition|посадк|осанк|эргоном|спин[аеыу]|поясниц|ше[яеию]|позвоноч|мышц|сустав|дыхан|сон\b|бессонниц|усталост|глаз|зрени|пищевар|здоров)/i.test(clean)) {
        return 'HEALTH_BODY';
    }
    if (/(?:smartphon|iph|androi|applicat|logiciel|batterie|stockage|pirat|sécurit|securit|wifi|bluetooth|ordinateur|pc\b|mac\b|windows|mise à jour|cloud|mot de passe|paramètre|parametre|téléphon|box internet|fibre|routeur|смартфон|айфон|андроид|приложен|программ|батаре|памят|парол|безопасн|вайфай|настройк|телефон|компьютер|роутер)/i.test(clean)) {
        return 'TECH_DIGITAL';
    }
    if (/(?:plante|botaniq|fleur|jardin|feuille|racine|terreau|arros|chloroph|monstera|orchidée|orchidee|ficus|pothos|succulent|cactus|boutur|rempot|engrais|parasite|puceron|champignon|horticult|végétal|vegetal|растен|ботан|цвет[оы]|сад\b|листь|корн[еи]|почв|полив|грунт|горшок|фикус|орхиде|черенк|пересад|удобрен|вредител|тля|грибок)/i.test(clean)) {
        return 'BOTANY';
    }
    if (/(?:budget|factur|banqu|épargn|epargn|argent|dépens|depens|euro|edf|linky|abonn|impôt|impot|pouvoir d'achat|crédit|credit|frais|arnaqu|boulanger|supermarch|payer|co[uû]t|prix|payer|бюджет|счет|банк|деньг|рубл|трат|эконом|подписк|налог|кредит|расход|переплат|тариф|цен[аы])/i.test(clean)) {
        return 'FINANCE_BUDGET';
    }
    return 'HOUSEHOLD_CLEANING';
}

/**
 * Universal normalizer for Studio scenes across all LLM models and output variations
 */
function normalizeStudioScenes(parsed, topic, mode, langName) {
    let scenesArray = null;
    const isGenericPlaceholder = (t) => !t || t === 'Screenshot Rules Reference' || t === 'Video Demonstration Reference' || (typeof t === 'string' && t.startsWith('Reference:'));
    let intro = (parsed && (parsed.intro || parsed.title || parsed.topic)) || '';
    if (isGenericPlaceholder(intro)) {
        if (!isGenericPlaceholder(topic)) {
            intro = topic;
        } else {
            intro = '';
        }
    }

    if (Array.isArray(parsed)) {
        scenesArray = parsed;
    } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.scenes)) scenesArray = parsed.scenes;
        else if (Array.isArray(parsed.segments)) scenesArray = parsed.segments;
        else if (Array.isArray(parsed.script?.scenes)) scenesArray = parsed.script.scenes;
        else if (Array.isArray(parsed.script)) scenesArray = parsed.script;
        else if (Array.isArray(parsed.data?.scenes)) scenesArray = parsed.data.scenes;
        else {
            const foundArr = Object.values(parsed).find(Array.isArray);
            if (foundArr) scenesArray = foundArr;
        }
    }

    if (!scenesArray || !Array.isArray(scenesArray) || scenesArray.length === 0) {
        throw new Error("AI output format error: could not find scenes array in response.");
    }

    const processedScenes = scenesArray.map((scene, idx) => {
        let line = '';
        if (typeof scene === 'string') {
            line = scene;
        } else if (scene.line) {
            line = typeof scene.line === 'string' ? scene.line : JSON.stringify(scene.line);
        } else if (scene.text) {
            line = scene.text;
        } else if (scene.dialogue) {
            if (Array.isArray(scene.dialogue)) {
                line = scene.dialogue.map(d => (typeof d === 'string' ? d : (d.line || d.text || ''))).join(' ');
            } else if (typeof scene.dialogue === 'string') {
                line = scene.dialogue;
            }
        } else if (scene.original) {
            line = scene.original;
        } else if (scene.script) {
            line = scene.script;
        }

        // Clean duplicate dialogue
        if (line) {
            const parts = line.split(/\s+/);
            const halfLen = Math.floor(parts.length / 2);
            const firstHalf = parts.slice(0, halfLen).join(' ');
            const secondHalf = parts.slice(halfLen).join(' ');
            if (firstHalf && secondHalf && (firstHalf === secondHalf || secondHalf.includes(firstHalf))) {
                line = firstHalf;
            }
        }

        // Programmatic safety limit: Word count validation for 8-second video (optimal: 18-22 words, soft cap 28 words)
        if (line) {
            const cleanTextNoTags = line.replace(/\[[^\]]+\]/g, '').trim();
            const words = cleanTextNoTags.split(/\s+/).filter(Boolean);
            const MAX_ALLOWED_WORDS = 28;
            if (words.length > MAX_ALLOWED_WORDS) {
                console.warn(`[Studio Scene ${idx + 1}] Line exceeded 8s limit (${words.length} words > ${MAX_ALLOWED_WORDS}). Trimming to fit 8s.`);
                // Extract emotion tag if present at start
                const emotionMatch = line.match(/^(\[[^\]]+\]\s*)/);
                const emotionTag = emotionMatch ? emotionMatch[0].trim() : '';

                // Avoid ending on dangling prepositions/conjunctions
                let trimCount = MAX_ALLOWED_WORDS;
                const danglingRegex = /^(pour|de|du|des|à|dans|sur|avec|sans|et|ou|mais|car|en|par|for|to|of|in|on|at|with|and|or|but)$/i;
                while (trimCount > 15 && danglingRegex.test(words[trimCount - 1])) {
                    trimCount--;
                }

                const trimmedWords = words.slice(0, trimCount);
                let trimmedLine = trimmedWords.join(' ');
                // Ensure proper punctuation at the end
                if (!/[.!?—]$/.test(trimmedLine)) {
                    trimmedLine += ' !';
                }
                // Never append emotion tag to the end of the line
                line = emotionTag ? `${emotionTag} ${trimmedLine}` : trimmedLine;
            }
        }

        const defaultChar = mode === 'health' ? 'Génie' : (mode === 'psychology' ? 'The Psychologist' : (mode === 'business' ? 'Génie' : 'Presenter'));
        let character = (scene && (scene.character || scene.speaker || scene.character_name)) || (mode === 'objects' ? `Talking Object ${idx + 1}` : defaultChar);
        if ((mode === 'health' || mode === 'business') && (!character || character.toLowerCase() === 'presenter' || character.toLowerCase() === 'character')) {
            character = 'Génie';
        }
        if (mode === 'psychology' && (!character || character.toLowerCase() === 'presenter' || character.toLowerCase() === 'character')) {
            character = 'The Psychologist';
        }
        let imageVariant = (scene && scene.imageVariant) || pickVariant(PIXAR_IMAGE_VARIANTS, idx).id;
        let videoVariant = (scene && scene.videoVariant) || pickVariant(PIXAR_VIDEO_VARIANTS, idx).id;

        let rawImagePrompt = (scene && (scene.imagePrompt || scene.image_prompt || scene.description || scene.setting || scene.visual)) || '';
        if (!rawImagePrompt) {
            rawImagePrompt = mode === 'health'
                ? `${CHARACTER_BIBLE_GENIE_RAW}, standing proudly in a warmly-lit inventor's workshop, inspecting tools and materials`
                : mode === 'business'
                ? `${CHARACTER_BIBLE_GENIE_RAW}, standing confidently in a modern boardroom with city skyline, presenting a business strategy`
                : `${character} in its natural environment`;
        } else if ((mode === 'health' || mode === 'business') && !rawImagePrompt.includes('Génie') && !rawImagePrompt.includes('Genie')) {
            rawImagePrompt = `${CHARACTER_BIBLE_GENIE_RAW}, ${rawImagePrompt}`;
        }
        let rawVideoPrompt = (scene && (scene.videoPrompt || scene.video_prompt || scene.motion || scene.animation)) || '';

        // Inject line into videoPrompt if template has placeholder
        if (rawVideoPrompt.includes('[line]') && line) {
            rawVideoPrompt = rawVideoPrompt.replace(/\[line\]/g, line);
        }
        if (rawVideoPrompt.includes('[INSERT ACTUAL DIALOGUE LINE HERE') && line) {
            rawVideoPrompt = rawVideoPrompt.replace(/\[INSERT ACTUAL DIALOGUE LINE HERE[^\]]*\]/g, line);
        }

        const imgVar = mode === 'psychology'
            ? (PSYCH_IMAGE_VARIANTS.find(v => v.id === imageVariant) || PSYCH_IMAGE_VARIANTS[0])
            : mode === 'business'
            ? (BUSINESS_IMAGE_VARIANTS.find(v => v.id === imageVariant) || BUSINESS_IMAGE_VARIANTS[0])
            : (PIXAR_IMAGE_VARIANTS.find(v => v.id === imageVariant) || PIXAR_IMAGE_VARIANTS[0]);
        const vidVar = mode === 'psychology'
            ? (PSYCH_VIDEO_VARIANTS.find(v => v.id === videoVariant) || PSYCH_VIDEO_VARIANTS[0])
            : mode === 'business'
            ? (BUSINESS_VIDEO_VARIANTS.find(v => v.id === videoVariant) || BUSINESS_VIDEO_VARIANTS[0])
            : (PIXAR_VIDEO_VARIANTS.find(v => v.id === videoVariant) || PIXAR_VIDEO_VARIANTS[0]);

        const objectLock = mode === 'objects'
            ? ` CHARACTER: ${character}. ${TALKING_OBJECT_IMAGE_LOCK}`
            : '';

        const voiceDesc = mode === 'health'
            ? `VOICE IDENTITY (MUST match exactly every scene): A single consistent adult woman's voice — confident, articulate, energetic, with a warm melodic timbre and expressive inflections that make every lifehack feel like an exciting discovery. ` +
              `VOCAL QUALITIES: Clear soprano with natural warmth, confident quick-paced delivery with well-timed dramatic pauses before revealing the key trick, genuine enthusiasm and sparkling wit in every word. ` +
              `EMOTIONAL RANGE: Engaging energy when teasing the viewer with a problem, proud confident tone when delivering the solution, warm delighted energy when the trick lands. ` +
              `REFERENCE: Think a charismatic female science presenter and adult inventor — brilliant, fun, and impossible to ignore.`
            : mode === 'psychology'
            ? `VOICE IDENTITY (MUST match exactly every scene): A weathered, gravelly male voice — a man in his late 50s who speaks with the unhurried authority of someone who has seen every human mistake twice. ` +
              `VOCAL QUALITIES: Deep, slightly hoarse timbre, deliberate pacing with meaningful pauses, dry sardonic wit underneath every word, speaks directly like he's calling you out personally. ` +
              `EMOTIONAL RANGE: Blunt and matter-of-fact when stating hard truths, faintly amused when pointing out human predictability, firm and almost impatient when giving advice — like a man who has no patience for excuses. ` +
              `REFERENCE: Think an older seasoned detective mixed with a street philosopher — someone whose advice you didn't ask for but absolutely needed.`
            : mode === 'business'
            ? `VOICE IDENTITY (MUST match exactly every scene): A single consistent adult woman's voice — confident, articulate, passionate, with a warm melodic timbre and engaging inflections that make every business insight feel like a thrilling revelation. ` +
              `VOCAL QUALITIES: Clear soprano with natural authority, measured but dynamic pacing — building tension before each key insight, then delivering it with precision and contagious excitement. ` +
              `EMOTIONAL RANGE: Curious and conspiratorial when setting up the metaphor, sharp and triumphant when revealing the hidden business truth, warm and encouraging when advising the viewer directly. ` +
              `REFERENCE: Think a brilliant TED-talk speaker crossed with a charismatic business mentor — someone who makes complex models feel simple, vivid, and impossible to forget.`
            : `A professional character voice with clear articulation and expressive delivery`;

        const imageBase = mode === 'psychology' ? PSYCH_IMAGE_BASE : (mode === 'business' ? BUSINESS_IMAGE_BASE : PIXAR_IMAGE_BASE);
        const referenceDirective = (mode === 'health' || mode === 'business')
            ? ` The character's face, hair, and appearance strictly match the provided reference image.`
            : '';
        const isMacroInspection = imageVariant === 'E';
        const characterScaleDirective = ` The character stands at full natural human height. STYLE: ${imageBase}`;

        let basePromptForVariant;
        if (isMacroInspection) {
            if (rawImagePrompt && rawImagePrompt.length > 25) {
                basePromptForVariant = `${rawImagePrompt}, cinematic 9:16 vertical macro inspection shot, dramatic atmospheric lighting, sharp focus on the problem, high-end 3D CGI render`;
            } else {
                basePromptForVariant = imgVar.template(character, rawImagePrompt);
            }
        } else if (rawImagePrompt && rawImagePrompt.length > 40 && (rawImagePrompt.includes('standing') || rawImagePrompt.includes('sitting') || rawImagePrompt.includes('holding') || rawImagePrompt.includes('in ') || rawImagePrompt.includes('at '))) {
            // rawImagePrompt is already a rich scene description from the LLM; keep its action/subject and add framing/lighting without room clashes
            basePromptForVariant = `${rawImagePrompt}, cinematic 9:16 vertical portrait composition, atmospheric lighting, sharp focus, high-end 3D CGI render`;
        } else {
            basePromptForVariant = imgVar.template(rawImagePrompt || character);
        }

        let finalImagePrompt = mode === 'psychology'
            ? `${imgVar.template(rawImagePrompt)}. STYLE: ${imageBase}`
            : `${basePromptForVariant}.${objectLock}${referenceDirective}${characterScaleDirective}`;

        finalImagePrompt = sanitizePromptForImageSafety(finalImagePrompt);
        // Clean bracketed emotion tags from spoken dialogue for video and speech synthesis
        const spokenLine = line.replace(/\[[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim();
        const cleanRawVideoPrompt = rawVideoPrompt.replace(/\[[a-zA-Z_\s-]+\]\s*/g, '');

        const isOutro = idx === scenesArray.length - 1;
        let templateToUse = vidVar.template;
        let processedRawVideoPrompt = cleanRawVideoPrompt;

        // Ensure any embedded LIP-SYNC line matches the exact spokenLine word-for-word
        if (/LIP-SYNC:\s*"[^"]*"/i.test(processedRawVideoPrompt)) {
            processedRawVideoPrompt = processedRawVideoPrompt.replace(/LIP-SYNC:\s*"[^"]*"/gi, `LIP-SYNC: "${spokenLine}"`);
        }

        if (isOutro && mode !== 'psychology') {
            // Dedicated stable camera/action template for Outro scene (no eureka temple-tapping)
            templateToUse = `CAMERA MOVEMENT: Steady eye-level mid-shot with a subtle slow push-in. CHARACTER ACTION: She looks directly into the camera with a warm engaging smile, making an encouraging forward gesture toward the viewer with an open palm and a friendly nod («link in bio» / call-to-action), guiding them with clear confidence. Her face stays centered and fully visible throughout all 8 seconds.`;

            // Sanitize finger counting in video prompts (causes severe AI hand deformities in diffusion video models)
            processedRawVideoPrompt = processedRawVideoPrompt
                .replace(/\bcounting (?:the )?(?:three )?(?:simple )?steps on (?:her )?fingers[^.]*\./gi, 'pointing warmly forward toward the viewer with an encouraging smile.')
                .replace(/\bone finger raised[^.]*\./gi, '')
                .replace(/\btwo fingers for[^.]*\./gi, '')
                .replace(/\bthree fingers for[^.]*\./gi, '')
                .replace(/\banimation\b/gi, '3D CGI render');
        }

        const noPhantomDirective = `STRICT: Seamless visual continuation from the reference image. The character's hands, clothes, and environment must match the reference image exactly — do NOT introduce or hallucinate new unreferenced handheld objects, electrical devices, or phantom tools.`;
        const finalVideoPrompt = `${mode === 'psychology' ? 'Mood: raw, direct, street-wise, unflinching.' : PIXAR_VIDEO_STYLE} CHARACTER: ${character} — the animated protagonist, present throughout all 8 seconds. ${templateToUse} ${processedRawVideoPrompt} ${noPhantomDirective} AUDIO TRACK: ${voiceDesc} speaking in ${langName} language exactly: "${spokenLine}". LIP-SYNC: Accurate mouth movement synchronized to the audio.`;

        return {
            id: idx + 1,
            character,
            line,
            imageVariant,
            videoVariant,
            imagePrompt: finalImagePrompt,
            video_prompt: finalVideoPrompt,
            videoPrompt: finalVideoPrompt
        };
    });

    if (!intro) {
        if (processedScenes[0] && processedScenes[0].line) {
            intro = processedScenes[0].line.replace(/\[[^\]]+\]/g, '').slice(0, 45).trim() + ' 💡';
        } else {
            intro = 'Astuce Révélée 💡';
        }
    }

    let socialPost = (parsed && typeof parsed.socialPost === 'object') ? { ...parsed.socialPost } : null;
    if (!socialPost) {
        socialPost = {
            title: intro,
            description: '',
            hashtags: ''
        };
    }
    if (isGenericPlaceholder(socialPost.title)) {
        socialPost.title = intro;
    }

    if (!socialPost.description || socialPost.description.includes('Découvrez cette astuce et dites-moi')) {
        const detectedDomainKey = detectTopicDomain((topic || '') + ' ' + (intro || ''));
        const domainDescriptions = {
            PSYCHOLOGY: "Comprendre ce mécanisme invisible change vos relations. Et vous, avez-vous déjà vécu cette situation ? Dites-le moi en commentaire ! 👇",
            BOTANY: "Ce geste simple sauve vos plantes en quelques jours. Et vous, quelle est votre astuce préférée ? Partagez en commentaire ! 👇",
            HEALTH_BODY: "Adoptez ce réflexe pour soulager vos tensions au quotidien. Et vous, ressentez-vous cette gêne ? Dites-le moi en commentaire ! 👇",
            TECH_DIGITAL: "Ce paramètre caché change tout sur votre smartphone. Vous connaissiez cette astuce ? Dites-le moi en commentaire ! 👇",
            FINANCE_BUDGET: "Cette astuce vous évite de jeter de l'argent par les fenêtres. Vous faites aussi cette erreur ? Dites-le moi en commentaire ! 👇",
            HOUSEHOLD_CLEANING: "Découvrez cette astuce et dites-moi en commentaire si vous la connaissiez ! 👇"
        };
        socialPost.description = domainDescriptions[detectedDomainKey] || domainDescriptions.HOUSEHOLD_CLEANING;
    }

    // Clean and validate French hashtags — eliminate any legacy English AI slop
    let rawTags = (socialPost.hashtags || '').replace(/\([^)]*\)/g, '').replace(/\s{2,}/g, ' ').trim();
    const isLegacyEnglish = /#(?:lifehack|geniustrick|everydaytips|homehacks|smartliving|diytrick|productivityhack|smartideas)\b/i.test(rawTags);

    if (!rawTags || isLegacyEnglish || !rawTags.includes('#')) {
        if (mode === 'business') {
            const bizTopicTags = ['#entrepreneuriat', '#businessmodel', '#strategie', '#argent', '#succes', '#mindset'];
            rawTags = bizTopicTags.join(' ');
        } else {
            const detectedDomainKey = detectTopicDomain((topic || '') + ' ' + (intro || ''));
            const domainDef = DOMAIN_DEFINITIONS[detectedDomainKey];
            const baseTags = domainDef ? domainDef.hashtags.split(' ') : ['#bonplan', '#systemed', '#faitmaison', '#economies'];
            const frenchTopicTags = [...baseTags];
            const lowerTopic = ((topic || '') + ' ' + (intro || '')).toLowerCase();
            if (lowerTopic.includes('calcaire') || lowerTopic.includes('robinet') || lowerTopic.includes('vinaigre')) frenchTopicTags.unshift('#calcaire', '#anticalcaire');
            if (lowerTopic.includes('nettoy') || lowerTopic.includes('propre') || lowerTopic.includes('menage')) frenchTopicTags.unshift('#nettoyagemaison', '#menage');
            if (lowerTopic.includes('action') || lowerTopic.includes('magasin')) frenchTopicTags.unshift('#actionfrance', '#trouvaillesaction');
            if (lowerTopic.includes('cuisine') || lowerTopic.includes('plat') || lowerTopic.includes('recette')) frenchTopicTags.unshift('#astucecuisine', '#cuisine');
            if (lowerTopic.includes('linge') || lowerTopic.includes('machine') || lowerTopic.includes('vetement') || lowerTopic.includes('lave')) frenchTopicTags.unshift('#astucelinge', '#lavelinge');
            if (lowerTopic.includes('jardin') || lowerTopic.includes('plante')) frenchTopicTags.unshift('#jardinage', '#plantes');
            if (lowerTopic.includes('facture') || lowerTopic.includes('edf') || lowerTopic.includes('electricite')) frenchTopicTags.unshift('#factureedf', '#economiedenergie');
            if (lowerTopic.includes('peau') || lowerTopic.includes('serum') || lowerTopic.includes('beaute') || lowerTopic.includes('creme')) frenchTopicTags.unshift('#soinvisage', '#beauteauquotidien');
            if (lowerTopic.includes('arnaque') || lowerTopic.includes('piege') || lowerTopic.includes('marketing') || lowerTopic.includes('prix') || lowerTopic.includes('argent') || lowerTopic.includes('faux')) {
                frenchTopicTags.unshift('#arnaque', '#piegemarketing', '#consommateur');
            }
            rawTags = Array.from(new Set(frenchTopicTags)).slice(0, 6).join(' ');
        }
    }
    socialPost.hashtags = rawTags;

    return {
        intro,
        socialPost,
        scenes: processedScenes
    };
}

/**
 * Fallback parser in case AI returns non-JSON or heavily broken text.
 * Strictly prevents JSON keys/syntax from ever leaking into dialogue lines.
 * Retains character identity (Génie for health, The Psychologist for psychology),
 * and recovers imagePrompt/videoPrompt from damaged JSON blocks whenever possible.
 */
function fallbackExtractScenes(raw, topic, mode, langName) {
    if (!raw || typeof raw !== 'string') throw new Error("AI failed to generate structural script.");

    // Strict guard against upstream policy refusal messages disguised as text
    if (/(?:The prompt could not be submitted|violate Google's|sensitive words that violate|generative-ai\/use-policy|ai\.google\.dev\/gemini-api\/docs\/troubleshooting|Blocked by safety policy|Safety filter triggered)/i.test(raw)) {
        throw new Error("ИИ заблокировал запрос по политике безопасности. Пожалуйста, измените формулировку темы или референса.");
    }

    const defaultChar = mode === 'health' ? 'Génie' : (mode === 'psychology' ? 'The Psychologist' : (mode === 'business' ? 'Génie' : 'Presenter'));

    // 1. First attempt: recover full structured scene blocks ({ "id": ..., "line": ..., "imagePrompt": ... })
    // Even if outer JSON braces or arrays are broken, individual scene objects are often well-formed.
    const sceneBlockRegex = /\{[^{}]*"(?:line|dialogue|text)"\s*:[^{}]*\}/gs;
    const recoveredScenes = [];
    let blockMatch;
    let blockIdx = 0;
    while ((blockMatch = sceneBlockRegex.exec(raw)) !== null) {
        const block = blockMatch[0];
        const lineMatch = block.match(/"(?:line|dialogue|text)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
        if (!lineMatch) continue;
        const lineText = lineMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        if (lineText.length < 5 || lineText.includes('":') || lineText.endsWith('{') || lineText.endsWith('[')) continue;

        blockIdx++;
        const charMatch = block.match(/"(?:character|speaker|character_name)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
        let charVal = charMatch ? charMatch[1].replace(/\\"/g, '"').trim() : defaultChar;
        if (mode === 'health' && (!charVal || charVal.toLowerCase() === 'presenter' || charVal.toLowerCase() === 'character')) {
            charVal = 'Génie';
        }

        const imgVarMatch = block.match(/"imageVariant"\s*:\s*"([A-I])"/i);
        const vidVarMatch = block.match(/"videoVariant"\s*:\s*"([A-H])"/i);
        const imgPromptMatch = block.match(/"(?:imagePrompt|image_prompt)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
        const vidPromptMatch = block.match(/"(?:videoPrompt|video_prompt)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);

        recoveredScenes.push({
            id: blockIdx,
            character: mode === 'objects' ? `Talking Object ${blockIdx}` : charVal,
            line: lineText,
            imageVariant: imgVarMatch ? imgVarMatch[1] : undefined,
            videoVariant: vidVarMatch ? vidVarMatch[1] : undefined,
            imagePrompt: imgPromptMatch ? imgPromptMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim() : undefined,
            videoPrompt: vidPromptMatch ? vidPromptMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim() : undefined
        });
    }

    if (recoveredScenes.length >= 3) {
        console.log(`[Studio] Recovered ${recoveredScenes.length} structured scenes with prompts from damaged JSON output.`);
        return normalizeStudioScenes({ intro: topic, scenes: recoveredScenes }, topic, mode, langName);
    }

    // 2. Second attempt: extract dialogue lines directly from JSON key-values
    const jsonLines = [];
    const lineRegex = /"(?:line|dialogue|text)"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let m;
    while ((m = lineRegex.exec(raw)) !== null) {
        const lineText = m[1].replace(/\\"/g, '"').replace(/\\n/g, ' ').trim();
        if (lineText.length > 5 && !lineText.includes('":') && !lineText.endsWith('{') && !lineText.endsWith('[')) {
            jsonLines.push(lineText);
        }
    }
    if (jsonLines.length >= 3) {
        console.log(`[Studio] Recovered ${jsonLines.length} dialogue lines from damaged JSON output.`);
        const scenes = jsonLines.map((line, idx) => ({
            id: idx + 1,
            character: mode === 'objects' ? `Talking Object ${idx + 1}` : defaultChar,
            line: line
        }));
        return normalizeStudioScenes({ intro: topic, scenes }, topic, mode, langName);
    }

    // 3. Otherwise plain text extraction — strictly filter out JSON keys, brackets and braces!
    const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const extractedLines = [];
    for (const l of lines) {
        const cleaned = l.replace(/^[-*•\d\.\)\s]+/, '').replace(/^Scene\s*\d+[:\-]?\s*/i, '').trim();
        const isJsonSyntax =
            cleaned.startsWith('{') || cleaned.startsWith('}') ||
            cleaned.startsWith('[') || cleaned.startsWith(']') ||
            cleaned.endsWith('{') || cleaned.endsWith('[') ||
            cleaned.startsWith('```') ||
            cleaned.toLowerCase().startsWith('output json') ||
            /^"(?:intro|socialPost|title|description|hashtags|scenes|id|character|imagePrompt|videoPrompt)"\s*:/.test(cleaned);

        if (cleaned.length > 8 && !isJsonSyntax) {
            const unquoted = cleaned.replace(/^["']|["']$/g, '').trim();
            if (unquoted.length > 8) {
                extractedLines.push(unquoted);
            }
        }
    }

    if (extractedLines.length === 0) {
        throw new Error("AI failed to generate structural script.");
    }

    const maxFallbackScenes = mode === 'business' ? 25 : 14;
    const scenes = extractedLines.slice(0, maxFallbackScenes).map((line, idx) => ({
        id: idx + 1,
        character: mode === 'objects' ? `Talking Object ${idx + 1}` : defaultChar,
        line: line
    }));

    return normalizeStudioScenes({ intro: topic, scenes }, topic, mode, langName);
}

/**
 * Saves script.json, prompts.json and prompts.txt into the project folder.
 */
function saveStudioProjectPrompts(projectFolder, scriptData, mode, topic, language, amazonProduct = null) {
    if (!projectFolder || !scriptData) return;
    try {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        const projectDir = path.join(skeletonDir, projectFolder);
        if (!fs.existsSync(projectDir)) {
            fs.mkdirSync(projectDir, { recursive: true });
        }

        // 1. Machine-readable script.json
        const scriptJsonPath = path.join(projectDir, 'script.json');
        fs.writeFileSync(scriptJsonPath, JSON.stringify(scriptData, null, 2), 'utf8');

        // 2. Structured prompts.json
        const promptsJsonPath = path.join(projectDir, 'prompts.json');
        const promptsMeta = {
            topic: topic || scriptData.intro || '',
            mode: mode || 'health',
            language: language || '',
            createdAt: new Date().toISOString(),
            socialPost: scriptData.socialPost || null,
            amazonProduct: amazonProduct ? {
                code: amazonProduct.code,
                title: amazonProduct.title,
                category: amazonProduct.category,
                img: amazonProduct.img || `img/prod_${amazonProduct.code}.jpg`,
                url: amazonProduct.amazonUrl
            } : null,
            scenes: (scriptData.scenes || []).map((s, idx) => ({
                id: s.id || idx + 1,
                character: s.character || '',
                line: s.line || '',
                imageVariant: s.imageVariant || '',
                videoVariant: s.videoVariant || '',
                imagePrompt: s.imagePrompt || '',
                videoPrompt: s.videoPrompt || s.video_prompt || ''
            }))
        };
        fs.writeFileSync(promptsJsonPath, JSON.stringify(promptsMeta, null, 2), 'utf8');

        // 3. Human-readable prompts.txt
        const promptsTxtPath = path.join(projectDir, 'prompts.txt');
        const modeTitle = mode === 'health'
            ? 'AI GENIETALK'
            : (mode === 'psychology'
                ? 'AI PSYCHOLOGY'
                : (mode === 'business'
                    ? 'AI BUSINESSTALK'
                    : 'AI OBJECTWARS'));
        let txtContent = `========================================================================\n`;
        txtContent += `${modeTitle} — GENERATION PROMPTS\n`;
        txtContent += `========================================================================\n`;
        txtContent += `Topic: ${topic || scriptData.intro || 'Untitled'}\n`;
        txtContent += `Mode: ${mode || 'health'}\n`;
        if (language) txtContent += `Language: ${language}\n`;
        txtContent += `Folder: ${projectFolder}\n`;
        txtContent += `Generated: ${new Date().toLocaleString()}\n`;
        if (amazonProduct) {
            txtContent += `------------------------------------------------------------------------\n`;
            txtContent += `🛒 AMAZON SHOWCASE PRODUCT: #${amazonProduct.code} — ${amazonProduct.title}\n`;
            if (amazonProduct.amazonUrl) txtContent += `🔗 Affiliate URL: ${amazonProduct.amazonUrl}\n`;
            txtContent += `🏷️ Keypad Code: ${amazonProduct.code} (silom2000.github.io/mes-trouvailles/#${amazonProduct.code})\n`;
        }
        if (scriptData.socialPost) {
            txtContent += `------------------------------------------------------------------------\n`;
            txtContent += `📱 SOCIAL POST\n`;
            if (scriptData.socialPost.title) txtContent += `Title: ${scriptData.socialPost.title}\n`;
            if (scriptData.socialPost.description) txtContent += `Description: ${scriptData.socialPost.description}\n`;
            if (scriptData.socialPost.hashtags) txtContent += `Hashtags: ${scriptData.socialPost.hashtags}\n`;
        }
        txtContent += `========================================================================\n\n`;

        (scriptData.scenes || []).forEach((scene, idx) => {
            const num = scene.id || idx + 1;
            const char = scene.character || 'Character';
            const vidPrompt = scene.videoPrompt || scene.video_prompt || '';
            txtContent += `🎬 SCENE #${num} (${char})\n`;
            txtContent += `------------------------------------------------------------------------\n`;
            if (scene.line) {
                txtContent += `🗣 Dialogue: "${scene.line}"\n\n`;
            }
            txtContent += `🖼️ IMAGE PROMPT:\n${scene.imagePrompt || ''}\n\n`;
            txtContent += `🎬 VIDEO PROMPT:\n${vidPrompt}\n`;
            txtContent += `------------------------------------------------------------------------\n\n`;
        });

        fs.writeFileSync(promptsTxtPath, txtContent, 'utf8');
        console.log(`[Studio Prompts] ✅ Successfully saved script.json, prompts.json and prompts.txt to: ${projectDir}`);
    } catch (e) {
        console.error(`[Studio Prompts] ❌ Error saving prompts to ${projectFolder}:`, e.message);
    }
}

/**
 * Dynamically generates 4 viral, context-adaptive 9:16 vertical TikTok/Shorts cover prompts
 * using Gemini/LLM, picking 4 diverse archetypes from a rich library of 8 viral concepts.
 * Tailors setting, props, French headline hook, and emotion directly to the actual video narrative.
 */
async function generateSmartCoverPrompts({ topic, amazonProduct, script, mode, provider = 'gemini', event }) {
    if (!ai || !ai.chat) return null;

    let hookSnippet = '';
    let sceneSummary = '';
    if (script && script.scenes && script.scenes.length > 0) {
        hookSnippet = (script.scenes[0].line || '').replace(/\[.*?\]/g, '').trim();
        sceneSummary = script.scenes.slice(0, 6).map(s => `Scene ${s.id}: "${(s.line || '').replace(/\[.*?\]/g, '').trim()}"`).join('\n');
    }

    const hasAmazon = !!amazonProduct;
    const amazonContext = hasAmazon
        ? `REAL PHYSICAL AMAZON PRODUCT INCLUDED: "${amazonProduct.title}" (Code #${amazonProduct.code}, Category: ${amazonProduct.category}). Quote: "${amazonProduct.quote}". Feature this exact product in the hands of the character with its exact shape and label.`
        : `NO COMMERCIAL PRODUCT: This video has NO commercial product.
STRICT MANDATORY BAN: Do NOT invent random electronics, electrical shavers, hair clippers, vacuum cleaners, carpet cleaners, or cleaning spray bottles! Use ONLY the real narrative props and visual metaphors from the script (e.g. 5 miniature ponds diorama, scale weighing fish vs cash, golden trophy, poultry crate, digital price tag displaying '450 €', restaurant menu, cash banknotes, detective pinboard, Linky electric meter, etc.).`;

    const systemPrompt = `You are a world-class creative director specializing in viral 9:16 vertical TikTok / YouTube Shorts thumbnail covers.
Design 4 radically distinct, high-CTR, click-worthy cover concepts for a 9:16 vertical video featuring "Génie" — a 170cm tall adult woman scientist, investigator, and educator (high-end photorealistic 3D CGI render, appearance strictly from reference image).

ARCHETYPE LIBRARY (Select 4 DIFFERENT archetypes from this list for maximum diversity and surprise):
1. "investigation_board" (Детективное расследование) — Génie in her analytical workshop in front of a corkboard with interconnected photos, red yarn, and documents exposing the trick.
2. "visual_paradox" (Визуальный парадокс) — A striking visual comparison or balance scale (e.g. weighing bait vs hidden cost, price tag comparison, miniature diorama).
3. "dramatic_split" (Смысловой контраст) — Split composition showing the marketing illusion vs the brutal truth (e.g. "Ce qu'on vous promet" vs "Ce qu'on vous vend").
4. "price_shock" (Ценовой шок / Скрытые траты) — Génie reacting with wide eyes in disbelief in front of an illuminated digital price tag or bill revealing how much viewers lose.
5. "hero_metaphor" (Символ победы или метафора) — Génie holding the core symbolic physical prop from the story (e.g. golden trophy, miniature pond model, or Amazon product if specified) with a triumphant smirk.
6. "insider_whisper" (Закрытый инсайд / Секретное досье) — Intimate 3/4 portrait, conspiratorial whisper or index finger to lips, holding a confidential blueprint or test report folder.
7. "direct_warning" (Прямое предупреждение / Пойманы с поличным) — Génie pointing urgently at the camera with an eye-opening, direct address: "Vous vous faites avoir !".
8. "lab_crashtest" (Краш-тест лаборатории) — Analytical testing workbench actively dissecting the mechanism with glowing diagnostic tools.

STRICT DESIGN RULES:
1. PROPS MUST MATCH THE SCRIPT: Use ONLY the real items, concepts, and metaphors from the script. Never insert random cleaning products, shavers, or appliances!
2. SHORT FRENCH HOOK TEXT: Each cover must include a punchy, bold 2-4 word French headline (e.g. "L'ARNAQUE DES 5 ÉTANGS !", "450 € DANS LE VENT ?", "LE VRAI PIÈGE DÉVOILÉ", "OÙ VA VOTRE ARGENT ?"). Bold white typography with subtle drop shadow, placed in upper or lower third.
3. CHARACTER CONSISTENCY: Always specify "Génie — a mature adult woman scientist in her late 20s, high-end photorealistic 3D CGI render, appearance strictly from reference image, full human height (170 cm), feet on the floor".
4. COMPOSITION: Strict vertical 9:16 portrait orientation, cinematic dramatic lighting (warm amber key light, cool background bokeh), razor-sharp focus on the subject.

Output format: Return ONLY a valid JSON array of 4 objects:
[
  {
    "id": 0,
    "styleId": "investigation_board",
    "styleTitle": "Доска расследования",
    "badge": "Расследование",
    "description": "Краткое описание вирусного крючка на русском",
    "hookText": "L'ARNAQUE DES 5 ÉTANGS",
    "prompt": "STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. professional 8K character render, high-end photorealistic 3D CGI, cinematic 9:16 vertical framing, character appearance strictly from the provided reference image. Génie — a mature adult woman scientist in her late 20s, full human height (170 cm), feet on the floor. [Detailed scene description with specific props, setting, lighting, emotion]. BOLD LARGE CINEMATIC TEXT OVERLAY in French: \\"[hookText]\\" in large bold white sans-serif typography with subtle drop shadow, positioned in upper third of frame. STYLE: high-end 3D CGI render, photorealistic lighting and materials, warm studio lighting. NOT: plastic skin, mannequin, deformed fingers, extra limbs, blurry, dark murky, 2d cartoon, random tools, electrical shavers, cleaning bottles."
  }
]`;

    const userPrompt = `Generate 4 viral cover prompts for:
Mode: ${mode}
Topic: "${topic}"
Core Hook: "${hookSnippet}"
Script Excerpt:
${sceneSummary}

${amazonContext}

Ensure the 4 covers are completely distinct, have authentic French hooks, and feature ONLY the real props and themes from this specific video!`;

    const raw = await ai.chat([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
    ], true, provider);

    const parsed = cleanAndParseJSON(raw);
    if (Array.isArray(parsed) && parsed.length >= 4) {
        return parsed.slice(0, 4).map((item, idx) => ({
            id: idx,
            styleId: item.styleId || `custom_${idx}`,
            styleTitle: item.styleTitle || `Вариант #${idx + 1}`,
            badge: item.badge || 'Обложка',
            description: item.description || '',
            hookText: item.hookText || '',
            prompt: sanitizePromptForImageSafety(item.prompt)
        }));
    }
    return null;
}

/**
 * Robust parametric fallback if LLM cover generation is unavailable.
 * Inspects topic and script to construct 4 context-adaptive viral covers
 * with authentic French hooks and strictly matching props (NO random shavers or bottles!).
 */
function buildDynamicContextualCovers({ topic, amazonProduct, script, mode }) {
    const baseQuality = 'professional 8K character render, high-end photorealistic 3D CGI, cinematic 9:16 vertical framing, character appearance strictly from the provided reference image';
    const baseNegative = 'NOT: plastic skin, mannequin, oversaturated, deformed fingers, extra limbs, blurry, dark murky, 2d cartoon, random tools, electrical shavers, cleaning bottles';

    const fullText = `${topic || ''} ${(script && script.intro) || ''} ${((script && script.scenes) || []).map(s => s.line || '').join(' ')}`.toLowerCase();

    // Extract short French hook line from script or topic
    let hookLine = '';
    if (script && script.scenes && script.scenes.length > 0) {
        hookLine = (script.scenes[0].line || '').replace(/\[.*?\]/g, '').trim();
    } else if (topic) {
        hookLine = topic;
    }
    const shortHook = hookLine.length > 50 ? hookLine.slice(0, 47) + '...' : hookLine;

    // Detect domain
    const isDebunkOrBusiness = mode === 'business' ||
        fullText.includes('marketing') || fullText.includes('arnaque') || fullText.includes('piege') ||
        fullText.includes('etang') || fullText.includes('profit') || fullText.includes('marge') ||
        fullText.includes('prix') || fullText.includes('argent') || fullText.includes('client') ||
        fullText.includes('vente') || fullText.includes('business') || fullText.includes('cout') ||
        fullText.includes('raquer') || fullText.includes('pigeon');

    const isEnergy = fullText.includes('linky') || fullText.includes('edf') ||
        fullText.includes('electricite') || fullText.includes('facture') || fullText.includes('chauffage');

    const isFood = fullText.includes('cuisine') || fullText.includes('recette') ||
        fullText.includes('plat') || fullText.includes('aliment') || fullText.includes('frigo') || fullText.includes('manger');

    const isCleaning = !amazonProduct && (fullText.includes('nettoy') || fullText.includes('tache') ||
        fullText.includes('graisse') || fullText.includes('calcaire') || fullText.includes('propre'));

    if (amazonProduct) {
        const prodTitle = amazonProduct.title;
        const prodCode = `#${amazonProduct.code}`;
        return [
            {
                id: 0,
                styleId: 'product_hero',
                styleTitle: 'Герой Продукта',
                badge: `Товар ${prodCode}`,
                description: `Крупный план товара ${prodTitle} в руках Génie с размытым фоном лаборатории`,
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Extreme close foreground perspective, Sony A7R V 85mm GM f/1.4 look, ${baseQuality}. Génie stands at full height (170 cm) holding directly towards camera the authentic device: "${prodTitle}" (Amazon ${prodCode}) with prominent glowing badge "${prodCode}". Razor-sharp foreground focus with creamy bokeh. Génie winks playfully with a confident thumbs-up. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "LA PÉPITE DU LABO !" in white bold typography with golden glow. Studio commercial lighting, crisp rim light, luxury vibrant colors. ${baseNegative}.`
            },
            {
                id: 1,
                styleId: 'before_after',
                styleTitle: 'Контраст До / После',
                badge: 'До / После',
                description: 'Разделенный экран: проблема слева и идеальный результат справа с товаром',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Dynamic Dutch angle 12 degrees split-frame composition, ${baseQuality}. On the left side: heavily stained problem area. On the right side: pristine, gleaming, miraculously clean transformation achieved with "${prodTitle}". Génie stands between them smiling proudly, pointing to the sparkling clean side. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "AVANT / APRÈS : LE CHOC !" in bold condensed typography. Razor-sharp micro-textures, glossy reflections. ${baseNegative}.`
            },
            {
                id: 2,
                styleId: 'eureka_discovery',
                styleTitle: 'Шок-открытие',
                badge: 'Любопытство',
                description: 'Широко распахнутые глаза, восторг от найденного решения',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Close-up portrait, ${baseQuality}, looking straight into camera with mouth open and wide expressive eyes in absolute amazement, holding up "${prodTitle}" with sparkling highlight rays. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "ÇA MARCHE VRAIMENT !" in bold white typography with drop shadow. Dynamic volumetric light rays, warm amber key light, vibrant cool cyan bokeh background. ${baseNegative}.`
            },
            {
                id: 3,
                styleId: 'insider_tip',
                styleTitle: 'Заговорщический секрет',
                badge: 'Секрет инсайдера',
                description: 'Таинственный жест «Тссс!», призыв узнать закрытый лайфхак',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Intimate eye-level portrait, ${baseQuality}. Génie leans forward towards viewer with her index finger gently held to her lips in a mysterious "shhh!" gesture, intense knowing eye contact, with "${prodTitle}" resting visibly on the counter next to her. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "LE SECRET DU FABRICANT" in bold italic typography. Cinematic moody lighting, warm golden hour highlights. ${baseNegative}.`
            }
        ].map(item => ({ ...item, prompt: sanitizePromptForImageSafety(item.prompt) }));
    }

    if (isDebunkOrBusiness) {
        return [
            {
                id: 0,
                styleId: 'investigation_board',
                styleTitle: 'Доска расследования',
                badge: 'Расследование',
                description: 'Génie у доски улик с фото, красными нитями и схемой ловушки',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Génie stands at full adult height (170 cm) in her diagnostic investigation laboratory, turning toward camera with a sharp triumphant smirk. Behind her is a large forensic pinboard filled with connected photos of the trick, diagrams, price tags, and bright red interconnected threads linking the secret scam. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "L'ARNAQUE DÉVOILÉE !" displayed prominently in the upper third in large bold white sans-serif font with subtle dark drop shadow. Cinematic forensic investigation lighting, warm amber key light, cool background bokeh. ${baseNegative}.`
            },
            {
                id: 1,
                styleId: 'scale_paradox',
                styleTitle: 'Весы истины: Приманка vs Цена',
                badge: 'Визуальный парадокс',
                description: 'Сравнительные весы: символическая приманка против скрытой переплаты',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Eye-level composition. In the immediate sharp foreground sits an antique brass balance scale on a clean lab worktable. On one pan sits a golden symbolic trophy or fish; on the other pan sits a massive stack of shiny 2 € coins and realistic 50 € banknotes tipping the scale dramatically. Behind the scale, Génie leans forward with wide knowing eyes, tapping her temple in a clever eureka gesture. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "OÙ VA VOTRE ARGENT ?" in bold condensed white font with glowing amber edges. Razor-sharp macro textures, dramatic lighting. ${baseNegative}.`
            },
            {
                id: 2,
                styleId: 'price_shock',
                styleTitle: 'Шок-цена: 450 € в год',
                badge: 'Скрытые траты',
                description: 'Крупный план светящегося ценника и шокированная Génie',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Macro rack-focus framing. In the sharp foreground, an oversized glowing digital price display shows "450 €" with a warning icon. In soft bokeh behind it, Génie raises both hands in genuine disbelief, jaw slightly dropped, looking straight into the lens. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "450 € PERDUS PAR AN ?" rendered in bold white italic typography across the top third. High-tech laboratory atmosphere with subtle neon accents, warm volumetric lighting. ${baseNegative}.`
            },
            {
                id: 3,
                styleId: 'secret_dossier',
                styleTitle: 'Секретное досье инсайдера',
                badge: 'Закрытый секрет',
                description: 'Génie с секретной папкой схемы и доверительным взглядом',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Intimate eye-level 3/4 portrait. Génie leans conspiratorially toward the viewer, one index finger raised to her lips in a "shhh!" secret gesture, while her other hand holds a sleek confidential dossier stamped "CONFIDENTIEL". Warm amber desk lamp casts cinematic Venetian blind shadows across the scene. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "CE QU'ILS VOUS CACHENT" in bold condensed white typography with golden glow. Moody high-end editorial lighting. ${baseNegative}.`
            }
        ].map(item => ({ ...item, prompt: sanitizePromptForImageSafety(item.prompt) }));
    }

    if (isEnergy) {
        return [
            {
                id: 0,
                styleId: 'meter_shock',
                styleTitle: 'Шок счетчика Linky',
                badge: 'Энерго-шок',
                description: 'Génie рядом со счетчиком Linky и светящимися цифрами переплаты',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Génie stands beside an illuminated green Linky electricity meter displaying high numbers in glowing digital font, her eyes wide in disbelief pointing at the meter. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "LE PIÈGE DU COMPTEUR LINKY" in bold white sans-serif font with neon green glow. Diagnostic laboratory setting, crisp rim light. ${baseNegative}.`
            },
            {
                id: 1,
                styleId: 'bill_contrast',
                styleTitle: 'Контраст счетов EDF',
                badge: 'До / После',
                description: 'Огромный счет слева и уменьшенный в 3 раза справа',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Split-frame composition, ${baseQuality}. On left: massive inflated electricity bill with red warning markers. On right: tiny slashed bill with green savings checkmark. Génie in center gives a confident thumbs-up. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "DIVISEZ VOTRE FACTURE !" in bold white typography. ${baseNegative}.`
            },
            {
                id: 2,
                styleId: 'thermal_scanner',
                styleTitle: 'Тепловизор и утечки',
                badge: 'Краш-тест',
                description: 'Génie с тепловизором показывает скрытые утечки тепла и денег',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Génie points a high-tech diagnostic thermal scanner at a glowing heat map showing energy leaks. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "VOTRE ARGENT S'ENVOLE !" with glowing cyan and orange thermal accents. High-tech analytical look. ${baseNegative}.`
            },
            {
                id: 3,
                styleId: 'insider_breaker',
                styleTitle: 'Секретный тумблер',
                badge: 'Секрет инсайдера',
                description: 'Génie показывает скрытую настройку или переключатель',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Intimate portrait, Génie gestures toward an electrical circuit panel pointing at one specific hidden toggle with a knowing conspiratorial wink. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "LE RÉGLAGE SECRET D'EDF" in bold condensed white font. ${baseNegative}.`
            }
        ].map(item => ({ ...item, prompt: sanitizePromptForImageSafety(item.prompt) }));
    }

    if (isFood) {
        return [
            {
                id: 0,
                styleId: 'food_science',
                styleTitle: 'Пищевой эксперимент',
                badge: 'Наука на кухне',
                description: 'Génie за столом лаборатории тестирует популярный кулинарный миф',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Génie stands in a bright modern test kitchen laboratory, examining fresh ingredients under an illuminated magnifying glass with wide excited eyes. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "NE JETEZ PLUS ÇA !" in bold white typography. Warm appetizing studio lighting. ${baseNegative}.`
            },
            {
                id: 1,
                styleId: 'food_contrast',
                styleTitle: 'Свежесть vs Порча',
                badge: 'До / После',
                description: 'Слева испорченный продукт, справа идеально сохраненный свежий',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Split-frame composition, ${baseQuality}. On left: spoiled wilted food item. On right: crisp vibrant fresh food kept with the secret method. Génie points proudly to the fresh side. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "FRAIS PENDANT 1 MOIS !" in bold typography. ${baseNegative}.`
            },
            {
                id: 2,
                styleId: 'hero_ingredient',
                styleTitle: 'Секретный ингредиент',
                badge: 'Герой кухни',
                description: 'Макро-фокус на простом домашнем средстве с реакцией Génie',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Snorkel macro lens, ${baseQuality}. A glass jar with simple natural kitchen ingredient in sharp macro focus, Génie in soft bokeh behind it raising one finger with eureka smile. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "L'INGRÉDIENT MAGIQUE" in bold typography. ${baseNegative}.`
            },
            {
                id: 3,
                styleId: 'chef_secret',
                styleTitle: 'Секрет шеф-поваров',
                badge: 'Закрытый трюк',
                description: 'Génie с заговорщическим жестом у кухонного стола',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Intimate portrait, ${baseQuality}. Génie leans forward over culinary marble counter with finger to lips in "shhh!" pose, glowing copper pans in background. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "L'ASTUCE DU CHEF" in bold white condensed font. ${baseNegative}.`
            }
        ].map(item => ({ ...item, prompt: sanitizePromptForImageSafety(item.prompt) }));
    }

    if (isCleaning) {
        return [
            {
                id: 0,
                styleId: 'stain_miracle',
                styleTitle: 'Шок-преображение',
                badge: 'Чудо-чистка',
                description: 'Невероятное мгновенное удаление застарелого нагара или пятна',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. ${baseQuality}. Génie in clean test kitchen holds a previously burnt ruined pan, now showing a pristine gleaming half with sparkling reflections, mouth open in amazed smile. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "MÊME BRÛLÉ ÇA PART !" in bold typography. Razor-sharp textures, glossy highlights. ${baseNegative}.`
            },
            {
                id: 1,
                styleId: 'clean_split',
                styleTitle: 'Контраст До / После',
                badge: 'До / После',
                description: 'Грязь слева и сияющий блеск справа',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Dynamic split-frame Dutch angle, ${baseQuality}. Heavily stained grease on left vs gleaming white pristine surface on right. Génie stands between them pointing proudly to clean side. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "SANS FROTTER !" in bold typography. ${baseNegative}.`
            },
            {
                id: 2,
                styleId: 'diy_reaction',
                styleTitle: 'Шипящая реакция DIY',
                badge: 'Химия дома',
                description: 'Génie показывает шипящую белую пену простого домашнего средства',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Macro close-up, ${baseQuality}. A glass bowl with foaming sparkling natural DIY mixture, Génie behind it smiling excitedly with wide eyes. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "LE MÉLANGE QUI DÉCAPE" in bold typography. ${baseNegative}.`
            },
            {
                id: 3,
                styleId: 'insider_cleaner',
                styleTitle: 'Секретная формула',
                badge: 'Секрет чистоты',
                description: 'Таинственный жест «Тссс!», призыв узнать закрытый метод уборки',
                prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Intimate portrait, ${baseQuality}. Génie with index finger to lips in mysterious "shhh!" gesture beside a gleaming clean kitchen counter with warm ambient lighting. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "L'ASTUCE DE GRAND-MÈRE" in bold typography. ${baseNegative}.`
            }
        ].map(item => ({ ...item, prompt: sanitizePromptForImageSafety(item.prompt) }));
    }

    // Default: Science investigation & lifehack discovery
    return [
        {
            id: 0,
            styleId: 'eureka_discovery',
            styleTitle: 'Шок-открытие лаборатории',
            badge: 'Открытие',
            description: 'Génie с широко распахнутыми глазами и найденным решением',
            prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Close-up portrait, ${baseQuality}. Génie looks straight into camera with mouth open and wide expressive eyes in absolute discovery, hands raised in eureka moment in front of glowing diagnostic lab displays. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "${shortHook || 'LA DÉCOUVERTE DU SIÈCLE !'}" in large bold white sans-serif font. Dynamic volumetric lighting. ${baseNegative}.`
        },
        {
            id: 1,
            styleId: 'visual_proof',
            styleTitle: 'Сравнительный тест',
            badge: 'Краш-тест',
            description: 'Разделенный экран: неработающий метод vs гениальное решение',
            prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Split-frame composition, ${baseQuality}. On left: failed frustrating attempt. On right: effortless brilliant success. Génie points confidently to the winning side with a knowing smirk. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "NE FAITES PLUS CETTE ERREUR !" in bold condensed typography. ${baseNegative}.`
        },
        {
            id: 2,
            styleId: 'paradox_prop',
            styleTitle: 'Визуальный парадокс',
            badge: 'Парадокс',
            description: 'Génie держит в руках ключевой предмет или метафору из ролика',
            prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Eye-level portrait, ${baseQuality}. Génie holds an illuminated demonstration object related to the topic at chest level, examining it with fascinated analytical expression. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "COMMENT C'EST POSSIBLE ?" in bold typography. Warm studio lighting. ${baseNegative}.`
        },
        {
            id: 3,
            styleId: 'insider_secret',
            styleTitle: 'Заговорщический секрет',
            badge: 'Секрет',
            description: 'Таинственный жест «Тссс!», призыв узнать закрытый инсайд',
            prompt: `STRICT VERTICAL 9:16 PORTRAIT ORIENTATION FOR TIKTOK COVER. Intimate portrait, ${baseQuality}. Génie leans forward towards viewer with her index finger gently held to her lips in a mysterious "shhh!" gesture, intense knowing eye contact in warm moody laboratory. BOLD LARGE CINEMATIC TEXT OVERLAY in French: "CE QUE PERSONNE NE DIT" in bold typography with golden glow. ${baseNegative}.`
        }
    ].map(item => ({ ...item, prompt: sanitizePromptForImageSafety(item.prompt) }));
}

function buildCoverPromptsFromGuide(params) {
    return buildDynamicContextualCovers(params);
}

function registerSkeletonHandlers(ipcMain) {
    ipcMain.handle('skeleton-generate-ideas', async (event, { language }) => {
        const langName = LANG_NAMES[language] || 'English';
        const completedTopics = historyManager.getTopics(language);
        const prompt = `You are writing narration for a viral YouTube Shorts channel that explains human limits and biological failure.
REFERENCE STYLE (STRICT): Calm, Clinical but conversational, Slightly ominous, Second-person ("you"), Short sentences, Simple language.
Generate exactly 5 short-form video ideas (Phase 1) using:
- "How Long Can You ___?"
- "What Happens If You ___ Every Day?"
- "How Much ___ Is TOO Much?"
EXCLUSION LIST (DO NOT USE): ${completedTopics.join(', ')}.
Rules: Human body or brain only, Escalation over time, Visually explainable, Slightly dangerous.
Output format: Number. Title (in ${langName}) | Russian Translation | One-sentence failure path in simple language (in ${langName}). No preamble.`;
        return await ai.chat([{ role: 'user', content: prompt }]);
    });

    ipcMain.handle('skeleton-generate-script', async (event, { ideaTitle, language, videoModel }) => {
        const langName = LANG_NAMES[language] || 'English';
        cleanupAudioDir();

        const extractJSON = (str) => {
            const start = str.indexOf('{');
            const end = str.lastIndexOf('}');
            if (start !== -1 && end !== -1) return str.substring(start, end + 1);
            return str;
        };

        const scriptPrompt = `Write a script for a viral channel about human limits: "${ideaTitle}".
REFERENCE STYLE (STRICT): Calm, Clinical, Slightly ominous, Second-person ("you"), Simple language.
STRUCTURE (STRICT): Exactly 6 segments (Intro + 4 Checkpoints + Final Failure).

CRITICAL WORD COUNT RULE:
Each segment MUST be exactly ONE flowing sentence of 17-20 words (MAXIMUM 21 words). This is vital to fit the 8-second video duration. NO exceptions.

CONTENT PER CHECKPOINT:
- Briefly mention the physical feeling, mental state, or a quick comparison.
- Use plain language. No medical jargon. No disease names.
- Every line must be easy to imagine visually.

Output ONLY a JSON object with a "segments" array containing exactly 6 objects:
{ "segments": [ { "original": "exact script segment in ${langName}", "translation": "exact Russian translation of this segment" } ] }`;

        const scriptRaw = await ai.chat([{ role: 'user', content: scriptPrompt }], true);
        const scriptJson = cleanAndParseJSON(scriptRaw);
        
        let segmentsArray = [];
        if (Array.isArray(scriptJson)) segmentsArray = scriptJson;
        else if (scriptJson.segments) segmentsArray = scriptJson.segments;
        else if (scriptJson.script) segmentsArray = scriptJson.script;
        else if (scriptJson.ideas) segmentsArray = scriptJson.ideas;
        else {
            const found = Object.values(scriptJson).find(Array.isArray);
            if (found) segmentsArray = found;
        }

        const scriptForUI = segmentsArray.map(s => typeof s === 'string' ? s : `${s.original || s.text || ''}\n[🇷🇺 ${s.translation || ''}]`).join('\n\n');
        const scriptForPrompts = segmentsArray.map(s => typeof s === 'string' ? s : (s.original || s.text || '')).join('\n\n');

        const promptsPrompt = `Convert this script into scene-by-scene IMAGE PROMPTS and IMAGE-TO-VIDEO PROMPTS with strict visual consistency.
Script: ${scriptForPrompts}

Character Hard Lock: Humanoid skeleton in a semi-transparent glass body, yellow eyes.

For EACH scene (exactly 6), generate following JSON:
{
  "scenes": [
    {
      "scene": 1,
      "environment": "Realistic indoor or outdoor environment suitable for the time checkpoint",
      "pose_action": "Specific physical action (e.g., rubbing head, slumped in chair, walking slowly)",
      "script_line": "Exact narration for this segment",
      "visual_detail": "Camera: Eye-level or chest-level, Medium shot. Lighting: Natural, matching environment. No extreme angles.",
      "motion_detail": "Subtle body movement, natural breathing motion, very slight camera drift"
    }
  ]
}`;

        const promptsRaw = await ai.chat([{ role: 'user', content: promptsPrompt }], true);
        const promptsJson = cleanAndParseJSON(promptsRaw);
        let rawScenes = [];
        if (Array.isArray(promptsJson)) rawScenes = promptsJson;
        else if (promptsJson.scenes) rawScenes = promptsJson.scenes;
        else if (promptsJson.script) rawScenes = promptsJson.script;
        else {
            const found = Object.values(promptsJson).find(Array.isArray);
            if (found) rawScenes = found;
        }

        let scenes = rawScenes.map((s, idx) => ({
            ...s,
            id: idx + 1,
            // TASK 2: IMAGE PROMPTS (Full character description repeated verbatim per prompt.md)
            image_prompt: `A full-body high-end CGI animated humanoid figure with a crystal-clear glass outer shell revealing a smooth ivory-white internal structural framework. Face: two large glowing yellow eyes with dark pupils, friendly neutral expression, rounded smooth head. Body framework: polished ivory-colored rigid structural elements — arms, legs, torso core, joints — all proportioned and stylized. Medical-illustration aesthetic: clean, modern, clinical, bright studio lighting. High-end 3D CGI, physically-based rendering, 8K cinematic quality. NOT horror, NOT scary. Environment: ${s.environment || 'studio'}. Pose: ${s.pose_action || 'standing'}. ${s.visual_detail || ''} Vibrant saturated colors, high contrast, BOLD LARGE OBJECTS in the background to ground the scene, masterpiece quality.`,

            // TASK 3: IMAGE-TO-VIDEO PROMPTS
            video_prompt: `Cinematic motion: ${s.motion_detail || 'subtle motion'}. Action: character ${s.pose_action || 'acting'}. Cinematic camera move (smooth dolly or slow-motion zoom), vibrant saturated colors, high resolution, masterpiece quality, fluid movement.`,

            // LTX-2 SPECIFIC RULES (Prompt.md requirements: Anchor at start, Audio label, Negative prompt)
            ltx_video_prompt: `STRICTLY NO TEXT, NO SUBTITLES, NO CAPTIONS. ${CHARACTER_ANCHOR} Mood: confident and energetic, NOT scary, NOT monstrous. ACTION: ${s.pose_action || 'acting'}. ENVIRONMENT: ${s.environment || 'studio'}. CINEMATIC CAMERA: Smooth tracking or slow-motion zoom. VIBRANT COLORS, HIGH SATURATION. AUDIO NARRATION ONLY (DO NOT SHOW AS TEXT): "${s.script_line || ''}". NEGATIVE PROMPT: blurry, low quality, watermark, text, subtitles, captions, asymmetric face, distorted features, uncanny valley expression.`
        }));

        // Audio is now synthesized separately via 'skeleton-generate-audio'
        return { script: scriptForUI, scenes };
    });

    ipcMain.handle('skeleton-generate-audio', async (event, { script, scenes, language }) => {
        console.log('[Skeleton] Audio synthesis is DISABLED (G-Labs handles lip-sync).');
        return { fullAudioUrl: '', sceneAudioUrls: (scenes || []).map(() => '') };
    });

    ipcMain.handle('skeleton-generate-image', async (event, { sceneIndex, imagePrompt, imageModel, projectFolder, mode, amazonProduct }) => {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        if (!fs.existsSync(skeletonDir)) fs.mkdirSync(skeletonDir);
        const filePath = path.join(skeletonDir, `scene_${sceneIndex + 1}.jpg`);

        // We use G-Labs for image generation
        const cleanModel = imageModel ? imageModel.replace('freepik-', '') : 'nano_banana_2';

        let referenceImages = [];
        let refImgPath = null;

        if (mode === 'psychology') {
            // Use psychology_character.jpg from src/assets as reference
            const psychPath = path.join(__dirname, 'src', 'assets', 'psychology_character.jpg');
            if (fs.existsSync(psychPath)) {
                refImgPath = psychPath;
            }
        } else {
            const getRefImg = () => {
                const searchNames = [
                    'genie_reference.png', 'genie_reference.jpg', 'genie_reference.jpeg', 'genie_reference.webp',
                    'character_reference.png', 'character_reference.jpg', 'character_reference.jpeg',
                    'reference.png', 'reference.jpg'
                ];
                let list = [];
                for (const name of searchNames) {
                    const fullPath = path.join(__dirname, name);
                    if (fs.existsSync(fullPath)) {
                        try {
                            const stat = fs.statSync(fullPath);
                            list.push({ path: fullPath, mtime: stat.mtimeMs });
                        } catch (_) {}
                    }
                }
                if (list.length === 0) return null;
                // Always choose the most recently modified reference image!
                list.sort((a, b) => b.mtime - a.mtime);
                const best = list[0];
                let mime = best.path.endsWith('.png') ? 'image/png' : 'image/jpeg';
                try {
                    const buf = Buffer.alloc(16);
                    const fd = fs.openSync(best.path, 'r');
                    fs.readSync(fd, buf, 0, 16, 0);
                    fs.closeSync(fd);
                    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) mime = 'image/png';
                    else if (buf[0] === 0xFF && buf[1] === 0xD8) mime = 'image/jpeg';
                    else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') mime = 'image/webp';
                } catch (_) {}
                return { path: best.path, mime };
            };

            const refInfo = getRefImg();
            if (refInfo) {
                const imageBase64 = fs.readFileSync(refInfo.path, { encoding: 'base64' });
                referenceImages.push({ data: `data:${refInfo.mime};base64,${imageBase64}` });
                console.log(`[Skeleton Image] Injected global reference image for character from ${refInfo.path} (${refInfo.mime})`);
            }
        }

        if (refImgPath && fs.existsSync(refImgPath)) {
            const ext = refImgPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const imageBase64 = fs.readFileSync(refImgPath, { encoding: 'base64' });
            referenceImages.push({ data: `data:${ext};base64,${imageBase64}` });
            console.log(`[Skeleton Image] Injected reference image for Psychology character`);
        }

        // Secondary Reference: In addition to character reference, inject Amazon product reference image
        let effectiveAmazonProduct = amazonProduct || null;
        if (!effectiveAmazonProduct && projectFolder) {
            try {
                const metaPath = path.join(skeletonDir, projectFolder, 'prompts.json');
                if (fs.existsSync(metaPath)) {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    if (meta.amazonProduct) effectiveAmazonProduct = meta.amazonProduct;
                }
            } catch (_) {}
        }
        if (!effectiveAmazonProduct && typeof imagePrompt === 'string') {
            const codeMatch = imagePrompt.match(/#(\d+)/);
            if (codeMatch) {
                effectiveAmazonProduct = amazonManager.getByCode(codeMatch[1]);
            }
        }

        let finalImagePrompt = imagePrompt;
        if (effectiveAmazonProduct) {
            // Determine if this scene belongs to the product block (Scene 5+ for 8-scene, Scene 3+ for 5-scene)
            let totalScenes = 8;
            if (projectFolder) {
                try {
                    const metaPath = path.join(skeletonDir, projectFolder, 'prompts.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (Array.isArray(meta.scenes)) totalScenes = meta.scenes.length;
                    }
                } catch (_) {}
            }
            const productStartSceneIndex = totalScenes <= 5 ? 2 : 4; // 0-based: Scene 5 (index 4) for 8-scene, Scene 3 (index 2) for 5-scene
            const isProductScene = sceneIndex >= productStartSceneIndex;

            if (isProductScene) {
                try {
                    const prodImg = await amazonManager.getProductImage(effectiveAmazonProduct, projectFolder);
                    if (prodImg && prodImg.data) {
                        referenceImages.push({ data: prodImg.data });
                        console.log(`[Skeleton Image] Injected Amazon product reference #${effectiveAmazonProduct.code} (${effectiveAmazonProduct.title}) into scene ${sceneIndex + 1}`);
                        finalImagePrompt += ` The item/tool must accurately match the exact physical design, color, and features of the product shown in the product reference image (Amazon #${effectiveAmazonProduct.code} - ${effectiveAmazonProduct.title}).`;
                    }
                } catch (prodErr) {
                    console.warn(`[Skeleton Image] Could not load product image reference:`, prodErr.message);
                }
            } else {
                // Scenes 1-4 are 100% pure home lifehack — strictly forbid injecting the commercial tool!
                console.log(`[Skeleton Image] Scene ${sceneIndex + 1} is in the pure DIY lifehack block (Scenes 1-4). Product reference NOT injected.`);
                finalImagePrompt += ` (STRICT: Pure home lifehack demonstration scene — absolutely NO commercial electrical tools, gadgets, or Amazon products in this scene. The character has empty hands or uses simple natural DIY household items like a bowl, spoon, or rag).`;
            }
        }

        finalImagePrompt = sanitizePromptForImageSafety(finalImagePrompt);

        event.sender.send('skeleton-image-progress', { sceneIndex, status: 'generating' });

        const savedPaths = await ai.generateImage({
            prompt: finalImagePrompt,
            model: cleanModel,
            count: 1,
            sectionDir: skeletonDir,
            subFolder: projectFolder,
            sceneIndex: sceneIndex,
            referenceImages: referenceImages,
            onProgress: (p) => {
                event.sender.send('skeleton-image-progress', { sceneIndex, status: p.status, attempt: p.attempt });
            }
        });
        
        if (!savedPaths || savedPaths.length === 0 || !fs.existsSync(savedPaths[0])) {
            console.warn(`[Skeleton Image] Image generation skipped/failed for scene ${sceneIndex + 1}`);
            return null;
        }
        const imgBuffer = fs.readFileSync(savedPaths[0]);
        const imgExt = path.extname(savedPaths[0]).toLowerCase();
        const imgMime = imgExt === '.png' ? 'image/png' : imgExt === '.webp' ? 'image/webp' : 'image/jpeg';
        return `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
    });

    ipcMain.handle('skeleton-generate-video', async (event, { sceneIndex, videoPrompt, ltxVideoPrompt, scriptLine, fullScript, language, videoModel, audioUrl, projectFolder, videoLength }) => {
        const audioPath = audioUrl ? audioUrl.replace('media:///', '').split('?')[0] : null;
        let videoFile;
        console.log(`[Skeleton Video] Request received: sceneIndex=${sceneIndex}, videoModel=${videoModel}, videoLength=${videoLength}, projectFolder=${projectFolder}`);

        try {
            // We use G-Labs for video generation
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            const baseDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;

            // Find the scene image вЂ” it may have a timestamp suffix (e.g. scene_2_1773499181762.jpg)
            let imagePath = null;
            if (fs.existsSync(baseDir)) {
                const prefix = `scene_${sceneIndex + 1}`;
                const match = fs.readdirSync(baseDir)
                    .filter(f => f.startsWith(prefix) && (f.endsWith('.jpg') || f.endsWith('.jpeg') || f.endsWith('.png')))
                    .sort() // pick most recent if multiple
                    .pop();
                if (match) imagePath = path.join(baseDir, match);
            }
            // Fallback: exact name (legacy path)
            if (!imagePath) {
                const fallback = path.join(baseDir, `scene_${sceneIndex + 1}.jpg`);
                if (fs.existsSync(fallback)) imagePath = fallback;
            }

            const realModel = videoModel || 'veo_31_lite';
            const langStr = LANG_NAMES[language] || language || 'English';
            
            // If the prompt already has structured metadata (from Studio mode), use it as is.
            // Otherwise (Skeleton mode), append the default intense voice.
            let promptToUse = videoPrompt;
            if (!promptToUse.toLowerCase().includes('cgi') && !promptToUse.toLowerCase().includes('animation')) {
                promptToUse = `High-end 3D CGI. ` + promptToUse;
            }
            if (!videoPrompt.includes('CHARACTER:') && !videoPrompt.includes('NEGATIVE PROMPT:')) {
                promptToUse = `${promptToUse} AUDIO TRACK: A highly emotional, panicked, and intense adult male voice ALMOST SCREAMING in ${langStr}. STRICTLY NO BACKGROUND NOISE, NO MUSIC, NO SOUND EFFECTS, JUST PURE RAW SHOUTING VOICE. Spoken text: "${scriptLine}"`;
            } else if (!videoPrompt.includes('AUDIO TRACK:')) {
                // Ensure audio track is present for lip-sync if not already there
                promptToUse += ` AUDIO TRACK: Professional character voice speaking exactly: "${scriptLine}". LIP-SYNC: Accurate mouth movement.`;
            }
            // Explicit age, maturity, and safety sanitation to prevent false-positive CHILD_SAFETY triggers on Omni Flash / Veo
            promptToUse = promptToUse
                .replace(/\band cute\b/gi, 'and charming')
                .replace(/\bcute gestures\b/gi, 'expressive confident gestures')
                .replace(/\bcute\b/gi, 'expressive')
                .replace(/\bThe Little Genius\b/gi, 'Génie, the adult woman scientist')
                .replace(/\blittle genius\b/gi, 'adult scientist')
                .replace(/\blittle\b/gi, 'compact')
                .replace(/\bchild\b/gi, 'adult')
                .replace(/\bchildren\b/gi, 'people')
                .replace(/\bteenager\b/gi, 'adult')
                .replace(/\bteen\b/gi, 'adult')
                .replace(/\byoung woman\b/gi, 'adult woman')
                .replace(/\byoung charismatic\b/gi, 'charismatic adult')
                .replace(/\byoung adult\b/gi, 'adult professional')
                .replace(/\byoung\b/gi, 'adult')
                .replace(/\bmid-twenties\b/gi, 'late twenties')
                .replace(/\bgirl\b/gi, 'woman')
                .replace(/\bkid\b/gi, 'person')
                .replace(/\bkids\b/gi, 'people')
                .replace(/\bPixar 3D animation style\b/gi, 'high-end 3D CGI render')
                .replace(/\bPixar style\b/gi, 'high-end 3D CGI')
                .replace(/\bPixar\b/gi, 'high-end CGI')
                .replace(/\b3D cartoon animation style\b/gi, 'high-end 3D CGI render')
                .replace(/\bcartoon animation style\b/gi, 'CGI render style')
                .replace(/\bcartoon animation\b/gi, 'CGI render')
                .replace(/\bcartoon\b/gi, 'photorealistic CGI')
                .replace(/\b3D animated\b/gi, '3D CGI')
                .replace(/\banimation style\b/gi, 'CGI render style');

            // Sanitize intimate/private spaces in video prompts (same as image sanitizer)
            promptToUse = promptToUse
                .replace(/\bin a warmly lit,? bright bathroom\b/gi, 'in a modern bright kitchen laboratory')
                .replace(/\bin (a|the) bathroom\b/gi, 'in a modern bright kitchen laboratory')
                .replace(/\bbathroom\b/gi, 'kitchen laboratory')
                .replace(/\b(restroom|washroom)\b/gi, 'clean science workshop')
                .replace(/\b(vanity counter|vanity table|vanity)\b/gi, 'clean laboratory counter')
                .replace(/\b(dressing room|powder room)\b/gi, 'creative discovery room')
                .replace(/\bin (a|the) (shower stall|shower cabin|shower)\b/gi, 'in a tiled test basin')
                .replace(/\b(shower stall|shower cabin|shower)\b/gi, 'tiled test basin')
                .replace(/\b(bathtub|tub)\b/gi, 'water testing basin')
                .replace(/\bin (a|the) (bedroom)\b/gi, 'in a studio workspace')
                .replace(/\b(bedroom|bed)\b/gi, 'studio workspace');

            // Anti-miniaturization for video prompts
            const vidFurniture = 'table|desk|counter|shelf|tray|surface|platform|workbench|countertop|sink|stove|oven|appliance';
            promptToUse = promptToUse
                .replace(new RegExp(`\\bstanding on (a |the )?(${vidFurniture})\\b`, 'gi'), 'standing on the floor behind a $2')
                .replace(new RegExp(`\\bstands on (a |the )?(${vidFurniture})\\b`, 'gi'), 'stands on the floor behind a $2')
                .replace(new RegExp(`\\bon top of (a |the )?(${vidFurniture})\\b`, 'gi'), 'standing on the floor behind a $2')
                .replace(new RegExp(`\\b(stands|standing) (beside|next to|near|by|in front of|alongside|at) (a |the )?(kitchen )?(${vidFurniture})\\b`, 'gi'),
                    '$1 on the floor $2 $3$4$5 (the $5 reaches her waist level)');

            // Strip bracketed emotion tags from spoken dialogue and lip-sync instructions (so models don't speak them aloud)
            promptToUse = promptToUse
                .replace(/\[(excited|knowing|proudly|whispering|confidential|curious|direct|encouraging|playful|blunt|dry|sardonic|firm|impatient|wry|matter-of-fact|shocked|strategic)\]\s*/gi, '')
                .replace(/\b(glowing\s+)?(golden\s+)?heart(\s+symbol)?\b/gi, 'diagnostic icon')
                .replace(/\bwhispering\b/gi, 'speaking confidentially')
                .replace(/\s{2,}/g, ' ');

            // Sanitize finger counting in video prompts (causes severe AI hand deformities in diffusion video models)
            promptToUse = promptToUse
                .replace(/\bcounting (?:the )?(?:three )?(?:simple )?steps on (?:her )?fingers[^.]*\./gi, 'pointing warmly forward toward the viewer with an encouraging smile.')
                .replace(/\bone finger raised[^.]*\./gi, '')
                .replace(/\btwo fingers for[^.]*\./gi, '')
                .replace(/\bthree fingers for[^.]*\./gi, '');

            // Prepend explicit adult framing for Omni Flash safety classifiers
            if (!promptToUse.includes('ADULT PERSON') && !promptToUse.includes('mature adult')) {
                promptToUse = `[Character: mature adult professional scientist in her late 20s, fully adult facial features, confident professional demeanor]. ` + promptToUse;
            }
            let referenceImages = [];
            if (imagePath && fs.existsSync(imagePath)) {
                console.log(`[Skeleton Video] Using reference image: ${imagePath}`);
                const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
                const ext = imagePath.endsWith('.png') ? 'png' : 'jpeg';
                referenceImages.push({ data: `data:image/${ext};base64,${imageBase64}` });
            } else {
                console.warn(`[Skeleton Video] No reference image found for scene ${sceneIndex + 1} in: ${baseDir}`);
            }
            
            event.sender.send('skeleton-video-progress', { sceneIndex, attempt: 1, maxAttempts: 1, state: 'generating' });
            
            videoFile = await ai.generateVideo({
                prompt: promptToUse,
                model: realModel,
                mode: referenceImages.length > 0 ? 'start_image' : 'text_to_video',
                sectionDir: skeletonDir,
                subFolder: projectFolder,
                sceneIndex: sceneIndex,
                referenceImages: referenceImages,
                videoLength: videoLength || null,
                onProgress: (p) => {
                    event.sender.send('skeleton-video-progress', { sceneIndex, attempt: p.attempt, state: p.status, taskAttempt: 1 });
                }
            });

            if (audioPath && fs.existsSync(audioPath)) {
                console.log(`[Skeleton Video] Muxing audio for scene ${sceneIndex + 1}...`);
                const muxed = videoFile.replace('.mp4', '_muxed.mp4');
                await muxAudioIntoVideo(videoFile, audioPath, muxed);
                fs.renameSync(muxed, videoFile);
            }

            // Generate/Refresh preview from the potentially muxed file
            console.log(`[Skeleton Video] Generating preview for scene ${sceneIndex + 1}...`);
            const previewUrl = await reencodeForPreview(videoFile, sceneIndex);

            return previewUrl;
        } catch (e) {
            console.error(`[Skeleton Video] Handler error: ${e.message}`);
            throw e;
        }
    });

    ipcMain.handle('skeleton-assemble-video', async (event, { useKaraoke, ideaTitle, language }) => {
        const skeletonDir = path.join(__dirname, 'SkeletonShorts');
        const finalDir = path.join(__dirname, 'FinalVideo');
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);
        const files = fs.readdirSync(skeletonDir).filter(f => f.startsWith('scene_') && f.endsWith('.mp4') && !f.includes('_sub')).sort((a, b) => parseInt(a.match(/\d+/)[0]) - parseInt(b.match(/\d+/)[0]));

        const videoFiles = [];
        for (const f of files) {
            const pathIn = path.join(skeletonDir, f);
            if (useKaraoke) {
                const pathSub = pathIn.replace('.mp4', '_sub.mp4');
                await generateKaraokeSubtitles(pathIn, pathSub, files.indexOf(f));
                videoFiles.push(pathSub);
            } else {
                videoFiles.push(pathIn);
            }
        }

        const listPath = path.join(__dirname, 'skeleton_filelist.txt');
        const tempPath = path.join(finalDir, `skeleton_temp_${Date.now()}.mp4`);
        const outputPath = path.join(finalDir, `skeleton_final_${Date.now()}.mp4`);
        fs.writeFileSync(listPath, videoFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));

        const musicDir = path.join(__dirname, 'Music');
        const musicFiles = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter(f => f.endsWith('.mp4') || f.endsWith('.mp3') || f.endsWith('.wav')) : [];
        const bgMusicPath = musicFiles.length > 0 ? path.join(musicDir, musicFiles[0]) : null;

        return new Promise((resolve, reject) => {
            // Step 1: Concat videos
            const concat = spawn('ffmpeg', ['-f', 'concat', '-safe', '0', '-i', listPath, '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p', '-y', tempPath]);

            concat.on('close', async (code) => {
                if (code !== 0) return reject(new Error('Concat failed'));

                if (!bgMusicPath) {
                    fs.renameSync(tempPath, outputPath);
                    historyManager.addTopic(language, ideaTitle);
                    return resolve(`media:///${outputPath.replace(/\\/g, '/')}`);
                }

                // Step 2: Mix background music with fade out
                try {
                    const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempPath}"`).toString().trim();
                    const duration = parseFloat(durationStr);
                    const fadeStart = Math.max(0, duration - 2);

                    const filter = `[1:a]volume=0.1,afade=t=out:st=${fadeStart}:d=2[bgm];[0:a][bgm]amix=inputs=2:duration=first[a]`;

                    const mix = spawn('ffmpeg', [
                        '-i', tempPath,
                        '-i', bgMusicPath,
                        '-filter_complex', filter,
                        '-map', '0:v',
                        '-map', '[a]',
                        '-c:v', 'copy',
                        '-c:a', 'aac',
                        '-y', outputPath
                    ]);

                    mix.on('close', (mixCode) => {
                        fs.unlinkSync(tempPath);
                        if (mixCode === 0) {
                            historyManager.addTopic(language, ideaTitle);
                            resolve(`media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                        } else reject(new Error('Music mix failed'));
                    });
                } catch (e) {
                    console.error('Music mix error:', e);
                    fs.renameSync(tempPath, outputPath);
                    resolve(`media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`);
                }
            });
        });
    });

    ipcMain.handle('studio-generate-ideas', async (event, { mode, language, provider }) => {
        const langName = LANG_NAMES[language] || 'English';
        console.log(`[Studio SEO] Fetching SEO keywords for lang=${langName} mode=${mode}`);

        const now = new Date();
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const currentMonth = monthNames[now.getMonth()];
        const currentYear = now.getFullYear();
        const seasonMap = { 0:'winter',1:'winter',2:'spring',3:'spring',4:'spring',5:'summer',6:'summer',7:'summer',8:'autumn',9:'autumn',10:'autumn',11:'winter' };
        const currentSeason = seasonMap[now.getMonth()];

        try {
            // 🔍 Real-time web search for current trends via Perplexity
            const liveTrends = await searchTrends(langName, mode, currentSeason, currentMonth, currentYear);
            
            const niche = mode === 'health'
                ? 'smart lifehacks, clever household tricks, home organization secrets, kitchen hacks, daily routine efficiency, genius problem solving, life shortcuts, viral everyday tips'
                : 'household items, daily problems, lifehacks, room organization, productivity';

            const topicsPrompt = `You are an expert TikTok SEO analyst for ${langName}-speaking audience.
Based on recent search trends and web data for ${currentMonth} ${currentYear} (${currentSeason}):
${liveTrends || 'No live data, use your best knowledge of current viral trends.'}

Identify the top 5 to 10 absolute MOST SEARCHED queries that users are actively typing into the TikTok search bar right now regarding: ${niche}. 
These should be queries with high search volume (Search Intent), such as popular questions, viral topics, or highly searched phrases.
The "original" query MUST be in ${langName} language.
The "translation" MUST be an accurate Russian translation (перевод на русский язык) of the query so a Russian creator understands what it means.

Output ONLY a raw JSON array of objects with "original" and "translation" keys (no markdown, no other text).
Example: [{"original": "climatiseur maison sans électricité", "translation": "домашний кондиционер без электричества"}, {"original": "astuce canicule pour dormir", "translation": "лайфхак как спать в жару"}]`;

            const rawJson = await ai.chat([
                { role: 'user', content: topicsPrompt }
            ], true, provider);

            const match = rawJson.match(/\[[\s\S]*\]/);
            if (!match) throw new Error('Failed to parse SEO keywords JSON from AI: ' + rawJson);
            
            const keywords = JSON.parse(match[0]);
            if (!Array.isArray(keywords)) throw new Error('Result is not an array');
            
            // Map to the { original, translation } format expected by StudioTab
            const ideas = keywords.slice(0, 10).map(item => {
                if (typeof item === 'string') {
                    return { original: item, translation: '' };
                }
                return {
                    original: item.original || item.query || '',
                    translation: item.translation || item.russian_translation || item.ru || ''
                };
            });

            return ideas;
        } catch (e) {
            console.error('[Studio SEO] Error fetching keywords:', e);
            throw e;
        }
    });

    // ── Helper: Extract text and story from Screenshot using Vision OCR ────────
    async function extractScreenshotInfo(screenshotBase64, event) {
        if (!screenshotBase64 || typeof screenshotBase64 !== 'string') return null;

        console.log(`[Studio Screenshot] Analyzing screenshot via Vision OCR...`);
        if (event && event.sender) {
            event.sender.send('studio-progress', { status: '🔍 Сканирую текст и правила со скриншота через Vision AI...', progress: 30 });
        }

        const ocrPrompt = `You are a world-class OCR and content analyst.
Analyze this image carefully. Extract ALL text, rules, lifehacks, clever tricks, household secrets, quotes, or tips verbatim.
If the image contains numbered lists or bullet points (e.g. "1. Секрет идеальной чистки...", "2. Как сложить вещи..."), extract EVERY SINGLE point in full detail without skipping or truncating anything.
Also provide a short 1-sentence summary of the main core message/theme.

OUTPUT FORMAT:
Main Theme: [Core topic]
Extracted Points:
1. [Full text of point 1]
2. [Full text of point 2]
...`;

        try {
            const cleanBase64 = screenshotBase64.startsWith('data:') ? screenshotBase64 : `data:image/jpeg;base64,${screenshotBase64}`;
            const visionResponse = await ai.chat([
                {
                    role: 'user',
                    content: [
                        { type: 'text', text: ocrPrompt },
                        { type: 'image_url', image_url: { url: cleanBase64 } }
                    ]
                }
            ]);

            if (!visionResponse || visionResponse.trim().length < 15 || /(?:The prompt could not be submitted|violate Google's|sensitive words|generative-ai\/use-policy|Blocked by safety policy)/i.test(visionResponse)) {
                throw new Error("Модель отклонила изображение по соображениям безопасности или не смогла распознать текст. Пожалуйста, введите тему вручную.");
            }

            // Extract main theme if present in OCR structure
            let mainTheme = '';
            const themeMatch = visionResponse.match(/Main Theme:\s*([^\n\r]+)/i);
            if (themeMatch && themeMatch[1]) {
                mainTheme = themeMatch[1].replace(/^[\[\(]|[\)\]]$/g, '').trim();
            }

            console.log(`[Studio Screenshot] OCR result extracted (${visionResponse.length} chars, theme="${mainTheme}"): "${visionResponse.slice(0, 150)}..."`);
            return {
                text: visionResponse,
                mainTheme
            };
        } catch (err) {
            console.error(`[Studio Screenshot] Vision OCR failed:`, err.message);
            throw new Error(`Ошибка распознавания скриншота: ${err.message}`);
        }
    }

    // ── Helper: Extract Speech and Visual Context from Local Video Upload ────────
    async function extractLocalVideoInfo(videoBase64, event) {
        if (!videoBase64 || typeof videoBase64 !== 'string') return null;

        console.log(`[Studio Local Video] Processing uploaded local video file...`);
        if (event && event.sender) {
            event.sender.send('studio-progress', { status: '📥 Извлекаю аудиодорожку и ключевые кадры из загруженного видео...', progress: 20 });
        }

        const tempDir = path.join(__dirname, 'SkeletonShorts', 'TempReference');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilePrefix = `local_vid_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const tempVideoPath = path.join(tempDir, `${tempFilePrefix}.mp4`);
        const targetMp3 = path.join(tempDir, `${tempFilePrefix}.mp3`);
        const framesDir = path.join(tempDir, `${tempFilePrefix}_frames`);
        if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

        try {
            // 1. Write video buffer from base64
            const cleanBase64 = videoBase64.replace(/^data:video\/[a-zA-Z0-9.-]+;base64,/, '');
            const videoBuffer = Buffer.from(cleanBase64, 'base64');
            fs.writeFileSync(tempVideoPath, videoBuffer);

            // 2. Extract audio to MP3 using ffmpeg
            await new Promise((resolve, reject) => {
                const proc = spawn('ffmpeg', [
                    '-i', tempVideoPath,
                    '-vn',
                    '-acodec', 'libmp3lame',
                    '-ar', '16000',   // 16 kHz — native Whisper/Gemini STT input rate
                    '-ac', '1',       // mono — cuts file size in half vs stereo
                    '-b:a', '32k',    // 32 kbps — sufficient for speech recognition
                    '-y', targetMp3
                ], { windowsHide: true });
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => {
                    if (code === 0 && fs.existsSync(targetMp3)) resolve(true);
                    else reject(new Error(`ffmpeg audio extraction failed (code ${code}): ${stderr.slice(-300)}`));
                });
                proc.on('error', err => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
            });

            // 3. Transcribe audio speech via STT
            if (event && event.sender) {
                event.sender.send('studio-progress', { status: '🗣️ Распознаю речь и правила из видео через STT...', progress: 45 });
            }
            let transcriptText = '';
            try {
                const sttResult = await ai.transcribe(targetMp3);
                transcriptText = (sttResult && sttResult.text ? sttResult.text : '').trim();
            } catch (sttErr) {
                console.warn(`[Studio Local Video] STT transcription failed or no speech: ${sttErr.message}`);
            }

            // 4. Extract 4-6 evenly spaced keyframes from video for Vision analysis
            if (event && event.sender) {
                event.sender.send('studio-progress', { status: '🔍 Анализирую визуальные демонстрации и объекты в видео через Vision AI...', progress: 60 });
            }

            // Get video duration via ffprobe
            let duration = 10;
            try {
                const durationStr = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${tempVideoPath}"`).toString().trim();
                duration = Math.max(1, parseFloat(durationStr) || 10);
            } catch (_) {}

            // Sample 4 representative timestamps across video
            const sampleCount = 4;
            const timestamps = [];
            for (let i = 0; i < sampleCount; i++) {
                const t = Math.min(duration - 0.2, Math.max(0.2, (duration / (sampleCount + 1)) * (i + 1)));
                timestamps.push(t.toFixed(2));
            }

            const frameBase64List = [];
            for (let i = 0; i < timestamps.length; i++) {
                const t = timestamps[i];
                const framePath = path.join(framesDir, `frame_${i + 1}.jpg`);
                try {
                    execSync(`ffmpeg -ss ${t} -i "${tempVideoPath}" -vframes 1 -q:v 3 -y "${framePath}"`, { windowsHide: true });
                    if (fs.existsSync(framePath)) {
                        const frameBuf = fs.readFileSync(framePath);
                        frameBase64List.push(`data:image/jpeg;base64,${frameBuf.toString('base64')}`);
                    }
                } catch (frameErr) {
                    console.warn(`[Studio Local Video] Frame extraction failed at ${t}s: ${frameErr.message}`);
                }
            }

            // 5. Vision AI analysis of extracted frames
            let visualDescription = '';
            if (frameBase64List.length > 0) {
                try {
                    const contentParts = [
                        {
                            type: 'text',
                            text: `You are an expert video and lifehack analyst.
Analyze these consecutive frames from a reference video.
Identify and describe in detail:
1. What objects, tools, or household items are shown.
2. What specific lifehack, secret technique, cleaning/organizing trick, or practical action is being demonstrated.
3. Any on-screen text, labels, measurements, or captions.
4. The step-by-step procedure shown in the visuals.

Provide a clear, dense summary of the exact lifehack/trick demonstrated in the video.`
                        }
                    ];
                    for (const fBase64 of frameBase64List) {
                        contentParts.push({
                            type: 'image_url',
                            image_url: { url: fBase64 }
                        });
                    }

                    visualDescription = await ai.chat([
                        {
                            role: 'user',
                            content: contentParts
                        }
                    ]);
                    console.log(`[Studio Local Video] Vision frame analysis completed (${visualDescription.length} chars).`);
                } catch (visionErr) {
                    console.warn(`[Studio Local Video] Vision analysis failed: ${visionErr.message}`);
                }
            }

            // 6. Cleanup temporary video and audio files
            try {
                if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
                if (fs.existsSync(targetMp3)) fs.unlinkSync(targetMp3);
                if (fs.existsSync(framesDir)) {
                    const fFiles = fs.readdirSync(framesDir);
                    for (const f of fFiles) fs.unlinkSync(path.join(framesDir, f));
                    fs.rmdirSync(framesDir);
                }
            } catch (_) {}

            return {
                transcript: transcriptText,
                visualDescription: visualDescription,
                combinedSummary: `Video Spoken Content: "${transcriptText || 'None'}"\n\nVisual Actions & Demonstration: "${visualDescription || 'None'}"`
            };
        } catch (err) {
            console.error(`[Studio Local Video] Error processing video:`, err.message);
            // Cleanup on error
            try {
                if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
                if (fs.existsSync(targetMp3)) fs.unlinkSync(targetMp3);
                if (fs.existsSync(framesDir)) {
                    const fFiles = fs.readdirSync(framesDir);
                    for (const f of fFiles) fs.unlinkSync(path.join(framesDir, f));
                    fs.rmdirSync(framesDir);
                }
            } catch (_) {}
            throw new Error(`Ошибка обработки локального видео: ${err.message}`);
        }
    }

    // ── Helper: Download and Transcribe Reference Video URL ──────────────────
    async function extractReferenceVideoInfo(referenceUrl, event) {
        if (!referenceUrl || typeof referenceUrl !== 'string' || !referenceUrl.trim().startsWith('http')) {
            return null;
        }

        const cleanUrl = referenceUrl.trim();
        console.log(`[Studio Reference] Extracting audio/story from URL: ${cleanUrl}`);
        if (event && event.sender) {
            event.sender.send('studio-progress', { status: '📥 Скачиваю аудио из референсного видео...', progress: 15 });
        }

        const tempDir = path.join(__dirname, 'SkeletonShorts', 'TempReference');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const tempFilePrefix = `ref_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        const outputTemplate = path.join(tempDir, `${tempFilePrefix}.%(ext)s`);
        const targetMp3 = path.join(tempDir, `${tempFilePrefix}.mp3`);

        const tempVideoPath = path.join(tempDir, `${tempFilePrefix}_video.mp4`);

        try {
            // Download audio-only stream (avoids DASH video+audio merge which requires ffmpeg in yt-dlp's PATH)
            // bestaudio[ext=m4a] = YouTube's native AAC stream, no conversion needed, ~15 MB for 15 min
            const isInstagram = cleanUrl.includes('instagram.com');
            const audioOutputTemplate = path.join(tempDir, `${tempFilePrefix}_audio.%(ext)s`);
            const baseArgs = [
                '--no-playlist',
                '--socket-timeout', '60',
                '--no-update',
                '-f', 'bestaudio[ext=m4a]/bestaudio/best',  // audio-only, no DASH merge
                '-o', audioOutputTemplate,                   // native extension — no forced container conversion
            ];

            const runYtDlp = (extraArgs) => new Promise((resolve, reject) => {
                const proc = spawn('yt-dlp', [...baseArgs, ...extraArgs, cleanUrl], { windowsHide: true });
                let stderr = '';
                let stdout = '';
                proc.stdout.on('data', (d) => { stdout += d.toString(); }); // yt-dlp progress goes to stdout!
                proc.stderr.on('data', (d) => { stderr += d.toString(); });
                proc.on('close', (code) => {
                    if (code === 0) {
                        // Log both streams for diagnostics
                        if (stdout) console.log('[Studio yt-dlp] Output:', stdout.slice(-600));
                        if (stderr) console.log('[Studio yt-dlp] Stderr:', stderr.slice(-300));
                        resolve(true);
                    } else {
                        console.error('[Studio yt-dlp] Error stdout:', stdout.slice(-400));
                        console.error('[Studio yt-dlp] Error stderr:', stderr.slice(-400));
                        reject(new Error(`yt-dlp failed (code ${code}): ${(stdout + stderr).slice(-400)}`));
                    }
                });
                proc.on('error', (err) => reject(new Error(`Failed to start yt-dlp: ${err.message}`)));
            });

            if (isInstagram) {
                // Priority 1: cookies file (most reliable — works regardless of browser state)
                const cookiesFile = path.join(__dirname, 'instagram_cookies.txt');
                if (fs.existsSync(cookiesFile)) {
                    console.log('[Studio] Using instagram_cookies.txt for Instagram download');
                    await runYtDlp(['--cookies', cookiesFile]);
                } else {
                    // Priority 2: Firefox only — Chrome/Edge lock their DB while open
                    try {
                        console.log('[Studio] Trying Firefox cookies for Instagram');
                        await runYtDlp(['--cookies-from-browser', 'firefox']);
                    } catch (e) {
                        console.warn('[Studio] Firefox cookies failed:', e.message);
                        throw new Error(
                            'Instagram требует авторизацию. Варианты:\n' +
                            '1. Экспортируй cookies из браузера в файл instagram_cookies.txt и положи рядом с приложением (расширение "Get cookies.txt LOCALLY" для Chrome).\n' +
                            '2. Войди в Instagram в Firefox и попробуй снова.'
                        );
                    }
                }
            } else {
                const isYouTube = cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be');
                if (isYouTube) {
                    // YouTube: modern yt-dlp requires explicit player_client to avoid bot-detection
                    const ytArgs = ['--extractor-args', 'youtube:player_client=web,default'];
                    try {
                        await runYtDlp(ytArgs);
                    } catch (ytErr) {
                        console.warn('[Studio] YouTube direct failed, trying with Firefox cookies:', ytErr.message);
                        try {
                            await runYtDlp([...ytArgs, '--cookies-from-browser', 'firefox']);
                        } catch (ffErr) {
                            console.warn('[Studio] Firefox cookies failed, trying Chrome:', ffErr.message);
                            try {
                                await runYtDlp([...ytArgs, '--cookies-from-browser', 'chrome']);
                            } catch (chrErr) {
                                // Re-throw original error with full detail
                                throw new Error(`Не удалось скачать YouTube видео. Попробуй:\n1. Обнови yt-dlp: yt-dlp -U\n2. Войди в YouTube в Firefox и повтори.\n\nОшибка: ${ytErr.message.slice(-300)}`);
                            }
                        }
                    }
                } else {
                    await runYtDlp([]);
                }
            }

            // Check video was downloaded — search broadly across all common video/audio extensions
            if (!fs.existsSync(tempVideoPath)) {
                const videoExts = ['.mp4', '.webm', '.mkv', '.m4v', '.avi', '.ts', '.m4a', '.mp3'];
                const found = fs.readdirSync(tempDir).find(f =>
                    f.startsWith(tempFilePrefix) && videoExts.some(ext => f.endsWith(ext))
                );
                if (!found) {
                    // List what IS in tempDir for diagnostics
                    const available = fs.readdirSync(tempDir).filter(f => f.startsWith(tempFilePrefix));
                    console.error('[Studio yt-dlp] tempDir files after download:', available);
                    throw new Error('Не удалось скачать референсное видео. Возможно yt-dlp устарел — запусти: yt-dlp -U');
                }
                fs.renameSync(path.join(tempDir, found), tempVideoPath);
            }

            // Extract audio from video via ffmpeg (guarantees we get the correct audio track)
            if (event && event.sender) {
                event.sender.send('studio-progress', { status: '🔊 Извлекаю аудиодорожку из видео...', progress: 35 });
            }
            await new Promise((resolve, reject) => {
                const proc = spawn('ffmpeg', [
                    '-i', tempVideoPath,
                    '-vn', '-acodec', 'libmp3lame',
                    '-ar', '16000',   // 16 kHz — native Whisper/Gemini STT rate
                    '-ac', '1',       // mono
                    '-b:a', '32k',    // 32 kbps — enough for speech
                    '-y', targetMp3
                ], { windowsHide: true });
                let stderr = '';
                proc.stderr.on('data', d => { stderr += d.toString(); });
                proc.on('close', code => {
                    if (code === 0 && fs.existsSync(targetMp3)) resolve(true);
                    else reject(new Error(`ffmpeg audio extraction failed (code ${code}): ${stderr.slice(-200)}`));
                });
                proc.on('error', err => reject(new Error(`Failed to start ffmpeg: ${err.message}`)));
            });

            if (event && event.sender) {
                event.sender.send('studio-progress', { status: '🗣️ Распознаю речь и ключевые хуки...', progress: 45 });
            }

            const sttResult = await ai.transcribe(targetMp3);
            const transcriptText = (sttResult && sttResult.text ? sttResult.text : '').trim();

            // Cleanup temp files
            try {
                if (fs.existsSync(tempVideoPath)) fs.unlinkSync(tempVideoPath);
                if (fs.existsSync(targetMp3)) fs.unlinkSync(targetMp3);
            } catch (e) {}

            if (!transcriptText) {
                throw new Error('Не удалось распознать текст из референсного видео.');
            }

            console.log(`[Studio Reference] Transcript extracted (${transcriptText.length} chars): "${transcriptText.slice(0, 120)}..."`);
            return {
                url: cleanUrl,
                transcript: transcriptText
            };
        } catch (err) {
            console.error(`[Studio Reference] Extraction error:`, err.message);
            throw new Error(`Ошибка разбора референсного видео: ${err.message}`);
        }
    }

    ipcMain.handle('studio-parse-reference-video', async (event, { referenceUrl }) => {
        return await extractReferenceVideoInfo(referenceUrl, event);
    });

    ipcMain.handle('studio-parse-screenshot', async (event, { screenshotBase64 }) => {
        return await extractScreenshotInfo(screenshotBase64, event);
    });

    ipcMain.handle('studio-generate-script', async (event, { mode, topic, language, provider, projectFolder, referenceUrl, screenshotBase64, videoBase64, durationMode, amazonProduct, autoSourceAmazon }) => {
        const langName = LANG_NAMES[language] || 'English';
        const isShort = durationMode === '30s';

        // 1. If local video is provided, extract STT speech and vision keyframes FIRST
        let localVideoData = null;
        if (videoBase64 && typeof videoBase64 === 'string') {
            try {
                localVideoData = await extractLocalVideoInfo(videoBase64, event);
            } catch (vidErr) {
                console.warn(`[Studio] Local video extraction failed: ${vidErr.message}`);
                throw vidErr;
            }
        }

        // 2. If screenshot is provided, extract OCR and core rules
        let screenshotData = null;
        if (screenshotBase64 && typeof screenshotBase64 === 'string') {
            try {
                screenshotData = await extractScreenshotInfo(screenshotBase64, event);
            } catch (shotErr) {
                console.warn(`[Studio] Screenshot OCR extraction failed: ${shotErr.message}`);
                throw shotErr;
            }
        }

        // 3. If reference URL is provided, parse it
        let refData = null;
        if (referenceUrl && typeof referenceUrl === 'string' && referenceUrl.trim().startsWith('http')) {
            try {
                refData = await extractReferenceVideoInfo(referenceUrl, event);
            } catch (refErr) {
                console.warn(`[Studio] Reference extraction failed: ${refErr.message}`);
                throw refErr;
            }
        }

        // 3.5 Auto-extract ALL lifehacks from transcript / video summary (health mode only)
        // Takes lifehack #1 for this generation, queues the rest automatically
        let autoQueuedCount = 0;
        const rawTranscriptForQueue = (refData && refData.transcript) || (localVideoData && localVideoData.combinedSummary) || null;
        if (mode === 'health' && rawTranscriptForQueue) {
            try {
                if (event && event.sender) {
                    event.sender.send('studio-progress', { status: '🔍 Нахожу все лайфхаки в видео...', progress: 50 });
                }
                const extracted = await lhExtract({
                    videoTranscript: rawTranscriptForQueue,
                    sourceLabel: referenceUrl || (localVideoData ? 'uploaded video' : 'reference video'),
                    language,
                    provider
                });
                if (extracted && extracted.added > 0) {
                    const firstItem = lhGetNext(); // First pending in queue
                    if (firstItem) {
                        lhMarkUsed(firstItem.id);           // Mark it used (for this generation)
                        topic = firstItem.topicForLlm;      // Override topic for script generation
                        autoQueuedCount = lhGetStats().pending; // Remaining items in queue
                        console.log(`[Studio] Auto-queue: found ${extracted.added} lifehacks, generating "${firstItem.title}", ${autoQueuedCount} queued for later`);
                        if (event && event.sender) {
                            event.sender.send('studio-progress', {
                                status: `✅ Найдено ${extracted.added} лайфхаков! Снимаю первый, ещё ${autoQueuedCount} — в очереди...`,
                                progress: 60
                            });
                        }
                    }
                }
            } catch (queueErr) {
                console.warn('[Studio] Auto-queue extraction failed (using original topic):', queueErr.message);
            }
        }

        // 4. Resolve Amazon product if passed explicitly or embedded in topic
        let effectiveAmazonProduct = amazonProduct || null;
        if (!effectiveAmazonProduct && topic && typeof topic === 'string') {
            const codeMatch = topic.match(/#(\d+)|code\s*:?\s*#?(\d+)/i);
            if (codeMatch) {
                const codeNum = parseInt(codeMatch[1] || codeMatch[2], 10);
                effectiveAmazonProduct = amazonManager.getByCode(codeNum);
            }
        }

        // Determine actual lifehack topic for Amazon sourcing (NOT generic placeholders!)
        let sourcingTopic = '';
        if (topic && topic !== 'Video Demonstration Reference' && topic !== 'Screenshot Rules Reference' && !topic.startsWith('Reference:')) {
            sourcingTopic = topic;
        } else if (localVideoData && localVideoData.combinedSummary) {
            sourcingTopic = localVideoData.combinedSummary;
        } else if (screenshotData && (screenshotData.mainTheme || screenshotData.text)) {
            sourcingTopic = screenshotData.mainTheme || screenshotData.text;
        } else if (refData && refData.transcript) {
            sourcingTopic = refData.transcript;
        }

        // ── Domain Detection for Universal Expert Engine (Adaptive Persona for Génie) ──
        const detectedDomainKey = detectTopicDomain(sourcingTopic);
        const detectedDomain = DOMAIN_DEFINITIONS[detectedDomainKey] || DOMAIN_DEFINITIONS.HOUSEHOLD_CLEANING;

        // Autonomous Amazon Product Sourcing (Reverse Sourcing Engine)
        // Strictly restricted to HOUSEHOLD_CLEANING unless explicitly requested by user (prevents carpet cleaner recommendations on psychology/botany)
        if (!effectiveAmazonProduct && autoSourceAmazon && sourcingTopic && sourcingTopic.trim().length > 5 && mode === 'health' && detectedDomainKey === 'HOUSEHOLD_CLEANING') {
            try {
                if (event && event.sender) {
                    event.sender.send('studio-progress', { status: '🔍 ИИ анализирует тему лайфхака и ищет усиливающий товар на Amazon.fr...', progress: 65 });
                }
                const sourced = await amazonSourcing.sourceProductForLifehack(sourcingTopic.slice(0, 500), { provider, projectFolder }, (p) => {
                    if (event && event.sender) event.sender.send('studio-progress', p);
                });
                if (sourced && sourced.product) {
                    effectiveAmazonProduct = sourced.product;
                    console.log(`[Studio] Auto-sourced Amazon product #${effectiveAmazonProduct.code}: "${effectiveAmazonProduct.title}"`);
                }
            } catch (sourceErr) {
                console.warn('[Studio] Auto-sourcing failed (generating script with pure lifehack):', sourceErr.message);
            }
        }

        // ── Domain-Specific Content Archetypes & Variable Timing Engine ──
        const domainArchetypes = detectedDomain.archetypes && detectedDomain.archetypes.length > 0
            ? detectedDomain.archetypes
            : DOMAIN_DEFINITIONS.HOUSEHOLD_CLEANING.archetypes;

        let selectedArchetype = domainArchetypes[Math.floor(Math.random() * domainArchetypes.length)];
        // Smart selection: if the sourcing topic or reference is about business tricks, commercial bait, marketing, subscriptions or scams, prioritize DEMASQUEUR_ARNAQUE if present
        if (sourcingTopic && /(?:marketing|business|pi[eè]ge|arnaque|vente|client|argent|mod[eè]le|app[aâ]t|abonnement|forfait|gratuit|crochet|commercial|pigeon|tarifs?|co[uû]te?)/i.test(sourcingTopic)) {
            const debunkerArchetype = domainArchetypes.find(a => a.id === 'DEMASQUEUR_ARNAQUE');
            if (debunkerArchetype) selectedArchetype = debunkerArchetype;
        }

        // ── Dynamic Amazon Product Angles (Prevents repetitive "Arrêtez de..." warnings; introduces product early in Scene 3) ──
        const AMAZON_PRODUCT_ANGLES = [
            {
                id: 'REALTIME_CRASH_TEST',
                name: 'Crash-Test 24h & Résultat en Direct',
                hookDirective: 'DIRECT EXPERIMENT / 24H TEST HOOK: Start Scene 1 with a concrete real-time test result within the first 2 seconds (e.g. "J\'ai branché cet appareil toute la nuit à côté de la vitre la plus trempée de la maison : regardez ce réservoir ce matin !", or "Test en direct au labo : voilà exactement ce que cet outil a réussi à extraire en 10 minutes chrono."). ZERO generic greetings or repetitive "Arrêtez de..." warnings!',
                narrativeArc: 'Hook with test result -> Why conventional fixes fail -> Unveiling the device as the test candidate in Scene 3 -> Live demonstration & mechanism in action -> Sensor / diagnostic proof -> Final verdict and 3-step bio funnel.'
            },
            {
                id: 'PRICE_ACOUSTIC_CONTRAST',
                name: 'Contraste Prix & Efficacité (Disruption)',
                hookDirective: 'CONTRAST & PRICE DISRUPTION HOOK: Start Scene 1 by contrasting expensive bulky gear with this compact alternative in the first 2 seconds (e.g. "Les gros appareils professionnels coûtent cent cinquante euros et font un bruit de tracteur : j\'ai voulu vérifier si cette version compacte à petit prix faisait le même travail en silence...", or "Pourquoi dépenser une fortune quand un outil aussi ingénieux règle le problème pour une fraction du prix ?"). ZERO generic greetings!',
                narrativeArc: 'Price/noise contrast hook -> The problem with heavy gear -> Presenting the compact candidate in Scene 3 -> Hands-on stress test -> Real-world efficiency & sound check -> Final verdict and 3-step bio funnel.'
            },
            {
                id: 'MEASUREMENT_SENSOR_SHOCK',
                name: 'Choc Diagnostic & Mesure Chiffrée',
                hookDirective: 'SCIENTIFIC MEASUREMENT & SENSOR SHOCK HOOK: Start Scene 1 with a concrete diagnostic number or extreme meter reading in the first 2 seconds (e.g. "Soixante-dix-huit pour cent d\'humidité mesurée dans cette chambre ce matin : voici le test que j\'ai mené pour faire chuter ce chiffre sans chauffer dans le vide...", or "Regardez ce niveau de saleté ou d\'humidité incrustée : on lance le test en laboratoire !"). ZERO generic greetings!',
                narrativeArc: 'Sensor reading hook -> The invisible damage caused -> Putting the tool to work in Scene 3 -> Visual extraction / transformation -> The scientific measurement after -> Final verdict and 3-step bio funnel.'
            },
            {
                id: 'MYTH_VS_TOOL_DUEL',
                name: 'Duel : Effort Manuel vs Outil Spécialisé',
                hookDirective: 'DUEL / MANUAL EFFORT HOOK: Start Scene 1 with a direct face-off between exhausting manual scrubbing and this smart tool in the first 2 seconds (e.g. "Frotter pendant une heure avec un chiffon et du vinaigre, ou laisser tourner cet outil : qui gagne vraiment ?", or "Les astuces de grand-mère suffisent-elles vraiment, ou cet outil change-t-il la donne ? On teste sans filtre !"). ZERO generic greetings!',
                narrativeArc: 'Duel hook -> The physical limits of manual elbow grease -> Introducing the tool challenger in Scene 3 -> Side-by-side performance test -> Time and energy saved -> Final verdict and 3-step bio funnel.'
            }
        ];

        const selectedAmazonAngle = effectiveAmazonProduct
            ? AMAZON_PRODUCT_ANGLES[Math.floor(Math.random() * AMAZON_PRODUCT_ANGLES.length)]
            : null;

        // Dynamic scene count to break robotic 63s footprint:
        let targetSceneCount;
        if (isShort) {
            targetSceneCount = Math.floor(Math.random() * 3) + 4; // 4, 5, or 6 scenes (32-48s)
        } else if (mode === 'business') {
            // Business education needs more scenes for deep metaphor analysis: 18-25 scenes (144-200s)
            targetSceneCount = Math.floor(Math.random() * 8) + 18;
        } else {
            // High RPM long format: 10, 11, 12, 13, or 14 scenes (80-115s)
            targetSceneCount = Math.floor(Math.random() * 5) + 10;
        }

        const activeArchetypeName = effectiveAmazonProduct ? `Amazon Test: ${selectedAmazonAngle.name}` : selectedArchetype.name;
        console.log(`[Studio] Mode: ${mode} | Domain: ${detectedDomain.name} | Archetype: ${activeArchetypeName} | Target Scenes: ${targetSceneCount} (~${targetSceneCount * 8}s)`);

        if (event && event.sender) {
            event.sender.send('studio-progress', {
                status: mode === 'psychology'
                    ? '✍️ ИИ пишет сценарий для Психолога, видавшего жизнь...'
                    : mode === 'business'
                    ? `✍️ Génie [Business Education] пишет сценарий (${targetSceneCount} сцен, ~${targetSceneCount * 8}с)...`
                    : (effectiveAmazonProduct
                        ? `✍️ Génie [Test Amazon #${effectiveAmazonProduct.code}: ${selectedAmazonAngle.name}] пишет сценарий (${targetSceneCount} сцен)...`
                        : `✍️ Génie [${detectedDomain.name} — ${selectedArchetype.name}] пишет сценарий (${targetSceneCount} сцен, ~${targetSceneCount * 8}с)...`),
                progress: 70
            });
        }

        // Geo-localization context for currency, idioms, stores, and cultural references across all modes
        const GEO_CONTEXT = {
            'French': {
                currency: 'euros (€)',
                currencyExamples: '1,99 €, 4,50 €, 10 €, 20 €, 50 €, 100 €, 140 € par an, deux millions d\'euros',
                banknotes: '5 €, 10 €, 20 €, 50 €, 100 €, 200 €, 500 € (NEVER invent 25 € or 15 € banknotes!)',
                coins: '1 €, 2 €, 50c, 20c, 10c, 5c, 2c, 1c',
                region: 'France, Belgium, Switzerland',
                stores: 'Action, E.Leclerc, Lidl, Carrefour, Leroy Merlin, Castorama',
                consumerIdioms: 'Use authentic French consumer & debunker phrasing: "se faire pigeonner" (being scammed/overcharged), "arnaque marketing", "piège à sous", "faux bon plan", "ils vous font raquer", "payer dans le vent", "marge cachée", "système D", "pépite", "prix gonflé", "astuce de grand-mère", "sans se casser le dos"',
                idioms: 'Use natural French business idioms: "le client décroche" (not "le client fuit"), "chiffre d\'affaires", "marge bénéficiaire", "lever des fonds", "business angel", "rentabilité"',
                businessIdioms: 'Use natural French business idioms: "le client décroche" (not "le client fuit"), "chiffre d\'affaires", "marge bénéficiaire", "lever des fonds", "business angel", "rentabilité"'
            },
            'Spanish': {
                currency: 'euros (€)',
                currencyExamples: '1,99 €, 4,50 €, 10 €, 20 €, 50 €, 100 €, 140 € al año, dos millones de euros',
                banknotes: '5 €, 10 €, 20 €, 50 €, 100 €, 200 €, 500 € (NEVER invent 25 € or 15 € banknotes!)',
                coins: '1 €, 2 €, 50c, 20c, 10c, 5c, 2c, 1c',
                region: 'Spain, Latin America',
                stores: 'Mercadona, Lidl, Carrefour, Leroy Merlin, El Corte Inglés',
                consumerIdioms: 'Use authentic Spanish consumer phrasing: "dar gato por liebre", "timo publicitario", "sacacuartos", "falso chollo", "te cobran de más", "truco casero", "ahorro real"',
                idioms: 'Use natural Spanish business idioms: "el cliente se va" (not literal translations), "facturación", "margen de beneficio", "levantar capital", "rentabilidad"',
                businessIdioms: 'Use natural Spanish business idioms: "el cliente se va" (not literal translations), "facturación", "margen de beneficio", "levantar capital", "rentabilidad"'
            },
            'German': {
                currency: 'euros (€)',
                currencyExamples: '1,99 €, 4,50 €, 10 €, 20 €, 50 €, 100 €, 140 € pro Jahr, zwei Millionen Euro',
                banknotes: '5 €, 10 €, 20 €, 50 €, 100 €, 200 €, 500 € (NEVER invent 25 € or 15 € banknotes!)',
                coins: '1 €, 2 €, 50c, 20c, 10c, 5c, 2c, 1c',
                region: 'Germany, Austria, Switzerland',
                stores: 'Aldi, Lidl, Rewe, Edeka, Bauhaus, Action',
                consumerIdioms: 'Use authentic German consumer phrasing: "Geldmacherei", "Mogelpackung", "Marketingfalle", "echter Spartipp", "Haushaltstrick", "Geld zum Fenster rauswerfen"',
                idioms: 'Use natural German business idioms: "der Kunde springt ab", "Umsatz", "Gewinnmarge", "Kapital beschaffen", "Rentabilität"',
                businessIdioms: 'Use natural German business idioms: "der Kunde springt ab", "Umsatz", "Gewinnmarge", "Kapital beschaffen", "Rentabilität"'
            },
            'Polish': {
                currency: 'Polish złoty (zł / PLN)',
                currencyExamples: '9,99 zł, 20 zł, 50 zł, 100 zł, 600 zł rocznie, dwa miliony złotych',
                banknotes: '10 zł, 20 zł, 50 zł, 100 zł, 200 zł, 500 zł',
                coins: '1 zł, 2 zł, 5 zł, 50 gr, 20 gr, 10 gr, 5 gr, 2 gr, 1 gr',
                region: 'Poland',
                stores: 'Biedronka, Lidl, Żabka, Castorama, Action',
                consumerIdioms: 'Use authentic Polish consumer phrasing: "nabieranie ludzi", "marketingowa ściema", "wyciąganie kasy", "prawdziwa perełka", "sprytny patent", "domowy trik"',
                idioms: 'Use natural Polish business idioms: "klient rezygnuje", "obrót", "marża", "pozyskać kapitał", "rentowność"',
                businessIdioms: 'Use natural Polish business idioms: "klient rezygnuje", "obrót", "marża", "pozyskać kapitał", "rentowność"'
            },
            'Russian': {
                currency: 'Russian rubles (₽)',
                currencyExamples: '199 ₽, 450 ₽, 1 000 ₽, 2 000 ₽, 5 000 ₽, 14 000 ₽ в год, два миллиона рублей',
                banknotes: '50 ₽, 100 ₽, 200 ₽, 500 ₽, 1 000 ₽, 2 000 ₽, 5 000 ₽',
                coins: '1 ₽, 2 ₽, 5 ₽, 10 ₽',
                region: 'Russia, CIS',
                stores: 'Wildberries, Ozon, Леруа Мерлен, Фикс Прайс, Сбер, Магнит',
                consumerIdioms: 'Use authentic Russian consumer phrasing: "развод на деньги", "маркетинговая ловушка", "пустая трата", "рабочий лайфхак", "настоящая находка", "копеечный способ"',
                idioms: 'Use natural Russian business idioms: "клиент уходит" / "клиент отваливается", "выручка", "маржинальность", "привлечь инвестиции", "окупаемость"',
                businessIdioms: 'Use natural Russian business idioms: "клиент уходит" / "клиент отваливается", "выручка", "маржинальность", "привлечь инвестиции", "окупаемость"'
            },
            'English': {
                currency: 'US dollars ($) or British pounds (£)',
                currencyExamples: '$1.99, $4.50, $10, $20, $50, $100, $140 per year, two million dollars',
                banknotes: '$1, $2, $5, $10, $20, $50, $100 (or £5, £10, £20, £50)',
                coins: '1¢, 5¢, 10¢, 25¢, 50¢, $1 (or 1p, 2p, 5p, 10p, 20p, 50p, £1, £2)',
                region: 'USA, UK',
                stores: 'Walmart, Target, Home Depot, Dollar Tree, Amazon',
                consumerIdioms: 'Use authentic English consumer phrasing: "rip-off", "marketing trap", "money pit", "hidden cost", "genius lifehack", "budget saver", "game changer"',
                idioms: 'Use natural English business idioms: "the customer churns", "revenue", "profit margin", "raise capital", "ROI"',
                businessIdioms: 'Use natural English business idioms: "the customer churns", "revenue", "profit margin", "raise capital", "ROI"'
            }
        };
        const geo = GEO_CONTEXT[langName] || GEO_CONTEXT['French'];

        let systemInstruction = "";
        let userPrompt = "";

        if (mode === 'psychology') {
            systemInstruction = `You are a Master Viral Scriptwriter specialized in raw, street-smart psychology and human behavior.
            You write scripts delivered by a blunt, weathered man who has seen every human mistake twice and has zero patience for sugarcoating.

            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST contain the EXACT FULL DIALOGUE word-for-word from "line" using the placeholder [line].
            4. CHARACTER BIBLE (ALWAYS COPY-PASTE INTO PROMPTS):
               ${CHARACTER_BIBLE_PSYCHOLOGIST}
            5. THE CONCEPT: The narrator is "The Psychologist" — a street-smart, no-BS man in his late 50s who dishes out brutally honest psychological insights, human behavior truths, and real-life advice that nobody asked for but everyone needs to hear.
            6. TONE & VOICE:
               - Blunt, dry, direct. Speaks like he's had this conversation a hundred times and is mildly annoyed you still don't get it.
               - No motivational fluff. No "you can do it." Just raw, honest, slightly sardonic truth.
               - Uses second-person "you" to make it personal. Short punchy sentences.
            7. CONTENT — PSYCHOLOGY TOPICS:
               - Why people stay in toxic relationships. Why manipulation works. Red flags everyone ignores.
               - Self-sabotage patterns. Why people fear success. How social pressure controls behavior.
               - Reading people. Body language tells. What people say vs. what they mean.
               - Hard truths about human nature that feel uncomfortable but undeniably real.
            8. IMAGE STYLE (MOODY & CINEMATIC):
               - Every "imagePrompt" MUST start with Character Bible, followed by the specific moody location (urban alley, dimly lit bar, rooftop at dusk, dark office) and his confident body language.
               - Atmosphere: dramatic shadows, film-noir inspired lighting, real-world gritty environments.
               - IP SAFETY: No real people, no brand logos, no political symbols.
            9. CHARACTER ACTING (CRITICAL):
               - Deliberate, unhurried gestures. Pointed finger when making a key point. Arms crossed when judging. Shrug when stating the obvious.
               - Image-to-Video alignment: videoPrompt MUST start from the exact pose in imagePrompt.
            10. Each "line" must include an emotion tag: [blunt], [dry], [direct], [sardonic], [firm], [knowing], [impatient], [wry], [matter-of-fact].
            11. DIALOGUE LENGTH (8 SECONDS PER CLIP): 18-22 words per scene. Short sentences. No filler.

                ${isShort ? `
                📍 FAST 30-SECOND FORMAT (4-5 SCENES):
                - Scene 1 — THE UNCOMFORTABLE TRUTH (18-22 words): Blunt statement of a hard psychological reality.
                - Scene 2 — WHY IT HAPPENS (18-22 words): The real reason behind the behavior, no excuses.
                - Scene 3 — THE PATTERN YOU'RE NOT SEEING (18-22 words): What you keep doing wrong without realizing.
                - Scene 4 — THE HARD ADVICE (18-22 words): What to actually do about it — direct, no sugarcoating.
                - Scene 5 — THE CLOSING TRUTH (18-22 words): Final blunt takeaway that lands like a gut punch.
                ` : `
                📍 FULL 8-SCENE FORMAT:
                - Scene 1 — THE HOOK & HARD TRUTH (18-22 words)
                - Scene 2 — WHY PEOPLE DO THIS (18-22 words)
                - Scene 3 — THE SELF-DECEPTION (18-22 words)
                - Scene 4 — THE PATTERN (18-22 words)
                - Scene 5 — WHAT IT COSTS YOU (18-22 words)
                - Scene 6 — THE REAL SOLUTION (18-22 words)
                - Scene 7 — WHY MOST WON'T DO IT (18-22 words)
                - Scene 8 — THE FINAL VERDICT (18-22 words)
                `}`;

            const effectiveTopic = localVideoData
                ? `Uploaded Video Material: "${localVideoData.combinedSummary.slice(0, 700)}..."`
                : (screenshotData
                    ? `Psychology insight extracted from screenshot: "${screenshotData.text.slice(0, 500)}..."`
                    : (refData ? `Story from reference video: "${refData.transcript.slice(0, 500)}..."` : topic));

            userPrompt = `Create a viral psychology short script with EXACTLY ${isShort ? '5' : '8'} scenes for: "${effectiveTopic}".
            ${localVideoData ? `\nUPLOADED VIDEO ANALYSIS — ADAPT THIS CONTENT FOR THE PSYCHOLOGIST IN ${langName.toUpperCase()}:\n"""\n${localVideoData.combinedSummary}\n"""\n` : ''}
            ${screenshotData ? `\nSCREENSHOT CONTENT — ADAPT THESE INSIGHTS FOR THE PSYCHOLOGIST IN ${langName.toUpperCase()}:\n"""\n${screenshotData.text}\n"""\n` : ''}
            ${refData ? `\nREFERENCE VIDEO TRANSCRIPT — ADAPT THIS FOR THE PSYCHOLOGIST IN ${langName.toUpperCase()}:\n"""\n${refData.transcript}\n"""\n` : ''}
            The narrator is "The Psychologist" — a blunt, weathered man in his late 50s delivering uncomfortable truths about human behavior with the calm authority of someone who has seen it all.

            DIALOGUE: 18-22 words per scene. Blunt. Direct. Second-person "you". No fluff.

            Rotate Variants (A, B, C, D) for each scene. VIDEO VARIANT GUIDE: A=subtle push-in, B=slow dramatic push-in, C=stable mid-shot, D=gentle dolly.

            Output JSON:
            {
              "intro": "[VIRAL TITLE — provocative, direct]",
              "socialPost": {
                "title": "Title with emoji",
                "description": "Engaging description for tiktok/reels",
                "hashtags": "#tag1 #tag2 #tag3"
              },
              "scenes": [
                {
                  "id": 1,
                  "character": "The Psychologist",
                  "line": "Dialogue in ${langName} [emotion]",
                  "imageVariant": "A",
                  "videoVariant": "A",
                  "imagePrompt": "(In English) [PASTE CHARACTER BIBLE HERE]. Describe the moody urban location, dramatic lighting, and his confident body posture.",
                  "videoPrompt": "(In English) High-end 3D CGI. Describe the animation starting from the exact pose in imagePrompt. Deliberate gestures: pointed finger, arms crossed, wry shrug. LIP-SYNC: \"[line]\""
                }
              ]
            }`;
        } else if (mode === 'health') {
            systemInstruction = `You are a Master Viral Hook Scriptwriter and world-class creator of viral, high-retention videos and actionable expert knowledge.
            You write scripts that feel vibrant, delightfully clever, and hyper-viral — every line delivers authentic domain expertise, witty observations, and practical value.

            ${TIKTOK_SAFETY_DIRECTIVE}

            TOPIC DOMAIN: ${detectedDomain.name}
            EXPERT PERSONA: Génie is an ${detectedDomain.personaTitle}.
            TONE & VOICE IDENTITY: ${effectiveAmazonProduct ? 'Investigative, hands-on crash-tester, pragmatic & objective reviewer' : detectedDomain.personaVoice}

            SELECTED CONTENT ARCHETYPE: "${effectiveAmazonProduct ? selectedAmazonAngle.name : selectedArchetype.name}"
            NARRATIVE ARC: ${effectiveAmazonProduct ? selectedAmazonAngle.narrativeArc : selectedArchetype.narrativeArc}
            TONE: ${effectiveAmazonProduct ? 'Investigative, hands-on crash-tester, pragmatic & objective reviewer' : selectedArchetype.tone}

            MANDATORY FRANCE GEO-ANCHORS & REAL-WORLD CONTEXT (CRITICAL FOR HIGH RPM & EU/FR TARGETING):
            - You MUST anchor the dialogue in real everyday life (France, Belgium, Switzerland) to ensure high retention and top RPM.
            - Authentic domain anchors: ${detectedDomain.culturalAnchors}

            DOMAIN BOUNDARIES & NEGATIVE CONSTRAINTS (STRICT ANTI-CROSS-CONTAMINATION):
            - ${detectedDomain.forbiddenContent}

            GEO-LOCALIZATION & REFERENCE ADAPTATION (CRITICAL WHEN ADAPTING EXTERNAL VIDEOS):
            - When adapting material from reference videos, transcripts, or screenshots from other countries (Ukraine, Russia, USA, etc.):
              * FOREIGN CURRENCIES MUST BE CONVERTED: If the source mentions Ukrainian hryvnias (грн), Russian rubles (₽), US dollars ($), etc., NEVER repeat them! Convert all monetary amounts into the target currency: ${geo.currency} (${geo.currencyExamples}).
              * NO 1:1 NUMERICAL COPYING (CRITICAL): NEVER simply change the currency sign while keeping the number! "25 hryvnias" or "25 rubles" is NOT "25 euros"! 25 UAH is ~0,55 €! Convert monetary figures to realistic European economic values based on purchasing power:
                - Cheap/symbolic entry ticket or fee → 2 €, 5 €, or at most a 10 € / 20 € pass.
                - Routine grocery or household hack → 1,50 €, 2,99 €, 4,50 €.
                - Moderate purchase/service → 15 €, 20 €, 50 €.
                - Substantial expense/trap → 80 €, 150 €, 300 €.
              * OFFICIAL BANKNOTE DENOMINATIONS ONLY:
                - In the Eurozone, official banknotes ONLY exist in: ${geo.banknotes}. Coins exist in: ${geo.coins}.
                - There is NO 25 € banknote! There is NO 15 € banknote! There is NO 30 € banknote!
                - If the dialogue mentions banknotes or cash, use REAL denominations: e.g. "un billet de 20 €", "un billet de 10 €", "une pièce de 2 €", "des billets de 50 €".
              * REAL-WORLD CURRENCY IN IMAGE & VIDEO PROMPTS (CRITICAL FOR DIFFUSION MODELS):
                - In imagePrompt and videoPrompt, NEVER request non-existent banknotes or fake money (e.g. NEVER write 'marked 25 €' on a banknote or scale pan)! AI diffusion models will render fake, absurd currency notes.
                - When illustrating cash or pricing on a scale, counter, or display, specify REAL currency objects:
                  * "a crisp blue 20 € banknote"
                  * "a green 100 € banknote"
                  * "shiny 2 € and 1 € coins"
                  * "an admission ticket marked 'ENTRÉE'" or "a VIP pass marked 'PASS'" (without fictional denomination numbers)
                  * "an illuminated digital price tag displaying '1,99 €'" or "'19,99 €'"
              * FOREIGN SLANG & IDIOMS: Do NOT translate foreign slang literally! Semantically adapt it into authentic ${langName} expressions:
                - Russian/Ukrainian "клиент сливается" → "le client décroche" / "le client s'en va"
                - "развод на деньги" / "лохотрон" → "une arnaque totale" / "un vrai piège à sous"
                - "впаривают" → "ils vous refourguent" / "ils vous font payer"
                - "навар" → "leur marge cachée" / "leur profit"
                - "подсадить на абонентку" → "vous enfermer dans un abonnement"
                - "лайфхак на коленке" → "un pur système D"
              * ${geo.consumerIdioms}
              * FOREIGN STORES & BRANDS: Replace foreign stores (ATB, Pyaterochka, Silpo, etc.) with local equivalents (${geo.stores}) or universally known brands.
              * PRESERVE AMAZON INTEGRATION: If an Amazon product is active (${effectiveAmazonProduct ? `#${effectiveAmazonProduct.code}: ${effectiveAmazonProduct.title}` : 'none'}), all Amazon crash-test directives and the outro funnel MUST remain strictly intact.

            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST contain the EXACT FULL DIALOGUE word-for-word from "line" using the placeholder [line]. NO TRUNCATION. NO '...'.
            4. CHARACTER APPEARANCE — USE TEXT DESCRIPTION (CRITICAL FOR GOOGLE FLOW MODELS):
               - Always start the imagePrompt with the CHARACTER BIBLE exactly as written below:
               - CHARACTER BIBLE: ${CHARACTER_BIBLE_GENIE}
               - After the CHARACTER BIBLE, describe: her action, gesture, facial expression, and the scene environment.
               - The reference image in reference_images is provided as a secondary style hint, but the TEXT description is the primary anchor for character consistency.
            5. THE CONCEPT & VOICE IDENTITY (CRITICAL FOR VIRAL RETENTION):
               - Génie is a brilliant, high-energy woman expert (${detectedDomain.personaTitle}) who speaks directly to the viewer like a savvy, trusted friend and authentic authority in her domain.
               - STRICT FIRST-PERSON & DIRECT ADDRESS: Génie ALWAYS speaks as "Je" or "On" and addresses the viewer directly as "tu" or "vous".
               - NEVER REFER TO HERSELF IN THE THIRD PERSON (STRICT BAN): NEVER write "le génie reste calme", "un vrai génie fait ceci", "l'esprit brillant". It sounds bizarre, arrogant, and robotic.
               - STRICT BAN ON PSEUDO-PHILOSOPHY & MORALIZING CLICHÉS: NEVER write patronizing, moralizing, or pseudo-philosophical filler (e.g. "Les vrais esprits brillants restent modestes", "Vos proches vous prendront pour une originale incomprise", "L'illusion de la perfection"). Every single line must be 100% concrete, practical, energetic, and grounded in real-world mechanisms, human behavior, physical facts, or exact figures!
               - RAPID PACING — NO HOARDING THE PROBLEM: NEVER spend 3 or 4 scenes repeating warnings or scaring the viewer! Scenes 1 and 2 cover the hook and conventional mistake. By Scene 3 at the very latest, you MUST already unveil the smart solution, active insight, or core mechanism!
            6. HOOK REQUIREMENT — RESULT IN FIRST 2 SECONDS (MANDATORY IN SCENE 1):
               - ${effectiveAmazonProduct ? selectedAmazonAngle.hookDirective : selectedArchetype.hookDirective}
               - NO slow hellos, NO "Bonjour tout le monde", NO "Bienvenue sur ma chaîne". Start immediately in media res!
            7. IMAGE STYLE, ENVIRONMENT VARIETY & COHERENCE:
               - Every "imagePrompt" MUST start with: ${CHARACTER_BIBLE_GENIE}, followed by the specific location and her physical action.
               - **DOMAIN STUDIO SETTING**: ${detectedDomain.studioSetting}
               - **ACTIVE VISUAL PROPS**: ${detectedDomain.visualProps}
               - Génie MUST actively handle, point at, or inspect these props with intense, analytical, or triumphant expressions — never stand empty-handed in passive poses!
               - **Visual Environment Variety**: Rotate camera angles and environments across scenes (Macro inspection, Mid-shot demonstration, Wide view, Triumph result arc).
               - **Character Consistency**: Do NOT describe clothes or features; reference image guarantees consistency.
               - **IP SAFETY (CRITICAL)**: NEVER use political symbols, military uniforms, real brand logos, celebrity likenesses, or any copyrighted imagery in imagePrompt or videoPrompt. Use only neutral, everyday objects and environments.
               - **CHARACTER SCALE & GROUND POSITION (CRITICAL — PREVENTS MINIATURIZATION)**:
                 * Standard shots: The character ALWAYS stands at FULL HUMAN HEIGHT on the floor or ground — she is NEVER placed on, inside, or alongside objects at the same scale. Props are either: (a) held in her hand, OR (b) placed on a counter/table/shelf/desk clearly behind or beside her.
                 * Macro Inspection Shots (Variant E in Scene 1 or Scene 2): If the scene highlights the disaster/problem, use a cinematic inspection composition: The physical problem itself is in the SHARP FOREGROUND MACRO FOCUS, while the character leans in right behind it at natural human height, closely examining it with dramatic analytical expressions.
            8. CHARACTER ACTING & MOTION COHERENCE:
               - Image-to-Video Animation Alignment: videoPrompt MUST animate the exact starting pose and environment described in imagePrompt.
               - Gestures: Expressive hands, holding up relevant domain props, inspecting surfaces or materials up-close, pointing with excitement, confident nods.
            9. Each "line" must include an emotion tag: [excited], [knowing], [proudly], [confidential], [curious], [direct], [encouraging], [playful], [shocked], etc.
            9.5. EMOTION-TO-EXPRESSION MAPPING (CRITICAL FOR REALISTIC ACTING IN videoPrompt):
               - [shocked] → wide eyes, jaw slightly dropped, hands raised in genuine disbelief
               - [knowing] → sharp conspiratorial half-smile, eyebrow arched, slow knowing nod to camera
               - [curious] → leaning in close, eyes narrowed in focused inspection, tilted head
               - [excited] → sparkling eyes, energetic smile, dynamic open-palm gesture
               - [direct] → firm eye contact, pointed finger emphasizing the warning, determined expression
               - [proudly] → head held high, radiant triumphant smile, presenting the result
               - [confidential] → conspiratorial lean toward camera, hand cupped slightly, intense eyes
               - [playful] → cheeky smirk, teasing head tilt, playful wink or shrug
               Use these EXACT expressions in the videoPrompt CHARACTER ACTION for each scene — do NOT default to generic smiling.
            10. 🎬 DURATION & DIALOGUE LENGTH (8 SECONDS PER CLIP):
                Each video clip is 8 seconds. Dialogue should naturally fill the 8 seconds with smooth, lively speech (recommended: 18-22 words per scene, avoiding empty pauses).
                Total script length: EXACTLY ${targetSceneCount} scenes (approx. ${targetSceneCount * 8} seconds).
            11. EMOTIONAL PENDULUM & CURIOSITY BRIDGES (MAXIMUM RETENTION):
                - Alternate scenes between TENSION (discovering a hidden trap/mistake) and RELIEF/TRIUMPH (the brilliant chemical reaction/result).
                - RETENTION CURIOSITY BRIDGES: At key transitions, end or begin scenes with micro-cliffhangers that compel the viewer to watch the next 8-second clip (e.g. "...mais attention au piège que 90% des gens commettent : ", "...ce qui se passe ensuite va vous scotcher : regardez bien.", "...voici le détail crucial qui change absolument tout : ").
            ${effectiveAmazonProduct ? `
            12. 🛒 DYNAMIC PRODUCT CRASH-TEST ARCHITECTURE (PRODUCT #${effectiveAmazonProduct.code}: "${effectiveAmazonProduct.title}"):
                 - THIS VIDEO IS AN EXCITING HANDS-ON PRODUCT TEST-DRIVE (MythBusters / Laboratory Crash-Test style), NOT a repetitive theoretical lecture!
                 - The product (${effectiveAmazonProduct.title}) is the central STAR of the investigation and MUST be introduced EARLY in Scene 3!
                 - DYNAMIC NARRATIVE ARC:
                   * Scene 1: Instant Hook & bold experiment result or claim (${selectedAmazonAngle.hookDirective}).
                   * Scene 2: Why manual remedies (rags, chemical traps from Action, running heating full blast on EDF) fail or worsen the damage.
                   * Scene 3: Unveiling ${effectiveAmazonProduct.title} as the lab test subject and candidate.
                   * Scenes 4 to 6: Physical demonstration of how it works in real-time (motor, extraction, filtration, decibel level, ergonomics).
                   * Scenes 7 to 9: Real-world measurements (sensor readings, volume extracted, side-by-side surface comparison, energy consumption).
                   * Scenes 10 to ${targetSceneCount - 2}: Comparison with bulky/expensive alternatives + durability & maintenance pro-tips.
                   * Scene ${targetSceneCount - 1}: Final honest scoring and triumphant verdict by Génie.
                   * Scene ${targetSceneCount}: Outro 3-step action funnel: (1) click link in bio -> (2) enter code #${effectiveAmazonProduct.code} and press OK -> (3) arrive directly on Amazon to order.
                 - Outro line rule: Strictly 18-22 words, natural conversational pace, NO bracketed emotion tags.
                 - Outro phrasing variations:
                   * "Clique sur le lien en bio, entre le code ${effectiveAmazonProduct.code} et appuie sur OK — tu arrives direct sur Amazon pour commander !"
                   * "Retrouve la référence exacte sur mon labo : lien en bio, code ${effectiveAmazonProduct.code} puis OK pour aller direct sur Amazon !"
                   * "Tous les détails et le produit sont en bio : entre le code ${effectiveAmazonProduct.code}, clique sur OK et tu arrives sur Amazon !"
                   * "Si tu veux ce résultat chez toi, le lien est dans mon profil : tape ${effectiveAmazonProduct.code}, clique sur OK et commande sur Amazon !"` : `
            12. 🏁 OUTRO & CALL TO ACTION (NO PRODUCT):
                 - The FINAL SCENE (Scene ${targetSceneCount}) delivers a memorable punchline + call to follow/comment:
                 * "Sauvegarde cette vidéo, dis-moi en commentaire si tu as déjà vécu ça — et abonne-toi pour d'autres décryptages !"
                 * "Partage cette vidéo à un proche qui en a besoin — et retrouve tous mes conseils et analyses sur mon profil !"
                 * "Dis-moi en commentaire quel sujet tu veux voir ensuite — et abonne-toi pour ne rater aucun décryptage !"
                 Strictly 18-22 words.`}
            13. 🔢 FACTUAL CONSISTENCY ACROSS ALL SCENES (MANDATORY — ZERO TOLERANCE):
                 - Every specific number (price, percentage, duration, quantity) introduced in Scene 1 MUST remain IDENTICAL in ALL subsequent scenes.
                 - If Scene 1 says "spray à 15 €", then Scene 7, Scene 9, and Scene 10 MUST also say "15 €" — NEVER "12 €", "quinze euros", or "un produit pro".
                 - BEFORE finalizing the script, mentally scan: "Is every price/number I introduced in Scene 1 used consistently in later scenes?" If not, fix it.
                 - This rule also applies to product names, durations ("2 minutes"), and quantities ("3 gouttes").
            14. 💡 UNEXPECTED PRO TIP (MANDATORY FOR Scene targetSceneCount - 1 — IMPACT & PRO TIP):
                 - The penultimate scene MUST deliver a NON-OBVIOUS, COUNTERINTUITIVE bonus insight — a "secret combination" or unexpected use-case that the viewer did NOT predict from the setup.
                 - BANNED generic conclusions: "use product A for task A and product B for task B" (this is simply the obvious conclusion of the test, NOT a tip).
                 - REQUIRED: An unexpected angle — mixing both products, an unusual application, a surprising frequency, a hidden synergy, or a cheaper DIY version nobody would think of.
                 - Examples of strong unexpected tips:
                   * "mélange-les à 50/50 dans un vaporisateur pour les graisses intermédiaires"
                   * "applique d'abord la mousse, attends 90 secondes, puis termine avec l'alcool — tu divises ton temps de frottage par trois"
                   * "quelques gouttes d'alcool sur la mousse séchée décuplent l'effet tensioactif sans frottage supplémentaire"
                 - The surprise must feel like insider knowledge the viewer could not have guessed — this is what drives saves and shares.
            `;

            const effectiveTopic = localVideoData
                ? `Uploaded Video Material: "${localVideoData.combinedSummary.slice(0, 700)}..."`
                : (screenshotData
                    ? (screenshotData.mainTheme
                        ? `Extracted Topic: "${screenshotData.mainTheme}". Details: "${screenshotData.text.slice(0, 500)}..."`
                        : `Rules & Insights extracted from screenshot: "${screenshotData.text.slice(0, 500)}..."`)
                    : (refData ? `Story from reference video: "${refData.transcript.slice(0, 500)}..."` : (topic || detectedDomain.name)));

            const amazonProductContext = effectiveAmazonProduct ? `
🛒 TARGET AMAZON SHOWCASE PRODUCT #${effectiveAmazonProduct.code}:
- Title: "${effectiveAmazonProduct.title}" (Catégorie: ${effectiveAmazonProduct.category})
- Everyday Problem: ${effectiveAmazonProduct.quote}
- Clever Method / Lifehack: ${effectiveAmazonProduct.hackMethod || effectiveAmazonProduct.verdict}
- Scientific Principle: ${effectiveAmazonProduct.verdict}
- Key Highlights: ${Array.isArray(effectiveAmazonProduct.features) ? effectiveAmazonProduct.features.join('; ') : ''}
- Integration: Introduce as the lab test candidate in Scene 3, demonstrate live through real measurements and side-by-side test, then conclude with verdict and bio funnel.
- Final Scene ${targetSceneCount} Outro: 3-step bio funnel (link in bio -> code #${effectiveAmazonProduct.code} + OK -> Amazon).\n` : '';

            userPrompt = `Create a viral ${effectiveAmazonProduct ? selectedAmazonAngle.name.toUpperCase() : selectedArchetype.name.toUpperCase()} video script with EXACTLY ${targetSceneCount} scenes for: "${effectiveTopic}".
                        Domain: ${detectedDomain.name} (${detectedDomain.personaTitle})
                        ${amazonProductContext}
                        ${localVideoData ? `\nUPLOADED VIDEO ANALYSIS (SPEECH & VISUAL DEMONSTRATION) — ADAPT THIS EXACT CONTENT FOR GÉNIE IN ${langName.toUpperCase()}:\n""" \n${localVideoData.combinedSummary}\n"""\n` : ''}
                        ${screenshotData ? `\nSCREENSHOT CONTENT (OCR & RULES) — ADAPT THESE EXACT RULES FOR GÉNIE IN ${langName.toUpperCase()}:\n""" \n${screenshotData.text}\n"""\n` : ''}
                        ${refData ? `\nREFERENCE VIDEO TRANSCRIPT (ADAPT THIS FOR GÉNIE IN ${langName.toUpperCase()}):\n""" \n${refData.transcript}\n"""\n` : ''}
                        The narrator is Génie — a brilliant, charismatic mature adult woman expert in her late twenties, whose appearance is defined entirely by the provided reference image.

            MANDATORY SCENE STRUCTURE (EXACTLY ${targetSceneCount} SCENES, 18-22 WORDS PER SCENE):
            ${effectiveAmazonProduct ? `
            - Scene 1 (INSTANT HOOK & EXPERIMENT PROVOCATION in first 2 seconds): ${selectedAmazonAngle.hookDirective}
            - Scene 2 (THE FAILURE OF CHEAP HACKS & HIDDEN COST): Why towels, chemical traps from Action, or heating waste money and fail against the problem. End with a curiosity bridge to Scene 3.
            - Scene 3 (THE LAB CANDIDATE UNVEILED): Génie introduces ${effectiveAmazonProduct.title} as the compact test candidate to solve this effortlessly.
            - Scenes 4 to 6 (HANDS-ON LIVE DEMO & MECHANISM): How the device works in real time — motor, absorption, filtration, quietness, ergonomics.
            - Scenes 7 to 9 (REAL MEASUREMENTS & VISUAL PROOF): The 24h test result, sensor/hygrometer drop, exact volume collected, crystal-clear surface.
            - Scene 10 to ${targetSceneCount - 2} (COMPARISON & PRO SECRET): Contrast with 150€ noisy gear, low energy consumption in cents, maintenance tip.
            - Scene ${targetSceneCount - 1} (TRIUMPHANT VERDICT & LAB SCORE): Final enthusiastic verdict, rating out of 10.
            - Scene ${targetSceneCount} (OUTRO BIO FUNNEL): 3-step action funnel with code #${effectiveAmazonProduct.code} to order on Amazon. Strictly 18-22 words, NO bracketed emotion tags.
            ` : `
            - Scene 1 (INSTANT HOOK in first 2 seconds): ${selectedArchetype.hookDirective}
            - Scene 2 (THE CONVENTIONAL MISTAKE OR TRAP): Why common habits, standard products, or conventional wisdom fail or worsen the issue. End with a curiosity bridge to Scene 3.
            - Scene 3 (THE SOLUTION / SECRET UNVEILED): Immediately reveal the smart technique, hero method, tool, or cognitive shift. ZERO delay or philosophical fluff!
            - Scene 4 (THE UNDERLYING MECHANISM): Explain in clear, dynamic terms why this works (scientific principle, physical reaction, psychological reflex, or factual reality).
            - Scenes 5 to ${targetSceneCount - 3} (HANDS-ON ACTION & DEMONSTRATION): Follow the narrative arc of ${selectedArchetype.name} (${selectedArchetype.narrativeArc}) adapted specifically to "${effectiveTopic}" — concrete steps, precise examples, real-time testing and active handling.
            - Scene ${targetSceneCount - 2} (THE DRAMATIC PROOF / BEFORE-AFTER): Visual or behavioral evidence of success, clear transformation, or test result.
            - Scene ${targetSceneCount - 1} (IMPACT & PRO TIP — UNEXPECTED TWIST MANDATORY): A counterintuitive insider bonus tip that combines, repurposes, or reframes the tested methods in a way the viewer could NOT predict — drives saves and shares. NEVER write the obvious "use A for X and B for Y" conclusion. Go deeper: a surprise synergy, unexpected combo, hidden dosage trick, or DIY hybrid.
            - Scene ${targetSceneCount} (FINAL VERDICT & ENGAGEMENT CTA): Final score / punchline + invite viewers to test and share their experience in comments. Strictly 18-22 words.
            `}

            Rotate Camera Variants (A, B, C, D, E, F, G, H) for each scene. Use E or F for Scene 1 or 2 for high visual impact! VIDEO VARIANT GUIDE: A=subtle push-in, B=slow dramatic push-in, C=stable demonstration, D=gentle dolly, E=macro rack-focus, F=crash zoom, G=subtle arc (triumph), H=parallax lateral slide.

            Output JSON:
            {
              "intro": "Viral French Title with emoji (tailored to ${detectedDomain.name})",
              "socialPost": {
                "title": "Punchy French title with emoji",
                "description": "Engaging French description ending with a question to drive comments (e.g. 'Et vous, avez-vous déjà vécu cette situation ? Dites-le moi en commentaire ! 👇')",
                "hashtags": "${detectedDomain.hashtags}"
              },
              "scenes": [
                {
                  "id": 1,
                  "character": "Génie",
                  "line": "Dialogue in ${langName} [emotion]",
                  "imageVariant": "E",
                  "videoVariant": "E",
                  "imagePrompt": "(In English) [PASTE CHARACTER BIBLE HERE]. In the sharp foreground macro focus: vivid physical problem, subtle emotional tell, or astonishing result. In soft bokeh behind it, Génie leans in at adult height inspecting it with intense expression. Describe the environment.",
                  "videoPrompt": "(In English) High-end 3D CGI. Describe the animation starting from the exact pose in imagePrompt. Slow rack-focus from foreground to Génie pointing and addressing camera. LIP-SYNC: \"[line]\""
                }
              ]
            }`;
        } else if (mode === 'business') {
            // ── BUSINESS EDUCATION MODE: Génie teaches business models through metaphors ──
            const BUSINESS_ARCHETYPES = [
                {
                    id: 'METAPHOR_STORY',
                    name: 'Метафора из жизни → Бизнес-модель',
                    hookDirective: 'METAPHOR HOOK: Start Scene 1 with a vivid everyday metaphor that unexpectedly reveals a business model in the first 2 seconds (e.g. "Imagine a fishing lake that charges nothing at the entrance but makes you pay for every fish you catch — that IS the freemium business model…"). ZERO generic greetings!',
                    narrativeArc: 'Vivid metaphor hook → Setup: the everyday situation everyone knows → The hidden business mechanism inside it → Real-world company using this exact model → Numbers and proof → Counter-intuitive twist → Actionable takeaway.',
                    tone: 'Curious storyteller, connecting the dots between everyday life and business genius'
                },
                {
                    id: 'CONTRARIAN_TRUTH',
                    name: 'Контринтуитивная правда о бизнесе',
                    hookDirective: 'CONTRARIAN HOOK: Start Scene 1 with a bold contrarian statement that challenges conventional business wisdom in the first 2 seconds (e.g. "The most profitable companies in the world lose money on purpose on their main product — here is why that makes them billionaires…"). ZERO generic greetings!',
                    narrativeArc: 'Bold contrarian claim → Why everyone thinks the opposite → The hidden logic → Real company example → How the numbers actually work → Why most people get this wrong → The principle you can steal.',
                    tone: 'Confident contrarian, revealing hidden business logic with authority'
                },
                {
                    id: 'CASE_STUDY_DISSECTION',
                    name: 'Разбор: Как X Зарабатывает Миллионы',
                    hookDirective: 'CASE STUDY HOOK: Start Scene 1 with a shocking revenue number or business fact about a known company in the first 2 seconds (e.g. "IKEA makes more money selling meatballs than furniture in some countries — and their genius is not in cooking…"). ZERO generic greetings!',
                    narrativeArc: 'Shocking business fact → The company everyone knows → The invisible revenue engine behind it → Step-by-step breakdown of the model → Why competitors cannot copy it easily → The transferable principle → How to apply it at any scale.',
                    tone: 'Analytical investigator, dissecting business machines with surgical precision'
                },
                {
                    id: 'MONEY_PSYCHOLOGY',
                    name: 'Психология денег и решений',
                    hookDirective: 'PSYCHOLOGY OF MONEY HOOK: Start Scene 1 with a provocative psychological insight about money or business decisions in the first 2 seconds (e.g. "Your brain is wired to lose money — here is the exact cognitive trap that costs entrepreneurs millions every year…"). ZERO generic greetings!',
                    narrativeArc: 'Provocative psychological claim → The cognitive bias or trap explained → Why smart people still fall for it → Real business disaster example → The counter-strategy → How top entrepreneurs think differently → Your mental framework upgrade.',
                    tone: 'Insightful psychologist of business, revealing invisible mental traps'
                }
            ];

            const selectedBizArchetype = BUSINESS_ARCHETYPES[Math.floor(Math.random() * BUSINESS_ARCHETYPES.length)];
            console.log(`[Studio] Business Archetype: ${selectedBizArchetype.name}`);

            const effectiveTopic = localVideoData
                ? `Uploaded Video Material: "${localVideoData.combinedSummary.slice(0, 700)}..."`
                : (screenshotData
                    ? `Business insights extracted from screenshot: "${screenshotData.text.slice(0, 500)}..."`
                    : (refData ? `Business education from reference video: "${refData.transcript.slice(0, 700)}..."` : topic));

            systemInstruction = `You are a Master Viral Scriptwriter specialized in business education through vivid metaphors, real-world case studies, and counter-intuitive business insights.
            You write scripts delivered by Génie — a brilliant, charismatic woman scientist-educator who makes complex business models crystal clear through everyday analogies.

            SELECTED CONTENT ARCHETYPE: "${selectedBizArchetype.name}"
            NARRATIVE ARC: ${selectedBizArchetype.narrativeArc}
            TONE: ${selectedBizArchetype.tone}

            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST contain the EXACT FULL DIALOGUE word-for-word from "line" using the placeholder [line].
            4. CHARACTER BIBLE (ALWAYS COPY-PASTE INTO PROMPTS):
               ${CHARACTER_BIBLE_GENIE}
            5. THE CONCEPT: Génie explains business models, revenue strategies, and entrepreneurial psychology through vivid real-life metaphors and surprising case studies. She makes MBA-level concepts accessible to anyone.
            6. TONE & VOICE:
               - Confident, enthusiastic, TED-talk energy. Speaks like a passionate professor who makes every student lean forward.
               - Uses vivid metaphors from everyday life (fishing, cooking, games, nature) to explain business mechanisms.
               - Mix of intellectual depth and playful curiosity. Short punchy revelations.
               - Second-person "you" to engage directly. Rhetorical questions that make viewers think.
            7. CONTENT — BUSINESS TOPICS:
               - Business models (freemium, loss-leader, razor-blade, subscription, platform, franchise).
               - Revenue psychology (anchoring, decoy pricing, scarcity, social proof, sunk cost).
               - Case studies of iconic companies (IKEA, Apple, McDonald's, Costco, Amazon, etc.).
               - Counter-intuitive business truths that challenge conventional wisdom.
               - Entrepreneurial mindset and decision-making frameworks.
            8. NO AMAZON PRODUCTS. NO HEALTH LIFEHACKS. This is pure business education content.
            8.5. GEO-LOCALIZATION & CULTURAL ADAPTATION (CRITICAL):
               - The reference material may use currencies, slang, or cultural references from ANY country (Ukrainian hryvnias, Russian rubles, American dollars, etc.).
               - You MUST convert ALL monetary values to the TARGET AUDIENCE currency: ${geo.currency}.
               - Currency format examples: ${geo.currencyExamples}.
               - Target audience region: ${geo.region}.
               - NO 1:1 NUMERICAL COPYING (CRITICAL): NEVER simply change the currency sign while keeping the number! "25 гривен" ≠ "25 euros"! 25 UAH is ~0,55 €. Convert to a realistic European price point based on purchasing power (e.g. cheap ticket = 2 € or 5 €; standard fee = 10 € or 20 €; major investment = 2 000 € or 5 000 €).
               - OFFICIAL REAL-WORLD BANKNOTE DENOMINATIONS: Euro banknotes ONLY exist in: ${geo.banknotes}. Coins in: ${geo.coins}. There is NO 25 € banknote! There is NO 15 € banknote! When mentioning cash or bills, use only real denominations (e.g. 5 €, 10 €, 20 €, 50 €, 100 €).
               - REAL CURRENCY PROPS IN IMAGE PROMPTS: In imagePrompt, NEVER ask for non-existent banknotes or tickets with fake denominations on scales (e.g. NEVER write 'marked 25 €' on a banknote or scale pan). Diffusion models will draw absurd fake bills! Instead write: "a crisp blue 20 € banknote", "a 2 € coin", or "an admission ticket marked 'VIP'".
               - When the source uses slang or idioms (e.g. Russian "клиент сливается", "навар", "подсадить на крючок"), do NOT translate literally — find the natural idiomatic equivalent in ${langName}.
               - ${geo.idioms}
               - When the source references local companies, banks, or stores, replace with equivalents known to the target audience (${geo.stores}) — or use universally known brands (McDonald's, Apple, IKEA).
               - NEVER leave source-language currency symbols, company names, or untranslated slang in the final ${langName} dialogue.
            9. IMAGE STYLE (PROFESSIONAL & CINEMATIC):
               - Every "imagePrompt" MUST start with Character Bible, followed by professional business locations (modern boardroom, rooftop with city skyline, co-working space, TED-style stage).
               - Atmosphere: warm professional lighting, golden/amber tones, cinematic depth, sharp focus.
               - IP SAFETY: No real people, no brand logos, no political symbols.
            10. CHARACTER ACTING (CRITICAL):
               - Confident gestures: pointing at invisible whiteboard, counting on fingers, opening palms to reveal insight.
               - Image-to-Video alignment: videoPrompt MUST start from the exact pose in imagePrompt.
            10.5. VISUAL METAPHOR PROPS (CRITICAL FOR ENGAGEMENT):
               - If the business content uses metaphors (lakes, fishing, cooking, games), the imagePrompt MUST include related visual props — miniature models, holographic diagrams, or physical objects that illustrate the metaphor.
               - Example: for a fishing lake business model → tiny illuminated glass aquariums on the desk, miniature fishing rods, holographic water charts.
               - Example: for a razor-blade model → oversized prop razor and blade, one golden and one free, held as demonstration pieces.
               - Génie MUST interact with these props — holding, pointing at, examining them — not just stand in empty boardrooms.
               - This transforms abstract business concepts into visually compelling, shareable thumbnails.
            11. Each "line" must include an emotion tag: [confident], [curious], [revealing], [passionate], [surprised], [strategic], [emphatic], [playful].
            11.5. EMOTION-TO-EXPRESSION MAPPING (for videoPrompt):
               - [confident] → steady direct gaze, chin slightly lifted, calm authoritative smile
               - [curious] → head tilted slightly, one eyebrow raised, eyes wide with fascination
               - [revealing] → dramatic pause, then sharp knowing look, finger pointing upward
               - [passionate] → leaning forward, both hands gesturing expansively, eyes sparkling
               - [surprised] → genuine wide-eyed reaction, mouth slightly open, then knowing nod
               - [strategic] → narrowed eyes, slight head nod, fingers steepled or tapping temple
               - [emphatic] → palm pressing forward toward camera, firm jaw, unwavering eye contact
               - [playful] → mischievous half-smile, tilted head, conspiratorial wink or side-glance
               Use these EXACT expressions in the videoPrompt CHARACTER ACTION for each scene — do NOT default to "warm confident authority" every time.
            12. DIALOGUE LENGTH (CRITICAL — 8 SECONDS PER CLIP): Each "line" MUST contain EXACTLY 18-22 words. Count them. If a line exceeds 22 words, SPLIT it into two scenes. If under 18 words, add vivid detail. This is non-negotiable — longer lines will NOT fit in the 8-second clip and will be rejected. Business concepts MUST be compressed into punchy single sentences, NOT explanations.

                ${isShort ? `
                📍 FAST 30-SECOND FORMAT (4-6 SCENES):
                - Scene 1 — THE METAPHOR HOOK (18-22 words): Vivid everyday metaphor that IS a business model.
                - Scene 2 — THE HIDDEN MECHANISM (18-22 words): How the money actually flows.
                - Scene 3 — THE REAL-WORLD PROOF (18-22 words): Company or entrepreneur using this exact model.
                - Scene 4 — THE COUNTER-INTUITIVE TWIST (18-22 words): Why this works against common sense.
                - Scene 5 — THE TAKEAWAY (18-22 words): The principle you can apply today.
                ` : `
                📍 FULL ${targetSceneCount}-SCENE FORMAT (DEEP BUSINESS EDUCATION):
                - Scene 1 — THE HOOK & METAPHOR (18-22 words): ${selectedBizArchetype.hookDirective}
                - Scene 2 — SETTING THE STAGE (18-22 words): The everyday situation everyone recognizes.
                - Scene 3 — THE FIRST BUSINESS MODEL (18-22 words): How model #1 works under the hood.
                - Scene 4 — WHY IT WORKS (18-22 words): The psychological or economic mechanism behind model #1.
                - Scene 5 — TRANSITION TO MODEL #2 (18-22 words): Pivot to the next variation with a contrast.
                - Scene 6 — MODEL #2 DEEP DIVE (18-22 words): The hidden revenue engine of model #2.
                - Scene 7 — THE REVEAL (18-22 words): The counter-intuitive truth behind model #2.
                - Scene 8 — TRANSITION TO MODEL #3 (18-22 words): Pivot with a provocative question.
                - Scene 9 — MODEL #3 MECHANICS (18-22 words): How model #3 monetizes differently.
                - Scene 10 — REAL-WORLD PROOF (18-22 words): A known company using this exact approach.
                - Scene 11 — TRANSITION TO MODEL #4 (18-22 words): Connecting the dots between models.
                - Scene 12 — MODEL #4 BREAKDOWN (18-22 words): The loss-leader or platform play.
                - Scene 13 — THE NUMBERS (18-22 words): Revenue, margins, or growth that prove it works.
                - Scene 14 — TRANSITION TO MODEL #5 (18-22 words): The final, most advanced variation.
                - Scene 15 — MODEL #5 DEEP DIVE (18-22 words): The scaling or franchise mechanism.
                - Scene 16 — THE MASTER PATTERN (18-22 words): The universal principle connecting all models.
                - Scene 17 — THE COUNTER-INTUITIVE TWIST (18-22 words): Why profit is never where you expect.
                - Scene 18 — THE MENTAL FRAMEWORK (18-22 words): The 3 pillars (client, value, profit).
                - Scenes 19-${targetSceneCount} — CLOSING & CTA (18-22 words each): Final actionable insight + engagement call to action.
                `}`;

            userPrompt = `Create a viral business education script with EXACTLY ${targetSceneCount} scenes for: "${effectiveTopic}".
            ${localVideoData ? `\nUPLOADED VIDEO ANALYSIS — ADAPT THIS BUSINESS CONTENT FOR GÉNIE IN ${langName.toUpperCase()}:\n"""\n${localVideoData.combinedSummary}\n"""\n` : ''}
            ${screenshotData ? `\nSCREENSHOT CONTENT — ADAPT THESE BUSINESS INSIGHTS FOR GÉNIE IN ${langName.toUpperCase()}:\n"""\n${screenshotData.text}\n"""\n` : ''}
            ${refData ? `\nREFERENCE VIDEO TRANSCRIPT — ADAPT THIS BUSINESS EDUCATION FOR GÉNIE IN ${langName.toUpperCase()}:\n"""\n${refData.transcript}\n"""\n` : ''}
            The narrator is Génie — a brilliant, charismatic mature adult woman scientist-educator in her late twenties, whose appearance is defined entirely by the provided reference image.
            She explains business models through vivid metaphors and real-world case studies with TED-talk energy and infectious curiosity.

            ARCHETYPE: ${selectedBizArchetype.name}
            DIALOGUE: 18-22 words per scene. Confident. Vivid metaphors. Second-person "you". No corporate jargon.

            Rotate Camera Variants (A, B, C, D, E, F, G, H) for each scene. VIDEO VARIANT GUIDE: A=subtle push-in, B=slow dramatic push-in, C=confident educator gesture, D=gentle dolly, E=macro detail shot, F=dramatic reveal, G=orbit arc, H=split diopter.

            Output JSON:
            {
              "intro": "[VIRAL TITLE — provocative business insight with emoji]",
              "socialPost": {
                "title": "Catchy title with emoji",
                "description": "Engaging description for tiktok/reels about this business insight",
                "hashtags": "#business #entrepreneur #businessmodel #startup #money (5-7 UNIQUE hashtags tailored to this exact business topic in ${langName})"
              },
              "scenes": [
                {
                  "id": 1,
                  "character": "Génie",
                  "line": "Dialogue in ${langName} [emotion]",
                  "imageVariant": "A",
                  "videoVariant": "A",
                  "imagePrompt": "(In English) [PASTE CHARACTER BIBLE HERE]. Describe the professional business location, warm lighting, and her confident educator posture.",
                  "videoPrompt": "(In English) High-end 3D CGI. Describe the animation starting from the exact pose in imagePrompt. Confident gestures: pointing, counting on fingers, opening palms. LIP-SYNC: \\"[line]\\""
                }
              ]
            }`;
        } else {
            // Fallback for generic modes — also uses variable scenes, French geo-anchors, and dynamic tags
            systemInstruction = `You are a Master Viral Hook Scriptwriter specialized in lifehacks, smart household secrets & daily productivity.
            You write scripts that feel alive — every line has energy, practical ingenuity, personality, and purpose.

            CRITICAL RULES:
            1. ALL dialogue for "line", "intro", "character" MUST be in ${langName}.
            2. "imagePrompt" and "videoPrompt" MUST be written EXCLUSIVELY in English.
            3. "videoPrompt" MUST include the EXACT FULL DIALOGUE word-for-word from "line" using the placeholder [line].
            4. CHARACTER APPEARANCE (STRICTLY FROM REFERENCE IMAGE):
               - Never describe facial features or clothes; refer to her as "The character from the reference image".
            5. HOOK: Result or surprise in the first 2 seconds!
            6. GEO-ANCHORS: Include French context (Action, Leclerc, EDF, prices in €).
            7. Total script length: EXACTLY ${targetSceneCount} scenes (18-22 words per scene).`;

            const effectiveTopic = localVideoData
                ? `Uploaded Video Material: "${localVideoData.combinedSummary.slice(0, 700)}..."`
                : (screenshotData
                    ? `Rules/Lifehacks extracted from screenshot: "${screenshotData.text.slice(0, 500)}..."`
                    : (refData ? `Story from reference video: "${refData.transcript.slice(0, 500)}..."` : topic));

            userPrompt = `Create a viral practical lifehack script with EXACTLY ${targetSceneCount} scenes for: "${effectiveTopic}".
            Output JSON with "intro", "socialPost" (with 5-7 unique French hashtags), and "scenes" (array of ${targetSceneCount} scenes).`;
        }

        const raw = await ai.chat([
            { role: 'system', content: systemInstruction },
            { role: 'user', content: userPrompt }
        ], true, provider);

        let scriptData = null;
        try {
            const parsed = cleanAndParseJSON(raw);
            scriptData = normalizeStudioScenes(parsed, topic, mode, langName);
        } catch (e) {
            console.warn('[Studio] Direct JSON parse failed, attempting fallback extraction:', e.message);
            try {
                scriptData = fallbackExtractScenes(raw, topic, mode, langName);
            } catch (err2) {
                console.error('[Studio] Failed to parse script response:', raw);
                throw new Error("AI failed to generate structural JSON script: " + err2.message);
            }
        }

        // Phonetics & style review — fix unnatural expressions per target language
        if (scriptData && scriptData.scenes && scriptData.scenes.length > 0) {
            try {
                const linesForReview = scriptData.scenes.map(s => ({ id: s.id, line: s.line }));
                const reviewSystemPrompt = `You are a senior phonetics and speech-style specialist for ${langName}, with deep expertise in spoken media and character voice consistency.

Your task: review short spoken dialogue lines delivered by a witty, self-assured, charismatic adult woman scientist (Génie) — and fix ONLY expressions that sound unnatural, awkward, or like a literal foreign translation for a native ${langName} speaker.

CHARACTER VOICE TO PRESERVE (NON-NEGOTIABLE):
- Playful, clever, charismatic, confident — an adult scientist who delivers brilliant discoveries with infectious enthusiasm.
- Short punchy sentences with sparkling energy and sharp intellect.
- Uses natural everyday vocabulary in ${langName} — no bureaucratic, clinical, or overly stiff phrasing.
- Keeps the "wow factor" — revelations feel exciting, tips feel like secrets being shared.
- Emotion tags like [excited], [playful], [knowing], [whispering] MUST be preserved exactly as-is.

Rules:
- Fix ONLY what sounds like a bad translation or an unnatural expression for a ${langName} native speaker.
- Do NOT flatten the character's personality into plain neutral adult speech.
- Do NOT change lines that already sound natural AND match the character voice.
- Preserve the original meaning and approximate word count (18-22 words).
${effectiveAmazonProduct ? `- CRITICAL: If a line contains product code #${effectiveAmazonProduct.code} or "numéro", you MUST strictly preserve the exact code #${effectiveAmazonProduct.code} and the bio CTA!\n` : ''}- Return ONLY a JSON array: [{"id": 1, "line": "corrected line"}, ...]
- No explanations, no markdown, only the JSON array.`;

                const reviewUserPrompt = `Target language: ${langName}
Dialogue lines to review:
${JSON.stringify(linesForReview, null, 2)}`;

                const reviewRaw = await ai.chat([
                    { role: 'system', content: reviewSystemPrompt },
                    { role: 'user', content: reviewUserPrompt }
                ], true, provider);

                const reviewParsed = cleanAndParseJSON(reviewRaw);
                if (Array.isArray(reviewParsed)) {
                    const reviewMap = {};
                    reviewParsed.forEach(r => { if (r.id && r.line) reviewMap[r.id] = r.line; });
                    scriptData.scenes = scriptData.scenes.map(s => {
                        const newLine = reviewMap[s.id] || s.line;
                        let newVideoPrompt = s.videoPrompt || '';
                        if (reviewMap[s.id] && s.line && newVideoPrompt) {
                            const oldClean = s.line.replace(/\[.*?\]/g, '').trim();
                            const newClean = newLine.replace(/\[.*?\]/g, '').trim();
                            if (oldClean && newClean && oldClean !== newClean) {
                                newVideoPrompt = newVideoPrompt
                                    .replace(`speaking in ${langName} language exactly: "${oldClean}"`, `speaking in ${langName} language exactly: "${newClean}"`)
                                    .replace(`speaking in French language exactly: "${oldClean}"`, `speaking in French language exactly: "${newClean}"`)
                                    .replace(`LIP-SYNC: "${oldClean}"`, `LIP-SYNC: "${newClean}"`);
                            }
                        }
                        return {
                            ...s,
                            line: newLine,
                            videoPrompt: newVideoPrompt
                        };
                    });
                    console.log('[Studio] Phonetics review applied and synchronized with video prompts for', Object.keys(reviewMap).length, 'scenes');
                }
            } catch (reviewErr) {
                console.warn('[Studio] Phonetics review failed (using original lines):', reviewErr.message);
            }
        }

        if (projectFolder && scriptData) {
            saveStudioProjectPrompts(projectFolder, scriptData, mode, topic, langName, effectiveAmazonProduct);
        }

        return { ...scriptData, autoQueuedCount, amazonProduct: effectiveAmazonProduct };
    });

    ipcMain.handle('studio-save-script', async (event, { projectFolder, script, mode, topic, language }) => {
        if (!projectFolder || !script) {
            return { success: false, error: 'Missing projectFolder or script' };
        }
        const langName = LANG_NAMES[language] || language || 'English';
        saveStudioProjectPrompts(projectFolder, script, mode, topic, langName);
        return { success: true };
    });

    ipcMain.handle('studio-assemble-video', async (event, { useKaraoke, ideaTitle, language, projectFolder }) => {
        let studioDir = path.join(__dirname, 'SkeletonShorts');
        if (projectFolder) {
            studioDir = path.join(studioDir, projectFolder);
        }
        const finalDir = path.join(__dirname, 'FinalVideo');
        const audioDir = path.join(__dirname, 'Audio');
        const musicDir = path.join(__dirname, 'Music');
        if (!fs.existsSync(finalDir)) fs.mkdirSync(finalDir);
        if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir);

        if (!fs.existsSync(studioDir)) throw new Error(`Project folder not found: ${studioDir}`);

        const files = fs.readdirSync(studioDir)
            .filter(f => f.startsWith('scene_') && f.endsWith('.mp4') && !f.includes('_sub'))
            .sort((a, b) => {
                const matchA = a.match(/scene_(\d+)/);
                const matchB = b.match(/scene_(\d+)/);
                const numA = matchA ? parseInt(matchA[1]) : 0;
                const numB = matchB ? parseInt(matchB[1]) : 0;
                return numA - numB;
            });

        if (files.length === 0) throw new Error("No scenes found to assemble.");

        let videoFiles = [];
        for (const f of files) {
            const pathIn = path.join(studioDir, f);
            if (useKaraoke) {
                const pathSub = pathIn.replace('.mp4', '_sub.mp4');
                await generateKaraokeSubtitles(pathIn, pathSub, files.indexOf(f));
                videoFiles.push(pathSub);
            } else {
                videoFiles.push(pathIn);
            }
        }

        // ─────────────────────────────────────────────────
        //  Transitions + Whoosh Assembly
        // ─────────────────────────────────────────────────
        const TRANSITION_D = 0.35;
        const tempDir = path.join(__dirname, 'temp_transitions');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

        // Look for whoosh sound in Music/, fallback to Audio/
        let whooshPath = path.join(musicDir, 'Woosh.mp3');
        if (!fs.existsSync(whooshPath)) {
            whooshPath = path.join(musicDir, 'whoosh.mp3');
            if (!fs.existsSync(whooshPath)) {
                const musicFiles = fs.existsSync(musicDir) ? fs.readdirSync(musicDir).filter(f => /woosh|whoosh|deii|swish/i.test(f)) : [];
                whooshPath = musicFiles.length > 0 ? path.join(musicDir, musicFiles[0]) : path.join(audioDir, 'whoosh.mp3');
                if (!fs.existsSync(whooshPath)) {
                    await generateWhooshSound(whooshPath);
                }
            }
        }

        try {
            const durations = videoFiles.map(f => getVideoDuration(f));

            // Build segments: [trimmed_0, trans_0→1, trimmed_1, trans_1→2, …, trimmed_N-1]
            const segments = [];
            for (let i = 0; i < videoFiles.length; i++) {
                if (i > 0) {
                    const transPath = path.join(tempDir, `trans_${i}.mp4`);
                    await createLateralTransition(videoFiles[i - 1], videoFiles[i], whooshPath, transPath, TRANSITION_D);
                    segments.push(transPath);
                }
                const startTrim = i > 0 ? TRANSITION_D : 0;
                const endTrim = i < videoFiles.length - 1 ? TRANSITION_D : 0;
                const body = durations[i] - startTrim - endTrim;
                if (body <= 0.01) continue;
                if (startTrim > 0 || endTrim > 0) {
                    const trimmedPath = path.join(tempDir, `trimmed_${i}.mp4`);
                    await trimClip(videoFiles[i], trimmedPath, startTrim, endTrim);
                    segments.push(trimmedPath);
                } else {
                    segments.push(videoFiles[i]);
                }
            }

            // Concat all video+audio segments (no re-encode — all segments share libx264/aac params)
            const listPath = path.join(__dirname, 'studio_filelist.txt');
            fs.writeFileSync(listPath, segments.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));

            const concatPath = path.join(tempDir, `concat_${Date.now()}.mp4`);
            await runFfmpeg([
                '-f', 'concat', '-safe', '0', '-i', listPath,
                '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-y', concatPath
            ]);
            if (fs.existsSync(listPath)) fs.unlinkSync(listPath);

            let safeTitle = ideaTitle ? ideaTitle.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() : 'studio_final';
            if (!safeTitle) safeTitle = 'studio_final';
            const outputPath = path.join(finalDir, `${safeTitle}_${Date.now()}.mp4`);
            fs.renameSync(concatPath, outputPath);
            cleanTempDir(tempDir);

            return `media:///${outputPath.replace(/\\/g, '/')}?t=${Date.now()}`;

        } catch (e) {
            cleanTempDir(tempDir);
            throw e;
        }
    });

    // ── Video Covers / Thumbnails Generation (100K_PromptGuide formula) ────────
    ipcMain.handle('studio-generate-covers', async (event, { projectFolder, topic, amazonProduct, script, imageModel, mode }) => {
        try {
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            if (!fs.existsSync(skeletonDir)) fs.mkdirSync(skeletonDir, { recursive: true });
            const targetProjectDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;
            const coversDir = path.join(targetProjectDir, 'covers');
            if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

            // Resolve effective Amazon product
            let effectiveAmazonProduct = amazonProduct || null;
            if (!effectiveAmazonProduct && projectFolder) {
                try {
                    const metaPath = path.join(targetProjectDir, 'prompts.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (meta.amazonProduct) effectiveAmazonProduct = meta.amazonProduct;
                    }
                } catch (_) {}
            }
            if (!effectiveAmazonProduct && typeof topic === 'string') {
                const match = topic.match(/#(\d+)/);
                if (match) effectiveAmazonProduct = amazonManager.getByCode(match[1]);
            }

            // Dynamic LLM-driven viral cover prompts (8 archetypes, authentic French hook text, narrative-aware props)
            event.sender.send('studio-covers-progress', {
                status: 'analyzing',
                message: 'AI анализирует контекст сценария и подбирает вирусные архетипы...'
            });

            let coverTemplates = null;
            try {
                coverTemplates = await generateSmartCoverPrompts({
                    topic,
                    amazonProduct: effectiveAmazonProduct,
                    script,
                    mode,
                    event
                });
                if (coverTemplates && coverTemplates.length >= 4) {
                    console.log(`[Studio Covers] Generated 4 smart dynamic cover prompts via AI.`);
                }
            } catch (smartErr) {
                console.warn('[Studio Covers] Dynamic AI cover generation failed, using contextual fallback:', smartErr.message);
            }

            if (!coverTemplates || coverTemplates.length < 4) {
                coverTemplates = buildDynamicContextualCovers({
                    topic,
                    amazonProduct: effectiveAmazonProduct,
                    script,
                    mode
                });
                console.log(`[Studio Covers] Generated 4 contextual fallback cover prompts.`);
            }
            const cleanModel = imageModel ? imageModel.replace('freepik-', '') : 'nano_banana_2';

            // Reference image 1: Génie (Face & character consistency)
            const referenceImages = [];
            const getRefImg = () => {
                const candidates = [
                    { p: path.join(__dirname, 'genie_reference.png'), mime: 'image/png' },
                    { p: path.join(__dirname, 'genie_reference.jpg'), mime: 'image/jpeg' },
                    { p: path.join(__dirname, 'genie_reference.jpeg'), mime: 'image/jpeg' },
                    { p: path.join(__dirname, 'genie_reference.webp'), mime: 'image/webp' }
                ];
                for (const c of candidates) {
                    if (fs.existsSync(c.p)) {
                        try {
                            const buf = Buffer.alloc(16);
                            const fd = fs.openSync(c.p, 'r');
                            fs.readSync(fd, buf, 0, 16, 0);
                            fs.closeSync(fd);
                            let detectedMime = c.mime;
                            if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) detectedMime = 'image/png';
                            else if (buf[0] === 0xFF && buf[1] === 0xD8) detectedMime = 'image/jpeg';
                            else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') detectedMime = 'image/webp';
                            return { path: c.p, mime: detectedMime };
                        } catch (_) {
                            return { path: c.p, mime: c.mime };
                        }
                    }
                }
                return null;
            };

            const refInfo = getRefImg();
            if (refInfo) {
                referenceImages.push({ data: `data:${refInfo.mime};base64,${fs.readFileSync(refInfo.path).toString('base64')}` });
                console.log(`[Studio Covers] Injected Génie reference image from ${refInfo.path} (${refInfo.mime})`);
            }

            // Reference image 2: Exact physical Amazon product (Brush, Cleaner, Tape, Aloe, etc.)
            if (effectiveAmazonProduct) {
                try {
                    const prodImg = await amazonManager.getProductImage(effectiveAmazonProduct, projectFolder);
                    if (prodImg && prodImg.data) {
                        referenceImages.push({ data: prodImg.data });
                        console.log(`[Studio Covers] Injected Amazon product reference #${effectiveAmazonProduct.code} (${effectiveAmazonProduct.title}) into covers generation`);
                    }
                } catch (prodErr) {
                    console.warn(`[Studio Covers] Could not load product image reference:`, prodErr.message);
                }
            }

            console.log(`[Studio Covers] Generating 4 thumbnails for project "${projectFolder}" using model ${cleanModel} (references: ${referenceImages.length})...`);
            const generatedCovers = [];

            for (let i = 0; i < coverTemplates.length; i++) {
                const item = coverTemplates[i];
                event.sender.send('studio-covers-progress', {
                    coverIndex: i,
                    total: coverTemplates.length,
                    status: 'generating',
                    styleTitle: item.styleTitle
                });

                try {
                    const savedPaths = await ai.generateImage({
                        prompt: item.prompt,
                        model: cleanModel,
                        count: 1,
                        sectionDir: skeletonDir,
                        subFolder: projectFolder ? path.join(projectFolder, 'covers') : 'covers',
                        sceneIndex: 100 + i,
                        referenceImages: referenceImages,
                        onProgress: (p) => {
                            event.sender.send('studio-covers-progress', { coverIndex: i, total: coverTemplates.length, status: p.status, attempt: p.attempt });
                        }
                    });

                    if (savedPaths && savedPaths.length > 0 && fs.existsSync(savedPaths[0])) {
                        const targetCoverFile = path.join(coversDir, `cover_${i + 1}.jpg`);
                        fs.copyFileSync(savedPaths[0], targetCoverFile);
                        const imgBuffer = fs.readFileSync(targetCoverFile);
                        const base64Data = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

                        generatedCovers.push({
                            ...item,
                            imageUrl: base64Data,
                            fileName: `cover_${i + 1}.jpg`,
                            isSelected: i === 0
                        });

                        // Set first generated cover as initial default cover.jpg in project folder
                        if (i === 0) {
                            try {
                                fs.copyFileSync(targetCoverFile, path.join(targetProjectDir, 'cover.jpg'));
                            } catch (_) {}
                        }
                    } else {
                        generatedCovers.push({
                            ...item,
                            imageUrl: '',
                            fileName: `cover_${i + 1}.jpg`,
                            isSelected: false,
                            error: 'Failed to generate image'
                        });
                    }
                } catch (imgErr) {
                    console.error(`[Studio Covers] Failed cover #${i + 1}:`, imgErr.message);
                    generatedCovers.push({
                        ...item,
                        imageUrl: '',
                        fileName: `cover_${i + 1}.jpg`,
                        isSelected: false,
                        error: imgErr.message
                    });
                }
            }

            // Save covers metadata to covers.json
            const coversMetaPath = path.join(coversDir, 'covers.json');
            fs.writeFileSync(coversMetaPath, JSON.stringify({
                updatedAt: new Date().toISOString(),
                selectedCoverIndex: 0,
                covers: generatedCovers.map(c => ({
                    id: c.id,
                    styleId: c.styleId,
                    styleTitle: c.styleTitle,
                    badge: c.badge,
                    description: c.description,
                    prompt: c.prompt,
                    fileName: c.fileName,
                    isSelected: c.isSelected
                }))
            }, null, 2));

            event.sender.send('studio-covers-progress', { status: 'completed', total: 4 });
            return generatedCovers;
        } catch (e) {
            console.error('[Studio Covers] Error generating covers:', e);
            throw e;
        }
    });

    ipcMain.handle('studio-regenerate-single-cover', async (event, { projectFolder, coverIndex, prompt, imageModel, amazonProduct }) => {
        try {
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            const targetProjectDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;
            const coversDir = path.join(targetProjectDir, 'covers');
            if (!fs.existsSync(coversDir)) fs.mkdirSync(coversDir, { recursive: true });

            const cleanModel = imageModel ? imageModel.replace('freepik-', '') : 'nano_banana_2';
            const referenceImages = [];
            const getRefImg = () => {
                const candidates = [
                    { p: path.join(__dirname, 'genie_reference.png'), mime: 'image/png' },
                    { p: path.join(__dirname, 'genie_reference.jpg'), mime: 'image/jpeg' },
                    { p: path.join(__dirname, 'genie_reference.jpeg'), mime: 'image/jpeg' },
                    { p: path.join(__dirname, 'genie_reference.webp'), mime: 'image/webp' }
                ];
                for (const c of candidates) {
                    if (fs.existsSync(c.p)) {
                        try {
                            const buf = Buffer.alloc(16);
                            const fd = fs.openSync(c.p, 'r');
                            fs.readSync(fd, buf, 0, 16, 0);
                            fs.closeSync(fd);
                            let detectedMime = c.mime;
                            if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) detectedMime = 'image/png';
                            else if (buf[0] === 0xFF && buf[1] === 0xD8) detectedMime = 'image/jpeg';
                            else if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') detectedMime = 'image/webp';
                            return { path: c.p, mime: detectedMime };
                        } catch (_) {
                            return { path: c.p, mime: c.mime };
                        }
                    }
                }
                return null;
            };

            const refInfo = getRefImg();
            if (refInfo) {
                referenceImages.push({ data: `data:${refInfo.mime};base64,${fs.readFileSync(refInfo.path).toString('base64')}` });
                console.log(`[Studio Covers] Injected Génie reference image into single cover from ${refInfo.path} (${refInfo.mime})`);
            }

            // Reference image 2: Exact physical Amazon product
            let effectiveAmazonProduct = amazonProduct || null;
            if (!effectiveAmazonProduct && projectFolder) {
                try {
                    const metaPath = path.join(targetProjectDir, 'prompts.json');
                    if (fs.existsSync(metaPath)) {
                        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                        if (meta.amazonProduct) effectiveAmazonProduct = meta.amazonProduct;
                    }
                } catch (_) {}
            }
            if (!effectiveAmazonProduct && typeof prompt === 'string') {
                const match = prompt.match(/#(\d+)/);
                if (match) effectiveAmazonProduct = amazonManager.getByCode(match[1]);
            }

            if (effectiveAmazonProduct) {
                try {
                    const prodImg = await amazonManager.getProductImage(effectiveAmazonProduct, projectFolder);
                    if (prodImg && prodImg.data) {
                        referenceImages.push({ data: prodImg.data });
                        console.log(`[Studio Covers] Injected Amazon product reference #${effectiveAmazonProduct.code} into single cover #${coverIndex + 1} regeneration`);
                    }
                } catch (prodErr) {
                    console.warn(`[Studio Covers] Could not load product image for single cover:`, prodErr.message);
                }
            }

            console.log(`[Studio Covers] Regenerating cover #${coverIndex + 1}...`);
            const savedPaths = await ai.generateImage({
                prompt,
                model: cleanModel,
                count: 1,
                sectionDir: skeletonDir,
                subFolder: projectFolder ? path.join(projectFolder, 'covers') : 'covers',
                sceneIndex: 200 + coverIndex,
                referenceImages: referenceImages
            });

            if (!savedPaths || savedPaths.length === 0 || !fs.existsSync(savedPaths[0])) {
                throw new Error('Image generation returned empty result');
            }

            const targetCoverFile = path.join(coversDir, `cover_${coverIndex + 1}.jpg`);
            fs.copyFileSync(savedPaths[0], targetCoverFile);
            const imgBuffer = fs.readFileSync(targetCoverFile);
            const base64Data = `data:image/jpeg;base64,${imgBuffer.toString('base64')}`;

            return {
                coverIndex,
                imageUrl: base64Data,
                fileName: `cover_${coverIndex + 1}.jpg`
            };
        } catch (e) {
            console.error(`[Studio Covers] Failed to regenerate cover #${coverIndex + 1}:`, e);
            throw e;
        }
    });

    ipcMain.handle('studio-select-cover', async (event, { projectFolder, coverIndex }) => {
        try {
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            const targetProjectDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;
            const coversDir = path.join(targetProjectDir, 'covers');
            const sourceFile = path.join(coversDir, `cover_${coverIndex + 1}.jpg`);

            if (fs.existsSync(sourceFile)) {
                fs.copyFileSync(sourceFile, path.join(targetProjectDir, 'cover.jpg'));
                console.log(`[Studio Covers] Selected cover #${coverIndex + 1} as default project cover.jpg`);
            }

            const metaPath = path.join(coversDir, 'covers.json');
            if (fs.existsSync(metaPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    meta.selectedCoverIndex = coverIndex;
                    if (Array.isArray(meta.covers)) {
                        meta.covers.forEach((c, idx) => {
                            c.isSelected = idx === coverIndex;
                        });
                    }
                    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
                } catch (_) {}
            }

            return { success: true, selectedCoverIndex: coverIndex };
        } catch (e) {
            console.error('[Studio Covers] Error selecting cover:', e);
            throw e;
        }
    });

    ipcMain.handle('studio-get-covers', async (event, { projectFolder }) => {
        try {
            const skeletonDir = path.join(__dirname, 'SkeletonShorts');
            const targetProjectDir = projectFolder ? path.join(skeletonDir, projectFolder) : skeletonDir;
            const coversDir = path.join(targetProjectDir, 'covers');
            const metaPath = path.join(coversDir, 'covers.json');

            if (!fs.existsSync(metaPath)) return null;
            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
            const loadedCovers = [];

            if (Array.isArray(meta.covers)) {
                for (let i = 0; i < meta.covers.length; i++) {
                    const c = meta.covers[i];
                    const filePath = path.join(coversDir, c.fileName || `cover_${i + 1}.jpg`);
                    let imageUrl = '';
                    if (fs.existsSync(filePath)) {
                        const buf = fs.readFileSync(filePath);
                        imageUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
                    }
                    loadedCovers.push({
                        ...c,
                        imageUrl,
                        isSelected: (meta.selectedCoverIndex ?? 0) === i
                    });
                }
            }

            return {
                selectedCoverIndex: meta.selectedCoverIndex ?? 0,
                covers: loadedCovers
            };
        } catch (e) {
            console.error('[Studio Covers] Failed to get existing covers:', e);
            return null;
        }
    });
}

// Subtitles (Stub for brevity as it's complex, but I'll keep the core structure)
async function generateKaraokeSubtitles(videoPath, outputPath, sceneIdx) {
    const audioPath = videoPath.replace('.mp4', '.mp3');
    const assPath = videoPath.replace('.mp4', '.ass');
    execSync(`ffmpeg -i "${videoPath}" -vn -acodec libmp3lame -y "${audioPath}"`);

    const apiKey = process.env.POLLINATIONS_API_KEY?.trim();
    const audioBuffer = fs.readFileSync(audioPath);
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.mp3"\r\nContent-Type: audio/mpeg\r\n\r\n`),
        audioBuffer,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nscribe\r\n`),
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n`),
        Buffer.from(`--${boundary}--\r\n`)
    ]);

    const { statusCode, body: resBody } = await request('https://gen.pollinations.ai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
        },
        body
    });

    const data = JSON.parse(await resBody.text());
    const words = data.words || [];
    if (words.length === 0) { fs.copyFileSync(videoPath, outputPath); return; }

    const assContent = generateAssKaraoke(words);
    fs.writeFileSync(assPath, assContent);
    const escapedAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:');

    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', ['-i', videoPath, '-vf', `ass='${escapedAss}'`, '-c:v', 'libx264', '-y', outputPath]);
        ffmpeg.on('close', () => resolve(outputPath));
    });
}

function generateAssKaraoke(words) {
    let header = `[Script Info]\nScriptType: v4.00+\nPlayResX: 720\nPlayResY: 1280\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial Black,80,&H0000FF00,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,3,1,2,30,30,150,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;

    // Simple 4-word chunking
    const toAssTime = (sec) => {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2).padStart(5, '0');
        return `${h}:${String(m).padStart(2, '0')}:${s}`;
    };

    let events = "";
    for (let i = 0; i < words.length; i += 4) {
        const chunk = words.slice(i, i + 4);
        const start = toAssTime(chunk[0].start);
        const end = toAssTime(chunk[chunk.length - 1].end);
        let line = `Dialogue: 0,${start},${end},Default,,0,0,0,,`;
        let lastEnd = chunk[0].start;
        for (const w of chunk) {
            const dur = Math.max(1, Math.round(((w.end || w.start + 0.3) - w.start) * 100));
            const pause = Math.max(0, Math.round((w.start - lastEnd) * 100));
            if (pause > 0) line += `{\\k${pause}} `;
            line += `{\\k${dur}}${w.word} `;
            lastEnd = w.end || w.start + 0.3;
        }
        events += line + "\n";
    }
    return header + events;
}

// ────────────────────────────────────────────────────────────
//  Transition + Whoosh helpers
// ────────────────────────────────────────────────────────────

function getVideoDuration(filePath) {
    const str = execSync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    ).toString().trim();
    return parseFloat(str);
}

function generateWhooshSound(outputPath) {
    return new Promise((resolve, reject) => {
        let stderr = '';
        const child = spawn('ffmpeg', [
            '-f', 'lavfi', '-i', 'anoisesrc=d=0.35:c=pink:a=0.8,lowpass=f=2000,afade=t=in:d=0.1,afade=t=out:d=0.2',
            '-acodec', 'libmp3lame', '-ar', '44100', '-y', outputPath
        ]);
        
        child.stderr.on('data', data => { stderr += data.toString(); });
        
        child.on('close', code => {
            if (code === 0) resolve();
            else {
                console.error('[FFmpeg Whoosh Error]', stderr);
                reject(new Error('Whoosh generation failed: ' + stderr));
            }
        });
        child.on('error', reject);
    });
}

function createLateralTransition(clipA, clipB, whooshPath, outputPath, duration) {
    return new Promise((resolve, reject) => {
        const durA = getVideoDuration(clipA);
        const filter = [
            `[0:v]trim=${durA - duration}:${durA},setpts=PTS-STARTPTS[tail]`,
            `[1:v]trim=0:${duration},setpts=PTS-STARTPTS[head]`,
            `[tail]dblur=0:30[t_blur]`,
            `[head]format=rgba,colorchannelmixer=aa=1[head_rgba]`,
            `[t_blur][head_rgba]overlay=x='W*(1-t/${duration})':y=0,setpts=PTS-STARTPTS,format=yuv420p[outv]`,
            `[0:a]atrim=${durA - duration}:${durA},asetpts=PTS-STARTPTS[atail]`,
            `[1:a]atrim=0:${duration},asetpts=PTS-STARTPTS[ahead]`,
            `[atail][ahead]acrossfade=d=${duration}:c1=tri:c2=tri[across]`,
            `[2:a]volume=0.8,afade=t=in:d=0.02[whoosh]`,
            `[across][whoosh]amix=inputs=2:duration=first:weights=1 0.5[outa]`
        ].join(';');

        let stderr = '';
        const child = spawn('ffmpeg', [
            '-i', clipA, '-i', clipB, '-i', whooshPath,
            '-filter_complex', filter,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-y', outputPath
        ]);
        
        child.stderr.on('data', data => { stderr += data.toString(); });
        
        child.on('close', code => {
            if (code === 0) resolve();
            else {
                console.error('[FFmpeg Transition Error]', stderr);
                reject(new Error(`Transition failed: ` + stderr));
            }
        });
        child.on('error', reject);
    });
}

function trimClip(inputPath, outputPath, startTrim, endTrim) {
    return new Promise((resolve, reject) => {
        const dur = getVideoDuration(inputPath);
        const newDur = dur - startTrim - endTrim;
        if (newDur <= 0.01) {
            fs.copyFileSync(inputPath, outputPath);
            return resolve();
        }
        const child = spawn('ffmpeg', [
            '-i', inputPath,
            '-filter_complex',
            `[0:v]trim=${startTrim}:${dur - endTrim},setpts=PTS-STARTPTS[outv];[0:a]atrim=${startTrim}:${dur - endTrim},asetpts=PTS-STARTPTS[outa]`,
            '-map', '[outv]', '-map', '[outa]',
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-y', outputPath
        ]);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`Trim failed: code ${code}`)));
        child.on('error', reject);
    });
}

function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
        const child = spawn('ffmpeg', args);
        child.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg failed: code ${code}`)));
        child.on('error', reject);
    });
}

function cleanTempDir(tempDir) {
    if (!fs.existsSync(tempDir)) return;
    try {
        const files = fs.readdirSync(tempDir);
        for (const f of files) fs.unlinkSync(path.join(tempDir, f));
        fs.rmdirSync(tempDir);
    } catch (_) { /* best-effort */ }
}

module.exports = { registerSkeletonHandlers };

