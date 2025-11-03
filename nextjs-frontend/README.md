# MapOps 🗺️

**Your Voice-First AI City Expert**

MapOps is an AI-powered conversational city analyst that transforms how you discover and navigate cities. Simply talk naturally to find places, plan trips, get directions, and discover restaurant menus—all through voice or text.

Built for YC Hackathon with Next.js, Mastra AI, and Google Maps APIs.

---

## ✨ Key Features

- 🎙️ **Voice-First Interface** - Hands-free continuous conversation with automatic speech detection
- 🧠 **Semantic Place Search** - Find places by vibe: "quiet coffee shop with outlets" analyzes reviews to score semantic attributes
- 🗺️ **Intelligent Trip Planning** - Multi-stop itineraries with per-leg travel modes (walk to coffee, then transit to museum)
- 🍽️ **Restaurant Intelligence** - OCR menu extraction with pictures + AI-powered dish recommendations from reviews
- 🚇 **Multi-Modal Navigation** - Walking, driving, biking, and transit directions with alternative routes
- 📍 **Saved Places** - Store home, work, and favorites for quick reference
- 🔄 **Artifact History** - Navigate through previous searches, routes, trips, and menus

---

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+ and npm
- **Google Maps API Key** with the following APIs enabled:
  - Places API (New)
  - Routes API (New)
  - Geocoding API
  - Maps JavaScript API
  - Time Zone API
- **OpenRouter API Key** (for Claude AI)
- **Tavily API Key** (for web search - optional)
- **Exa API Key** (for semantic search - optional)

### Installation

1. **Clone the repository**
   ```bash
   cd nextjs-frontend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**

   Create a `.env.local` file in the `nextjs-frontend` directory:

   ```bash
   # Required: Google Maps API
   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here

   # Required: OpenRouter for AI (Claude)
   OPENROUTER_API_KEY=your_openrouter_api_key_here

   # Optional: MCP Tools (for enhanced search)
   TAVILY_API_KEY=your_tavily_api_key_here
   EXA_API_KEY=your_exa_api_key_here

   # Optional: Voice features (currently not working - no OpenAI credits)
   # OPENAI_API_KEY=your_openai_api_key_here
   # ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open in browser**
   ```
   http://localhost:3000
   ```

---

## 📝 How to Use

### Text Chat Mode

1. Open the app at `http://localhost:3000`
2. Type your query in the chat input, for example:
   - "Find halal restaurants near me"
   - "Plan my Saturday: brunch, museum, dinner"
   - "Show me the menu for Tartine"
   - "Directions to Ferry Building by transit"
3. The AI will respond and update the map with markers, routes, or menu carousels

### Voice Mode ⚠️ (Currently Unavailable)

**Note:** Voice features are currently disabled due to insufficient OpenAI API credits. To enable:
- Add credits to your OpenAI account
- Add `OPENAI_API_KEY` to `.env.local`
- Optionally add `ELEVENLABS_API_KEY` for better voice quality
- Restart the server

When enabled:
1. Click the microphone icon
2. Choose "Auto" or "Hands-Free" mode
3. Speak your query naturally
4. The AI will respond with voice and update the map

---

## 🛠️ Tech Stack

### Frontend
- **Next.js 15** (React 19, App Router)
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Zustand** - State management
- **Google Maps React** - Interactive maps

### AI & Agents
- **Mastra v0.23+** - AI agent orchestration framework
- **AI SDK v5** - Streaming chat with tool calling
- **OpenRouter** - LLM provider access
- **Claude Haiku 4.5** - Fast, cost-effective AI model

### APIs & Services
- **Google Maps APIs** (Places, Routes, Geocoding, Time Zone)
- **Tavily MCP** - Web search (optional)
- **Exa MCP** - Semantic search (optional)
- **OpenAI** - Voice transcription via Whisper (optional)
- **ElevenLabs** - Text-to-speech (optional)

---

## 📁 Project Structure

