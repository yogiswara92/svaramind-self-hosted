const { db } = require('../config/db');

async function getTodos(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id } = req.query;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });

    const todos = await db('notes_todos')
      .where({ workspace_id, created_by: userId })
      .orderBy([{ column: 'is_done', order: 'asc' }, { column: 'priority', order: 'desc' }, { column: 'created_at', order: 'desc' }]);

    res.json({ todos });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function createTodo(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id, title, description, priority, due_date } = req.body;
    if (!workspace_id || !title?.trim()) return res.status(400).json({ error: 'workspace_id and title required' });

    const [todo] = await db('notes_todos')
      .insert({ workspace_id, created_by: userId, title: title.trim(), description: description || '', priority: priority || 'normal', due_date: due_date || null })
      .returning('*');
    res.status(201).json({ todo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function updateTodo(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { title, description, priority, due_date } = req.body;

    const updates = { updated_at: db.fn.now() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (priority !== undefined) updates.priority = priority;
    if (due_date !== undefined) updates.due_date = due_date || null;

    const [todo] = await db('notes_todos').where({ id, created_by: userId }).update(updates).returning('*');
    if (!todo) return res.status(404).json({ error: 'Not found' });
    res.json({ todo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function toggleTodo(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const current = await db('notes_todos').where({ id, created_by: userId }).select('is_done').first();
    if (!current) return res.status(404).json({ error: 'Not found' });

    const isDone = !current.is_done;
    const [todo] = await db('notes_todos')
      .where({ id, created_by: userId })
      .update({ is_done: isDone, done_at: isDone ? db.fn.now() : null, updated_at: db.fn.now() })
      .returning('*');
    res.json({ todo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function deleteTodo(req, res) {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    await db('notes_todos').where({ id, created_by: userId }).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

async function clearDone(req, res) {
  try {
    const userId = req.user.id;
    const { workspace_id } = req.body;
    if (!workspace_id) return res.status(400).json({ error: 'workspace_id required' });
    await db('notes_todos').where({ workspace_id, created_by: userId, is_done: true }).delete();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

module.exports = { getTodos, createTodo, updateTodo, toggleTodo, deleteTodo, clearDone };
