// src/services/anthropic/AnthropicConfig.js
/**
 * Configuración del servicio Anthropic con API Key Real
 */

const AnthropicConfig = {
    // Configuración de la API de Claude - ACTUALIZADA CON API KEY REAL
    claude: {
        apiKey: process.env.ANTHROPIC_API_KEY,
        baseURL: 'https://api.anthropic.com',
        model: 'claude-sonnet-4-20250514', // ✅ CAMBIADO A SONNET
        maxTokens: 8192,
        temperature: 1, // ✅ ACTUALIZADO según tu imagen (era 0.2)
        timeout: 240000,
        retries: 3,
        retryDelay: 2000
    },

    // Configuración del servicio
    service: {
        version: '1.0.0',
        name: 'Análisis Financiero Inmobiliario con Claude',
        maxRequestsPerHour: 10,
        defaultCacheTime: 3600000, // 1 hora en ms
        confidenceLevels: ['low', 'medium', 'high'],
        supportedRegions: ['Chile'],
        enableRealAPI: true // NUEVO: Flag para usar API real
    },

    // Configuración de orquestación - ACTUALIZADA
    orchestration: {
        maxRetries: 3,
        timeoutBetweenRetries: 2000,
        parallelProcessing: true,
        failureHandling: 'partial', // 'strict' | 'partial'

        // Timeouts específicos por servicio
        serviceTimeouts: {
            scraping: 45000,   // 45 segundos (aumentado)
            search: 60000,     // 60 segundos (aumentado)
            mortgage: 90000,   // 90 segundos (aumentado)
            claude: 90000      // 90 segundos para análisis real
        }
    },

    // Configuración de datos por defecto
    defaults: {
        searchOptions: {
            maxPaginas: 2,
            maxComparables: 15, // Reducido para eficiencia
            marketRadius: '2km'
        },

        mortgageScenarios: [
            { plazo: 15, etiqueta: '15 años (pago rápido)' },
            { plazo: 20, etiqueta: '20 años (equilibrio)' },
            { plazo: 30, etiqueta: '30 años (cuota menor)' }
        ],

        analysisOptions: {
            includeLocationAnalysis: true,
            includeSecurityAnalysis: true,
            includeFinancialMetrics: true,
            includeRiskAssessment: true,
            confidenceLevel: 'high'
        }
    },

    // Configuración de métricas financieras
    financialMetrics: {
        // Rangos para clasificación de yields
        yieldRanges: {
            excellent: { min: 8.0, max: Infinity, label: 'Excelente' },
            good: { min: 6.0, max: 7.99, label: 'Bueno' },
            fair: { min: 4.0, max: 5.99, label: 'Regular' },
            poor: { min: 0, max: 3.99, label: 'Bajo' }
        },

        // Factores para análisis de riesgo
        riskFactors: {
            location: {
                premium: ['Las Condes', 'Providencia', 'Vitacura', 'Lo Barnechea', 'Ñuñoa'],
                good: ['La Reina', 'Peñalolén', 'Macul', 'Santiago Centro'],
                moderate: ['Independencia', 'Recoleta', 'Quinta Normal', 'Conchalí'],
                high: ['La Pintana', 'San Ramón', 'El Bosque', 'Pedro Aguirre Cerda']
            },

            propertyTypes: {
                low_risk: ['Casa', 'Departamento'],
                medium_risk: ['Townhouse', 'Duplex'],
                high_risk: ['Loft', 'Comercial', 'Mixto']
            }
        },

        // Valores por defecto para cálculos chilenos
        defaultValues: {
            rentYield: 6.0,        // % anual promedio Chile
            appreciation: 3.0,     // % anual promedio Chile
            operatingExpenses: 0.20, // 20% de ingresos brutos (más realista)
            vacancyRate: 0.08,     // 8% anual (realista Chile)
            managementFee: 0.10,   // 10% de ingresos brutos
            transactionCosts: 0.03, // 3% costos de transacción
            maintenanceCosts: 0.02  // 2% anual del valor propiedad
        }
    },

    // Prompts optimizados para Claude 3.5 Sonnet
    claudePrompts: {
        systemPrompt: `Eres un experto analista financiero inmobiliario especializado en el mercado chileno. 
Tu experiencia incluye:
- Evaluación de inversiones inmobiliarias en Chile
- Análisis de mercado y tendencias regionales
- Cálculo de métricas financieras (CAP Rate, Yield, ROI, TIR)
- Evaluación de riesgos de inversión
- Análisis de ubicación y factores socioeconómicos

Siempre proporciona análisis equilibrados, considerando tanto oportunidades como riesgos.
Usa datos objetivos y proporciona recomendaciones específicas y accionables.
Enfócate en el contexto del mercado chileno y las particularidades locales.`,

        analysisPrompt: `Analiza la siguiente información inmobiliaria del mercado chileno y genera un análisis financiero completo y detallado.

DATOS DE ENTRADA:
{input_data}

INSTRUCCIONES ESPECÍFICAS:
1. Evalúa la viabilidad de la inversión considerando el mercado chileno
2. Calcula e interpreta métricas financieras clave (CAP Rate, Yield Bruto/Neto, ROI)
3. Analiza el contexto de mercado y ubicación específica
4. Identifica riesgos y oportunidades específicos
5. Proporciona recomendaciones concretas y accionables
6. Considera factores macroeconómicos de Chile (UF, inflación, tasas)

ESTRUCTURA DE RESPUESTA REQUERIDA (JSON):
{
  "executiveSummary": {
    "recommendation": "PROCEDER|EVALUAR|RECHAZAR",
    "confidence": "Alta|Media|Baja",
    "keyPoints": ["punto1", "punto2", "punto3"]
  },
  "financialMetrics": {
    "yieldBruto": número,
    "yieldNeto": número,
    "capRate": número,
    "roi": número,
    "paybackPeriod": número,
    "flujoCajaMensual": número
  },
  "locationAnalysis": {
    "overallScore": número_del_1_al_10,
    "securityScore": número_del_1_al_10,
    "accessibilityScore": número_del_1_al_10,
    "servicesScore": número_del_1_al_10,
    "growthPotential": "Alto|Medio|Bajo"
  },
  "riskAssessment": {
    "overall": "Bajo|Medio|Alto",
    "factors": {
      "market": "Bajo|Medio|Alto",
      "location": "Bajo|Medio|Alto",
      "financial": "Bajo|Medio|Alto",
      "liquidity": "Bajo|Medio|Alto"
    },
    "riskDescription": "descripción_detallada"
  },
  "marketComparison": {
    "priceComparison": "Sobre valorado|Competitivo|Subvalorado",
    "marketPosition": "Premium|Medio|Económico",
    "trendAnalysis": "descripción_tendencias"
  },
  "recommendations": {
    "mainRecommendation": "recomendación_principal",
    "actionItems": ["acción1", "acción2", "acción3"],
    "considerations": ["consideración1", "consideración2"]
  }
}

Responde ÚNICAMENTE con el JSON estructurado, sin texto adicional.`,

        locationPrompt: `Analiza la ubicación específica de esta propiedad en Chile:

DATOS DE UBICACIÓN: {location_data}

Evalúa considerando:
- Seguridad de la zona y estadísticas de criminalidad
- Accesibilidad y transporte público
- Servicios cercanos (educación, salud, comercio)
- Calidad de vida y áreas de recreación
- Proyecciones de desarrollo urbano
- Plusvalía histórica de la zona

Responde en formato JSON con scores del 1 al 10.`,

        riskPrompt: `Evalúa los riesgos específicos de esta inversión inmobiliaria en Chile:

DATOS PARA EVALUACIÓN: {risk_data}

Considera:
- Riesgos de mercado (burbujas, recesión)
- Riesgos de ubicación (deterioro, desarrollo urbano)
- Riesgos financieros (tasas de interés, inflación UF)
- Riesgos regulatorios (cambios legales, tributarios)
- Riesgos naturales (sismos, tsunamis, inundaciones)
- Riesgos de liquidez (facilidad de venta/arriendo)

Proporciona evaluación detallada con mitigaciones sugeridas.`
    },

    // Configuración de cache
    cache: {
        enabled: true,
        defaultTTL: 3600, // 1 hora

        // TTL específico por tipo de dato
        ttlByType: {
            propertyData: 1800,      // 30 minutos
            comparables: 3600,       // 1 hora
            mortgageRates: 7200,     // 2 horas
            locationAnalysis: 86400, // 24 horas
            marketTrends: 43200,     // 12 horas
            claudeAnalysis: 7200     // 2 horas (análisis IA)
        }
    },

    // Configuración de logging
    logging: {
        level: process.env.LOG_LEVEL || 'info',
        enablePerformanceMetrics: true,
        enableDebugMode: process.env.NODE_ENV === 'development',

        // Eventos específicos a loggear
        events: {
            orchestrationStart: true,
            serviceCall: true,
            serviceComplete: true,
            claudeAnalysis: true,
            claudeApiCall: true, // NUEVO
            reportGeneration: true,
            errorHandling: true
        }
    },

    // Configuración de validación
    validation: {
        // URLs soportadas
        supportedDomains: [
            'casa.mercadolibre.cl',
            'mercadolibre.cl',
            'portalinmobiliario.com',
            'www.portalinmobiliario.com'
        ],

        // Rangos válidos para parámetros
        ranges: {
            propertyPrice: { min: 100, max: 50000 }, // UF
            mortgage: {
                plazo: { min: 5, max: 40 },    // años
                monto: { min: 100, max: 20000 } // UF
            },
            yield: { min: 0, max: 25 },  // %
            score: { min: 1, max: 10 }   // scores de ubicación
        }
    },

    // Agregar/actualizar en AnthropicConfig.js - sección errorHandling

    // NUEVA: Configuración de error handling para API real - EXPANDIDA
    errorHandling: {
        claudeApiErrors: {
            400: 'Solicitud malformada - verificar formato de datos',
            401: 'API Key inválida o expirada - verificar ANTHROPIC_API_KEY',
            403: 'Acceso denegado - verificar permisos de API Key',
            404: 'Endpoint no encontrado - verificar configuración de modelo',
            429: 'Rate limit excedido - reducir frecuencia de requests',
            500: 'Error interno de Anthropic - reintentar más tarde',
            502: 'Bad Gateway - problema temporal de conectividad',
            503: 'Servicio temporalmente no disponible - reintentar en unos minutos',
            504: 'Gateway timeout - aumentar timeout o reintentar'
        },
        retryStatuses: [429, 500, 502, 503, 504],
        maxRetries: 3,
        backoffMultiplier: 2,
        timeoutRetries: 2,
        fallbackEnabled: true,

        // Configuración de circuit breaker
        circuitBreaker: {
            enabled: false, // Deshabilitar por ahora
            failureThreshold: 5,
            resetTimeout: 300000 // 5 minutos
        }
    },

    // NUEVA: Configuración de monitoreo y métricas
    monitoring: {
        enabled: true,
        logAllRequests: process.env.NODE_ENV === 'development',
        logSlowRequests: true,
        slowRequestThreshold: 30000, // 30 segundos
        trackTokenUsage: true,
        trackErrorRates: true
    }
};

module.exports = AnthropicConfig;