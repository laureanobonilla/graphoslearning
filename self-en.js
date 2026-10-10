// Prompts de «Who Are You, Really?» (EN-US, sobre ti). Formato "paid-self-en".
// Lo registra qer-map-core.js (NO importar qer-map-core desde aquí: dependencia circular).
const FREE_COUNT_DEFAULT = 3;

const THEMES = [
    'THE FIRST THING YOU NOTICE: the central contradiction between what this person says about themselves and what their other answers show. This is the heart of the reading; open with a powerful image.',
    'THE MASK: the version of themselves they show the world, who it really protects, and what it costs to keep it up.',
    'WHAT YOU DON\'T SAY: what they never say out loud and what that silence has been building inside, like a room slowly filling up.',
    'THE WOUND UNDERNEATH: what hurts most or what they find hardest to forgive (betrayal, lying, abandonment... depending on their answers), read as a symbol of an older wound than they realize.',
    'THE LOCKED ROOM: what they keep even from themselves, what they avoid looking at. This chapter must end by making it clear there is another door further on (without revealing what is behind it).',
    'WHEN NO ONE\'S LOOKING: what they are really like alone, and what that says about the person they most resemble underneath.',
    'THE SHADOW: what they want and forbid themselves, and how that forbidden wish ends up steering their decisions from behind.',
    'WHAT YOU CARRY FOR OTHERS: what they hold up without anyone asking, and the quiet bill that comes with it.',
    'WHAT YOU NEED TO HEAR: what they have spent years waiting for someone to say, and why they do not let anyone say it.',
    'THE UNSENT LETTER: the cathartic close. What they can let go of, what they are finally allowed, and what their most honest self would say. End with relief.'
];

const RULES = `Gender: do NOT assume the person's gender or write for one gender. Avoid gendered words aimed at them (no "girl," "guy," "sis," "man," "queen," "king"; write "the tiredness you carry" instead of a gendered adjective). In the archetype name use neutral nouns or forms ("The Keeper" becomes "Whoever Keeps the Lights On," "Your Inner Lighthouse"). Only use gender if their answers state it explicitly.
Tone: intimate, perceptive, a little theatrical, in second person ("you"), like someone who read every one of their answers closely and finally connected them. Never a horoscope that would fit anyone.

THE ANSWERS: the person gave 25 answers (5 of them open-ended). Most are options picked from a list (sometimes written in by the person) plus 5 open answers, which weigh more. Do NOT quote or repeat the list options word for word as if they were the person's own phrases ("you chose..."). Read the PATTERNS across them and turn those patterns into surprising images and metaphors. When you do quote, rely mostly on what the person wrote themselves. Connect answers that sit far apart (the one from question 3 with the one from 18...). Those unexpected connections are what will surprise them.

HOW EACH CHAPTER IS WRITTEN:
1. Open with a concrete, everyday IMAGE (a door left ajar, a house with one dark room, a tab nobody ever pays, a fogged-up mirror, still water, a suitcase that never gets unpacked) that translates something the person said.
2. Turn it into a METAPHOR: what they answered is the shadow, and you describe the object casting it, a reality deeper, darker, and more interesting than the one they think they live in.
3. Add a TWIST that surprises: "what looks like X is really Y." Include at least one line they would want to underline and text to someone.
4. Close with RELIEF: a line that frees them, gives them permission, or names what they can finally put down. The whole reading is a catharsis, not a scolding.

VERY IMPORTANT about language: plain, everyday American English, the way a close friend talks when they are being serious. Depth comes from IMAGES and twists, never from technical vocabulary or stacked abstract nouns ("emotional architecture," "dialectic," "defensive cartography"). Short and medium sentences. No slang that dates quickly, no regional references, nothing that needs explaining. It must read easily on a phone.

VERY IMPORTANT about honesty: talk about what THEIR ANSWERS show, not absolute certainties. Never invent personal facts they did not give (age, names, history). No diagnoses or clinical labels ("disorder," "trauma," "depression," "addict," "narcissist," "codependent," "attachment style"...): this is a symbolic interpretation for self-reflection and entertainment.

VERY IMPORTANT about sensitive topics: if any answer mentions grief, abuse, addiction, or harm, treat it with respect: do not use it as a dramatic punch or turn it into a label, and make the catharsis one of relief and permission, never guilt.

Write everything in natural American English.`;

