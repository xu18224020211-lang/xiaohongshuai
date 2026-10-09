import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  uploadDir: path.resolve(ROOT_DIR, process.env.UPLOAD_DIR || 'uploads'),
  dataDir: path.resolve(ROOT_DIR, process.env.DATA_DIR || 'data'),
  ai: {
    endpoint: process.env.AI_ENDPOINT || 'https://api.lk888.ai',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'tt-image-2',
    timeoutMs: Number(process.env.AI_TIMEOUT_MS || 180000),
  },
};
