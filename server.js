const express = require("express");
const path = require("path");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Rate limiting: simple in-memory tracker
const submissions = new Map();
const RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT = 3;

function isRateLimited(ip) {
  const now = Date.now();
  const record = submissions.get(ip);
  if (!record) {
    submissions.set(ip, { count: 1, first: now });
    return false;
  }
  if (now - record.first > RATE_WINDOW) {
    submissions.set(ip, { count: 1, first: now });
    return false;
  }
  if (record.count >= RATE_LIMIT) return true;
  record.count++;
  return false;
}

app.post("/api/inquiry", async (req, res) => {
  const ip = req.headers["x-forwarded-for"] || req.ip;
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: "Too many submissions. Please try again later." });
  }

  const { name, email, phone, title, company, industry, revenue, employees, description, availability } = req.body;

  if (!name || !email || !company) {
    return res.status(400).json({ error: "Name, email, and company are required." });
  }

  // Build the email
  const lines = [
    `Name: ${name}`,
    `Email: ${email}`,
    phone ? `Phone: ${phone}` : null,
    title ? `Title: ${title}` : null,
    `Company: ${company}`,
    industry ? `Industry: ${industry}` : null,
    revenue ? `Annual Revenue: ${revenue}` : null,
    employees ? `Employees: ${employees}` : null,
    "",
    "--- Issues / Pain Points ---",
    description || "(none provided)",
    "",
    "--- Scheduling ---",
    availability ? `Availability: ${availability}` : null,
  ]
    .filter((l) => l !== null)
    .join("\n");

  const htmlLines = lines.replace(/\n/g, "<br>");

  // Send email
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("--- NEW INQUIRY (SMTP not configured, logging only) ---");
    console.log(lines);
    console.log("--- END ---");
    return res.json({ ok: true });
  }

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: `"DE Consulting Website" <${process.env.SMTP_USER}>`,
      to: "rob@deconsulting.tech, Tars@deconsulting.tech",
      replyTo: email,
      subject: `Discovery Session Inquiry — ${company} (${name})`,
      text: lines,
      html: `<div style="font-family:sans-serif;line-height:1.6">${htmlLines}</div>`,
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("Email send failed:", err);
    res.status(500).json({ error: "Failed to send. Please email us directly at rob@deconsulting.tech" });
  }
});

app.listen(PORT, () => {
  console.log(`DE Consulting site running on port ${PORT}`);
});
