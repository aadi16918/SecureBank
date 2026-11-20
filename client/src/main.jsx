
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

async function api(url, options = {}) {
  let response;

  try {
    response = await fetch(url, {
      credentials: "include",
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers
      }
    });
  } catch {
    throw new Error("Backend connect nahi ho raha. Check port 5000.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Request failed (${response.status})`);
  }

  return data;
}

function Logo() {
  return (
    <span className="brand-mark">
      <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <path d="M32 3 55 12V29C55 43 46 53 32 61 18 53 9 43 9 29V12L32 3Z" fill="#D9B866" />
        <path d="M32 9 49 16V29C49 40 42 48 32 54 22 48 15 40 15 29V16L32 9Z" fill="#10264A" stroke="#FFF0BB" />
        <path d="m23 32 6 6 13-15" stroke="#FFF0BB" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

function App() {
  const [page, setPage] = useState("home");
  const [customer, setCustomer] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [login, setLogin] = useState({ email: "", password: "" });
  const [signup, setSignup] = useState({
    name: "",
    email: "",
    phone: "",
    dob: "",
    accountType: "Savings",
    password: ""
  });
  const [payment, setPayment] = useState({
    description: "",
    amount: "",
    type: "debit"
  });

  function clearMessages() {
    setNotice("");
    setError("");
  }

  function updateForm(setter, field, value) {
    setter(previous => ({ ...previous, [field]: value }));
  }

  async function loadDashboard() {
    const me = await api("/api/me");
    setCustomer(me.customer);

    const result = await api("/api/transactions");
    setTransactions(result.transactions || []);
  }

  useEffect(() => {
    api("/api/me")
      .then(async data => {
        setCustomer(data.customer);
        const result = await api("/api/transactions");
        setTransactions(result.transactions || []);
        setPage("dashboard");
      })
      .catch(() => {});
  }, []);

  async function submitSignup(event) {
    event.preventDefault();
    clearMessages();

    if (signup.password.length < 8) {
      setError("Password must contain at least 8 characters.");
      return;
    }

    setBusy(true);

    try {
      const result = await api("/api/signup", {
        method: "POST",
        body: JSON.stringify(signup)
      });

      setNotice(result.message);
      setLogin({ email: signup.email, password: "" });
      setPage("login");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitLogin(event) {
    event.preventDefault();
    clearMessages();
    setBusy(true);

    try {
      await api("/api/login", {
        method: "POST",
        body: JSON.stringify(login)
      });

      await loadDashboard();
      setPage("dashboard");
      setNotice("Welcome to SecureBank!");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // UPDATED TRANSACTION FUNCTION
  async function submitTransaction(event) {
    event.preventDefault();
    clearMessages();

    const description = payment.description.trim();
    const amount = Number(payment.amount);
    const type = payment.type;

    if (!description || !Number.isFinite(amount) || amount <= 0) {
      setError("Enter a valid description and amount.");
      return;
    }

    if (!["credit", "debit"].includes(type)) {
      setError("Please select a valid transaction type.");
      return;
    }

    setBusy(true);

    try {
      const result = await api("/api/demo-transaction", {
        method: "POST",
        body: JSON.stringify({
          description,
          amount,
          type
        })
      });

      setCustomer(result.customer);
      await loadDashboard();

      setPayment({
        description: "",
        amount: "",
        type: "debit"
      });

      setNotice(result.message || "Demo transaction completed.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // DELETE ACCOUNT
  async function deleteAccount() {
    const confirmed = window.confirm(
      "Permanently delete your account and transaction history? This cannot be undone."
    );

    if (!confirmed) return;

    clearMessages();
    setBusy(true);

    try {
      const result = await api("/api/account", {
        method: "DELETE"
      });

      setCustomer(null);
      setTransactions([]);
      setLogin({ email: "", password: "" });
      setPage("home");
      setNotice(result.message || "Account deleted successfully.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    clearMessages();
    setBusy(true);

    try {
      await api("/api/logout", { method: "POST" });
      setCustomer(null);
      setTransactions([]);
      setPage("home");
      setNotice("You have logged out.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const money = amount =>
    new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(amount || 0);

  return (
    <div className="app-shell">
      <header className="navbar">
        <button
          className="brand"
          onClick={() => setPage(customer ? "dashboard" : "home")}
        >
          <Logo />
          <span className="brand-wordmark">
            <span className="brand-name">
              Secure<span>Bank</span>
            </span>
            <span className="brand-tagline">
              TRUST · INTEGRITY · SECURITY
            </span>
          </span>
        </button>

        <nav className="nav-links">
          {!customer ? (
            <>
              <button onClick={() => setPage("home")}>Home</button>
              <button onClick={() => setPage("login")}>Login</button>
              <button
                className="nav-cta"
                onClick={() => setPage("signup")}
              >
                Open Account
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setPage("dashboard")}>Dashboard</button>
              <button onClick={() => setPage("profile")}>My Profile</button>
              <button className="nav-cta" onClick={logout} disabled={busy}>
                Logout
              </button>
            </>
          )}
        </nav>
      </header>

      <main>
        {notice && (
          <div className="alert success">
            {notice}
            <button onClick={() => setNotice("")}>×</button>
          </div>
        )}

        {error && (
          <div className="alert danger">
            {error}
            <button onClick={() => setError("")}>×</button>
          </div>
        )}

        {page === "home" && (
          <section className="hero">
            <div className="hero-copy">
              <span className="eyebrow">YOUR MONEY. YOUR FUTURE.</span>
              <h1>Banking that puts <span>you first.</span></h1>
              <p>
                Experience a simpler way to manage your money with a clean,
                secure and modern digital banking demo.
              </p>

              <div className="hero-actions">
                <button className="primary-btn" onClick={() => setPage("signup")}>
                  Open an Account →
                </button>
                <button className="secondary-btn" onClick={() => setPage("login")}>
                  Sign In
                </button>
              </div>

              <div className="trust-row">
                <div><strong>24/7</strong><span>Digital access</span></div>
                <div><strong>Simple</strong><span>Money management</span></div>
                <div><strong>Secure</strong><span>Password hashing</span></div>
              </div>
            </div>

            <div className="hero-visual">
              <div className="glow-orb" />
              <div className="bank-card">
                <div className="card-top"><Logo /><span>PREMIUM</span></div>
                <div className="card-chip"><span /></div>
                <div className="card-number">•••• &nbsp; •••• &nbsp; •••• &nbsp; 2048</div>
                <div className="card-bottom">
                  <div><small>ACCOUNT HOLDER</small><strong>YOUR NAME</strong></div>
                  <strong className="visa">SB</strong>
                </div>
              </div>
              <div className="floating-note">
                <span className="round-icon">✓</span>
                <div>
                  <strong>You're in control</strong>
                  <small>Manage your money simply</small>
                </div>
              </div>
              <div className="visual-caption">A smarter banking experience</div>
            </div>
          </section>
        )}

        {page === "signup" && (
          <section className="auth-layout">
            <div className="auth-aside">
              <span className="eyebrow">START SOMETHING GREAT</span>
              <h1>Your financial journey starts here.</h1>
              <p>Create your demo account and explore the SecureBank dashboard.</p>
              <div className="aside-feature">✓ &nbsp; Simple account setup</div>
              <div className="aside-feature">✓ &nbsp; Transaction history</div>
              <div className="aside-feature">✓ &nbsp; Personal dashboard</div>
            </div>

            <form className="form-card" onSubmit={submitSignup}>
              <span className="eyebrow">JOIN SECUREBANK</span>
              <h2>Create account</h2>
              <p className="muted">Fill in your details to get started.</p>

              <label>Full name
                <input required value={signup.name}
                  onChange={e => updateForm(setSignup, "name", e.target.value)}
                  placeholder="Enter your full name" autoComplete="name" />
              </label>

              <label>Email address
                <input required type="email" value={signup.email}
                  onChange={e => updateForm(setSignup, "email", e.target.value)}
                  placeholder="you@example.com" autoComplete="email" />
              </label>

              <div className="form-grid">
                <label>Phone number
                  <input required inputMode="numeric" pattern="[0-9]{10}"
                    maxLength="10" value={signup.phone}
                    onChange={e => updateForm(setSignup, "phone", e.target.value)}
                    placeholder="10-digit number" />
                </label>

                <label>Date of birth
                  <input required type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={signup.dob}
                    onChange={e => updateForm(setSignup, "dob", e.target.value)} />
                </label>
              </div>

              <label>Account type
                <select value={signup.accountType}
                  onChange={e => updateForm(setSignup, "accountType", e.target.value)}>
                  <option>Savings</option>
                  <option>Current</option>
                </select>
              </label>

              <label>Password
                <input required type="password" minLength="8"
                  value={signup.password}
                  onChange={e => updateForm(setSignup, "password", e.target.value)}
                  placeholder="At least 8 characters" autoComplete="new-password" />
              </label>

              <button className="primary-btn full-btn" disabled={busy}>
                {busy ? "Creating account..." : "Create My Account →"}
              </button>

              <p className="form-footer">
                Already registered?{" "}
                <button type="button" onClick={() => setPage("login")}>
                  Sign in
                </button>
              </p>
            </form>
          </section>
        )}

        {page === "login" && (
          <section className="login-layout">
            <div className="login-art">
              <div className="login-emblem"><Logo /></div>
              <span className="eyebrow">WELCOME BACK</span>
              <h1>Your money, <span>your way.</span></h1>
              <p>Sign in to access your SecureBank demo dashboard.</p>
              <div className="security-pill">
                ✓ &nbsp; Protected demo session
              </div>
            </div>

            <form className="form-card login-card" onSubmit={submitLogin}>
              <span className="eyebrow">SECURE SIGN IN</span>
              <h2>Welcome back</h2>
              <p className="muted">Enter your registered account details.</p>

              <label>Email address
                <input required type="email" value={login.email}
                  onChange={e => updateForm(setLogin, "email", e.target.value)}
                  placeholder="you@example.com" autoComplete="email" />
              </label>

              <label>Password
                <input required type="password" value={login.password}
                  onChange={e => updateForm(setLogin, "password", e.target.value)}
                  placeholder="Enter your password" autoComplete="current-password" />
              </label>

              <button className="primary-btn full-btn" disabled={busy}>
                {busy ? "Signing in..." : "Sign In Securely →"}
              </button>

              <p className="form-footer">
                New to SecureBank?{" "}
                <button type="button" onClick={() => setPage("signup")}>
                  Create an account
                </button>
              </p>
            </form>
          </section>
        )}

        {page === "dashboard" && customer && (
          <section className="dashboard">
            <div className="dashboard-heading">
              <div>
                <span className="eyebrow">YOUR FINANCIAL OVERVIEW</span>
                <h1>Hello, {customer.name.split(" ")[0]} 👋</h1>
                <p className="muted">Here's what's happening with your demo account.</p>
              </div>
              <span className="account-badge">● Account active</span>
            </div>

            <div className="balance-card">
              <div>
                <span className="light-label">TOTAL AVAILABLE BALANCE</span>
                <h2>{money(customer.balance)}</h2>
                <span className="light-label">
                  Demo funds only — not a real bank balance
                </span>
              </div>
              <div className="balance-symbol">₹</div>
            </div>

            <div className="stats-grid">
              <div className="stat-card">
                <span className="stat-icon">↗</span>
                <span className="muted">Account type</span>
                <strong>{customer.account_type}</strong>
                <small>Personal account</small>
              </div>
              <div className="stat-card">
                <span className="stat-icon">▤</span>
                <span className="muted">Transactions</span>
                <strong>{transactions.length}</strong>
                <small>Latest activity shown below</small>
              </div>
              <div className="stat-card">
                <span className="stat-icon">✓</span>
                <span className="muted">Account status</span>
                <strong>Active</strong>
                <small>Demo environment</small>
              </div>
            </div>

            <div className="dashboard-columns">
              <form className="panel transaction-form" onSubmit={submitTransaction}>
                <span className="eyebrow">DEMO ONLY</span>
                <h2>Make a transaction</h2>
                <p className="muted">Try a simulated credit or debit.</p>

                <label>Description
                  <input required value={payment.description}
                    onChange={e => updateForm(setPayment, "description", e.target.value)}
                    placeholder="e.g. Grocery payment" />
                </label>

                <label>Amount (₹)
                  <input required type="number" min="0.01" max="1000000"
                    step="0.01" value={payment.amount}
                    onChange={e => updateForm(setPayment, "amount", e.target.value)}
                    placeholder="Enter amount" />
                </label>

                <label>Transaction type
                  <select value={payment.type}
                    onChange={e => updateForm(setPayment, "type", e.target.value)}>
                    <option value="debit">Debit — money out</option>
                    <option value="credit">Credit — money in</option>
                  </select>
                </label>

                <button className="primary-btn full-btn" disabled={busy}>
                  {busy ? "Processing..." : "Submit Demo Transaction"}
                </button>
              </form>

              <div className="panel transactions-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">ACCOUNT ACTIVITY</span>
                    <h2>Recent transactions</h2>
                  </div>
                  <span className="count-badge">{transactions.length}</span>
                </div>

                {transactions.length === 0 ? (
                  <div className="empty-state">
                    <span>▤</span>
                    <strong>No transactions yet</strong>
                    <p>Your demo transactions will appear here.</p>
                  </div>
                ) : (
                  <div className="transaction-list">
                    {transactions.map(tx => (
                      <div className="transaction-item" key={tx.id}>
                        <span className={`transaction-icon ${tx.type}`}>
                          {tx.type === "credit" ? "↙" : "↗"}
                        </span>
                        <div className="transaction-description">
                          <strong>{tx.description}</strong>
                          <small>{new Date(tx.created_at + "Z").toLocaleString()}</small>
                        </div>
                        <strong className={tx.type === "credit" ? "credit-amount" : "debit-amount"}>
                          {tx.type === "credit" ? "+" : "−"}{money(tx.amount)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {page === "profile" && customer && (
          <section className="profile-layout">
            <div className="profile-heading">
              <span className="eyebrow">ACCOUNT SETTINGS</span>
              <h1>My profile</h1>
              <p className="muted">Your registered demo account details.</p>
            </div>

            <div className="profile-card">
              <div className="profile-avatar">
                {customer.name.charAt(0).toUpperCase()}
              </div>
              <h2>{customer.name}</h2>
              <p className="muted">{customer.email}</p>

              <div className="profile-details">
                <div><span>Full name</span><strong>{customer.name}</strong></div>
                <div><span>Email address</span><strong>{customer.email}</strong></div>
                <div><span>Phone number</span><strong>{customer.phone}</strong></div>
                <div><span>Date of birth</span><strong>{customer.dob}</strong></div>
                <div><span>Account type</span><strong>{customer.account_type}</strong></div>
                <div><span>Account ID</span><strong>SB-{String(customer.id).padStart(6, "0")}</strong></div>
                <div><span>Available demo balance</span><strong>{money(customer.balance)}</strong></div>
              </div>

              <button className="secondary-btn" onClick={() => setPage("dashboard")}>
                ← Back to Dashboard
              </button>

              <button
                className="delete-btn"
                disabled={busy}
                onClick={deleteAccount}
              >
                {busy ? "Please wait..." : "Delete Account Permanently"}
              </button>
            </div>
          </section>
        )}
      </main>

      <footer className="footer">
        <div className="footer-brand"><Logo /><strong>SecureBank</strong></div>
        <p>Modern design. Simulated banking. Built for learning.</p>
        <small>
          © {new Date().getFullYear()} SecureBank Demo. Not a real banking service.
        </small>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
