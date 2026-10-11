import 'dotenv/config';
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';

const app = express();
const PORT = process.env.PORT || 3000;

// Setup Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Setup Multer untuk menyimpan upload file sementara di memory buffer
const upload = multer({ storage: multer.memoryStorage() });

// Inisialisasi Google Gen AI Client
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
// Model kilat (< 1 detik) tanpa delay thinking
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL || "gemini-3.5-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.7-flash"
];

// Matikan thinking budget agar respon instan dan tidak 'berpikir' bermenit-menit
const FAST_CONFIG = {
  thinkingConfig: {
    thinkingBudget: 0
  }
};

async function generateContentSafe(contents) {
  let lastError;
  for (const model of CANDIDATE_MODELS) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: FAST_CONFIG,
      });
      return response;
    } catch (err) {
      console.warn(`Model ${model} mengalami kendala (${err.message}). Mencoba model cadangan...`);
      lastError = err;
    }
  }
  throw lastError;
}

async function generateContentStreamSafe(contents) {
  let lastError;
  for (const model of CANDIDATE_MODELS) {
    try {
      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: FAST_CONFIG,
      });
      return stream;
    } catch (err) {
      console.warn(`Model ${model} stream error: ${err.message}. Mencoba model cadangan...`);
      lastError = err;
    }
  }
  throw lastError;
}

// =========================================================================
// 1. Endpoint: Generate Text dari Prompt Teks
// =========================================================================
app.post('/generate-text', async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({ message: "Prompt teks harus diisi" });
    }

    const response = await generateContentSafe(prompt);

    res.status(200).json({ result: response.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// =========================================================================
// 2. Endpoint: Generate Teks dari Input Gambar
// =========================================================================
app.post('/generate-from-image', upload.single('image'), async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!req.file) {
      return res.status(400).json({ message: "File gambar wajib diunggah" });
    }

    const base64Image = req.file.buffer.toString('base64');

    const response = await generateContentSafe([
      { text: prompt || "Jelaskan gambar ini" },
      {
        inlineData: {
          data: base64Image,
          mimeType: req.file.mimetype,
        },
      },
    ]);

    res.status(200).json({ result: response.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// =========================================================================
// 3. Endpoint: Generate Teks dari Input Dokumen (PDF, TXT, dll)
// =========================================================================
app.post('/generate-from-document', upload.single('document'), async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "File dokumen wajib diunggah" });
    }

    const base64Document = req.file.buffer.toString('base64');

    const response = await generateContentSafe([
      { text: prompt || "Buatkan ringkasan dari dokumen ini" },
      {
        inlineData: {
          data: base64Document,
          mimeType: req.file.mimetype,
        },
      },
    ]);

    res.status(200).json({ result: response.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// =========================================================================
// 4. Endpoint: Generate Teks dari Input Audio (MP3, WAV, dll)
// =========================================================================
app.post('/generate-from-audio', upload.single('audio'), async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "File audio wajib diunggah" });
    }

    const base64Audio = req.file.buffer.toString('base64');

    const response = await generateContentSafe([
      { text: prompt || "Buatkan transkrip dan ringkasan dari audio ini" },
      {
        inlineData: {
          data: base64Audio,
          mimeType: req.file.mimetype,
        },
      },
    ]);

    res.status(200).json({ result: response.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// =========================================================================
// 5. Endpoint: Multi-turn Chat (Percakapan Bersambung)
// =========================================================================
app.post('/chat', async (req, res) => {
  try {
    const { history, message } = req.body;

    if (!message && (!history || history.length === 0)) {
      return res.status(400).json({ message: "Pesan atau histori chat harus diisi" });
    }

    const contents = [];
    if (Array.isArray(history)) {
      for (const item of history) {
        contents.push({
          role: item.role === 'model' ? 'model' : 'user',
          parts: [{ text: item.text || item.parts?.[0]?.text || '' }]
        });
      }
    }

    if (message) {
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });
    }

    const response = await generateContentSafe(contents);

    res.status(200).json({ result: response.text });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: error.message });
  }
});

// =========================================================================
// 6. Endpoint: Real-time Streaming Chat (Respons Instan Token-by-Token)
// =========================================================================
app.post('/chat-stream', async (req, res) => {
  try {
    const { history, message } = req.body;

    if (!message && (!history || history.length === 0)) {
      return res.status(400).json({ message: "Pesan atau histori chat harus diisi" });
    }

    const contents = [];
    if (Array.isArray(history)) {
      for (const item of history) {
        contents.push({
          role: item.role === 'model' ? 'model' : 'user',
          parts: [{ text: item.text || item.parts?.[0]?.text || '' }]
        });
      }
    }

    if (message) {
      contents.push({
        role: 'user',
        parts: [{ text: message }]
      });
    }

    // Set Server-Sent Events headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const stream = await generateContentStreamSafe(contents);

    for await (const chunk of stream) {
      const text = chunk.text;
      if (text) {
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error("Stream error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

// Jalankan Server Express
app.listen(PORT, () => {
  console.log(`Server Express berjalan di http://localhost:${PORT}`);
});