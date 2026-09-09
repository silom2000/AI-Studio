const fs = require('fs');

const path = 'skeleton-handlers.cjs';
let content = fs.readFileSync(path, 'utf8');

// The block to replace starts around line 1526, right after "11. DENSE CONTENT & CHARISMATIC WISDOM:"
const newRulesText = `            11. DENSE CONTENT & CHARISMATIC WISDOM:
                 * NO filler words, NO non-verbal laughs or sound pauses.
                 * Natural dialogue pacing: aim for 18-22 words per scene to keep the viewer engaged throughout the whole 8 seconds.
                 * The Little Genius speaks directly to the viewer with playful enthusiasm, clarity, and contagious confidence.
            12. STORYTELLING RULE — THE EMOTIONAL PENDULUM (RETENTION):
                 To maximize viewer retention, you MUST alternate exactly between creating tension/intrigue (Peaks) and giving solutions/comfort (Valleys) in the dialogue.
                 * PEAKS (Tension/Conflict): Use phrases like "Но не всё так просто..." (But it's not that simple...), "И вот тут начинаются вопросы..." (And here the questions begin...), "Внимательные зрители могут заметить..." (Attentive viewers might notice...), "Будьте готовы к тому, что..." (Be prepared that...).
                 * VALLEYS (Relief/Solution): Use phrases like "Как всегда, есть и хорошие новости!" (As always, there is good news!), "Эта проблема легко решается." (This problem is easily solved.), "И тут мы вспоминаем про..." (And here we remember...), "К нашей радости, очевидно, что..." (To our joy, it's obvious...).`;

content = content.replace(/11\. DENSE CONTENT & CHARISMATIC WISDOM:[\s\S]*?contagious confidence\./, newRulesText);

// Fix the userPrompt for health mode (Lines 1551+)
const userPromptRegex = /userPrompt = `Create a viral HEALTH & NUTRITION short script[\s\S]*?Rotate Variants \(A, B, C, D\) for each scene\./;

const newUserPrompt = `userPrompt = \`Create a viral short script with EXACTLY \${isShort ? '5' : '8'} scenes for: "\${effectiveTopic}".
            \${localVideoData ? \`\nUPLOADED VIDEO ANALYSIS — ADAPT THIS CONTENT FOR LA PETITE GÉNIE IN \${langName.toUpperCase()}:\n"""\n\${localVideoData.combinedSummary}\n"""\n\` : ''}
            \${screenshotData ? \`\nSCREENSHOT CONTENT — ADAPT THESE FACTS FOR LA PETITE GÉNIE IN \${langName.toUpperCase()}:\n"""\n\${screenshotData.text}\n"""\n\` : ''}
            \${refData ? \`\nREFERENCE VIDEO TRANSCRIPT (ADAPT THIS EXACT STORY FOR LA PETITE GÉNIE IN \${langName.toUpperCase()}):\n"""\n\${refData.transcript}\n"""\n\` : ''}
            The narrator is a cute and charismatic little girl genius (маленький вундеркинд) in round glasses and a lab coat. She has an incredibly high IQ and explains complex topics (lifehacks, science, history, psychology) using brilliant logic, but still views the world through a charming, slightly naive childlike lens (using cute metaphors like comparing a black hole to a vacuum cleaner swallowing her Legos).

            ⚠️ MANDATORY EMOTIONAL PENDULUM: You MUST alternate between Tension/Intrigue and Relief/Solutions across the scenes using the required phrases.

            WORD COUNT RULES — HARD LIMIT FOR 8-SECOND VIDEO:
            \${isShort ? \`
            - Scene 1 (THE HOOK): 18-22 words. Start with a bizarre fact or paradox.
            - Scene 2 (PEAK - TENSION): 18-22 words. Use a Tension phrase to introduce the conflict or complication.
            - Scene 3 (VALLEY - RELIEF): 18-22 words. Use a Relief phrase to offer the genius solution or comforting fact.
            - Scene 4 (PEAK - PLOT TWIST): 18-22 words. Another complication or an advanced intellect fact wrapped in a childlike metaphor.
            - Scene 5 (VALLEY & CTA): 18-22 words. Final simple logical conclusion using a Relief phrase + follow prompt in a smart-kid style.
            \` : \`
            - Scene 1 (THE HOOK): 18-22 words. A scroll-stopping fact or paradox.
            - Scene 2 (PEAK - TENSION): 18-22 words. Introduce the problem using a Tension phrase ("Но не всё так просто...").
            - Scene 3 (THE SCIENCE / METAPHOR): 18-22 words. Explain the detail with a cute childlike comparison.
            - Scene 4 (VALLEY - RELIEF): 18-22 words. Offer a comforting fact or solution using a Relief phrase ("Эта проблема легко решается.").
            - Scene 5 (PEAK - TENSION): 18-22 words. Unexpected twist or deeper problem using a Tension phrase.
            - Scene 6 (THE GENIUS FIX): 18-22 words. Hard intellectual fact delivered simply.
            - Scene 7 (VALLEY - RELIEF): 18-22 words. Simple logical conclusion using a Relief phrase.
            - Scene 8 (CLOSING & CTA): 18-22 words. Final clever punchline + subscribe prompt in her unique style.
            \`}

            Rotate Variants (A, B, C, D) for each scene.\`;`;

if (userPromptRegex.test(content)) {
    content = content.replace(userPromptRegex, newUserPrompt);
    fs.writeFileSync(path, content, 'utf8');
    console.log("Successfully inserted Genius little girl + Emotional pendulum into skeleton-handlers.cjs");
} else {
    console.log("Regex for user prompt failed.");
}
