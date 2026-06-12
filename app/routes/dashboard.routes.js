import express from 'express';
import { getDashboard } from '../controller/dashboard.controller.js';

const router = express.Router();

// Public dashboard endpoint — no authentication required
router.get('/', getDashboard);

export default router;
