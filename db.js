const Database = require('better-sqlite3');
const db = new Database('expenses.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user TEXT,
    amount REAL,
    category TEXT,
    description TEXT,
    date TEXT DEFAULT (date('now'))
  )
`);

module.exports = db;