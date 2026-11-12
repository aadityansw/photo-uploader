// Photo uploader: saves uploads to ./images (with a name you choose),
// then commits and pushes to GitHub.
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { execFile } = require("child_process");

const PORT = process.env.PORT || 43655;
const ROOT = __dirname;
const IMAGES_DIR = path.join(ROOT, "images");
const AUTO_PUSH = process.env.AUTO_PUSH !== "false"; // set AUTO_PUSH=false to commit only
const IMAGE_EXT = /\.(jpe?g|png|gif|webp|avif|heic|bmp|svg)$/i;
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i; // reserved names on Windows

fs.mkdirSync(IMAGES_DIR, { recursive: true });

// Memory storage: files are only written to disk after every name is validated.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 }, // 25 MB each, 10 per upload
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed."));
  },
});

// Turn whatever the user typed into a safe file name (without extension).
function cleanName(input) {
  return String(input || "")
    .trim()
    .replace(IMAGE_EXT, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Names already used in images/, lowercased and without extension.
function takenNames() {
  const set = new Set();
  for (const f of fs.readdirSync(IMAGES_DIR)) {
    if (IMAGE_EXT.test(f)) set.add(path.basename(f, path.extname(f)).toLowerCase());
  }
  return set;
}

// Find the git executable. Override with GIT_PATH if needed.
function findGit() {
  if (process.env.GIT_PATH) return process.env.GIT_PATH;
  if (process.platform === "win32") {
    const candidates = [
      "C:\\Program Files\\Git\\cmd\\git.exe",
      "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
      path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "cmd", "git.exe"),
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
  }
  return "git";
}
const GIT = findGit();

// Run git safely (no shell, so filenames can't inject commands).
function git(...args) {
  return new Promise((resolve, reject) => {
    execFile(GIT, args, { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) {
        err.message =
          err.code === "ENOENT"
            ? `Git was not found (tried "${GIT}"). Install Git or set GIT_PATH.`
            : (stderr || stdout || err.message).trim();
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
    fileNames.length === 1 ? `Add photo ${fileNames[0]}` : `Add ${fileNames.length} photos`;
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
    .filter((f) => IMAGE_EXT.test(f))
    .map((f) => ({ name: f, time: fs.statSync(path.join(IMAGES_DIR, f)).mtimeMs }))
    .sort((a, b) => b.time - a.time)
    .map((f) => f.name);
  res.json(files);
});

app.post("/api/upload", (req, res) => {
  upload.array("photos", 10)(req, res, async (err) => {
    if (err) return res.status(400).json({ ok: false, error: err.message });
    const files = req.files || [];
    if (files.length === 0)
      return res.status(400).json({ ok: false, error: "No photos were selected." });

    // names[i] is the name the user wants for photos[i]
    const wanted = [].concat(req.body.names || []);

    // 1) Validate every name before saving anything.
    const used = takenNames();
    const inBatch = new Set();
    const plan = [];
    for (let i = 0; i < files.length; i++) {
      const original = files[i].originalname;
      const base = cleanName(wanted[i] || original);
      if (!base || RESERVED.test(base))
        return res.status(400).json({ ok: false, error: `"${wanted[i] || original}" is not a usable file name.` });

      const key = base.toLowerCase();
      if (used.has(key))
        return res.status(409).json({ ok: false, error: `A photo named "${base}" already exists. Choose a different name.` });
      if (inBatch.has(key))
        return res.status(409).json({ ok: false, error: `You used the name "${base}" more than once in this upload.` });
      inBatch.add(key);

      const ext = (path.extname(original) || ".jpg").toLowerCase();
      plan.push({ file: files[i], name: base + ext });
    }

    // 2) Save. The "wx" flag refuses to overwrite an existing file.
    const saved = [];
    try {
      for (const p of plan) {
        fs.writeFileSync(path.join(IMAGES_DIR, p.name), p.file.buffer, { flag: "wx" });
        saved.push(p.name);
      }
    } catch (e) {
      return res.status(409).json({ ok: false, error: `Could not save the photo: ${e.message}` });
    }

    // 3) Commit and push.
    try {
      const result = await commitAndPush(saved);
      res.json({ ok: true, saved, ...result });
    } catch (gitErr) {
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
  console.log(`Using git: ${GIT}`);
  console.log(AUTO_PUSH ? "Auto-push: on" : "Auto-push: off (commit only)");
});
