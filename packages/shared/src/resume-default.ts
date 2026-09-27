import type { Resume } from './schemas.js';

/**
 * Seed + fallback resume. Mirrors the pre-CMS `apps/web/src/pages/Resume.tsx`
 * copy so the public page never blanks before the first publish.
 */
export const DEFAULT_RESUME: Resume = {
  name: 'Chris Gagne',
  pdfPath: '/resume.pdf',
  status: 'draft',
  publishedAt: null,
  updatedAt: '2026-09-27T00:00:00.000Z',
  seo: null,
  version: 0,
  content: {
    summary:
      'Results-driven Director of Software Engineering with extensive experience scaling high-performing teams, driving technical vision, and delivering innovative software solutions in fast-paced environments. Proven track record in building engineering culture, partnering with stakeholders to define and execute product roadmaps, and implementing process improvements that enhance operational excellence and team productivity. Recognized for coaching and mentoring talent, fostering collaboration, and championing continuous improvement across the organization.',
    competencies: [
      'Strategic Roadmap Development',
      'Stakeholder Partnership',
      'Agile & Lean Methodologies',
      'Team & Culture Building',
      'Continuous Improvement & Operational Excellence',
      'Technical Vision & Innovation',
      'Diversity, Equity & Inclusion Advocacy',
    ],
    experience: [
      {
        title: 'Director of Software Engineering',
        company: 'Ro | July 2019 - Present',
        bullets: [
          'Dedicated to aligning engineering initiatives with business goals while leading a high performing team.',
          'Spearheaded the adoption and modernization of the software development lifecycle with Agentic AI.',
          'Instituted onboarding and incident management processes, enhancing team productivity and system reliability.',
          "Defined the technical vision for care delivery, ensuring alignment with Ro's rapid growth and scalability.",
        ],
      },
      {
        title: 'Director of Software Engineering',
        company: 'JW Player | March 2017 - July 2019',
        bullets: [
          'Led the transformation of the Media Engineering department, significantly enhancing our operational capabilities.',
          'Grew the engineering team and hired three engineering managers to support our expanding team.',
          'Established three specialized teams, each with dedicated leadership, to streamline media solutions.',
          'Drove key vendor relationships and cost optimization initiatives, ensuring efficient resource management.',
        ],
      },
      {
        title: 'Software Engineering Manager',
        company: 'Shutterstock | September 2014 - March 2017',
        bullets: [
          'Spearheaded transformative engineering initiatives at Shutterstock, enhancing our media systems and architecture.',
          'Led two teams through the modernization of media metadata and ingestion systems, ensuring robust performance.',
          'Oversaw the shift from monolithic to micro services architecture, significantly improving system reliability.',
          'Collaborated with a Montreal-based team to create a unified data model and new APIs for better integration.',
        ],
      },
      {
        title: 'Software Architect',
        company: 'Viacom | September 2014 - April 2015',
        bullets: [
          "Instrumental in architecting web solutions for Viacom's international brands, streamlining site-building processes.",
        ],
      },
      {
        title: 'Application Development Manager',
        company: 'Getty Images | June 2012 - September 2014',
        bullets: [
          "Played a pivotal role in leading the development of Getty Images' Digital Asset Management system, driving innovation through technology.",
          'Championed the use of Scala, Akka, and .NET/C# to build robust applications.',
          'Fostered a collaborative environment among developers to enhance project outcomes.',
          'Gained expertise in cloud technologies and application performance optimization.',
        ],
      },
      {
        title: 'Software Engineering Manager',
        company: 'Dealertrack | August 2010 - June 2012',
        bullets: [
          'Effectively managed a team dedicated to delivering robust software solutions for Dealertrack.',
          'Directed the development of 22 applications, leveraging open-source technologies to meet customer needs.',
          'Collaborated with cross-functional teams to prioritize and implement application changes, enhancing product offerings.',
          'Fostered a culture of quality assurance, ensuring that both software engineers and quality analysts worked seamlessly together.',
        ],
      },
      {
        title: 'Senior Software Engineer',
        company: 'Dealertrack | December 2004 - August 2010',
        bullets: [
          'Actively contributed to the development of critical applications and became a subject matter expert in key processes.',
          'Developed Java EE, VB 6.0 and C# applications to support diverse business needs.',
          'Specialized in the consolidated ACH process and the MD and VA Online Registration System (OLRS) applications.',
          'Enhanced application performance through the creation of various supporting web applications.',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Psyche Systems Corporation | July 2000 - December 2004',
        bullets: [
          'Developed, deployed and supported VB 6.0, VB.NET and SmallTalk Applications.',
        ],
      },
      {
        title: 'Software Engineer',
        company: 'Daystar Corporation | January 1999 - April 2000',
        bullets: [
          'Developed and maintained applications. Supported corporate IT infrastructure.',
        ],
      },
    ],
    skills: [
      'Programming Languages: Python, NodeJS, React, Java, Scala, SQL',
      'Frameworks & Architecture: Microservices, Distributed Systems, RESTful APIs, Message-Driven Architectures',
      'Cloud & Infrastructure: AWS, CI/CD, Kubernetes, Docker, Infrastructure as Code (e.g. Terraform, CloudFormation)',
      'Databases: Postgres, MySQL, Cassandra, SQL Server, NoSQL Databases',
      'DevOps & Methodologies: Agile, Scrum, Kanban',
      'Data & Analytics: AI/ML, Data Modeling, Data Migration, ETL Pipelines',
    ],
    education: [
      {
        title: 'MBA for Emerging Leaders',
        institution: 'University of New Haven',
        location: 'New London, CT',
        year: 'May 2008',
      },
      {
        title: "Bachelor's Degree in Business Management",
        institution: 'New England Institute of Technology',
        location: 'Warwick, RI',
        year: 'December 2006',
      },
      {
        title: "Associate's Degree",
        degreeDetail: 'Computer and Network Servicing Technology',
        institution: 'New England Institute of Technology',
        location: 'Warwick, RI',
        year: 'March 2000',
      },
    ],
  },
};
