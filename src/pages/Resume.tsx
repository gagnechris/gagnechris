import { useState } from 'react'
import { Link } from 'react-router-dom'
import './Resume.css'
import DownloadModal from '../components/DownloadModal'

function Resume() {
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  return (
    <div className="resume-page">
      <header>
        <div className="name-section">
          <h1>Chris Gagne</h1>
        </div>
        <div className="nav-section">
          <button 
            onClick={() => setShowDownloadModal(true)}
            className="subtle-download"
            title="Download Resume as PDF"
          >
            <span className="download-icon">↓</span>
            <span className="download-text">Resume</span>
          </button>
          <Link to="/" className="back-link">Back to Home</Link>
        </div>
      </header>
      
      <main>
        <section className="resume-summary">
          <h2>Summary</h2>
          <p>
            Director of Engineering with over 20 years of experience in software engineering, 
            building modern web technologies to solve critical business problems. Passionate 
            about using technology to improve the lives of everyday people, with expertise 
            in team leadership, system architecture, and technical strategy.
          </p>
        </section>
        
        <section className="resume-section">
          <h2>Core Competencies</h2>
          <div className="competencies-container">
            <ul className="competencies-list">
              <li>Strategic Roadmap Development</li>
              <li>Stakeholder Partnership</li>
              <li>Agile & Lean Methodologies</li>
              <li>Team & Culture Building</li>
            </ul>
            <ul className="competencies-list">
              <li>Continuous Improvement & Operational Excellence</li>
              <li>Technical Vision & Innovation</li>
              <li>Diversity, Equity & Inclusion Advocacy</li>
            </ul>
          </div>
        </section>
        
        <section className="resume-section">
          <h2>Professional Experience</h2>
          
          <div className="experience-item">
            <h3>Director of Software Engineering</h3>
            <p className="company">Ro | 2019 - Present</p>
            <ul className="experience-list">
              <li>Lead engineering teams responsible for building innovative healthcare solutions</li>
              <li>Oversee development of platforms connecting patients with healthcare providers</li>
              <li>Drive technical strategy and architecture decisions</li>
              <li>Mentor and develop engineering talent across the organization</li>
              <li>Collaborate with cross-functional teams to deliver high-quality healthcare products</li>
            </ul>
          </div>
          
          <div className="experience-item">
            <h3>Director of Software Engineering</h3>
            <p className="company">JW Player | 2017 - 2019</p>
            <ul className="experience-list">
              <li>Managed teams of software engineers developing web and mobile applications</li>
              <li>Implemented agile methodologies resulting in 30% improved delivery timelines</li>
              <li>Architected scalable solutions handling millions of user requests</li>
              <li>Led migration to microservices architecture improving system reliability</li>
            </ul>
          </div>
          
          <div className="experience-item">
            <h3>Software Engineering Manager</h3>
            <p className="company">Shutterstock | 2014 - 2017</p>
            <ul className="experience-list">
              <li>Led development of core product features and improvements</li>
              <li>Designed and implemented RESTful APIs powering mobile and web clients</li>
              <li>Optimized application performance and database queries</li>
              <li>Mentored junior engineers and conducted code reviews</li>
            </ul>
          </div>
        </section>
        
        <section className="resume-section">
          <h2>Education</h2>
          <div className="education-item">
            <h3>MBA for Emerging Leaders</h3>
            <p className="institution">University of New Haven</p>
            <p className="location">New London, CT</p>
            <p className="year">May 2008</p>
          </div>
          <div className="education-item">
            <h3>Bachelor's Degree in Business Management</h3>
            <p className="institution">New England Institute of Technology</p>
            <p className="location">Warwick, RI</p>
            <p className="year">December 2006</p>
          </div>
          <div className="education-item">
            <h3>Associate's Degree</h3>
            <p className="degree-detail">Computer and Network Servicing Technology</p>
            <p className="institution">New England Institute of Technology</p>
            <p className="location">Warwick, RI</p>
            <p className="year">March 2000</p>
          </div>
        </section>
      </main>
      
      {showDownloadModal && (
        <DownloadModal 
          onClose={() => setShowDownloadModal(false)}
          resumePath="/Christopher M Gagne Resume 2025.pdf"
          recipientEmail="gagnechris@me.com"
        />
      )}
    </div>
  )
}

export default Resume