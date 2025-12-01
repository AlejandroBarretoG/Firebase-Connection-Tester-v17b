
export interface VertexTestResult {
  success: boolean;
  message: string;
  data?: any;
}

export const runVertexTests = {
  /**
   * 1. Connectivity Test (List Models)
   * Tries to fetch the list of models to verify Project ID, Location, and Token.
   */
  connect: async (project: string, location: string, token: string): Promise<VertexTestResult> => {
    try {
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) errorMsg = `${errorData.error.code} - ${errorData.error.message}`;
        } catch (e) { /* ignore json parse error */ }
        throw new Error(errorMsg);
      }

      const data = await response.json();
      return { 
        success: true, 
        message: "Conexión autorizada correctamente.", 
        data: { modelsFound: data.models?.length || 0, sample: data.models?.[0]?.name || 'N/A' } 
      };
    } catch (error: any) {
      let msg = error.message;
      if (msg.includes("Failed to fetch")) {
        msg = "Error de Red / CORS. Asegúrate de que el token es válido. Nota: Las llamadas directas desde navegador a Vertex pueden ser bloqueadas por CORS en algunas configuraciones.";
      }
      return { success: false, message: msg };
    }
  },

  /**
   * 2. Prediction Test (Generate Content)
   * Uses Gemini 1.5 Flash on Vertex to generate text.
   */
  generate: async (project: string, location: string, token: string, modelId: string = 'gemini-1.5-flash-001'): Promise<VertexTestResult> => {
    try {
      const url = `https://${location}-aiplatform.googleapis.com/v1/projects/${project}/locations/${location}/publishers/google/models/${modelId}:generateContent`;
      
      const payload = {
        contents: {
          role: "user",
          parts: [{ text: "Responde solo con la palabra: VERTEX_OK" }]
        },
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 10
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} Error en generación`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (text) {
        return { 
          success: true, 
          message: "Inferencia ejecutada exitosamente.", 
          data: { output: text, model: modelId } 
        };
      } else {
        throw new Error("La respuesta no contiene texto válido.");
      }

    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
};
