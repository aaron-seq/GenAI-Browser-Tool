/**
 * @file offscreen.js
 * @description Script for the offscreen document to handle DOM-related tasks like clipboard access.
 */

class OffscreenManager {
    constructor() {
        this.clipboardTextarea = document.getElementById('clipboard-textarea');
        this.initialize();
    }

    initialize() {
        console.log('Offscreen Document: Initialized.');
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message)
                .then(response => sendResponse({
                    success: true,
                    data: response
                }))
                .catch(error => sendResponse({
                    success: false,
                    error: error.message
                }));
            return true; // Keep message channel open for async response.
        });
    }

    async handleMessage(request) {
        const {
            action,
            data
        } = request;
        switch (action) {
            case 'clipboard-write':
                return this.writeToClipboard(data.text);
            case 'clipboard-read':
                return this.readFromClipboard();
            default:
                throw new Error(`Unknown offscreen action: ${action}`);
        }
    }

    async writeToClipboard(text) {
        try {
            this.clipboardTextarea.value = text;
            this.clipboardTextarea.select();
            document.execCommand('copy');
            return {
                status: 'success'
            };
        } catch (error) {
            console.error('Offscreen: Clipboard write failed.', error);
            throw new Error('Could not write to clipboard.');
        } finally {
            this.clipboardTextarea.value = '';
        }
    }

    async readFromClipboard() {
        try {
            this.clipboardTextarea.value = '';
            this.clipboardTextarea.focus();
            document.execCommand('paste');
            return this.clipboardTextarea.value;
        } catch (error) {
            console.error('Offscreen: Clipboard read failed.', error);
            throw new Error('Could not read from clipboard.');
        } finally {
            this.clipboardTextarea.value = '';
        }
    }
}

new OffscreenManager();
