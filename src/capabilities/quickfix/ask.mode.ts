/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Aruna Labs, Inc. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ModeChatViewProvider } from '../../browser/chat/chat.view.provider';

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
        if (diagnostics.length === 0) {
            return [];
        }

        const askModeAction = new vscode.CodeAction('Ask Mode', vscode.CodeActionKind.QuickFix);
        askModeAction.command = {
            command: 'mode.openChat',
            title: 'Ask Mode',
            arguments: [
                `I'm getting this error: "${diagnostics[0].message}". Can you help me fix it?`,
                range.start.line + 1, // Adding 1 because VSCode uses 0-based line numbers
                document.uri.fsPath
            ]
        };
        askModeAction.isPreferred = true;
        return [askModeAction];
    }
} 