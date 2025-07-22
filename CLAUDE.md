# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NotBrokker Property API is a Node.js/Express real estate analysis API that combines web scraping, property search, mortgage simulation, AI-powered financial analysis, and premium PDF report generation. The system uses Claude Sonnet 4 for intelligent financial analysis and Puppeteer for PDF generation.

**Current Version**: 2.2.0-pdf-premium

## Development Commands

### Essential Commands
```bash
# Start development server with auto-reload
npm run dev

# Start production server
npm start

# Test PDF generation system
npm run test-pdf

# Test complete system health
npm run test-complete
curl http://localhost:3000/test-complete-system
```

### Health Check Endpoints
```bash
# Basic health check
curl http://localhost:3000/health

# System information
curl http://localhost:3000/info

# Demo and examples
curl http://localhost:3000/demo

# PDF system health
curl http://localhost:3000/api/pdf/health
```

## Architecture Overview

### Modular Service Architecture
The API follows a modular monolithic pattern with clear separation of concerns:

```
src/
├── server.js                 # Main Express server with security middleware
├── config/                   # Environment validation and security configuration
├── controllers/              # Request handlers for each domain
├── middleware/               # Authentication, error handling, PDF processing
├── routes/                   # API route definitions (v1 & v2 compatibility)
├── services/                 # Core business logic modules
│   ├── anthropic/           # Claude AI integration and orchestration
│   ├── mortgage/            # CMF data and simulation logic
│   ├── pdf/                 # Puppeteer PDF generation
│   ├── scraping/            # MercadoLibre & Portal Inmobiliario extraction
│   └── search/              # Property search and filtering
└── utils/                   # Logging, error handling, examples
```

### Core Services Integration
- **ScrapingService**: Extracts property data from MercadoLibre and Portal Inmobiliario
- **SearchService**: Searches and filters comparable properties
- **MortgageService**: Integrates with CMF Chile for real mortgage data from 10+ banks
- **AnthropicService**: Orchestrates all services and generates AI-powered financial analysis
- **PDFGeneratorService**: Creates premium PDF reports using Puppeteer with professional templates

### API Versioning
- **API v2** (recommended): `/api/{service}/{action}` format
- **API v1** (compatibility): Legacy endpoints maintained for backward compatibility

## Key Configuration

### Environment Variables
```bash
# Required for AI analysis
ANTHROPIC_API_KEY=your_claude_api_key
CLAUDE_API_ENABLED=true

# Security
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
NODE_ENV=development|production

# Server
PORT=3000
```

### Docker Deployment
- Uses Playwright base image for browser automation
- Exposes port 10000 for Render deployment
- Includes Yarn for dependency management

## Testing and Validation

### Service Testing Flow
1. **Individual Service Health**: Each service has `/info` endpoint
2. **PDF System Validation**: Use `/api/pdf/validate-template` 
3. **Complete System Test**: `/test-complete-system` validates all services
4. **AI Analysis Test**: Use demo URLs with `/api/anthropic/financial-report`

### Example Property URLs for Testing
```
https://casa.mercadolibre.cl/MLC-2950253622-casa-en-venta-condominio-lomas-de-montemar-concon-_JM
https://casa.mercadolibre.cl/MLC-1614107669-vass-vende-casa-6d-3b-en-exclusivo-condominio-de-concon-_JM
```

## Working with the AI Analysis System

### Anthropic Service Orchestration
The `AnthropicService` is the main orchestrator that:
1. Validates property URLs
2. Coordinates scraping, search, and mortgage services
3. Prepares structured data for Claude AI
4. Generates comprehensive financial analysis
5. Returns data ready for PDF generation

### Key Integration Points
- **Financial Analysis Endpoint**: `/api/anthropic/financial-report`
- **PDF Generation Endpoint**: `/api/pdf/generate-report` 
- **Complete Workflow**: Analysis → PDF (90-120 seconds total)

## PDF Generation System

### Template System
- **Template**: NotBrokkerPremiumV4 professional design
- **Engine**: Puppeteer with high-quality rendering
- **Output**: 8-12 page comprehensive reports
- **Formats**: Multiple quality levels (low/medium/high)

### PDF Workflow
1. Receive analysis data from Anthropic service
2. Inject data into premium HTML template
3. Render with Puppeteer using desktop viewport
4. Optimize for print and digital viewing
5. Return downloadable PDF (2-5 MB typical size)

## Error Handling and Logging

### Centralized Error System
- **ErrorFactory**: Creates typed errors (validation, internal, external)
- **Global Error Middleware**: Consistent error responses
- **Security Headers**: Basic security configuration in `/config/security.js`

### Logging System
- **Winston Logger**: Structured logging with multiple levels
- **Request Logging**: All API calls logged with timing
- **Service Coordination**: Cross-service operation tracking

## Development Best Practices

### Code Organization
- Follow existing modular patterns in `/services/`
- Use centralized configuration in `/config/`
- Implement proper error handling with ErrorFactory
- Add logging for new operations

### Service Integration
- New services should follow the pattern in existing service directories
- Use Promise.allSettled for coordinating multiple async operations
- Implement proper timeout and retry logic for external APIs
- Add health check endpoints for new services

### API Development
- Maintain both v1 and v2 API compatibility
- Add new endpoints to `/routes/` modules
- Include comprehensive endpoint documentation in `/health` response
- Test with provided example URLs and data structures