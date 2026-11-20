
import express from "express";
import session from "express-session";
import bcrypt from "bcryptjs";
import Database from "better-sqlite3";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = express();
const PORT = 5000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const db = new Database(path.join(__dirname, "securebank.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    phone TEXT NOT NULL,
    dob TEXT NOT NULL,
    account_type TEXT NOT NULL,
    password TEXT NOT NULL,
    balance REAL NOT NULL DEFAULT 10000,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(customer_id) REFERENCES customers(id)
  );
`);

app.use(express.json());

app.use(session({
  name: "securebank.sid",
  secret: process.env.SESSION_SECRET || "local-development-secret-change-before-deployment",
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: 60 * 60 * 1000
  }
}));

function requireLogin(req, res, next) {
  if (!req.session.customerId) {
    return res.status(401).json({
      message: "Session expired. Please log in again."
    });
  }
  next();
}

function getCustomer(id) {
  return db.prepare(`
    SELECT id, name, email, phone, dob, account_type, balance, created_at
    FROM customers
    WHERE id = ?
  `).get(id);
}

// SIGN UP
app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, phone, dob, accountType, password } = req.body;

    if (![name, email, phone, dob, accountType, password].every(
      value => typeof value === "string" && value.trim()
    )) {
      return res.status(400).json({ message: "Please fill in every field." });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ message: "Enter a valid email address." });
    }

    if (!/^\d{10}$/.test(phone.trim())) {
      return res.status(400).json({ message: "Phone number must have 10 digits." });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: "Password must be at least 8 characters." });
    }

    if (!["Savings", "Current"].includes(accountType)) {
      return res.status(400).json({ message: "Choose a valid account type." });
    }

    if (
      Number.isNaN(Date.parse(dob)) ||
      dob > new Date().toISOString().slice(0, 10)
    ) {
      return res.status(400).json({ message: "Enter a valid date of birth." });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = db.prepare(`
      INSERT INTO customers (name, email, phone, dob, account_type, password)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      name.trim(),
      email.trim().toLowerCase(),
      phone.trim(),
      dob,
      accountType,
      passwordHash
    );

    res.status(201).json({
      message: "Account created successfully. Please log in.",
      customerId: result.lastInsertRowid
    });
  } catch (error) {
    if (error.code === "SQLITE_CONSTRAINT_UNIQUE") {
      return res.status(409).json({ message: "This email is already registered." });
    }

    console.error("Signup error:", error);
    res.status(500).json({ message: "Unable to create account." });
  }
});

// LOGIN
app.post("/api/login", async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({ message: "Enter your email and password." });
    }

    const customer = db.prepare(
      "SELECT id, password FROM customers WHERE email = ?"
    ).get(email.trim().toLowerCase());

    if (!customer || !(await bcrypt.compare(password, customer.password))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    req.session.regenerate(error => {
      if (error) return next(error);

      req.session.customerId = customer.id;

      req.session.save(saveError => {
        if (saveError) return next(saveError);

        res.json({
          message: "Login successful.",
          customer: getCustomer(customer.id)
        });
      });
    });
  } catch (error) {
    next(error);
  }
});

// CURRENT CUSTOMER
app.get("/api/me", requireLogin, (req, res) => {
  const customer = getCustomer(req.session.customerId);

  if (!customer) {
    return res.status(404).json({ message: "Account not found." });
  }

  res.json({ customer });
});

// TRANSACTION HISTORY
app.get("/api/transactions", requireLogin, (req, res) => {
  const transactions = db.prepare(`
    SELECT id, description, amount, type, created_at
    FROM transactions
    WHERE customer_id = ?
    ORDER BY id DESC
    LIMIT 50
  `).all(req.session.customerId);

  res.json({ transactions });
});

// DEMO TRANSACTION
app.post("/api/demo-transaction", requireLogin, (req, res) => {
  try {
    const { description, amount, type } = req.body;
    const value = Number(amount);
    const customerId = req.session.customerId;

    if (
      typeof description !== "string" ||
      !description.trim() ||
      amount === "" ||
      amount === null ||
      !Number.isFinite(value) ||
      value <= 0 ||
      value > 1000000 ||
      !["credit", "debit"].includes(type)
    ) {
      return res.status(400).json({
        message: "Enter a valid description, amount, and transaction type."
      });
    }

    const customer = db.prepare(
      "SELECT balance FROM customers WHERE id = ?"
    ).get(customerId);

    if (!customer) {
      return res.status(404).json({ message: "Account not found." });
    }

    if (type === "debit" && customer.balance < value) {
      return res.status(400).json({ message: "Insufficient demo balance." });
    }

    const newBalance = type === "credit"
      ? customer.balance + value
      : customer.balance - value;

    const saveTransaction = db.transaction(() => {
      db.prepare(
        "UPDATE customers SET balance = ? WHERE id = ?"
      ).run(newBalance, customerId);

      db.prepare(`
        INSERT INTO transactions (customer_id, description, amount, type)
        VALUES (?, ?, ?, ?)
      `).run(description.trim(), customerId, value, type);
    });

    // Correct argument order for the INSERT above:
    // customer_id, description, amount, type
    // Use the correctly ordered transaction below instead.
    const commitTransaction = db.transaction(() => {
      db.prepare(
        "UPDATE customers SET balance = ? WHERE id = ?"
      ).run(newBalance, customerId);

      db.prepare(`
        INSERT INTO transactions (customer_id, description, amount, type)
        VALUES (?, ?, ?, ?)
      `).run(customerId, description.trim(), value, type);
    });

    commitTransaction();

    res.json({
      message: "Demo transaction completed.",
      customer: getCustomer(customerId)
    });
  } catch (error) {
    console.error("Transaction error:", error);
    res.status(500).json({ message: "Unable to process demo transaction." });
  }
});

// DELETE ACCOUNT — single route
app.delete("/api/account", requireLogin, (req, res, next) => {
  const customerId = req.session.customerId;

  try {
    const removeAccount = db.transaction(() => {
      db.prepare(
        "DELETE FROM transactions WHERE customer_id = ?"
      ).run(customerId);

      const result = db.prepare(
        "DELETE FROM customers WHERE id = ?"
      ).run(customerId);

      if (result.changes === 0) {
        throw new Error("Account not found.");
      }
    });

    removeAccount();

    req.session.destroy(error => {
      if (error) return next(error);

      res.clearCookie("securebank.sid");
      res.json({ message: "Account and transaction history deleted." });
    });
  } catch (error) {
    console.error("Delete account error:", error);

    if (error.message === "Account not found.") {
      return res.status(404).json({ message: error.message });
    }

    next(error);
  }
});

// LOGOUT
app.post("/api/logout", (req, res, next) => {
  req.session.destroy(error => {
    if (error) return next(error);

    res.clearCookie("securebank.sid");
    res.json({ message: "Logged out successfully." });
  });
});

// ERROR HANDLER
app.use((error, req, res, next) => {
  console.error("Server error:", error);

  if (res.headersSent) return next(error);

  res.status(500).json({
    message: "Server error. Check the VS Code terminal."
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`SecureBank API running on port ${PORT}`);
});
