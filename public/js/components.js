/**
 * UI Components
 * Reusable component renderers for the CallSheetCraft application
 */

const Components = {
  /**
   * Format phone number for tel: link
   */
  formatPhoneForLink(phone) {
    // Remove all non-digit characters
    const digits = phone.replace(/\D/g, '');
    // Add Australian country code if not present
    if (digits.startsWith('04') || digits.startsWith('1300') || digits.startsWith('1800')) {
      return `+61${digits.slice(1)}`;
    }
    if (digits.startsWith('61')) {
      return `+${digits}`;
    }
    return `+61${digits}`;
  },

  /**
   * Format date for display
   */
  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-AU', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  },

  /**
   * Create Google Maps URL for an address
   */
  createMapUrl(address) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  },

  /**
   * Render a production card
   */
  renderProductionCard(title, days) {
    const dayText = days.length === 1 ? '1 shoot day' : `${days.length} shoot days`;
    return `
      <div class="production-card" data-title="${title}">
        <h3 class="production-card-title">${title}</h3>
        <p class="production-card-meta">${dayText}</p>
      </div>
    `;
  },

  /**
   * Render a day selection card
   */
  renderDayCard(day) {
    return `
      <div class="day-card" data-id="${day.id}" data-day="${day.shootDay}">
        <div class="day-number">${day.shootDay}</div>
        <div class="day-label">Day</div>
        <div class="day-date">${this.formatDate(day.date)}</div>
      </div>
    `;
  },

  /**
   * Render the info bar with times
   */
  renderInfoBar(properties, userCallTime = null) {
    const items = [
      { label: 'Crew Call', value: properties.crew_call_time, highlight: false },
      { label: 'Cast Call', value: properties.cast_call_time, highlight: false },
      { label: 'Breakfast', value: properties.time_of_breakfast, highlight: false },
      { label: 'Lunch', value: properties.time_of_lunch, highlight: false },
      { label: 'Dinner', value: properties.time_of_dinner, highlight: false },
      { label: 'Est. Wrap', value: properties.estimated_wrap, highlight: false },
    ];

    // Highlight user's call time if matched
    if (userCallTime) {
      items.unshift({ label: 'Your Call', value: userCallTime, highlight: true });
    }

    const itemsHtml = items
      .filter(item => item.value)
      .map(item => `
        <div class="info-item">
          <div class="info-label">${item.label}</div>
          <div class="info-value${item.highlight ? ' highlight' : ''}">${item.value}</div>
        </div>
      `).join('');

    return `<div class="info-bar">${itemsHtml}</div>`;
  },

  /**
   * Render notes section
   */
  renderNotes(notes) {
    if (!notes) return '';
    return `
      <div class="notes-card">
        <h3 class="notes-title">Production Notes</h3>
        <p class="notes-content">${notes}</p>
      </div>
    `;
  },

  /**
   * Render personal greeting
   */
  renderGreeting(user) {
    // Extract first name only
    const firstName = (user.name || '').split(' ')[0];
    return `
      <div class="greeting-card">
        <h2 class="greeting-title">Welcome, <span>${firstName}</span>!</h2>
        <div class="greeting-details">
          <div class="greeting-detail">
            <span class="greeting-detail-label">Role:</span>
            <span class="greeting-detail-value">${user.role || user.character}</span>
          </div>
          <div class="greeting-detail">
            <span class="greeting-detail-label">Your Call Time:</span>
            <span class="greeting-detail-value">${user.callTime}</span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * Render people table (crew or cast)
   */
  renderPeopleTable(people, headers, highlightPhone = null, showContacts = true) {
    if (!people || people.length === 0) {
      return '<p style="color: var(--text-tertiary); text-align: center;">No data available</p>';
    }

    const headerRow = headers.map(h => `<th>${h}</th>`).join('');

    const rows = people.map(person => {
      const phone = person.Phone || person.phone || '';
      const isHighlighted = highlightPhone && this.normalizePhone(phone) === this.normalizePhone(highlightPhone);

      // Use headers to determine columns (not Object.keys) so Phone column always appears
      const cells = headers.map(header => {
        // Map header display name to object key
        const key = header;
        let value = person[key] || '';

        // Handle phone column
        if (header.toLowerCase() === 'phone') {
          if (value && showContacts) {
            // Show clickable phone link when authenticated
            const telLink = this.formatPhoneForLink(value);
            value = `<a href="tel:${telLink}" class="phone-link">📞 ${value}</a>`;
          } else {
            // Show prompt when not authenticated (phone either missing or hidden)
            value = `<span class="phone-obscured">Enter phone to view</span>`;
          }
        }

        return `<td>${value}</td>`;
      }).join('');

      return `<tr class="${isHighlighted ? 'highlighted' : ''}">${cells}</tr>`;
    }).join('');

    return `
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  },

  /**
   * Normalize phone number for comparison
   */
  normalizePhone(phone) {
    return phone?.replace(/\D/g, '') || '';
  },

  /**
   * Render location card
   */
  renderLocationCard(location, index) {
    const data = location.data || {};
    const gemData = location.gemData || {};
    const address = data['Location Address'] || '';
    const unitBase = data['Unit Base Address'] || '';
    const scriptLocation = data['Script Location'] || `Location ${index}`;

    return `
      <article class="location-card">
        <header class="location-header">
          <div class="location-title-group">
            <div class="location-number">${index}</div>
            <h3 class="location-name">${scriptLocation}</h3>
          </div>
          ${address ? `
            <a href="${this.createMapUrl(address)}" target="_blank" rel="noopener" class="map-link">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1C5.23858 1 3 3.23858 3 6C3 9.5 8 15 8 15C8 15 13 9.5 13 6C13 3.23858 10.7614 1 8 1Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="8" cy="6" r="2" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              Open in Maps
            </a>
          ` : ''}
        </header>
        
        <div class="location-body">
          <div class="location-addresses">
            ${address ? `
              <div class="address-item">
                <span class="address-label">Location Address</span>
                <span class="address-value">${address}</span>
              </div>
            ` : ''}
            ${unitBase && unitBase !== address ? `
              <div class="address-item">
                <span class="address-label">Unit Base</span>
                <span class="address-value">${unitBase}</span>
              </div>
            ` : ''}
          </div>
          
          <div class="location-gem-data">
            ${this.renderGemSection('Emergency Services', [
      { label: 'Nearest Hospital', value: gemData.GEMnearestHospital },
      { label: 'Fire Station', value: gemData.GEMnearestFireStation },
      { label: 'Police Station', value: gemData.GEMnearestPoliceStation },
      { label: '24hr Emergency', value: gemData.GEMnearestEmergencyAfterHours },
    ])}
            
            ${this.renderGemSection('Weather & Sun Times', [
      { label: 'Sunrise', value: gemData.GEMsunriseTime },
      { label: 'Sunset', value: gemData.GEMsunsetTime },
      { label: 'Temperature', value: gemData.GEMweatherTemp },
      { label: 'Conditions', value: gemData.GEMweatherDesc, isWarning: gemData.GEMweatherDesc?.toLowerCase().includes('warning') },
    ])}
            
            ${gemData.GEMpublicTransportInfo ? this.renderGemSection('Public Transport', [
      { label: '', value: gemData.GEMpublicTransportInfo, fullWidth: true },
    ]) : ''}
            
            ${gemData.GEMtransportDesc && gemData.GEMtransportDesc !== 'N/A' ? this.renderGemSection('Transport to Next Location', [
      { label: '', value: gemData.GEMtransportDesc, fullWidth: true },
    ]) : ''}
          </div>
        </div>
      </article>
    `;
  },

  /**
   * Render a GEM data section
   */
  renderGemSection(title, items) {
    const filteredItems = items.filter(item => item.value);
    if (filteredItems.length === 0) return '';

    const icon = title.includes('Emergency') ? '🏥' :
      title.includes('Weather') ? '☀️' :
        title.includes('Transport') ? '🚌' : '📍';

    const itemsHtml = filteredItems.map(item => {
      if (item.fullWidth) {
        return `
          <div class="gem-item" style="grid-column: 1 / -1;">
            <span class="gem-value${item.isWarning ? ' warning' : ''}">${item.value}</span>
          </div>
        `;
      }
      return `
        <div class="gem-item">
          <span class="gem-label">${item.label}</span>
          <span class="gem-value${item.isWarning ? ' warning' : ''}">${item.value}</span>
        </div>
      `;
    }).join('');

    return `
      <div class="gem-section">
        <h4 class="gem-section-title">${icon} ${title}</h4>
        <div class="gem-grid">${itemsHtml}</div>
      </div>
    `;
  },

  /**
   * Render scenes table
   */
  renderScenesTable(scenes, userCharacters = []) {
    if (!scenes || scenes.length === 0) {
      return '<p style="color: var(--text-tertiary); text-align: center;">No scenes scheduled</p>';
    }

    const headers = ['#', 'Description', 'Characters', 'M&W', 'On-Set', 'Int/Ext', 'Location'];
    const headerRow = headers.map(h => `<th>${h}</th>`).join('');

    const rows = scenes.map(scene => {
      const sceneNum = scene['Scene Number'] || '';
      const desc = scene['Scene Description'] || '';
      const characters = scene['Characters'] || '';
      const mwTime = scene['Makeup & Wardrobe Time'] || '';
      const onSetTime = scene['On-Set Time'] || '';
      const intExt = scene['Int/Ext'] || '';
      const location = scene['Script Location'] || '';

      // Check if user's character is in this scene
      const isUserScene = userCharacters.some(char =>
        characters.toLowerCase().includes(char.toLowerCase())
      );

      const intExtTag = intExt ?
        `<span class="scene-tag ${intExt.toLowerCase()}">${intExt}</span>` : '';

      return `
        <tr class="${isUserScene ? 'user-scene' : ''}">
          <td><span class="scene-number">${sceneNum}</span></td>
          <td>${desc}</td>
          <td>${characters}</td>
          <td>${mwTime}</td>
          <td>${onSetTime}</td>
          <td>${intExtTag}</td>
          <td>${location}</td>
        </tr>
      `;
    }).join('');

    return `
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }
};
