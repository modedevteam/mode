export interface ProviderConfig {
    name: string;
    models: {
        name: string;
        displayName?: string;
        endpoint?: string;
        vision?: boolean;
        largeContext?: boolean;
        autocomplete?: boolean;
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
}

export const PROVIDERS_CONFIG_KEY = 'providers';