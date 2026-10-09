import { Router } from 'express';
import { requireAuth, requireRole, type AuthedRequest } from '../middleware';
import { getAiConfig, saveAiConfig } from '../services/ai';

export const aiConfigRouter = Router();
aiConfigRouter.use(requireAuth, requireRole('super_admin'));

aiConfigRouter.get('/', (_req, res) => {
  const cfg = getAiConfig();
  res.json({ config: { endpoint: cfg.endpoint, model: cfg.model, timeout_ms: cfg.timeout_ms, has_key: !!cfg.api_key } });
});

aiConfigRouter.put('/', (req, res) => {
  const current = getAiConfig();
  const { endpoint, api_key, model, timeout_ms } = (req.body || {}) as {
    endpoint?: string;
    api_key?: string;
    model?: string;
    timeout_ms?: number;
  };
  saveAiConfig({
    endpoint: endpoint || current.endpoint,
    api_key: api_key && api_key.trim() ? api_key.trim() : current.api_key,
    model: model || current.model,
    timeout_ms: timeout_ms || current.timeout_ms,
  });
  res.json({ ok: true });
});
