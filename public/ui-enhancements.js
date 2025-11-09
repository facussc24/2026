// Toast Notification System
class ToastManager {
  constructor() {
    this.container = null;
    this.init();
  }

  init() {
    // Create container if it doesn't exist
    if (!document.querySelector('.toast-container')) {
      this.container = document.createElement('div');
      this.container.className = 'toast-container';
      document.body.appendChild(this.container);
    } else {
      this.container = document.querySelector('.toast-container');
    }
  }

  show(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
      success: '✓',
      error: '✕',
      info: 'ℹ',
      warning: '⚠'
    };

    const titles = {
      success: 'Éxito',
      error: 'Error',
      info: 'Información',
      warning: 'Advertencia'
    };

    toast.innerHTML = `
      <span class="toast-icon">${icons[type] || icons.info}</span>
      <div class="toast-content">
        <div class="toast-title">${titles[type] || titles.info}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close">×</button>
    `;

    this.container.appendChild(toast);

    // Close button
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => this.remove(toast));

    // Auto remove
    if (duration > 0) {
      setTimeout(() => this.remove(toast), duration);
    }

    return toast;
  }

  remove(toast) {
    toast.classList.add('removing');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  success(message, duration) {
    return this.show(message, 'success', duration);
  }

  error(message, duration) {
    return this.show(message, 'error', duration);
  }

  info(message, duration) {
    return this.show(message, 'info', duration);
  }

  warning(message, duration) {
    return this.show(message, 'warning', duration);
  }
}

// Loading Spinner
class LoadingManager {
  constructor() {
    this.overlay = null;
  }

  show() {
    if (this.overlay) return;

    this.overlay = document.createElement('div');
    this.overlay.className = 'spinner-overlay';
    this.overlay.innerHTML = '<div class="spinner"></div>';
    document.body.appendChild(this.overlay);
  }

  hide() {
    if (this.overlay && this.overlay.parentNode) {
      this.overlay.parentNode.removeChild(this.overlay);
      this.overlay = null;
    }
  }
}

// Status Indicator
class StatusIndicator {
  constructor() {
    this.indicator = null;
    this.lastSaveTime = null;
    this.init();
  }

  init() {
    this.indicator = document.createElement('div');
    this.indicator.className = 'status-indicator hidden';
    this.indicator.innerHTML = `
      <div class="status-dot"></div>
      <div class="status-text">Guardado</div>
      <div class="status-time"></div>
    `;
    document.body.appendChild(this.indicator);
  }

  show(status, text, time) {
    const dot = this.indicator.querySelector('.status-dot');
    const textEl = this.indicator.querySelector('.status-text');
    const timeEl = this.indicator.querySelector('.status-time');

    dot.className = `status-dot ${status}`;
    textEl.textContent = text;
    
    if (time) {
      timeEl.textContent = this.formatTime(time);
    }

    this.indicator.classList.remove('hidden');

    // Auto hide after 3 seconds (except when saving)
    if (status !== 'saving') {
      setTimeout(() => {
        this.indicator.classList.add('hidden');
      }, 3000);
    }
  }

  hide() {
    this.indicator.classList.add('hidden');
  }

  saving() {
    this.show('saving', 'Guardando...', null);
  }

  saved() {
    this.lastSaveTime = new Date();
    this.show('', 'Guardado', this.lastSaveTime);
  }

  error() {
    this.show('error', 'Error al guardar', null);
  }

  formatTime(date) {
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'ahora mismo';
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
    return date.toLocaleDateString();
  }
}

// Initialize global instances
const toast = new ToastManager();
const loading = new LoadingManager();
const statusIndicator = new StatusIndicator();

// Auto-save manager
class AutoSaveManager {
  constructor(saveFunction, interval = 30000) {
    this.saveFunction = saveFunction;
    this.interval = interval;
    this.timeoutId = null;
    this.isDirty = false;
  }

  markDirty() {
    this.isDirty = true;
    this.scheduleAutoSave();
  }

  scheduleAutoSave() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }

    this.timeoutId = setTimeout(async () => {
      if (this.isDirty) {
        await this.save();
      }
    }, this.interval);
  }

  async save() {
    if (!this.isDirty) return;

    try {
      statusIndicator.saving();
      await this.saveFunction();
      this.isDirty = false;
      statusIndicator.saved();
    } catch (error) {
      console.error('Auto-save error:', error);
      statusIndicator.error();
    }
  }

  stop() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
}
