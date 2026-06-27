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
  else if (period === 'weekly')
