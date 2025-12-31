/**
 * Gemini API Service
 * Handles location data enrichment using Gemini with Google Search grounding
 * Consolidated to use a SINGLE API request for all locations to avoid rate limiting
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const craftService = require('./craftService');

// Initialize Gemini client
let genAI = null;
let model = null;

function initGemini() {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey || apiKey === 'your_gemini_api_key_here') {
            console.warn('⚠️  GEMINI_API_KEY not configured. Location enrichment will be skipped.');
            return null;
        }
        genAI = new GoogleGenerativeAI(apiKey);
        model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp',
            // Enable Google Search grounding for real-time data
            tools: [{
                googleSearch: {}
            }]
        });
    }
    return model;
}

/**
 * Check if a location needs enrichment (has empty GEM fields)
 */
function needsEnrichment(gemData) {
    const requiredFields = [
        'GEMnearestHospital',
        'GEMnearestFireStation',
        'GEMnearestPoliceStation',
        'GEMnearestEmergencyAfterHours',
        'GEMsunriseTime',
        'GEMsunsetTime',
        'GEMweatherTemp',
        'GEMweatherDesc',
        'GEMpublicTransportInfo',
        'GEMtransportDesc'
    ];

    return requiredFields.some(field => !gemData[field] || gemData[field].trim() === '');
}

/**
 * Update a location table in Craft with enriched GEM data
 */
async function updateLocationWithGemData(tableId, gemData) {
    // First, fetch the current table to get its structure
    const tableBlock = await craftService.getBlock(tableId);

    if (!tableBlock?.rows) {
        console.error('Could not fetch table for update');
        return false;
    }

    // Build the updated markdown for the table
    const rows = tableBlock.rows.map(row => {
        if (row.length >= 2) {
            const key = row[0]?.value?.trim();

            // Check if this is a GEM field and we have data for it
            if (key && key.startsWith('GEM')) {
                const gemKey = key.replace('GEM', '');
                const lowerKey = gemKey.charAt(0).toLowerCase() + gemKey.slice(1);

                if (gemData[lowerKey]) {
                    return [
                        { value: key, attributes: [] },
                        { value: gemData[lowerKey], attributes: [] }
                    ];
                }
            }
        }
        return row;
    });

    // Update the block
    try {
        await craftService.updateBlocks([{
            id: tableId,
            rows: rows
        }]);
        return true;
    } catch (error) {
        console.error('Error updating location table:', error);
        return false;
    }
}

/**
 * Enrich ALL locations for a production in a SINGLE API call
 * This avoids rate limiting issues
 */
async function enrichProduction(production) {
    const geminiModel = initGemini();
    if (!geminiModel) {
        console.log('Gemini not configured, skipping enrichment');
        return production;
    }

    const locations = production.locations || [];

    // Collect locations that need enrichment
    const locationsToEnrich = [];
    for (let i = 0; i < locations.length; i++) {
        const location = locations[i];

        if (needsEnrichment(location.gemData)) {
            const address = location.data['Location Address'];
            if (address) {
                const nextAddress = i < locations.length - 1
                    ? locations[i + 1]?.data['Location Address']
                    : null;
                locationsToEnrich.push({
                    index: i,
                    address,
                    nextAddress,
                    location
                });
            }
        } else {
            console.log(`Location ${i + 1} already enriched, skipping`);
        }
    }

    if (locationsToEnrich.length === 0) {
        console.log('All locations already enriched');
        return production;
    }

    // Format the date for weather/sun queries
    const dateStr = production.properties.date_of_shoot || new Date().toISOString().split('T')[0];
    const formattedDate = new Date(dateStr).toLocaleDateString('en-AU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Build a single prompt for ALL locations
    const locationsList = locationsToEnrich.map((loc, idx) => {
        let desc = `Location ${idx + 1}: "${loc.address}"`;
        if (loc.nextAddress) {
            desc += ` (next location: "${loc.nextAddress}")`;
        }
        return desc;
    }).join('\n');

    const prompt = `You are helping a film production crew in Australia. I need specific information about multiple locations for a shoot date of ${formattedDate}.

LOCATIONS:
${locationsList}

For EACH location, please search the web and provide accurate, current information. Return a JSON array where each object corresponds to a location in order.

Each object should have these exact keys:
{
  "nearestHospital": "Name and address of the nearest hospital",
  "nearestFireStation": "Name and address of the nearest fire station",
  "nearestPoliceStation": "Name and address of the nearest police station",
  "nearestEmergencyAfterHours": "Name and address of nearest 24-hour emergency medical facility",
  "sunriseTime": "Sunrise time for ${formattedDate} at this location (e.g., '6:42 AM')",
  "sunsetTime": "Sunset time for ${formattedDate} at this location (e.g., '7:58 PM')",
  "weatherTemp": "Expected high/low temperature for ${formattedDate} (e.g., '28°C / 19°C')",
  "weatherDesc": "Professional weather description including precipitation chance and any warnings",
  "publicTransportInfo": "Concise paragraph on public transport routes connecting to this location",
  "transportDesc": "Brief directions to next location, or 'N/A' if no next location"
}

Important:
- Return a JSON ARRAY with ${locationsToEnrich.length} objects (one per location, in order)
- Use Australian format for times and temperatures
- Be specific with addresses
- Keep descriptions professional and concise
- Return ONLY valid JSON, no markdown formatting`;

    console.log(`Enriching ${locationsToEnrich.length} locations in a single API call...`);

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Extract JSON from response (handle potential markdown wrapping)
        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }

        // Parse the JSON response
        const enrichedLocations = JSON.parse(jsonStr.trim());

        if (!Array.isArray(enrichedLocations)) {
            console.error('Expected an array from Gemini, got:', typeof enrichedLocations);
            return production;
        }

        // Apply enriched data to each location
        for (let j = 0; j < locationsToEnrich.length && j < enrichedLocations.length; j++) {
            const locInfo = locationsToEnrich[j];
            const enrichedData = enrichedLocations[j];
            const location = locInfo.location;

            // Update local data
            location.gemData = {
                GEMnearestHospital: enrichedData.nearestHospital || '',
                GEMnearestFireStation: enrichedData.nearestFireStation || '',
                GEMnearestPoliceStation: enrichedData.nearestPoliceStation || '',
                GEMnearestEmergencyAfterHours: enrichedData.nearestEmergencyAfterHours || '',
                GEMsunriseTime: enrichedData.sunriseTime || '',
                GEMsunsetTime: enrichedData.sunsetTime || '',
                GEMweatherTemp: enrichedData.weatherTemp || '',
                GEMweatherDesc: enrichedData.weatherDesc || '',
                GEMpublicTransportInfo: enrichedData.publicTransportInfo || '',
                GEMtransportDesc: enrichedData.transportDesc || 'N/A',
            };

            // Update Craft
            if (location.tableId) {
                await updateLocationWithGemData(location.tableId, enrichedData);
                console.log(`Updated Craft with enriched data for location ${locInfo.index + 1}`);
            }
        }

        console.log('All locations enriched successfully');
    } catch (error) {
        console.error('Error enriching locations:', error);
    }

    return production;
}

module.exports = {
    needsEnrichment,
    updateLocationWithGemData,
    enrichProduction,
};
