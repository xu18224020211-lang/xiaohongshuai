import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireAuth } from '../middleware';
import { config } from '../config';
import { publicUrlFor, uploadDirFor } from '../storage';

export const uploadRouter = Router();
uploadRouter.use(requireAuth);

fs.mkdirSync(config.uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDirFor('misc')),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    cb(null, `up-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 30 * 1024 * 1024 } });

// 通用上传（任意登录用户，用于设计器内直接上传底图/贴纸等，不落素材库）
uploadRouter.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '缺少文件' });
  res.status(201).json({ url: publicUrlFor('misc', req.file.filename) });
});
