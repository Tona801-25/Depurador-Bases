# Depurador de Bases - Call Center Analytics

## Overview
Aplicación web para análisis y depuración de bases de datos de llamados telefónicos de Neotel. Permite subir archivos de tickets, analizar el comportamiento por ANI (número telefónico), clasificar contactos y exportar resultados.

## Architecture

### Frontend (React + TypeScript)
- **Framework**: React 18 con Vite
- **Routing**: wouter
- **State Management**: TanStack Query v5
- **UI Components**: Shadcn/UI + Radix UI
- **Charts**: Recharts
- **Styling**: Tailwind CSS con tema oscuro por defecto

### Backend (Express + Node.js)
- **Server**: Express.js con TypeScript
- **File Processing**: Multer para uploads, Papa Parse para CSV, XLSX para Excel
- **Storage**: In-memory storage (MemStorage)

### Shared
- **Schema**: Zod schemas para validación de datos
- **Types**: TypeScript interfaces compartidas entre frontend y backend

## Key Features

1. **Carga de Archivos**: Soporte para CSV, TXT, XLS, XLSX
2. **Análisis por ANI**: Agrupa llamados por número telefónico
3. **Clasificación Automática** (Tags):
   - CONTACTADO: Al menos 1 ANSWER-AGENT
   - INVALIDO: >= 3 intentos unallocated
   - SOLO_BUZON: >= 5 answering machine sin contacto
   - NO_ATIENDE: >= 6 no answer sin contacto
   - RECHAZA: >= 3 rejected sin contacto
   - SEGUIR_INTENTANDO: Resto de casos

4. **Dashboard Visual**: KPIs, gráficos de torta, barras
5. **Análisis por Turnos y Prefijos**: Distribución temporal y geográfica
6. **Filtros Avanzados**: Por estado, subestado, base, duración
7. **Simulador de Cortes**: Evaluar impacto de cambiar umbrales
8. **Exportación**: CSV, TXT, XLSX

## Project Structure

```
├── client/src/
│   ├── components/
│   │   ├── dashboard/      # Tab-specific components
│   │   └── ui/             # Shadcn components
│   ├── pages/
│   │   └── home.tsx        # Main page
│   ├── lib/
│   │   ├── queryClient.ts
│   │   ├── theme-provider.tsx
│   │   └── utils.ts
│   └── App.tsx
├── server/
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # Data processing & storage
│   └── index.ts
└── shared/
    └── schema.ts           # Zod schemas & TypeScript types
```

## API Endpoints

- `POST /api/upload` - Subir archivos para análisis
- `POST /api/export/resumen` - Exportar resumen por ANI
- `POST /api/export/filtrado` - Exportar base filtrada por tags
- `POST /api/export/records` - Exportar registros con filtros
- `GET /api/analyses` - Listar análisis realizados
- `GET /api/analysis/:id` - Obtener análisis específico

## Running the App

El workflow "Start application" ejecuta `npm run dev` que inicia:
- Backend Express en puerto 5000
- Frontend Vite con HMR

## Recent Changes

- 2024-12-12: Migración completa de Python/Streamlit a React/Express
- Implementación de todas las pestañas del dashboard original
- Soporte para tema claro/oscuro
- Exportación en múltiples formatos
