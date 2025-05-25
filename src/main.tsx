import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import Resume from './pages/Resume.tsx'
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
    <RouterProvider router={router} />
  </StrictMode>,
)
