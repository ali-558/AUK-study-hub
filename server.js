// Load environment variables from .env
require("dotenv").config();

const express = require("express");
const multer  = require("multer");
const fs      = require("fs");
const path    = require("path");
const { MongoClient, ObjectId } = require("mongodb");
const session = require("express-session");
const bcrypt  = require("bcrypt");

// ⬇ NEW: import your AI routes
const aiRoutes = require("./ai-routes");

// ---------- MongoDB setup ----------
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error("❌ MONGODB_URI is not set in .env");
  process.exit(1);
}

const dbName = "aukStudyHub";
const client = new MongoClient(uri);

// ---------- Express app setup ----------
const app  = express();
const PORT = 3000;

// so we can read form data (login/register forms)
app.use(express.urlencoded({ extended: true }));

// ⬇ NEW: parse JSON bodies (needed for fetch('/ai/chat', {...}))
app.use(express.json());

// sessions (needed for login)
app.use(
  session({
    secret: "auk-study-hub-super-secret", // change to a long random string in real deployment
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 2, // 2 hours
    },
  })
);

// Make current user available to all EJS templates as `currentUser`
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  next();
});

// ---------- Helper: require login ----------
function requireLogin(req, res, next) {
  if (!req.session.user) {
    // not logged in → send them to login page
    return res.redirect("/login");
  }
  next();
}

// ---------- File upload (multer) setup ----------
const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage configuration with safe, unique filenames
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => {
    // Get safe base name + extension
    const original = path.basename(file.originalname);
    const parsed   = path.parse(original);
    const baseRaw  = parsed.name.trim();
    const ext      = parsed.ext; // .pdf, etc.

    // Replace unsafe chars & collapse spaces
    const baseSafe = baseRaw
      .replace(/[^\w.\- ]/g, "_")
      .replace(/\s+/g, " ")
      .trim() || "file";

    // Avoid overwriting existing files
    let candidate = `${baseSafe}${ext}`;
    let counter = 1;
    while (fs.existsSync(path.join(UPLOAD_DIR, candidate))) {
      candidate = `${baseSafe} (${counter})${ext}`;
      counter++;
    }

    cb(null, candidate);
  },
});

const upload = multer({
  storage,
  fileFilter: (_, file, cb) => {
    // Allow ONLY PDFs (remove this check if you want other types)
    if (path.extname(file.originalname).toLowerCase() !== ".pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
});

// ---------- View engine & static files ----------
app.set("view engine", "ejs");
app.use(express.static("public"));
app.use("/files", express.static(UPLOAD_DIR)); // serve uploaded files

// ⬇ NEW: mount AI routes so /api/ai/chat, /api/ai/whatever works
app.use("/api/ai", aiRoutes);

// ---------- Routes ----------

// Home page – still reading files from local uploads folder (not DB)
app.get("/", (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      console.error("readdir error:", err);
      return res.status(500).send("Error reading files");
    }
    res.render("index", { files });
  });
});

// ✅ FIXED: AI Assistant page - serves the HTML file from public folder
// Remove requireLogin if you want anyone to access it, or keep it for logged-in users only
app.get("/ai-assistant", (req, res) => {
  const filePath = path.join(__dirname, "public", "ai-assistant.html");
  console.log("📄 Serving AI Assistant from:", filePath);
  res.sendFile(filePath);
});

// ✅ FIXED: Alternative route /ai (same page)
app.get("/ai", (req, res) => {
  const filePath = path.join(__dirname, "public", "ai-assistant.html");
  console.log("📄 Serving AI Assistant from:", filePath);
  res.sendFile(filePath);
});

// REGISTER new user
app.post("/register", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send("Email and password are required");
    }

    const db    = req.app.locals.db;
    const users = db.collection("users");

    const existing = await users.findOne({ email });
    if (existing) {
      return res.status(400).send("User with this email already exists");
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await users.insertOne({
      email,
      passwordHash,
      createdAt: new Date(),
    });

    // Auto-login after registration
    req.session.user = {
      _id: result.insertedId,
      email,
    };

    res.redirect("/");
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).send("Server error");
  }
});

