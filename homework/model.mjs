export function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function selectAssignments(rows, filter = 'all', subject = '', today = todayKey()) {
  return rows.filter(row => (!subject || row.subject === subject) && (
    filter === 'completed' ? row.completed :
    filter === 'today' ? !row.completed && row.due_date === today :
    filter === 'upcoming' ? !row.completed && row.due_date > today :
    filter === 'overdue' ? !row.completed && row.due_date < today : true
  )).sort((a, b) => Number(a.completed) - Number(b.completed) ||
    a.due_date.localeCompare(b.due_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

export function validateAssignment(values) {
  const subject = values.subject.trim();
  const name = values.name.trim();
  const notes = values.notes.trim();
  const due_date = values.due_date;
  if (!subject || subject.length > 100) throw new Error('Enter a class between 1 and 100 characters.');
  if (!name || name.length > 200) throw new Error('Enter an assignment name between 1 and 200 characters.');
  if (notes.length > 5000) throw new Error('Keep notes under 5,001 characters.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due_date) || due_date < '1900-01-01' || due_date > '9999-12-31' ||
      new Date(`${due_date}T12:00:00Z`).toISOString().slice(0, 10) !== due_date) {
    throw new Error('Choose a valid due date.');
  }
  return { subject, name, notes, due_date, completed: Boolean(values.completed) };
}
