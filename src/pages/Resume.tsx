import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'
import { trackResumeView, trackResumeDownload } from '../utils/analytics'
import './Resume.css'

function Resume() {
  useEffect(() => {
    trackResumeView()
  }, [])

  const handleDownload = () => {
    trackResumeDownload('direct')
    const link = document.createElement('a')
    link.href = "/Christopher M Gagne Resume 2026.pdf"
    link.download = "Christopher M Gagne Resume 2026.pdf"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }
  
  return (
    <div className="resume-page">
      <Helmet>
        <title>Resume - Chris Gagne</title>
        <meta
          name="description"
          content="View Chris Gagne's professional resume. Director of Engineering with extensive experience in software development, team leadership, and technical innovation."
        />
        <meta property="og:title" content="Resume - Chris Gagne" />
        <meta
          property="og:description"
          content="View Chris Gagne's professional resume. Director of Engineering with extensive experience in software development, team leadership, and technical innovation."
        />
        <meta property="og:url" content="https://gagnechris.com/resume" />
        <link rel="canonical" href="https://gagnechris.com/resume" />
      </Helmet>
      <header>
        <div className="name-section">
          <h1>Chris Gagne</h1>
        </div>
        <div className="nav-section">
          <button 
            onClick={handleDownload}
            className="subtle-download"
            aria-label="Download resume as PDF"
          >
            <span className="download-icon" aria-hidden="true">↓</span>
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
            <p className="company">Ro | July 2019 - Present</p>
            <ul className="experience-list">
              <li>Dedicated to aligning engineering initiatives with business goals while leading a high performing team.</li>
              <li>Spearheaded the adoption and modernization of the software development lifecycle with Agentic AI.</li>
              <li>Instituted onboarding and incident management processes, enhancing team productivity and system reliability.</li>
              <li>Defined the technical vision for care delivery, ensuring alignment with Ro's rapid growth and scalability.</li>
            </ul>
          </div>
          
          <div className="experience-item">
            <h3>Director of Software Engineering</h3>
            <p className="company">JW Player | March 2017 - July 2019</p>
            <ul className="experience-list">
              <li>Led the transformation of the Media Engineering department, significantly enhancing our operational capabilities.</li>
              <li>Grew the engineering team and hired three engineering managers to support our expanding team.</li>
              <li>Established three specialized teams, each with dedicated leadership, to streamline media solutions.</li>
              <li>Drove key vendor relationships and cost optimization initiatives, ensuring efficient resource management.</li>
            </ul>
          </div>
          
          <div className="experience-item">
            <h3>Software Engineering Manager</h3>
            <p className="company">Shutterstock | September 2014 - March 2017</p>
            <ul className="experience-list">
              <li>Spearheaded transformative engineering initiatives at Shutterstock, enhancing our media systems and architecture.</li>
              <li>Led two teams through the modernization of media metadata and ingestion systems, ensuring robust performance.</li>
              <li>Oversaw the shift from monolithic to micro services architecture, significantly improving system reliability.</li>
              <li>Collaborated with a Montreal-based team to create a unified data model and new APIs for better integration.</li>
            </ul>
          </div>

          <div className="experience-item">
            <h3>Software Architect</h3>
            <p className="company">Viacom | September 2014 - April 2015</p>
            <ul className="experience-list">
              <li>Instrumental in architecting web solutions for Viacom's international brands, streamlining site-building processes.</li>
            </ul>
          </div>

          <div className="experience-item">
            <h3>Application Development Manager</h3>
            <p className="company">Getty Images | June 2012 - September 2014</p>
            <ul className="experience-list">
              <li>Played a pivotal role in leading the development of Getty Images' Digital Asset Management system, driving innovation through technology.</li>
              <li>Championed the use of Scala, Akka, and .NET/C# to build robust applications.</li>
              <li>Fostered a collaborative environment among developers to enhance project outcomes.</li>
              <li>Gained expertise in cloud technologies and application performance optimization.</li>
            </ul>
          </div>

          <div className="experience-item">
            <h3>Software Engineering Manager</h3>
            <p className="company">Dealertrack | August 2010 - June 2012</p>
            <ul className="experience-list">
              <li>Effectively managed a team dedicated to delivering robust software solutions for Dealertrack.</li>
              <li>Directed the development of 22 applications, leveraging open-source technologies to meet customer needs.</li>
              <li>Collaborated with cross-functional teams to prioritize and implement application changes, enhancing product offerings.</li>
              <li>Fostered a culture of quality assurance, ensuring that both software engineers and quality analysts worked seamlessly together.</li>
            </ul>
          </div>

          <div className="experience-item">
            <h3>Senior Software Engineer</h3>
            <p className="company">Dealertrack | December 2004 - August 2010</p>
            <ul className="experience-list">
              <li>Actively contributed to the development of critical applications and became a subject matter expert in key processes.</li>
              <li>Developed Java EE, VB 6.0 and C# applications to support diverse business needs.</li>
              <li>Specialized in the consolidated ACH process and the MD and VA Online Registration System (OLRS) applications.</li>
              <li>Enhanced application performance through the creation of various supporting web applications.</li>
            </ul>
          </div>

          <div className="experience-item">
            <h3>Software Engineer</h3>
            <p className="company">Psyche Systems Corporation | July 2000 - December 2004</p>
            <ul className="experience-list">
              <li>Developed, deployed and supported VB 6.0, VB.NET and SmallTalk Applications.</li>
            </ul>
          </div>

          <div className="experience-item">
            <h3>Software Engineer</h3>
            <p className="company">Daystar Corporation | January 1999 - April 2000</p>
            <ul className="experience-list">
              <li>Developed and maintained applications. Supported corporate IT infrastructure.</li>
            </ul>
          </div>
        </section>

        <section className="resume-section">
          <h2>Technical Skills</h2>
          <div className="competencies-container">
            <ul className="competencies-list">
              <li>Programming Languages: Python, NodeJS, React, Java, Scala, SQL</li>
              <li>Frameworks & Architecture: Microservices, Distributed Systems, RESTful APIs, Message-Driven Architectures</li>
              <li>Cloud & Infrastructure: AWS, CI/CD, Kubernetes, Docker, Infrastructure as Code (e.g. Terraform, CloudFormation)</li>
              <li>Databases: Postgres, MySQL, Cassandra, SQL Server, NoSQL Databases</li>
              <li>DevOps & Methodologies: Agile, Scrum, Kanban</li>
              <li>Data & Analytics: AI/ML, Data Modeling, Data Migration, ETL Pipelines</li>
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