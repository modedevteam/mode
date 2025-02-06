/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import fetch from 'node-fetch';

const GA_TRACKING_ID = "G-4859MSHZE4"; // Replace with your Google Analytics Measurement ID

export function trackUsage(eventName: string): void {
    // Check if telemetry is enabled
    if (vscode.env.isTelemetryEnabled) {
        const clientId = vscode.env.machineId; // Unique per user

        const url = `https://www.google-analytics.com/g/collect?v=2&tid=${GA_TRACKING_ID}&cid=${clientId}&t=event&en=${eventName}`;

        fetch(url, { method: "GET" })
            .then(response => console.log("GA Event Sent:", eventName))
            .catch(error => console.error("GA Error:", error));
    }
}