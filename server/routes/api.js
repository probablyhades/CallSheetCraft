/**
 * API Routes
 * Frontend-facing endpoints for the CallSheetCraft application
 */

const express = require('express');
const router = express.Router();
const craftService = require('../services/craftService');
const geminiService = require('../services/geminiService');

/**
 * GET /api/productions
 * List all productions grouped by title
 */
router.get('/productions', async (req, res) => {
    try {
        const data = await craftService.getProductions();
        res.json(data);
    } catch (error) {
        console.error('Error fetching productions:', error);
        res.status(500).json({ error: 'Failed to fetch productions' });
    }
});

/**
 * GET /api/production/:id
 * Get a single production with full details
 * Automatically enriches location data if needed
 */
router.get('/production/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { enrich } = req.query;

        let production = await craftService.getProductionById(id);

        // Enrich location data if requested or if any GEM fields are empty
        if (enrich !== 'false') {
            const needsEnrich = production.locations?.some(loc =>
                geminiService.needsEnrichment(loc.gemData)
            );

            if (needsEnrich) {
                console.log('Production needs enrichment, calling Gemini...');
                production = await geminiService.enrichProduction(production);
            }
        }

        res.json(production);
    } catch (error) {
        console.error('Error fetching production:', error);
        res.status(500).json({ error: 'Failed to fetch production' });
    }
});

/**
 * POST /api/production/:id/enrich
 * Force re-enrichment of location data
 */
router.post('/production/:id/enrich', async (req, res) => {
    try {
        const { id } = req.params;

        let production = await craftService.getProductionById(id);

        // Clear existing GEM data to force refresh
        for (const location of production.locations || []) {
            location.gemData = {};
        }

        production = await geminiService.enrichProduction(production);

        res.json({ success: true, production });
    } catch (error) {
        console.error('Error enriching production:', error);
        res.status(500).json({ error: 'Failed to enrich production' });
    }
});

/**
 * GET /api/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        geminiConfigured: !!process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here'
    });
});

module.exports = router;
