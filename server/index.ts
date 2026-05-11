import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local from project root
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const app = express();
const PORT = process.env.SERVER_PORT || 3001;

app.use(cors({ origin: ['http://localhost:3000', 'http://127.0.0.1:3000'] }));
// Base64 images can be large — allow up to 100 MB per request
app.use(express.json({ limit: '100mb' }));

const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY no está configurada en el servidor.');
  return new GoogleGenAI({ apiKey });
};

// Extract the first image part from a Gemini response
const extractImageData = (response: Awaited<ReturnType<ReturnType<typeof getAI>['models']['generateContent']>>) => {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) return part.inlineData.data;
  }
  return null;
};

// Health check — frontend uses this to detect proxy availability
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', hasKey: !!process.env.GEMINI_API_KEY });
});

// Shadow / background-removal edits
app.post('/api/gemini/edit', async (req, res) => {
  try {
    const { base64Image, prompt, mimeType = 'image/jpeg' } = req.body;
    if (!base64Image || !prompt) {
      return res.status(400).json({ error: 'base64Image y prompt son requeridos.' });
    }

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt },
        ],
      },
    });

    const imageData = extractImageData(response);
    if (!imageData) return res.status(500).json({ error: 'No se generó imagen en la respuesta.' });

    res.json({ imageData });
  } catch (error: any) {
    console.error('[POST /api/gemini/edit]', error?.message);
    res.status(500).json({ error: error?.message ?? 'Error interno del servidor.' });
  }
});

// Vehicle + background composition
app.post('/api/gemini/compose', async (req, res) => {
  try {
    const { carImageBase64, carImageMimeType, templateImageBase64, templateImageMimeType, prompt } = req.body;
    if (!carImageBase64 || !templateImageBase64 || !prompt) {
      return res.status(400).json({ error: 'Se requieren ambas imágenes y el prompt.' });
    }

    const ai = getAI();
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

    const imageData = extractImageData(response);
    if (!imageData) return res.status(500).json({ error: 'No se generó imagen en la respuesta.' });

    res.json({ imageData });
  } catch (error: any) {
    console.error('[POST /api/gemini/compose]', error?.message);
    res.status(500).json({ error: error?.message ?? 'Error interno del servidor.' });
  }
});

// Text-to-image vehicle generation
app.post('/api/gemini/generate', async (req, res) => {
  try {
    const { prompt, aspectRatio, imageSize } = req.body;
    if (!prompt) return res.status(400).json({ error: 'El prompt es requerido.' });

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: { parts: [{ text: prompt }] },
      config: {
        imageConfig: { aspectRatio, imageSize },
      },
    });

    const imageData = extractImageData(response);
    if (!imageData) return res.status(500).json({ error: 'No se generó imagen en la respuesta.' });

    res.json({ imageData });
  } catch (error: any) {
    console.error('[POST /api/gemini/generate]', error?.message);
    res.status(500).json({ error: error?.message ?? 'Error interno del servidor.' });
  }
});

// Vehicle image analysis
app.post('/api/gemini/analyze', async (req, res) => {
  try {
    const { base64Image, prompt, mimeType = 'image/jpeg' } = req.body;
    if (!base64Image || !prompt) {
      return res.status(400).json({ error: 'base64Image y prompt son requeridos.' });
    }

    const ai = getAI();
    const response = await ai.models.generateContent({
      model: 'gemini-3.1-pro-preview',
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt },
        ],
      },
    });

    res.json({ text: response.text ?? 'No se pudo generar el análisis.' });
  } catch (error: any) {
    console.error('[POST /api/gemini/analyze]', error?.message);
    res.status(500).json({ error: error?.message ?? 'Error interno del servidor.' });
  }
});

app.listen(PORT, () => {
  console.log('\n🚗  AutoShadow AI — Proxy Server');
  console.log(`   URL:     http://localhost:${PORT}`);
  console.log(`   API Key: ${process.env.GEMINI_API_KEY ? '✓ cargada' : '✗ FALTANTE — revisa .env.local'}\n`);
});