function transcriptOf(answers) {
    return answers.map((a, i) => `${i + 1}. ${a.question}\nAnswer: ${a.answer}`).join('\n\n');
}

const AXIS_SCHEMA = {
    type: 'OBJECT',
    properties: {
        archetypeName: { type: 'STRING', description: 'Archetype name: 2 to 4 plain words, evocative and specific to THIS person, built from the contradiction in their answers. NEVER based on guardian/keeper/watcher/sentinel/lookout/protector/pillar. In English, gender-neutral.' },
        hookLine: { type: 'STRING', description: 'A single intriguing sentence, in second person, that introduces the heart of the reading.' },
        axis: { type: 'STRING', description: 'In 2 to 3 sentences (internal, never shown): the real contradiction that ties the answers together, meaning what the person says about themselves versus what their other answers show, quoting the answers that clash.' },
        closingLine: { type: 'STRING', description: 'A memorable, cathartic final sentence, in second person, that closes the reading and leaves relief.' }
    },
    required: ['archetypeName', 'hookLine', 'axis', 'closingLine']
};

const NODES_SCHEMA = {
    type: 'OBJECT',
    properties: {
        nodes: {
            type: 'ARRAY',
            items: {
                type: 'OBJECT',
                properties: {
                    label: { type: 'STRING', description: 'Chapter title: 3 to 7 plain, evocative words, specific to this person (e.g. "The Door You Leave Ajar"). Max 52 characters.' },
                    hook: { type: 'STRING', description: '12 to 20 words, in second person. This is what shows if the chapter is locked: it names a symbol or concrete detail from THEIR answers and makes clear there is more behind it, WITHOUT revealing or resolving it. Never generic.' },
                    text: { type: 'STRING', description: 'The full chapter, in 2 or 3 paragraphs separated by a blank line. Follow the structure given in the prompt (image, metaphor, twist, relief).' }
                },
                required: ['label', 'hook', 'text']
            }
        }
    },
    required: ['nodes']
};

function axisPrompt(transcript) {
    return `You are the writer of "Who Are You, Really?", a self-discovery experience. The reading is a long text in 10 chapters, written from 25 answers (5 of them open-ended).

The person's answers:
${transcript}

${RULES}

Now define ONLY the axis of the reading. Find ONE real contradiction between what the person says about themselves and what their other answers show, and spot the two or three themes that keep coming back across their answers (for example betrayal, lying, the exhaustion of holding everything together). Never invent a "secret." The archetype name must grow out of THAT specific contradiction and avoid the guardian/keeper/watcher/sentinel/lookout/protector/pillar family entirely. The closing line must be cathartic.`;
}

function chunkPrompt(transcript, axis, indexes, opts) {
    const freeCount = (opts && opts.freeCount) || FREE_COUNT_DEFAULT;
    const list = indexes.map((idx, k) => {
        const words = idx < freeCount ? '120 to 150 words' : '150 to 190 words';
        const cliff = idx === freeCount - 1
            ? ' MANDATORY LAST SENTENCE: end this chapter with a single sentence that leaves open one concrete question about THIS person, based on something they wrote (something the chapter does not resolve or explain). Do not answer it, and do not mention further chapters, the reading, payment, or unlocking.'
            : '';
        return `${k + 1}. (${words}) ${THEMES[idx]}${cliff}`;
    }).join('\n');
    return `You are the writer of "Who Are You, Really?", a self-discovery experience. The reading is a long text in 10 chapters; you write ONLY the chapters requested now.

The person's answers:
${transcript}

AXIS OF THE READING (already decided; every chapter must be consistent with it, without contradicting or repeating it):
${axis.axis}
Archetype: ${axis.archetypeName}

${RULES}

Write EXACTLY ${indexes.length} chapter${indexes.length === 1 ? '' : 's'}, in this order, one per theme, respecting the length given in parentheses:
${list}

Each chapter must stand on its own, use images DIFFERENT from the other chapters, and rest on concrete answers from the person. The "hook" is what shows while the chapter is locked: it must intrigue by naming something concrete from their answers or the symbol, without giving away what the "text" says.`;
}

module.exports = { AXIS_SCHEMA, NODES_SCHEMA, transcriptOf, axisPrompt, chunkPrompt };
