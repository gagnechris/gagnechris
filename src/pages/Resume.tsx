import { Link } from 'react-router-dom'
import './Resume.css'

function Resume() {
  const handleDownload = () => {
    const link = document.createElement('a')
    link.href = "/Christopher M Gagne Resume 2025.pdf"
    link.download = "Christopher M Gagne Resume 2025.pdf"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
  return (
    <div className="resume-page">
      <header>
        <div className="name-section">
          <h1>Chris Gagne</h1>
        </div>
        <div className="nav-section">
          <button 
            onClick={handleDownload}
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
          Results-driven Director of Software Engineering with extensive experience scaling high-performing teams, driving technical vision, and delivering innovative software solutions in fast-paced environments. Proven track record in building engineering culture, partnering with stakeholders to define and execute product roadmaps, and implementing process improvements that enhance operational excellence and team productivity. Recognized for coaching and mentoring talent, fostering collaboration, and championing continuous improvement across the organization.
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
              <li>Scaled engineering organization from 2 to 8 teams.</li>
              <li>Currently leading a team of 6 engineers focused on Care Delivery Operations, ensuring operational excellence, improving efficiencies and quality while enabling scalable workflows to support Ro’s rapid growth and scale.</li>
              <li>Partnered cross-functionally with Product, Design, Data, and Infrastructure teams to deliver critical care delivery applications, improving patient and provider experiences.</li>
              <li>Instituted and continuously refined onboarding, incident management, and operational processes, resulting in measurable improvements in team productivity and system reliability.</li>
              <li>Defined and executed the technical vision for care delivery, aligning engineering initiatives with business goals.</li>
            </ul>
          </div>
          
          <div className="experience-item">
            <h3>Director of Software Engineering</h3>
            <p className="company">JW Player | 2017 - 2019</p>
            <ul className="experience-list">
              <li>Grew Media Engineering from 3 to 14 engineers, establishing vision and mission, and securing stakeholder buy-in.</li>
              <li>Structured the organization into three specialized teams, each with dedicated leadership, to optimize delivery of media ingestion, management, and delivery solutions.</li>
              <li>Managed key vendor relationships and drove cost optimization initiatives.</li>
            </ul>
          </div>
          
          <div className="experience-item">
            <h3>Software Engineering Manager</h3>
            <p className="company">Shutterstock | 2014 - 2017</p>
            <ul className="experience-list">
              <li>Led two cross-functional engineering teams through multiple large-scale migration projects, including modernizing the media metadata warehouse and media ingestion systems.</li>
              <li>Transitioned legacy monolithic systems to a distributed, message-driven microservices architecture, improving scalability and reliability.</li>
              <li>Optimized application performance and database queries</li>
              <li>Directed Montreal-based team in designing a unified data model for media metadata and building new APIs, enabling seamless integration across all business units and media types.</li>
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
    </div>
  )
}

export default Resume