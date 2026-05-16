const errEl = document.getElementById('err');

function setError(msg) {
  errEl.textContent = msg || '';
}

async function submitCredentials(path, form) {
  setError('');
  const data = Object.fromEntries(new FormData(form).entries());
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    let msg = 'Request failed';
    try { msg = (await res.json()).error || msg; } catch (_) {}
    setError(msg);
    return;
  }
  window.location.href = '/app.html';
}

document.getElementById('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitCredentials('/api/login', e.target);
});

document.getElementById('signup-form').addEventListener('submit', (e) => {
  e.preventDefault();
  submitCredentials('/api/signup', e.target);
});

(async () => {
  try {
    const res = await fetch('/api/me');
    if (res.ok) window.location.href = '/app.html';
  } catch (_) {}
})();
