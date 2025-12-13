/**
 * @file services/notification-manager.js
 * @description Manages browser notifications
 */

export class NotificationManager {
  constructor() {}

  /** @param {string} message */
  showError(message) {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'Error',
        message
      });
    }
  }

  /**
   * @param {string} title
   * @param {string} message
   */
  showSuccess(title, message) {
    if (typeof chrome !== 'undefined' && chrome.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png',
        title,
        message
      });
    }
  }
}
