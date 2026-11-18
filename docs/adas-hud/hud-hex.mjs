export function normalizeOpacity(value, fallback = 100) {
  if (value == null || value === '' || !Number.isFinite(Number(value))) return fallback;
  return Math.max(0, Math.min(100, Math.round(Number(value))));
}

export function bindHexColor(input, apply) {
  const commit = () => {
    const value = input.value.trim();
    if (!/^#?[0-9a-f]{6}$/i.test(value)) {
      input.setAttribute('aria-invalid', 'true');
      input.setCustomValidity('请输入六位十六进制颜色，例如 #FFFFFF。');
      input.reportValidity();
      return;
    }
    const color = '#' + value.replace('#', '').toLowerCase();
    apply(color);
    sync(color);
  };
  const sync = color => {
    input.value = color.toUpperCase();
    input.removeAttribute('aria-invalid');
    input.setCustomValidity('');
  };
  input.addEventListener('change', commit);
  input.addEventListener('input', () => {
    input.removeAttribute('aria-invalid');
    input.setCustomValidity('');
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
  });
  return sync;
}
