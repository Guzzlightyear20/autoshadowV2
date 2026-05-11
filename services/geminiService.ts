/// <reference types="vite/client" />
import { GoogleGenAI } from "@google/genai";
import { AspectRatio, ImageSize } from "../types";

/**
 * When VITE_USE_PROXY=true the frontend calls the Express proxy server at /api/gemini/*
 * and the API key stays server-side only.
 *
 * When VITE_USE_PROXY is not set (AI Studio deployment) the SDK calls Gemini directly
 * using the key from process.env.API_KEY — existing behavior preserved.
 */
const USE_PROXY = import.meta.env.VITE_USE_PROXY === 'true';

// --- Proxy helpers -------------------------------------------------------

async function proxyPost<T>(endpoint: string, body: object): Promise<T> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? `Error HTTP ${res.status} en ${endpoint}`);
  }
  return res.json() as Promise<T>;
}

// --- Service functions ---------------------------------------------------

/**
 * Edit an image (shadows, background removal).
 * Proxy: POST /api/gemini/edit
 * Direct: gemini-2.5-flash-image
 */
export const editCarImage = async (
  base64Image: string,
  prompt: string,
  mimeType: string = "image/jpeg"
): Promise<string> => {
  if (USE_PROXY) {
    const { imageData } = await proxyPost<{ imageData: string }>(
      '/api/gemini/edit',
      { base64Image, prompt, mimeType }
    );
    return `data:image/png;base64,${imageData}`;
  }

  // Direct call — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        { text: prompt },
      ],
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated in response.");
};

/**
 * Compose a vehicle onto a background template.
 * Proxy: POST /api/gemini/compose
 * Direct: gemini-3.1-flash-image-preview
 */
export const composeCarWithBackground = async (
  carImageBase64: string,
  carImageMimeType: string,
  templateImageBase64: string,
  templateImageMimeType: string,
  prompt: string
): Promise<string> => {
  if (USE_PROXY) {
    const { imageData } = await proxyPost<{ imageData: string }>(
      '/api/gemini/compose',
      { carImageBase64, carImageMimeType, templateImageBase64, templateImageMimeType, prompt }
    );
    return `data:image/png;base64,${imageData}`;
  }

  // Direct call — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: {
      parts: [
        { text: 'IMAGE 1 (SOURCE VEHICLE):' },
        { inlineData: { mimeType: carImageMimeType, data: carImageBase64 } },
        { text: 'IMAGE 2 (BACKGROUND TEMPLATE):' },
        { inlineData: { mimeType: templateImageMimeType, data: templateImageBase64 } },
        { text: prompt },
      ],
    },
    config: {
      imageConfig: { imageSize: '2K' },
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No se pudo generar la imagen compuesta.");
};

/**
 * Generate a new vehicle image from a text prompt.
 * Proxy: POST /api/gemini/generate
 * Direct: gemini-3.1-flash-image-preview
 */
export const generateCarImage = async (
  prompt: string,
  aspectRatio: AspectRatio,
  imageSize: ImageSize
): Promise<string> => {
  if (USE_PROXY) {
    const { imageData } = await proxyPost<{ imageData: string }>(
      '/api/gemini/generate',
      { prompt, aspectRatio, imageSize }
    );
    return `data:image/png;base64,${imageData}`;
  }

  // Direct call — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-image-preview',
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { aspectRatio, imageSize },
    },
  });

  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  throw new Error("No image generated.");
};

/**
 * Analyze a vehicle image and return structured text.
 * Proxy: POST /api/gemini/analyze
 * Direct: gemini-3.1-pro-preview
 */
export const analyzeCarImage = async (
  base64Image: string,
  prompt: string,
  mimeType: string = "image/jpeg"
): Promise<string> => {
  if (USE_PROXY) {
    const { text } = await proxyPost<{ text: string }>(
      '/api/gemini/analyze',
      { base64Image, prompt, mimeType }
    );
    return text;
  }

  // Direct call — AI Studio / non-proxy mode
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-pro-preview',
    contents: {
      parts: [
        { inlineData: { mimeType, data: base64Image } },
        { text: prompt },
      ],
    },
  });

  return response.text ?? "No se pudo generar el análisis.";
};
