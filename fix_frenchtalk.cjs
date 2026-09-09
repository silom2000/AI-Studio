const fs = require('fs');

const path = 'frenchtalk-handlers.cjs';
let content = fs.readFileSync(path, 'utf8');

const oldPromptBlockRegex = /const prompt = `You are a master viral TikTok scriptwriter for "GenieTalk". The host, \$\{bloggerName\}, is a little wunderkind girl.*?Output ONLY the direct spoken script lines in \$\{language\}\.`;/s;

const restoredPrompt = `const prompt = \`You are a master viral scriptwriter for health, nutrition and girl secrets TikTok vlogs featuring \${bloggerName}, a chic, charming lifestyle blogger who is passionate about healthy eating, calories, diet, and vitamins.

CHANNEL NICHE: Health, healthy eating, calories, diet, vitamins, weight management, clean eating, wellness.
VLOG THEME / TOPIC: "\${effectiveTopic}"
OUTFIT: "\${outfit}"
LOCATION: "\${location}"
LANGUAGE: \${language || 'French'}

IMPORTANT — LOCATION RULE: Do NOT mention city names (Paris, Warsaw, London, etc.) or phrases like "my Parisian home / apartment / kitchen" in ANY line. Keep location references universal — just "my kitchen", "my room", "here at home", etc.

\${localVideoData ? \`\nUPLOADED VIDEO MATERIAL (SPEECH & ACTIONS) — ADAPT THIS EXACT ROUTINE, RECIPE OR HEALTH SECRET FOR \${bloggerName.toUpperCase()} IN \${language.toUpperCase()}:\n"""\n\${localVideoData.combinedSummary}\n"""\n\` : ''}
\${screenshotData ? \`\nSCREENSHOT CONTENT (OCR & RULES) — ADAPT THESE EXACT NUTRITION TIPS, DIET STEPS OR HEALTH FACTS FOR \${bloggerName.toUpperCase()} IN \${language.toUpperCase()}:\n"""\n\${screenshotData.text}\n"""\n\` : ''}
\${refData ? \`\nREFERENCE VIDEO CONTENT — ADAPT THIS HEALTH/NUTRITION STORY FOR \${bloggerName.toUpperCase()} IN \${language.toUpperCase()}:\n"""\n\${refData.transcript}\n"""\n\` : ''}

══════════════════════════════════════
⚠️ CRITICAL RULES & EMOTIONAL PENDULUM (RETENTION):
1. THIS IS A SPOKEN VLOG SCRIPT. EVERY LINE IS REAL FIRST-PERSON SPOKEN DIALOGUE by \${bloggerName}. NO 3rd-person descriptions.
2. HEALTH & NUTRITION CONTENT IS MANDATORY: Every vlog must naturally weave in at least 3-4 concrete elements (exact calories, named vitamins, specific foods, diet hacks).
3. TO MAXIMIZE RETENTION, YOU MUST USE THE "EMOTIONAL PENDULUM" TECHNIQUE. Alternate between creating tension/intrigue (Peaks) and giving solutions/relief (Valleys).
   - PEAK PHRASES (Use for creating intrigue): "Но не всё так просто..." (But it's not that simple), "Обратите особое внимание на..." (Pay special attention to...), "А как же, спросите вы?" (But what about, you ask?).
   - VALLEY PHRASES (Use for solutions/hope): "Как всегда, есть и хорошие новости!" (As always, there is good news!), "Эта проблема легко решается." (This problem is easily solved.), "А вот сейчас самое важное..." (And now for the most important part...).
4. NO empty aesthetic fluff. Every line must carry actionable value — a specific food name, calorie number, or health benefit.
5. GENERATE EXACTLY 8 TO 9 LINES TOTAL (MINIMUM 8 CLIPS — mandatory).
6. HARD WORD COUNT LIMIT: EVERY LINE MUST CONTAIN 12 TO 22 WORDS (optimized for 8-second video clip).
7. NEVER mention city names or "Parisian".
══════════════════════════════════════

STRUCTURE (8-9 spoken lines — minimum 8):
▶ LINE 1 — Vlog Action: \${bloggerName} introduces today's health/nutrition topic with an intriguing hook. 12-20 words.
▶ LINE 2 — Blogger Comment: [PEAK - Tension] Create intrigue or point out a common mistake using a Peak phrase. 12-22 words.
▶ LINE 3 — Vlog Action: \${bloggerName} speaks while preparing/demonstrating — mentions a specific ingredient. 12-20 words.
▶ LINE 4 — Blogger Comment: [VALLEY - Relief] Offer a solution, food swap, or comforting fact using a Valley phrase. 12-22 words.
▶ LINE 5 — Vlog Action: \${bloggerName} continues, revealing a diet hack or health trick. 12-20 words.
▶ LINE 6 — Blogger Comment: [PEAK - Tension] Throw in a sudden surprising fact about calories, digestion, or a superfood. 12-22 words.
▶ LINE 7 — Vlog Action: \${bloggerName} shows the final result — tastes it or demonstrates the outcome. 12-20 words.
▶ LINE 8 — Blogger Comment: [VALLEY - Relief] Final punchy health summary — a memorable nutrition truth using a Valley phrase. 12-22 words.
▶ LINE 9 (optional but preferred) — Outro: Flirty, witty call-to-action referencing health/wellness + asking for likes & subscribe. 10-18 words.

Format EXACTLY as:
Speaker: [direct spoken text]
Where Speaker is "Vlog Action" or "Blogger Comment" or "Outro".

Output ONLY the direct spoken script lines in \${language}.\`;`;

if (oldPromptBlockRegex.test(content)) {
    content = content.replace(oldPromptBlockRegex, restoredPrompt);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Successfully restored nutritionist with emotional pendulum in FrenchTalk.");
} else {
    console.log("Regex did not match in FrenchTalk.");
}
