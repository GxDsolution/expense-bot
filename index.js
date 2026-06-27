require('dotenv').config();
const express = require('express');
const twilio = require('twilio');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const db = require('./db');

const app = express();
app.use(express.urlencoded({ extended: false }));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const SYSTEM_PROMPT = `You are an expense tracking assistant.
When a user sends an expense, extract and reply ONLY with JSON:
{"action": "add", "amount": 500, "category": "Food", "description": "Lunch"}

Categories: Food, Transport, Shopping, Utilities, Health, Entertainment, Education, Other

If user asks for report: {"action": "report", "period": "daily"} or "weekly" or "monthly"
If unclear: {"action": "unknown", "reply": "friendly help message"}
Always reply JSON only. No extra text.`;

async function parseExpense(message) {
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent(SYSTEM_PROMPT + '\n\nUser: ' + message);
  const text = result.response.text().trim();
  const clean = text.replace(/```json|```/g, '').trim();
  return JSON.parse(clean);
}

function getCategoryEmoji(cat) {
  const map = {
    Food: '🍔', Transport: '🚗', Shopping: '🛍️',
    Utilities: '💡', Health: '💊', Entertainment: '🎬',
    Education: '📚', Other: '📌'
  };
  return map[cat] || '📌';
}

function generateReport(user, period) {
  let filter;
  if (period === 'daily') filter = "date = date('now')";
  else if (period === 'weekly') filter = "date >= date('now', '-7 days')";
  else filter = "date >= date('now', 'start of month')";

  const rows = db.prepare(`
    SELECT category, SUM(amount) as total 
    FROM expenses 
    WHERE user=? AND ${filter} 
    GROUP BY category 
    ORDER BY total DESC
  `).all(user);

  const grand = db.prepare(`
    SELECT SUM(amount) as t 
    FROM expenses 
    WHERE user=? AND ${filter}
  `).get(user);

  if (!rows.length) return `📊 No expenses found for ${period}.`;

  let r = `📊 *${period.toUpperCase()} REPORT*\n━━━━━━━━━━━━\n`;
  rows.forEach(row => {
    r += `${getCategoryEmoji(row.category)} ${row.category}: *Rs. ${row.total.toLocaleString()}*\n`;
  });
  r += `━━━━━━━━━━━━\n💰 *Total: Rs. ${grand.t.toLocaleString()}*`;
  return r;
}

app.post('/webhook', async (req, res) => {
  const twiml = new twilio.twiml.MessagingResponse();
  const msg = req.body.Body;
  const user = req.body.From;

  try {
    const parsed = await parseExpense(msg);

    if (parsed.action === 'add') {
      db.prepare(`
        INSERT INTO expenses (user, amount, category, description) 
        VALUES (?,?,?,?)
      `).run(user, parsed.amount, parsed.category, parsed.description);

      twiml.message(
        `✅ *Expense Added!*\n` +
        `${getCategoryEmoji(parsed.category)} ${parsed.category}\n` +
        `💰 Rs. ${parsed.amount.toLocaleString()}\n` +
        `📝 ${parsed.description}`
      );

    } else if (parsed.action === 'report') {
      twiml.message(generateReport(user, parsed.period));

    } else {
      twiml.message(parsed.reply || "Try: 'Spent 500 on lunch' or 'Daily report'");
    }

  } catch(e) {
    console.error(e);
    twiml.message("⚠️ Error. Please try again.");
  }

  res.type('text/xml').send(twiml.toString());
});

app.listen(3000, () => console.log('✅ Bot is running on port 3000!'));
