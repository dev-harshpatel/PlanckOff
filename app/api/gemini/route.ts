import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';

// Initialize Gemini client with server-side API key
function getAIClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }
  return new GoogleGenerativeAI(key);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { base64Image, mimeType, materialContext } = body;

    if (!base64Image || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: base64Image and mimeType' },
        { status: 400 }
      );
    }

    const responseSchema = {
      type: SchemaType.OBJECT,
      properties: {
        assemblies: {
          type: SchemaType.ARRAY,
          items: {
            type: SchemaType.OBJECT,
            properties: {
              code: { type: SchemaType.STRING },
              description: { type: SchemaType.STRING },
              components: {
                type: SchemaType.ARRAY,
                items: {
                  type: SchemaType.OBJECT,
                  properties: {
                    material: { type: SchemaType.STRING },
                    category: { type: SchemaType.STRING },
                    details: { type: SchemaType.STRING }
                  },
                  required: ['material', 'category']
                }
              }
            },
            required: ['code', 'description', 'components']
          },
        },
      },
      required: ['assemblies'],
    };

    const prompt = `
    You are an expert construction estimator. Analyze this "Wall Type" schedule/drawing.
    Identify ALL distinct wall assemblies.
    Match components to:
    ${materialContext || 'Available materials from database'}

    Structure:
    For each assembly, extract the 'code' and 'description'.
    List EVERY material component visible.
    For category, use one of: Framing, Cladding, Insulation, Accessory
  `;

    const ai = getAIClient();
    const model = ai.getGenerativeModel({
      model: 'gemini-1.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: responseSchema,
      },
    });

    const result = await model.generateContent([
      {
        inlineData: {
          data: base64Image,
          mimeType: mimeType,
        },
      },
      prompt,
    ]);

    const response = result.response;
    const text = response.text();

    if (!text) {
      return NextResponse.json(
        { error: 'No response generated from Gemini' },
        { status: 500 }
      );
    }

    let jsonText = text.trim();
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.replace(/^```json\n/, '').replace(/\n```$/, '');
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```\n/, '').replace(/\n```$/, '');
    }

    const data = JSON.parse(jsonText);

    return NextResponse.json(data);
  } catch (error: any) {
    console.error('Gemini API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process image with Gemini' },
      { status: 500 }
    );
  }
}
