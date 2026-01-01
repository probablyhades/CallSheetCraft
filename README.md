# CallSheetCraft

Beautiful, personalized film call sheets powered by Craft and Gemini AI. Created with Google Antigravity and Claude Opus 4.5.

![gallery1-home](docs\images\Screenshot 2026-01-01 180837.png)
![gallery2-auth](docs\images\Screenshot 2026-01-01 180846.png)
![gallery3-main](docs\images\Screenshot 2026-01-01 180855.png)
![gallery4-export](docs\images\Screenshot 2026-01-01 180953.png)

## Features

- **Production Management** - Select from multiple productions.
- **Personalised Experience** - Phone number matching for crew/cast personalisation. Uses phone number to authenticate for closed sets and before revealing contact details.
- **Location Intelligence** - Gemini-powered enrichment with emergency services, weather, and transport info.
- **Privacy Controls** - Closed set warnings and contact obscuring for unauthenticated users.
- **Responsive Design** - Premium UI optimized for mobile, tablet, and desktop.
- **Simple Exports** - Export call sheets as PDFs.

## Creating the Craft Backend

### 1. Create Craft document
- Visit https://docs.40degree.media/callsheetcraft and duplicate the template into your Craft account.
- Add any relevant productions to the document (if applicable).

### 2. Create and Configure API Connection
- Open the Imagine tab in Craft and create a new API connection.
- Choose the option to Connect Selected Documents.
- Open your new connection, click the purple Add Document button, and select the template you duplicated.
- In the connection settings, ensure that Permission Level is set to Read and Write, and change access from Public to API Key.
- Copy the API key from the connection settings. Keep note of this, it won't reappear.

## Setting up a Development Server

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

## Deploying with Docker

```bash
# Build the image
docker build -t callsheetcraft .

# Run with environment variables
docker run -p [desired-port]:3000 \
  -e GEMINI_API_KEY=your_gemini_key \
  -e CRAFT_API_BASE=your_craft_api_base \
  -e CRAFT_API_KEY=your_craft_key \
  callsheetcraft
```

The server will run on the port under [desired-port]. I personally deploy this on my own infra and open it to public access via Cloudflare Tunnels.

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
