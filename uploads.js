const multer = require("multer");
const path = require("path");

// Storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => {
    
    cb(null, safeName);
  }
});

// Multer upload object
const upload = multer({ storage });

module.exports = upload;
