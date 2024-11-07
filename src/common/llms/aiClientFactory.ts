import { AIClient, AIClientConfig } from './aiClient';
import { ApiKeyManager } from './aiApiKeyManager';
import * as vscode from 'vscode';
import { ModelProvider } from './aiModel';

export class AIClientFactory {
    private static instances: Map<string, AIClient> = new Map();
    private static apiKeyManager: ApiKeyManager;

    private constructor() { } // Prevent instantiation

    public static initialize(context: vscode.ExtensionContext): void {
        AIClientFactory.apiKeyManager = new ApiKeyManager(context);
    }

    public static async createClient(
        provider: ModelProvider,
        model?: string
    ): Promise<{ success: boolean; message?: string; client?: AIClient }> {
        const instanceKey = `${provider}-${model || 'default'}`;

        // Return existing instance if available
        const existingClient = this.instances.get(instanceKey);
        if (existingClient) {
            return { success: true, client: existingClient };
        }

        // Create new instance
        const apiKey = await this.apiKeyManager?.getApiKey(provider);
        if (!apiKey) {
            return {
                success: false,
                message: `APIKey.${provider}.Missing`
            };
        }

        try {
            const config: AIClientConfig = {
                provider,
                apiKey,
                model
            };

            const client = new AIClient(config);
            this.instances.set(instanceKey, client);
            return { success: true, client };
        } catch (error) {
            return {
                success: false,
                message: `Failed to initialize ${provider} client: ${(error as Error).message}`
            };
        }
    }

    public static getInstance(provider: ModelProvider, model?: string): AIClient | undefined {
        const instanceKey = `${provider}-${model || 'default'}`;
        return this.instances.get(instanceKey);
    }

    public static invalidateClientsForProvider(provider: string): void {
        // Remove all instances for the given provider
        for (const [key, _] of this.instances) {
            if (key.startsWith(`${provider}-`)) {
                this.instances.delete(key);
            }
        }
    }
} 