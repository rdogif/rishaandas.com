import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todayKey, selectAssignments, validateAssignment } from '../homework/model.mjs';
const row = (id, due_date, completed = false, subject = 'Physics') => ({ id, due_date, completed, subject, created_at: '2026-10-01' });
const rows = [row('done', '2026-10-01', true), row('later', '2026-10-09'), row('today', '2026-10-07'), row('past', '2026-10-06', false, 'Math')];
test('unfinished due-date ordering, completed last, without mutating source', () => {
  assert.deepEqual(selectAssignments(rows).map(r => r.id), ['past', 'today', 'later', 'done']);
  assert.equal(rows[0].id, 'done');
});
test('calendar-day filters and class intersection', () => {
  for (const [filter, ids] of [['today', ['today']], ['upcoming', ['later']], ['overdue', ['past']], ['completed', ['done']]]) {
    assert.deepEqual(selectAssignments(rows, filter, '', '2026-10-07').map(r => r.id), ids);
  }
  assert.equal(selectAssignments(rows, 'today', 'Math', '2026-10-07').length, 0);
  assert.equal(todayKey(new Date(2026, 0, 2, 23, 59)), '2026-01-02');
});
test('validation trims, accepts leap dates, rejects impossible dates and empty fields', () => {
  const valid = { subject: ' Physics ', name: ' Page 42 ', notes: '', due_date: '2028-02-29', completed: false };
  assert.equal(validateAssignment(valid).subject, 'Physics');
  for (const patch of [{ due_date: '2027-02-29' }, { due_date: '' }, { subject: ' ' }, { name: 'x'.repeat(201) }, { notes: 'x'.repeat(5001) }]) {
    assert.throws(() => validateAssignment({ ...valid, ...patch }));
  }
});
