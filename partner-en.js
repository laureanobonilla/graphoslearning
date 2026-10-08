// Prompts for "Who Is Your Partner, Really?" (EN-US, about the respondent's partner).
// Self-contained on purpose: do NOT require qer-map-core (circular dependency).
// Used by qer-map-core via registerPaid('paid-partner-en', './qer-prompts/partner-en').

const THEMES = [
    'WHAT YOU NOTICE FIRST: the central contradiction between how your partner presents themselves and what the other answers suggest. This is the heart of the reading; open with a powerful image.',
    'THE MASK: the version of themselves your partner shows the world, who it protects, and what it costs them to keep it on.',
    'WHAT THEY LEAVE UNSAID: what your partner does not say out loud and what that silence has been building, like a room slowly filling up.',
    'THE OLD WOUND: what hurts them most or what they struggle to forgive (betrayal, a lie, being left... whatever the answers suggest), read as the sign of a wound older than the one they would name.',
    'THE CLOSED ROOM: what your partner keeps even from themselves, what they avoid looking at. This chapter ends by making clear there is a door further ahead (without revealing what is behind it).',
    'WHEN YOU\'RE NOT THERE: who your partner is when you are not in the room, and what that says about the person closest to who they really are.',
    'THE SHADOW: what your partner wants and forbids themselves, and how that forbidden wish ends up steering their choices from behind.',
    'WHAT THEY CARRY: what your partner holds up for others without being asked, and the quiet bill for doing it.',
    'WHAT THEY NEED TO HEAR: what your partner has been waiting years for someone to say, and why they do not let anyone say it.',
    'THE UNSENT LETTER: the closing chapter. Include a MIRROR: how the person answering sees their partner, and what that view says about the relationship between them (what they notice, what they have avoided saying, what they might want to say). Then what can be set down, what is finally allowed, and what the most honest version of this partner might say. End with relief.'
];

const RULES = `Gender: do NOT assume the gender or sex of the partner or of the person answering, and do not write for one gender. Use "your partner" and "you". Use "they/them" only when truly unavoidable; prefer rewording ("what your partner keeps to themselves" is fine; better: "the silence your partner keeps"). Avoid gendered nouns and pronouns (no he, she, boyfriend, girlfriend, husband, wife) unless the answers state it explicitly. In the archetype name use neutral nouns or forms (e.g. "The Open Window With the Curtain Drawn", "Quiet Weather").
Point of view: the person answering is describing THEIR PARTNER, not themselves. The reading is about the partner and is addressed to the person answering, in second person ("you"), speaking about "your partner". Everything you say is based on how that person SEES their partner, never on certain knowledge of the partner.
Tone: intimate, perceptive and a little theatrical, like someone who truly read every answer and finally connected them, never like a horoscope that would fit anyone. Natural American English, as a thoughtful friend would say it. Not a translation.

THE ANSWERS: they are mostly options picked from a list (sometimes typed in by the person) plus 5 open answers, which weigh more. Do NOT quote or repeat the picked options as if they were the person's own phrases (never write "you chose..." or "you picked..."). Read the PATTERNS across them and turn those patterns into surprising images and metaphors. When you quote, quote mostly what the person wrote themselves (the open answers and any typed-in options). Connect answers that are far apart; those unexpected connections are what will surprise them.

HOW EACH CHAPTER IS WRITTEN:
1. Open with a concrete, everyday IMAGE (a door left ajar, a house with one unlit room, a debt nobody collects, a fogged-up mirror, still water, a suitcase never unpacked) that translates something the person said about their partner.
2. Turn it into a METAPHOR: what the answers describe is the shadow; you describe the object casting it, a deeper and more interesting reality than the one it appears to be.
3. Add a TWIST that surprises: "what looks like X is really Y". Include at least one sentence the reader would want to underline and send to someone.
4. Close with RELIEF: a sentence that frees, gives permission or names what can finally be set down. The whole reading is a catharsis, not a scolding, and never a verdict on your partner.

VERY IMPORTANT on language: simple, everyday words, the ones a friend uses when talking seriously. Depth comes from IMAGES and twists, never from technical vocabulary or chains of abstract nouns ("emotional architecture", "dialectic", "defensive cartography"). Short and medium sentences. It must be easy to follow on a phone.

VERY IMPORTANT on honesty: talk about what THE ANSWERS suggest, as seen through the eyes of the person answering. It is their view of another person, not the truth about that person. Say so naturally where it fits ("from where you stand", "the way you describe it"). Never invent facts they did not give (ages, names, history, events, how long they have been together). No diagnoses and no clinical or damaging personality labels: never use words like narcissist, toxic, manipulative, abuser, abusive, gaslighting, trauma, disorder, depression, addict, borderline, codependent. It is a symbolic interpretation for entertainment and self-reflection.

VERY IMPORTANT on sensitive topics: if any answer mentions fear, control, violence, cheating, addiction, grief or harm, treat it with respect. Do not dramatize it, do not use it as a dramatic blow, and do not turn the partner into a label or a villain. Describe what was said in plain, gentle words. If anything in the answers suggests the person answering may be at risk, feeling afraid, controlled or unsafe, include one soft line inviting them to talk with someone they trust (a close friend, a family member, or a professional); do not diagnose the relationship. Make the catharsis one of relief and permission, never of guilt or blame.

Answers to "what's the first thing you see" style questions are projections: you may use them as light symbols, without clinical meaning.`;

