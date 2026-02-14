// This file contains intentional security vulnerabilities for testing Semgrep

// CRITICAL: Hardcoded API Key (should trigger semgrep.hardcoded-api-key)
const API_KEY = "sk-1234567890abcdefghijklmnopqrstuvwxyz";
const SECRET_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuvwxyz";

// CRITICAL: Hardcoded Password (should trigger semgrep.hardcoded-password)
const password = "MySecretPassword123!";
const db_password = "admin123";

// CRITICAL: SQL Injection (should trigger semgrep.sql-string-concatenation)
export function getUserById(userId: string) {
  const query = "SELECT * FROM users WHERE id = " + userId;
  return database.query(query);
}

export function searchUsers(name: string) {
  const sql = `SELECT * FROM users WHERE name = '${name}'`;
  return db.execute(sql);
}

// CRITICAL: XSS Vulnerability (should trigger semgrep.dangerous-inner-html)
export function renderUserContent(html: string) {
  document.getElementById('content')!.innerHTML = html;
}

export function displayMessage(msg: string) {
  const div = document.createElement('div');
  div.innerHTML = msg;
  return div;
}

// HIGH: Weak Cryptography (should trigger semgrep.weak-crypto-algorithm)
export function generateToken() {
  return Math.random().toString(36).substring(7);
}

export function createId() {
  return Math.random().toString(16);
}

// MEDIUM: Console Logs (should trigger semgrep.console-log)
console.log("API Key:", API_KEY);
console.log("User data:", { username: "admin", password });
console.debug("Debug mode active");
console.info("Application starting");

// HIGH: eval() usage (should trigger semgrep.eval-usage if rule exists)
export function executeCode(code: string) {
  return eval(code);
}

// Declaring database for the example
const database = {
  query: (sql: string) => console.log(sql),
};

const db = {
  execute: (sql: string) => console.log(sql),
};
