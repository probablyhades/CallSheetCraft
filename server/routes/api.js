/**
 * API Routes
 * Frontend-facing endpoints for the CallSheetCraft application
 */

const express = require('express');
const router = express.Router();
const craftService = require('../services/craftService');
const geminiService = require('../services/geminiService');

/**
 * Normalize phone number for comparison
 * Strips all non-digit characters
 */
function normalizePhone(phone) {
    return phone?.replace(/\D/g, '') || '';
}

/**
 * Strip sensitive data from production for unauthenticated access
 * Removes: phone numbers from crew/cast
 * Keeps: closed_set (needed for UI to enforce no-skip behavior)
 */
function sanitizeProduction(production) {
    const sanitized = JSON.parse(JSON.stringify(production)); // Deep clone

    // Remove phone numbers from crew
    if (sanitized.crew) {
        sanitized.crew = sanitized.crew.map(member => {
            const { Phone, phone, ...rest } = member;
            return rest;
        });
    }

    // Remove phone numbers from cast
    if (sanitized.cast) {
        sanitized.cast = sanitized.cast.map(member => {
            const { Phone, phone, ...rest } = member;
            return rest;
        });
    }

    // Note: closed_set is intentionally NOT removed
    // It's needed client-side to enforce authentication requirement

    return sanitized;
}

/**
 * Find a user by phone number in crew or cast
 * Returns user info if found, null otherwise
 */
function findUserByPhone(production, phone) {
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) return null;

    // Check crew
    for (const member of production.crew || []) {
        if (normalizePhone(member.Phone) === normalizedPhone) {
            return {
                name: member.Name,
                role: member.Role,
                callTime: member['Call Time'],
                type: 'crew',
            };
        }
    }

    // Check cast
    for (const member of production.cast || []) {
        if (normalizePhone(member.Phone) === normalizedPhone) {
            return {
                name: member.Name,
                character: member.Character,
                callTime: member['Call Time'],
                type: 'cast',
            };
        }
    }

    return null;
}

/**
 * GET /api/productions
 * List all productions grouped by title
 * Only returns minimal data needed for UI (IDs, titles, dates)
 * Does NOT return full production data (no crew/cast/phone numbers)
 */
router.get('/productions', async (req, res) => {
    try {
        const data = await craftService.getProductions();
        // Only return grouped data - NOT the full productions array
        // This prevents exposing sensitive crew/cast data
        res.json({ grouped: data.grouped });
    } catch (error) {
        console.error('Error fetching productions:', error);
        res.status(500).json({ error: 'Failed to fetch productions' });
    }
});

/**
 * GET /api/production/:id
 * Get a single production with SANITIZED details (no phone numbers, no closed_set)
 * This is the public endpoint for unauthenticated access
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

        // Sanitize data before sending to client
        const sanitized = sanitizeProduction(production);
        res.json(sanitized);
    } catch (error) {
        console.error('Error fetching production:', error);
        res.status(500).json({ error: 'Failed to fetch production' });
    }
});

/**
 * POST /api/production/:id/authenticate
 * Authenticate with phone number to get full production details
 * Returns full data only if phone matches a crew/cast member
 */
router.post('/production/:id/authenticate', async (req, res) => {
    try {
        const { id } = req.params;
        const { phone } = req.body;

        if (!phone) {
            return res.status(400).json({
                error: 'Phone number required',
                authenticated: false
            });
        }

        let production = await craftService.getProductionById(id);

        // Check if phone matches a crew/cast member
        const userInfo = findUserByPhone(production, phone);

        if (!userInfo) {
            // Phone doesn't match - return sanitized data
            const sanitized = sanitizeProduction(production);
            return res.json({
                authenticated: false,
                userInfo: null,
                production: sanitized,
                isClosedSet: false // Don't reveal closed set status
            });
        }

        // Phone matches - return full data
        res.json({
            authenticated: true,
            userInfo,
            production,
            isClosedSet: production.properties?.closed_set === true
        });
    } catch (error) {
        console.error('Error authenticating:', error);
        res.status(500).json({ error: 'Failed to authenticate' });
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

        // Return sanitized data (enrich doesn't require auth)
        const sanitized = sanitizeProduction(production);
        res.json({ success: true, production: sanitized });
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

