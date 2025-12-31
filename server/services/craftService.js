/**
 * Craft API Service
 * Handles all interactions with the Craft Multi-Document API
 */

const CRAFT_API_BASE = process.env.CRAFT_API_BASE || 'https://connect.craft.do/links/Hw5oNoYJQoE/api/v1';

/**
 * Fetch all collections from Craft
 */
async function listCollections() {
    const response = await fetch(`${CRAFT_API_BASE}/collections`);
    if (!response.ok) {
        throw new Error(`Failed to fetch collections: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Fetch all items from a specific collection
 */
async function getCollectionItems(collectionId) {
    const response = await fetch(`${CRAFT_API_BASE}/collections/${collectionId}/items?maxDepth=-1`);
    if (!response.ok) {
        throw new Error(`Failed to fetch collection items: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Fetch a specific block by ID
 */
async function getBlock(blockId) {
    const response = await fetch(`${CRAFT_API_BASE}/blocks?id=${blockId}&maxDepth=-1`);
    if (!response.ok) {
        throw new Error(`Failed to fetch block: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Update blocks in Craft (used for writing GEM* data back)
 */
async function updateBlocks(blocks) {
    const response = await fetch(`${CRAFT_API_BASE}/blocks`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ blocks }),
    });
    if (!response.ok) {
        throw new Error(`Failed to update blocks: ${response.statusText}`);
    }
    return response.json();
}

/**
 * Parse a Craft table into a key-value object
 * Handles 2-column tables (key-value pairs)
 */
function parseKeyValueTable(tableBlock) {
    const result = {};
    if (!tableBlock?.rows) return result;

    for (const row of tableBlock.rows) {
        if (row.length >= 2) {
            const key = row[0]?.value?.trim();
            const value = row[1]?.value?.trim();
            if (key) {
                result[key] = value || '';
            }
        }
    }
    return result;
}

/**
 * Parse a Craft table into an array of objects
 * Uses first row as headers
 */
function parseDataTable(tableBlock) {
    const result = [];
    if (!tableBlock?.rows || tableBlock.rows.length < 2) return result;

    // First row is headers
    const headers = tableBlock.rows[0].map(cell => cell?.value?.trim() || '');

    // Remaining rows are data
    for (let i = 1; i < tableBlock.rows.length; i++) {
        const row = tableBlock.rows[i];
        const rowData = {};
        let hasData = false;

        for (let j = 0; j < headers.length; j++) {
            const value = row[j]?.value?.trim() || '';
            rowData[headers[j]] = value;
            if (value) hasData = true;
        }

        // Only include rows that have at least some data
        if (hasData) {
            result.push(rowData);
        }
    }
    return result;
}

/**
 * Parse production data from a collection item
 */
function parseProduction(item) {
    const production = {
        id: item.id,
        title: item.production_title || item.title,
        properties: item.properties || {},
        crew: [],
        cast: [],
        locations: [],
        scenes: [],
    };

    if (!item.content) return production;

    let currentSection = null;
    let currentLocation = null;
    let locationIndex = 0;

    for (const block of item.content) {
        // Track current section by H1 headers
        if (block.type === 'text' && block.textStyle === 'h1') {
            const sectionName = block.markdown?.replace('#', '').trim().toLowerCase();
            if (sectionName.includes('crew')) currentSection = 'crew';
            else if (sectionName.includes('cast')) currentSection = 'cast';
            else if (sectionName.includes('location')) currentSection = 'locations';
            else if (sectionName.includes('scene')) currentSection = 'scenes';
            else currentSection = null;
            continue;
        }

        // Track location subsections by H2 headers
        if (block.type === 'text' && block.textStyle === 'h2') {
            if (block.markdown?.toLowerCase().includes('location')) {
                locationIndex++;
                currentLocation = { index: locationIndex, tableId: null, data: {}, gemData: {} };
                production.locations.push(currentLocation);
            }
            continue;
        }

        // Parse tables based on current section
        if (block.type === 'table') {
            if (currentSection === 'crew') {
                production.crew = parseDataTable(block);
            } else if (currentSection === 'cast') {
                production.cast = parseDataTable(block);
            } else if (currentSection === 'scenes') {
                production.scenes = parseDataTable(block);
            } else if (currentSection === 'locations' && currentLocation) {
                currentLocation.tableId = block.id;
                const locationData = parseKeyValueTable(block);

                // Separate GEM fields from regular location data
                for (const [key, value] of Object.entries(locationData)) {
                    if (key.startsWith('GEM')) {
                        currentLocation.gemData[key] = value;
                    } else {
                        currentLocation.data[key] = value;
                    }
                }
            }
        }
    }

    return production;
}

/**
 * Get all productions grouped by title
 */
async function getProductions() {
    // Get the CallSheetAPI collection
    const collections = await listCollections();
    const callSheetCollection = collections.items?.find(c =>
        c.name === 'CallSheetAPI' || c.name?.includes('CallSheet')
    );

    if (!callSheetCollection) {
        throw new Error('CallSheetAPI collection not found');
    }

    // Get all items in the collection
    const itemsResponse = await getCollectionItems(callSheetCollection.id);
    const items = itemsResponse.items || [];

    // Parse each item and group by title
    const productions = [];
    const grouped = {};

    for (const item of items) {
        // Skip empty items - check both possible title fields
        const itemTitle = item.production_title || item.title;
        if (!itemTitle) continue;

        const production = parseProduction(item);
        productions.push(production);

        // Extract base title (removing day number if present)
        const baseTitle = itemTitle.replace(/\s*-\s*Day\s*\d+$/i, '').trim() || itemTitle;

        if (!grouped[baseTitle]) {
            grouped[baseTitle] = {
                title: baseTitle,
                days: [],
            };
        }

        grouped[baseTitle].days.push({
            id: item.id,
            shootDay: production.properties.shoot_day_ || 1,
            date: production.properties.date_of_shoot,
            fullTitle: itemTitle,
        });
    }

    // Sort days within each group
    for (const group of Object.values(grouped)) {
        group.days.sort((a, b) => (a.shootDay || 0) - (b.shootDay || 0));
    }

    return {
        productions,
        grouped: Object.values(grouped),
    };
}

/**
 * Get a single production by ID
 */
async function getProductionById(id) {
    // Get the CallSheetAPI collection
    const collections = await listCollections();
    const callSheetCollection = collections.items?.find(c =>
        c.name === 'CallSheetAPI' || c.name?.includes('CallSheet')
    );

    if (!callSheetCollection) {
        throw new Error('CallSheetAPI collection not found');
    }

    // Get all items and find the matching one
    const itemsResponse = await getCollectionItems(callSheetCollection.id);
    const item = itemsResponse.items?.find(i => i.id === id);

    if (!item) {
        throw new Error('Production not found');
    }

    return parseProduction(item);
}

module.exports = {
    listCollections,
    getCollectionItems,
    getBlock,
    updateBlocks,
    parseKeyValueTable,
    parseDataTable,
    parseProduction,
    getProductions,
    getProductionById,
};
