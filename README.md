# CallSheetCraft

Beautiful, personalized film call sheets powered by Craft and Gemini AI. Created with Google Antigravity and Claude Opus 4.5.

## Features

- 🎬 **Production Management** - Browse productions grouped by title with shoot day selection
- 📱 **Personalized Experience** - Phone number matching for crew/cast personalization
- 🗺️ **Location Intelligence** - Gemini-powered enrichment with emergency services, weather, and transport info
- 🔒 **Privacy Controls** - Closed set warnings and contact obscuring for unauthenticated users
- 📞 **Click-to-Call** - Phone numbers hyperlinked for instant calling
- 🌍 **Google Maps Integration** - One-click navigation to location addresses
- 📱 **Responsive Design** - Premium UI optimized for mobile, tablet, and desktop

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
```

Edit `.env` and add your API keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
CRAFT_API_KEY=your_craft_api_key_here
```

- Get your Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
- Get your Craft API key from your Craft multi-document connection settings

### 3. Start the Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Docker Deployment

```bash
# Build the image
docker build -t callsheetcraft .

# Run with environment variables
docker run -p 3000:3000 \
  -e GEMINI_API_KEY=your_gemini_key \
  -e CRAFT_API_KEY=your_craft_key \
  callsheetcraft
```

## Project Structure

```
CallSheetCraft/
├── server/
│   ├── index.js              # Express server
│   ├── routes/api.js         # API endpoints
│   └── services/
│       ├── craftService.js   # Craft API integration
│       └── geminiService.js  # Gemini AI with search grounding
├── public/
│   ├── index.html            # Single-page application
│   ├── css/styles.css        # Premium responsive styles
│   └── js/
│       ├── api.js            # API client
│       ├── components.js     # UI components
│       └── app.js            # Application controller
├── .env.example              # Environment template
├── .gitignore                # Git exclusions
├── Dockerfile                # Docker build
└── package.json              # Dependencies
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/productions` | GET | List all productions grouped by title |
| `/api/production/:id` | GET | Get production with auto-enrichment |
| `/api/production/:id/enrich` | POST | Force re-enrichment via Gemini |
| `/api/health` | GET | Health check |

## License

MIT
