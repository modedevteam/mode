/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function sanitizeJsonString(jsonString: string): string {
    return jsonString
        .replace(/\n/g, '\\n')     // Escape newlines
        .replace(/\t/g, '\\t');     // Escape tabs
}