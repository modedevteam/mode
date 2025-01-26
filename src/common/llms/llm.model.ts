/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ProviderConfig {
    name: string;
    models: {
        name: string;
        displayName?: string;
        endpoint?: string;
        vision?: boolean;
        autocomplete?: boolean;
        autocoding?: boolean;
    }[];
    visible: boolean;
}

export interface ModelConfigMap {
    [key: string]: ModelInfo;
}

export interface ModelInfo {
    name: string;
    displayName?: string;
    provider: string;
    endpoint?: string;
    vision?: boolean;
    autocomplete?: boolean;
    autocoding?: boolean;
}

export const PROVIDERS_CONFIG_KEY = 'providers';