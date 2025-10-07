const express = require("express");
const multer  = require("multer");
const fs      = require("fs");
const path    = require("path");

const app  = express();
const PORT = 3000;

const UPLOAD_DIR = path.join(__dirname, "uploads");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Multer: save to uploads/, unique name, PDFs only (optional)
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
 filename: (_, file, cb) => {
  // 1) Get safe base name + extension (strip any paths & sanitize)
  const original = path.basename(file.originalname);
  const parsed   = path.parse(original);
  const baseRaw  = parsed.name.trim();
  const ext      = parsed.ext; // keeps .pdf, .epub, etc.

  // Replace unsafe chars with underscores; collapse spaces
  const baseSafe = baseRaw.replace(/[^\w.\- ]/g, "_").replace(/\s+/g, " ").trim() || "file";

  // 2) Try the plain name first, then " (1)", " (2)", ...
  let candidate = `${baseSafe}${ext}`;
  let counter = 1;

  // On Windows the FS is case-insensitive, so this check is fine
  while (fs.existsSync(path.join(UPLOAD_DIR, candidate))) {
    candidate = `${baseSafe} (${counter})${ext}`;
    counter++;
  }

  cb(null, candidate);
}
});
const upload = multer({
  storage,
  // comment out fileFilter if you want to allow any type
  fileFilter: (_, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== ".pdf") {
      return cb(new Error("Only PDF files are allowed"));
    }
    cb(null, true);
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB
});

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use("/files", express.static(UPLOAD_DIR)); // serve files

app.get("/", (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      console.error("readdir error:", err);
      return res.status(500).send("Error reading files");
    }
    res.render("index", { files });
  });
});

// IMPORTANT: input name must be "Filename"
app.post("/upload", (req, res) => {
  upload.single("Filename")(req, res, (err) => {
    if (err) {
      console.error("Multer error:", err);
      return res.status(400).send("Upload failed: " + err.message);
    }
    if (!req.file) {
      console.error("No file on req.file");
      return res.status(400).send("No file received (check input name)");
    }
    console.log("Saved:", req.file.filename);
    res.redirect("/");
  });
});

// last-resort error handler
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).send("Server error");
});

app.listen(PORT, () => console.log(` http://localhost:${PORT}`));
