import { DEVICES, DEFAULT_DEVICE } from './devices.js';

/**
 * Sets up the phone frame simulator with device switching.
 */
export function initSimulator() {
  const frame = document.querySelector('.phone-frame');
  const selectorContainer = document.querySelector('.device-selector');

  if (!frame || !selectorContainer) return;

  let activeDevice = DEFAULT_DEVICE;

  function applyDevice(/** @type {import('./devices.js').DevicePreset} */ device) {
    if (!(frame instanceof HTMLElement)) return;
    activeDevice = device;

    // Scale to fit viewport
    const maxH = window.innerHeight - 200;
    const maxW = window.innerWidth - 80;
    const scale = Math.min(1, maxH / (device.height + 24), maxW / (device.width + 24));

    frame.style.width = `${device.width + 24}px`;
    frame.style.height = `${device.height + 24}px`;
    frame.style.transform = `scale(${scale})`;
    frame.style.transformOrigin = 'center center';

    // Update active button
    document.querySelectorAll('.device-selector__btn').forEach(btn => {
      btn.classList.toggle('device-selector__btn--active',
        btn.getAttribute('data-device') === device.name);
    });
  }

  // Create device buttons
  selectorContainer.innerHTML = '';
  for (const device of DEVICES) {
    const btn = document.createElement('button');
    btn.className = 'device-selector__btn';
    btn.textContent = device.name;
    btn.setAttribute('data-device', device.name);
    btn.addEventListener('click', () => applyDevice(device));
    selectorContainer.appendChild(btn);
  }

  // Apply default
  applyDevice(activeDevice);

  // Resize handler
  window.addEventListener('resize', () => applyDevice(activeDevice));

  // Update status bar time
  updateStatusBarTime();
  setInterval(updateStatusBarTime, 60000);
}

function updateStatusBarTime() {
  const el = document.querySelector('.status-bar__time');
  if (el) {
    const now = new Date();
    el.textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }
}
