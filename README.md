# Chris Gagne Personal Website

A modern, responsive personal website and portfolio built with React, TypeScript, and Vite. Features a clean, professional design showcasing my experience as a Director of Software Engineering, with an interactive resume and downloadable PDF functionality.

## 🌟 Project Overview

This website serves as both a portfolio and resume platform, featuring:

- **Modern React Architecture**: Built with React 18, TypeScript, and React Router for client-side routing
- **Professional Resume Display**: Interactive web-based resume with downloadable PDF functionality
- **Responsive Design**: Mobile-first design with modern CSS animations and transitions
- **Performance Optimized**: Fast loading with Vite build tool and optimized assets
- **Comprehensive Testing**: Jest and React Testing Library setup with 100% test coverage
- **Type Safety**: Full TypeScript implementation with strict mode enabled
- **Modern Development**: ESLint, hot reloading, and automated deployment pipeline

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v16 or higher recommended)
- **npm** (comes with Node.js)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/gagnechris/gagnechris.git
   cd gagnechris
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

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
Build files will be generated in the `dist/` directory.

### Preview Production Build
Test the production build locally:
```bash
npm run preview
```
This serves the built files from `dist/` at `http://localhost:4173`

## 🧪 Testing

### Run Tests
```bash
npm test                # Run tests once
npm run test:watch      # Run tests in watch mode (auto-rerun on changes)
npm run test:coverage   # Run tests with coverage report
npm run test:serverless # Run serverless function tests only
```

### Code Quality
Check code style and formatting:
```bash
npm run lint            # Run ESLint
```

## 🚀 Deployment

### Automated Deployment
Deploy to GitHub Pages with custom domain:
```bash
npm run deploy
```

This command:
1. Runs `npm run build` to create production assets
2. Deploys to GitHub Pages using `gh-pages`
3. Configures custom domain (`gagnechris.com`)
4. Updates the live site automatically

**Live Site**: [https://gagnechris.com](https://gagnechris.com)

### Manual Deployment Steps
If you prefer manual deployment:

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy the `dist/` folder** to your hosting provider of choice
   - The `dist/` folder contains all static assets
   - Configure your server to serve `index.html` for all routes (SPA routing)

## 🛠️ Tech Stack

### Frontend
- **React 18** - Modern UI library with hooks
- **TypeScript** - Type-safe JavaScript with strict mode
- **React Router v7** - Client-side routing
- **Vite** - Fast build tool and development server

### Styling
- **Modern CSS** - Custom properties, flexbox, grid
- **CSS Animations** - Smooth transitions and micro-interactions
- **Responsive Design** - Mobile-first approach

### Testing & Quality
- **Jest** - Testing framework
- **React Testing Library** - Component testing utilities
- **ESLint** - Code linting with TypeScript and React rules
- **TypeScript Compiler** - Static type checking

### Deployment & Infrastructure
- **GitHub Pages** - Static site hosting
- **GitHub Actions** - CI/CD (via npm scripts)
- **Netlify Functions** - Serverless backend (resume download notifications)
- **Custom Domain** - Professional branding

## 📁 Project Structure

```
├── public/                 # Static assets
│   ├── Christopher M Gagne Resume 2025.pdf
│   └── cg-icon.svg
├── src/
│   ├── components/         # Reusable React components
│   │   ├── DownloadModal.tsx
│   │   └── DownloadModal.test.tsx
│   ├── pages/             # Page components
│   │   ├── Resume.tsx
│   │   └── Resume.test.tsx
│   ├── assets/            # Images and media
│   ├── App.tsx            # Main application component
│   └── main.tsx           # Application entry point
├── netlify/
│   └── functions/         # Serverless functions
├── dist/                  # Production build output
├── package.json           # Dependencies and scripts
├── tsconfig.json          # TypeScript configuration
├── vite.config.ts         # Vite configuration
└── README.md              # This file
```

## 🔧 Configuration

### Environment Variables
- **Development**: Automatically detected by Vite
- **Production**: Set `NODE_ENV=production` for optimized builds

### Custom Domain
The site is configured to deploy to `gagnechris.com`. To use a different domain:
1. Update `homepage` in `package.json`
2. Modify the `--cname` flag in the deploy script

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