import * as vscode from 'vscode';

export class WelcomeViewProvider {
    private _panel: vscode.WebviewPanel | undefined;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public async show() {
        if (this._panel) {
            this._panel.reveal();
        } else {
            this._panel = vscode.window.createWebviewPanel(
                'modeWelcome',
                'Welcome to Mode',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    localResourceRoots: [this._extensionUri]
                }
            );

            this._panel.webview.html = await this._getHtmlForWebview(this._panel.webview);
			this._panel.iconPath = vscode.Uri.joinPath(this._extensionUri, 'media', 'mode-icon.svg');
            // Add message listener
            this._panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'mode.openChat':
                            vscode.commands.executeCommand('mode.openChat');
                            return;
                        case 'mode.manageApiKeys':
                            vscode.commands.executeCommand('mode.manageApiKeys');
                            return;
                    }
                }
            );

            this._panel.onDidDispose(() => {
                this._panel = undefined;
            });
        }
    }

    private async _getHtmlForWebview(webview: vscode.Webview) {
        const styleWelcomeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'welcome.css'));
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <link href="${styleWelcomeUri}" rel="stylesheet">
                <title>Welcome to Mode</title>
            </head>
            <body>
                <div class="container">
                    <h1>
                        Welcome to Mode
                    </h1>
                    <p class="tagline">The first client-only AI coding companion—fast and direct access to your favorite LLMs, no third-party backends.</p>
                    <div class="overview">
                        <h2>What can Mode do?</h2>
                        <ul>
                            <li>Answer questions about your code</li>
                            <li>Explain error messages</li>
                            <li>Apply AI-powered suggestions</li>
							<li>More coming soon!</li>
                        </ul>
                        <h2>Getting Started</h2>
                        <p><strong>Important:</strong> Before using Mode, you need to <a href="#" id="openSettings">configure an API Key</a>.</p>
                        <p>Once you've set up your key, you can start using Mode in any of the following ways:</p>
                        <ul>
                            <li>Press the Mode chat shortcut (Cmd or Ctrl+L by default)</li>
                            <li>Open Mode chat directly here: <a href="#" id="openChat">Open Mode Chat</a></li>
                            <li>When diagnosing errors, you'll find 'Ask Mode' under Quick Fix</li>
                        </ul>
                        <p><strong>Tip:</strong> Using Mode while in a file or with selected text adds context to your chat.</p>
                    </div>
                </div>
                <script>
                    const vscode = acquireVsCodeApi();
                    document.getElementById('openChat').addEventListener('click', (e) => {
                        e.preventDefault();
                        vscode.postMessage({ command: 'mode.openChat' });
                    });
                    document.getElementById('openSettings').addEventListener('click', (e) => {
                        e.preventDefault();
                        vscode.postMessage({ command: 'mode.manageApiKeys' });
                    });
                </script>
            </body>
            </html>
        `;
    }
}
