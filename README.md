# PO Copilot

Aplicación web con Next.js + Tailwind + Google Gemini para briefings de producto y generación de 14 documentos técnicos.

## Cómo empezar

1. Copia el archivo de entorno e ingresa tu API key:

```bash
cp .env.local.example .env.local
```

Edita `.env.local` y pega tu `GEMINI_API_KEY` (https://aistudio.google.com/apikey).

2. Instala dependencias (si aún no lo hiciste) y arranca:

```bash
npm install
npm run dev
```

3. Abre [http://localhost:3000](http://localhost:3000).

## Uso

1. Describe tu producto en el chat (panel izquierdo).
2. El agente hace 5 preguntas (CPO + Compliance).
3. Si no sabes una respuesta, pide ayuda con benchmarks o normativas.
4. Cuando estés listo, escribe **generar documentos**.
5. Los 14 docs aparecen en la barra derecha; haz clic para leerlos o copiarlos.
