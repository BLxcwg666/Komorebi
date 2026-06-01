export function showRepeatToast(message: string): void {
  document.querySelector('.komorebi-repeat-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = 'komorebi-repeat-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add('is-visible'));
  window.setTimeout(() => {
    toast.classList.remove('is-visible');
    window.setTimeout(() => toast.remove(), 220);
  }, 1800);
}
