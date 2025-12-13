/**
 * @fileoverview UI rendering utilities for GenAI Browser Tool
 * @author Aaron Sequeira
 * @version 4.0.1
 */

export class UIRenderer {
  constructor() {
    this.theme = this.detectTheme();
    this.animationDuration = 300;
  }

  renderSummaryCard(summaryData) {
    const { summary, keyPoints = [] } = summaryData;
    const keyPointsHtml = keyPoints.length > 0 
      ? keyPoints.map(point => `<li>${this.sanitizeHtml(point)}</li>`).join('')
      : '';

    return `
      <div class="summary-card modern-card">
        <div class="card-header">
          <h3 class="card-title">Page Summary</h3>
        </div>
        <div class="card-content">
          <div class="summary-text">${this.formatText(summary)}</div>
          ${keyPointsHtml ? `<ul class="key-points">${keyPointsHtml}</ul>` : ''}
        </div>
        <div class="card-actions">
          <button class="action-button secondary" onclick="navigator.clipboard.writeText('${this.escapeForAttribute(summary)}')">Copy</button>
        </div>
      </div>
    `;
  }

  createConversationMessage(role, content) {
    const messageElement = document.createElement('div');
    messageElement.className = `conversation-message ${role}-message`;
    messageElement.innerHTML = `
      <div class="message-avatar ${role}-avatar"></div>
      <div class="message-content">${this.formatText(content)}</div>
      <div class="message-timestamp">${this.formatTime(new Date())}</div>
    `;
    return messageElement;
  }

  createStatusMessage(message, type = 'info') {
    const statusElement = document.createElement('div');
    statusElement.className = `status-message ${type}-message`;
    statusElement.innerHTML = `
      <div class="status-icon"></div>
      <div class="status-text">${message}</div>
      <button class="status-dismiss" onclick="this.parentElement.remove()">×</button>
    `;
    return statusElement;
  }

  formatText(text) {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  sanitizeHtml(html) {
    const temp = document.createElement('div');
    temp.textContent = html;
    return temp.innerHTML;
  }

  escapeForAttribute(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  detectTheme() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
}