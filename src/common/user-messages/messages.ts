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

export const getDiffProgressMessage = (key: keyof typeof DIFF_MESSAGES.DIFF_PROGRESS): string => {
    const messages = DIFF_MESSAGES.DIFF_PROGRESS[key];
    const message = Array.isArray(messages) 
        ? messages[Math.floor(Math.random() * messages.length)]
        : messages;
    return message;
}; 

export const LICENSE_MESSAGES = {
    REQUIRE_LICENSE: 'To get started with Mode, you\'ll need a license key, which includes a free trial.',
    INVALID_LICENSE: 'Hmm, that license key doesn\'t seem to work. Need help? Contact support@getmode.dev',
    FAILED_VALIDATION: 'Unable to verify your license right now. Please check your connection.',
    FAILED_DEACTIVATION: 'Unable to deactivate your license right now. Please check your connection.',
    ACTIONS: {
        ENTER_LICENSE: 'Enter License',
        PURCHASE_LICENSE: 'Get License',
        TRY_AGAIN: 'Try Again',
        CONTACT_SUPPORT: 'Get Help'
    },
    LICENSE_PROMPT: 'Enter your Mode license key',
    LICENSE_PLACEHOLDER: 'License Key'
};


