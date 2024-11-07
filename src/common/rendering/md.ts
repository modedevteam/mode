import MarkdownIt = require('markdown-it');
import hljs from 'highlight.js';
import { detectFileNameUri } from '../io/fileUtils';

export function createMarkdownIt() {
    return new MarkdownIt({
        highlight: (str, lang) => {
            if (lang && hljs.getLanguage(lang)) {
                try {
                    const lines = str.split('\n');
                    const { filename, fileUri } = detectFileNameUri(lines[0]);
                    const codeContent = filename ? lines.slice(1).join('\n') : str;

                    // Escape HTML characters in the filename
                    const escapedFilename = filename ? escapeHtml(filename) : '';

                    const highlightedCode = hljs.highlight(codeContent, { language: lang }).value;
                    
                    const codeHeaderDiv = `<div class="chat-code-header">
                        ${escapedFilename ? `<div class="filename">${escapedFilename}</div>
                        <div class="file-uri hidden">${fileUri}</div>` : ''}
                        <div class="buttons">
                            <button id="copy-code-button" class="icon-button" title="Copy"><i class="codicon codicon-copy"></i></button>
                            <button id="manual-merge-button" class="icon-button" title="Apply"><i class="codicon codicon-merge"></i></button>
                            <button id="merge-button" class="icon-button" title="Apply with AI"><i class="codicon codicon-sparkle-filled"></i></button>
                        </div>
                    </div>`;

                    return `${codeHeaderDiv}<div class="chat-code-container">${highlightedCode}</div>`;
                } catch (__) {
                    // Intentionally ignoring errors
                }
            }
            return ''; // use external default escaping
        },
        langPrefix: 'language-'
    });
}

function escapeHtml(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { createMarkdownIt };