```
nextjs-frontend/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # AI SDK chat endpoint
│   ├── components/
│   │   ├── ChatInterface.tsx     # Text chat UI
│   │   ├── MapView.tsx           # Google Maps integration
│   │   ├── ArtifactCarousel.tsx  # Bottom carousel for results
│   │   ├── VoiceInterface.tsx    # Voice controls (disabled)
│   │   └── Navbar.tsx            # Top navigation
│   ├── hooks/
│   │   ├── useMapState.ts        # Global map state (Zustand)
│   │   └── useUserProfile.ts     # User settings & saved places
│   └── page.tsx                  # Main app page
│
├── mastra/
│   ├── agents/
│   │   └── cityAnalystAgent.ts   # Main AI agent with 20 tools
│   ├── tools/
│   │   ├── search-places.ts      # Semantic place search
│   │   ├── get-directions.ts     # Multi-modal routing
│   │   ├── trip-plan.ts          # Multi-stop itinerary planner
│   │   ├── get-restaurant-menu.ts # OCR menu extraction
│   │   ├── get-popular-dishes.ts  # Review-based recommendations
│   │   └── ... (15 total tools)
│   └── mcp/
│       └── config.ts             # MCP remote tool integrations
│
├── lib/
│   ├── services/
│   │   ├── places-service.ts     # Google Places API wrapper
│   │   ├── routes-service.ts     # Google Routes API wrapper
│   │   ├── menu-service.ts       # Menu OCR & caching
│   │   └── ... (11 total services)
│   └── utils/
│       ├── ocr-helper.ts         # Google Vision OCR
│       └── semantic-analyzer.ts  # Review semantic analysis
│
├── server.js                     # Custom Node server (voice + Next.js)
├── .env.local                    # Environment variables (not tracked)
└── package.json
```

---

## 🎯 Core Capabilities

### 1. Semantic Place Search
Find places by vibe, not just keywords:
```
User: "Find quiet coffee shops with power outlets"
→ Analyzes reviews with AI
→ Scores each place on "quiet" and "power outlets"
→ Shows evidence excerpts from reviews
```

### 2. Multi-Stop Trip Planning
Plan entire days with optimized routes:
```
User: "Plan my Saturday: brunch, museum, dinner"
→ Finds best places for each category
→ Optimizes stop order
→ Calculates routes with alternatives
→ Shows timeline with local times
```

### 3. Restaurant Intelligence
**Menu Extraction:**
```
User: "Show me the menu for Tartine"
→ OCR extracts menu from Google Photos
→ Structures into sections with prices
→ Displays swipeable carousel with images
```

**Dish Recommendations:**
```
User: "What's good at Tartine?"
→ Analyzes all reviews
→ Extracts must-try dishes, popular items
→ Provides insider tips from customers
```

### 4. Multi-Modal Navigation
Different travel modes per leg:
```
User: "Plan trip: walk to coffee, then transit to museum"
→ Walking route for leg 1
→ Transit route for leg 2 (shows bus/train details)
→ Alternative routes for each leg
```

---

## 🔧 Available Scripts

```bash
# Development server with hot reload
npm run dev

# Production build
npm run build

# Start production server
npm start

# Type checking
npm run type-check

# Linting
npm run lint
```

---

## ⚠️ Known Issues

### Voice Features Disabled
- **Issue:** Voice interface is non-functional due to insufficient OpenAI API credits
- **Impact:** Microphone button appears but voice transcription fails
- **Workaround:** Use text chat mode instead
- **Fix:** Add OpenAI credits and set `OPENAI_API_KEY` in `.env.local`

### TypeScript Build Warning
- **Issue:** Type mismatch in `check-booking-options.ts` tool
- **Impact:** None - tool functions correctly despite type error
- **Status:** Known issue, does not affect functionality

---

## 🌟 Example Queries

Try these to explore MapOps capabilities:

**Place Search:**
- "Find halal restaurants near me"
- "Quiet coffee shops with good wifi"
- "Best brunch spots open now"
- "Romantic dinner places with outdoor seating"

**Directions:**
- "Directions to Ferry Building by transit"
- "How do I bike to Golden Gate Park"
- "Walk me to the nearest Starbucks"

**Trip Planning:**
- "Plan my Saturday: coffee, shopping, lunch"
- "Create a day trip: brunch, hike, dinner"
- "Plan route from home: gym, work, groceries"

**Restaurant Discovery:**
- "What's good at Tartine?"
- "Show me the menu for Atlas Bites"
- "Can I make a reservation at State Bird?"
- "Tell me about the popular dishes at NOPA"

**Map Control:**
- "Navigate to Fisherman's Wharf"
- "Zoom to Union Square"
- "Clear the map"

---

## 🤝 Contributing

This project was built for YC Hackathon. Contributions, issues, and feature requests are welcome!

---

## 📄 License

MIT License - see LICENSE file for details

---

## 🙏 Acknowledgments

- Built with [Mastra](https://mastra.ai) AI framework
- Powered by [Google Maps Platform](https://mapsplatform.google.com)
- AI by [Anthropic Claude](https://anthropic.com) via [OpenRouter](https://openrouter.ai)
- Voice by [ElevenLabs](https://elevenlabs.io) (when enabled)
- MCP tools by [Tavily](https://tavily.com) and [Exa](https://exa.ai)

---

## 📞 Support

For questions or issues:
- Open an issue on GitHub
- Contact: [Your contact info]

---

**Built for YC Hackathon 2025** 🚀

MapOps - Talk to your city.
