/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import * as vscode from 'vscode';
import { AIClientFactory } from './aiClientFactory';

export interface ApiKeyProvider {
    id: string;
    name: string;
    keyPrefix: string;
    secretKey: string;
    url: string;
}

export class ApiKeyManager {
    private static readonly API_PROVIDERS: ApiKeyProvider[] = [
        {
            id: 'openai',
            name: 'OpenAI',
            keyPrefix: 'sk-',
            secretKey: 'mode.key.openai',
            url: 'https://platform.openai.com/account/api-keys'
        },
        {
            id: 'anthropic',
            name: 'Anthropic',
            keyPrefix: 'sk-ant-',
            secretKey: 'mode.key.anthropic',
            url: 'https://console.anthropic.com/account/keys'
        },
        {
            id: 'google',
            name: 'Google',
            keyPrefix: 'AI',
            secretKey: 'mode.key.google',
            url: 'https://makersuite.google.com/app/apikey'
        },
        {
            id: 'cohere',
            name: 'Cohere',
            keyPrefix: '',
            secretKey: 'mode.key.cohere',
            url: 'https://dashboard.cohere.com/api-keys'
        },
        {
            id: 'mistral',
            name: 'Mistral',
            keyPrefix: '',
            secretKey: 'mode.key.mistral',
            url: 'https://console.mistral.ai/api-keys/'
        },
        {
            id: 'openrouter',
            name: 'OpenRouter',
            keyPrefix: '',
            secretKey: 'mode.key.openrouter',
            url: 'https://openrouter.ai/docs/api-keys'
        }
    ];

    constructor(private readonly context: vscode.ExtensionContext) {}

    public registerCommands(): vscode.Disposable[] {
        return [
            vscode.commands.registerCommand('mode.manageApiKeys', () => this.handleManageApiKeys())
        ];
    }

    private async handleManageApiKeys(): Promise<void> {
        // Get all stored keys
        const storedKeys = await Promise.all(
            ApiKeyManager.API_PROVIDERS.map(async provider => ({
                provider,
                hasKey: !!(await this.context.secrets.get(provider.secretKey))
            }))
        );

        // Show tutorial if no keys are stored
        if (!storedKeys.some(k => k.hasKey)) {
            const tutorialMessage = `To use Mode, you need an API key. Choose your AI provider and we'll guide you through getting a key if needed. Your key will be stored securely.`;
            await vscode.window.showInformationMessage(tutorialMessage, { modal: true });
        }

        // Create QuickPick items for both stored and new keys
        const items = ApiKeyManager.API_PROVIDERS.map(provider => {
            const hasKey = storedKeys.find(k => k.provider.id === provider.id)?.hasKey;
            return {
                label: `$(key) ${provider.name}`,
                description: hasKey ? 'Update or Delete API Key' : 'Set API Key',
                provider
            };
        });

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select AI provider to manage',
            title: 'Manage API Keys'
        });

        if (!selected) return;

        if (storedKeys.find(k => k.provider.id === selected.provider.id)?.hasKey) {
            // Key exists - offer update or delete
            const updateButton = 'Update';
            const deleteButton = 'Delete';
            const response = await vscode.window.showQuickPick(
                [
                    { label: updateButton, description: 'Update existing API key' },
                    { label: deleteButton, description: 'Delete existing API key' }
                ],
                { placeHolder: `What would you like to do with the ${selected.provider.name} API key?` }
            );

            if (response?.label === deleteButton) {
                const confirmDelete = await vscode.window.showWarningMessage(
                    `Are you sure you want to delete the ${selected.provider.name} API key?`,
                    { modal: true },
                    'Delete'
                );
                if (confirmDelete === 'Delete') {
                    await this.context.secrets.delete(selected.provider.secretKey);
                    AIClientFactory.invalidateClientsForProvider(selected.provider.id);
                    vscode.window.showInformationMessage(
                        `${selected.provider.name} API key has been deleted.`
                    );
                }
            } else if (response?.label === updateButton) {
                await this.promptAndStoreKey(selected.provider);
            }
        } else {
            // No existing key - proceed with setting new key
            await this.promptAndStoreKey(selected.provider);
        }
    }

    private async promptAndStoreKey(provider: ApiKeyProvider): Promise<void> {
        const getKeyButton = 'Get API Key';
        const enterKeyButton = 'I Have a Key';
        const response = await vscode.window.showInformationMessage(
            `Do you need to create a ${provider.name} API key?`,
            getKeyButton,
            enterKeyButton
        );

        if (response === getKeyButton) {
            await vscode.env.openExternal(vscode.Uri.parse(provider.url));
        }

        const key = await vscode.window.showInputBox({
            prompt: `Enter your ${provider.name} API Key`,
            password: true,
            placeHolder: `${provider.keyPrefix}...`,
            ignoreFocusOut: true,
            validateInput: (value) => this.validateApiKey(value, provider)
        });

        if (key) {
            await this.storeApiKey(provider, key);
        }
    }

    private validateApiKey(value: string, provider: ApiKeyProvider): string | null {
        if (!value) {
            return 'API key is required';
        }
        if (!value.startsWith(provider.keyPrefix)) {
            return `Invalid API key format. Should start with "${provider.keyPrefix}"`;
        }
        return null;
    }

    private async storeApiKey(provider: ApiKeyProvider, key: string): Promise<void> {
        await this.context.secrets.store(provider.secretKey, key);
        const openDocsButton = 'Open API Dashboard';
        const message = await vscode.window.showInformationMessage(
            `${provider.name} API key has been securely stored`,
            openDocsButton
        );

        if (message === openDocsButton) {
            vscode.env.openExternal(vscode.Uri.parse(provider.url));
        }
    }

    public async getApiKey(providerId: string): Promise<string | undefined> {
        // We don't need an API key for the local provider
        if (providerId.toLowerCase() === 'local') {
            return undefined;
        }

        const provider = ApiKeyManager.API_PROVIDERS.find(p => p.id === providerId);
        if (!provider) {
            throw new Error(`Unknown provider: ${providerId}`);
        }

        // Try to get the key from secrets storage
        return await this.context.secrets.get(provider.secretKey);
    }
} 