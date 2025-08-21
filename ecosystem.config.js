  module.exports = {
    apps: [{
      name: 'zaposhi-lightning',
      script: 'lightning-server.js',
      cwd: '/home/ubuntu/lightning-server',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3004
      },
      env_file: '/home/ubuntu/lightning-server/.env'
    }]
  };