// LOGIN existing user
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).send("Email and password are required");
    }

    const db    = req.app.locals.db;
    const users = db.collection("users");

    const user = await users.findOne({ email });
    if (!user) {
      return res.status(400).send("Invalid email or password");
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(400).send("Invalid email or password");
    }

    // Save minimal user info in the session
    req.session.user = {
      _id: user._id,
      email: user.email,
    };

    res.redirect("/");
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Server error");
  }
});

// LOGOUT
app.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

// Resources page – list uploads from MongoDB (with search)
app.get("/resources", async (req, res) => {
  try {
    const db      = req.app.locals.db;
    const uploads = db.collection("uploads");

    // read ?q= from query string
    const q = (req.query.q || "").trim();

    const filter = {};
    if (q) {
      // case-insensitive search by originalName
      filter.originalName = { $regex: q, $options: "i" };
    }

    const files = await uploads
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    // pass searchQuery to EJS so input can keep the value
    res.render("resources", { files, searchQuery: q });
  } catch (err) {
    console.error("Error loading resources:", err);
    res.status(500).send("Error loading resources");
  }
});

// Upload PDF – only for logged-in users
app.post("/upload", requireLogin, (req, res) => {
  // IMPORTANT: input name must be "Filename"
  upload.single("Filename")(req, res, async (err) => {
    try {
      if (err) {
        console.error("Multer error:", err);
        return res.status(400).send("Upload failed: " + err.message);
      }
      if (!req.file) {
        return res.status(400).send("No file received");
      }

      const db      = req.app.locals.db;
      const uploads = db.collection("uploads");

      await uploads.insertOne({
        filename:     req.file.filename,
        originalName: req.file.originalname,
        createdAt:    new Date(),
        userId:       req.session.user._id, // who uploaded it (ObjectId)
      });

      console.log("Saved file + DB record:", req.file.filename);
      res.redirect("/resources");
    } catch (e) {
      console.error("Upload error:", e);
      res.status(500).send("Server error");
    }
  });
});

// Delete uploaded file – only owner can delete
app.post("/delete", requireLogin, async (req, res) => {
  try {
    const { id } = req.body; // file id from hidden input

    if (!id) {
      return res.status(400).send("Missing file id");
    }

    const db      = req.app.locals.db;
    const uploads = db.collection("uploads");

    // Find the file document
    const file = await uploads.findOne({ _id: new ObjectId(id) });
    if (!file) {
      return res.status(404).send("File not found");
    }

    // Permission check: only the uploader can delete
    if (!file.userId || file.userId.toString() !== req.session.user._id.toString()) {
      return res.status(403).send("You are not allowed to delete this file");
    }

    // Build path on disk
    const filePath = path.join(UPLOAD_DIR, file.filename);

    // 1) Remove DB record
    await uploads.deleteOne({ _id: file._id });

    // 2) Remove physical file from disk if it exists
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    console.log("Deleted file + DB record:", file.filename);

    res.redirect("/resources");
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("Server error");
  }
});

// Register page (GET)
app.get("/register", (req, res) => {
  res.render("register", { currentUser: req.session.user || null });
});

// Login page (GET)
app.get("/login", (req, res) => {
  res.render("login", { currentUser: req.session.user || null });
});

// ---------- Last-resort error handler ----------
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Server error");
});

// ---------- Start server & connect DB ----------
async function startServer() {
  try {
    await client.connect();
    const db = client.db(dbName);

    // Make DB available to all routes via app.locals
    app.locals.db = db;

    app.listen(PORT, () => {
      console.log(`✅ Server running at http://localhost:${PORT}`);
      console.log(`🤖 AI Assistant available at http://localhost:${PORT}/ai-assistant`);
      console.log(`📚 Resources page at http://localhost:${PORT}/resources`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

startServer();
