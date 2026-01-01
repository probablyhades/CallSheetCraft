/**
 * API Client
 * Handles all communication with the backend API
 */

const API = {
    baseUrl: '/api',

    /**
     * Fetch all productions grouped by title
     */
    async getProductions() {
        const response = await fetch(`${this.baseUrl}/productions`);
        if (!response.ok) {
            throw new Error('Failed to fetch productions');
        }
        return response.json();
    },

    /**
     * Fetch a single production with SANITIZED details (no phone numbers)
     * This is the public endpoint - use authenticate() for full data
     * @param {string} id - Production ID
     * @param {boolean} enrich - Whether to trigger Gemini enrichment
     */
    async getProduction(id, enrich = true) {
        const url = `${this.baseUrl}/production/${id}${!enrich ? '?enrich=false' : ''}`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch production');
        }
        return response.json();
    },

    /**
     * Authenticate with phone number to get full production details
     * Server validates phone against crew/cast and only returns sensitive data if valid
     * @param {string} id - Production ID
     * @param {string} phone - Phone number to authenticate with
     * @returns {Object} { authenticated, userInfo, production, isClosedSet }
     */
    async authenticate(id, phone) {
        const response = await fetch(`${this.baseUrl}/production/${id}/authenticate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ phone }),
        });
        if (!response.ok) {
            throw new Error('Failed to authenticate');
        }
        return response.json();
    },

    /**
     * Force re-enrichment of production location data
     * @param {string} id - Production ID
     */
    async enrichProduction(id) {
        const response = await fetch(`${this.baseUrl}/production/${id}/enrich`, {
            method: 'POST',
        });
        if (!response.ok) {
            throw new Error('Failed to enrich production');
        }
        return response.json();
    },

    /**
     * Check API health
     */
    async checkHealth() {
        const response = await fetch(`${this.baseUrl}/health`);
        return response.json();
    }
};

