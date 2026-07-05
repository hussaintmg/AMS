const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');

const PORT = 3500;
const REPO_DIR = '/www/wwwroot/erpoj.com';
const ENV_FILE = `${REPO_DIR}/.env`;
const ENV_BACKUP = '/tmp/.env.ams.backup';

const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/webhook') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Webhook received! Starting deployment...`);

        // Step 1: Backup .env before git reset
        try {
            if (fs.existsSync(ENV_FILE)) {
                fs.copyFileSync(ENV_FILE, ENV_BACKUP);
                console.log(`[${timestamp}] .env backed up successfully`);
            }
        } catch (e) {
            console.error(`[${timestamp}] Failed to backup .env: ${e.message}`);
        }

        // Step 2: Pull latest code, rebuild, restore .env, restart
        const deployCmd = [
            `cd ${REPO_DIR}`,
            `export GIT_SSH_COMMAND='ssh -i /root/.ssh/id_ed25519_amserp -o IdentitiesOnly=yes'`,
            `git fetch origin`,
            `git checkout main`,
            `git reset --hard origin/main`,
            // Restore production .env immediately after git reset
            `cp ${ENV_BACKUP} ${ENV_FILE}`,
            `cd frontend && npm run build`,
            `pm2 restart ams-api`
        ].join(' && ');

        exec(deployCmd, { maxBuffer: 1024 * 1024 * 10, timeout: 300000 }, (err, stdout, stderr) => {
            const endTime = new Date().toISOString();

            // Always restore .env even if build fails
            try {
                if (fs.existsSync(ENV_BACKUP)) {
                    fs.copyFileSync(ENV_BACKUP, ENV_FILE);
                    console.log(`[${endTime}] .env restored from backup`);
                }
            } catch (e) {
                console.error(`[${endTime}] Failed to restore .env: ${e.message}`);
            }

            if (err) {
                console.error(`[${endTime}] Deployment FAILED: ${err.message}`);
                console.error(`Stderr: ${stderr}`);
                res.writeHead(500);
                return res.end('Deployment failed');
            }
            console.log(`[${endTime}] Deployment SUCCESSFUL`);
            console.log(`Stdout: ${stdout.slice(-500)}`);
            if (stderr) console.log(`Stderr: ${stderr.slice(-200)}`);
            res.writeHead(200);
            res.end('Deployment triggered successfully');
        });
    } else {
        res.writeHead(404);
        res.end('Not found');
    }
});

server.listen(PORT, () => {
    console.log(`Webhook server listening on port ${PORT}`);
    console.log(`Protecting .env at: ${ENV_FILE}`);
});
