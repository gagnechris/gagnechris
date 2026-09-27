# Chris Gagne Personal Website

A modern, responsive personal website and portfolio built with React, TypeScript, and Vite. Features a clean, professional design showcasing my experience as a Director of Software Engineering, with an interactive resume and downloadable PDF functionality.

## 🌟 Project Overview

This website serves as both a portfolio and resume platform, featuring:

- **Modern React Architecture**: Built with React 19, TypeScript, and React Router for client-side routing
- **Professional Resume Display**: Interactive web-based resume with downloadable PDF functionality
- **Responsive Design**: Mobile-first design with modern CSS animations and transitions
- **Performance Optimized**: Fast loading with Vite build tool and optimized assets
- **Analytics Integration**: Google Analytics 4 with comprehensive event tracking
- **Accessibility Compliant**: WCAG 2.1 AA compliant with ARIA labels, focus management, and keyboard navigation
- **Comprehensive Testing**: Vitest and React Testing Library with unit and integration coverage
- **Type Safety**: Full TypeScript implementation with strict mode enabled
- **Modern Development**: ESLint, hot reloading, and GitHub Actions CI

## 🚀 Getting Started

### Prerequisites

- **Node.js** 22.12+ (see `.nvmrc`)
- **npm** (comes with Node.js)

If you use nvm:

```bash
nvm install   # reads .nvmrc
nvm use
nvm alias default 22   # so new terminals pick Node 22 automatically
```

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/gagnechris/gagnechris.git
   cd gagnechris
   ```

2. **Use the project Node version**, then install dependencies
   ```bash
   nvm use
   npm install
   ```
   `.npmrc` sets `engine-strict=true`, so install fails clearly if Node is too old.
## 💻 Development

### Local Development Server
Start the development server with hot reloading:
```bash
npm run dev
```
The application will be available at `http://localhost:5173`

### Building for Production
Create an optimized production build:
```bash
npm run build
```
Build files will be generated in `apps/web/dist/`.

### Preview Production Build
Test the production build locally:
```bash
npm run preview
```
This serves the built files from `apps/web/dist/` at `http://localhost:4173`

## 🧪 Testing

### Run Tests
```bash
npm test                # Run tests once
npm run test:watch      # Run tests in watch mode (auto-rerun on changes)
npm run test:coverage   # Run tests with coverage report
```

### Code Quality
Check code style and formatting:
```bash
npm run lint            # Run ESLint
```

## 🚀 Deployment

### Production (AWS)
Merges to `main` deploy automatically via GitHub Actions (OIDC):

1. CDK deploy (infra)
2. Build `apps/web` → sync to the private Site S3 bucket → CloudFront invalidation

Manual web deploy (with AWS SSO admin/deploy credentials):

```bash
npm run deploy:web
```

**Live Site**: [https://gagnechris.com](https://gagnechris.com)

Infra details: `infra/RUNBOOK.md`.

### Continuous Integration
Every pull request to `main` runs lint, tests, build, and CDK synth. Dependabot opens weekly PRs for npm and GitHub Actions updates.

## 🛠️ Tech Stack

### Frontend
- **React 19** - Modern UI library with hooks and native document metadata
- **TypeScript 5.9** - Type-safe JavaScript with strict mode
- **React Router v7** - Client-side routing with analytics tracking
- **Vite 8** - Fast build tool and development server
- **Google Analytics 4** - Event tracking and user analytics
- **Amazon SES** - Contact form and resume-download notifications

### Styling
- **Modern CSS** - Custom properties, flexbox, grid
- **CSS Animations** - Smooth transitions and micro-interactions
- **Responsive Design** - Mobile-first approach

### Testing & Quality
- **Vitest** - Vite-native unit and integration testing
- **React Testing Library** - Component and integration testing
- **ESLint 10** - Code linting with TypeScript and React rules
- **TypeScript Compiler** - Static type checking with strict mode
- **Accessibility Testing** - Screen reader and keyboard navigation testing

### Deployment & Infrastructure
- **AWS** - Private S3 + CloudFront (`gagnechris.com`)
- **CDK** - Infrastructure as code in `infra/`

## 📁 Project Structure

npm workspaces. Commands like `npm run dev`, `npm run build`, `npm test`, and `npm run lint` run from the repo root and delegate to the web app.

```
├── apps/web/              # Public React/Vite site
│   ├── public/            # Static assets (resume PDF, icons, og image)
│   ├── src/               # Pages, components, posts, tests
│   ├── scripts/           # Site build helpers (sitemap generation)
│   ├── index.html
│   ├── vite.config.ts
│   └── package.json       # @gagnechris/web
├── infra/                 # AWS CDK app
├── services/api/          # Lambda handlers (later)
├── packages/shared/       # Types shared by the site, API, and publisher (later)
├── scripts/               # Repo tooling (branch protection, web deploy)
└── package.json           # Workspace root
```

## 🔧 Configuration

### Environment Variables
- **Development**: Automatically detected by Vite
- **Production**: Set `NODE_ENV=production` for optimized builds

### Analytics Configuration
The site uses Google Analytics 4 for tracking:
- **Page views**: Automatically tracked on route changes
- **Download events**: Resume download tracking
- **External link clicks**: LinkedIn and GitHub link tracking
- **Event categories**: `external_link`, `resume` for organized reporting

### Contact Form
The contact page posts to `POST /api/contact` (SES email to the site owner). Resume downloads also send an anonymous notify ping to `POST /api/resume/download`.

### Custom Domain
The site is served at `gagnechris.com` via Route 53 + CloudFront (see `infra/`).

## ♿ Accessibility Features

This website is built with accessibility in mind:
- **WCAG 2.1 AA Compliant**: Meets web accessibility standards
- **Keyboard Navigation**: Full site navigation without a mouse
- **Screen Reader Support**: Proper ARIA labels and semantic HTML
- **Focus Management**: Clear focus indicators and logical tab order
- **Descriptive Alt Text**: All images have meaningful descriptions

## 📊 Performance

- **Lighthouse Score**: 100/100 (Performance, Accessibility, Best Practices, SEO)
- **Bundle Size**: Optimized with tree shaking and code splitting
- **Load Time**: < 1 second on fast connections
- **Mobile Optimized**: Responsive design with touch-friendly interactions

## 🤝 Contributing

This is a personal portfolio project. If you find bugs or have suggestions:

1. Open an issue describing the problem or enhancement
2. Fork the repository and create a feature branch
3. Make your changes with appropriate tests
4. Submit a pull request with a clear description

## 📄 License

This project is personal portfolio code. Feel free to use it as inspiration for your own portfolio, but please don't copy the content directly.