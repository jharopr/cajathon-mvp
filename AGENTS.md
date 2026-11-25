# ClimaShield AI: reglas del proyecto

Stack acordado: NestJS + TypeScript, React + Vite y PostgreSQL/PostGIS. Local en Docker, destino Supabase mediante variables de entorno. Gemini solo desde NestJS. No reintroducir una API Python ni SQLite.

Leer README.md y SOLUTION_CONCEPT.md antes de modificar el alcance. Mantener migraciones SQL versionadas en supabase/migrations; no editar una ya aplicada. El runner verifica checksum y usa transacciones. No usar sincronización automática ni reset destructivo.

Las habilidades del usuario están en .agents/skills. Aplicar gemini-api-dev al agente, frontend-design y ui-ux-pro-max a diseño, vercel-react-best-practices a React. Usar vercel-composition-patterns cuando haya una refactorización de composición. web-design-guidelines y security-best-practices se aplican cuando se soliciten sus revisiones específicas. No confundir estas habilidades con agentes IA del producto.

Datos exclusivamente sintéticos. Índice climático experimental, nunca probabilidad de mora. Saldo expuesto distinto de pérdida. Cálculos financieros con Decimal, persistencia NUMERIC. Ubicación ausente implica UNKNOWN; bordes incluidos con ST_Covers. Deduplique por negocio antes de sumar créditos.

Gemini usa herramientas validadas y acotadas; no SQL libre, URLs arbitrarias, aprobaciones ni contactos. No mostrar fallback como IA real. No registrar secretos. .env siempre excluido de Git; .env.example sin claves reales.

Antes de cerrar cambios: npm test, npm run build; con PostgreSQL disponible, npm run test:integration y npm run test:e2e. Reportar resultados reales y limitaciones en docs/validation-report.md. Registrar los componentes actuales como previos a la fase presencial y distinguir adaptaciones nuevas propuestas.

