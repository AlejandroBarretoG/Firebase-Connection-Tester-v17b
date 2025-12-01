import { GoogleGenAI } from "@google/genai";

// 1x1 Red Pixel Base64 for Vision Test
const SAMPLE_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export interface TestResult {
  success: boolean;
  message: string;
  data?: any;
}

const getAIClient = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("API Key es requerida.");
  }
  return new GoogleGenAI({ apiKey });
};

export const runGeminiTests = {
  /**
   * 1. Auth & Connection Test
   * Verifies if the client can be instantiated and checks connectivity.
   */
  connect: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      // We perform a very cheap call to verify the key.
      const response = await ai.models.generateContent({
        model: modelId,
        contents: 'ping',
      });
      
      if (response && response.text) {
        return { success: true, message: `Conexión exitosa con ${modelId}.`, data: { reply: response.text } };
      } else {
        throw new Error("Respuesta vacía del servidor.");
      }
    } catch (error: any) {
      return { success: false, message: error.message || "Error de conexión" };
    }
  },

  /**
   * 2. Text Generation Test
   * Tests standard text generation capabilities.
   */
  generateText: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const prompt = "Responde con una sola palabra: 'Funciona'";
      
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
      });

      const text = response.text;
      return { success: true, message: "Generación de texto correcta.", data: { model: modelId, prompt, output: text } };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 3. Streaming Test
   * Tests the streaming capability of the API.
   */
  streamText: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const prompt = "Escribe los números del 1 al 5 separados por comas.";
      
      const responseStream = await ai.models.generateContentStream({
        model: modelId,
        contents: prompt,
      });

      let fullText = "";
      let chunkCount = 0;
      
      for await (const chunk of responseStream) {
        fullText += chunk.text;
        chunkCount++;
      }

      return { 
        success: true, 
        message: `Streaming completado en ${chunkCount} fragmentos.`, 
        data: { model: modelId, fullText, chunkCount } 
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 4. Token Count Test
   * Verifies the token counting endpoint.
   */
  countTokens: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const prompt = "Why is the sky blue?";
      
      const response = await ai.models.countTokens({
        model: modelId,
        contents: prompt,
      });

      return { 
        success: true, 
        message: "Conteo de tokens exitoso.", 
        data: { model: modelId, prompt, totalTokens: response.totalTokens } 
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 5. Vision (Multimodal) Test
   * Tests sending an image along with text.
   */
  vision: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      
      // Note: Some models like Flash Lite might have limitations on vision, 
      // but generally standard Flash and Pro support it.
      const response = await ai.models.generateContent({
        model: modelId,
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/png', data: SAMPLE_IMAGE_BASE64 } },
            { text: "Describe esta imagen en 5 palabras o menos. (Es un pixel rojo)" }
          ]
        }
      });

      return { 
        success: true, 
        message: "Análisis de visión completado.", 
        data: { model: modelId, output: response.text } 
      };
    } catch (error: any) {
      return { success: false, message: `Error en visión (${modelId}): ${error.message}` };
    }
  },

  /**
   * 6. System Instruction Test
   * Tests if the model respects system instructions.
   */
  systemInstruction: async (apiKey: string, modelId: string = 'gemini-2.5-flash'): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const instruction = "Eres un gato. Responde solo con 'Miau'.";
      const prompt = "Hola, ¿cómo estás?";
      
      const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        config: {
          systemInstruction: instruction
        }
      });
      
      const text = response.text || "";
      const isCorrect = text.toLowerCase().includes("miau");
      
      return {
        success: isCorrect,
        message: isCorrect ? "Instrucción del sistema respetada." : "El modelo no siguió la instrucción del sistema estrictamente.",
        data: { model: modelId, instruction, prompt, output: text }
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  },

  /**
   * 7. Embedding Test
   * Tests generating embeddings for text.
   * Note: Always uses 'text-embedding-004' as generation models typically don't support embedContent.
   */
  embedding: async (apiKey: string): Promise<TestResult> => {
    try {
      const ai = getAIClient(apiKey);
      const text = "Prueba de embedding";
      const model = "text-embedding-004"; 
      
      // Use explicit parts structure for robustness
      const response = await ai.models.embedContent({
        model: model,
        contents: [{ parts: [{ text: text }] }]
      });

      // CAMBIO: Detectar si la respuesta viene en 'embedding' (singular) o 'embeddings' (plural)
      // El SDK nuevo a veces devuelve un array incluso para peticiones individuales.
      const values = response.embeddings?.[0]?.values;

      if (values) {
        return {
          success: true,
          message: `Vector generado correctamente.\nDimensiones: ${values.length}\nMuestra: [${values.slice(0, 3).join(', ')}...]`,
          data: { model, vectorLength: values.length }
        };
      } else {
        console.warn("Embedding response missing values:", response);
        return {
            success: false,
            message: `Fallo: Respuesta vacía o malformada.\nRespuesta Cruda: ${JSON.stringify(response, null, 2)}` 
        };
      }
      
    } catch (error: any) {
        // CAMBIO: Mostrar detalles completos del error
        console.error("Error Embeddings Catch:", error);
        return {
            success: false,
            message: `Excepción en Embeddings: ${error.message || error}\n${JSON.stringify(error, null, 2)}`
        };
    }
  }
};
