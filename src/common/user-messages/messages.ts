export const DIFF_MESSAGES = {
    TITLE: 'Mode suggested changes',
    PROGRESS_TITLE: 'Applying changes',
    DIFF_PROGRESS: {
        WAKING_AI: [
            '🤖 Waking AI...',
            '🤖 Booting up...',
            '🤖 Loading AI...'
        ],
        AI_PROCESSING: [
            '🤔 Overthinking...',
            '🔧 Overcomplicating...',
            '⚙️ Making it complex...',
            '🎯 Trying too hard...',
            '🔄 Re-refactoring...',
            '⚡ Writing thesis...',
            '🎨 Adding frameworks...'
        ]
    }
};

export const getProgressMessage = (key: keyof typeof DIFF_MESSAGES.DIFF_PROGRESS): string => {
    const messages = DIFF_MESSAGES.DIFF_PROGRESS[key];
    const message = Array.isArray(messages) 
        ? messages[Math.floor(Math.random() * messages.length)]
        : messages;
    return message;
}; 
