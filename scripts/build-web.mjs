import { cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, 'dist');

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const entry of ['index.html', 'character', 'assets', 'LICENSE']) {
  await cp(path.join(root, entry), path.join(output, entry), { recursive: true });
}

// 用户的备份 zip（assets/backup/，含聊天/媒体数据）只应在导出时产生，
// 绝不能打进发行包：dist 是 cap sync / APK 的输入源。
await rm(path.join(output, 'assets', 'backup'), { recursive: true, force: true });
