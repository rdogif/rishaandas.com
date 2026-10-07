import { getClient } from './client.js';
import { todayKey, selectAssignments, validateAssignment } from './model.mjs';

const $ = selector => document.querySelector(selector);
const form = $('#assignment-form');
let client, user, signedIn = false, rows = [], editing = null, filter = 'all', busy = false, loading = false;
let generation = 0, request = 0, loaded = false;
const columns = 'id,subject,name,due_date,notes,completed,created_at,updated_at';
function notice(message = '') { $('#notice').textContent = message; $('#notice').hidden = !message; }
function controls() {
  $('#fields').disabled = !user || busy || !navigator.onLine;
  $('#refresh').disabled = !client || busy || loading;
  $('#disconnect').disabled = busy;
  $('#disconnect').hidden = !signedIn;
  $('#connect').hidden = signedIn;
  $('.editor').hidden = !user;
  $('.layout').classList.toggle('read-only', !user);
  document.querySelectorAll('.assignment button, .assignment input').forEach(el => { el.disabled = busy || !navigator.onLine; });
}
function resetEditor() {
  editing = null; form.reset(); $('#editor-title').textContent = 'Add an assignment';
  $('#save').textContent = 'Add assignment'; $('#cancel').hidden = true;
}
function node(tag, text, className) {
  const el = document.createElement(tag); el.textContent = text;
  if (className) el.className = className;
  return el;
}
function render() {
  const selectedClass = $('#class-filter').value;
  const subjects = [...new Set(rows.map(row => row.subject))].sort((a, b) => a.localeCompare(b));
  $('#class-filter').replaceChildren(new Option('All classes', ''), ...subjects.map(s => new Option(s, s)));
  if (subjects.includes(selectedClass)) $('#class-filter').value = selectedClass;
  $('#subjects').replaceChildren(...subjects.map(s => new Option(s, s)));
  const visible = selectAssignments(rows, filter, $('#class-filter').value);
  $('#count').textContent = loaded ? `${rows.filter(r => !r.completed).length} unfinished · ${visible.length} shown` : '—';
  const list = $('#assignments'); list.replaceChildren();
  if (!visible.length) list.append(node('div', !loaded ? 'Loading assignments from the cloud…' : rows.length ? 'No assignments match this filter.' : 'No assignments yet.', 'empty'));
  for (const row of visible) {
    const card = node('article', '', `assignment${row.completed ? ' done' : ''}`);
    const label = node('label', '', 'toggle');
    const check = document.createElement('input'); check.type = 'checkbox'; check.checked = row.completed;
    check.setAttribute('aria-label', `Mark ${row.name} ${row.completed ? 'incomplete' : 'complete'}`);
    check.addEventListener('change', () => { check.checked = row.completed; mutate(row, { completed: !row.completed }); });
    label.append(check);
    const content = node('div', '', 'content'); const meta = node('div', '', 'meta');
    meta.append(node('span', row.subject));
    const date = new Date(`${row.due_date}T12:00:00`);
    const overdue = !row.completed && row.due_date < todayKey();
    const due = node('time', `${row.completed ? 'Completed · ' : overdue ? 'Overdue · ' : row.due_date === todayKey() ? 'Today · ' : 'Due · '}${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`, overdue ? 'overdue' : '');
    due.dateTime = row.due_date; meta.append(due); content.append(meta, node('h3', row.name));
    if (row.notes) content.append(node('p', row.notes, 'notes'));
    const actions = node('div', '', 'actions'); const edit = node('button', 'Edit'); const del = node('button', 'Delete');
    edit.setAttribute('aria-label', `Edit ${row.name}`); del.setAttribute('aria-label', `Delete ${row.name}`);
    edit.onclick = () => {
      editing = { ...row };
      for (const key of ['subject', 'name', 'due_date', 'notes']) form.elements.namedItem(key).value = row[key];
      $('#completed').checked = row.completed; $('#editor-title').textContent = 'Edit assignment';
      $('#save').textContent = 'Save changes'; $('#cancel').hidden = false; $('#subject').focus();
    };
    del.onclick = () => { if (confirm(`Delete “${row.name}”? This removes it from all your devices.`)) mutate(row, null); };
    if (user) { actions.append(edit, del); content.append(actions); card.append(label); }
    card.append(content); list.append(card);
  }
  controls();
}

