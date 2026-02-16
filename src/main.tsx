import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import App from './App.tsx'
import Resume from './pages/Resume.tsx'
import BlogIndex from './pages/BlogIndex.tsx'
import BlogPost from './pages/BlogPost.tsx'
import Contact from './pages/Contact.tsx'
import AppWithTracking from './components/AppWithTracking.tsx'

// Configure Router with basename to handle GitHub Pages path prefix if needed
// and add a catch-all route for 404 handling
const router = createBrowserRouter([
  {
    path: '/',
    element: <AppWithTracking />,
    children: [
      {
        index: true,
        element: <App />
      },
      {
        path: 'resume',
        element: <Resume />
      },
      {
        path: 'blog',
        element: <BlogIndex />
      },
      {
        path: 'blog/:slug',
        element: <BlogPost />
      },
      {
        path: 'contact',
        element: <Contact />
      },
      {
        // Catch-all route - will redirect to home
        path: '*',
        element: <App />
      }
    ]
  }
], {
  // Handle GitHub Pages pathnames correctly
  basename: import.meta.env.BASE_URL || '/'
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HelmetProvider>
      <RouterProvider router={router} />
    </HelmetProvider>
  </StrictMode>,
)
