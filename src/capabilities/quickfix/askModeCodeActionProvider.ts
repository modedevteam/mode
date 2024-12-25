/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ModeChatViewProvider } from '../../browser/chat/chatViewProvider';

export class AskModeCodeActionProvider implements vscode.CodeActionProvider {
    static readonly providedCodeActionKinds = [
        vscode.CodeActionKind.QuickFix
    ];

    constructor(private provider: ModeChatViewProvider) {}

    provideCodeActions(
        document: vscode.TextDocument,
        range: vscode.Range,
        context: vscode.CodeActionContext,
        token: vscode.CancellationToken
    ): vscode.CodeAction[] {
        const diagnostics = context.diagnostics;
        const actions: vscode.CodeAction[] = [];

        // Create the "Ask Mode" action first
        const askModeAction = new vscode.CodeAction('Ask Mode', vscode.CodeActionKind.QuickFix);
        askModeAction.command = {
            command: 'mode.openChat',
            title: 'Ask Mode',
            arguments: [
                diagnostics.length > 0 ? diagnostics[0].message : undefined,
                range.start.line + 1 // Adding 1 because VSCode uses 0-based line numbers
            ]
        };
        askModeAction.isPreferred = true;
        actions.unshift(askModeAction);
        return actions;
    }
} 