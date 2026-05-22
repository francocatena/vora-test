const listEl = document.getElementById('list');
const errEl = document.getElementById('err');
const whoEl = document.getElementById('who');

function setError(msg) { errEl.textContent = msg || ''; }

async function api(path, init) {
  const res = await fetch(path, init);
  if (res.status === 401) {
    window.location.href = '/';
    return null;
  }
  if (!res.ok) {
    let msg = 'Request failed';
    try { msg = (await res.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

function renderNotes(notes) {
  listEl.replaceChildren();
  if (!notes.length) {
    const p = document.createElement('p');
    p.textContent = 'No notes yet.';
    listEl.appendChild(p);
    return;
  }
  for (const note of notes) {
    const card = document.createElement('article');
    card.className = 'note';

    const title = document.createElement('h3');
    title.innerHTML = note.title;

    const body = document.createElement('p');
    body.textContent = note.body;

    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = `Created ${note.created_at}`;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'secondary';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteNote(note.id));

    card.append(title, body, meta, del);
    listEl.appendChild(card);
  }
}

async function loadNotes() {
  try {
    const notes = await api('/api/notes');
    if (notes) renderNotes(notes);
  } catch (err) { setError(err.message); }
}

async function searchNotes(q) {
  try {
    const notes = await api(`/api/search?q=${encodeURIComponent(q)}`);
    if (notes) renderNotes(notes);
  } catch (err) { setError(err.message); }
}

async function deleteNote(id) {
  try {
    await api(`/api/notes/${id}`, { method: 'DELETE' });
    await loadNotes();
  } catch (err) { setError(err.message); }
}

document.getElementById('new-note').addEventListener('submit', async (e) => {
  e.preventDefault();
  setError('');
  const data = Object.fromEntries(new FormData(e.target).entries());
  try {
    await api('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(data),
    });
    e.target.reset();
    await loadNotes();
  } catch (err) { setError(err.message); }
});

document.getElementById('search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get('q') || '';
  if (!q.toString().trim()) loadNotes();
  else searchNotes(q.toString().trim());
});

document.getElementById('clear-search').addEventListener('click', () => {
  document.querySelector('#search input[name="q"]').value = '';
  loadNotes();
});

document.getElementById('logout').addEventListener('click', async () => {
  try {
    await api('/api/logout', { method: 'POST' });
  } catch (_) {}
  window.location.href = '/';
});

(async () => {
  try {
    const me = await api('/api/me');
    if (me) whoEl.textContent = `Signed in as ${me.username}`;
    await loadNotes();
  } catch (err) { setError(err.message); }
})();
