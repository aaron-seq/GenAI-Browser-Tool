/**
 * @file services/notification-manager.js
 * @description Desktop notifications for background actions.
 *
 * `iconUrl` must resolve to a packaged file — the previous 'icon.png' did not
 * exist in the extension, so Chrome silently dropped every notification.
 */

const ICON_PATH = 'assets/icons/icon-128.png';

export class NotificationManager {
  /** @param {string} message */
  showError(message) {
    this.create('GenAI Browser Tool', message);
  }

  /** @param {string} title @param {string} message */
  showSuccess(title, message) {
    this.create(title, message);
  }

  /** @param {string} title @param {string} message */
  create(title, message) {
    if (typeof chrome === 'undefined' || !chrome.notifications) return;
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL(ICON_PATH),
      title,
      message
    });
  }
}
