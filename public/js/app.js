/**
 * CallSheetCraft Application
 * Main application controller and state management
 */

const App = {
    // Application state
    state: {
        productions: null,
        grouped: null,
        selectedProduction: null,
        selectedProductionTitle: null,
        currentProduction: null,
        userPhone: null,
        userInfo: null,
        isAuthenticated: false,
        isClosedSet: false,
    },

    // Screen elements
    screens: {},

    /**
     * Initialize the application
     */
    async init() {
        console.log('🎬 CallSheetCraft initializing...');

        // Cache screen elements
        this.screens = {
            loading: document.getElementById('loading-screen'),
            production: document.getElementById('production-screen'),
            day: document.getElementById('day-screen'),
            phone: document.getElementById('phone-screen'),
            callsheet: document.getElementById('callsheet-screen'),
        };

        // Set up event listeners
        this.setupEventListeners();
        this.setupExportListeners();

        // Load productions
        try {
            await this.loadProductions();
        } catch (error) {
            console.error('Failed to load productions:', error);
            this.showError('Failed to load productions. Please refresh the page.');
        }
    },

    /**
     * Set up event listeners
     */
    setupEventListeners() {
        // Back buttons
        document.getElementById('back-to-productions')?.addEventListener('click', () => {
            this.showScreen('production');
        });

        document.getElementById('back-to-days')?.addEventListener('click', () => {
            this.showScreen('day');
        });

        document.getElementById('back-to-phone')?.addEventListener('click', () => {
            // Go back to days if multiple days, otherwise to productions
            const group = this.state.grouped?.find(g => g.title === this.state.selectedProductionTitle);
            if (group && group.days.length > 1) {
                this.showScreen('day');
            } else {
                this.showScreen('production');
            }
        });

        // Phone form
        document.getElementById('phone-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handlePhoneSubmit();
        });

        // Skip button
        document.getElementById('skip-button')?.addEventListener('click', () => {
            this.handleSkip();
        });

        // Production card clicks (delegated)
        document.getElementById('productions-grid')?.addEventListener('click', (e) => {
            const card = e.target.closest('.production-card');
            if (card && !card.classList.contains('loading')) {
                card.classList.add('loading');
                const title = card.dataset.title;
                this.selectProduction(title, card);
            }
        });

        // Day card clicks (delegated)
        document.getElementById('days-grid')?.addEventListener('click', (e) => {
            const card = e.target.closest('.day-card');
            if (card && !card.classList.contains('loading')) {
                card.classList.add('loading');
                const id = card.dataset.id;
                this.selectDay(id, card);
            }
        });
    },

    /**
     * Show a specific screen
     */
    showScreen(screenName) {
        Object.values(this.screens).forEach(screen => {
            screen?.classList.remove('active');
        });
        this.screens[screenName]?.classList.add('active');

        // Scroll to top on screen change
        window.scrollTo(0, 0);
    },

    /**
     * Load all productions
     */
    async loadProductions() {
        this.showScreen('loading');

        const data = await API.getProductions();
        this.state.productions = data.productions;
        this.state.grouped = data.grouped;

        this.renderProductionsGrid();
        this.showScreen('production');
    },

    /**
     * Render the productions grid
     */
    renderProductionsGrid() {
        const grid = document.getElementById('productions-grid');
        if (!grid || !this.state.grouped) return;

        const html = this.state.grouped
            .filter(g => g.days.length > 0)
            .map(g => Components.renderProductionCard(g.title, g.days))
            .join('');

        grid.innerHTML = html || '<p style="text-align: center; color: var(--text-tertiary);">No productions found</p>';
    },

    /**
     * Select a production title
     */
    selectProduction(title, clickedCard = null) {
        this.state.selectedProductionTitle = title;
        const group = this.state.grouped.find(g => g.title === title);

        if (!group) {
            clickedCard?.classList.remove('loading');
            return;
        }

        // Update title
        document.getElementById('selected-production-title').textContent = title;

        // If only one day, skip day selection
        if (group.days.length === 1) {
            this.selectDay(group.days[0].id, clickedCard);
            return;
        }

        // Remove loading state before showing next screen
        clickedCard?.classList.remove('loading');

        // Render days grid
        const daysGrid = document.getElementById('days-grid');
        daysGrid.innerHTML = group.days.map(d => Components.renderDayCard(d)).join('');

        this.showScreen('day');
    },

    /**
     * Select a shoot day
     */
    async selectDay(productionId, clickedCard = null) {
        this.state.selectedProduction = productionId;

        // First fetch to check if enrichment is needed
        try {
            // Quick fetch without enrichment to check status
            const productionPreview = await API.getProduction(productionId, false);

            // Check if any locations need enrichment
            const needsEnrichment = productionPreview.locations?.some(loc => {
                const gemData = loc.gemData || {};
                return !gemData.GEMnearestHospital || gemData.GEMnearestHospital.trim() === '';
            });

            // Show enrichment loader if needed
            if (needsEnrichment) {
                document.getElementById('enrichment-loader')?.classList.remove('hidden');
            }

            // Fetch with enrichment enabled
            this.state.currentProduction = await API.getProduction(productionId, true);
            this.state.isClosedSet = this.state.currentProduction.properties?.closed_set === true;

            // Hide enrichment loader
            document.getElementById('enrichment-loader')?.classList.add('hidden');

            // Update phone screen UI based on closed set status
            this.updatePhoneScreen();

            // Remove loading state
            clickedCard?.classList.remove('loading');

            this.showScreen('phone');
        } catch (error) {
            console.error('Failed to load production:', error);
            document.getElementById('enrichment-loader')?.classList.add('hidden');
            this.showError('Failed to load call sheet data.');
            clickedCard?.classList.remove('loading');
        }
    },

    /**
     * Update phone screen based on closed set status
     */
    updatePhoneScreen() {
        const closedWarning = document.getElementById('closed-set-warning');
        const skipOption = document.getElementById('skip-option');

        if (this.state.isClosedSet) {
            // Show closed set warning, hide skip option
            closedWarning?.classList.remove('hidden');
            skipOption?.classList.add('hidden');
        } else {
            // Hide closed set warning, show skip option
            closedWarning?.classList.add('hidden');
            skipOption?.classList.remove('hidden');
        }
    },

    /**
     * Handle phone form submission
     */
    handlePhoneSubmit() {
        const phoneInput = document.getElementById('phone-input');
        const phone = phoneInput?.value?.trim();

        if (!phone) {
            phoneInput?.focus();
            return;
        }

        this.state.userPhone = phone;
        this.state.isAuthenticated = true;

        // Find user in crew or cast
        this.findUser(phone);

        // Render call sheet
        this.renderCallSheet();
    },

    /**
     * Handle skip button
     */
    handleSkip() {
        this.state.isAuthenticated = false;
        this.state.userPhone = null;
        this.state.userInfo = null;

        this.renderCallSheet();
    },

    /**
     * Find user in crew or cast by phone number
     */
    findUser(phone) {
        const normalizedPhone = Components.normalizePhone(phone);
        const production = this.state.currentProduction;

        // Check crew
        for (const member of production.crew || []) {
            if (Components.normalizePhone(member.Phone) === normalizedPhone) {
                this.state.userInfo = {
                    name: member.Name,
                    role: member.Role,
                    callTime: member['Call Time'],
                    type: 'crew',
                };
                return;
            }
        }

        // Check cast
        for (const member of production.cast || []) {
            if (Components.normalizePhone(member.Phone) === normalizedPhone) {
                this.state.userInfo = {
                    name: member.Name,
                    character: member.Character,
                    callTime: member['Call Time'],
                    type: 'cast',
                };
                return;
            }
        }

        // No match found
        this.state.userInfo = null;
    },

    /**
     * Render the call sheet view
     */
    renderCallSheet() {
        const production = this.state.currentProduction;
        if (!production) return;

        // Update header
        const headerTitle = document.getElementById('callsheet-header-title');
        if (headerTitle) {
            const dayNum = production.properties.shoot_day_ || 1;
            const date = Components.formatDate(production.properties.date_of_shoot);
            headerTitle.textContent = `${production.title} • Day ${dayNum} • ${date}`;
        }

        // Render greeting (if authenticated and matched)
        const greetingSection = document.getElementById('personal-greeting');
        if (greetingSection) {
            if (this.state.userInfo) {
                greetingSection.innerHTML = Components.renderGreeting(this.state.userInfo);
                greetingSection.classList.remove('hidden');
            } else {
                greetingSection.classList.add('hidden');
            }
        }

        // Show/hide closed set warning
        const closedWarning = document.getElementById('callsheet-closed-warning');
        if (closedWarning) {
            if (this.state.isClosedSet) {
                closedWarning.classList.remove('hidden');
            } else {
                closedWarning.classList.add('hidden');
            }
        }

        // Render info bar
        const infoBar = document.getElementById('info-bar');
        if (infoBar) {
            const userCallTime = this.state.userInfo?.callTime;
            infoBar.innerHTML = Components.renderInfoBar(production.properties, userCallTime);
        }

        // Render notes
        const notesSection = document.getElementById('notes-section');
        if (notesSection) {
            const notes = production.properties.notes;
            if (notes) {
                notesSection.innerHTML = Components.renderNotes(notes);
                notesSection.classList.remove('hidden');
            } else {
                notesSection.classList.add('hidden');
            }
        }

        // Render crew table
        const crewTable = document.getElementById('crew-table');
        if (crewTable) {
            crewTable.innerHTML = Components.renderPeopleTable(
                production.crew,
                ['Role', 'Name', 'Phone', 'Call Time'],
                this.state.userPhone,
                this.state.isAuthenticated
            );
        }

        // Render cast table
        const castTable = document.getElementById('cast-table');
        if (castTable) {
            castTable.innerHTML = Components.renderPeopleTable(
                production.cast,
                ['Character', 'Name', 'Phone', 'Call Time'],
                this.state.userPhone,
                this.state.isAuthenticated
            );
        }

        // Render locations
        const locationsSection = document.getElementById('locations-section');
        if (locationsSection) {
            const locationsHtml = production.locations
                .map((loc, i) => Components.renderLocationCard(loc, i + 1))
                .join('');
            locationsSection.innerHTML = locationsHtml;
        }

        // Render scenes
        const scenesTable = document.getElementById('scenes-table');
        if (scenesTable) {
            const userCharacters = this.state.userInfo?.character
                ? [this.state.userInfo.character]
                : [];
            scenesTable.innerHTML = Components.renderScenesTable(
                production.scenes,
                userCharacters
            );
        }

        this.showScreen('callsheet');
    },

    /**
     * Show error message
     */
    showError(message) {
        // For now, just use alert. In production, use a toast/modal component.
        alert(message);
    },

    /**
     * Export state for modal
     */
    exportSettings: {
        includeContacts: true,
        useLightMode: false,
    },

    /**
     * Handle export button click
     */
    handleExportClick() {
        const modal = document.getElementById('export-modal');
        const contactGroup = document.querySelector('[data-contacts="true"]').parentElement.parentElement;

        // Hide contact options if not authenticated
        if (!this.state.isAuthenticated) {
            contactGroup.style.display = 'none';
            this.exportSettings.includeContacts = false;
        } else {
            contactGroup.style.display = 'block';
            this.exportSettings.includeContacts = true;
            // Reset to default selection
            document.getElementById('export-personalised').classList.add('active');
            document.getElementById('export-general').classList.remove('active');
        }

        // Reset mode selection to dark
        this.exportSettings.useLightMode = false;
        document.getElementById('export-dark').classList.add('active');
        document.getElementById('export-light').classList.remove('active');

        modal?.classList.remove('hidden');
    },

    /**
     * Close export modal
     */
    closeExportModal() {
        document.getElementById('export-modal')?.classList.add('hidden');
    },

    /**
     * Setup export modal event listeners
     */
    setupExportListeners() {
        // Export button
        document.getElementById('export-pdf-button')?.addEventListener('click', () => {
            this.handleExportClick();
        });

        // Close buttons
        document.getElementById('close-export-modal')?.addEventListener('click', () => {
            this.closeExportModal();
        });
        document.getElementById('cancel-export')?.addEventListener('click', () => {
            this.closeExportModal();
        });

        // Contact options toggle
        document.getElementById('export-personalised')?.addEventListener('click', (e) => {
            this.exportSettings.includeContacts = true;
            document.getElementById('export-personalised').classList.add('active');
            document.getElementById('export-general').classList.remove('active');
        });
        document.getElementById('export-general')?.addEventListener('click', (e) => {
            this.exportSettings.includeContacts = false;
            document.getElementById('export-general').classList.add('active');
            document.getElementById('export-personalised').classList.remove('active');
        });

        // Mode options toggle
        document.getElementById('export-dark')?.addEventListener('click', (e) => {
            this.exportSettings.useLightMode = false;
            document.getElementById('export-dark').classList.add('active');
            document.getElementById('export-light').classList.remove('active');
        });
        document.getElementById('export-light')?.addEventListener('click', (e) => {
            this.exportSettings.useLightMode = true;
            document.getElementById('export-light').classList.add('active');
            document.getElementById('export-dark').classList.remove('active');
        });

        // Confirm export
        document.getElementById('confirm-export')?.addEventListener('click', () => {
            this.generatePDF();
        });

        // Close on overlay click
        document.getElementById('export-modal')?.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal-overlay')) {
                this.closeExportModal();
            }
        });
    },

    /**
     * Generate PDF from call sheet
     */
    async generatePDF() {
        const production = this.state.currentProduction;
        if (!production) return;

        const confirmBtn = document.getElementById('confirm-export');
        const originalText = confirmBtn.textContent;
        confirmBtn.textContent = 'Generating...';
        confirmBtn.disabled = true;

        try {
            // Store original state
            const wasAuthenticated = this.state.isAuthenticated;
            const originalUserInfo = this.state.userInfo;

            // Apply export settings
            if (!this.exportSettings.includeContacts) {
                // Temporarily hide contacts
                this.state.isAuthenticated = false;
                this.state.userInfo = null;
            }

            // Re-render with export settings
            this.renderCallSheetForExport();

            // Apply light mode if selected
            const callsheetContent = document.querySelector('.callsheet-content');
            if (this.exportSettings.useLightMode) {
                callsheetContent.classList.add('light-mode');
            }

            // Hide elements not needed in PDF
            const header = document.querySelector('.callsheet-header');
            const aiDisclosure = document.querySelector('.ai-disclosure');
            header?.classList.add('hidden');

            // Wait for styles to apply
            await new Promise(resolve => setTimeout(resolve, 100));

            // Capture with html2canvas
            const canvas = await html2canvas(callsheetContent, {
                scale: 2,
                useCORS: true,
                backgroundColor: this.exportSettings.useLightMode ? '#ffffff' : '#0a0a0a',
                logging: false,
            });

            // Generate PDF with jsPDF
            const { jsPDF } = window.jspdf;
            const imgWidth = 210; // A4 width in mm
            const pageHeight = 297; // A4 height in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            const pdf = new jsPDF('p', 'mm', 'a4');
            let heightLeft = imgHeight;
            let position = 0;

            // Add first page
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            // Add additional pages if needed
            while (heightLeft > 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            // Generate filename
            const dayNum = production.properties.shoot_day_ || 1;
            const filename = `${production.title.replace(/[^a-z0-9]/gi, '_')}_Day${dayNum}_CallSheet.pdf`;

            // Download
            pdf.save(filename);

            // Restore original state
            this.state.isAuthenticated = wasAuthenticated;
            this.state.userInfo = originalUserInfo;
            callsheetContent.classList.remove('light-mode');
            header?.classList.remove('hidden');

            // Re-render with original settings
            this.renderCallSheet();
            this.closeExportModal();

        } catch (error) {
            console.error('PDF generation failed:', error);
            this.showError('Failed to generate PDF. Please try again.');
        } finally {
            confirmBtn.textContent = originalText;
            confirmBtn.disabled = false;
        }
    },

    /**
     * Render call sheet specifically for export (without navigating)
     */
    renderCallSheetForExport() {
        const production = this.state.currentProduction;
        if (!production) return;

        // Render greeting (if authenticated and matched)
        const greetingSection = document.getElementById('personal-greeting');
        if (greetingSection) {
            if (this.state.userInfo && this.exportSettings.includeContacts) {
                greetingSection.innerHTML = Components.renderGreeting(this.state.userInfo);
                greetingSection.classList.remove('hidden');
            } else {
                greetingSection.classList.add('hidden');
            }
        }

        // Render crew table
        const crewTable = document.getElementById('crew-table');
        if (crewTable) {
            crewTable.innerHTML = Components.renderPeopleTable(
                production.crew,
                ['Role', 'Name', 'Phone', 'Call Time'],
                this.state.userPhone,
                this.exportSettings.includeContacts
            );
        }

        // Render cast table
        const castTable = document.getElementById('cast-table');
        if (castTable) {
            castTable.innerHTML = Components.renderPeopleTable(
                production.cast,
                ['Character', 'Name', 'Phone', 'Call Time'],
                this.state.userPhone,
                this.exportSettings.includeContacts
            );
        }
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
