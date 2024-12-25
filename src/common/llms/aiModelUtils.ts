/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AIClientConfig } from './aiClient';
import * as vscode from 'vscode';
import { getProviders } from '../configUtils';
import { ModelConfigMap, ModelInfo, ProviderConfig, PROVIDERS_CONFIG_KEY } from './aiModel';

export class AIModelUtils {
    static getProvider(provider: string): ProviderConfig | undefined {
        const providers = getProviders(PROVIDERS_CONFIG_KEY);
        return providers.find(p => p.name === provider && p.visible);
    }

    private static extensionContext: vscode.ExtensionContext;

    public static initialize(context: vscode.ExtensionContext) {
        this.extensionContext = context;
    }

    public static getModelInfo(modelKey: string): ModelInfo | undefined {
        return this.getModelInfoFromConfig(modelKey);
    }

    public static getAllModels(): Record<string, ModelInfo> {
        return this.getModelsFromConfig();
    }

    public static getLastUsedModel(): string {
        return this.extensionContext.globalState.get('lastUsedModel', 'gpt-4o');
    }

    public static setLastUsedModel(modelId: string): void {
        this.extensionContext.globalState.update('lastUsedModel', modelId);
    }

    public static getClientConfig(modelKey: string, apiKey: string): AIClientConfig | undefined {
        const modelInfo = this.getModelInfo(modelKey);
        if (!modelInfo) return undefined;

        return {
            provider: modelInfo.provider,
            apiKey,
            model: modelKey
        };
    }

    private static getModelInfoFromConfig(modelKey: string): ModelInfo | undefined {
        const providers = getProviders(PROVIDERS_CONFIG_KEY);
        
        for (const provider of providers) {
            const model = provider.models.find(model => model.name === modelKey);
            if (provider.visible && model) {
                return {
                    name: model.name,
                    displayName: model.displayName,
                    provider: provider.name,
                    endpoint: model.endpoint
                };
            }
        }
        
        return undefined;
    }

    private static getModelsFromConfig(): Record<string, ModelInfo> {
        const providers = getProviders(PROVIDERS_CONFIG_KEY);
        const modelMap: ModelConfigMap = {};

        for (const provider of providers) {
            if (provider.visible) {
                for (const model of provider.models) {
                    modelMap[model.name] = {
                        name: model.name,
                        displayName: model.displayName,
                        provider: provider.name
                    };
                }
            }
        }

        return modelMap;
    }

    public static supportsLargeContext(modelKey: string): boolean {
        const modelInfo = this.getModelInfoFromConfig(modelKey);
        if (!modelInfo) return true;

        const providers = getProviders(PROVIDERS_CONFIG_KEY);
        for (const provider of providers) {
            const model = provider.models.find(model => model.name === modelKey);
            if (model) {
                return model.largeContext !== false;
            }
        }
        return true;
    }

    public static supportsVision(modelKey: string): boolean {
        const modelInfo = this.getModelInfoFromConfig(modelKey);
        if (!modelInfo) return false;

        const providers = getProviders(PROVIDERS_CONFIG_KEY);
        for (const provider of providers) {
            const model = provider.models.find(model => model.name === modelKey);
            if (model && model.vision) {
                return true;
            }
        }
        return false;
    }

    public static supportsAutocomplete(modelKey: string): boolean {
        const modelInfo = this.getModelInfoFromConfig(modelKey);
        if (!modelInfo) return false;

        const providers = getProviders(PROVIDERS_CONFIG_KEY);
        for (const provider of providers) {
            const model = provider.models.find(model => model.name === modelKey);
            if (model && model.autocomplete) {
                return true;
            }
        }
        return false;
    }

    public static findCompatibleAutocompleteModel(modelKey: string): string {
        // First check if current model supports autocomplete
        if (this.supportsAutocomplete(modelKey)) {
            return modelKey;
        }

        // If not, try to find another model from the same provider that supports autocomplete
        const modelInfo = this.getModelInfoFromConfig(modelKey);
        if (!modelInfo) return modelKey;

        const providers = getProviders(PROVIDERS_CONFIG_KEY);
        const provider = providers.find(p => p.name === modelInfo.provider);
        
        if (provider) {
            // Find the first model in the provider that supports autocomplete
            const autocompleteModel = provider.models.find(m => m.autocomplete);
            if (autocompleteModel) {
                return autocompleteModel.name;
            }
        }

        // If no autocomplete model found, return original model
        return modelKey;
    }
} 