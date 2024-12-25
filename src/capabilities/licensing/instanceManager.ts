/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as crypto from 'crypto';

export function registerInstance(context: vscode.ExtensionContext): string {
    // Check if instance ID already exists
    let instanceId = context.globalState.get<string>('instanceId');
    
    // If no instance ID exists, create a new one
    if (!instanceId) {
        // Generate a UUID v4
        instanceId = crypto.randomUUID();
        // Store it in global state
        context.globalState.update('instanceId', instanceId);
    }
    
    return instanceId;
}

export function getInstanceId(context: vscode.ExtensionContext): string {
    const instanceId = context.globalState.get<string>('instanceId');
    if (!instanceId) {
        throw new Error('Instance ID not found. Please ensure the extension is properly initialized.');
    }
    return instanceId;
}
