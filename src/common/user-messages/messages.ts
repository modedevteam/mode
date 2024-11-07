export const DIFF_MESSAGES = {
    TITLE: 'Mode suggested changes',
    PROGRESS_TITLE: 'Applying changes',
    DIFF_PROGRESS: {
        CREATING_TEMP: [
            '🏗️ Creating temporary hideout for your code...',
            '🏗️ Building a cozy shelter for your code...',
            '🏗️ Preparing a temporary code vault...'
        ],
        READING_CODE: [
            '📚 Speed-reading your code like a caffeinated developer...',
            '📚 Scanning your code faster than a compiler...',
            '📚 Processing your code at light speed...'
        ],
        WAKING_AI: [
            '🤖 Waking up the AI from its power nap...',
            '🤖 Booting up the AI engines...',
            '🤖 Summoning the AI from its digital slumber...'
        ],
        CHUNKING: [
            '✂️ Chopping your code into bite-sized pieces (nom nom)...',
            '✂️ Slicing and dicing your code with precision...',
            '✂️ Breaking down your code into manageable chunks...'
        ],
        SETTING_DIFF: [
            '🎭 Staging the ultimate code showdown (no pressure)...',
            '🎭 Unleashing the diff-pocalypse in 3... 2... 1...',
            '🎭 Loading the code thunderdome... *dramatic music intensifies*',
        ],
        AI_PROCESSING: [
            '🧠 Mode and the AI doing their magic (definitely not playing chess)...',
            '🧠 AI working its algorithmic wizardry...',
            '🧠 Neural networks crunching your code...'
        ],
        FINAL_TOUCHES: [
            '🎨 Adding final artistic touches...',
            '🎨 Putting on the finishing touches...',
            '🎨 Polishing the final details...'
        ],
        TOKEN_PROGRESS: [
            '🤔 Overthinking this at... {0}%',
            '🔧 Adding unnecessary complexity... {0}%',
            '⚙️ Making it way more complicated than needed... {0}%',
            '🎯 Trying way too hard... {0}%',
            '🔄 Refactoring the refactor... {0}%',
            '⚡ Writing a thesis about this simple task... {0}%',
            '🎨 Adding more frameworks just because... {0}%'
        ]
    }
};

export const getProgressMessage = (key: keyof typeof DIFF_MESSAGES.DIFF_PROGRESS): string => {
    const messages = DIFF_MESSAGES.DIFF_PROGRESS[key];
    return Array.isArray(messages) 
        ? messages[Math.floor(Math.random() * messages.length)]
        : messages;
}; 
