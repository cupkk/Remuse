import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32'
  ? 'npm audit --registry=https://registry.npmjs.org'
  : 'npm audit --registry=https://registry.npmjs.org';

const result = spawnSync(command, {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    npm_config_registry: 'https://registry.npmjs.org',
  },
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}

if (result.error) {
  console.error('[audit] 依赖漏洞扫描启动失败：', result.error.message);
}
process.exit(1);
