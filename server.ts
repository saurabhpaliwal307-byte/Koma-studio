import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function parseDataUrl(dataUrl?: string): { mimeType: string; data: string } | null {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  app.get('/api/ai/status', (_req, res) => {
    const client = getGeminiClient();
    res.json({
      available: Boolean(client),
      model: 'gemini-4-hydrogen',
      message: client
        ? 'Gemini AI assistant ready'
        : 'AI backend unavailable: GEMINI_API_KEY is not configured in Secrets.',
    });
  });

  app.post('/api/ai/assist', async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'AI backend is not configured. Add GEMINI_API_KEY in Settings > Secrets to enable AI-assisted tools.',
      });
      return;
    }

    const { task, payload } = req.body as {
      task: 'inbetween' | 'smart-color' | 'line-art' | 'consistency' | 'timing';
      payload: Record<string, unknown>;
    };

    try {
      if (task === 'inbetween') {
        const startImg = parseDataUrl(payload.startImageDataUrl as string);
        const endImg = parseDataUrl(payload.endImageDataUrl as string);
        const count = Math.min(4, Math.max(1, Number(payload.count || 1)));
        const width = Number(payload.width || 1280);
        const height = Number(payload.height || 720);

        const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
        if (startImg) parts.push({ inlineData: startImg });
        if (endImg) parts.push({ inlineData: endImg });
        parts.push({
          text: `You are a professional 2D anime keyframe assistant.
Analyze the start frame (image 1) and end frame (image 2) on a ${width}x${height} canvas.
Generate ${count} intermediate breakdown/in-between frame(s) as clean vector stroke paths (coordinates within 0..${width} and 0..${height}).
Each frame should interpolate silhouette, arc of motion, and squash-and-stretch naturally.`,
        });

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                frames: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      strokes: {
                        type: Type.ARRAY,
                        items: {
                          type: Type.OBJECT,
                          properties: {
                            color: { type: Type.STRING },
                            size: { type: Type.NUMBER },
                            points: {
                              type: Type.ARRAY,
                              items: {
                                type: Type.OBJECT,
                                properties: {
                                  x: { type: Type.NUMBER },
                                  y: { type: Type.NUMBER },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        });

        res.json(JSON.parse(response.text || '{}'));
        return;
      }

      if (task === 'smart-color') {
        const img = parseDataUrl(payload.frameImageDataUrl as string);
        const palette = Array.isArray(payload.palette) ? payload.palette : [];
        const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
        if (img) parts.push({ inlineData: img });
        parts.push({
          text: `Inspect this 2D animation cel frame. Current project palette: ${palette.join(', ')}.
Identify enclosed or uncolored regions, suggest harmonious cel-shading hex colors, and list actionable flat-coloring notes.`,
        });

        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                suggestedColors: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      region: { type: Type.STRING },
                      hex: { type: Type.STRING },
                      shadowHex: { type: Type.STRING },
                    },
                  },
                },
                uncoloredWarnings: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
            },
          },
        });
        res.json(JSON.parse(response.text || '{}'));
        return;
      }

      if (task === 'line-art') {
        const img = parseDataUrl(payload.frameImageDataUrl as string);
        const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
        if (img) parts.push({ inlineData: img });
        parts.push({
          text: `You are a clean-up animation supervisor. Inspect this drawing for broken lines, inconsistent line weights, or rough sketch clutter, and propose concise clean-up recommendations and recommended stabilization setting (0-10).`,
        });
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                recommendedStabilization: { type: Type.NUMBER },
                issues: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        });
        res.json(JSON.parse(response.text || '{}'));
        return;
      }

      if (task === 'consistency') {
        const frameImg = parseDataUrl(payload.frameImageDataUrl as string);
        const refImg = parseDataUrl(payload.referenceImageDataUrl as string);
        const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [];
        if (frameImg) parts.push({ inlineData: frameImg });
        if (refImg) parts.push({ inlineData: refImg });
        parts.push({
          text: `Compare the animation frame (image 1) against the character reference sheet (image 2). Flag any off-model proportion, silhouette, costume, or palette differences.`,
        });
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                differences: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        });
        res.json(JSON.parse(response.text || '{}'));
        return;
      }

      if (task === 'timing') {
        const response = await ai.models.generateContent({
          model: 'gemini-4-hydrogen',
          contents: `You are a senior 2D animation director. Review this exposure sheet & timeline metadata and suggest concrete timing improvements, holds, duplicate frame cleanup, or easing curves:\n${JSON.stringify(payload)}`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
            },
          },
        });
        res.json(JSON.parse(response.text || '{}'));
        return;
      }

      res.status(400).json({ error: 'Unknown AI assistant task' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Gemini request failed';
      res.status(500).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Koma Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
