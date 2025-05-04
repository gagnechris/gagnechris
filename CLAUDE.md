# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands
- Build: `npm run build` (runs TypeScript build and Vite)
- Lint: `npm run lint` (runs ESLint)
- Dev: `npm run dev` (starts Vite development server)
- Preview: `npm run preview` (previews production build locally)
- Deploy: `npm run deploy` (deploys to GitHub Pages)

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