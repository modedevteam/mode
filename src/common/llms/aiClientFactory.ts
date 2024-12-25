/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AIClient, AIClientConfig } from './aiClient';

export class AIClientFactory {
    private static instances: Map<string, AIClient> = new Map();

    private constructor() { } // Prevent instantiation

    public static async createClient(
        provider: string,
        model: string,
        apiKey: string | undefined,
        endpoint: string | undefined
    ): Promise<{ success: boolean; message?: string; client?: AIClient }> {
        const instanceKey = `${provider}-${model || 'default'}`;

        // Validate API key is provided for non-local providers
        if (provider.toLowerCase() !== 'local' && !apiKey) {
            return {
                success: false,
                message: `apikey.${provider}.missing`
            };
        }

        // Return existing instance if available
        const existingClient = this.instances.get(instanceKey);
        if (existingClient) {
            return { success: true, client: existingClient };
        }

        try {
            const config: AIClientConfig = {
                provider,
                apiKey,
                model,
                endpoint // pass endpoint if available
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

    public static getInstance(provider: string, model?: string): AIClient | undefined {
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