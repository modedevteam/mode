/// <reference lib="dom" />

declare function acquireVsCodeApi(): any;

(function () {

    //#region Shared DOM elements
    const vscode = acquireVsCodeApi();
    const iconContainerTop = document.getElementById('icon-container-top') as HTMLDivElement;

    // text area functions
    function resizeTextarea() {
        messageInput.style.height = 'auto';
        messageInput.style.height = messageInput.scrollHeight + 'px';
    }

    function focusTextarea() {
        messageInput.focus();
    }

    //#region Chat input
    const chatInputContainer = document.getElementById('chat-input-container') as HTMLDivElement;
    const messageInput = document.getElementById('message-input') as HTMLTextAreaElement;
    const sendButton = document.getElementById('send-button') as HTMLButtonElement;
    let currentCodeContainer: HTMLDivElement | null = null;
    let currentMarkdownContainer: HTMLDivElement | null = null;
    // Message handling functions
    function sendMessage() {
        if (isStreaming || isProcessing) {
            stopEverything();
            focusTextarea();
            return;
        }

        const message = messageInput.value.trim();
        const highlightedCodeSnippets = Array.from(addedCodeSnippets).map(snippetIdentifier => {
            const [fileName, range] = snippetIdentifier.split(':');
            const codeContainer = document.querySelector(`.highlighted-code-container[data-file-name="${fileName}"][data-range="${range}"]`);
            const code = codeContainer?.querySelector('pre code')?.textContent || '';
            return { fileName, range, code };
        });

        // Get the selected model from the dropdown
        const selectedOptionSpan = document.querySelector('.selected-model') as HTMLSpanElement;
        const selectedModel = selectedOptionSpan.textContent || 'gpt-4o'; // Default to gpt-4o if not set

        if (message || currentImages.length > 0 || highlightedCodeSnippets.length > 0) {
            isProcessing = true;
            updateSendButtonState();
            if (message) {
                renderMessage(message, 'user');
            }
            messageInput.value = '';
            resizeTextarea();
            showProcessingAnimation();

            vscode.postMessage({
                command: 'sendMessage',
                text: message,
                images: currentImages,
                codeSnippets: highlightedCodeSnippets,
                fileUrls: Array.from(addedFileUris),
                currentFile: currentFilePill?.textContent,
                selectedModel: selectedModel // Include the selected model
            });

            // Clear the context after sending
            clearContext();
        }
    }

    function stopEverything() {
        if (isStreaming) {
            clearInterval(streamInterval);
        }
        if (isProcessing) {
            clearTimeout(processingTimeout);
        }
        isStreaming = false;
        isProcessing = false;
        updateSendButtonState();
        hideProcessingAnimation();

        // Remove any loading spinners from code headers
        const loadingSpinners = document.querySelectorAll('.chat-code-header .codicon-loading');
        loadingSpinners.forEach(spinner => spinner.remove());

        // Send cancel message to the extension
        vscode.postMessage({
            command: 'cancelMessage'
        });
    }

    function updateSendButtonState() {
        const hasText = messageInput.value.trim().length > 0;
        const hasImages = currentImages.length > 0;
        const hasCodeSnippets = addedCodeSnippets.size > 0;

        // Only disable the button if there's no content AND we're not streaming/processing
        sendButton.disabled = !(hasText || hasImages || hasCodeSnippets || isStreaming || isProcessing);

        // Make textarea read-only instead of disabled during streaming/processing
        messageInput.readOnly = isStreaming || isProcessing;

        if (isStreaming || isProcessing) {
            sendButton.innerHTML = '<i class="codicon codicon-stop-circle"></i>';
            sendButton.title = 'Stop';
            // Update placeholder text based on OS
            const isMac = navigator.userAgent.toLowerCase().includes('mac');
            messageInput.placeholder = `Cancel (${isMac ? '⌘' : 'Ctrl'} + ⌫)`;
        } else {
            sendButton.innerHTML = '<i class="codicon codicon-comment-discussion"></i>';
            sendButton.title = 'Send';
            messageInput.placeholder = 'Ask Anything';
        }
    }

    function showProcessingAnimation() {
        const processingElement = document.createElement('div');
        processingElement.className = 'message assistant processing';
        processingElement.innerHTML = `
            <div class="dot"></div>
            <div class="dot"></div>
            <div class="dot"></div>
        `;
        chatOutput.appendChild(processingElement);
        chatOutput.scrollTop = chatOutput.scrollHeight;
    }

    function hideProcessingAnimation() {
        const processingElement = chatOutput.querySelector('.processing');
        if (processingElement) {
            chatOutput.removeChild(processingElement);
        }
    }

    // event listener registration
    function activateInput() {
        updateSendButtonState();
        resizeTextarea();
    }

    // display @-mentioned file in chat
    function handleContextMention(fileName: string) {
        const cursorPosition = parseInt(messageInput.dataset.lastCursorPosition || '0');

        // Insert the file name at the cursor position
        const before = messageInput.value.substring(0, cursorPosition);
        const after = messageInput.value.substring(cursorPosition);
        messageInput.value = before + '@' + fileName + ' ' + after;

        // Set cursor position after the inserted file name
        const newPosition = cursorPosition + fileName.length + 2; // +2 for '@' and space
        messageInput.setSelectionRange(newPosition, newPosition);

        // Focus the textarea
        messageInput.focus();
    }
    //#endregion

    //#region Chat output
    const chatOutput = document.getElementById('chat-output') as HTMLDivElement;

function renderMessage(message: string, sender: 'user' | 'assistant') {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${sender}`;
    
    if (sender === 'user') {
        messageElement.textContent = message;
        
        // Add copy button for user messages
        const copyButton = document.createElement('button');
        copyButton.className = 'copy-button';
        copyButton.innerHTML = '<i class="codicon codicon-copy"></i>';
        copyButton.title = 'Copy message';
        copyButton.addEventListener('click', () => {
            const textToCopy = message;
            messageInput.value = textToCopy;
            messageInput.focus();
            resizeTextarea();
            
            // Show copy feedback
            copyButton.innerHTML = '<i class="codicon codicon-check"></i>';
            copyButton.classList.add('copied');
            
            setTimeout(() => {
                copyButton.innerHTML = '<i class="codicon codicon-copy"></i>';
                copyButton.classList.remove('copied');
            }, 2000);
        });
        
        messageElement.appendChild(copyButton);
    } else {
        messageElement.innerHTML = message;
    }
    
    chatOutput.appendChild(messageElement);
    chatOutput.scrollTop = chatOutput.scrollHeight;
}

    // chat state variables
    let isStreaming = false;
    let isProcessing = false;
    let currentResponseElement: HTMLDivElement | null = null;
    let streamInterval: number | undefined;
    let processingTimeout: number | undefined;

    // chat response functions
    // note: we hide the animation only once there is something to show and
    // since LLM output can have <code_analysis> anywhere, we always check for it
    function handleChatStreamMessage(message: any) {
        switch (message.action) {
            case 'startStream':
                isStreaming = true;
                updateSendButtonState();
                startNewResponse();
                break;
            case 'endStream':
                hideProcessingAnimation();
                isStreaming = false;
                isProcessing = false;
                updateSendButtonState();
                currentResponseElement = null;
                break;
            case 'addMarkdownLine':
                hideProcessingAnimation();
                if (currentMarkdownContainer) {
                    if (message.lines) {
                        // Replace the entire HTML if 'lines' is present
                        currentMarkdownContainer.innerHTML = message.lines;
                    } else {
                        // Append the line if 'lines' is not present
                        currentMarkdownContainer.innerHTML += message.line;
                    }
                }
                chatOutput.scrollTop = chatOutput.scrollHeight;
                break;
            case 'addCodeLine':
                hideProcessingAnimation();
                if (currentCodeContainer) {
                    if (message.code) {
                        currentCodeContainer.innerHTML = `<pre><code class="language-${message.language}">${message.code}</code></pre>`;
                    } else {
                        currentCodeContainer.innerHTML += `${message.codeLine}`;
                    }
                    // Scroll to the bottom of the code container
                    currentCodeContainer.scrollTop = currentCodeContainer.scrollHeight;
                }
                break;
            case 'startCodeBlock': {
                hideProcessingAnimation();
                const codeHeader = document.createElement('div');
                codeHeader.className = 'chat-code-header';
                codeHeader.innerHTML = `
                    <div class="filename" data-file-uri="${message.fileUri || ''}">${message.filename || ''}</div>
                    <div class="buttons">
                        <i class="codicon codicon-loading codicon-modifier-spin"></i>
                    </div>
                `;
                currentResponseElement!.appendChild(codeHeader);

                currentCodeContainer = document.createElement('div');
                currentCodeContainer.className = 'chat-code-container';
                currentResponseElement!.appendChild(currentCodeContainer);

                currentCodeContainer.innerHTML = `<pre><code class="language-${message.language}">`;
                break;
            }
            case 'endCodeBlock': {
                hideProcessingAnimation();
                if (currentCodeContainer) {
                    const codeHeaderDiv = `
                        <div class="filename" data-file-uri="${message.fileUri || ''}">${message.filename || ''}</div>
                        <div class="file-uri hidden">${message.fileUri || ''}</div>
                        <div class="code-id hidden">${message.codeId || ''}</div>
                        <div class="buttons">
                            <button id="copy-code-button" class="icon-button" title="Copy"><i class="codicon codicon-copy"></i></button>
                            <button id="merge-button" class="icon-button" title="Apply with AI"><i class="codicon codicon-sparkle-filled"></i></button>
                        </div>
                    `;

                    const codeHeader = currentCodeContainer.previousElementSibling;
                    if (codeHeader) {
                        codeHeader.innerHTML = codeHeaderDiv;
                    }

                    currentCodeContainer.innerHTML = `<pre><code class="language-${message.language}">${message.code}</code></pre>`;
                    currentCodeContainer = null;
                }
                break;
            }
            case 'startMarkdownBlock': {
                hideProcessingAnimation();
                currentMarkdownContainer = document.createElement('div');
                currentMarkdownContainer.className = 'chat-markdown-container';
                currentResponseElement!.appendChild(currentMarkdownContainer);
                break;
            }
            case 'endMarkdownBlock': {
                hideProcessingAnimation();
                if (currentMarkdownContainer) {
                    currentMarkdownContainer.innerHTML = message.lines;
                }
                currentMarkdownContainer = null; // Reset the markdown container pointer
                break;
            }
        }
    }

    function startNewResponse() {
        currentResponseElement = document.createElement('div');
        currentResponseElement.className = 'message assistant';
        chatOutput.appendChild(currentResponseElement);
    }
    //#endregion

    // Context (pills)
    const contextContainer = document.getElementById('context-container') as HTMLDivElement;

    // Clear the context
    function clearContext() {
        // Reset state variables
        currentImages = [];
        addedCodeSnippets.clear();
        addedFileUris.clear();
        currentFilePill = null;

        // Remove all context-related elements
        const contextElements = document.querySelectorAll('.image-preview-container, .image-pill, .code-pill, .highlighted-code-container, .file-pill');
        contextElements.forEach(element => element.remove());
    }

    //#region Image pills
    const addFileMediaButton = document.getElementById('add-file-media-button') as HTMLButtonElement;
    const imageUploadInput = document.getElementById('image-upload') as HTMLInputElement;

    // image state variables
    let currentImages: { id: string; data: string; fileName?: string }[] = [];

    // image upload and display functions
    function displayImagePreview(imageData: string, fileName: string, imageId: string) {
        const previewContainer = document.createElement('div');
        previewContainer.className = 'image-preview-container';
        previewContainer.dataset.imageId = imageId;

        previewContainer.innerHTML = `
            <button class="remove-image"><i class="codicon codicon-close"></i></button>
            <img src="${imageData}" class="image-preview" />
        `;

        // Insert the preview container before the icon-container-top
        chatInputContainer?.insertBefore(previewContainer, iconContainerTop);

        const removeButton = previewContainer.querySelector('.remove-image');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                previewContainer.remove();
                currentImages = currentImages.filter(img => img.id !== imageId); // Remove the specific image
                removeImagePill(fileName || 'Image', imageId); // Remove the corresponding pill
                focusTextarea(); // Focus on the textarea after removing the image
            });
        }

        // Add a pill for the image
        addImagePill(fileName || 'Image', imageId);

        resizeTextarea();
        focusTextarea(); // Focus on the textarea after adding the image
    }

    function addImagePill(text: string, imageId: string) {
        const pill = document.createElement('div');
        pill.className = 'file-pill image-pill';
        pill.dataset.imageId = imageId;
        pill.innerHTML = `
            <i class="codicon codicon-file-media"></i>
            <span>${text}</span>
            <button class="remove-file"><i class="codicon codicon-close"></i></button>
        `;
        contextContainer.appendChild(pill);

        const removeButton = pill.querySelector('.remove-file');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                removeImageAndPill(imageId);
                focusTextarea();
            });
        }
    }

    function removeImageAndPill(imageId: string) {
        const pill = contextContainer.querySelector(`.image-pill[data-image-id="${imageId}"]`);
        const previewContainer = document.querySelector(`.image-preview-container[data-image-id="${imageId}"]`);

        pill?.remove();
        previewContainer?.remove();
        currentImages = currentImages.filter(img => img.id !== imageId);
    }

    function removeImagePill(text: string, imageId: string) {
        const pills = contextContainer.querySelectorAll('.image-pill');
        pills.forEach(pill => {
            if (pill.querySelector('span')?.textContent === text && (pill as HTMLElement).dataset.imageId === imageId) {
                pill.remove();
            }
        });
    }

    function handleImageUpload(file: File) {
        const reader = new FileReader();
        reader.onload = (e) => {
            if (e.target && typeof e.target.result === 'string') {
                const imageData = e.target.result;
                const imageId = generateUniqueId();
                currentImages.push({ id: imageId, data: imageData, fileName: file.name }); // Add image to the list
                displayImagePreview(imageData, file.name, imageId); // Pass the file name
                focusTextarea(); // Focus on the textarea after uploading the image
            }
        };
        reader.readAsDataURL(file);
    }
    //#endregion

    //#region Code pills

    // code state variables
    const addedCodeSnippets = new Set<string>();

    // code pill functions
    function removeHighlightCode(fileName: string, range: string) {
        const snippetIdentifier = `${fileName}:${range}`;
        addedCodeSnippets.delete(snippetIdentifier);

        // Remove the code container
        const codeContainer = document.querySelector(`.highlighted-code-container[data-file-name="${fileName}"][data-range="${range}"]`);
        if (codeContainer) {
            codeContainer.remove();
        }

        // Remove the associated pill
        const pill = contextContainer.querySelector(`.code-pill[data-file-name="${fileName}"][data-range="${range}"]`);
        if (pill) {
            pill.remove();
        }
    }

    function addCodePill(fileName: string, range: string) {
        const snippetIdentifier = `${fileName}:${range}`;
        addedCodeSnippets.add(snippetIdentifier);

        const pill = document.createElement('div');
        pill.className = 'file-pill code-pill';
        pill.dataset.fileName = fileName;
        pill.dataset.range = range;
        pill.innerHTML = `
            <i class="codicon codicon-file-code"></i>
            <span>${fileName} (${range})</span>
            <button class="remove-file"><i class="codicon codicon-close"></i></button>
        `;
        contextContainer.appendChild(pill);

        const removeButton = pill.querySelector('.remove-file');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                removeHighlightCode(fileName, range);
            });
        }
    }

    // Function to add the highlighted code container
    function addHighlightedCodeContainer(fileName: string, range: string, highlightedCode: string) {
        const codeContainer = document.createElement('div');
        codeContainer.className = 'highlighted-code-container';
        codeContainer.dataset.fileName = fileName;
        codeContainer.dataset.range = range;
        codeContainer.innerHTML = `
            <button class="remove-code"><i class="codicon codicon-close"></i></button>
            <pre><code>${highlightedCode}</code></pre>
        `;

        // Insert the code container before the icon-container-top
        chatInputContainer.insertBefore(codeContainer, iconContainerTop);

        const removeButton = codeContainer.querySelector('.remove-code');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                removeHighlightCode(fileName, range);
            });
        }
    }
    //#endregion

    //#region File pills

    // file state variables
    const addFileButton = document.getElementById('add-file-button') as HTMLButtonElement;
    const addedFileUris = new Set<string>();
    let currentFilePill: HTMLElement | null = null;

    // file pill functions
    function showQuickPick() {
        vscode.postMessage({ command: 'showQuickPick' }); // Request to show quick pick
    }

    function updateCurrentFilePill(filePill: HTMLElement) {
        if (currentFilePill) {
            currentFilePill.classList.remove('current-file-pill');
        }
        currentFilePill = filePill;
        currentFilePill.classList.add('current-file-pill');
    }

    function addFilePill(fileName: string, fileUri: string): HTMLElement | null {
        if (addedFileUris.has(fileUri)) {
            return null; // No-op if the file is already added
        }

        // Add the file URI to the set
        addedFileUris.add(fileUri);

        const filePill = document.createElement('div');
        filePill.className = 'file-pill';
        filePill.setAttribute('data-file-uri', fileUri);
        filePill.innerHTML = `<i class="codicon codicon-file"></i><span>${fileName}</span><button class="remove-file"><i class="codicon codicon-close"></i></button>`;
        contextContainer.appendChild(filePill);

        const removeButton = filePill.querySelector('.remove-file');
        if (removeButton) {
            removeButton.addEventListener('click', () => {
                contextContainer.removeChild(filePill);
                addedFileUris.delete(fileUri);
            });
        }

        return filePill; // Return the newly created file pill
    }

    // event listener registration
    function handleFilePillClick(target: HTMLElement) {
        const filePill = target.closest('.file-pill');
        if (filePill) {
            const fileUri = filePill.getAttribute('data-file-uri');
            if (fileUri) {
                vscode.postMessage({ command: 'openFile', fileUri });
            }
        }
    }
    //#endregion

    //#region Model selection

    function setupDropdown() {
        const dropdownToggle = document.querySelector('.dropdown-toggle') as HTMLButtonElement;
        const dropdownContent = document.querySelector('.dropdown-content') as HTMLDivElement;
        const selectedOptionSpan = document.querySelector('.selected-model') as HTMLSpanElement;

        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = dropdownContent.style.display === 'block';
            dropdownContent.style.display = isOpen ? 'none' : 'block';
            dropdownToggle.classList.toggle('open', !isOpen);
        });

        document.addEventListener('click', () => {
            dropdownContent.style.display = 'none';
            dropdownToggle.classList.remove('open');
        });

        dropdownContent.querySelectorAll('a').forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                const optionElement = e.target as HTMLAnchorElement;
                if (optionElement.dataset.option) {
                    selectedOptionSpan.textContent = optionElement.dataset.option;
                    // Notify extension about model change
                    vscode.postMessage({
                        command: 'modelSelected',
                        model: optionElement.dataset.option
                    });
                }
                dropdownContent.style.display = 'none';
                dropdownToggle.classList.remove('open');
            });
        });
    }
    //#endregion

    //#region Event Listeners
    function setupEventListeners() {
        messageInput.focus();

        // chat input
        sendButton.addEventListener('click', sendMessage);
        messageInput.addEventListener('input', activateInput);
        messageInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter' && !e.shiftKey && !isStreaming) {
                e.preventDefault();
                sendMessage();
            }
        });

        // @mention context
        messageInput.addEventListener('keydown', function (e) {
            // Check if the pressed key is '@'
            if (e.key === '@') {
                const cursorPosition = this.selectionStart;
                const contentBeforeCursor = this.value.substring(0, cursorPosition);

                // Check if the previous character is a space or start of input
                const isStartOfWord = cursorPosition === 0 || /\s$/.test(contentBeforeCursor);

                if (isStartOfWord) {
                    e.preventDefault(); // Prevent the '@' from being typed

                    // Show file picker
                    vscode.postMessage({ command: 'showQuickPick', source: 'chatInput' });

                    // Store the cursor position for later use
                    this.dataset.lastCursorPosition = cursorPosition.toString();
                }
            }
        });

        // file pills
        addFileButton.addEventListener('click', showQuickPick);

        // file pill clicks
        contextContainer.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            handleFilePillClick(target);
        });

        // image selector
        addFileMediaButton.addEventListener('click', () => {
            imageUploadInput.click();
        });

        // image upload
        imageUploadInput.addEventListener('change', (e) => {
            const files = (e.target as HTMLInputElement).files;
            if (files && files.length > 0) {
                handleImageUpload(files[0]);
            }
        });

        // image paste
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (items) {
                for (let i = 0; i < items.length; i++) {
                    if (items[i].type.indexOf('image') !== -1) {
                        e.preventDefault(); // Prevent default paste behavior
                        const file = items[i].getAsFile();
                        if (file) {
                            handleImageUpload(file);
                        }
                        break;
                    }
                }
            }
        });

        // code pills - remove
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.classList.contains('remove-code') || target.closest('.remove-code')) {
                const codeContainer = target.closest('.highlighted-code-container');
                if (codeContainer) {
                    const fileName = (codeContainer as HTMLElement).dataset.fileName;
                    const range = (codeContainer as HTMLElement).dataset.range;
                    if (fileName && range) { // Ensure both are defined
                        removeHighlightCode(fileName, range);
                    }
                }
            }
        });

        // history button
        const historyButton = document.getElementById('history-button') as HTMLButtonElement;
        historyButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'showChatHistory' });
        });

        // merge buttons
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const mergeButton = target.closest('#merge-button');

            if (mergeButton instanceof HTMLElement) {
                const codeHeader = mergeButton.closest('.chat-code-header');
                const codeContainer = codeHeader?.nextElementSibling as HTMLElement;

                if (codeContainer && codeContainer.classList.contains('chat-code-container')) {
                    const rawCode = codeContainer.textContent || '';
                    const fileUri = codeHeader?.querySelector('.file-uri')?.textContent || '';
                    const codeId = codeHeader?.querySelector('.code-id')?.textContent || ''; // Extract code-id
                    vscode.postMessage({
                        command: 'showDiff',
                        code: rawCode,
                        fileUri,
                        codeId // Include code-id in the message
                    });
                }
            }
        });

        // settings gear button
        const settingsGearButton = document.getElementById('manage-keys-button') as HTMLButtonElement;
        settingsGearButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'manageApiKeys' });
        });

        // copy code button
        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            if (target.closest('#copy-code-button')) {
                const codeHeader = target.closest('.chat-code-header');
                const codeContainer = codeHeader?.nextElementSibling as HTMLElement;
                if (codeContainer && codeContainer.classList.contains('chat-code-container')) {
                    const codeContent = codeContainer.textContent || '';
                    copyToClipboard(codeContent);
                    showCopyFeedback(target.closest('#copy-code-button') as HTMLElement);
                }
            }
        });

        // stop streaming chat
        messageInput.addEventListener('keydown', function (e) {
            // Check for Cmd+Backspace (Mac) or Ctrl+Backspace (Windows/Linux)
            if (e.key === 'Backspace' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault(); // Prevent default behavior for this shortcut
                if (isStreaming || isProcessing) {
                    stopEverything();
                    focusTextarea();
                }
            }
        });

        // new chat button
        const newChatButton = document.getElementById('new-chat-button') as HTMLButtonElement;
        newChatButton.addEventListener('click', () => {
            vscode.postMessage({ command: 'chatSession', action: 'new' });
        });
    }
    //#endregion

    //#region Message Listeners
    function setupMessageListener() {
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.command) {
                case 'chatStream':
                    handleChatStreamMessage(message);
                    break;
                case 'addCodePill': {
                    const snippetIdentifier = `${message.fileName}:${message.range}`;
                    // Only add the pill and highlighted code container if the snippet hasn't been added yet
                    if (!addedCodeSnippets.has(snippetIdentifier)) {
                        addCodePill(message.fileName, message.range);
                        addHighlightedCodeContainer(message.fileName, message.range, message.highlightedCode);
                    }
                    focusTextarea(); // always focus back to the textarea
                    break;
                }
                case 'addFilePill': {
                    // add file pill if present
                    if (message.fileUri) {
                        // Handle non-image files with existing file pill logic
                        let newFilePill = findFilePillByUri(message.fileUri);

                        if (!newFilePill) {
                            newFilePill = addFilePill(message.fileName, message.fileUri) as HTMLElement;

                            if (message.currentFile) {
                                updateCurrentFilePill(newFilePill as HTMLElement);
                            }
                        } else if (message.currentFile) {
                            if (!isSameUri(currentFilePill?.getAttribute('data-file-uri') ?? null, newFilePill.getAttribute('data-file-uri') ?? null)) {
                                updateCurrentFilePill(newFilePill as HTMLElement);
                            }
                        }

                        if (message.source === 'chatInput') {
                            handleContextMention(message.fileName);
                        }
                    }

                    focusTextarea();
                    break;
                }
                case 'addImagePill': {
                    // Check if image with this ID already exists
                    const imageExists = currentImages.some(img => img.id === message.fileUri);

                    // Only add image if it doesn't already exist
                    if (!imageExists) {
                        currentImages.push({ id: message.fileUri, data: message.imageData, fileName: message.fileName });
                        displayImagePreview(message.imageData, message.fileName, message.fileUri);
                    }

                    if (message.source === 'chatInput') {
                        handleContextMention(message.fileName);
                    }
                    focusTextarea();
                    break;
                }
                case 'activeEditorChanged': {
                    const newFilePill = findFilePillByUri(message.fileUri);
                    if (newFilePill) {
                        updateCurrentFilePill(newFilePill as HTMLElement);
                    }
                    break;
                }
                case 'addMessage':
                    renderMessage(message.content, message.role);
                    updateSendButtonState();
                    hideProcessingAnimation(); // Add this line to remove the processing animation
                    break;
                case 'addChatError':
                    handleChatError(message);
                    hideProcessingAnimation();
                    break;
                case 'clearChat':
                    chatOutput.innerHTML = '';
                    clearContext();
                    focusTextarea(); // always focus back to the textarea
                    break;
                case 'askMode':
                    messageInput.value = message.question; // Set the message to the chat input
                    resizeTextarea(); // Adjust the textarea size
                    focusTextarea(); // Focus on the textarea
                    break;
                case 'contextMentioned': {
                    const cursorPosition = parseInt(messageInput.dataset.lastCursorPosition || '0');
                    const fileName = message.fileName;

                    // Insert the file name at the cursor position
                    const before = messageInput.value.substring(0, cursorPosition);
                    const after = messageInput.value.substring(cursorPosition);
                    messageInput.value = before + '@' + fileName + ' ' + after;

                    // Set cursor position after the inserted file name
                    const newPosition = cursorPosition + fileName.length + 2; // +2 for '@' and space
                    messageInput.setSelectionRange(newPosition, newPosition);

                    // Focus the textarea
                    messageInput.focus();
                    break;
                }
            }
        });
    }
    //#endregion

    function findFilePillByUri(fileUri: string): Element | undefined {
        return Array.from(document.querySelectorAll('.file-pill')).find(pill => {
            const pillUri = pill.getAttribute('data-file-uri');
            return pillUri && new URL(pillUri).toString() === fileUri;
        });
    }

    function handleChatError(errorMessage: any) {
        const [category, provider, reason] = errorMessage.message.split('.');

        let friendlyMessage = '';

        if (category.toLowerCase() === 'apikey' && reason.toLowerCase() === 'missing') {
            friendlyMessage = `I'm as excited to start as you are, but we need to set up the ${provider} API key first. `;
            friendlyMessage += `Don't worry, it's a one-time setup! `;
            friendlyMessage += '<a href="#" class="manage-keys">Let\'s set up your API keys</a>.';
        } else if (category.toLowerCase() === 'apierror') {
            friendlyMessage = `An API error occurred:<br>`;

            // Display errorMessage
            if (errorMessage.message) {
                friendlyMessage += `${errorMessage.errorMessage}`;
            }

            // Display fullError
            if (errorMessage.fullError) {
                friendlyMessage += `Full details:<br>`;
                if (typeof errorMessage.fullError === 'object') {
                    friendlyMessage += `<pre>${JSON.stringify(errorMessage.fullError, null, 2)}</pre>`;
                } else {
                    friendlyMessage += `<pre>${errorMessage.fullError}</pre>`;
                }
            } else {
                friendlyMessage += 'No detailed error information available.';
            }
        } else {
            // Construct a user-friendly error message for other cases
            friendlyMessage = `An error occurred: `;
            if (provider) {
                friendlyMessage += `${provider} `;
            }
            if (reason) {
                friendlyMessage += `${reason.toLowerCase()} `;
            }
            friendlyMessage += `(${category.toLowerCase()}).`;
            friendlyMessage += ' <a href="#" class="open-settings">Open settings</a>';
        }

        // Render the error message
        renderMessage(friendlyMessage, 'assistant');

        // Add click event listener for the manage keys link
        const manageKeysLink = chatOutput.querySelector('.manage-keys');
        if (manageKeysLink) {
            manageKeysLink.addEventListener('click', (e) => {
                e.preventDefault();
                vscode.postMessage({ command: 'manageApiKeys' });
            });
        }

        // Reset streaming and processing states
        isStreaming = false;
        isProcessing = false;
        updateSendButtonState();
    }

    // Initialization
    function init() {
        setupEventListeners();
        setupDropdown();
        setupMessageListener();
        resizeTextarea();
        updateSendButtonState();
    }

    init();
})();

function generateUniqueId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function isSameUri(uri1: string | null, uri2: string | null): boolean {
    if (!uri1 || !uri2) return false;
    return normalizeUri(uri1) === normalizeUri(uri2);
}

function normalizeUri(uri: string): string {
    try {
        return new URL(uri).toString();
    } catch {
        return uri; // If it's not a valid URL, return the original string
    }
}

function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
    }).catch(err => {
        console.error('Failed to copy code: ', err);
    });
}

function showCopyFeedback(button: HTMLElement) {
    const originalIcon = button.innerHTML;
    button.innerHTML = '<i class="codicon codicon-check"></i>';
    button.classList.add('copied');

    setTimeout(() => {
        button.innerHTML = originalIcon;
        button.classList.remove('copied');
    }, 2000);
}
