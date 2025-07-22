// src/config/PromptManager.js
const fs = require('fs');
const path = require('path');
const { logInfo, logError, logWarn } = require('../utils/logger');

/**
 * Gestor centralizado de prompts para el sistema
 * Permite cargar y gestionar prompts desde archivos de configuración
 */
class PromptManager {
    static prompts = null;
    static lastLoaded = null;

    /**
     * Cargar prompts desde archivo de configuración
     */
    static loadPrompts() {
        try {
            const promptsPath = path.join(__dirname, 'prompts.json');
            
            if (!fs.existsSync(promptsPath)) {
                throw new Error(`Archivo de prompts no encontrado: ${promptsPath}`);
            }

            const promptsData = fs.readFileSync(promptsPath, 'utf8');
            this.prompts = JSON.parse(promptsData);
            this.lastLoaded = new Date().toISOString();

            logInfo('✅ Prompts cargados exitosamente', {
                promptsPath,
                promptsCount: Object.keys(this.prompts.prompts).length,
                lastLoaded: this.lastLoaded
            });

            return this.prompts;

        } catch (error) {
            logError('❌ Error cargando prompts', {
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Obtener un prompt específico por tipo
     */
    static getPrompt(promptType) {
        if (!this.prompts) {
            this.loadPrompts();
        }

        const prompt = this.prompts?.prompts?.[promptType];
        
        if (!prompt) {
            logWarn('⚠️ Prompt no encontrado', { 
                promptType, 
                availablePrompts: Object.keys(this.prompts?.prompts || {}) 
            });
            return null;
        }

        return prompt;
    }

    /**
     * Construir prompt completo para análisis financiero
     */
    static buildFinancialAnalysisPrompt(contextData, ubicacion = 'Chile') {
        const prompt = this.getPrompt('financial_analysis');
        
        if (!prompt) {
            throw new Error('Prompt de análisis financiero no disponible');
        }

        // Construir el prompt completo
        let fullPrompt = prompt.main_prompt;
        
        // Reemplazar variables
        fullPrompt = fullPrompt.replace('{contextData}', JSON.stringify(contextData, null, 2));
        
        // Agregar estructura JSON
        fullPrompt += '\n\nESTRUCTURA JSON REQUERIDA (responde SOLO con este JSON, sin texto adicional):\n\n';
        fullPrompt += JSON.stringify(prompt.json_structure, null, 2);
        
        // Agregar inferencia de ubicación
        fullPrompt += '\n\n' + prompt.location_inference.replace('{ubicacion}', ubicacion);
        
        // Agregar instrucción final
        fullPrompt += '\n\n' + prompt.final_instruction;

        return fullPrompt;
    }

    /**
     * Obtener system prompt para un tipo específico
     */
    static getSystemPrompt(promptType) {
        const prompt = this.getPrompt(promptType);
        return prompt?.system_prompt || 'Eres un asistente experto.';
    }

    /**
     * Validar que todos los prompts requeridos están disponibles
     */
    static validatePrompts() {
        const requiredPrompts = ['financial_analysis'];
        const issues = [];

        for (const promptType of requiredPrompts) {
            const prompt = this.getPrompt(promptType);
            if (!prompt) {
                issues.push(`Prompt faltante: ${promptType}`);
            } else {
                // Validar estructura del prompt
                if (!prompt.main_prompt || !prompt.system_prompt) {
                    issues.push(`Prompt incompleto: ${promptType}`);
                }
            }
        }

        if (issues.length > 0) {
            logWarn('⚠️ Problemas en validación de prompts', { issues });
            return { valid: false, issues };
        }

        logInfo('✅ Validación de prompts exitosa');
        return { valid: true, issues: [] };
    }

    /**
     * Recargar prompts desde archivo (útil para desarrollo)
     */
    static reloadPrompts() {
        this.prompts = null;
        return this.loadPrompts();
    }

    /**
     * Obtener información de debug
     */
    static getDebugInfo() {
        return {
            loaded: !!this.prompts,
            lastLoaded: this.lastLoaded,
            promptsAvailable: this.prompts ? Object.keys(this.prompts.prompts) : [],
            promptsCount: this.prompts ? Object.keys(this.prompts.prompts).length : 0
        };
    }
}

module.exports = PromptManager;