async function refresh() {
  if (!client || busy || loading) return;
  if (!navigator.onLine) { $('#sync-status').textContent = 'Offline · changes cannot be saved'; controls(); return; }
  const epoch = generation, ticket = ++request;
  loading = true; controls(); $('#assignments').setAttribute('aria-busy', 'true');
  $('#sync-status').textContent = 'Checking the cloud…';
  try {
    // Paginate instead of silently losing assignments beyond Supabase's row limit.
    const result = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from('homework_assignments').select(columns)
        .order('id').range(offset, offset + 499);
      if (error) throw error;
      result.push(...data);
      if (data.length < 500) break;
    }
    if (epoch !== generation || ticket !== request) return;
    rows = result; loaded = true; render();
    $('#sync-status').textContent = `Cloud checked ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · refreshes every 15s`;
  } catch {
    if (epoch === generation && ticket === request) {
      $('#sync-status').textContent = loaded ? 'Cloud unavailable · showing the last loaded assignments. Try Refresh.' : 'Assignments could not be loaded. Try Refresh.';
      if (!loaded) $('#assignments').replaceChildren(node('div', 'Unable to load assignments right now.', 'empty'));
    }
  } finally {
    if (ticket === request) { loading = false; $('#assignments').setAttribute('aria-busy', 'false'); controls(); }
  }
}

async function mutate(row, values, fromEditor = false) {
  if (busy || !user) return;
  if (!navigator.onLine) { notice('You are offline. Reconnect before saving; your form is still here.'); return; }
  busy = true; ++request; loading = false; controls(); notice();
  const epoch = generation;
  try {
    let query;
    if (!row) query = client.from('homework_assignments').insert({ ...values, user_id: user.id });
    else {
      query = values === null ? client.from('homework_assignments').delete() : client.from('homework_assignments').update(values);
      query = query.eq('id', row.id).eq('updated_at', row.updated_at);
    }
    const { data, error } = await query.select(columns);
    if (error) throw error;
    if (epoch !== generation) return;
    if (data.length !== 1) throw new Error('This assignment changed or was deleted on another device. Your draft is still here. Refresh, then reopen Edit before saving again.');
    if (fromEditor || (row && editing?.id === row.id)) resetEditor();
    notice(values === null ? 'Assignment deleted from the cloud.' : 'Saved to the cloud.');
  } catch (error) {
    notice(error.message?.startsWith('This assignment') ? error.message : 'Save could not be confirmed. Your form has been kept. Refresh to check the cloud before retrying; a lost connection can hide a successful save.');
  } finally { busy = false; controls(); await refresh(); }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  try {
    const values = validateAssignment({ ...Object.fromEntries(new FormData(form)), completed: $('#completed').checked });
    mutate(editing, values, true);
  } catch (error) { notice(error.message); }
});
$('#cancel').onclick = resetEditor;
$('#refresh').onclick = refresh;
$('#class-filter').onchange = render;
$('#filters').onclick = event => {
  const button = event.target.closest('button[data-filter]'); if (!button) return;
  filter = button.dataset.filter;
  $('#filters').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
  render();
};
$('#disconnect').onclick = async () => {
  busy = true; controls();
  try {
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) throw error;
    await applySession(null); notice('Signed out of admin mode. The public list is still available.');
  } catch { notice('Could not disconnect. Try again before leaving a shared device.'); }
  finally { busy = false; controls(); await refresh(); }
};
async function applySession(session) {
  if (user?.id === session?.user?.id && user) return;
  ++generation; ++request; loading = false; user = null; signedIn = Boolean(session); resetEditor(); render();
  $('#assignments').setAttribute('aria-busy', 'false');
  if (!session) { await refresh(); return; }
  const epoch = generation;
  try {
    const { data, error } = await client.from('homework_members').select('user_id').eq('user_id', session.user.id).maybeSingle();
    if (epoch !== generation) return;
    if (error || !data) throw new Error('Admin access could not be verified. The public list is still available. Sign out or reload to try again.');
    user = session.user; render(); await refresh();
  } catch (error) {
    if (epoch !== generation) return;
    notice(error.message); controls(); await refresh();
  }
}
window.addEventListener('online', () => { controls(); refresh(); });
window.addEventListener('offline', () => { $('#sync-status').textContent = 'Offline · changes cannot be saved'; controls(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
window.addEventListener('focus', refresh);
window.addEventListener('beforeunload', event => {
  if (busy || form.elements.name.value || form.elements.subject.value || $('#notes').value) { event.preventDefault(); event.returnValue = ''; }
});
try {
  client = await getClient();
  client.auth.onAuthStateChange((_event, session) => { setTimeout(() => applySession(session), 0); });
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  // Remove callback codes/errors from the address bar once the SDK has processed them.
  if (location.search || location.hash) history.replaceState(null, '', location.pathname);
  await applySession(data.session);
  setInterval(() => { if (!document.hidden) refresh(); }, 15000);
} catch (error) {
  $('#sync-status').textContent = 'Cloud connection unavailable'; notice(error.message);
  $('#assignments').setAttribute('aria-busy', 'false'); controls();
}
