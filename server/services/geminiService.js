/**
 * Gemini API Service
 * Handles location data enrichment using Gemini with Google Search grounding
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
 * Generate enriched location data using Gemini with web search
 */
async function enrichLocationData(address, shootDate, nextAddress = null) {
    const model = initGemini();
    if (!model) {
        return null;
    }

    // Format the date for weather/sun queries
    const dateStr = shootDate || new Date().toISOString().split('T')[0];
    const formattedDate = new Date(dateStr).toLocaleDateString('en-AU', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const prompt = `You are helping a film production crew. I need specific information about this location in Australia: "${address}" for a shoot date of ${formattedDate}.

Please search the web and provide accurate, current information for each of these items. Format your response as a JSON object with these exact keys:

{
  "nearestHospital": "Name and address of the nearest hospital",
  "nearestFireStation": "Name and address of the nearest fire station",
  "nearestPoliceStation": "Name and address of the nearest police station", 
  "nearestEmergencyAfterHours": "Name and address of nearest 24-hour emergency medical facility",
  "sunriseTime": "Sunrise time for ${formattedDate} at this location (e.g., '6:42 AM')",
  "sunsetTime": "Sunset time for ${formattedDate} at this location (e.g., '7:58 PM')",
  "weatherTemp": "Expected high/low temperature for ${formattedDate} (e.g., '28°C / 19°C')",
  "weatherDesc": "Professional weather description including precipitation chance and any warnings",
  "publicTransportInfo": "Concise paragraph on public transport routes connecting to this location, including any walking required"${nextAddress ? `,
  "transportDesc": "Brief directions for traveling from ${address} to ${nextAddress}"` : ''}
}

Important:
- Use Australian format for times and temperatures
- Be specific with addresses
- Keep descriptions professional and concise
- Return ONLY valid JSON, no markdown formatting`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();

        // Extract JSON from response (handle potential markdown wrapping)
        let jsonStr = text;
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        }

        // Parse the JSON response
        const data = JSON.parse(jsonStr.trim());

        // If no next address, set transportDesc to N/A
        if (!nextAddress) {
            data.transportDesc = 'N/A';
        }

        return data;
    } catch (error) {
        console.error('Error enriching location data:', error);
        return null;
    }
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
 * Enrich all locations for a production
 */
async function enrichProduction(production) {
    const model = initGemini();
    if (!model) {
        console.log('Gemini not configured, skipping enrichment');
        return production;
    }

    const locations = production.locations || [];

    for (let i = 0; i < locations.length; i++) {
        const location = locations[i];

        // Skip if already enriched
        if (!needsEnrichment(location.gemData)) {
            console.log(`Location ${i + 1} already enriched, skipping`);
            continue;
        }

        const address = location.data['Location Address'];
        if (!address) {
            console.log(`Location ${i + 1} has no address, skipping`);
            continue;
        }

        // Get next location address for transport description
        const nextAddress = i < locations.length - 1
            ? locations[i + 1]?.data['Location Address']
            : null;

        console.log(`Enriching location ${i + 1}: ${address}`);

        const enrichedData = await enrichLocationData(
            address,
            production.properties.date_of_shoot,
            nextAddress
        );

        if (enrichedData) {
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
                console.log(`Updated Craft with enriched data for location ${i + 1}`);
            }
        }
    }

    return production;
}

module.exports = {
    enrichLocationData,
    needsEnrichment,
    updateLocationWithGemData,
    enrichProduction,
};
