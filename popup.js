/**
 * @file popup.js
 * @description Logic for the extension's popup UI.
 */

class PopupManager {
    constructor() {
        this.initialize();
    }

    async initialize() {
        this.setupEventListeners();
        this.showLoading('Initializing...');
        try {
            const [tab] = await chrome.tabs.query({
                active: true,
                currentWindow: true
            });
            if (tab && tab.url && tab.url.startsWith('http')) {
                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: 'extractContent'
                });
                if (response && response.success) {
                    this.pageContent = response.data;
                }
            } else {
                this.showError("Cannot run on this page.");
            }
        } catch (error) {
            console.warn('Could not extract page content:', error);
            this.showError("Failed to access page content.");
        } finally {
            this.hideLoading();
        }
    }

    setupEventListeners() {
        document.getElementById('summarize-page').addEventListener('click', () => this.summarizePage());
        document.getElementById('ask-button').addEventListener('click', () => this.askQuestion());
        document.querySelectorAll('.tab-button').forEach(button => {
            button.addEventListener('click', e => this.switchTab(e.currentTarget.dataset.tab));
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-button.active, .tab-pane.active').forEach(el => el.classList.remove('active'));
        document.querySelector(`.tab-button[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');
    }

    async summarizePage() {
        if (!this.pageContent) {
            this.showError("No content to summarize.");
            return;
        }

        this.showLoading("Generating summary...");
        try {
            const response = await chrome.runtime.sendMessage({
                action: 'summarize',
                data: {
                    text: this.pageContent.mainText,
                    type: document.getElementById('summary-type').value,
                    length: document.querySelector('input[name="summary-length"]:checked').value,
                }
            });
            if (response.success) {
                this.displayResult('summary-text', response.data);
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            this.showError(`Summarization failed: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    async askQuestion() {
        const questionInput = document.getElementById('question-input');
        const question = questionInput.value.trim();
        if (!question) return;

        if (!this.pageContent) {
            this.showError("No page content for context.");
            return;
        }

        this.showLoading("Thinking...");
        this.addChatMessage('user', question);
        questionInput.value = '';

        try {
            const response = await chrome.runtime.sendMessage({
                action: 'ask-question',
                data: {
                    question,
                    context: this.pageContent.mainText,
                }
            });
            if (response.success) {
                this.addChatMessage('assistant', response.data);
            } else {
                throw new Error(response.error);
            }
        } catch (error) {
            this.addChatMessage('assistant', `Error: ${error.message}`);
        } finally {
            this.hideLoading();
        }
    }

    displayResult(elementId, text) {
        document.getElementById(elementId).innerHTML = this.formatText(text);
    }

    addChatMessage(role, text) {
        const chatHistory = document.getElementById('chat-history');
        const messageEl = document.createElement('div');
        messageEl.classList.add('chat-message', role);
        messageEl.innerHTML = this.formatText(text);
        chatHistory.appendChild(messageEl);
        chatHistory.scrollTop = chatHistory.scrollHeight; // Auto-scroll
    }


    formatText(text) {
        return text
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, '<br>');
    }

    showLoading(message) {
        const overlay = document.getElementById('loading-overlay');
        document.getElementById('loading-text').textContent = message;
        overlay.style.display = 'flex';
    }

    hideLoading() {
        document.getElementById('loading-overlay').style.display = 'none';
    }

    showError(message) {
        this.updateStatus('error', message);
    }

    updateStatus(type, text) {
        const statusText = document.getElementById('status-text');
        statusText.textContent = text;
        statusText.className = `status-text ${type}`;
    }
}

document.addEventListener('DOMContentLoaded', () => new PopupManager());
