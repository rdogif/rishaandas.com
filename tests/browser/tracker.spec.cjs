const { test, expect } = require('@playwright/test');
const mockClient = `
let session = { user: { id: 'owner' } };
export async function getClient() {
  return {
    auth: {
      getSession: async () => ({ data: { session } }),
      onAuthStateChange: () => {},
      signOut: async () => { session = null; return {}; },
      signInWithOtp: async args => { window.otpRequest = args; return {}; }
    },
    from(table) {
      const request = { table, action: 'select', filters: [] };
      const q = {
        select() { return q; },
        order() { return q; },
        range(start, end) { request.range = [start, end]; return q; },
        eq(key, value) { request.filters.push([key, value]); return q; },
        maybeSingle() { request.single = true; return q; },
        insert(values) { request.action = 'insert'; request.values = values; return q; },
        update(values) { request.action = 'update'; request.values = values; return q; },
        delete() { request.action = 'delete'; return q; },
        then(resolve, reject) { return fetch('/__test_cloud', { method: 'POST', body: JSON.stringify(request) }).then(r => r.json()).then(resolve, reject); }
      }; return q;
    }
  };
}`;
async function mockCloud(context, state, role = 'owner') {
  const source = mockClient.replace("let session = { user: { id: 'owner' } };", `let session = ${JSON.stringify(role ? { user: { id: role } } : null)};`);
  await context.route('**/homework/client.js', route => route.fulfill({ contentType: 'text/javascript', body: source }));
  await context.route('**/__test_cloud', async route => {
    const req = route.request().postDataJSON();
    if (state.fail) return route.fulfill({ json: { error: { message: 'Network failed' } } });
    let data;
    if (req.table === 'homework_members') data = role === 'owner' ? { user_id: 'owner' } : null;
    else if (req.action === 'insert') {
      const row = { ...req.values, id: String(++state.version), created_at: '2026-10-01', updated_at: String(state.version) };
      state.rows.push(row); data = [row];
    } else {
      data = state.rows.filter(row => req.filters.every(([key, value]) => row[key] === value));
      if (req.action === 'update') data.forEach(row => Object.assign(row, req.values, { updated_at: String(++state.version) }));
      if (req.action === 'delete') state.rows = state.rows.filter(row => !data.includes(row));
      if (req.range) data = data.slice(req.range[0], req.range[1] + 1);
    }
    await route.fulfill({ json: { data, error: null } });
  });
}
async function add(page, name, due = '2026-10-08') {
  await page.getByLabel('Class / subject').fill('AP Physics 1');
  await page.getByLabel('Assignment name', { exact: true }).fill(name);
  await page.getByLabel('Due date', { exact: true }).fill(due);
  await page.getByRole('button', { name: 'Add assignment', exact: true }).click();
  await expect(page.locator('.assignment h3').filter({ hasText: name })).toBeVisible();
}
test('unconfigured installation fails closed and retains navigation', async ({ page }) => {
  await page.route('**/homework/config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const config = { url: '', publishableKey: '' };" }));
  await page.goto('/homework/');
  await expect(page.getByRole('alert')).toContainText('Cloud setup is not finished');
  await expect(page.locator('.editor')).toBeHidden();
  await expect(page.getByRole('link', { name: 'Quick Links' })).toHaveAttribute('href', '/');
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Homework Tracker' })).toHaveAttribute('href', '/homework/');
  await page.goto('/education/');
  await expect(page.getByRole('link', { name: 'Homework Tracker' })).toHaveAttribute('href', '/homework/');
});
test('CRUD, safe text, filters, stale edits, sync across contexts, offline and disconnect', async ({ browser }) => {
  const first = await browser.newContext(); const second = await browser.newContext();
  const state = { rows: [], version: 0 };
  await mockCloud(first, state); await mockCloud(second, state);
  const a = await first.newPage(); const b = await second.newPage();
  const errors = []; a.on('pageerror', error => errors.push(error.message)); b.on('pageerror', error => errors.push(error.message));
  await a.goto('/homework/'); await add(a, 'Page 42');
  await b.goto('/homework/'); await expect(b.locator('.assignment h3')).toHaveText('Page 42');
  await a.getByRole('button', { name: 'Edit Page 42', exact: true }).click();
  await b.getByRole('button', { name: 'Edit Page 42', exact: true }).click();
  await b.getByLabel('Notes (optional)').fill('<img src=x onerror=alert(1)>');
  await b.getByRole('button', { name: 'Save changes' }).click();
  await expect(b.locator('.notes')).toHaveText('<img src=x onerror=alert(1)>');
  await expect(b.locator('.notes img')).toHaveCount(0);
  await a.getByLabel('Assignment name', { exact: true }).fill('Stale edit');
  await a.getByRole('button', { name: 'Save changes' }).click();
  await expect(a.getByRole('alert')).toContainText('changed or was deleted');
  await expect(a.getByLabel('Assignment name', { exact: true })).toHaveValue('Stale edit');
  await a.getByRole('button', { name: 'Cancel edit' }).click();
  await b.getByRole('checkbox', { name: 'Mark Page 42 complete', exact: true }).click();
  await expect(b.locator('.assignment.done')).toHaveCount(1);
  // The second browser does not share any localStorage with the first.
  await a.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(a.locator('.assignment.done')).toHaveCount(1);
  await a.getByRole('button', { name: 'Completed', exact: true }).click();
  await expect(a.locator('.assignment')).toHaveCount(1);
  await a.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(a.locator('.assignment')).toHaveCount(0);
  await a.getByRole('button', { name: 'All', exact: true }).click();
  await first.setOffline(true);
  await expect(a.getByRole('button', { name: 'Add assignment', exact: true })).toBeDisabled();
  await first.setOffline(false);
  await expect(a.getByRole('button', { name: 'Add assignment', exact: true })).toBeEnabled();
  state.fail = true;
  await a.getByLabel('Class / subject').fill('Math');
  await a.getByLabel('Assignment name', { exact: true }).fill('Keep my draft');
  await a.getByLabel('Due date', { exact: true }).fill('2026-10-09');
  await a.getByRole('button', { name: 'Add assignment', exact: true }).click();
  await expect(a.getByRole('alert')).toContainText('Save could not be confirmed');
  await expect(a.getByLabel('Assignment name', { exact: true })).toHaveValue('Keep my draft');
  state.fail = false;
  b.once('dialog', dialog => dialog.accept());
  await b.getByRole('button', { name: 'Delete Page 42', exact: true }).click();
  await expect(b.locator('.assignment')).toHaveCount(0);
  await a.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(a.locator('.assignment')).toHaveCount(0);
  await a.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(a.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
  await expect(a.locator('.editor')).toBeHidden();
  expect(errors).toEqual([]);
  await first.close(); await second.close();
});
for (const [name, width, height] of [['phone', 390, 844], ['ipad', 820, 1180], ['desktop', 1440, 1000]]) {
  test(`${name} layout fits and supports assignment entry`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    const state = { rows: [], version: 0 }; await mockCloud(context, state);
    await page.goto('/homework/'); await add(page, 'Page 42');
    await expect(page.locator('.assignment')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/homework-${name}.png`, fullPage: true });
  });
}
test('device connection requests existing user only and correct redirect', async ({ page, context }) => {
  await mockCloud(context, { rows: [], version: 0 });
  await page.goto('/homework/connect.html');
  await page.getByLabel('Your email').fill('student@example.com');
  await page.getByRole('button', { name: 'Send connection link' }).click();
  await expect(page.getByRole('status')).toContainText('link is on its way');
  expect(await page.evaluate(() => window.otpRequest)).toEqual({ email: 'student@example.com', options: { shouldCreateUser: false, emailRedirectTo: new URL('./', page.url()).href } });
});

for (const [name, width, height] of [['phone', 390, 844], ['ipad', 820, 1180], ['desktop', 1440, 1000]]) {
  test(`public ${name} shows assignments and filters without login or editing controls`, async ({ page, context }) => {
    await page.setViewportSize({ width, height });
    const state = { rows: [{ id: '1', subject: 'Physics', name: 'Page 42', notes: 'Read these notes', due_date: '2026-10-08', completed: false, created_at: '2026-10-01', updated_at: '1' }], version: 1 };
    await mockCloud(context, state, null);
    await page.clock.install();
    await page.goto('/homework/');
    await expect(page.locator('.assignment h3')).toHaveText('Page 42');
    await expect(page.locator('.notes')).toHaveText('Read these notes');
    await expect(page.locator('.editor')).toBeHidden();
    await expect(page.locator('.assignment button, .assignment input')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
    await expect(page.locator('#notice')).toBeHidden();
    await page.getByRole('button', { name: 'Completed', exact: true }).click();
    await expect(page.locator('.assignment')).toHaveCount(0);
    await page.getByRole('button', { name: 'All', exact: true }).click();
    await page.locator('#class-filter').selectOption('Physics');
    await expect(page.locator('.assignment')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/homework-public-${name}.png`, fullPage: true });
    // Public viewers receive cloud changes on the normal polling interval.
    state.rows[0].completed = true;
    await page.clock.runFor(15000);
    await expect(page.locator('.assignment.done')).toHaveCount(1);
  });
}

test('unapproved authenticated account remains read-only', async ({ page, context }) => {
  await mockCloud(context, { rows: [{ id: '1', subject: 'Physics', name: 'Page 42', notes: '', due_date: '2026-10-08', completed: false, created_at: '2026-10-01', updated_at: '1' }], version: 1 }, 'unapproved');
  await page.goto('/homework/');
  await expect(page.locator('.assignment h3')).toHaveText('Page 42');
  await expect(page.locator('.editor')).toBeHidden();
  await expect(page.locator('.assignment button, .assignment input')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.assignment h3')).toHaveText('Page 42');
  await expect(page.getByRole('link', { name: 'Admin', exact: true })).toBeVisible();
});

test('admin sign-out removes editing controls but keeps public assignments', async ({ page, context }) => {
  const state = { rows: [], version: 0 };
  await mockCloud(context, state);
  await page.goto('/homework/'); await add(page, 'Public after sign-out');
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.locator('.assignment h3')).toHaveText('Public after sign-out');
  await expect(page.locator('.editor')).toBeHidden();
  await expect(page.locator('.assignment button, .assignment input')).toHaveCount(0);
});
