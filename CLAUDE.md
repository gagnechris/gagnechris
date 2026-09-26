# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- Build: `npm run build` (runs `tsc -b` then Vite; generates `sitemap.xml` from published posts)
- Typecheck: `npm run typecheck` (runs `tsc -b` only)
- Lint: `npm run lint` (runs ESLint)
- Dev: `npm run dev` (starts Vite development server)
- Preview: `npm run preview` (previews production build locally)
- Test: `npm test` (runs Vitest)
- Deploy: `npm run deploy` (deploys to GitHub Pages via `gh-pages`)
- CI: GitHub Actions runs lint, test, and build (including typecheck) on pushes and PRs to `main`

## Hosting & Integrations
- **Hosting**: GitHub Pages with custom domain `gagnechris.com`
- **Contact form**: Formspree
- **Analytics**: Google Analytics 4
- **Node**: requires Node.js 22.12+ (see `.nvmrc`)

## Code Style Guidelines
- **TypeScript**: Strict mode enabled with comprehensive type checking
- **Formatting**: Follow ESLint recommended rules for TypeScript and React
- **Imports**: Group imports by dependency type, use named imports
- **Component Structure**: Functional components with React hooks
- **Naming**: Use camelCase for variables/functions, PascalCase for components
- **React Best Practices**: 
  - Follow React hooks rules (enforced by eslint-plugin-react-hooks)
  - Use arrow functions for new components
  - Only export components from files (enforced by react-refresh)
- **Error Handling**: Use TypeScript's strict checking to catch errors at compile time