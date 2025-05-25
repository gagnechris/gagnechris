import { useState, FormEvent, useEffect } from 'react'
import { trackResumeDownload } from '../utils/analytics'
import './DownloadModal.css'

interface DownloadModalProps {
  onClose: () => void
  resumePath: string
  recipientEmail: string
}

export default function DownloadModal({ onClose, resumePath, recipientEmail }: DownloadModalProps) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  
  useEffect(() => {
    // Only log in dev mode
    if (process.env.NODE_ENV !== 'production') {
      console.log('🛈 Development Mode: The resume download form is functional, but email notifications are simulated.')
      console.log('📧 In production, emails will be sent to:', recipientEmail)
    }
  }, [recipientEmail])
  
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError('')
    
    try {
      // In development environment, just simulate the API call
      if (process.env.NODE_ENV !== 'production') {
        console.log('DEV MODE: Would send email notification with:', {
          name,
          email,
          reason,
          to: recipientEmail
        })
        
        // Simulate API call delay
        await new Promise(resolve => setTimeout(resolve, 1000))
      } 
      // In production, use the actual serverless function
      else {
        const response = await fetch('/.netlify/functions/resume-download', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name,
            email,
            reason,
            recipientEmail
          }),
        })
        
        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Failed to process request')
        }
      }
      
      // Trigger the download
      trackResumeDownload('modal')
      const link = document.createElement('a')
      link.href = resumePath
      link.download = resumePath.split('/').pop() || 'resume.pdf'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Close the modal
      onClose()
    } catch {
      setError('There was an error processing your request. Please try again.')
      setIsSubmitting(false)
    }
  }
  
  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="close-button" onClick={onClose}>×</button>
        <h2>Download Resume</h2>
        <p>Please provide your information to download the resume:</p>
        
        {error && <div className="error-message">{error}</div>}
        
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="name">Name</label>
            <input
              type="text"
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="reason">Reason for download</label>
            <textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="submit-button"
            disabled={isSubmitting}
          >
            {isSubmitting ? 'Processing...' : 'Download Resume'}
          </button>
        </form>
      </div>
    </div>
  )
}