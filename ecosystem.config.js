module.exports = {
  apps: [
    {
      name: "photo-uploader",
      script: "server.js",
      cwd: __dirname,
      env: { PORT: 43655 },
      autorestart: true,
    },
  ],
};
