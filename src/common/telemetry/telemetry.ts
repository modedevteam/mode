/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import fetch from 'node-fetch';

const GA_MEASUREMENT_ID = 'G-4859MSHZE4';

export async function trackExtensionActivation(): Promise<void> {
    try {
        // Check if telemetry is enabled
        if (!vscode.env.isTelemetryEnabled) {
            return;
        }

        const machineId = vscode.env.machineId;

        const payload = {
            client_id: machineId,
            events: [{
                name: 'extension_activated',
                params: {
                    machine_id: machineId,
                    timestamp: new Date().toISOString()
                }
            }]
        };

        const response = await fetch(
            `https://www.google-analytics.com/g/collect?v=2&tid=${GA_MEASUREMENT_ID}`,
            {
                method: 'POST',
                body: JSON.stringify(payload),
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'VSCode-Extension'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`GA4 request failed: ${response.statusText}`);
        }
    } catch (error) {
        console.error('Failed to track extension activation:', error);
    }
}