module.exports = {
  apps: [
    {
      name: "pilauzone",
      script: "index.js",
      instances: 1, // Change to 'max' for max instances based on CPU cores
      autorestart: true,
      watch: true,
      ignore_watch: ["public", "node_modules", "*.log"],
      max_memory_restart: "8G", // Restart if memory usage exceeds 1GB
    }
  ]
};