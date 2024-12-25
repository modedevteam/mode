/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const DIFF_MESSAGES = {
    TITLE: 'Mode suggested changes',
    PROGRESS_TITLE: 'Applying changes',
    DIFF_PROGRESS: {
        SETUP: [
            '🚀 Initializing diff engine...',
            '🔧 Setting up workspace...',
            '⚙️ Preparing environment...'
        ],
        FILE_PROCESSING: [
            '📄 Reading file contents...',
            '📝 Analyzing code structure...',
            '🔍 Scanning file...'
        ],
        AI_INIT: [
            '🤖 Waking AI...',
            '🤖 Booting up AI engine...',
            '🤖 Loading AI models...'
        ],
        AI_PROCESSING: [
            '🧠 Analyzing changes...',
            '⚡ Processing modifications...',
            '🔄 Generating diff...',
            '✨ Crafting improvements...',
            '📊 Optimizing code...'
        ],
        FINALIZING: [
            '📋 Almost there, preparing diff view...',
            '🎯 Just a moment, finalizing changes...',
            '✨ Nearly done, putting on finishing touches...',
            '🔍 Almost ready, final review...',
            '✅ Just a few more seconds...'
        ]
    }
};

export const getDiffProgressMessage = (key: keyof typeof DIFF_MESSAGES.DIFF_PROGRESS, progress?: number): string => {
    const messages = DIFF_MESSAGES.DIFF_PROGRESS[key];
    const message = Array.isArray(messages) 
        ? messages[Math.floor(Math.random() * messages.length)]
        : messages;
    return progress !== undefined ? `${message} (${Math.round(progress)}%)` : message;
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
