/**
 * @file options.js
 * @description Logic for the extension's settings page.
 */

import {
    StorageManager
} from './services/storage.js';

class OptionsPage {
    constructor() {
        this.storageManager = new StorageManager();
        this.settings = {};
        this.initialize();
    }

    async initialize() {
        this.settings = await this.storageManager.getSettings();
        this.setupEventListeners();
        this.renderSettings();
        this.checkWelcome();
    }

    setupEventListeners() {
        document.querySelectorAll('input, select').forEach(element => {
            element.addEventListener('change', event => this.handleSettingChange(event));
        });

        document.querySelectorAll('.nav-item').forEach(button => {
            button.addEventListener('click', event => this.switchSection(event));
        });

        document.getElementById('reset-settings').addEventListener('click', () => this.resetSettings());
    }

    renderSettings() {
        // AI Provider
        document.querySelector(`input[name="primary-provider"][value="${this.settings.preferredProvider}"]`).checked = true;
        Object.keys(this.settings.apiKeys).forEach(key => {
            const input = document.getElementById(`${key}-key`);
            if (input) input.value = this.settings.apiKeys[key];
        });

        // Features
        document.getElementById('smart-bookmarks').checked = this.settings.features.smartBookmarks;
        document.getElementById('context-menus').checked = this.settings.features.contextMenus;
        document.getElementById('auto-analysis').checked = this.settings.features.autoAnalysis;
    }

    async handleSettingChange(event) {
        const {
            name,
            type,
            value,
            checked,
            id
        } = event.target;
        let newSettings = { ...this.settings
        };

        if (name === 'primary-provider') {
            newSettings.preferredProvider = value;
        } else if (id.endsWith('-key')) {
            const provider = id.replace('-key', '');
            newSettings.apiKeys[provider] = value;
        } else if (type === 'checkbox') {
            newSettings.features[id] = checked;
        }

        await this.storageManager.updateSettings(newSettings);
        this.settings = newSettings;
        this.showSaveIndicator();
    }

    async resetSettings() {
        if (confirm('Are you sure you want to reset all settings to their defaults?')) {
            await this.storageManager.initializeDefaults();
            this.settings = await this.storageManager.getSettings();
            this.renderSettings();
            this.showSaveIndicator('Settings reset to default.');
        }
    }

    switchSection(event) {
        const sectionId = event.currentTarget.dataset.section;

        document.querySelectorAll('.nav-item.active, .settings-section.active').forEach(el => {
            el.classList.remove('active');
        });

        event.currentTarget.classList.add('active');
        document.getElementById(`${sectionId}-section`).classList.add('active');
    }

    checkWelcome() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('welcome')) {
            document.getElementById('welcome-section').style.display = 'block';
            document.getElementById('get-started').addEventListener('click', () => {
                document.getElementById('welcome-section').style.display = 'none';
            });
        }
    }

    showSaveIndicator(message = 'Settings saved') {
        const indicator = document.getElementById('save-indicator');
        indicator.querySelector('.text').textContent = message;
        indicator.classList.add('visible');
        setTimeout(() => indicator.classList.remove('visible'), 2000);
    }
}

document.addEventListener('DOMContentLoaded', () => new OptionsPage());
