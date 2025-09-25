// PM2 configuration for Cloudflare Pages development
module.exports = {
  apps: [
    {
      name: 'webapp',
      script: 'npx',
      args: 'wrangler pages dev dist --ip 0.0.0.0 --port 3000',
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      },
      watch: false, // Wrangler handles hot reload
      instances: 1,
      exec_mode: 'fork'
    }
  ]
}