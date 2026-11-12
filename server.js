// Photo uploader: saves uploads to ./images, then commits and pushes to GitHub.
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 43655;
const ROOT = __dirname;
const IMAGES_DIR = path.join(ROOT, "images");
const AUTO_PUSH = process.env.AUTO_PUSH !== "false"; // set AUTO_PUSH=false to commit only

fs.mkdirSync(IMAGES_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, IMAGES_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .slice(0, 60) || "photo";
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB per file
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

// Run git safely (no shell, so filenames can't inject commands).
function git(...args) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) {
        err.message = (stderr || stdout || err.message).trim();
        return reject(err);
      }
      resolve(stdout.trim());
    });
  });
}

async function commitAndPush(fileNames) {
  await git("add", "images");
  const status = await git("status", "--porcelain", "images");
  if (!status) return { committed: false, pushed: false, note: "Nothing new to commit." };

  const message =
    fileNames.length === 1
      ? `Add photo ${fileNames[0]}`
      : `Add ${fileNames.length} photos`;
  await git("commit", "-m", message);

  if (!AUTO_PUSH) return { committed: true, pushed: false, note: "Committed locally." };
  await git("push");
  return { committed: true, pushed: true, note: "Committed and pushed to GitHub." };
}

const app = express();
app.use(express.static(path.join(ROOT, "public")));
app.use("/images", express.static(IMAGES_DIR));

app.get("/api/images", (req, res) => {
  const files = fs
    .readdirSync(IMAGES_DIR)
    .filter((f) => /\.(jpe?g|png|gif|webp|avif|heic|bmp|svg)$/i.test(f))
    .map((f) => ({ name: f, time: fs.statSync(path.join(IMAGES_DIR, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)
    .map((f) => f.name);
  res.json(files);
});

app.post("/api/upload", (req, res) => {
  upload.array("photos", 20)(req, res, async (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    if (!req.files || req.files.length === 0)
      return res.status(400).json({ ok: false, error: "No photos were selected." });

    const saved = req.files.map((f) => f.filename);
    try {
      const result = await commitAndPush(saved);
      res.json({ ok: true, saved, ...result });
    } catch (gitErr) {
      // Photos are saved on disk even if git fails.
      res.status(500).json({
        ok: false,
        saved,
        error: `Photos saved, but git failed: ${gitErr.message}`,
      });
    }
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Photo uploader running at http://localhost:${PORT}`);
  console.log(AUTO_PUSH ? "Auto-push: on" : "Auto-push: off (commit only)");
});
