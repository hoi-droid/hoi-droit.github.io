import { GoogleGenAI } from "@google/genai";
import { MockupConfig } from "../types";

const findImagePart = (resp: any) => {
  return resp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData);
};

export async function generateMockup(config: MockupConfig) {
  const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("CONFIG_ERROR: Gemini API key is not configured. Please select a valid paid API key.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const productContexts: Record<string, string> = {
    vinyl: "A highly realistic, professional studio photograph of a vinyl record cover leaning against a minimalist wall. The lighting is soft and natural, highlighting the texture of the cardboard sleeve.",
    book: "A high-end product shot of a hardcover book standing on a wooden desk. The cover design is clearly visible, with realistic paper texture and subtle shadows.",
    poster: "A professional interior design photograph of a large framed poster hanging on a clean, modern gallery wall. The frame is simple and elegant.",
    magazine: "A realistic top-down photograph of a premium magazine lying open on a marble coffee table. The pages have a slight glossy sheen.",
    packaging: "A clean, commercial product photograph of a premium cardboard box packaging. The structure is sharp, with realistic folds and matte finish."
  };

  const fullPrompt = `${productContexts[config.productType] || ''} The design on the ${config.productType} should be: ${config.prompt}. Ensure the final image looks like a real physical object, not a digital render.`;

  const parts: any[] = [{ text: fullPrompt }];
  
  if (config.referenceImage) {
    parts.push({
      inlineData: {
        data: config.referenceImage.split(',')[1],
        mimeType: "image/png"
      }
    });
    parts.push({ text: "Use the provided image as the primary design reference for the mockup." });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: config.aspectRatio || "1:1"
        }
      },
    });

    const imagePart = findImagePart(response);
    if (imagePart) {
      return `data:image/png;base64,${imagePart.inlineData.data}`;
    }
    
    if (response?.candidates?.[0]?.content?.parts) {
      const textPart = response.candidates[0].content.parts.find((p: any) => p.text);
      if (textPart) {
        throw new Error(`MODEL_REFUSAL: ${textPart.text}`);
      }
    }

    throw new Error("GENERATION_ERROR: No image generated from model. This may be due to safety filters or a temporary issue.");
  } catch (error: any) {
    console.error("Gemini generation failed:", error);
    throw error;
  }
}

export async function editMockup(base64Image: string, editPrompt: string) {
  const apiKey = (process.env as any).API_KEY || (process.env as any).GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("CONFIG_ERROR: Gemini API key is not configured. Please select a valid paid API key.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const editParts = [
    {
      inlineData: {
        data: base64Image.split(',')[1],
        mimeType: "image/png"
      }
    },
    {
      text: `Edit this mockup image based on the following instruction: ${editPrompt}. Maintain the same product type and overall composition, but apply the requested changes realistically.`
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: { parts: editParts }
    });

    const imagePart = findImagePart(response);
    if (imagePart) {
      return `data:image/png;base64,${imagePart.inlineData.data}`;
    }
    
    if (response?.candidates?.[0]?.content?.parts) {
      const textPart = response.candidates[0].content.parts.find((p: any) => p.text);
      if (textPart) {
        throw new Error(`MODEL_REFUSAL: ${textPart.text}`);
      }
    }

    throw new Error("EDIT_ERROR: Failed to edit image. The model may have refused the request.");
  } catch (error: any) {
    console.error("Gemini edit failed:", error);
    throw error;
  }
}