function transcriptOf(answers) {
    return answers.map((a, i) => `${i + 1}. ${a.question}\nAnswer (about their partner): ${a.answer}`).join('\n\n');
}

const AXIS_SCHEMA = {
    type: 'OBJECT',
    properties: {
        archetypeName: { type: 'STRING', description: 'Archetype name for THE PARTNER: 2 to 4 simple, evocative words, specific to this partner as the respondent describes them. Gender-neutral. NEVER built on guardian/keeper/watchman/sentinel/lookout/protector/pillar. Never a clinical or damaging label. In American English.' },
        hookLine: { type: 'STRING', description: 'One intriguing sentence, in second person, addressed to the person answering, introducing the center of the reading about their partner.' },
        axis: { type: 'STRING', description: 'In 2 to 3 sentences (internal, not shown): the real contradiction running through the answers about the partner. What the partner seems to show versus what the other answers suggest, quoting the answers that clash. Written as the respondent\'s view, not as fact.' },
        closingLine: { type: 'STRING', description: 'One memorable, cathartic closing sentence, in second person, addressed to the person answering, that ends the reading with relief.' }
    },
    required: ['archetypeName', 'hookLine', 'axis', 'closingLine']
};

function axisPrompt(transcript) {
    return `You write "Who Is Your Partner, Really?", an entertainment and self-reflection experience. The person you are writing for answered 25 questions about THEIR PARTNER. The reading is a long text in 10 chapters about that partner, as seen through the eyes of the person answering.

Answers (the person describing their partner):
${transcript}

${RULES}

Now define ONLY the axis of the reading. Find ONE real contradiction in how the person describes their partner: what the partner shows versus what the other answers suggest underneath. Also notice the two or three themes that keep coming back across the answers (for example something left unsaid, a way of avoiding, a thing the partner carries). Never invent a "secret". The archetype name must come from THAT specific contradiction and avoid the guardian/keeper/watchman/sentinel/lookout/protector/pillar field entirely, and must never be a clinical or harsh label. The closing line must be cathartic.`;
}

const NODES_SCHEMA = {
    type: 'OBJECT',
    properties: {
        nodes: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    label: { type: 'STRING', description: 'Chapter title: 3 to 7 simple, evocative words, specific to this partner (e.g. "The Door Left Ajar"). Max 52 characters. American English.' },
                    hook: { type: 'STRING', description: '12 to 20 words, second person. This is what shows if the chapter is locked: name one symbol or concrete detail from THEIR answers about the partner and make clear there is more behind it, WITHOUT revealing or resolving it. Never generic.' },
                    text: { type: 'STRING', description: 'The full chapter, in 2 or 3 paragraphs separated by a blank line. Follow the structure in the prompt (image, metaphor, twist, relief). It is about the partner, addressed to the person answering.' }
                },
                required: ['label', 'hook', 'text']
            }
        }
    },
    required: ['nodes']
};

function chunkPrompt(transcript, axis, indexes, opts) {
    const freeCount = (opts && opts.freeCount) || 3;
    const list = indexes.map((idx, k) => {
        const words = idx < freeCount ? '120 to 150 words' : '150 to 190 words';
        // The last free chapter ends on an open question about THIS partner (narrative suspense).
        const cliff = idx === freeCount - 1
            ? ' MANDATORY LAST SENTENCE: end this chapter with a single sentence that leaves open one concrete question about THIS partner, based on something the person wrote (something the chapter does not resolve or explain). Do not answer it, and do not mention later chapters, the reading, payment or unlocking.'
            : '';
        return `${k + 1}. (${words}) ${THEMES[idx]}${cliff}`;
    }).join('\n');
    return `You write "Who Is Your Partner, Really?", an entertainment and self-reflection experience. The reading is a long text in 10 chapters about the partner of the person answering; you write ONLY the chapters requested now.

Answers (the person describing their partner):
${transcript}

AXIS OF THE READING (already decided; every chapter must be consistent with it, without contradicting or repeating it):
${axis.axis}
Archetype: ${axis.archetypeName}

${RULES}

Write EXACTLY ${indexes.length} chapters, in this order, one per theme, respecting the length given in parentheses:
${list}

Each chapter must stand on its own, use DIFFERENT images from the other chapters, and rest on concrete answers from the person (quote or paraphrase). The "hook" is what shows when the chapter is locked: it must intrigue by naming something concrete from their answers or the symbol, without giving away what the "text" says.`;
}

module.exports = { AXIS_SCHEMA, NODES_SCHEMA, transcriptOf, axisPrompt, chunkPrompt };
