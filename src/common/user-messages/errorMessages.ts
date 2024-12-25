/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export const ErrorMessages = {
    OPEN_CHAT_EXTENSION_ERROR: (error: unknown) =>
        `Error opening Mode chat: ${error instanceof Error ? error.message : String(error)}`,
    
    RESOLVE_CHAT_UI_ERROR: (error: unknown) =>
        `Error rendering chat UI: ${error instanceof Error ? error.message : String(error)}`,
    
    APPLY_CHANGES_ERROR: (error: unknown) =>
        `Failed to apply changes: ${error instanceof Error ? error.message : String(error)}`,
    
    EXPERIMENTAL_MODEL_FOR_MERGE_WARNING: (currentModel: string, recommendedModels: string[]) =>
        `Mode's support for AI-assisted merge operations using ${currentModel} is currently experimental. This may result in lower quality results. Would you like to continue anyway?\n\nRecommended models: ${recommendedModels.join(', ')}`,

    CODE_HIGHLIGHTING_ERROR: (error: unknown, language: string) =>
        `Error highlighting code for language "${language}": ${error instanceof Error ? error.message : String(error)}`,
}; 
