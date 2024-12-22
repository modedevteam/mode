import { workspace } from 'vscode';
import { ProviderConfig } from './llms/aiModel';

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
    return config.get<boolean>('enableAutoComplete', true);
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