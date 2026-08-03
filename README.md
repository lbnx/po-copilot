# PO Copilot

Aplicación web con Next.js + Tailwind + Groq (`llama-3.3-70b-versatile`) para briefings de producto, canvas interactivo y 14 documentos técnicos.

## Cómo empezar

1. Copia el archivo de entorno e ingresa tu API key:

```bash
cp .env.local.example .env.local
```

Edita `.env.local` y pega tu `GROQ_API_KEY` (https://console.groq.com/keys).

2. Instala dependencias y arranca:

```bash
npm install
npm run dev
```

3. Abre [http://localhost:3000](http://localhost:3000).

## Uso

1. Describe tu producto en el chat.
2. El agente hace 5 preguntas (Entrevista de Sombreros).
3. Escribe **generar canvas** para el tablero interactivo / wireframes.
4. Escribe **generar documentos** para los 14 artefactos.
5. Usa **Nuevo proyecto** para limpiar la sesión guardada.
