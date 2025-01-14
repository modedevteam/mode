/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { workspace } from 'vscode';
import { ProviderConfig } from './llms/llm.model';

/**
 * Gets the Mode extension configuration
 */
export function getModeConfig() {
    return workspace.getConfiguration('mode');
}

/**
 * Checks if autocomplete is enabled in settings
 * @returns boolean indicating if autocomplete is enabled
 */
export function isAutoCompleteEnabled(): boolean {
    const config = getModeConfig();
    return config.get<boolean>('autocomplete.enabled', true);
}

/**
 * Gets the exclude patterns from workspace configuration
 * @returns Array of exclude patterns
 */
export function getExcludePatterns(): string[] {
    const config = getModeConfig();
    return config.get<string[]>('excludePatterns', []);
}

/**
 * Gets the provider configurations from workspace settings
 * @param configKey The configuration key to retrieve providers from
 * @returns Array of provider configurations
 */
export function getProviders(configKey: string): ProviderConfig[] {
    return getModeConfig().get<ProviderConfig[]>(configKey) || [];
}

/**
 * Gets the prompt override from autocomplete configuration
 * @returns The prompt override string if set, empty string otherwise
 */
export function getPromptOverride(): string {
    return getModeConfig().get<string>('autocomplete.promptOverride', '');
}

/**
 * Gets the chat pre-prompt configuration
 * @returns boolean indicating if pre-prompt is disabled
 */
export function isChatPrePromptDisabled(): boolean {
    return getModeConfig().get<boolean>('chat.disablePrePrompt', false);
}

/**
 * Gets the chat prompt override configuration
 * @returns The prompt override string if set
 */
export function getChatPromptOverride(): string | undefined {
    return getModeConfig().get<string>('chat.promptOverride');
}

export function isPromptOverrideEmpty(): boolean {
    const promptOverride = getChatPromptOverride();
    return promptOverride === null || promptOverride === undefined || promptOverride.trim() === '';
}

export function getChatAdditionalPrompt(): string | undefined {
    return getModeConfig().get<string>('chat.additionalPrompt');
}

export function isChatAdditionalPromptEmpty(): boolean {
    const additionalPrompt = getChatAdditionalPrompt();
    return additionalPrompt === null || additionalPrompt === undefined || additionalPrompt.trim() === '';
}

/**
 * Gets whether logging is enabled in settings
 * @returns boolean indicating if logging is enabled
 */
export function isLoggingEnabled(): boolean {
    return getModeConfig().get<boolean>('logging.enabled', false);
}

/**
 * Gets the maximum log file size in MB
 * @returns number representing max file size in MB
 */
export function getMaxLogFileSize(): number {
    return getModeConfig().get<number>('logging.maxFileSize', 10);
}