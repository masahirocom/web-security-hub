'use strict';
const express = require('express');
const { openSse } = require('../lib/sse');
const { generateSiteTestSession } = require('../services/testPipelineService');
const router = express.Router();
router.get('/sites/:id/pipeline/run', async (req, res) => { const stream = openSse(res); try { stream.send('done', await generateSiteTestSession(req.params.id, (line) => stream.send('log', { line }))); } catch (error) { stream.send('error', { message: error.message }); } finally { stream.close(); } });
module.exports = router;
